"""
时序模型插补脚本
支持 ARIMA、SARIMA、ETS 三种时序模型进行缺失值插补

使用示例:
    python timeseries_imputation.py \
        --method ARIMA \
        --file "data.csv" \
        --target "temperature" \
        --output "imputed_output.csv"
"""

import argparse
import json
import os
import sys
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings('ignore')


def detect_decimal_places(values):
    """检测数值的小数位数"""
    valid_values = values[~np.isnan(values)]
    if len(valid_values) == 0:
        return 2
    
    max_decimals = 0
    for val in valid_values[:1000]:
        str_val = f"{val:.10f}".rstrip('0')
        if '.' in str_val:
            decimals = len(str_val.split('.')[1])
            max_decimals = max(max_decimals, decimals)
    
    return min(max_decimals, 6)


def impute_arima(series, p=1, d=1, q=1, auto_select=True):
    """
    使用ARIMA模型插补缺失值
    
    Args:
        series: 包含缺失值的时间序列 (pandas Series)
        p: AR阶数
        d: 差分阶数
        q: MA阶数
        auto_select: 是否自动选择最优参数
    
    Returns:
        插补后的序列
    """
    from statsmodels.tsa.arima.model import ARIMA
    
    result = series.copy()
    missing_indices = series[series.isna()].index.tolist()
    
    if len(missing_indices) == 0:
        return result
    
    # 获取有效值用于模型训练
    valid_data = series.dropna()
    
    if len(valid_data) < 10:
        # 数据太少，使用线性插值回退
        return series.interpolate(method='linear')
    
    if auto_select:
        # 自动选择参数 (简化版auto_arima)
        best_aic = float('inf')
        best_order = (p, d, q)
        
        for test_p in range(0, min(4, p + 2)):
            for test_d in range(0, min(3, d + 2)):
                for test_q in range(0, min(4, q + 2)):
                    try:
                        model = ARIMA(valid_data, order=(test_p, test_d, test_q))
                        fitted = model.fit()
                        if fitted.aic < best_aic:
                            best_aic = fitted.aic
                            best_order = (test_p, test_d, test_q)
                    except:
                        continue
        
        p, d, q = best_order
        print(f"  自动选择参数: p={p}, d={d}, q={q}, AIC={best_aic:.2f}")
    
    # 对每个缺失值进行插补
    for idx in missing_indices:
        try:
            # 使用缺失点之前的数据训练模型
            pos = series.index.get_loc(idx)
            
            # 获取前面的有效数据
            train_data = series.iloc[:pos].dropna()
            
            if len(train_data) < 10:
                # 数据不足，尝试使用后面的数据
                train_data = series.iloc[pos+1:].dropna()
                if len(train_data) >= 10:
                    # 使用后向预测
                    train_data = train_data.iloc[::-1]
                    model = ARIMA(train_data, order=(p, d, q))
                    fitted = model.fit()
                    forecast = fitted.forecast(steps=1)
                    result.iloc[pos] = forecast.iloc[0]
                else:
                    # 使用全局均值
                    result.iloc[pos] = valid_data.mean()
            else:
                model = ARIMA(train_data, order=(p, d, q))
                fitted = model.fit()
                forecast = fitted.forecast(steps=1)
                result.iloc[pos] = forecast.iloc[0]
                
        except Exception as e:
            # 模型拟合失败，使用线性插值
            if pos > 0 and pos < len(series) - 1:
                prev_valid = series.iloc[:pos].dropna()
                next_valid = series.iloc[pos+1:].dropna()
                if len(prev_valid) > 0 and len(next_valid) > 0:
                    result.iloc[pos] = (prev_valid.iloc[-1] + next_valid.iloc[0]) / 2
                elif len(prev_valid) > 0:
                    result.iloc[pos] = prev_valid.iloc[-1]
                elif len(next_valid) > 0:
                    result.iloc[pos] = next_valid.iloc[0]
                else:
                    result.iloc[pos] = valid_data.mean()
            else:
                result.iloc[pos] = valid_data.mean()
    
    return result


def impute_sarima(series, p=1, d=1, q=1, P=1, D=1, Q=1, s=24, auto_select=True):
    """
    使用SARIMA模型插补缺失值
    
    Args:
        series: 包含缺失值的时间序列
        p, d, q: 非季节性ARIMA参数
        P, D, Q: 季节性ARIMA参数
        s: 季节性周期
        auto_select: 是否自动选择参数
    
    Returns:
        插补后的序列
    """
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    
    result = series.copy()
    missing_indices = series[series.isna()].index.tolist()
    
    if len(missing_indices) == 0:
        return result
    
    valid_data = series.dropna()
    
    if len(valid_data) < s * 2:
        # 数据不足以进行季节性分析，回退到ARIMA
        print(f"  数据长度({len(valid_data)})不足以进行季节性分析，回退到ARIMA")
        return impute_arima(series, p, d, q, auto_select)
    
    if auto_select:
        # 简化版自动参数选择
        best_aic = float('inf')
        best_order = (p, d, q)
        best_seasonal = (P, D, Q, s)
        
        # 限制搜索空间以提高速度
        for test_p in range(0, min(3, p + 2)):
            for test_q in range(0, min(3, q + 2)):
                for test_P in range(0, min(2, P + 1)):
                    for test_Q in range(0, min(2, Q + 1)):
                        try:
                            model = SARIMAX(
                                valid_data,
                                order=(test_p, d, test_q),
                                seasonal_order=(test_P, D, test_Q, s),
                                enforce_stationarity=False,
                                enforce_invertibility=False
                            )
                            fitted = model.fit(disp=False)
                            if fitted.aic < best_aic:
                                best_aic = fitted.aic
                                best_order = (test_p, d, test_q)
                                best_seasonal = (test_P, D, test_Q, s)
                        except:
                            continue
        
        p, d, q = best_order
        P, D, Q, s = best_seasonal
        print(f"  自动选择参数: ({p},{d},{q})x({P},{D},{Q},{s}), AIC={best_aic:.2f}")
    
    # 对每个缺失值进行插补
    for idx in missing_indices:
        try:
            pos = series.index.get_loc(idx)
            train_data = series.iloc[:pos].dropna()
            
            if len(train_data) < s * 2:
                # 数据不足，使用简单方法
                if pos > 0:
                    result.iloc[pos] = series.iloc[:pos].dropna().iloc[-1]
                else:
                    result.iloc[pos] = valid_data.mean()
                continue
            
            model = SARIMAX(
                train_data,
                order=(p, d, q),
                seasonal_order=(P, D, Q, s),
                enforce_stationarity=False,
                enforce_invertibility=False
            )
            fitted = model.fit(disp=False)
            forecast = fitted.forecast(steps=1)
            result.iloc[pos] = forecast.iloc[0]
            
        except Exception as e:
            # 回退到简单插值
            if pos > 0 and pos < len(series) - 1:
                prev_valid = series.iloc[:pos].dropna()
                next_valid = series.iloc[pos+1:].dropna()
                if len(prev_valid) > 0 and len(next_valid) > 0:
                    result.iloc[pos] = (prev_valid.iloc[-1] + next_valid.iloc[0]) / 2
                elif len(prev_valid) > 0:
                    result.iloc[pos] = prev_valid.iloc[-1]
                elif len(next_valid) > 0:
                    result.iloc[pos] = next_valid.iloc[0]
                else:
                    result.iloc[pos] = valid_data.mean()
            else:
                result.iloc[pos] = valid_data.mean()
    
    return result


def impute_ets(series, trend='add', seasonal='add', seasonal_periods=24):
    """
    使用ETS (指数平滑状态空间) 模型插补缺失值
    
    Args:
        series: 包含缺失值的时间序列
        trend: 趋势组件类型 ('add', 'mul', 'none'/None)
        seasonal: 季节性组件类型 ('add', 'mul', 'none'/None)
        seasonal_periods: 季节性周期
    
    Returns:
        插补后的序列
    """
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    
    result = series.copy()
    missing_indices = series[series.isna()].index.tolist()
    
    if len(missing_indices) == 0:
        return result
    
    valid_data = series.dropna()
    
    # 处理参数
    trend_param = None if trend == 'none' else trend
    seasonal_param = None if seasonal == 'none' else seasonal
    
    # 检查是否有足够数据进行季节性分析
    if seasonal_param and len(valid_data) < seasonal_periods * 2:
        print(f"  数据长度({len(valid_data)})不足以进行季节性分析，禁用季节性")
        seasonal_param = None
    
    # 检查数据是否全为正值（乘法模型需要）
    if (trend_param == 'mul' or seasonal_param == 'mul') and (valid_data <= 0).any():
        print("  数据包含非正值，切换到加法模型")
        if trend_param == 'mul':
            trend_param = 'add'
        if seasonal_param == 'mul':
            seasonal_param = 'add'
    
    for idx in missing_indices:
        try:
            pos = series.index.get_loc(idx)
            train_data = series.iloc[:pos].dropna()
            
            min_data_len = seasonal_periods * 2 if seasonal_param else 10
            
            if len(train_data) < min_data_len:
                # 数据不足
                if pos > 0:
                    prev_valid = series.iloc[:pos].dropna()
                    if len(prev_valid) > 0:
                        result.iloc[pos] = prev_valid.iloc[-1]
                    else:
                        result.iloc[pos] = valid_data.mean()
                else:
                    result.iloc[pos] = valid_data.mean()
                continue
            
            # 构建ETS模型
            if seasonal_param:
                model = ExponentialSmoothing(
                    train_data,
                    trend=trend_param,
                    seasonal=seasonal_param,
                    seasonal_periods=seasonal_periods,
                    initialization_method='estimated'
                )
            else:
                model = ExponentialSmoothing(
                    train_data,
                    trend=trend_param,
                    seasonal=None,
                    initialization_method='estimated'
                )
            
            fitted = model.fit(optimized=True)
            forecast = fitted.forecast(steps=1)
            result.iloc[pos] = forecast.iloc[0]
            
        except Exception as e:
            # 回退到简单方法
            if pos > 0 and pos < len(series) - 1:
                prev_valid = series.iloc[:pos].dropna()
                next_valid = series.iloc[pos+1:].dropna()
                if len(prev_valid) > 0 and len(next_valid) > 0:
                    result.iloc[pos] = (prev_valid.iloc[-1] + next_valid.iloc[0]) / 2
                elif len(prev_valid) > 0:
                    result.iloc[pos] = prev_valid.iloc[-1]
                elif len(next_valid) > 0:
                    result.iloc[pos] = next_valid.iloc[0]
                else:
                    result.iloc[pos] = valid_data.mean()
            else:
                result.iloc[pos] = valid_data.mean()
    
    return result


def load_data(file_path, target_col, time_col='record_time'):
    """加载CSV数据"""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"数据文件未找到: {file_path}")
    
    df = pd.read_csv(file_path)
    
    if target_col not in df.columns:
        raise ValueError(f"目标列 '{target_col}' 不存在")
    
    return df


def main():
    parser = argparse.ArgumentParser(description='时序模型插补 (ARIMA/SARIMA/ETS)')
    
    # 必需参数
    parser.add_argument('--method', '-m', required=True, 
                        choices=['ARIMA', 'SARIMA', 'ETS'],
                        help='插补方法')
    parser.add_argument('--file', '-f', required=True, 
                        help='待插补的数据文件路径')
    parser.add_argument('--target', '-t', required=True, 
                        help='需要插补的目标列名')
    
    # 可选参数
    parser.add_argument('--output', '-o', default=None, 
                        help='输出文件路径')
    parser.add_argument('--time-col', default='record_time', 
                        help='时间列名 (默认: record_time)')
    
    # ARIMA/SARIMA 参数
    parser.add_argument('--auto-select', type=lambda x: x.lower() == 'true',
                        default=True, help='是否自动选择参数')
    parser.add_argument('--p', type=int, default=1, help='AR阶数')
    parser.add_argument('--d', type=int, default=1, help='差分阶数')
    parser.add_argument('--q', type=int, default=1, help='MA阶数')
    
    # SARIMA 季节性参数
    parser.add_argument('--P', type=int, default=1, help='季节性AR阶数')
    parser.add_argument('--D', type=int, default=1, help='季节性差分阶数')
    parser.add_argument('--Q', type=int, default=1, help='季节性MA阶数')
    parser.add_argument('--s', type=int, default=24, help='季节性周期')
    
    # ETS 参数
    parser.add_argument('--trend', default='add', 
                        choices=['add', 'mul', 'none'],
                        help='趋势组件类型')
    parser.add_argument('--seasonal', default='add', 
                        choices=['add', 'mul', 'none'],
                        help='季节性组件类型')
    parser.add_argument('--seasonal-periods', type=int, default=24, 
                        help='季节性周期')
    
    args = parser.parse_args()
    
    # 设置输出路径
    if args.output is None:
        base_name = os.path.splitext(args.file)[0]
        args.output = f"{base_name}_imputed.csv"
    
    print("=" * 60)
    print(f"{args.method} 时序模型插补")
    print("=" * 60)
    print(f"数据文件: {args.file}")
    print(f"目标列: {args.target}")
    print(f"输出文件: {args.output}")
    print("=" * 60)
    
    # 1. 加载数据
    print("\n[1/3] 加载数据...")
    df = load_data(args.file, args.target, args.time_col)
    print(f"  数据形状: {df.shape}")
    
    # 获取目标列
    series = df[args.target].copy()
    original_missing = series.isna().sum()
    print(f"  缺失值数量: {original_missing}")
    
    if original_missing == 0:
        print("  警告: 数据中没有缺失值，无需插补")
        df.to_csv(args.output, index=False)
        print(f"  结果已保存至: {args.output}")
        return
    
    # 检测小数位数
    decimal_places = detect_decimal_places(series.values)
    
    # 2. 执行插补
    print(f"\n[2/3] 执行 {args.method} 插补...")
    
    if args.method == 'ARIMA':
        imputed_series = impute_arima(
            series,
            p=args.p,
            d=args.d,
            q=args.q,
            auto_select=args.auto_select
        )
    elif args.method == 'SARIMA':
        imputed_series = impute_sarima(
            series,
            p=args.p,
            d=args.d,
            q=args.q,
            P=args.P,
            D=args.D,
            Q=args.Q,
            s=args.s,
            auto_select=args.auto_select
        )
    elif args.method == 'ETS':
        imputed_series = impute_ets(
            series,
            trend=args.trend,
            seasonal=args.seasonal,
            seasonal_periods=args.seasonal_periods
        )
    
    # 保持原始精度
    imputed_series = imputed_series.round(decimal_places)
    
    # 3. 保存结果
    print("\n[3/3] 保存结果...")
    df[args.target] = imputed_series
    df.to_csv(args.output, index=False)
    
    # 统计信息
    imputed_missing = df[args.target].isna().sum()
    
    print(f"\n" + "=" * 60)
    print("插补完成!")
    print(f"  原始缺失值数量: {original_missing}")
    print(f"  插补后缺失值数量: {imputed_missing}")
    print(f"  成功填补: {original_missing - imputed_missing} 个值")
    print(f"  结果已保存至: {args.output}")
    print("=" * 60)


if __name__ == '__main__':
    main()
