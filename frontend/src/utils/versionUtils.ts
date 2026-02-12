/**
 * 版本相关的工具函数
 * 用于将英文版本备注/阶段类型转换为中文显示
 */

// 已知的英文 remark 到中文的映射
const REMARK_CN_MAP: Record<string, string> = {
  'Initial Import': '原始导入',
  'initial import': '原始导入',
  'Raw Import': '原始导入',
  'Filtered': '异常过滤',
  'Outlier Filtered': '异常值过滤',
};

// 阶段类型到中文标签的映射
const STAGE_LABEL_MAP: Record<string, string> = {
  'RAW': '原始导入',
  'FILTERED': '异常处理',
  'QC': '缺失插补',
};

/**
 * 将版本备注转换为中文显示
 * 如果备注是已知的英文字符串，则翻译为中文；否则原样返回
 */
export const translateRemark = (remark?: string | null): string => {
  if (!remark) return '';
  return REMARK_CN_MAP[remark] || remark;
};

/**
 * 获取阶段类型的中文标签
 */
export const getStageLabel = (stageType: string): string => {
  return STAGE_LABEL_MAP[stageType] || stageType;
};

/**
 * 获取版本的显示名称（优先使用翻译后的备注，回退到阶段标签）
 */
export const getVersionDisplayName = (remark?: string | null, stageType?: string): string => {
  const translated = translateRemark(remark);
  if (translated) return translated;
  if (stageType) return getStageLabel(stageType);
  return '未知版本';
};
