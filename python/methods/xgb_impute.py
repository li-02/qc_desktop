"""
XGBoost 模型推理脚本（缺失值插补）
功能：加载训练好的 XGBoost 模型（.pkl），对含缺失值的数据进行插补

使用示例:
    python xgb_impute.py \
        --model "models/XGBOOST/NEE/XGB_model.pkl" \
        --file "input.csv" \
        --target "co2_flux" \
        --output "imputed_output.csv" \
        --feature-columns "Ta,Ts,Rg,VPD,Precip,WS" \
        --time-col "record_time" \
        --add-time-features true \
        --column-mapping '{"co2_flux_user":"co2_flux","rg_user":"rg_1_1_2"}'

进度输出格式: [x/5] <描述>
结果输出格式: __RESULT_JSON__:<json>
"""

import argparse
import json
import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


# ──────────────────────────────────────────────────────────────────────────────
# 特征工程
# ──────────────────────────────────────────────────────────────────────────────

def add_time_features(df: pd.DataFrame, time_col: str) -> pd.DataFrame:
    """
    从时间列提取循环时间特征（sin/cos 编码，避免周期性跳变）。
    如果时间列不存在或解析失败，静默跳过，不影响后续流程。
    """
    if time_col not in df.columns:
        return df

    try:
        dt = pd.to_datetime(df[time_col], errors="coerce")
        if dt.isna().all():
            return df

        doy = dt.dt.dayofyear                         # 1–366
        hour = dt.dt.hour + dt.dt.minute / 60.0       # 0–24

        df = df.copy()
        df["sin_doy"]  = np.sin(2 * np.pi * doy  / 366)
        df["cos_doy"]  = np.cos(2 * np.pi * doy  / 366)
        df["sin_hour"] = np.sin(2 * np.pi * hour  / 24)
        df["cos_hour"] = np.cos(2 * np.pi * hour  / 24)
        df["month"]    = dt.dt.month
    except Exception:
        pass

    return df


def build_feature_matrix(
    df: pd.DataFrame,
    feature_cols: list[str],
    time_col: str,
    use_time_features: bool,
) -> pd.DataFrame:
    """
    构建特征矩阵：
    1. 选取指定特征列（列名不存在时警告并跳过）
    2. 可选地追加时间循环特征
    """
    existing = [c for c in feature_cols if c in df.columns]
    missing_cols = [c for c in feature_cols if c not in df.columns]
    if missing_cols:
        print(f"[WARNING] 以下特征列在数据中不存在，已忽略: {missing_cols}", flush=True)

    X = df[existing].copy() if existing else pd.DataFrame(index=df.index)

    if use_time_features:
        tmp = add_time_features(df, time_col)
        for feat in ["sin_doy", "cos_doy", "sin_hour", "cos_hour", "month"]:
            if feat in tmp.columns:
                X[feat] = tmp[feat].values

    return X


def apply_column_mapping(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    """
    根据列名映射对 DataFrame 进行列重命名。
    mapping 格式: {用户文件列名: 模型期望列名}
    只重命名存在于 DataFrame 中的列，不存在的跳过（不报错）。
    """
    if not mapping:
        return df
    rename_map = {user_col: model_col for user_col, model_col in mapping.items()
                  if user_col in df.columns and user_col != model_col}
    if rename_map:
        print(f"[INFO] 应用列名映射: {rename_map}", flush=True)
        df = df.rename(columns=rename_map)
    return df


# ──────────────────────────────────────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> None:
    import joblib  # 延迟导入，避免在 import 阶段报错影响帮助信息

    # 1. 加载数据
    print(f"[1/5] 正在加载数据: {args.file}", flush=True)
    if not os.path.exists(args.file):
        raise FileNotFoundError(f"数据文件未找到: {args.file}")
    df = pd.read_csv(args.file)

    # 应用列名映射（将用户文件列名重命名为模型期望列名）
    if args.column_mapping:
        try:
            mapping = json.loads(args.column_mapping)
            df = apply_column_mapping(df, mapping)
        except json.JSONDecodeError as e:
            raise ValueError(f"--column-mapping 参数不是有效的 JSON: {e}") from e

    if args.target not in df.columns:
        raise ValueError(f"目标列 '{args.target}' 不存在于数据文件中（已应用列名映射后）")

    # 2. 加载模型
    print(f"[2/5] 正在加载 XGBoost 模型: {args.model}", flush=True)
    if not os.path.exists(args.model):
        raise FileNotFoundError(f"模型文件未找到: {args.model}")
    model = joblib.load(args.model)

    # 3. 构建特征矩阵
    print("[3/5] 正在构建特征矩阵...", flush=True)

    # 解析特征列
    feature_cols: list[str] = []
    if args.feature_columns:
        feature_cols = [c.strip() for c in args.feature_columns.split(",") if c.strip()]

    # 若未指定特征列，则使用除目标列和时间列外的全部数值列
    if not feature_cols:
        feature_cols = [
            c for c in df.select_dtypes(include=[np.number]).columns
            if c != args.target
        ]
        print(f"[INFO] 未指定特征列，自动选取数值列: {feature_cols}", flush=True)

    use_time_features = args.add_time_features.lower() not in ("false", "0", "no")
    X_all = build_feature_matrix(df, feature_cols, args.time_col, use_time_features)

    # 4. 执行插补
    print("[4/5] 正在执行 XGBoost 插补...", flush=True)

    target_series = pd.to_numeric(df[args.target], errors="coerce")
    missing_mask = target_series.isna()
    missing_count = int(missing_mask.sum())

    if missing_count == 0:
        print("[INFO] 目标列无缺失值，跳过插补", flush=True)
        df.to_csv(args.output, index=False)
        result = {
            "success": True,
            "target_column": args.target,
            "missing_count": 0,
            "imputed_count": 0,
        }
        print(f"__RESULT_JSON__:{json.dumps(result, ensure_ascii=False)}", flush=True)
        return

    df_out = df.copy()

    # 只对有完整特征的缺失行执行预测
    X_missing = X_all[missing_mask]
    # 将特征列中的 NaN 用列均值填充（保持与训练时一致的简单策略）
    X_missing_filled = X_missing.fillna(X_missing.mean())

    try:
        preds = model.predict(X_missing_filled)
    except Exception as exc:
        raise RuntimeError(f"XGBoost 模型预测失败: {exc}") from exc

    # 回写预测值
    target_idx_list = df_out.index[missing_mask].tolist()
    imputed_count = 0
    for row_idx, pred_val in zip(target_idx_list, preds):
        if not np.isnan(pred_val):
            df_out.at[row_idx, args.target] = pred_val
            imputed_count += 1

    # 5. 保存结果
    print(f"[5/5] 正在保存结果: {args.output}", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    df_out.to_csv(args.output, index=False)

    result = {
        "success": True,
        "target_column": args.target,
        "missing_count": missing_count,
        "imputed_count": imputed_count,
    }
    print(f"插补完成: {imputed_count}/{missing_count} 个缺失值已填充", flush=True)
    print(f"__RESULT_JSON__:{json.dumps(result, ensure_ascii=False)}", flush=True)


# ──────────────────────────────────────────────────────────────────────────────
# CLI 入口
# ──────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="XGBoost 缺失值插补推理脚本",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--model",           required=True,  help="模型文件路径（.pkl）")
    parser.add_argument("--file",            required=True,  help="输入 CSV 数据文件路径")
    parser.add_argument("--target",          required=True,  help="目标插补列名")
    parser.add_argument("--output",          required=True,  help="输出 CSV 文件路径")
    parser.add_argument("--feature-columns", default="",     help="逗号分隔的特征列名；留空则自动选取所有数值列")
    parser.add_argument("--time-col",        default="record_time", help="时间列名")
    parser.add_argument("--add-time-features", default="true",
                        help="是否添加时间循环特征（sin/cos 编码）。可选值: true/false")
    parser.add_argument("--column-mapping",  default="",
                        help="列名映射 JSON 字符串，格式: {\"用户列名\": \"模型期望列名\"}。"
                             "用于将用户文件的列名映射到模型训练时使用的列名。")
    return parser.parse_args()


if __name__ == "__main__":
    try:
        run(parse_args())
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
