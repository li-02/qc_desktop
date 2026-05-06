# pyright: reportImplicitRelativeImport=false, reportMissingTypeStubs=false, reportDeprecated=false, reportAny=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnusedCallResult=false, reportOperatorIssue=false, reportCallIssue=false

"""
BEON 非通量数据 QC + REddyProc MDS gap filling 流程

处理对象:
1. sapflow
2. aqi
3. nai
"""

import argparse
import json
import os
import sys
import traceback
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd

from reddyproc_flux_pipeline import (
    _suppress_r_console_noise,
    check_r_environment,
    regularize_half_hourly,
    setup_embedded_r_environment,
)

setup_embedded_r_environment()

import rpy2.robjects as ro
from rpy2.robjects import pandas2ri
from rpy2.robjects.conversion import localconverter


AQI_COLUMN_MAP = {
    "a21026": "so2",
    "a21003": "no",
    "a21002": "nox",
    "a21004": "no2",
    "a21005": "co",
    "a05024": "o3",
    "a34002": "cpm_10",
    "a34004": "cpm_2_5",
}

STANDARD_DRIVING_CANDIDATES = {
    "rH": ["rh_threshold_limit", "rh", "rH_threshold_limit", "rH"],
    "Rg": ["rg_1_1_2_threshold_limit", "rg_1_1_2", "Rg_threshold_limit", "Rg"],
    "Tair": ["ta_1_2_1_threshold_limit", "ta_1_2_1", "Tair_threshold_limit", "Tair"],
    "VPD": ["vpd_threshold_limit", "vpd", "VPD_threshold_limit", "VPD"],
}

EXCLUDED_GAPFILL_BASES = {
    "rh",
    "rH",
    "rg_1_1_2",
    "Rg",
    "ta_1_2_1",
    "Tair",
    "vpd",
    "VPD",
}


def normalize_missing(df: pd.DataFrame) -> pd.DataFrame:
    return df.replace(["NaN", "nan", ""], np.nan)


def detect_time_column(df: pd.DataFrame, preferred: str = "record_time") -> str:
    """Auto-detect the time column name in a DataFrame.

    Checks ``preferred`` first, then falls back to common alternatives.
    """
    candidates = [preferred, "DateTime", "datetime", "TIMESTAMP", "timestamp", "time"]
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    raise ValueError(f"缺少时间列: 尝试了 {', '.join(candidates)}，均不存在")


def ensure_time_column(df: pd.DataFrame, time_col: str = "record_time") -> None:
    if time_col not in df.columns:
        raise ValueError(f"缺少时间列: {time_col}")


def load_threshold_map(thresholds_json: str) -> Dict[str, Dict[str, float]]:
    if not thresholds_json:
        return {}

    try:
        raw = json.loads(thresholds_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"thresholds_json 解析失败: {exc}") from exc

    threshold_map: Dict[str, Dict[str, float]] = {}
    for column_name, config in raw.items():
        if not isinstance(config, dict):
            continue

        entry: Dict[str, float] = {}
        lower = config.get("lower")
        upper = config.get("upper")
        if lower is not None:
            entry["lower"] = float(lower)
        if upper is not None:
            entry["upper"] = float(upper)
        threshold_map[str(column_name)] = entry
    return threshold_map


def load_csv(csv_path: str, label: str) -> pd.DataFrame:
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"{label}文件不存在: {csv_path}")
    return normalize_missing(pd.read_csv(csv_path))


def convert_non_time_columns_to_numeric(df: pd.DataFrame, time_col: str = "record_time") -> pd.DataFrame:
    result = df.copy()
    for column in result.columns:
        if column == time_col:
            continue
        result[column] = pd.to_numeric(result[column], errors="coerce")
    return result


def rename_aqi_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {column: AQI_COLUMN_MAP[column] for column in df.columns if column in AQI_COLUMN_MAP}
    return df.rename(columns=rename_map)


def apply_threshold_limit(
    df: pd.DataFrame,
    threshold_map: Dict[str, Dict[str, float]],
    time_col: str = "record_time",
) -> pd.DataFrame:
    result = convert_non_time_columns_to_numeric(df, time_col=time_col)

    data_columns = [c for c in result.columns if c != time_col and not c.endswith("_threshold_limit") and not c.endswith("_threshold_limit_std")]
    print(f"    应用阈值上限: {len(data_columns)} 个数据列")
    for column in data_columns:

        threshold_column = column + "_threshold_limit"
        values = pd.to_numeric(result[column], errors="coerce")
        result[threshold_column] = values

        bounds = threshold_map.get(column, {})
        lower = bounds.get("lower")
        upper = bounds.get("upper")
        mask = pd.Series(False, index=result.index)
        if lower is not None:
            mask |= values < lower
        if upper is not None:
            mask |= values > upper
        result.loc[mask, threshold_column] = np.nan

    return result


def standard_deviation_limit(data: pd.DataFrame, window: int = 480, step: int = 96) -> pd.DataFrame:
    if "record_time" not in data.columns:
        raise ValueError("sapflow 数据缺少 record_time 列")

    result = data.copy()
    sapflow_data = pd.DataFrame({"record_time": result["record_time"]})

    threshold_columns = [column for column in result.columns if column.endswith("_threshold_limit")]
    for column in threshold_columns:
        sapflow_data[column + "_std"] = pd.to_numeric(result[column], errors="coerce")

    numeric_columns = [column for column in sapflow_data.columns if column != "record_time"]
    n_cols = len(numeric_columns)
    if n_cols == 0:
        return result

    # 转为 numpy 数组，避免 pandas .loc 碎片化导致性能崩塌
    n_rows = len(sapflow_data)
    sapflow_array = sapflow_data[numeric_columns].to_numpy(dtype=np.float64)
    outlier_mask = np.zeros((n_rows, n_cols), dtype=bool)

    total_windows = max(1, (n_rows - window) // step + 1)
    last_report = -1
    idx = 0
    while idx < n_rows:
        win_end = idx + window
        if win_end > n_rows:
            break

        current_pct = (idx // step) * 100 // total_windows
        if current_pct >= last_report + 10:
            print(f"    标准差滑动窗口: {idx}/{n_rows} ({current_pct}%)")
            last_report = current_pct - (current_pct % 10)

        win_data = sapflow_array[idx:win_end, :]
        col_mean = np.nanmean(win_data, axis=0)
        col_std = np.nanstd(win_data, axis=0)
        lower = col_mean - 5.0 * col_std
        upper = col_mean + 5.0 * col_std
        # 每列独立比较，避免广播形状问题
        win_mask = (win_data < lower) | (win_data > upper)
        outlier_mask[idx:win_end, :] |= win_mask
        idx += step

    print(f"    标准差滑动窗口完成, 异常值 {outlier_mask.sum()} 个, 正在回写数据...")

    sapflow_array[outlier_mask] = np.nan
    sapflow_data[numeric_columns] = sapflow_array

    # 合并前检查重复时间戳（重复会导致 merge 笛卡尔积膨胀）
    dup_in_result = result["record_time"].duplicated().sum()
    dup_in_sapflow = sapflow_data["record_time"].duplicated().sum()
    if dup_in_result > 0 or dup_in_sapflow > 0:
        print(f"    检测到重复 record_time: result={dup_in_result}, sapflow={dup_in_sapflow}, 正在去重...")
        result = result.drop_duplicates(subset=["record_time"], keep="first")
        sapflow_data = sapflow_data.drop_duplicates(subset=["record_time"], keep="first")

    print(f"    正在合并主数据与标准差筛选结果 (result={len(result)}行, sapflow={len(sapflow_data)}行)...")
    result = pd.merge(result, sapflow_data, how="outer", on="record_time")
    print(f"    合并完成: {len(result)} 行, {len(result.columns)} 列")

    # .copy() 强制整理内存碎片，避免后续 sort/filter 性能崩塌
    result = result.copy()
    print("    正在过滤半数点...")
    result["record_time"] = pd.to_datetime(result["record_time"], format="ISO8601", errors="coerce")
    result = result[~result["record_time"].dt.minute.isin([15, 45])]
    print(f"    过滤完成: {len(result)} 行, 正在排序...", flush=True)

    result = result.sort_values("record_time").reset_index(drop=True)
    print(f"    标准差筛选数据整理完成: {len(result)} 行, 正在释放临时数组...", flush=True)
    del sapflow_data, sapflow_array, outlier_mask
    print(f"    标准差筛选完成: {len(result)} 行", flush=True)

    return result


def interpolate_aqi_half_points(data: pd.DataFrame) -> pd.DataFrame:
    result = data.copy()
    result["record_time"] = pd.to_datetime(result["record_time"], format="ISO8601", errors="coerce")
    result = result.sort_values("record_time")
    result = result.set_index("record_time")
    result = result.resample("30min").mean()

    for index in range(1, len(result) - 1):
        if result.index[index].minute == 30:
            result.iloc[index] = (result.iloc[index - 1] + result.iloc[index + 1]) / 2

    result = result.reset_index()
    return result


def preprocess_nonflux_data(
    df: pd.DataFrame,
    *,
    data_type: str,
    threshold_map: Dict[str, Dict[str, float]],
    sapflow_std_window: int,
    sapflow_std_step: int,
) -> pd.DataFrame:
    result = df.copy()
    ensure_time_column(result)

    if data_type == "aqi":
        result = rename_aqi_columns(result)

    print(f"  阈值筛选: {len(result.columns)} 列, {len(result)} 行, 正在应用阈值上下限...")
    result = apply_threshold_limit(result, threshold_map, time_col="record_time")

    if data_type == "sapflow":
        threshold_cols = sum(1 for c in result.columns if c.endswith("_threshold_limit"))
        print(f"  标准差筛选: {threshold_cols} 个阈值列, 窗口={sapflow_std_window}, 步长={sapflow_std_step}...", flush=True)
        result = standard_deviation_limit(result, window=sapflow_std_window, step=sapflow_std_step)
        print(f"  标准差筛选函数已返回: {len(result)} 行", flush=True)
    elif data_type == "aqi":
        result = interpolate_aqi_half_points(result)

    return result


def get_first_existing_column(df: pd.DataFrame, candidates: Sequence[str], label: str, required: bool = True) -> Optional[str]:
    for column in candidates:
        if column in df.columns:
            return column
    if required:
        raise ValueError(f"flux-file 缺少驱动列 {label}，候选列: {', '.join(candidates)}")
    return None


def prepare_driving_dataframe(flux_df: pd.DataFrame) -> pd.DataFrame:
    result = flux_df.copy()
    # Auto-detect time column: raw MySQL CSV has record_time, processed flux output has DateTime
    time_col = detect_time_column(result, preferred="record_time")
    if time_col != "record_time":
        result = result.rename(columns={time_col: "record_time"})
    result["record_time"] = pd.to_datetime(result["record_time"], format="ISO8601", errors="coerce")
    result = result.sort_values("record_time").reset_index(drop=True)

    rh_col = get_first_existing_column(result, STANDARD_DRIVING_CANDIDATES["rH"], "rH")
    rg_col = get_first_existing_column(result, STANDARD_DRIVING_CANDIDATES["Rg"], "Rg")
    tair_col = get_first_existing_column(result, STANDARD_DRIVING_CANDIDATES["Tair"], "Tair")
    vpd_col = get_first_existing_column(result, STANDARD_DRIVING_CANDIDATES["VPD"], "VPD", required=False)

    driving_df = pd.DataFrame()
    driving_df["record_time"] = result["record_time"]
    driving_df["rH"] = pd.to_numeric(result[rh_col], errors="coerce")
    driving_df["Rg"] = pd.to_numeric(result[rg_col], errors="coerce")
    driving_df["Tair"] = pd.to_numeric(result[tair_col], errors="coerce")
    if vpd_col:
        driving_df["VPD"] = pd.to_numeric(result[vpd_col], errors="coerce") * 0.01
    else:
        driving_df["VPD"] = np.nan

    return driving_df


def strip_indicator_suffix(column_name: str) -> str:
    for suffix in ["_threshold_limit_std", "_threshold_limit"]:
        if column_name.endswith(suffix):
            return column_name[: -len(suffix)]
    return column_name


def resolve_indicator_name(column_name: str, available_columns: Sequence[str], data_type: str) -> Optional[str]:
    candidates = [column_name]
    if data_type == "sapflow":
        candidates.extend([
            column_name + "_threshold_limit",
            column_name + "_threshold_limit_std",
        ])
    else:
        candidates.append(column_name + "_threshold_limit")

    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate in available_columns:
            return candidate
    return None


def detect_gapfill_indicators(df: pd.DataFrame, data_type: str) -> List[str]:
    indicators: List[str] = []
    for column in df.columns:
        matched = column.endswith("_threshold_limit")

        if not matched:
            continue

        base_name = strip_indicator_suffix(column)
        if base_name in EXCLUDED_GAPFILL_BASES:
            continue
        indicators.append(column)

    indicators.sort()
    return indicators


def get_gapfill_indicators(df: pd.DataFrame, data_type: str, configured: str) -> List[str]:
    if configured:
        parsed = [item.strip() for item in configured.split(",") if item.strip()]
        resolved: List[str] = []
        for item in parsed:
            column_name = resolve_indicator_name(item, list(df.columns), data_type)
            if not column_name:
                raise ValueError(f"未找到待 gapfill 指标列: {item}")
            if column_name not in resolved:
                resolved.append(column_name)
        return resolved

    indicators = detect_gapfill_indicators(df, data_type)
    if not indicators:
        raise ValueError("未检测到可执行 gap filling 的指标列")
    return indicators


def print_gapfill_indicator_summary(indicators: Sequence[str]) -> None:
    preview_count = min(8, len(indicators))
    preview = ", ".join(indicators[:preview_count])
    suffix = "" if len(indicators) <= preview_count else f", ... (+{len(indicators) - preview_count})"
    print(f"    Gap Filling 待处理指标: {len(indicators)} 个: {preview}{suffix}", flush=True)


def prepare_gapfill_dataframe(
    main_df: pd.DataFrame,
    flux_df: pd.DataFrame,
) -> pd.DataFrame:
    result = main_df.copy()
    result["record_time"] = pd.to_datetime(result["record_time"], format="ISO8601", errors="coerce")
    result = result.sort_values("record_time").reset_index(drop=True)

    driving_df = prepare_driving_dataframe(flux_df)
    print("    合并驱动变量...", flush=True)
    result = result.merge(driving_df, how="left", on="record_time")
    result = result.copy()
    result = result.rename(columns={"record_time": "DateTime"})
    result["DateTime"] = pd.to_datetime(result["DateTime"], format="ISO8601", errors="coerce").dt.tz_localize(None)

    # 批量转换，避免逐列 pd.to_numeric 重复触发内部块整理
    non_dt_cols = [c for c in result.columns if c != "DateTime"]
    print(f"    转换数值类型: {len(non_dt_cols)} 列...", flush=True)
    result[non_dt_cols] = result[non_dt_cols].apply(pd.to_numeric, errors="coerce")

    print("    正则化半小时时间序列...", flush=True)
    result = regularize_half_hourly(result, "DateTime")
    return result


def build_nonflux_r_helper() -> object:
    _suppress_r_console_noise()
    ro.r(
        """
        suppressMessages(library(REddyProc))

        run_nonflux_gapfill <- function(file_name, longitude, latitude, timezone, flux_data, indicators) {
          indicator_count <- length(indicators)
          cat(sprintf("    Gap Filling indicators: %d, data: %d rows x %d columns\\n", indicator_count, nrow(flux_data), ncol(flux_data)))
          flush.console()
          flux_data$VPD <- fCalcVPDfromRHandTair(rH = flux_data$rH, Tair = flux_data$Tair)
          datanames <- colnames(flux_data)
          EddyProc.C <- sEddyProc$new(ID = file_name, Data = flux_data, ColNames = datanames[-1])
          EddyProc.C$sSetLocationInfo(LatDeg = latitude, LongDeg = longitude, TimeZoneHour = timezone)
          for (idx in seq_along(indicators)) {
            i <- indicators[[idx]]
            started_at <- Sys.time()
            cat(sprintf("    Gap Filling [%d/%d] start: %s\\n", idx, indicator_count, i))
            flush.console()
            EddyProc.C$sMDSGapFill(i, FillAll = TRUE)
            elapsed <- as.numeric(difftime(Sys.time(), started_at, units = "secs"))
            cat(sprintf("    Gap Filling [%d/%d] done: %s, elapsed %.1fs\\n", idx, indicator_count, i, elapsed))
            flush.console()
          }
          cat("    Gap Filling exporting R results...\\n")
          flush.console()
          FilledEddyData.F <- EddyProc.C$sExportResults()
          CombinedData.F <- cbind(flux_data, FilledEddyData.F)
          cat(sprintf("    Gap Filling R export done: %d rows x %d columns\\n", nrow(CombinedData.F), ncol(CombinedData.F)))
          flush.console()
          return(CombinedData.F)
        }
        """
    )
    return ro.globalenv["run_nonflux_gapfill"]


def run_nonflux_gapfill_r(
    run_nonflux_gapfill_func: object,
    working_df: pd.DataFrame,
    *,
    file_name: str,
    lat_deg: float,
    long_deg: float,
    timezone_hour: int,
    indicators: Sequence[str],
) -> pd.DataFrame:
    print(f"    正在转换数据给 R: {len(working_df)} 行, {len(working_df.columns)} 列...", flush=True)
    with localconverter(ro.default_converter + pandas2ri.converter):
        data_r = ro.conversion.py2rpy(working_df)

    print("    R 数据转换完成, 正在执行 REddyProc MDS Gap Filling...", flush=True)
    result_data = run_nonflux_gapfill_func(
        file_name,
        float(long_deg),
        float(lat_deg),
        int(timezone_hour),
        data_r,
        ro.StrVector(list(indicators)),
    )

    print("    R Gap Filling 返回, 正在转换结果为 Python DataFrame...", flush=True)
    with localconverter(ro.default_converter + pandas2ri.converter):
        result_df = ro.conversion.rpy2py(result_data)

    if "DateTime" in result_df.columns:
        result_df["DateTime"] = pd.to_datetime(result_df["DateTime"], format="ISO8601", errors="coerce").dt.tz_localize(None)
    print(f"    R 结果转换完成: {len(result_df)} 行, {len(result_df.columns)} 列", flush=True)
    return result_df


def finalize_output(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    if "DateTime" in result.columns:
        result = result.rename(columns={"DateTime": "record_time"})
        result["record_time"] = pd.to_datetime(result["record_time"], format="ISO8601", errors="coerce").dt.tz_localize(None)

    result = result.drop(columns=["rH", "Rg", "Tair", "VPD"], errors="ignore")
    return result


def build_success_result(
    df: pd.DataFrame,
    *,
    data_type: str,
    gapfilled_indicators: Sequence[str],
) -> Dict[str, object]:
    return {
        "success": True,
        "rows": int(len(df)),
        "columns": list(df.columns),
        "data_type": data_type,
        "gapfilled_indicators": list(gapfilled_indicators),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BEON 非通量数据 QC + REddyProc gap filling 流程")
    parser.add_argument("--file", required=True, help="输入 CSV 文件")
    parser.add_argument("--output", required=True, help="输出 CSV 文件")
    parser.add_argument("--flux-file", required=True, help="驱动变量 flux CSV 文件")
    parser.add_argument("--data-type", required=True, choices=["sapflow", "aqi", "nai"], help="数据类型")
    parser.add_argument("--lat", type=float, required=True, help="站点纬度")
    parser.add_argument("--long", type=float, required=True, help="站点经度")
    parser.add_argument("--tz", type=int, required=True, help="时区")
    parser.add_argument("--site-code", default="", help="站点代码")
    parser.add_argument("--thresholds-json", default="", help="阈值 JSON")
    parser.add_argument("--gapfill-indicators", default="", help="待 gapfill 指标，逗号分隔")
    parser.add_argument("--sapflow-std-window", type=int, default=480, help="sapflow 标准差窗口")
    parser.add_argument("--sapflow-std-step", type=int, default=96, help="sapflow 标准差步长")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    try:
        print("[1/4] 加载数据...", flush=True)
        r_ok, r_error = check_r_environment()
        if not r_ok:
            raise RuntimeError(r_error or "R 环境检查失败")

        main_df = load_csv(args.file, "输入")
        flux_df = load_csv(args.flux_file, "flux")
        threshold_map = load_threshold_map(args.thresholds_json)

        print("[2/4] 阈值筛选...", flush=True)
        filtered_df = preprocess_nonflux_data(
            main_df,
            data_type=args.data_type,
            threshold_map=threshold_map,
            sapflow_std_window=args.sapflow_std_window,
            sapflow_std_step=args.sapflow_std_step,
        )

        print(f"[2/4] 阈值筛选阶段已返回: {len(filtered_df)} 行 x {len(filtered_df.columns)} 列", flush=True)
        print("[3/4] Gap Filling...", flush=True)
        working_df = prepare_gapfill_dataframe(filtered_df, flux_df)
        print(f"    Gap Filling 输入准备完成: {len(working_df)} 行 x {len(working_df.columns)} 列", flush=True)
        gapfill_indicators = get_gapfill_indicators(working_df, args.data_type, args.gapfill_indicators)
        print_gapfill_indicator_summary(gapfill_indicators)
        run_nonflux_gapfill_func = build_nonflux_r_helper()
        result_df = run_nonflux_gapfill_r(
            run_nonflux_gapfill_func,
            working_df,
            file_name=os.path.basename(args.file),
            lat_deg=args.lat,
            long_deg=args.long,
            timezone_hour=args.tz,
            indicators=gapfill_indicators,
        )

        print("[4/4] 保存结果...")
        output_df = finalize_output(result_df)
        output_df.to_csv(args.output, index=False)

        print(
            "__RESULT_JSON__:"
            + json.dumps(
                build_success_result(
                    output_df,
                    data_type=args.data_type,
                    gapfilled_indicators=gapfill_indicators,
                ),
                ensure_ascii=False,
            )
        )
    except Exception as exc:
        traceback.print_exc()
        # Also output to stdout so TS relay forwards it to UI logs
        print(traceback.format_exc())
        print(
            "__RESULT_JSON__:"
            + json.dumps(
                {
                    "success": False,
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
