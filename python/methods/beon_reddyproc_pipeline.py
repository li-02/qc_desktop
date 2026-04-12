"""
BEON 原项目风格 REddyProc 流程脚本
处理链:
1. QC flag 过滤
2. 存储项修正
3. threshold_limit
4. 站点特例字段整理
5. PAR 预插补
6. despiking
7. u* 阈值处理、gap filling、nighttime partitioning
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, Iterable, List, Optional, Sequence

import numpy as np
import pandas as pd

from reddyproc_flux_pipeline import (
    build_r_helpers,
    calc_vpd_from_rh_tair,
    check_r_environment,
    merge_results,
    run_despiking,
    run_flux_pipeline_r,
    run_par_gapfill_r,
)


def ensure_numeric(df: pd.DataFrame, columns: Iterable[str]) -> None:
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")


def parse_bool(value: str) -> bool:
    return str(value).strip().lower() == "true"


def normalize_missing(df: pd.DataFrame) -> pd.DataFrame:
    return df.replace(["NaN", "nan", ""], np.nan)


def ensure_columns(df: pd.DataFrame, columns: Iterable[str]) -> None:
    for column in columns:
        if column and column not in df.columns:
            df[column] = np.nan


def parse_allowed_qc_flags(flags: str) -> List[str]:
    parts = [item.strip() for item in str(flags).split(",")]
    return [item for item in parts if item]


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
        if entry:
            threshold_map[str(column_name)] = entry
    return threshold_map


def load_local_rules(local_rules_json: str) -> List[Dict[str, Any]]:
    if not local_rules_json:
        return []
    try:
        raw = json.loads(local_rules_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"local_rules_json 解析失败: {exc}") from exc

    if not isinstance(raw, list):
        raise ValueError("local_rules_json 必须是数组")

    return [item for item in raw if isinstance(item, dict)]


def extract_rule_config(rule: Dict[str, Any]) -> Dict[str, Any]:
    config = rule.get("ruleConfig")
    if isinstance(config, dict):
        return config
    return rule


def get_override_target_columns(local_override_rules: Sequence[Dict[str, Any]]) -> List[str]:
    targets: List[str] = []
    for rule in local_override_rules:
        config = extract_rule_config(rule)
        copy_columns = config.get("copy_columns") or []
        for item in copy_columns:
            if isinstance(item, dict):
                target = str(item.get("target") or "").strip()
                if target:
                    targets.append(target)
        vpd_formula = config.get("vpd_formula")
        if isinstance(vpd_formula, dict):
            target = str(vpd_formula.get("target") or "").strip()
            if target:
                targets.append(target)
    return targets


def ensure_time_column(df: pd.DataFrame, time_col: str) -> None:
    if time_col not in df.columns:
        raise ValueError(f"时间列不存在: {time_col}")


def apply_qc_flag_filter(
    df: pd.DataFrame,
    *,
    site_code: str,
    allowed_qc_flags: Sequence[str],
    co2_flux_col: str,
    h2o_flux_col: str,
    le_col: str,
    h_col: str,
    qc_co2_flux_col: str,
    qc_h2o_flux_col: str,
    qc_le_col: str,
    qc_h_col: str,
) -> pd.DataFrame:
    result = df.copy()
    all_flags = {"0", "1", "2"}
    denied_flags = list(sorted(all_flags - set(allowed_qc_flags)))

    if co2_flux_col in result.columns:
        result["co2_flux_filter_label"] = pd.to_numeric(result[co2_flux_col], errors="coerce")
    if le_col in result.columns:
        result["le_filter_label"] = pd.to_numeric(result[le_col], errors="coerce")
    if h_col in result.columns:
        result["h_filter_label"] = pd.to_numeric(result[h_col], errors="coerce")

    if h2o_flux_col and h2o_flux_col in result.columns:
        result["h2o_flux_filter_label"] = pd.to_numeric(result[h2o_flux_col], errors="coerce")

    if site_code in {"aosen", "badaling"} and ("h2o_flux_filter_label" not in result.columns):
        if le_col not in result.columns:
            raise ValueError("Campbell 站点缺少 LE 列，无法按原项目逻辑反推 h2o_flux")
        result["h2o_flux"] = pd.to_numeric(result[le_col], errors="coerce") / 2450 / 18 * 1000
        result["h2o_flux_filter_label"] = result["h2o_flux"]

    if not denied_flags:
        return result

    qc_mappings = [
        (qc_co2_flux_col, "co2_flux_filter_label"),
        (qc_h2o_flux_col, "h2o_flux_filter_label"),
        (qc_le_col, "le_filter_label"),
        (qc_h_col, "h_filter_label"),
    ]
    for qc_column, target_column in qc_mappings:
        if qc_column and qc_column in result.columns and target_column in result.columns:
            qc_series = result[qc_column].astype(str)
            result.loc[qc_series.isin(denied_flags), target_column] = np.nan

    return result


def apply_storage_correction(
    df: pd.DataFrame,
    *,
    use_strg: bool,
    co2_strg_col: str,
    h2o_strg_col: str,
    le_strg_col: str,
    h_strg_col: str,
) -> pd.DataFrame:
    result = df.copy()

    configs = [
        ("co2_flux_filter_label", "co2_flux_add_strg", co2_strg_col),
        ("h2o_flux_filter_label", "h2o_flux_add_strg", h2o_strg_col),
        ("le_filter_label", "le_add_strg", le_strg_col),
        ("h_filter_label", "h_add_strg", h_strg_col),
    ]

    for source_column, target_column, strg_column in configs:
        if source_column not in result.columns:
            continue
        result[source_column] = pd.to_numeric(result[source_column], errors="coerce")
        if use_strg and strg_column and strg_column in result.columns:
            result[strg_column] = pd.to_numeric(result[strg_column], errors="coerce")
            result[target_column] = result[source_column] + result[strg_column]
        else:
            result[target_column] = result[source_column]

    return result


def apply_site_overrides(
    df: pd.DataFrame,
    *,
    site_code: str,
    rg_raw_col: str,
    tair_raw_col: str,
    rh_raw_col: str,
    vpd_raw_col: str,
    short_up_col: str,
    rh_12m_col: str,
    rh_10m_col: str,
    ta_12m_col: str,
    local_override_rules: Sequence[Dict[str, Any]],
) -> pd.DataFrame:
    result = df.copy()
    if local_override_rules:
        for rule in local_override_rules:
            config = extract_rule_config(rule)
            for column_name in config.get("drop_columns") or []:
                if column_name in result.columns:
                    del result[column_name]

            ensure_numeric(result, [str(item) for item in (config.get("numeric_columns") or []) if item])

            copy_columns = config.get("copy_columns") or []
            for item in copy_columns:
                if not isinstance(item, dict):
                    continue
                source = str(item.get("source") or "").strip()
                target = str(item.get("target") or "").strip()
                if source and target and source in result.columns:
                    result[target] = pd.to_numeric(result[source], errors="coerce")

            vpd_formula = config.get("vpd_formula")
            if isinstance(vpd_formula, dict):
                target = str(vpd_formula.get("target") or "vpd").strip()
                rh_column = str(vpd_formula.get("rh_column") or rh_raw_col).strip()
                tair_column = str(vpd_formula.get("tair_column") or tair_raw_col).strip()
                output_unit = str(vpd_formula.get("output_unit") or "pa").strip().lower()
                if rh_column in result.columns and tair_column in result.columns:
                    factor = 100 if output_unit == "pa" else 1
                    result[target] = calc_vpd_from_rh_tair(
                        pd.to_numeric(result[rh_column], errors="coerce").to_numpy(dtype=float),
                        pd.to_numeric(result[tair_column], errors="coerce").to_numpy(dtype=float),
                    ) * factor
        return result

    if site_code == "aosen":
        if short_up_col in result.columns:
            result[rg_raw_col] = pd.to_numeric(result[short_up_col], errors="coerce")
        if rh_12m_col in result.columns:
            result[rh_raw_col] = pd.to_numeric(result[rh_12m_col], errors="coerce")
        tair_source = ta_12m_col if ta_12m_col in result.columns else tair_raw_col
        if tair_source in result.columns:
            result[tair_raw_col] = pd.to_numeric(result[tair_source], errors="coerce")
        if rh_raw_col in result.columns and tair_raw_col in result.columns:
            result[vpd_raw_col] = calc_vpd_from_rh_tair(
                pd.to_numeric(result[rh_raw_col], errors="coerce").to_numpy(dtype=float),
                pd.to_numeric(result[tair_raw_col], errors="coerce").to_numpy(dtype=float),
            ) * 100
    elif site_code == "badaling":
        if short_up_col in result.columns:
            result[rg_raw_col] = pd.to_numeric(result[short_up_col], errors="coerce")
        if rh_10m_col in result.columns:
            result[rh_raw_col] = pd.to_numeric(result[rh_10m_col], errors="coerce")
        if tair_raw_col in result.columns:
            result[tair_raw_col] = pd.to_numeric(result[tair_raw_col], errors="coerce")
        if rh_raw_col in result.columns and tair_raw_col in result.columns:
            result[vpd_raw_col] = calc_vpd_from_rh_tair(
                pd.to_numeric(result[rh_raw_col], errors="coerce").to_numpy(dtype=float),
                pd.to_numeric(result[tair_raw_col], errors="coerce").to_numpy(dtype=float),
            ) * 100
    return result


def apply_threshold_limit(
    df: pd.DataFrame,
    *,
    time_col: str,
    threshold_map: Dict[str, Dict[str, float]],
    co2_flux_col: str,
    h2o_flux_col: str,
    le_col: str,
    h_col: str,
    ppfd_col: str,
    rg_raw_col: str,
    tair_raw_col: str,
    rh_raw_col: str,
    vpd_raw_col: str,
    ustar_raw_col: str,
) -> pd.DataFrame:
    result = df.copy()

    # 原项目 flux 主线固定生成 add_strg -> threshold_limit
    flux_source_map = [
        (co2_flux_col, "co2_flux_add_strg", "co2_flux_threshold_limit"),
        (h2o_flux_col, "h2o_flux_add_strg", "h2o_flux_threshold_limit"),
        (le_col, "le_add_strg", "le_threshold_limit"),
        (h_col, "h_add_strg", "h_threshold_limit"),
    ]

    for raw_column, source_column, target_column in flux_source_map:
        if not raw_column or source_column not in result.columns:
            continue
        values = pd.to_numeric(result[source_column], errors="coerce")
        bounds = threshold_map.get(raw_column, {})
        lower = bounds.get("lower")
        upper = bounds.get("upper")
        mask = pd.Series(False, index=result.index)
        if lower is not None:
            mask |= values < lower
        if upper is not None:
            mask |= values > upper
        result[target_column] = values
        result.loc[mask, target_column] = np.nan

    for column_name in list(result.columns):
        if column_name in {time_col, "co2_flux_add_strg", "h2o_flux_add_strg", "le_add_strg", "h_add_strg"}:
            continue
        if column_name.endswith("_filter_label") or column_name.endswith("_threshold_limit") or column_name.endswith("_add_strg"):
            continue
        if column_name not in threshold_map:
            continue
        values = pd.to_numeric(result[column_name], errors="coerce")
        bounds = threshold_map.get(column_name, {})
        lower = bounds.get("lower")
        upper = bounds.get("upper")
        mask = pd.Series(False, index=result.index)
        if lower is not None:
            mask |= values < lower
        if upper is not None:
            mask |= values > upper
        threshold_column = f"{column_name}_threshold_limit"
        result[threshold_column] = values
        result.loc[mask, threshold_column] = np.nan

    # 为关键驱动列兜底生成 threshold_limit
    required_passthrough = [
        co2_flux_col,
        h2o_flux_col,
        le_col,
        h_col,
        ppfd_col,
        rg_raw_col,
        tair_raw_col,
        rh_raw_col,
        vpd_raw_col,
        ustar_raw_col,
    ]
    for column_name in required_passthrough:
        if not column_name or column_name not in result.columns:
            continue
        suffix = f"{column_name}_threshold_limit"
        if suffix not in result.columns:
            result[suffix] = pd.to_numeric(result[column_name], errors="coerce")

    if time_col in result.columns and "co2_flux_add_strg" in result.columns and "co2_flux_threshold_limit" in result.columns:
        time_series = pd.to_datetime(result[time_col], errors="coerce")
        month_day = time_series.dt.strftime("%m-%d")
        condition = (~month_day.between("04-20", "10-31")) & (pd.to_numeric(result["co2_flux_add_strg"], errors="coerce") < -0.2)
        result.loc[condition, "co2_flux_threshold_limit"] = np.nan

    return result


def prepare_beon_standard_dataframe(
    df: pd.DataFrame,
    *,
    time_col: str,
    co2_flux_col: str,
    h2o_flux_col: str,
    le_col: str,
    h_col: str,
    ppfd_col: str,
    rg_raw_col: str,
    tair_raw_col: str,
    rh_raw_col: str,
    vpd_raw_col: str,
    ustar_raw_col: str,
) -> pd.DataFrame:
    working = pd.DataFrame()
    working["DateTime"] = pd.to_datetime(df[time_col], errors="raise").dt.tz_localize(None)
    working["NEE"] = pd.to_numeric(df["co2_flux_threshold_limit"], errors="coerce")
    working["Par"] = pd.to_numeric(df[f"{ppfd_col}_threshold_limit"], errors="coerce")
    working["Rg"] = pd.to_numeric(df[f"{rg_raw_col}_threshold_limit"], errors="coerce")
    working["Tair"] = pd.to_numeric(df[f"{tair_raw_col}_threshold_limit"], errors="coerce")
    working["rH"] = pd.to_numeric(df[f"{rh_raw_col}_threshold_limit"], errors="coerce")

    ustar_threshold_col = f"{ustar_raw_col}_threshold_limit"
    if ustar_threshold_col in df.columns:
        working["Ustar"] = pd.to_numeric(df[ustar_threshold_col], errors="coerce")
    elif ustar_raw_col in df.columns:
        working["Ustar"] = pd.to_numeric(df[ustar_raw_col], errors="coerce")
    else:
        working["Ustar"] = np.nan

    vpd_threshold_col = f"{vpd_raw_col}_threshold_limit" if vpd_raw_col else ""
    if vpd_threshold_col and vpd_threshold_col in df.columns:
        working["VPD"] = pd.to_numeric(df[vpd_threshold_col], errors="coerce") * 0.01
    else:
        working["VPD"] = np.nan

    if h2o_flux_col and "h2o_flux_threshold_limit" in df.columns:
        working["H2O"] = pd.to_numeric(df["h2o_flux_threshold_limit"], errors="coerce")
    if le_col and "le_threshold_limit" in df.columns:
        working["LE"] = pd.to_numeric(df["le_threshold_limit"], errors="coerce")
    if h_col and "h_threshold_limit" in df.columns:
        working["H"] = pd.to_numeric(df["h_threshold_limit"], errors="coerce")

    if "VPD" not in working.columns or working["VPD"].isna().all():
        working["VPD"] = calc_vpd_from_rh_tair(
            working["rH"].to_numpy(dtype=float),
            working["Tair"].to_numpy(dtype=float),
        )

    ensure_numeric(working, [column for column in working.columns if column != "DateTime"])
    return working


def validate_beon_columns(
    df: pd.DataFrame,
    *,
    time_col: str,
    co2_flux_col: str,
    ppfd_col: str,
    rg_raw_col: str,
    tair_raw_col: str,
    rh_raw_col: str,
    ustar_raw_col: str,
    site_code: str,
    short_up_col: str,
    rh_12m_col: str,
    rh_10m_col: str,
    ta_12m_col: str,
    local_override_rules: Sequence[Dict[str, Any]],
) -> None:
    missing: List[str] = []
    if time_col not in df.columns:
        missing.append(time_col)
    if co2_flux_col not in df.columns:
        missing.append(co2_flux_col)
    if ppfd_col not in df.columns:
        missing.append(ppfd_col)
    if ustar_raw_col not in df.columns:
        missing.append(ustar_raw_col)

    if local_override_rules:
        override_targets = set(get_override_target_columns(local_override_rules))
        for column_name in [rg_raw_col, tair_raw_col, rh_raw_col]:
            if column_name not in df.columns and column_name not in override_targets:
                missing.append(column_name)
    elif site_code == "aosen":
        if rg_raw_col not in df.columns and short_up_col not in df.columns:
            missing.append(f"{rg_raw_col}/{short_up_col}")
        if rh_raw_col not in df.columns and rh_12m_col not in df.columns:
            missing.append(f"{rh_raw_col}/{rh_12m_col}")
        if tair_raw_col not in df.columns and ta_12m_col not in df.columns:
            missing.append(f"{tair_raw_col}/{ta_12m_col}")
    elif site_code == "badaling":
        if rg_raw_col not in df.columns and short_up_col not in df.columns:
            missing.append(f"{rg_raw_col}/{short_up_col}")
        if rh_raw_col not in df.columns and rh_10m_col not in df.columns:
            missing.append(f"{rh_raw_col}/{rh_10m_col}")
        if tair_raw_col not in df.columns:
            missing.append(tair_raw_col)
    else:
        for column_name in [rg_raw_col, tair_raw_col, rh_raw_col]:
            if column_name not in df.columns:
                missing.append(column_name)

    if missing:
        raise ValueError("缺少 BEON-REddyProc 必需列: " + ", ".join(missing))


def main() -> None:
    parser = argparse.ArgumentParser(description="BEON 原项目风格 REddyProc 流程")
    parser.add_argument("--file", "-f", required=True, help="输入CSV文件")
    parser.add_argument("--output", "-o", required=True, help="输出CSV文件")
    parser.add_argument("--time-col", default="record_time", help="时间列名")
    parser.add_argument("--lat", type=float, required=True, help="站点纬度")
    parser.add_argument("--long", type=float, required=True, help="站点经度")
    parser.add_argument("--tz", type=int, required=True, help="时区")
    parser.add_argument("--site-code", default="", help="站点代码")
    parser.add_argument("--allowed-qc-flags", default="0,1,2", help="允许的 QC flag，英文逗号分隔")
    parser.add_argument("--use-strg", type=parse_bool, default=False, help="是否启用存储项修正")
    parser.add_argument("--co2-flux-col", default="co2_flux", help="co2_flux 列名")
    parser.add_argument("--h2o-flux-col", default="h2o_flux", help="h2o_flux 列名")
    parser.add_argument("--le-col", default="le", help="LE 列名")
    parser.add_argument("--h-col", default="h", help="H 列名")
    parser.add_argument("--qc-co2-flux-col", default="qc_co2_flux", help="CO2 QC 列名")
    parser.add_argument("--qc-h2o-flux-col", default="qc_h2o_flux", help="H2O QC 列名")
    parser.add_argument("--qc-le-col", default="qc_le", help="LE QC 列名")
    parser.add_argument("--qc-h-col", default="qc_h", help="H QC 列名")
    parser.add_argument("--ppfd-col", default="ppfd_1_1_1", help="PPFD 列名")
    parser.add_argument("--rg-raw-col", default="rg_1_1_2", help="Rg 原始列名")
    parser.add_argument("--tair-raw-col", default="ta_1_2_1", help="Tair 原始列名")
    parser.add_argument("--rh-raw-col", default="rh", help="rH 原始列名")
    parser.add_argument("--vpd-raw-col", default="vpd", help="VPD 原始列名")
    parser.add_argument("--ustar-raw-col", default="u_", help="u* 原始列名")
    parser.add_argument("--co2-strg-col", default="co2_flux_strg", help="CO2 存储项列名")
    parser.add_argument("--h2o-strg-col", default="h2o_flux_strg", help="H2O 存储项列名")
    parser.add_argument("--le-strg-col", default="le_strg", help="LE 存储项列名")
    parser.add_argument("--h-strg-col", default="h_strg", help="H 存储项列名")
    parser.add_argument("--short-up-col", default="short_up_avg", help="短波上行列名")
    parser.add_argument("--rh-12m-col", default="rh_12m_avg", help="12m RH 列名")
    parser.add_argument("--rh-10m-col", default="rh_10m_avg", help="10m RH 列名")
    parser.add_argument("--ta-12m-col", default="ta_12m_avg", help="12m Tair 列名")
    parser.add_argument("--despiking-z", type=float, default=4, help="Despiking 阈值")
    parser.add_argument("--fill-all", type=parse_bool, default=True, help="是否 FillAll")
    parser.add_argument("--thresholds-json", default="", help="列阈值 JSON")
    parser.add_argument("--local-rules-json", default="", help="本地站点 override 规则 JSON")
    args = parser.parse_args()

    print("=" * 60)
    print("BEON 原项目风格 REddyProc 流程")
    print("=" * 60)
    print(f"数据文件: {args.file}")
    print(f"输出文件: {args.output}")
    print("=" * 60)

    print("\n[1/7] 检查R环境...")
    r_ok, r_error = check_r_environment()
    if not r_ok:
        print(f"  错误: {r_error}")
        sys.exit(1)

    print("\n[2/7] 加载数据...")
    if not os.path.exists(args.file):
        print(f"  错误: 数据文件不存在: {args.file}")
        sys.exit(1)

    raw_df = pd.read_csv(args.file)
    raw_df = normalize_missing(raw_df)
    site_code = str(args.site_code or "").strip().lower()
    local_override_rules = load_local_rules(args.local_rules_json)
    validate_beon_columns(
        raw_df,
        time_col=args.time_col,
        co2_flux_col=args.co2_flux_col,
        ppfd_col=args.ppfd_col,
        rg_raw_col=args.rg_raw_col,
        tair_raw_col=args.tair_raw_col,
        rh_raw_col=args.rh_raw_col,
        ustar_raw_col=args.ustar_raw_col,
        site_code=site_code,
        short_up_col=args.short_up_col,
        rh_12m_col=args.rh_12m_col,
        rh_10m_col=args.rh_10m_col,
        ta_12m_col=args.ta_12m_col,
        local_override_rules=local_override_rules,
    )

    print("\n[3/7] 执行 BEON 原项目预处理...")
    preprocessed_df = raw_df.copy()
    ensure_time_column(preprocessed_df, args.time_col)
    ensure_columns(
        preprocessed_df,
        [
            args.co2_flux_col,
            args.h2o_flux_col,
            args.le_col,
            args.h_col,
            args.ppfd_col,
            args.rg_raw_col,
            args.tair_raw_col,
            args.rh_raw_col,
            args.vpd_raw_col,
            args.ustar_raw_col,
            args.short_up_col,
            args.rh_12m_col,
            args.rh_10m_col,
            args.ta_12m_col,
            args.co2_strg_col,
            args.h2o_strg_col,
            args.le_strg_col,
            args.h_strg_col,
            args.qc_co2_flux_col,
            args.qc_h2o_flux_col,
            args.qc_le_col,
            args.qc_h_col,
        ],
    )
    preprocessed_df = apply_qc_flag_filter(
        preprocessed_df,
        site_code=site_code,
        allowed_qc_flags=parse_allowed_qc_flags(args.allowed_qc_flags),
        co2_flux_col=args.co2_flux_col,
        h2o_flux_col=args.h2o_flux_col,
        le_col=args.le_col,
        h_col=args.h_col,
        qc_co2_flux_col=args.qc_co2_flux_col,
        qc_h2o_flux_col=args.qc_h2o_flux_col,
        qc_le_col=args.qc_le_col,
        qc_h_col=args.qc_h_col,
    )
    preprocessed_df = apply_storage_correction(
        preprocessed_df,
        use_strg=args.use_strg,
        co2_strg_col=args.co2_strg_col,
        h2o_strg_col=args.h2o_strg_col,
        le_strg_col=args.le_strg_col,
        h_strg_col=args.h_strg_col,
    )
    preprocessed_df = apply_site_overrides(
        preprocessed_df,
        site_code=site_code,
        rg_raw_col=args.rg_raw_col,
        tair_raw_col=args.tair_raw_col,
        rh_raw_col=args.rh_raw_col,
        vpd_raw_col=args.vpd_raw_col,
        short_up_col=args.short_up_col,
        rh_12m_col=args.rh_12m_col,
        rh_10m_col=args.rh_10m_col,
        ta_12m_col=args.ta_12m_col,
        local_override_rules=local_override_rules,
    )
    preprocessed_df = apply_threshold_limit(
        preprocessed_df,
        time_col=args.time_col,
        threshold_map=load_threshold_map(args.thresholds_json),
        co2_flux_col=args.co2_flux_col,
        h2o_flux_col=args.h2o_flux_col,
        le_col=args.le_col,
        h_col=args.h_col,
        ppfd_col=args.ppfd_col,
        rg_raw_col=args.rg_raw_col,
        tair_raw_col=args.tair_raw_col,
        rh_raw_col=args.rh_raw_col,
        vpd_raw_col=args.vpd_raw_col,
        ustar_raw_col=args.ustar_raw_col,
    )

    print("\n[4/7] 准备 REddyProc 输入并执行 PAR 预插补...")
    working_df = prepare_beon_standard_dataframe(
        preprocessed_df,
        time_col=args.time_col,
        co2_flux_col=args.co2_flux_col,
        h2o_flux_col=args.h2o_flux_col,
        le_col=args.le_col,
        h_col=args.h_col,
        ppfd_col=args.ppfd_col,
        rg_raw_col=args.rg_raw_col,
        tair_raw_col=args.tair_raw_col,
        rh_raw_col=args.rh_raw_col,
        vpd_raw_col=args.vpd_raw_col,
        ustar_raw_col=args.ustar_raw_col,
    )

    run_par_gapfill_func, run_flux_pipeline_func = build_r_helpers()
    par_result_df = run_par_gapfill_r(
        run_par_gapfill_func,
        working_df.copy(),
        file_name=os.path.basename(args.file),
        lat_deg=args.lat,
        long_deg=args.long,
        timezone_hour=args.tz,
    )

    print("\n[5/7] 执行 despiking...")
    despiked_df = run_despiking(par_result_df, args.despiking_z)

    print("\n[6/7] 执行 u*、gap filling 与 nighttime partitioning...")
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

    print("\n[7/7] 保存结果...")
    output_df, representatives = merge_results(
        preprocessed_df,
        despiked_df,
        par_result_df,
        flux_result_df,
    )
    output_df.to_csv(args.output, index=False)

    summary = {
        "outputColumns": list(output_df.columns),
        "representatives": {
            "nee": representatives.get("nee"),
            "h2o": representatives.get("h2o"),
            "le": representatives.get("le"),
            "h": representatives.get("h"),
        },
        "companionColumns": companion_columns,
    }
    print("__RESULT_JSON__:" + json.dumps(summary, ensure_ascii=False))

    print("\n" + "=" * 60)
    print("流程完成")
    print(f"  结果已保存至: {args.output}")
    print("=" * 60)


if __name__ == "__main__":
    main()
