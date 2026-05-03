import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

PYTHON_DIR = Path(__file__).resolve().parents[1]
METHODS_DIR = PYTHON_DIR / "methods"
sys.path.insert(0, str(PYTHON_DIR))
sys.path.insert(0, str(METHODS_DIR))

from methods.beon_reddyproc_pipeline import (  # noqa: E402
    apply_qc_flag_filter,
    apply_storage_correction,
    ensure_columns,
    ensure_numeric,
    load_threshold_map,
    normalize_missing,
    parse_allowed_qc_flags,
    parse_bool,
)
from methods.reddyproc_flux_pipeline import calc_vpd_from_rh_tair, regularize_half_hourly  # noqa: E402
from methods.rf_impute import add_time_features as rf_add_time_features  # noqa: E402
from methods.rf_impute import apply_column_mapping as rf_apply_column_mapping  # noqa: E402
from methods.rf_impute import build_feature_matrix as rf_build_feature_matrix  # noqa: E402
from methods.xgb_impute import add_time_features as xgb_add_time_features  # noqa: E402
from methods.xgb_impute import apply_column_mapping as xgb_apply_column_mapping  # noqa: E402
from methods.xgb_impute import build_feature_matrix as xgb_build_feature_matrix  # noqa: E402


def test_parse_bool_能解析真假字符串和异常输入():
    assert parse_bool("true") is True
    assert parse_bool(" TRUE ") is True
    assert parse_bool("false") is False
    assert parse_bool("") is False
    assert parse_bool(None) is False


def test_normalize_missing_能把常见缺失标记转换为_nan():
    df = pd.DataFrame({"co2_flux": ["NaN", "nan", "", "-9999", "1.2"]})

    result = normalize_missing(df)

    assert result["co2_flux"].isna().tolist() == [True, True, True, False, False]


def test_ensure_columns_会补齐缺失列且不覆盖已有列():
    df = pd.DataFrame({"record_time": ["2025-01-01 00:00"], "co2_flux": [1.2]})

    ensure_columns(df, ["co2_flux", "h2o_flux"])

    assert "h2o_flux" in df.columns
    assert math.isnan(df.loc[0, "h2o_flux"])
    assert df.loc[0, "co2_flux"] == 1.2


def test_ensure_numeric_会把非数字值转成_nan():
    df = pd.DataFrame({"co2_flux": ["1.2", "bad"], "site": ["A", "B"]})

    ensure_numeric(df, ["co2_flux", "missing_col"])

    assert df["co2_flux"].tolist()[0] == 1.2
    assert math.isnan(df["co2_flux"].tolist()[1])
    assert df["site"].tolist() == ["A", "B"]


def test_parse_allowed_qc_flags_会清理空项():
    assert parse_allowed_qc_flags("0, 1, ,2") == ["0", "1", "2"]
    assert parse_allowed_qc_flags("") == []


def test_load_threshold_map_能解析阈值并拒绝损坏_json():
    raw = '{"co2_flux":{"lower":-20,"upper":40},"TA":{"lower":"-30","upper":"50"},"bad":1}'

    result = load_threshold_map(raw)

    assert result == {"co2_flux": {"lower": -20.0, "upper": 40.0}, "TA": {"lower": -30.0, "upper": 50.0}}
    assert load_threshold_map("") == {}
    with pytest.raises(ValueError):
        load_threshold_map("{broken")


def test_apply_qc_flag_filter_会按_qc_flag_置空目标列():
    df = pd.DataFrame({"co2_flux": [1.0, 2.0, 3.0], "qc_co2_flux": [0, 2, 1]})

    result = apply_qc_flag_filter(
        df,
        site_code="demo",
        allowed_qc_flags=["0", "1"],
        co2_flux_col="co2_flux",
        h2o_flux_col="",
        le_col="",
        h_col="",
        qc_co2_flux_col="qc_co2_flux",
        qc_h2o_flux_col="",
        qc_le_col="",
        qc_h_col="",
    )

    assert result["co2_flux_filter_label"].isna().tolist() == [False, True, False]


def test_apply_storage_correction_会加上储存项并保留无储存项场景():
    df = pd.DataFrame({"co2_flux_filter_label": [1.0, 2.0], "co2_strg": [0.1, -0.2]})

    corrected = apply_storage_correction(
        df,
        use_strg=True,
        co2_strg_col="co2_strg",
        h2o_strg_col="",
        le_strg_col="",
        h_strg_col="",
    )
    unchanged = apply_storage_correction(
        df,
        use_strg=False,
        co2_strg_col="co2_strg",
        h2o_strg_col="",
        le_strg_col="",
        h_strg_col="",
    )

    assert corrected["co2_flux_add_strg"].tolist() == pytest.approx([1.1, 1.8])
    assert unchanged["co2_flux_add_strg"].tolist() == [1.0, 2.0]


def test_calc_vpd_from_rh_tair_会计算非负_vpd():
    rh = np.array([50.0, 100.0, 120.0])
    tair = np.array([20.0, 20.0, 20.0])

    result = calc_vpd_from_rh_tair(rh, tair)

    assert result[0] > 0
    assert result[1] == pytest.approx(0)
    assert result[2] == pytest.approx(0)


def test_regularize_half_hourly_会补齐缺失半小时并去重():
    df = pd.DataFrame(
        {
            "DateTime": ["2025-01-01 00:01:00", "2025-01-01 01:00:00", "2025-01-01 01:00:00"],
            "co2_flux": [1.0, 2.0, 3.0],
        }
    )

    result = regularize_half_hourly(df)

    assert result["DateTime"].dt.strftime("%H:%M").tolist() == ["00:00", "00:30", "01:00"]
    assert result["co2_flux"].isna().tolist() == [False, True, False]


def test_rf_time_feature_和_feature_matrix_能处理时间特征与缺失列():
    df = pd.DataFrame(
        {
            "record_time": ["2025-01-01 00:00:00", "2025-01-01 12:00:00"],
            "TA": [10.0, 12.0],
            "RG": [100.0, 200.0],
        }
    )

    with_time = rf_add_time_features(df, "record_time")
    matrix = rf_build_feature_matrix(df, ["TA", "missing"], "record_time", True)

    assert {"sin_doy", "cos_doy", "sin_hour", "cos_hour"}.issubset(with_time.columns)
    assert list(matrix.columns) == ["TA", "sin_doy", "cos_doy", "sin_hour", "cos_hour"]


def test_xgb_time_feature_包含月份并支持列名映射():
    df = pd.DataFrame(
        {
            "record_time": ["2025-02-01 00:00:00"],
            "co2_flux_user": [1.2],
            "TA": [10.0],
        }
    )

    mapped = xgb_apply_column_mapping(df, {"co2_flux_user": "co2_flux"})
    matrix = xgb_build_feature_matrix(mapped, ["co2_flux"], "record_time", True)

    assert "co2_flux" in mapped.columns
    assert "month" in xgb_add_time_features(df, "record_time").columns
    assert list(matrix.columns) == ["co2_flux", "sin_doy", "cos_doy", "sin_hour", "cos_hour", "month"]


def test_rf_和_xgb_column_mapping_会忽略不存在列():
    df = pd.DataFrame({"co2_flux": [1.2]})

    assert rf_apply_column_mapping(df, {"missing": "co2_flux_model"}).columns.tolist() == ["co2_flux"]
    assert xgb_apply_column_mapping(df, {}).columns.tolist() == ["co2_flux"]
