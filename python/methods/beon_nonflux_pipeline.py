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

    for column in list(result.columns):
        if column == time_col or column.endswith("_threshold_limit") or column.endswith("_threshold_limit_std"):
            continue

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

    index = 0
    numeric_columns = [column for column in sapflow_data.columns if column != "record_time"]
    while index < len(sapflow_data):
        if index + window - 1 >= len(sapflow_data):
            break

        window_slice = sapflow_data.iloc[index : index + window].copy()
        mean = window_slice[numeric_columns].mean(numeric_only=True)
        std = window_slice[numeric_columns].std(numeric_only=True)
        lower = mean - 5 * std
        upper = mean + 5 * std
        mask = window_slice[numeric_columns].lt(lower, axis=1) | window_slice[numeric_columns].gt(upper, axis=1)
        sapflow_data.loc[window_slice.index, numeric_columns] = sapflow_data.loc[window_slice.index, numeric_columns].mask(mask)
        index += step

    result = pd.merge(result, sapflow_data, how="outer", on="record_time")
    result["record_time"] = pd.to_datetime(result["record_time"], format="ISO8601", errors="coerce")
    result = result[~result["record_time"].dt.minute.isin([15, 45])]
    return result.sort_values("record_time").reset_index(drop=True)


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

    result = apply_threshold_limit(result, threshold_map, time_col="record_time")

    if data_type == "sapflow":
        result = standard_deviation_limit(result, window=sapflow_std_window, step=sapflow_std_step)
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
            column_name + "_threshold_limit_std",
            column_name + "_threshold_limit",
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
        if data_type == "sapflow":
            matched = column.endswith("_threshold_limit") or column.endswith("_threshold_limit_std")
        else:
            matched = column.endswith("_threshold_limit")

        if not matched:
            continue

        base_name = strip_indicator_suffix(column)
        if base_name in EXCLUDED_GAPFILL_BASES:
            continue
        indicators.append(column)

    if data_type == "sapflow":
        indicators.sort(key=lambda item: (strip_indicator_suffix(item), 0 if item.endswith("_std") else 1, item))
    else:
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


def prepare_gapfill_dataframe(
    main_df: pd.DataFrame,
    flux_df: pd.DataFrame,
) -> pd.DataFrame:
    result = main_df.copy()
    result["record_time"] = pd.to_datetime(result["record_time"], format="ISO8601", errors="coerce")
    result = result.sort_values("record_time").reset_index(drop=True)

    driving_df = prepare_driving_dataframe(flux_df)
    result = result.merge(driving_df, how="left", on="record_time")
    result = result.rename(columns={"record_time": "DateTime"})
    result["DateTime"] = pd.to_datetime(result["DateTime"], format="ISO8601", errors="coerce").dt.tz_localize(None)

    for column in result.columns:
        if column == "DateTime":
            continue
        result[column] = pd.to_numeric(result[column], errors="coerce")

    result = regularize_half_hourly(result, "DateTime")
    return result


def build_nonflux_r_helper() -> object:
    _suppress_r_console_noise()
    ro.r(
        """
        suppressMessages(library(REddyProc))

        run_nonflux_gapfill <- function(file_name, longitude, latitude, timezone, flux_data, indicators) {
          flux_data$VPD <- fCalcVPDfromRHandTair(rH = flux_data$rH, Tair = flux_data$Tair)
          datanames <- colnames(flux_data)
          EddyProc.C <- sEddyProc$new(ID = file_name, Data = flux_data, ColNames = datanames[-1])
          EddyProc.C$sSetLocationInfo(LatDeg = latitude, LongDeg = longitude, TimeZoneHour = timezone)
          for (i in indicators) {
            EddyProc.C$sMDSGapFill(i, FillAll = TRUE)
          }
          FilledEddyData.F <- EddyProc.C$sExportResults()
          CombinedData.F <- cbind(flux_data, FilledEddyData.F)
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
    with localconverter(ro.default_converter + pandas2ri.converter):
        data_r = ro.conversion.py2rpy(working_df)

    result_data = run_nonflux_gapfill_func(
        file_name,
        float(long_deg),
        float(lat_deg),
        int(timezone_hour),
        data_r,
        ro.StrVector(list(indicators)),
    )

    with localconverter(ro.default_converter + pandas2ri.converter):
        result_df = ro.conversion.rpy2py(result_data)

    if "DateTime" in result_df.columns:
        result_df["DateTime"] = pd.to_datetime(result_df["DateTime"], format="ISO8601", errors="coerce").dt.tz_localize(None)
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
        print("[1/4] 加载数据...")
        r_ok, r_error = check_r_environment()
        if not r_ok:
            raise RuntimeError(r_error or "R 环境检查失败")

        main_df = load_csv(args.file, "输入")
        flux_df = load_csv(args.flux_file, "flux")
        threshold_map = load_threshold_map(args.thresholds_json)

        print("[2/4] 阈值筛选...")
        filtered_df = preprocess_nonflux_data(
            main_df,
            data_type=args.data_type,
            threshold_map=threshold_map,
            sapflow_std_window=args.sapflow_std_window,
            sapflow_std_step=args.sapflow_std_step,
        )

        print("[3/4] Gap Filling...")
        working_df = prepare_gapfill_dataframe(filtered_df, flux_df)
        gapfill_indicators = get_gapfill_indicators(working_df, args.data_type, args.gapfill_indicators)
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
