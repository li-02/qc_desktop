"""
REddyProc 通量完整流程脚本
按原项目处理链执行:
1. PAR 预插补
2. despiking
3. u* 阈值处理后的 NEE gap filling
4. H2O / LE / H gap filling
5. nighttime partitioning
"""

import argparse
import json
import os
import sys
import warnings
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


def setup_embedded_r_environment() -> bool:
    script_dir = os.path.dirname(os.path.abspath(__file__))

    possible_r_paths = [
        os.path.join(script_dir, "..", "R"),
        os.path.join(script_dir, "..", "R-Portable"),
        os.path.join(script_dir, "..", "..", "R-Portable"),
    ]

    for r_path in possible_r_paths:
        r_path = os.path.normpath(r_path)
        r_bin = os.path.join(r_path, "bin")
        if os.path.exists(r_bin):
            os.environ["R_HOME"] = r_path
            r_bin_path = os.path.join(r_bin, "x64") if os.path.exists(os.path.join(r_bin, "x64")) else r_bin
            current_path = os.environ.get("PATH", "")
            if r_bin_path not in current_path:
                os.environ["PATH"] = r_bin_path + os.pathsep + current_path
            print(f"  使用内嵌R环境: {r_path}")
            return True

    print("  未找到内嵌R环境，尝试使用系统R...")

    if os.environ.get("R_HOME") and os.path.exists(os.path.join(os.environ["R_HOME"], "bin")):
        print(f"  使用已配置的R_HOME: {os.environ['R_HOME']}")
        _add_r_to_path(os.environ["R_HOME"])
        _setup_r_libs_user()
        return True

    if sys.platform == "win32":
        system_r = _find_system_r_windows()
        if system_r:
            os.environ["R_HOME"] = system_r
            _add_r_to_path(system_r)
            _setup_r_libs_user()
            print(f"  使用系统R: {system_r}")
            return True

    return False


def _add_r_to_path(r_home: str) -> None:
    r_bin = os.path.join(r_home, "bin")
    r_bin_path = os.path.join(r_bin, "x64") if os.path.exists(os.path.join(r_bin, "x64")) else r_bin
    current_path = os.environ.get("PATH", "")
    if r_bin_path not in current_path:
        os.environ["PATH"] = r_bin_path + os.pathsep + current_path


def _setup_r_libs_user() -> None:
    if os.environ.get("R_LIBS_USER"):
        return

    user_home = os.path.expanduser("~")
    if sys.platform == "win32":
        r_home = os.environ.get("R_HOME", "")
        r_version = ""
        r_base = os.path.basename(r_home)
        if r_base.startswith("R-"):
            parts = r_base[2:].split(".")
            if len(parts) >= 2:
                r_version = f"{parts[0]}.{parts[1]}"
        if r_version:
            user_lib = os.path.join(user_home, "R", "win-library", r_version)
        else:
            user_lib = os.path.join(user_home, "R", "win-library")
        os.environ["R_LIBS_USER"] = user_lib


def _find_system_r_windows() -> Optional[str]:
    import winreg

    for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
        for sub_key in [r"SOFTWARE\R-core\R", r"SOFTWARE\R-core\R64"]:
            try:
                with winreg.OpenKey(hive, sub_key) as key:
                    install_path, _ = winreg.QueryValueEx(key, "InstallPath")
                    if os.path.exists(os.path.join(install_path, "bin")):
                        return install_path
            except (FileNotFoundError, OSError):
                continue

    for prog_dir in [
        os.environ.get("ProgramFiles", r"C:\Program Files"),
        os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
    ]:
        r_base = os.path.join(prog_dir, "R")
        if os.path.isdir(r_base):
            versions = sorted(
                [d for d in os.listdir(r_base) if os.path.isdir(os.path.join(r_base, d, "bin"))],
                reverse=True,
            )
            if versions:
                return os.path.join(r_base, versions[0])

    return None


setup_embedded_r_environment()


def check_r_environment() -> Tuple[bool, Optional[str]]:
    try:
        import rpy2.robjects as ro
        from rpy2.robjects.packages import importr, isinstalled

        r_version = ro.r("R.version.string")[0]
        print(f"  R版本: {r_version}")

        if not isinstalled("REddyProc"):
            return False, "REddyProc包未安装。请在R中运行: install.packages('REddyProc')"

        importr("REddyProc")
        print("  REddyProc包加载成功")
        return True, None
    except ImportError as exc:
        return False, f"rpy2未安装或配置错误: {exc}"
    except Exception as exc:
        return False, f"R环境检查失败: {exc}"


def calc_vpd_from_rh_tair(rh: np.ndarray, tair: np.ndarray) -> np.ndarray:
    es = 6.112 * np.exp((17.67 * tair) / (tair + 243.5))
    ea = es * (rh / 100.0)
    return np.maximum(es - ea, 0)


def ensure_numeric(df: pd.DataFrame, columns: Iterable[str]) -> None:
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")


def prepare_flux_dataframe(
    df: pd.DataFrame,
    *,
    time_col: str,
    rg_col: str,
    tair_col: str,
    rh_col: str,
    par_col: str,
    nee_col: str,
    ustar_col: str,
    vpd_col: str = "",
    h2o_col: str = "",
    le_col: str = "",
    h_col: str = "",
) -> pd.DataFrame:
    if time_col not in df.columns:
        raise ValueError(f"时间列不存在: {time_col}")

    working = pd.DataFrame()
    working["DateTime"] = pd.to_datetime(df[time_col], errors="raise").dt.tz_localize(None)
    working["NEE"] = pd.to_numeric(df[nee_col], errors="coerce")
    working["Rg"] = pd.to_numeric(df[rg_col], errors="coerce")
    working["Tair"] = pd.to_numeric(df[tair_col], errors="coerce")
    working["rH"] = pd.to_numeric(df[rh_col], errors="coerce")
    working["Par"] = pd.to_numeric(df[par_col], errors="coerce")
    working["Ustar"] = pd.to_numeric(df[ustar_col], errors="coerce")

    if vpd_col and vpd_col in df.columns:
        working["VPD"] = pd.to_numeric(df[vpd_col], errors="coerce")
    else:
        working["VPD"] = np.nan

    optional_mappings = [
        ("H2O", h2o_col),
        ("LE", le_col),
        ("H", h_col),
    ]
    for standard_name, source_column in optional_mappings:
        if source_column and source_column in df.columns:
            working[standard_name] = pd.to_numeric(df[source_column], errors="coerce")

    if "VPD" not in working.columns or working["VPD"].isna().all():
        print("  使用 rH + Tair 重新计算 VPD...")
        working["VPD"] = calc_vpd_from_rh_tair(
            working["rH"].to_numpy(dtype=float),
            working["Tair"].to_numpy(dtype=float),
        )

    ensure_numeric(working, [c for c in working.columns if c != "DateTime"])
    return working


def build_r_helpers() -> Tuple[object, object]:
    import rpy2.robjects as ro

    ro.r(
        """
        suppressMessages(library(REddyProc))

        run_par_gapfill <- function(file_name, longitude, latitude, timezone, flux_data) {
          flux_data$VPD <- fCalcVPDfromRHandTair(rH = flux_data$rH, Tair = flux_data$Tair)
          datanames <- colnames(flux_data)
          EddyProc.C <- sEddyProc$new(ID = file_name, Data = flux_data, ColNames = datanames[-1])
          EddyProc.C$sSetLocationInfo(LatDeg = latitude, LongDeg = longitude, TimeZoneHour = timezone)
          EddyProc.C$sMDSGapFill("Par", FillAll = TRUE)
          FilledEddyData.F <- EddyProc.C$sExportResults()
          CombinedData.F <- cbind(flux_data, FilledEddyData.F)
          return(CombinedData.F)
        }

        run_flux_pipeline <- function(file_name, longitude, latitude, timezone, flux_data, indicators, fill_all = TRUE) {
          flux_data$VPD <- fCalcVPDfromRHandTair(rH = flux_data$rH, Tair = flux_data$Tair)
          datanames <- colnames(flux_data)
          EddyProc.C <- sEddyProc$new(ID = file_name, Data = flux_data, ColNames = datanames[-1])
          EddyProc.C$sSetLocationInfo(LatDeg = latitude, LongDeg = longitude, TimeZoneHour = timezone)

          uStarTh <- EddyProc.C$sEstUstarThold(TempColName = "Tair", UstarColName = "Ustar")
          uStarThAnnual <- usGetAnnualSeasonUStarMap(uStarTh)
          uStarSuffixes <- colnames(uStarThAnnual)[-1]

          EddyProc.C$sMDSGapFillAfterUstar(
            fluxVar = "NEE",
            uStarVar = "Ustar",
            uStarTh = uStarThAnnual,
            uStarSuffix = uStarSuffixes,
            FillAll = fill_all
          )

          if (length(indicators) > 0) {
            for (i in indicators) {
              EddyProc.C$sMDSGapFill(i, FillAll = fill_all)
            }
          }

          EddyProc.C$sMDSGapFill("Tair", FillAll = FALSE)
          EddyProc.C$sMDSGapFill("VPD", FillAll = FALSE)
          EddyProc.C$sMDSGapFill("Rg", FillAll = FALSE)

          EddyProc.C$sMRFluxPartition(Suffix = uStarSuffixes)

          FilledEddyData.F <- EddyProc.C$sExportResults()
          CombinedData.F <- cbind(flux_data, FilledEddyData.F)
          return(CombinedData.F)
        }
        """
    )

    return ro.globalenv["run_par_gapfill"], ro.globalenv["run_flux_pipeline"]


def run_par_gapfill_r(
    run_par_gapfill_func: object,
    working_df: pd.DataFrame,
    *,
    file_name: str,
    lat_deg: float,
    long_deg: float,
    timezone_hour: int,
) -> pd.DataFrame:
    from rpy2.robjects import pandas2ri
    import rpy2.robjects as ro
    from rpy2.robjects.conversion import localconverter

    with localconverter(ro.default_converter + pandas2ri.converter):
        data_r = ro.conversion.py2rpy(working_df)

    result_data = run_par_gapfill_func(
        file_name,
        float(long_deg),
        float(lat_deg),
        int(timezone_hour),
        data_r,
    )

    with localconverter(ro.default_converter + pandas2ri.converter):
        result_df = ro.conversion.rpy2py(result_data)

    if "DateTime" in result_df.columns:
        result_df["DateTime"] = pd.to_datetime(result_df["DateTime"]).dt.tz_localize(None)
    return result_df


def add_window_tag(data: pd.DataFrame, day_size: int = 13) -> Tuple[pd.DataFrame, int]:
    window_size = day_size * 48
    window_data = data.copy()
    if window_data.empty:
        window_data["windowID"] = []
        return window_data, window_size

    window_data["windowID"] = window_data.index // window_size
    last_window = int(window_data["windowID"].max())
    if last_window > 0 and window_data.shape[0] % window_size != 0:
        window_data.loc[window_data["windowID"] == last_window, "windowID"] = last_window - 1
    return window_data, window_size


def calculate_diff(series: pd.Series) -> pd.Series:
    a = series
    b = a.shift(1)
    c = a.shift(-1)
    return (a - c) - (b - a)


def apply_despiking(
    df: pd.DataFrame,
    *,
    source_column: str,
    target_column: str,
    despiking_z: float,
) -> pd.DataFrame:
    result = df.copy()
    result[target_column] = result[source_column]

    window_data = result[result[target_column].notna()].copy().reset_index(drop=True)
    if window_data.empty:
        return result

    window_data, _ = add_window_tag(window_data)
    diff_column = f"{target_column}_diff"
    md_column = f"{target_column}_Md"
    mad_column = f"{target_column}_MAD"

    for window_id in sorted(window_data["windowID"].dropna().unique().tolist()):
        for day_flag in [0, 1]:
            mask = (window_data["windowID"] == window_id) & (window_data["is_day_night"] == day_flag)
            subset = window_data.loc[mask].copy()
            if subset.empty:
                continue

            window_data.loc[mask, diff_column] = calculate_diff(subset[target_column]).to_numpy()
            md_value = window_data.loc[mask, diff_column].median()
            window_data.loc[mask, md_column] = md_value
            mad_value = (window_data.loc[mask, diff_column] - md_value).abs().median()
            window_data.loc[mask, mad_column] = mad_value

        low_range = window_data[md_column] - (despiking_z * window_data[mad_column]) / 0.6745
        high_range = window_data[md_column] + (despiking_z * window_data[mad_column]) / 0.6745
        spike_mask = (window_data["windowID"] == window_id) & (
            (window_data[diff_column] < low_range) | (window_data[diff_column] > high_range)
        )
        if spike_mask.any():
            spike_times = window_data.loc[spike_mask, "DateTime"].tolist()
            result.loc[result["DateTime"].isin(spike_times), target_column] = np.nan

    return result


def run_despiking(par_result_df: pd.DataFrame, despiking_z: float) -> pd.DataFrame:
    if "Par_f" not in par_result_df.columns:
        raise ValueError("PAR 预插补结果缺少 Par_f，无法执行 despiking")

    result = par_result_df.copy()
    result["is_day_night"] = np.where(pd.to_numeric(result["Par_f"], errors="coerce") > 5, 1, 0)

    configs = [
        ("NEE", "co2_despiking"),
        ("H2O", "h2o_despiking"),
        ("LE", "le_despiking"),
        ("H", "h_despiking"),
    ]
    for source_column, target_column in configs:
        if source_column in result.columns:
            result = apply_despiking(
                result,
                source_column=source_column,
                target_column=target_column,
                despiking_z=despiking_z,
            )

    return result


def run_flux_pipeline_r(
    run_flux_pipeline_func: object,
    flux_df: pd.DataFrame,
    *,
    file_name: str,
    lat_deg: float,
    long_deg: float,
    timezone_hour: int,
    companion_columns: Sequence[str],
    fill_all: bool,
) -> pd.DataFrame:
    from rpy2.robjects import pandas2ri
    import rpy2.robjects as ro
    from rpy2.robjects.conversion import localconverter

    with localconverter(ro.default_converter + pandas2ri.converter):
        data_r = ro.conversion.py2rpy(flux_df)

    result_data = run_flux_pipeline_func(
        file_name,
        float(long_deg),
        float(lat_deg),
        int(timezone_hour),
        data_r,
        ro.StrVector(list(companion_columns)),
        bool(fill_all),
    )

    with localconverter(ro.default_converter + pandas2ri.converter):
        result_df = ro.conversion.rpy2py(result_data)

    if "DateTime" in result_df.columns:
        result_df["DateTime"] = pd.to_datetime(result_df["DateTime"]).dt.tz_localize(None)
    return result_df


def normalize_export_columns(result_df: pd.DataFrame) -> pd.DataFrame:
    normalized = result_df.copy()
    rename_map: Dict[str, str] = {}
    drop_columns: List[str] = []
    for column in normalized.columns:
        lowered = column.lower()
        if lowered.endswith("_orig"):
            drop_columns.append(column)
            continue
        rename_map[column] = lowered

    normalized = normalized.drop(columns=drop_columns, errors="ignore")
    normalized = normalized.rename(columns=rename_map)
    return normalized


def select_representative_column(columns: Sequence[str], candidates: Sequence[str], contains_tokens: Sequence[str]) -> Optional[str]:
    column_set = list(columns)
    for candidate in candidates:
        if candidate in column_set:
            return candidate
    for column in column_set:
        if all(token in column for token in contains_tokens) and column.endswith("_f"):
            return column
    return None


def merge_results(
    original_df: pd.DataFrame,
    working_df: pd.DataFrame,
    par_result_df: pd.DataFrame,
    flux_result_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, Dict[str, Optional[str]]]:
    output_df = original_df.copy()

    par_normalized = normalize_export_columns(par_result_df)
    flux_normalized = normalize_export_columns(flux_result_df)

    if "par_f" in par_normalized.columns:
        output_df["par_f"] = par_normalized["par_f"].to_numpy()
    if "par_fqc" in par_normalized.columns:
        output_df["par_fqc"] = par_normalized["par_fqc"].to_numpy()

    for despiking_column in ["co2_despiking", "h2o_despiking", "le_despiking", "h_despiking"]:
        if despiking_column in working_df.columns:
            output_df[despiking_column] = working_df[despiking_column].to_numpy()

    base_columns = {
        "datetime",
        "nee",
        "rg",
        "tair",
        "rh",
        "r_h",
        "vpd",
        "par",
        "ustar",
        "h2o",
        "le",
        "h",
    }
    for column in flux_normalized.columns:
        if column in base_columns:
            continue
        output_df[column] = flux_normalized[column].to_numpy()

    representatives = {
        "nee": select_representative_column(
            flux_normalized.columns,
            ["nee_ustar_f", "nee_f"],
            ["nee", "ustar"],
        ),
        "h2o": select_representative_column(
            flux_normalized.columns,
            ["h2o_despiking_f", "h2o_f"],
            ["h2o", "despiking"],
        ),
        "le": select_representative_column(
            flux_normalized.columns,
            ["le_despiking_f", "le_f"],
            ["le", "despiking"],
        ),
        "h": select_representative_column(
            flux_normalized.columns,
            ["h_despiking_f", "h_f"],
            ["h", "despiking"],
        ),
    }

    return output_df, representatives


def validate_required_columns(df: pd.DataFrame, required_columns: Dict[str, str]) -> None:
    missing = []
    for label, column_name in required_columns.items():
        if not column_name or column_name not in df.columns:
            missing.append(f"{label}={column_name}")
    if missing:
        raise ValueError("缺少必需列: " + ", ".join(missing))


def main() -> None:
    parser = argparse.ArgumentParser(description="REddyProc 通量完整流程")
    parser.add_argument("--file", "-f", required=True, help="输入CSV文件")
    parser.add_argument("--output", "-o", required=True, help="输出CSV文件")
    parser.add_argument("--time-col", default="TIMESTAMP", help="时间列名")
    parser.add_argument("--lat", type=float, required=True, help="站点纬度")
    parser.add_argument("--long", type=float, required=True, help="站点经度")
    parser.add_argument("--tz", type=int, required=True, help="时区")
    parser.add_argument("--rg-col", required=True, help="Rg列名")
    parser.add_argument("--tair-col", required=True, help="Tair列名")
    parser.add_argument("--rh-col", required=True, help="rH列名")
    parser.add_argument("--par-col", required=True, help="Par列名")
    parser.add_argument("--nee-col", required=True, help="NEE列名")
    parser.add_argument("--ustar-col", required=True, help="Ustar列名")
    parser.add_argument("--vpd-col", default="", help="VPD列名")
    parser.add_argument("--h2o-col", default="", help="H2O列名")
    parser.add_argument("--le-col", default="", help="LE列名")
    parser.add_argument("--h-col", default="", help="H列名")
    parser.add_argument("--despiking-z", type=float, default=4, help="Despiking阈值")
    parser.add_argument("--fill-all", type=lambda x: x.lower() == "true", default=True, help="是否FillAll")
    args = parser.parse_args()

    print("=" * 60)
    print("REddyProc 通量完整流程")
    print("=" * 60)
    print(f"数据文件: {args.file}")
    print(f"输出文件: {args.output}")
    print("=" * 60)

    print("\n[1/6] 检查R环境...")
    r_ok, r_error = check_r_environment()
    if not r_ok:
        print(f"  错误: {r_error}")
        sys.exit(1)

    print("\n[2/6] 加载数据...")
    if not os.path.exists(args.file):
        print(f"  错误: 数据文件不存在: {args.file}")
        sys.exit(1)

    original_df = pd.read_csv(args.file)
    print(f"  数据形状: {original_df.shape}")
    validate_required_columns(
        original_df,
        {
            "time": args.time_col,
            "Rg": args.rg_col,
            "Tair": args.tair_col,
            "rH": args.rh_col,
            "Par": args.par_col,
            "NEE": args.nee_col,
            "Ustar": args.ustar_col,
        },
    )

    print("\n[3/6] 准备原项目同款输入格式...")
    working_df = prepare_flux_dataframe(
        original_df,
        time_col=args.time_col,
        rg_col=args.rg_col,
        tair_col=args.tair_col,
        rh_col=args.rh_col,
        par_col=args.par_col,
        nee_col=args.nee_col,
        ustar_col=args.ustar_col,
        vpd_col=args.vpd_col,
        h2o_col=args.h2o_col,
        le_col=args.le_col,
        h_col=args.h_col,
    )

    run_par_gapfill_func, run_flux_pipeline_func = build_r_helpers()

    print("\n[4/6] 执行 PAR 预插补与 despiking...")
    print("  执行 PAR 预插补...")
    par_result_df = run_par_gapfill_r(
        run_par_gapfill_func,
        working_df[["DateTime", "NEE", "Rg", "Tair", "rH", "VPD", "Par", "Ustar"]].copy(),
        file_name=os.path.basename(args.file),
        lat_deg=args.lat,
        long_deg=args.long,
        timezone_hour=args.tz,
    )
    print("  执行 despiking...")
    despiked_df = run_despiking(par_result_df, args.despiking_z)

    print("\n[5/6] 执行 u* 阈值、gap filling 与 nighttime partitioning...")
    flux_input = despiked_df[["DateTime", "NEE", "Rg", "Tair", "rH", "VPD", "Ustar"]].copy()
    companion_columns: List[str] = []
    for column_name in ["h2o_despiking", "le_despiking", "h_despiking"]:
        if column_name in despiked_df.columns:
            flux_input[column_name] = despiked_df[column_name]
            companion_columns.append(column_name)

    flux_result_df = run_flux_pipeline_r(
        run_flux_pipeline_func,
        flux_input,
        file_name=os.path.basename(args.file),
        lat_deg=args.lat,
        long_deg=args.long,
        timezone_hour=args.tz,
        companion_columns=companion_columns,
        fill_all=args.fill_all,
    )

    print("\n[6/6] 保存结果...")
    output_df, representatives = merge_results(
        original_df,
        despiked_df,
        par_result_df,
        flux_result_df,
    )
    output_df.to_csv(args.output, index=False)

    summary = {
        "outputColumns": list(output_df.columns),
        "representatives": representatives,
        "companionColumns": companion_columns,
    }
    print("__RESULT_JSON__:" + json.dumps(summary, ensure_ascii=False))

    print("\n" + "=" * 60)
    print("流程完成")
    print(f"  结果已保存至: {args.output}")
    print("=" * 60)


if __name__ == "__main__":
    main()
