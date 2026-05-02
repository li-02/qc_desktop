/**
 * FLUXNET 体系标准列名中文映射
 * 数据来源: shared/static/indicators_filtered.csv
 */
const COLUMN_LABEL_MAP: Record<string, string> = {
  // 通量与气象基础变量
  Tau: "动量通量",
  qc_Tau: "动量通量质量标志",
  rand_err_Tau: "动量通量随机误差",
  H: "显热通量",
  qc_H: "显热通量质量标志",
  rand_err_H: "显热通量随机误差",
  LE: "潜热通量",
  qc_LE: "潜热通量质量标志",
  rand_err_LE: "潜热通量随机误差",
  co2_flux: "CO₂通量",
  qc_co2_flux: "CO₂通量质量标志",
  rand_err_co2_flux: "CO₂通量随机误差",
  h2o_flux: "H₂O通量",
  qc_h2o_flux: "H₂O通量质量标志",
  rand_err_h2o_flux: "H₂O通量随机误差",
  ch4_flux: "甲烷通量",
  qc_ch4_flux: "甲烷通量质量标志",
  rand_err_ch4_flux: "甲烷通量随机误差",

  // 储存项与移流项
  H_strg: "显热通量储存项",
  LE_strg: "潜热通量储存项",
  co2_strg: "CO₂通量储存项",
  h2o_strg: "H₂O通量储存项",
  ch4_strg: "甲烷通量储存项",
  "co2_v-adv": "CO₂垂直移流项",
  "h2o_v-adv": "H₂O垂直移流项",
  "ch4_v-adv": "甲烷垂直移流项",

  // 气体浓度
  co2_molar_density: "CO₂摩尔密度",
  co2_mole_fraction: "CO₂摩尔比",
  co2_mixing_ratio: "CO₂混合比",
  co2_time_lag: "CO₂滞后时间",
  co2_def_timelag: "CO₂滞后标志",
  h2o_molar_density: "H₂O摩尔密度",
  h2o_mole_fraction: "H₂O摩尔比",
  h2o_mixing_ratio: "H₂O混合比",
  h2o_time_lag: "H₂O滞后时间",
  h2o_def_timelag: "H₂O滞后标志",
  ch4_molar_density: "CH₄摩尔密度",
  ch4_mole_fraction: "CH₄摩尔比",
  ch4_mixing_ratio: "CH₄混合比",
  ch4_time_lag: "CH₄滞后时间",
  ch4_def_timelag: "CH₄滞后标志",

  // 大气状态
  sonic_temperature: "超声温度",
  air_temperature: "空气温度",
  air_pressure: "气压",
  air_density: "空气密度",
  air_heat_capacity: "空气热容",
  air_molar_volume: "空气摩尔体积",
  ET: "蒸散发",
  water_vapor_density: "水汽密度",
  e: "水汽分压",
  es: "饱和水汽分压",
  specific_humidity: "比湿",
  RH: "相对湿度",
  VPD: "饱和水汽压差",
  Tdew: "露点温度",

  // 风速风向
  u_unrot: "未旋转主风向风速",
  v_unrot: "未旋转侧风向风速",
  w_unrot: "未旋转垂直风速",
  u_rot: "旋转后主风向风速",
  v_rot: "旋转后侧风向风速",
  w_rot: "旋转后垂直风速",
  wind_speed: "平均风速",
  max_wind_speed: "最大瞬时风速",
  wind_dir: "风向",
  yaw: "偏航角旋转角度",
  pitch: "俯仰角旋转角度",
  roll: "翻滚角旋转角度",
  "u*": "摩擦速率",
  TKE: "湍流动能",
  L: "莫宁-奥布霍夫长度",
  "(z-d)/L": "莫宁-奥布霍夫稳定性参数",
  bowen_ratio: "波文比",
  "T*": "标度温度",

  // 碳足迹
  model: "碳足迹模型",
  x_peak: "通量贡献峰值上风向距离",
  x_offset: "累积通量贡献<1%上风向距离",
  "x_10%": "10%累积通量贡献上风向距离",
  "x_30%": "30%累积通量贡献上风向距离",
  "x_50%": "50%累积通量贡献上风向距离",
  "x_70%": "70%累积通量贡献上风向距离",
  "x_90%": "90%累积通量贡献上风向距离",

  // 修正前通量
  un_Tau: "未修正动量通量",
  Tau_scf: "动量通量频率响应修正系数",
  un_H: "未修正显热通量",
  H_scf: "显热通量频率响应修正系数",
  un_LE: "未修正潜热通量",
  LE_scf: "潜热通量频率响应修正系数",
  un_co2_flux: "未修正CO₂通量",
  co2_scf: "CO₂频率响应修正系数",
  un_h2o_flux: "未修正H₂O通量",
  h2o_scf: "H₂O频率响应修正系数",
  un_ch4_flux: "未修正甲烷通量",
  ch4_scf: "CH₄频率响应修正系数",

  // 质量控制统计
  spikes_hf: "变量异常值测试硬数据标志",
  amplitude_resolution_hf: "振幅分辨率硬数据标志",
  drop_out_hf: "变量漏失测试硬数据标志",
  absolute_limits_hf: "绝对限制硬数据标志",
  skewness_kurtosis_hf: "偏差和峰值硬数据标志",
  skewness_kurtosis_sf: "偏差和峰值测试软数据标志",
  discontinuities_hf: "非连续性测试硬数据标志",
  discontinuities_sf: "非连续性测试软数据标志",
  timelag_hf: "气体浓度滞后测试硬数据标志",
  timelag_sf: "气体浓度滞后测试软数据标志",
  attack_angle_hf: "风冲角测试硬数据标志",
  non_steady_wind_hf: "非平稳定性测试硬数据标志",

  // 异常值数量
  u_spikes: "主风向异常值数量",
  v_spikes: "侧风向异常值数量",
  w_spikes: "垂直风向异常值数量",
  ts_spikes: "超声温度异常值数量",
  co2_spikes: "CO₂异常值数量",
  h2o_spikes: "H₂O异常值数量",
  ch4_spikes: "CH₄异常值数量",

  // 方差与协方差
  u_var: "主风向方差",
  v_var: "侧风向方差",
  w_var: "垂直风向方差",
  ts_var: "超声温度方差",
  co2_var: "CO₂方差",
  h2o_var: "H₂O方差",
  ch4_var: "甲烷方差",
  "w/ts_cov": "垂直风速与超声温度协方差",
  "w/co2_cov": "垂直风速与CO₂协方差",
  "w/h2o_cov": "垂直风速与H₂O协方差",
  "w/ch4_cov": "垂直风速与甲烷协方差",

  // 均值
  co2_mean: "CO₂摩尔比均值",
  h2o_mean: "H₂O摩尔比均值",
  dew_point_mean: "平均露点温度",
  co2_signal_strength_7500_mean: "CO₂信号值",
  ch4_mean: "CH₄摩尔比均值",

  // 辐射
  ALB_1_1_1: "反照率",
  LWIN_1_1_1: "入射长波辐射",
  LWOUT_1_1_1: "反射长波辐射",
  PPFD_1_1_1: "入射光合有效辐射",
  PPFD_1_1_2: "向上光合有效辐射",
  PPFD_1_2_1: "光合有效辐射2",
  RN_1_1_1: "净辐射",
  RG_1_1_2: "总辐射",
  Rlnet_1_1_1: "长波净辐射",
  Rsnet_1_1_1: "短波净辐射",
  R_uva_1_1_1: "紫外辐射",
  SWDIF_1_1_1: "散射辐射",
  SWIN_1_1_1: "向下短波辐射",
  SWOUT_1_1_1: "向上短波辐射",
  LWOTRaw_1_1_1: "反射长波辐射（原始）",
  LWINRaw_1_1_1: "入射长波辐射（原始）",
  NETRAD: "净辐射",

  // 数采与电气
  PTemp_1_1_1: "数采温度",
  TRN_1_1_1: "净辐射表本体温度",
  VIN_1_1_1: "电压",
  SysPwr: "电压",
  TBOLE_1_1_1: "CNR4表体温度",

  // 降水
  P_RAIN_1_1_1: "下层降水量",
  P_RAIN_1_2_1: "上层降水量",

  // 湿度
  RH_1_1_1: "下层空气相对湿度",
  RH_1_2_1: "上层空气相对湿度",

  // 土壤
  SWC_1_1_1: "土壤含水量1",
  SWC_1_2_1: "土壤含水量2",
  SWC_1_3_1: "土壤含水量3",
  SWC_1_4_1: "土壤含水量4",
  SWC_1_5_1: "土壤含水量5",
  SWC_2_1_1: "土壤含水量2",
  SWC_3_1_1: "土壤含水量3",
  TS_1_1_1: "土壤温度1",
  TS_1_2_1: "土壤温度2",
  TS_1_3_1: "土壤温度3",
  TS_1_4_1: "土壤温度4",
  TS_1_5_1: "土壤温度5",
  TS_2_1_1: "土壤温度2",
  TS_3_1_1: "土壤温度3",

  // 气温
  TA_1_1_1: "下层空气温度",
  TA_1_2_1: "上层空气温度",

  // 风速风向（仪器层）
  WD_1_1_1: "下层风向",
  WD_1_2_1: "上层风向",
  WS_1_1_1: "下层风速",
  WS_1_2_1: "上层风速",
  WS_2_1_1: "风速",
  Suntime_1_1_1: "日照",

  // 大气污染
  SO2: "SO₂浓度",
  NO: "NO浓度",
  NOx: "NOₓ浓度",
  NO2: "NO₂浓度",
  CO: "CO浓度",
  O3: "O₃浓度",
  PM10: "PM10浓度",
  "PM2.5": "PM2.5浓度",
  Nai: "负氧离子个数",

  // 茎流（静态通道名）
  TC_dTCa: "TC温差均值",
  TC_dTM: "TC温差日最大值",
  TC_Vel: "茎流速率",
  TC_Flow: "茎流流量",
  TC_Status: "茎流状态",
  HtrV_Avg: "加热电压",
  Batt_Volt_Min: "电池电量最小值",
  PTemp_C_Max: "数采表面温度最大值",

  // 茎流（动态通道，1-20）
  ...Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [
      [`TC_dTCa(${i + 1})`, `第${i + 1}通道TC温差均值`],
      [`TC_dTM(${i + 1})`, `第${i + 1}通道TC温差最大值`],
      [`TC_Flow(${i + 1})`, `第${i + 1}通道茎流流量`],
      [`TC_Status(${i + 1})`, `第${i + 1}通道茎流状态`],
      [`HtrV_Avg(${i + 1})`, "加热电压"],
    ]).flat()
  ),
  ...Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [
      `TC_Vel(${i + 1})`,
      `第${i + 1}通道茎流速率`,
    ])
  ),

  // 水质
  water_temperature: "水温",
  electrical_conductivity: "电导率",
  ph: "PH值",
  ammonia_nitrogen: "氨氮",
  dissolved_oxygen: "溶解氧",
  total_dissolved_solids: "总溶解固体",
  blue_green_algae: "蓝绿藻",
  chlorophyl: "叶绿素",
  turbidity: "浊度",

  // FLUXNET 简化命名
  TA: "空气温度",
  TS: "土壤温度",
  MS: "土壤水分",
  EC: "电导率",
  WS: "风速",
  WD: "风向",
  RAIN: "降水",
  PAR: "光合有效辐射",
  RA: "太阳辐射",
  PRESS: "气压",

  // 其他带有意义的列名
  diagnostic_value: "诊断值",
  co2_signal_strength: "CO₂信号强度",
  anemometer_diag: "风速仪诊断值",
  u: "u风速",
  v: "v风速",
  w: "w风速",
  vin_sf_mean: "通量塔供电",
  filename: "原始数据文件名称",
  date: "日期",
  time: "时间",
  DOY: "日序",
  daytime: "昼/夜",
  file_records: "文件记录数",
  used_records: "使用记录数",

  // FLUXNET 间隙填充标准名
  NEE_VUT_REF: "净生态系统交换",
  TS_F_MDS_1: "土壤温度（插补）",
  SWC_F_MDS_1: "土壤含水量（插补）",
  VPD_F_MDS: "水汽压差（插补）",
  TA_F_MDS: "空气温度（插补）",
  SW_IN_F: "短波入射辐射（插补）",

  // 仪器诊断变量
  not_ready_LI7700: "LI-7700未完成启动诊断值",
  "not_ready_LI-7700": "LI-7700未完成启动诊断值",
  bad_temp_LI7700: "LI-7700温度异常诊断值",
  "bad_temp_LI-7700": "LI-7700温度异常诊断值",
  "detector_LI-7200": "LI-7200检测器诊断值",
  "t_out_LI-7200": "LI-7200测量室出口温度",
  "top_heater_on_LI-7700": "LI-7700顶部加热器开关诊断值",
  "laser_temp_unregulated_LI-7700": "LI-7700未调制激光温度诊断值",
  "bottom_heater_on_LI-7700": "LI-7700底部加热器开关诊断值",
  "aux_in_LI-7200": "LI-7200辅助输入变量",
  "sync_LI-7500": "LI-7500同步报错异常值数量",
  "motor_spinning_LI-7700": "LI-7700甲烷分析仪电机转速",
  "delta_p_LI-7200": "LI-7200测量室内外压差",
  "motor_failure_LI-7700": "LI-7700电机失效诊断值",
  "head_detect_LI-7200": "LI-7200测量室诊断值",
  "chopper_LI-7500": "LI-7500斩光轮报错异常值数量",
  "re_unlocked_LI-7700": "LI-7700参比室通道未锁定诊断值",
  "no_signal_LI-7700": "LI-7700无信号诊断值",
  "calibrating_LI-7700": "LI-7700标定状态诊断值",
  "chopper_LI-7200": "LI-7200斩波器诊断值",
  "pll_LI-7500": "PLL报错异常值数量",
  "pump_on_LI-7700": "LI-7700泵开关诊断值",
  "sync_LI-7200": "LI-7200同步性诊断值",
  "detector_LI-7500": "LI-7500检测器报错异常值数量",

  // 土壤热通量
  soilg_1_avg: "土壤热通量1",
  soilg_2_avg: "土壤热通量2",
  soilg_3_avg: "土壤热通量3",
  soilg_4_avg: "土壤热通量4",
  soilg_a_avg: "土壤热通量1",
  soilg_b_avg: "土壤热通量2",
  soilg_c_avg: "土壤热通量3",
  soilg_d_avg: "土壤热通量4",

  // 土壤含水量（扩展命名）
  swc_1_1_2: "土壤含水量2",
  swc_1_1_3: "土壤含水量3",
  swc_1_1_4: "土壤含水量4",
  swc_1_1_5: "土壤含水量5",
  vwc_1_avg: "土壤含水量1",
  vwc_2_avg: "土壤含水量2",
  vwc_3_avg: "土壤含水量3",
  vwc_4_avg: "土壤含水量4",
  vwc_a_avg: "土壤含水量1",
  vwc_b_avg: "土壤含水量2",
  vwc_c_avg: "土壤含水量3",
  vwc_d_avg: "土壤含水量4",
  vwc_e_avg: "土壤含水量5",

  // 土壤温度（扩展命名）
  ts_1_1_2: "土壤温度2",
  ts_1_1_3: "土壤温度3",
  ts_1_1_4: "土壤温度4",
  ts_1_1_5: "土壤温度5",
  t_109_1_avg: "土壤温度1",
  t_109_2_avg: "土壤温度2",
  t_109_3_avg: "土壤温度3",
  t_109_4_avg: "土壤温度4",
  t_109_a_avg: "土壤温度1",
  t_109_b_avg: "土壤温度3",
  t_109_c_avg: "土壤温度4",
  t_109_d_avg: "土壤温度5",
  t_109_e_avg: "土壤温度2",

  // 气温（多层）
  ta_1_3_1: "第三层空气温度",
  ta_1_4_1: "第四层空气温度",
  ta_1_5_1: "第五层空气温度",
  ta_2m_avg: "空气温度（2m高度）",
  ta_5m_avg: "空气温度（5m高度）",
  ta_8m_avg: "空气温度（8m高度）",
  ta_10m_avg: "空气温度（10m高度）",
  ta_12m_avg: "空气温度（12m高度）",
  ta_24m_avg: "空气温度（24m高度）",
  ta_1_5m_avg: "空气温度（1.5m高度）",

  // 相对湿度（多层）
  rh_1_3_1: "第三层空气相对湿度",
  rh_1_4_1: "第四层空气相对湿度",
  rh_1_5_1: "第五层空气相对湿度",
  rh_2m_avg: "空气相对湿度（2m高度）",
  rh_5m_avg: "空气相对湿度（5m高度）",
  rh_8m_avg: "空气相对湿度（8m高度）",
  rh_10m_avg: "空气相对湿度（10m高度）",
  rh_12m_avg: "空气相对湿度（12m高度）",
  rh_24m_avg: "空气相对湿度（24m高度）",
  rh_1_5m_avg: "空气相对湿度（1.5m高度）",

  // 风速风向（多层）
  ws_2m_avg: "下层风速（2m高度）",
  ws_12m_avg: "上层风速（12m高度）",
  ws_24m_avg: "上层风速（24m高度）",
  wd_avg: "上层风向（12m高度）",
  wd_2m_avg: "下层风向（2m高度）",
  wd_12m_avg: "上层风向（12m高度）",
  wind_dir_compass: "风向",

  // 辐射（扩展命名）
  short_dn_avg: "向上短波辐射",
  short_up_avg: "向下短波辐射",
  long_dn_avg: "向上长波辐射",
  long_up_avg: "入射长波辐射",
  long_dn_corr_avg: "向上长波辐射",
  long_up_corr_avg: "向下长波辐射",
  rn_avg: "净辐射",
  rs_net_avg: "短波净辐射",
  rl_net_avg: "长波净辐射",
  albedo_avg: "反照率",
  par_dn_avg: "反射光合有效辐射",
  par_up_avg: "入射光合有效辐射",
  par_down_avg: "反射光合有效辐射",

  // 气压
  p_avg: "气压",

  // 降水
  rain_mm_tot: "降水量1",
  rain_a_tot: "降水量1",
  rain_b_tot: "降水量2",

  // 其他气象
  cell_tmpr_lag_avg: "气室内温度",

  // 总悬浮颗粒物
  TSP: "总悬浮颗粒物",
};

/**
 * 获取列名的中文标签（FLUXNET标准）
 * 若存在映射则返回中文名，否则返回原始列名
 */
export function getColumnLabel(columnName: string): string {
  return COLUMN_LABEL_MAP[columnName] ?? columnName;
}

/**
 * 获取列名的完整显示标签
 * 格式: "中文名 (原始列名)"（有映射时），否则返回原始列名
 */
export function getColumnDisplayLabel(columnName: string): string {
  const zhName = COLUMN_LABEL_MAP[columnName];
  if (zhName) {
    return `${zhName} (${columnName})`;
  }
  return columnName;
}
