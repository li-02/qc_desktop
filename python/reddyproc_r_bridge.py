"""
REddyProc R 桥接脚本
通过 rpy2 直接调用 R 语言的 REddyProc 包进行 MDS 插补

版本要求:
    - Python >= 3.8
    - R >= 4.0
    - rpy2 == 3.5.16
    - REddyProc R包 >= 1.3.0

使用示例:
    python reddyproc_r_bridge.py \
        --file "data.csv" \
        --target "NEE" \
        --output "imputed_output.csv" \
        --lat 39.0 --long 116.0 --tz 8 \
        --rg-col "Rg" --tair-col "Tair" --vpd-col "VPD"
"""

import argparse
import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings('ignore')


def setup_embedded_r_environment():
    """
    自动检测并配置R环境（优先内嵌便携式R，其次系统安装的R）
    
    打包后的目录结构:
    - resources/
      - python/  (此脚本所在目录)
      - R/       (便携式R环境)
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. 检查内嵌的便携式R
    possible_r_paths = [
        os.path.join(script_dir, '..', 'R'),           # resources/R (打包后)
        os.path.join(script_dir, '..', 'R-Portable'),  # 开发时
        os.path.join(script_dir, '..', '..', 'R-Portable'),  # 项目根目录
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
        if sys.platform == 'win32':
            r_home = os.environ.get('R_HOME', '')
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

    for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
        for sub_key in [r'SOFTWARE\R-core\R', r'SOFTWARE\R-core\R64']:
            try:
                with winreg.OpenKey(hive, sub_key) as key:
                    install_path, _ = winreg.QueryValueEx(key, 'InstallPath')
                    if os.path.exists(os.path.join(install_path, 'bin')):
                        return install_path
            except (FileNotFoundError, OSError):
                continue

    for prog_dir in [os.environ.get('ProgramFiles', r'C:\Program Files'),
                     os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')]:
        r_base = os.path.join(prog_dir, 'R')
        if os.path.isdir(r_base):
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
        
        # 检查R版本
        r_version = ro.r('R.version.string')[0]
        print(f"  R版本: {r_version}")
        
        # 检查REddyProc包
        if not isinstalled('REddyProc'):
            return False, "REddyProc包未安装。请在R中运行: install.packages('REddyProc')"
        
        # 尝试加载REddyProc
        REddyProc = importr('REddyProc')
        print("  REddyProc包加载成功")
        
        return True, None
        
    except ImportError as e:
        return False, f"rpy2未安装或配置错误: {str(e)}"
    except Exception as e:
        return False, f"R环境检查失败: {str(e)}"


def calc_vpd_from_rh_tair(rh: np.ndarray, tair: np.ndarray) -> np.ndarray:
    """从相对湿度和气温计算VPD"""
    es = 6.112 * np.exp((17.67 * tair) / (tair + 243.5))
    ea = es * (rh / 100.0)
    vpd = es - ea
    return np.maximum(vpd, 0)


def prepare_data_for_reddyproc(df, time_col, target_col, rg_col, tair_col, vpd_col, rh_col=None):
    """
    准备数据格式以符合REddyProc要求
    
    REddyProc需要的时间格式: Year, DoY (Day of Year), Hour
    """
    result = df.copy()
    
    # 解析时间列
    if time_col in result.columns:
        try:
            result['_datetime'] = pd.to_datetime(result[time_col])
        except:
            raise ValueError(f"无法解析时间列 '{time_col}'")
    else:
        raise ValueError(f"时间列 '{time_col}' 不存在")
    
    # 创建REddyProc需要的时间字段
    result['Year'] = result['_datetime'].dt.year
    result['DoY'] = result['_datetime'].dt.dayofyear
    result['Hour'] = result['_datetime'].dt.hour + result['_datetime'].dt.minute / 60.0
    
    # 如果没有VPD但有rH，计算VPD
    if (vpd_col not in result.columns or result[vpd_col].isna().all()) and rh_col and rh_col in result.columns:
        print(f"  计算VPD (从 {rh_col} 和 {tair_col})...")
        result['VPD'] = calc_vpd_from_rh_tair(
            result[rh_col].values, 
            result[tair_col].values
        )
        vpd_col = 'VPD'
    
    # 重命名列以匹配REddyProc期望的名称
    rename_map = {}
    if target_col != 'NEE':
        rename_map[target_col] = 'NEE'
    if rg_col != 'Rg':
        rename_map[rg_col] = 'Rg'
    if tair_col != 'Tair':
        rename_map[tair_col] = 'Tair'
    if vpd_col != 'VPD':
        rename_map[vpd_col] = 'VPD'
    
    if rename_map:
        result = result.rename(columns=rename_map)
    
    # 记录原始列名映射
    col_mapping = {
        'target': target_col,
        'rg': rg_col,
        'tair': tair_col,
        'vpd': vpd_col
    }
    
    return result, col_mapping


def run_reddyproc_mds(df, lat_deg, long_deg, timezone_hour, fill_all=False, ustar_col=None, ustar_filtering=False):
    """
    使用rpy2调用REddyProc的sMDSGapFill方法
    """
    import rpy2.robjects as ro
    from rpy2.robjects import pandas2ri
    from rpy2.robjects.packages import importr
    from rpy2.robjects.conversion import localconverter
    
    # 激活pandas转换
    pandas2ri.activate()
    
    # 导入R包
    base = importr('base')
    REddyProc = importr('REddyProc')
    
    # 准备数据列
    required_cols = ['Year', 'DoY', 'Hour', 'NEE', 'Rg', 'Tair', 'VPD']
    if ustar_col and ustar_col in df.columns:
        required_cols.append('Ustar')
        if ustar_col != 'Ustar':
            df = df.rename(columns={ustar_col: 'Ustar'})
    
    # 只保留需要的列
    df_subset = df[required_cols].copy()
    
    # 将缺失值转换为NA (R的NA)
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
    if 'Ustar' in df_subset.columns:
        var_names.append('Ustar')
    
    EProc = REddyProc.sEddyProc_new(
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
    
    # 执行u*过滤（如果启用）
    if ustar_filtering and 'Ustar' in df_subset.columns:
        print("  执行u*过滤...")
        EProc.sEstimateUstarScenarios(
            nSample=100,
            probs=ro.FloatVector([0.05, 0.5, 0.95])
        )
        EProc.sSetUstarScenarios(
            UstarSuffixes=ro.StrVector(['U05', 'U50', 'U95'])
        )
    
    # 执行MDS插补
    print("  执行MDS插补...")
    if ustar_filtering and 'Ustar' in df_subset.columns:
        EProc.sMDSGapFillUStarScens(ro.StrVector(['NEE']))
    else:
        EProc.sMDSGapFill(
            ro.StrVector(['NEE']),
            FillAll=fill_all
        )
    
    # 导出结果
    print("  导出结果...")
    r_result = EProc.sExportResults()
    
    # 转换回pandas DataFrame
    with localconverter(ro.default_converter + pandas2ri.converter):
        result_df = ro.conversion.rpy2py(r_result)
    
    return result_df


def main():
    parser = argparse.ArgumentParser(description='REddyProc MDS 缺失值插补 (通过rpy2调用R)')
    
    # 必需参数
    parser.add_argument('--file', '-f', required=True, help='待插补的数据文件路径')
    parser.add_argument('--target', '-t', required=True, help='需要插补的目标列名')
    
    # 输出参数
    parser.add_argument('--output', '-o', default=None, help='输出文件路径')
    parser.add_argument('--time-col', default='TIMESTAMP', help='时间列名')
    
    # 位置信息
    parser.add_argument('--lat', type=float, required=True, help='站点纬度')
    parser.add_argument('--long', type=float, required=True, help='站点经度')
    parser.add_argument('--tz', type=int, required=True, help='时区')
    
    # 气象变量列映射
    parser.add_argument('--rg-col', default='Rg', help='全球辐射列名')
    parser.add_argument('--tair-col', default='Tair', help='气温列名')
    parser.add_argument('--vpd-col', default='VPD', help='VPD列名')
    parser.add_argument('--rh-col', default='', help='相对湿度列名')
    
    # 高级选项
    parser.add_argument('--ustar-col', default='', help='摩擦速度列名')
    parser.add_argument('--fill-all', type=lambda x: x.lower() == 'true', default=False, help='是否填充所有值')
    parser.add_argument('--ustar-filtering', type=lambda x: x.lower() == 'true', default=False, help='是否启用u*过滤')
    
    args = parser.parse_args()
    
    # 设置输出路径
    if args.output is None:
        base_name = os.path.splitext(args.file)[0]
        args.output = f"{base_name}_reddyproc_imputed.csv"
    
    print("=" * 60)
    print("REddyProc MDS 缺失值插补 (R直接调用)")
    print("=" * 60)
    print(f"数据文件: {args.file}")
    print(f"目标列: {args.target}")
    print(f"输出文件: {args.output}")
    print(f"站点位置: ({args.lat}°, {args.long}°), 时区: UTC{args.tz:+d}")
    print("=" * 60)
    
    # 1. 检查R环境
    print("\n[1/5] 检查R环境...")
    r_ok, r_error = check_r_environment()
    if not r_ok:
        print(f"  错误: {r_error}")
        sys.exit(1)
    
    # 2. 加载数据
    print("\n[2/5] 加载数据...")
    if not os.path.exists(args.file):
        print(f"  错误: 数据文件不存在: {args.file}")
        sys.exit(1)
    
    df = pd.read_csv(args.file)
    print(f"  数据形状: {df.shape}")
    
    # 检查目标列
    if args.target not in df.columns:
        print(f"  错误: 目标列 '{args.target}' 不存在")
        sys.exit(1)
    
    original_missing = df[args.target].isna().sum()
    print(f"  目标列缺失值数量: {original_missing}")
    
    if original_missing == 0 and not args.fill_all:
        print("  警告: 数据中没有缺失值，无需插补")
        df.to_csv(args.output, index=False)
        print(f"  结果已保存至: {args.output}")
        sys.exit(0)
    
    # 3. 准备数据
    print("\n[3/5] 准备数据格式...")
    try:
        prepared_df, col_mapping = prepare_data_for_reddyproc(
            df, args.time_col, args.target, 
            args.rg_col, args.tair_col, args.vpd_col, args.rh_col
        )
    except ValueError as e:
        print(f"  错误: {e}")
        sys.exit(1)
    
    # 4. 执行MDS插补
    print("\n[4/5] 执行REddyProc MDS插补...")
    try:
        result_df = run_reddyproc_mds(
            prepared_df,
            lat_deg=args.lat,
            long_deg=args.long,
            timezone_hour=args.tz,
            fill_all=args.fill_all,
            ustar_col=args.ustar_col if args.ustar_col else None,
            ustar_filtering=args.ustar_filtering
        )
    except Exception as e:
        print(f"  错误: REddyProc执行失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # 5. 合并结果并保存
    print("\n[5/5] 保存结果...")
    
    # 从REddyProc结果中提取填充后的值
    # REddyProc输出列名格式: NEE_f (填充值), NEE_fqc (质量标志)
    filled_col = 'NEE_f'
    if filled_col in result_df.columns:
        # 将填充值合并回原始数据
        df[args.target] = result_df[filled_col].values[:len(df)]
    
    # 保存结果
    df.to_csv(args.output, index=False)
    
    # 统计
    final_missing = df[args.target].isna().sum()
    
    print(f"\n" + "=" * 60)
    print("插补完成!")
    print(f"  原始缺失值数量: {original_missing}")
    print(f"  插补后缺失值数量: {final_missing}")
    print(f"  成功填补: {original_missing - final_missing} 个值")
    print(f"  结果已保存至: {args.output}")
    print("=" * 60)


if __name__ == '__main__':
    main()
