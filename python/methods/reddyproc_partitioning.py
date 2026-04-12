"""
REddyProc 通量分割脚本
通过 rpy2 调用 R 语言的 REddyProc 包进行通量分割 (Flux Partitioning)

支持的分割方法:
    - Nighttime (Reichstein et al. 2005): sMRFluxPartition
    - Daytime (Lasslop et al. 2010): sGLFluxPartition

版本要求:
    - Python >= 3.8
    - R >= 4.0
    - rpy2 == 3.5.16
    - REddyProc R包 >= 1.3.0

使用示例:
    python reddyproc_partitioning.py \
        --file "data.csv" \
        --output "partitioned_output.csv" \
        --method nighttime \
        --lat 39.0 --long 116.0 --tz 8 \
        --nee-col "NEE" --rg-col "Rg" --tair-col "Tair" --vpd-col "VPD"
"""

import argparse
import json
import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings('ignore')


def setup_embedded_r_environment():
    """
    自动检测并配置R环境（优先内嵌便携式R，其次系统安装的R）
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # 1. 检查内嵌的便携式R
    possible_r_paths = [
        os.path.join(script_dir, '..', 'R'),
        os.path.join(script_dir, '..', 'R-Portable'),
        os.path.join(script_dir, '..', '..', 'R-Portable'),
    ]

    for r_path in possible_r_paths:
        r_path = os.path.normpath(r_path)
        r_bin = os.path.join(r_path, 'bin')

        if os.path.exists(r_bin):
            os.environ['R_HOME'] = r_path
            r_bin_path = os.path.join(r_bin, 'x64') if os.path.exists(os.path.join(r_bin, 'x64')) else r_bin
            current_path = os.environ.get('PATH', '')
            if r_bin_path not in current_path:
                os.environ['PATH'] = r_bin_path + os.pathsep + current_path
            print(f"  使用内嵌R环境: {r_path}")
            return True

    print("  未找到内嵌R环境，尝试使用系统R...")

    # 2. 如果已设置 R_HOME 则直接使用
    if os.environ.get('R_HOME') and os.path.exists(os.path.join(os.environ['R_HOME'], 'bin')):
        print(f"  使用已配置的R_HOME: {os.environ['R_HOME']}")
        _add_r_to_path(os.environ['R_HOME'])
        _setup_r_libs_user()
        return True

    # 3. 在 Windows 上从注册表或常见路径查找系统R
    if sys.platform == 'win32':
        system_r = _find_system_r_windows()
        if system_r:
            os.environ['R_HOME'] = system_r
            _add_r_to_path(system_r)
            _setup_r_libs_user()
            print(f"  使用系统R: {system_r}")
            return True

    return False


def _add_r_to_path(r_home):
    """将R的bin目录添加到PATH"""
    r_bin = os.path.join(r_home, 'bin')
    r_bin_path = os.path.join(r_bin, 'x64') if os.path.exists(os.path.join(r_bin, 'x64')) else r_bin
    current_path = os.environ.get('PATH', '')
    if r_bin_path not in current_path:
        os.environ['PATH'] = r_bin_path + os.pathsep + current_path


def _setup_r_libs_user():
    """设置R用户库路径，确保能找到用户安装的R包"""
    if not os.environ.get('R_LIBS_USER'):
        user_home = os.path.expanduser('~')
        # Windows 下 R 用户库的默认路径
        if sys.platform == 'win32':
            r_home = os.environ.get('R_HOME', '')
            # 从R_HOME中提取主版本号 (如 R-4.4.2 -> 4.4)
            r_version = ''
            r_base = os.path.basename(r_home)
            if r_base.startswith('R-'):
                parts = r_base[2:].split('.')
                if len(parts) >= 2:
                    r_version = f"{parts[0]}.{parts[1]}"
            if r_version:
                user_lib = os.path.join(user_home, 'R', 'win-library', r_version)
            else:
                user_lib = os.path.join(user_home, 'R', 'win-library')
            os.environ['R_LIBS_USER'] = user_lib


def _find_system_r_windows():
    """在 Windows 上查找系统安装的R"""
    import winreg

    # 从注册表查找
    for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
        for sub_key in [r'SOFTWARE\R-core\R', r'SOFTWARE\R-core\R64']:
            try:
                with winreg.OpenKey(hive, sub_key) as key:
                    install_path, _ = winreg.QueryValueEx(key, 'InstallPath')
                    if os.path.exists(os.path.join(install_path, 'bin')):
                        return install_path
            except (FileNotFoundError, OSError):
                continue

    # 从常见安装路径查找
    for prog_dir in [os.environ.get('ProgramFiles', r'C:\Program Files'),
                     os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')]:
        r_base = os.path.join(prog_dir, 'R')
        if os.path.isdir(r_base):
            # 按版本号倒序排列，优先使用最新版本
            versions = sorted(
                [d for d in os.listdir(r_base) if os.path.isdir(os.path.join(r_base, d, 'bin'))],
                reverse=True
            )
            if versions:
                return os.path.join(r_base, versions[0])

    return None


# 在导入rpy2之前设置R环境
setup_embedded_r_environment()


def check_r_environment():
    """检查R环境和REddyProc包是否可用"""
    try:
        import rpy2.robjects as ro
        from rpy2.robjects.packages import importr, isinstalled

        r_version = ro.r('R.version.string')[0]
        print(f"  R版本: {r_version}")

        if not isinstalled('REddyProc'):
            return False, "REddyProc包未安装。请在R中运行: install.packages('REddyProc')"

        REddyProc = importr('REddyProc')
        print("  REddyProc包加载成功")

        return True, None

    except ImportError as e:
        return False, f"rpy2未安装或配置错误: {str(e)}"
    except Exception as e:
        return False, f"R环境检查失败: {str(e)}"


def calc_vpd_from_rh_tair(rh, tair):
    """从相对湿度和气温计算VPD (hPa)"""
    es = 6.112 * np.exp((17.67 * tair) / (tair + 243.5))
    ea = es * (rh / 100.0)
    vpd = es - ea
    return np.maximum(vpd, 0)


def prepare_data_for_reddyproc(df, time_col, nee_col, rg_col, tair_col, vpd_col,
                                rh_col=None, ustar_col=None):
    """
    准备数据格式以符合REddyProc要求
    REddyProc需要的时间格式: Year, DoY (Day of Year), Hour
    """
    result = df.copy()

    # 解析时间列
    if time_col in result.columns:
        try:
            result['_datetime'] = pd.to_datetime(result[time_col])
        except Exception:
            raise ValueError(f"无法解析时间列 '{time_col}'")
    else:
        raise ValueError(f"时间列 '{time_col}' 不存在")

    # 创建REddyProc需要的时间字段
    result['Year'] = result['_datetime'].dt.year
    result['DoY'] = result['_datetime'].dt.dayofyear
    result['Hour'] = result['_datetime'].dt.hour + result['_datetime'].dt.minute / 60.0

    # 如果没有VPD但有rH，计算VPD
    actual_vpd_col = vpd_col
    if (vpd_col not in result.columns or result[vpd_col].isna().all()) and rh_col and rh_col in result.columns:
        print(f"  计算VPD (从 {rh_col} 和 {tair_col})...")
        result['VPD_calc'] = calc_vpd_from_rh_tair(
            result[rh_col].values.astype(float),
            result[tair_col].values.astype(float)
        )
        actual_vpd_col = 'VPD_calc'

    # 重命名列以匹配REddyProc期望的名称
    rename_map = {}
    if nee_col != 'NEE':
        rename_map[nee_col] = 'NEE'
    if rg_col != 'Rg':
        rename_map[rg_col] = 'Rg'
    if tair_col != 'Tair':
        rename_map[tair_col] = 'Tair'
    if actual_vpd_col != 'VPD':
        rename_map[actual_vpd_col] = 'VPD'
    if ustar_col and ustar_col != 'Ustar' and ustar_col in result.columns:
        rename_map[ustar_col] = 'Ustar'

    if rename_map:
        result = result.rename(columns=rename_map)

    return result


def run_reddyproc_partitioning(df, method, lat_deg, long_deg, timezone_hour,
                                ustar_col=None, ustar_filtering=False):
    """
    使用rpy2调用REddyProc进行通量分割

    步骤:
    1. 创建sEddyProc对象
    2. Gap-fill NEE, Rg, Tair, VPD (分割前必须)
    3. 可选: u* 过滤
    4. 执行分割 (sMRFluxPartition 或 sGLFluxPartition)
    5. 导出结果
    """
    import rpy2.robjects as ro
    from rpy2.robjects import pandas2ri
    from rpy2.robjects.packages import importr
    from rpy2.robjects.conversion import localconverter

    pandas2ri.activate()

    base = importr('base')
    REddyProc = importr('REddyProc')

    # 准备数据列
    required_cols = ['Year', 'DoY', 'Hour', 'NEE', 'Rg', 'Tair', 'VPD']
    has_ustar = False
    if ustar_col and 'Ustar' in df.columns:
        required_cols.append('Ustar')
        has_ustar = True

    # 只保留需要的列
    available = [c for c in required_cols if c in df.columns]
    df_subset = df[available].copy()

    # 将缺失值和无穷值处理
    df_subset = df_subset.replace([np.inf, -np.inf], np.nan)

    # 转换为R数据框
    with localconverter(ro.default_converter + pandas2ri.converter):
        r_df = ro.conversion.py2rpy(df_subset)

    # 使用REddyProc的fConvertTimeToPosix转换时间
    print("  转换时间格式...")
    r_df_posix = REddyProc.fConvertTimeToPosix(
        r_df,
        ro.StrVector(['YDH']),
        Year=ro.StrVector(['Year']),
        Day=ro.StrVector(['DoY']),
        Hour=ro.StrVector(['Hour'])
    )

    # 创建sEddyProc对象
    print("  初始化sEddyProc...")
    var_names = ['NEE', 'Rg', 'Tair', 'VPD']
    if has_ustar:
        var_names.append('Ustar')

    EProc = REddyProc.sEddyProc.new(
        ro.StrVector(['Site']),
        r_df_posix,
        ro.StrVector(var_names)
    )

    # 设置位置信息
    print(f"  设置位置: ({lat_deg}°, {long_deg}°), 时区: UTC{timezone_hour:+d}")
    EProc.sSetLocationInfo(
        LatDeg=lat_deg,
        LongDeg=long_deg,
        TimeZoneHour=timezone_hour
    )

    # u* 过滤（如果启用）
    if ustar_filtering and has_ustar:
        print("  执行u*阈值估算...")
        EProc.sEstimateUstarScenarios(
            nSample=ro.IntVector([100]),
            probs=ro.FloatVector([0.05, 0.5, 0.95])
        )
        EProc.sSetUstarScenarios(
            UstarSuffixes=ro.StrVector(['U05', 'U50', 'U95'])
        )

    # Gap-fill 所有必需变量（分割前必须执行）
    print("  Gap-filling NEE...")
    if ustar_filtering and has_ustar:
        EProc.sMDSGapFillUStarScens(ro.StrVector(['NEE']))
    else:
        EProc.sMDSGapFill(ro.StrVector(['NEE']), FillAll=True)

    print("  Gap-filling Rg...")
    EProc.sMDSGapFill(ro.StrVector(['Rg']), FillAll=True)

    print("  Gap-filling Tair...")
    EProc.sMDSGapFill(ro.StrVector(['Tair']), FillAll=True)

    print("  Gap-filling VPD...")
    EProc.sMDSGapFill(ro.StrVector(['VPD']), FillAll=True)

    # 执行通量分割
    if method == 'nighttime':
        print("  执行夜间法分割 (Reichstein et al. 2005)...")
        EProc.sMRFluxPartition()
    elif method == 'daytime':
        print("  执行白天法分割 (Lasslop et al. 2010)...")
        EProc.sGLFluxPartition()
    else:
        raise ValueError(f"不支持的分割方法: {method}")

    # 导出结果
    print("  导出结果...")
    r_result = EProc.sExportResults()

    with localconverter(ro.default_converter + pandas2ri.converter):
        result_df = ro.conversion.rpy2py(r_result)

    return result_df


def main():
    parser = argparse.ArgumentParser(description='REddyProc 通量分割 (通过rpy2调用R)')

    # 必需参数
    parser.add_argument('--file', '-f', required=True, help='输入数据文件路径 (CSV)')
    parser.add_argument('--output', '-o', required=True, help='输出文件路径 (CSV)')
    parser.add_argument('--method', '-m', required=True, choices=['nighttime', 'daytime'],
                        help='分割方法: nighttime (Reichstein) 或 daytime (Lasslop)')

    # 时间列
    parser.add_argument('--time-col', default='TIMESTAMP', help='时间列名')

    # 位置信息
    parser.add_argument('--lat', type=float, required=True, help='站点纬度')
    parser.add_argument('--long', type=float, required=True, help='站点经度')
    parser.add_argument('--tz', type=int, required=True, help='时区 (如 8 表示 UTC+8)')

    # 变量列映射
    parser.add_argument('--nee-col', default='NEE', help='NEE列名')
    parser.add_argument('--rg-col', default='Rg', help='全球辐射列名')
    parser.add_argument('--tair-col', default='Tair', help='气温列名')
    parser.add_argument('--vpd-col', default='VPD', help='VPD列名')
    parser.add_argument('--rh-col', default='', help='相对湿度列名 (可选，用于计算VPD)')

    # 高级选项
    parser.add_argument('--ustar-col', default='', help='摩擦速度列名')
    parser.add_argument('--ustar-filtering', type=lambda x: x.lower() == 'true',
                        default=False, help='是否启用u*过滤')

    args = parser.parse_args()

    print("=" * 60)
    print("REddyProc 通量分割")
    print("=" * 60)
    print(f"数据文件: {args.file}")
    print(f"输出文件: {args.output}")
    print(f"分割方法: {args.method}")
    print(f"站点位置: ({args.lat}°, {args.long}°), 时区: UTC{args.tz:+d}")
    print(f"列映射: NEE={args.nee_col}, Rg={args.rg_col}, Tair={args.tair_col}, VPD={args.vpd_col}")
    print("=" * 60)

    # [1/5] 检查R环境
    print("\n[1/5] 检查R环境...")
    r_ok, r_error = check_r_environment()
    if not r_ok:
        print(f"  错误: {r_error}")
        sys.exit(1)

    # [2/5] 加载数据
    print("\n[2/5] 加载数据...")
    if not os.path.exists(args.file):
        print(f"  错误: 数据文件不存在: {args.file}")
        sys.exit(1)

    df = pd.read_csv(args.file)
    print(f"  数据形状: {df.shape}")

    # 检查必需列
    required = {
        'NEE': args.nee_col,
        'Rg': args.rg_col,
        'Tair': args.tair_col,
        'VPD': args.vpd_col,
    }
    for label, col in required.items():
        if col not in df.columns:
            # 如果VPD不存在但有RH列，可以计算
            if label == 'VPD' and args.rh_col and args.rh_col in df.columns:
                print(f"  警告: {label}列 '{col}' 不存在，将从RH计算")
                continue
            print(f"  错误: 必需列 '{col}' ({label}) 不存在于数据中")
            print(f"  可用列: {list(df.columns)}")
            sys.exit(1)

    # [3/5] 准备数据
    print("\n[3/5] 准备数据格式...")
    try:
        prepared_df = prepare_data_for_reddyproc(
            df, args.time_col, args.nee_col,
            args.rg_col, args.tair_col, args.vpd_col,
            rh_col=args.rh_col if args.rh_col else None,
            ustar_col=args.ustar_col if args.ustar_col else None,
        )
    except ValueError as e:
        print(f"  错误: {e}")
        sys.exit(1)

    # [4/5] 执行通量分割
    print(f"\n[4/5] 执行REddyProc通量分割 ({args.method})...")
    try:
        result_df = run_reddyproc_partitioning(
            prepared_df,
            method=args.method,
            lat_deg=args.lat,
            long_deg=args.long,
            timezone_hour=args.tz,
            ustar_col=args.ustar_col if args.ustar_col else None,
            ustar_filtering=args.ustar_filtering
        )
    except Exception as e:
        print(f"  错误: REddyProc执行失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # [5/5] 合并结果并保存
    print("\n[5/5] 保存结果...")

    # 将分割结果合并回原始数据
    output_df = df.copy()

    # REddyProc nighttime 输出列: Reco, GPP_f, GPP_fqc, ...
    # REddyProc daytime 输出列: Reco_DT, GPP_DT_f, GPP_DT_fqc, ...
    result_columns = list(result_df.columns)
    print(f"  REddyProc输出列: {result_columns}")

    # 收集分割相关的输出列
    partition_cols = []
    for col in result_columns:
        # 夜间法结果列
        if any(col.startswith(prefix) for prefix in ['Reco', 'GPP_f', 'GPP_fqc']):
            partition_cols.append(col)
        # 白天法结果列
        if any(col.startswith(prefix) for prefix in ['Reco_DT', 'GPP_DT']):
            partition_cols.append(col)
        # Gap-fill 结果列 (也有用)
        if any(col.startswith(prefix) for prefix in ['NEE_f', 'NEE_fqc',
                                                       'Rg_f', 'Tair_f', 'VPD_f']):
            partition_cols.append(col)

    # 去重
    partition_cols = list(dict.fromkeys(partition_cols))

    for col in partition_cols:
        if col in result_df.columns:
            values = result_df[col].values
            if len(values) >= len(output_df):
                output_df[col] = values[:len(output_df)]
            else:
                # 如果长度不匹配，用NaN填充
                padded = np.full(len(output_df), np.nan)
                padded[:len(values)] = values
                output_df[col] = padded

    # 保存结果
    output_df.to_csv(args.output, index=False)

    # 统计信息
    stats = {}
    if args.method == 'nighttime':
        gpp_col = 'GPP_f' if 'GPP_f' in output_df.columns else None
        reco_col = 'Reco' if 'Reco' in output_df.columns else None
    else:
        gpp_col = 'GPP_DT_f' if 'GPP_DT_f' in output_df.columns else None
        reco_col = 'Reco_DT' if 'Reco_DT' in output_df.columns else None

    if gpp_col and gpp_col in output_df.columns:
        gpp_data = output_df[gpp_col].dropna()
        stats['GPP'] = {
            'column': gpp_col,
            'count': int(len(gpp_data)),
            'mean': float(gpp_data.mean()) if len(gpp_data) > 0 else None,
            'std': float(gpp_data.std()) if len(gpp_data) > 0 else None,
            'min': float(gpp_data.min()) if len(gpp_data) > 0 else None,
            'max': float(gpp_data.max()) if len(gpp_data) > 0 else None,
        }

    if reco_col and reco_col in output_df.columns:
        reco_data = output_df[reco_col].dropna()
        stats['Reco'] = {
            'column': reco_col,
            'count': int(len(reco_data)),
            'mean': float(reco_data.mean()) if len(reco_data) > 0 else None,
            'std': float(reco_data.std()) if len(reco_data) > 0 else None,
            'min': float(reco_data.min()) if len(reco_data) > 0 else None,
            'max': float(reco_data.max()) if len(reco_data) > 0 else None,
        }

    print(f"\n" + "=" * 60)
    print("通量分割完成!")
    print(f"  方法: {args.method}")
    print(f"  输出列: {partition_cols}")
    if 'GPP' in stats:
        s = stats['GPP']
        print(f"  GPP ({s['column']}): mean={s['mean']:.4f}, std={s['std']:.4f}")
    if 'Reco' in stats:
        s = stats['Reco']
        print(f"  Reco ({s['column']}): mean={s['mean']:.4f}, std={s['std']:.4f}")
    print(f"  结果已保存至: {args.output}")
    print("=" * 60)

    # 输出JSON格式的统计信息（供程序解析）
    print(f"\n__RESULT_JSON__:{json.dumps({'outputColumns': partition_cols, 'stats': stats})}")


if __name__ == '__main__':
    main()
