"""
SAITS model inference script for missing-value imputation.

Loads a PyPOTS SAITS checkpoint plus the metadata produced by
`saits/saits-train.py`, applies the saved scaler, imputes windowed sequences,
and writes the original CSV back with only the requested target gaps filled.

Progress output format: [x/5] <message>
Result output format: __RESULT_JSON__:<json>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from pypots.imputation import SAITS

warnings.filterwarnings("ignore")


TIME_FEATURES = {"sin_hour", "cos_hour", "sin_doy", "cos_doy", "month"}


def parse_bool(raw: str | bool | None, default: bool = True) -> bool:
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() not in {"false", "0", "no", "off"}


def infer_metadata_path(model_path: str) -> str:
    path = Path(model_path)
    candidates = [
        path.with_name(f"{path.stem}_metadata.joblib"),
        path.with_suffix(".joblib"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError(
        f"未找到 SAITS metadata 文件，已尝试: {', '.join(str(c) for c in candidates)}"
    )


def add_time_features(df: pd.DataFrame, time_col: str) -> pd.DataFrame:
    if time_col not in df.columns:
        return df

    dt = pd.to_datetime(df[time_col], errors="coerce")
    if dt.isna().all():
        return df

    result = df.copy()
    hour = dt.dt.hour + dt.dt.minute / 60.0 + dt.dt.second / 3600.0
    doy = dt.dt.dayofyear
    result["sin_hour"] = np.sin(2 * np.pi * hour / 24)
    result["cos_hour"] = np.cos(2 * np.pi * hour / 24)
    result["sin_doy"] = np.sin(2 * np.pi * doy / 366)
    result["cos_doy"] = np.cos(2 * np.pi * doy / 366)
    result["month"] = dt.dt.month
    return result


def parse_column_mapping(raw: str) -> dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"--column-mapping 参数不是有效的 JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("--column-mapping 必须是 JSON 对象")
    return {str(k): str(v) for k, v in parsed.items() if str(k) and str(v)}


def ensure_model_columns(
    df: pd.DataFrame,
    feature_names: list[str],
    target_col: str,
    model_target_col: str,
    column_mapping: dict[str, str],
) -> pd.DataFrame:
    """
    Keep original user columns intact and add model-expected columns as needed.

    The UI currently stores mapping as {model_column: user_column}; older Python
    scripts also documented {user_column: model_column}. Supporting both keeps
    SAITS usable with existing saved mappings.
    """
    result = df.copy()

    if target_col in result.columns and model_target_col not in result.columns:
        result[model_target_col] = result[target_col]

    for model_col in feature_names:
        if model_col in result.columns:
            continue

        user_col = column_mapping.get(model_col)
        if user_col and user_col in result.columns:
            result[model_col] = result[user_col]
            continue

        reverse_matches = [user for user, expected in column_mapping.items() if expected == model_col]
        reverse_col = next((user for user in reverse_matches if user in result.columns), None)
        if reverse_col:
            result[model_col] = result[reverse_col]

    return result


def create_windows(data: np.ndarray, seq_len: int) -> np.ndarray:
    n_samples, n_features = data.shape
    n_windows = n_samples - seq_len + 1
    if n_windows <= 0:
        raise ValueError(f"数据长度 ({n_samples}) 小于 SAITS 窗口长度 ({seq_len})")

    windows = np.empty((n_windows, seq_len, n_features), dtype=np.float32)
    for i in range(n_windows):
        windows[i] = data[i : i + seq_len]
    return windows


def reconstruct_from_windows(windows: np.ndarray, original_length: int, seq_len: int) -> np.ndarray:
    n_windows, _, n_features = windows.shape
    acc = np.zeros((original_length, n_features), dtype=np.float64)
    counts = np.zeros((original_length, 1), dtype=np.float64)

    for i in range(n_windows):
        acc[i : i + seq_len] += windows[i]
        counts[i : i + seq_len] += 1

    counts[counts == 0] = 1
    return (acc / counts).astype(np.float32)


def get_decimal_places(values: pd.Series) -> int:
    valid_values = pd.to_numeric(values, errors="coerce").dropna().head(1000)
    decimals = 0
    for value in valid_values:
        text = f"{float(value):.10f}".rstrip("0").rstrip(".")
        if "." in text:
            decimals = max(decimals, len(text.split(".", 1)[1]))
    return decimals


def build_model(args: argparse.Namespace, n_steps: int, n_features: int) -> SAITS:
    return SAITS(
        n_steps=n_steps,
        n_features=n_features,
        n_layers=args.n_layers,
        d_model=args.d_model,
        n_heads=args.n_heads,
        d_k=args.d_k,
        d_v=args.d_v,
        d_ffn=args.d_ffn,
        dropout=args.dropout,
        attn_dropout=args.attn_dropout,
        diagonal_attention_mask=parse_bool(args.diagonal_attention_mask, True),
        ORT_weight=args.ort_weight,
        MIT_weight=args.mit_weight,
        batch_size=args.batch_size,
        epochs=1,
        patience=None,
        num_workers=0,
        device=args.device,
        saving_path=None,
        model_saving_strategy=None,
        verbose=False,
    )


def run(args: argparse.Namespace) -> None:
    print(f"[1/5] 正在加载数据: {args.file}", flush=True)
    if not os.path.exists(args.file):
        raise FileNotFoundError(f"数据文件未找到: {args.file}")
    if not os.path.exists(args.model):
        raise FileNotFoundError(f"模型文件未找到: {args.model}")

    metadata_path = args.metadata or infer_metadata_path(args.model)
    if not os.path.exists(metadata_path):
        raise FileNotFoundError(f"metadata 文件未找到: {metadata_path}")

    df = pd.read_csv(args.file)
    if args.target not in df.columns:
        raise ValueError(f"目标列 '{args.target}' 不存在于数据文件中")

    metadata = joblib.load(metadata_path)
    feature_names = [str(col) for col in metadata["feature_names"]]
    target_idx = int(metadata["target_idx"])
    seq_len = int(args.seq_len or metadata["seq_len"])
    model_target_col = feature_names[target_idx]

    column_mapping = parse_column_mapping(args.column_mapping)
    working_df = ensure_model_columns(df, feature_names, args.target, model_target_col, column_mapping)
    if TIME_FEATURES.intersection(feature_names):
        working_df = add_time_features(working_df, args.time_col)

    missing_features = [col for col in feature_names if col not in working_df.columns]
    if missing_features:
        raise ValueError(f"数据缺少 SAITS 模型所需特征列: {', '.join(missing_features)}")

    print(f"[2/5] 正在加载 SAITS 模型: {args.model}", flush=True)
    model = build_model(args, seq_len, len(feature_names))
    model.load(args.model)

    print("[3/5] 正在构建 SAITS 输入序列...", flush=True)
    data = working_df[feature_names].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=np.float32)
    mean = np.asarray(metadata["scaler_mean"], dtype=np.float32)
    scale = np.asarray(metadata["scaler_scale"], dtype=np.float32)
    scale = np.where((scale == 0) | np.isnan(scale), 1.0, scale).astype(np.float32)
    data_scaled = ((data - mean) / scale).astype(np.float32)
    windows = create_windows(data_scaled, seq_len)

    target_series = pd.to_numeric(df[args.target], errors="coerce")
    missing_mask = target_series.isna().to_numpy()
    missing_count = int(missing_mask.sum())

    if missing_count == 0:
        print("[INFO] 目标列无缺失值，跳过插补", flush=True)
        df.to_csv(args.output, index=False)
        result = {"success": True, "target_column": args.target, "missing_count": 0, "imputed_count": 0}
        print(f"__RESULT_JSON__:{json.dumps(result, ensure_ascii=False)}", flush=True)
        return

    print("[4/5] 正在执行 SAITS 插补...", flush=True)
    imputed_batches = []
    for start in range(0, len(windows), args.batch_size):
        batch = windows[start : start + args.batch_size]
        imputed_batches.append(model.impute({"X": batch}))
    imputed_windows = np.concatenate(imputed_batches, axis=0)
    reconstructed_scaled = reconstruct_from_windows(imputed_windows, len(df), seq_len)
    reconstructed_target = reconstructed_scaled[:, target_idx] * scale[target_idx] + mean[target_idx]

    decimals = get_decimal_places(df[args.target])
    df_out = df.copy()
    imputed_count = 0
    for row_idx in np.where(missing_mask)[0]:
        value = reconstructed_target[row_idx]
        if np.isfinite(value):
            df_out.at[row_idx, args.target] = round(float(value), decimals)
            imputed_count += 1

    print(f"[5/5] 正在保存结果: {args.output}", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    df_out.to_csv(args.output, index=False)

    result = {
        "success": True,
        "target_column": args.target,
        "missing_count": missing_count,
        "imputed_count": imputed_count,
        "metadata_path": metadata_path,
    }
    print(f"插补完成: {imputed_count}/{missing_count} 个缺失值已填充", flush=True)
    print(f"__RESULT_JSON__:{json.dumps(result, ensure_ascii=False)}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="SAITS 缺失值插补推理脚本",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--model", required=True, help="训练好的 SAITS .pypots 模型路径")
    parser.add_argument("--metadata", default="", help="训练时保存的 metadata.joblib 路径，留空则按模型文件名推断")
    parser.add_argument("--file", required=True, help="输入 CSV 数据文件路径")
    parser.add_argument("--target", required=True, help="目标插补列名")
    parser.add_argument("--output", required=True, help="输出 CSV 文件路径")
    parser.add_argument("--time-col", default="record_time", help="时间列名")
    parser.add_argument("--seq-len", type=int, default=0, help="滑动窗口长度，默认读取 metadata")
    parser.add_argument("--batch-size", type=int, default=32, help="推理批次大小")
    parser.add_argument("--device", default="cpu", help="运行设备，例如 cpu/cuda")
    parser.add_argument("--column-mapping", default="", help="列名映射 JSON")

    parser.add_argument("--n-layers", type=int, default=2)
    parser.add_argument("--d-model", type=int, default=128)
    parser.add_argument("--n-heads", type=int, default=8)
    parser.add_argument("--d-k", type=int, default=16)
    parser.add_argument("--d-v", type=int, default=16)
    parser.add_argument("--d-ffn", type=int, default=128)
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument("--attn-dropout", type=float, default=0.0)
    parser.add_argument("--diagonal-attention-mask", default="true")
    parser.add_argument("--ort-weight", type=int, default=1)
    parser.add_argument("--mit-weight", type=int, default=1)
    return parser.parse_args()


if __name__ == "__main__":
    try:
        run(parse_args())
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
