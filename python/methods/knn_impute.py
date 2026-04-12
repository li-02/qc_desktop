"""
KNN 插补脚本（无需预训练模型）
功能：使用 K-近邻算法对指定列的缺失值进行插补，利用其他列的相关性推断缺失值

使用示例:
    python knn_impute.py \
        --file "input.csv" \
        --target "PM2_5" \
        --output "imputed_output.csv" \
        --n-neighbors 5

进度输出格式: [x/4] <描述>
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
# 主流程
# ──────────────────────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> None:
    from sklearn.impute import KNNImputer

    # 1. 加载数据
    print(f"[1/4] 正在加载数据: {args.file}", flush=True)
    if not os.path.exists(args.file):
        raise FileNotFoundError(f"数据文件未找到: {args.file}")
    df = pd.read_csv(args.file)

    if args.target not in df.columns:
        raise ValueError(f"目标列 '{args.target}' 不存在于数据文件中")

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

    # 2. 筛选数值列构建特征矩阵
    print("[2/4] 正在构建特征矩阵...", flush=True)

    # 排除非数值列（如时间列、字符串列），只保留数值型
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    # 确保目标列在数值列中
    if args.target not in numeric_cols:
        # 强制将目标列转为数值
        df[args.target] = target_series
        numeric_cols.append(args.target)

    # KNN 需要目标列和其他数值列一起参与计算
    df_numeric = df[numeric_cols].copy()

    # 确保目标列中的原始缺失值是 NaN
    df_numeric[args.target] = target_series

    print(
        f"[INFO] 使用 {len(numeric_cols)} 个数值列, "
        f"K={args.n_neighbors}, 缺失值数量={missing_count}",
        flush=True,
    )

    # 3. 执行 KNN 插补
    print(f"[3/4] 正在执行 KNN 插补 (K={args.n_neighbors})...", flush=True)

    imputer = KNNImputer(n_neighbors=args.n_neighbors, weights="distance")

    try:
        imputed_array = imputer.fit_transform(df_numeric)
    except Exception as exc:
        raise RuntimeError(f"KNN 插补失败: {exc}") from exc

    df_imputed = pd.DataFrame(imputed_array, columns=numeric_cols, index=df.index)

    # 只回写目标列中原本缺失的值
    df_out = df.copy()
    imputed_count = 0
    for idx in df_out.index[missing_mask]:
        val = df_imputed.at[idx, args.target]
        if not np.isnan(val):
            df_out.at[idx, args.target] = val
            imputed_count += 1

    # 4. 保存结果
    print(f"[4/4] 正在保存结果: {args.output}", flush=True)
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
        description="KNN 缺失值插补脚本（无需预训练模型）",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--file",         required=True, help="输入 CSV 数据文件路径")
    parser.add_argument("--target",       required=True, help="目标插补列名")
    parser.add_argument("--output",       required=True, help="输出 CSV 文件路径")
    parser.add_argument("--n-neighbors",  type=int, default=5, help="KNN 的 K 值")
    return parser.parse_args()


if __name__ == "__main__":
    try:
        run(parse_args())
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
