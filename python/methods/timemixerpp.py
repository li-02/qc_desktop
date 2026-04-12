"""
TimeMixerPP 模型推理脚本
功能：加载训练好的模型，对含缺失值的数据进行实际插补

使用示例:
    python inference.py \
        --model "models/yeyahu/pm2_5/TimeMixerPP_OVERALL_masks1_20251224_165333.pypots" \
        --file "../data/aqi/yeyahu/pm2_5_with_feat.csv" \
        --target "pm2_5" \
        --output "imputed_output.csv"
"""

import argparse
import os
import numpy as np
import pandas as pd
from pypots.imputation import TimeMixerPP


def load_and_prepare_data(file_path, target_col, time_col='record_time'):
    """
    加载数据文件，准备用于插补
    返回: 原始DataFrame, 数值数据数组, 时间序列, 列名列表, 目标列索引
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"数据文件未找到: {file_path}")
    
    df = pd.read_csv(file_path)
    original_df = df.copy()
    
    # 提取时间列
    time_series = None
    if time_col in df.columns:
        time_series = df[time_col].copy()
        df = df.drop(columns=[time_col])
    
    # 只保留数值列
    df_numeric = df.select_dtypes(include=[np.number])
    
    if target_col not in df_numeric.columns:
        raise ValueError(f"目标列 '{target_col}' 不存在于数值列中")
    
    # 将目标列移到最后
    cols = [c for c in df_numeric.columns if c != target_col] + [target_col]
    df_numeric = df_numeric[cols]
    
    data = df_numeric.values
    columns = df_numeric.columns.tolist()
    target_idx = columns.index(target_col)
    
    return original_df, data, time_series, columns, target_idx


def create_windowed_dataset_for_inference(data, seq_len):
    """
    对数据进行滑动窗口处理，用于模型输入
    返回: 窗口化数据, 窗口数量
    """
    n_samples, n_features = data.shape
    n_windows = n_samples - seq_len + 1
    
    if n_windows <= 0:
        raise ValueError(f"数据长度 ({n_samples}) 小于窗口长度 ({seq_len})，无法进行插补")
    
    windowed_data = np.zeros((n_windows, seq_len, n_features))
    
    for i in range(n_windows):
        windowed_data[i] = data[i : i + seq_len]
    
    return windowed_data, n_windows


def reconstruct_from_windows(imputed_windows, original_length, seq_len):
    """
    从滑动窗口结果重建完整序列
    使用重叠区域的平均值
    """
    n_windows, _, n_features = imputed_windows.shape
    
    # 累加器和计数器
    reconstructed = np.zeros((original_length, n_features))
    counts = np.zeros((original_length, 1))
    
    for i in range(n_windows):
        reconstructed[i : i + seq_len] += imputed_windows[i]
        counts[i : i + seq_len] += 1
    
    # 取平均
    reconstructed = reconstructed / counts
    
    return reconstructed


def normalize_data(data, mean=None, std=None):
    """标准化数据，返回标准化后的数据及其参数
    如果提供了 mean/std，则使用提供的参数；否则从数据计算
    """
    if mean is None or std is None:
        mean = np.nanmean(data, axis=0)
        std = np.nanstd(data, axis=0)
        std[std == 0] = 1.0
    
    data_norm = (data - mean) / std
    
    return data_norm, mean, std


def denormalize_data(data_norm, mean, std):
    """反标准化数据"""
    return data_norm * std + mean


def get_decimal_places(values):
    """
    检测数值数组中每列的小数位数
    返回每列的小数位数（基于非缺失值）
    """
    n_features = values.shape[1] if len(values.shape) > 1 else 1
    decimal_places = []
    
    for col_idx in range(n_features):
        col_data = values[:, col_idx] if n_features > 1 else values
        valid_values = col_data[~np.isnan(col_data)]
        
        if len(valid_values) == 0:
            decimal_places.append(2)  # 默认2位小数
            continue
        
        # 检测小数位数
        max_decimals = 0
        for val in valid_values[:1000]:  # 采样前1000个值
            str_val = f"{val:.10f}".rstrip('0')
            if '.' in str_val:
                decimals = len(str_val.split('.')[1])
                max_decimals = max(max_decimals, decimals)
        
        decimal_places.append(max_decimals)
    
    return decimal_places


def round_to_original_precision(imputed_data, original_data):
    """
    将插补后的数据四舍五入到原始数据的小数位精度
    """
    decimal_places = get_decimal_places(original_data)
    result = imputed_data.copy()
    
    for col_idx, decimals in enumerate(decimal_places):
        result[:, col_idx] = np.round(result[:, col_idx], decimals)
    
    return result


def compute_norm_params_from_file(file_path, target_col, time_col='record_time'):
    """从训练数据文件计算标准化参数"""
    df = pd.read_csv(file_path)
    if time_col in df.columns:
        df = df.drop(columns=[time_col])
    df = df.select_dtypes(include=[np.number])
    cols = [c for c in df.columns if c != target_col] + [target_col]
    df = df[cols]
    data = df.values
    mean = np.nanmean(data, axis=0)
    std = np.nanstd(data, axis=0)
    std[std == 0] = 1.0
    return mean, std


def impute_data(model, data, seq_len, norm_mean=None, norm_std=None):
    """
    使用模型进行插补
    norm_mean/norm_std: 可选的标准化参数，若不提供则从推理数据计算
    """
    # 1. 检查数据中的缺失情况
    missing_mask = np.isnan(data)
    missing_count = np.sum(missing_mask)
    print(f"  数据中共有 {missing_count} 个缺失值")
    
    if missing_count == 0:
        print("  警告: 数据中没有缺失值，无需插补")
        return data.copy()
    
    # 2. 标准化
    data_norm, mean, std = normalize_data(data, norm_mean, norm_std)
    
    # 3. 滑动窗口
    windowed_data, n_windows = create_windowed_dataset_for_inference(data_norm, seq_len)
    print(f"  生成 {n_windows} 个滑动窗口 (窗口长度: {seq_len})")
    
    # 4. 构造输入格式
    test_set = {"X": windowed_data}
    
    # 5. 模型推理
    print("  正在进行插补...")
    imputation_result = model.impute(test_set)
    
    # 6. 重建完整序列
    reconstructed_norm = reconstruct_from_windows(
        imputation_result, 
        data.shape[0], 
        seq_len
    )
    
    # 7. 反标准化
    reconstructed = denormalize_data(reconstructed_norm, mean, std)
    
    # 8. 保持原始数据的小数位精度
    reconstructed = round_to_original_precision(reconstructed, data)
    
    return reconstructed


def main():
    parser = argparse.ArgumentParser(description='TimeMixerPP 模型推理插补')
    
    # 必需参数
    parser.add_argument('--model', '-m', required=True, 
                        help='训练好的模型文件路径 (.pypots 文件)')
    parser.add_argument('--file', '-f', required=True, 
                        help='待插补的数据文件路径')
    parser.add_argument('--target', '-t', required=True, 
                        help='需要插补的目标列名')
    
    # 可选参数
    parser.add_argument('--output', '-o', default=None, 
                        help='输出文件路径 (默认为原文件名_imputed.csv)')
    parser.add_argument('--time-col', default='record_time', 
                        help='时间列名 (默认: record_time)')
    parser.add_argument('--seq-len', type=int, default=96, 
                        help='滑动窗口长度 (必须与训练时一致, 默认: 96)')
    parser.add_argument('--device', default=None, 
                        help='运行设备 (cuda/cpu, 默认自动检测)')
    
    # 模型超参数 (必须与训练时一致)
    parser.add_argument('--n-layers', type=int, default=2, help='层数')
    parser.add_argument('--d-model', type=int, default=32, help='隐藏层维度')
    parser.add_argument('--d-ffn', type=int, default=64, help='FFN维度')
    parser.add_argument('--top-k', type=int, default=5, help='Top-K 频率')
    parser.add_argument('--n-heads', type=int, default=4, help='Attention 头数')
    parser.add_argument('--n-kernels', type=int, default=3, help='Inception Kernel 数量')
    parser.add_argument('--dropout', type=float, default=0.1, help='Dropout 率')
    parser.add_argument('--down-layers', type=int, default=3, help='下采样层数')
    parser.add_argument('--down-window', type=int, default=2, help='下采样窗口大小')
    
    # 标准化参数来源
    parser.add_argument('--train-file', default=None,
                        help='训练数据文件路径，用于计算标准化参数（推荐）')
    
    args = parser.parse_args()
    
    # 检查模型文件
    if not os.path.exists(args.model):
        print(f"错误: 模型文件不存在 -> {args.model}")
        return
    
    # 设置输出路径
    if args.output is None:
        base_name = os.path.splitext(args.file)[0]
        args.output = f"{base_name}_imputed.csv"
    
    print("=" * 60)
    print("TimeMixerPP 模型推理插补")
    print("=" * 60)
    print(f"模型文件: {args.model}")
    print(f"数据文件: {args.file}")
    print(f"目标列: {args.target}")
    print(f"输出文件: {args.output}")
    print(f"窗口长度: {args.seq_len}")
    print("=" * 60)
    
    # 1. 加载数据
    print("\n[1/4] 加载数据...")
    original_df, data, time_series, columns, target_idx = load_and_prepare_data(
        args.file, args.target, args.time_col
    )
    print(f"  数据形状: {data.shape}")
    print(f"  目标列索引: {target_idx}")
    
    # 2. 加载模型
    print("\n[2/4] 加载模型...")
    
    # 使用命令行参数创建模型实例
    model = TimeMixerPP(
        n_steps=args.seq_len,
        n_features=data.shape[1],
        n_layers=args.n_layers,
        d_model=args.d_model,
        d_ffn=args.d_ffn,
        top_k=args.top_k,
        n_heads=args.n_heads,
        n_kernels=args.n_kernels,
        dropout=args.dropout,
        channel_mixing=True,
        channel_independence=False,
        downsampling_layers=args.down_layers,
        downsampling_window=args.down_window,
        device=args.device,
        verbose=False
    )
    
    # 加载训练好的权重
    model.load(args.model)
    print("  模型加载成功!")
    
    # 2.5 计算标准化参数
    norm_mean, norm_std = None, None
    if args.train_file:
        print(f"  从训练数据计算标准化参数: {args.train_file}")
        norm_mean, norm_std = compute_norm_params_from_file(
            args.train_file, args.target, args.time_col
        )
    else:
        print("  警告: 未指定 --train-file，将使用推理数据自身计算标准化参数")
    
    # 3. 执行插补
    print("\n[3/4] 执行插补...")
    imputed_data = impute_data(model, data, args.seq_len, norm_mean, norm_std)
    
    # 4. 保存结果
    print("\n[4/4] 保存结果...")
    
    # 构建输出 DataFrame
    output_df = pd.DataFrame(imputed_data, columns=columns)
    
    # 恢复时间列
    if time_series is not None:
        output_df.insert(0, args.time_col, time_series.values)
    
    # 保存
    output_df.to_csv(args.output, index=False)
    print(f"  结果已保存至: {args.output}")
    
    # 统计信息
    original_missing = np.sum(np.isnan(data[:, target_idx]))
    imputed_missing = np.sum(np.isnan(imputed_data[:, target_idx]))
    
    print("\n" + "=" * 60)
    print("插补完成!")
    print(f"  原始缺失值数量: {original_missing}")
    print(f"  插补后缺失值数量: {imputed_missing}")
    print(f"  成功填补: {original_missing - imputed_missing} 个值")
    print("=" * 60)


if __name__ == '__main__':
    main()
