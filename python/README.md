# Python ARIMA 插补脚本

本目录包含用于时间序列缺失值插补的Python脚本。

## 安装依赖

首先安装所需的Python包：

```bash
pip install -r requirements.txt
```

## 使用方法

### 命令行使用

```bash
python arima_imputation.py --file data.csv --column Temperature --missing-types "" "null" "NaN"
```

### 参数说明

- `--file`: 数据文件路径（支持CSV和Excel格式）
- `--column`: 要插补的列名
- `--missing-types`: 缺失值的表示形式（可以是空字符串、"null"、"NaN"等）
- `--order`: ARIMA模型参数 (p d q)，例如 `--order 1 1 1`
- `--auto-select`: 自动选择最优ARIMA参数（默认启用）

### 示例

```bash
# 使用自动参数选择进行ARIMA插补
python arima_imputation.py --file dataset.csv --column PM2.5 --missing-types "" "null"

# 手动指定ARIMA参数
python arima_imputation.py --file dataset.csv --column Temperature --order 2 1 1 --missing-types ""
```

## 输出

脚本会输出一个JSON格式的结果，包含：

- `success`: 是否成功
- `message`: 处理信息
- `output_file`: 输出文件路径
- `imputed_count`: 插补的缺失值数量
- `missing_rate`: 原始缺失率
- `statistics`: 统计信息
- `model_info`: ARIMA模型信息

## 注意事项

1. 数据必须是数值类型
2. 至少需要10个有效数据点才能训练ARIMA模型
3. 缺失率不应超过80%
4. 适用于时间序列数据

## 错误处理

如果脚本执行失败，会返回包含错误信息的JSON格式结果。常见错误包括：

- 缺少必要的Python库
- 数据文件格式不支持
- 列不存在
- 有效数据点太少
- ARIMA模型训练失败

## 集成使用

该脚本被Electron应用程序调用，通过子进程执行插补任务。 