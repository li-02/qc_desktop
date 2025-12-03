export interface BaseEntity {
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  is_del: number; // 0 or 1
}

export interface Site extends BaseEntity {
  id: number;
  site_name: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface Dataset extends BaseEntity {
  id: number;
  site_id: number;
  dataset_name: string;
  source_file_path?: string;
  import_time: string;
  description?: string;
}

export interface ColumnSetting extends BaseEntity {
  id: number;
  dataset_id: number;
  column_name: string;
  column_index?: number;
  data_type?: string;
  // 基础阈值
  min_threshold?: number;
  max_threshold?: number;
  // 物理阈值 (绝对边界)
  physical_min?: number;
  physical_max?: number;
  // 警告阈值 (软边界)
  warning_min?: number;
  warning_max?: number;
  // 元数据
  unit?: string;
  variable_type?: string;
  is_active: number; // 0 or 1
}

export interface DatasetVersion extends BaseEntity {
  id: number;
  dataset_id: number;
  parent_version_id?: number;
  stage_type: 'RAW' | 'FILTERED' | 'QC';
  file_path: string;
  remark?: string;
}

export interface StatVersionDetail extends BaseEntity {
  id: number;
  version_id: number;
  total_rows: number;
  total_cols: number;
  total_missing_count: number;
  total_outlier_count: number;
  column_stats_json?: string;
  calculated_at: string;
}

export interface ColumnStats {
  missing_count: number;
  outlier_count: number;
  min_val?: number;
  max_val?: number;
  mean_val?: number;
  std_dev?: number;
}

// ==================== 异常检测相关类型 ====================

/**
 * 异常检测配置作用域
 */
export type OutlierDetectionScopeType = 'APP' | 'SITE' | 'DATASET';

/**
 * 异常检测方法标识
 */
export type DetectionMethodId =
  | 'THRESHOLD_STATIC'
  | 'THRESHOLD_DYNAMIC'
  | 'ZSCORE'
  | 'MODIFIED_ZSCORE'
  | 'IQR'
  | 'DESPIKING_MAD'
  | 'DESPIKING_WINDOW'
  | 'ISOLATION_FOREST'
  | 'LOF'
  | 'AUTOENCODER';

/**
 * 异常值处理动作
 */
export type OutlierAction = 'FLAGGED' | 'REMOVED' | 'REPLACED';

/**
 * 检测结果状态
 */
export type OutlierResultStatus = 'PENDING' | 'APPLIED' | 'REVERTED';

/**
 * 异常检测配置表 (conf_outlier_detection)
 */
export interface OutlierDetectionConfig extends BaseEntity {
  id: number;
  scope_type: OutlierDetectionScopeType;
  scope_id?: number; // APP 时为 null
  column_name?: string; // null 表示全局默认
  detection_method: DetectionMethodId;
  method_params?: string; // JSON 格式的方法参数
  priority: number;
  is_active: number; // 0 or 1
}

/**
 * 异常检测结果表 (biz_outlier_result)
 */
export interface OutlierResult extends BaseEntity {
  id: number;
  version_id: number;
  detection_config_id?: number;
  column_name: string;
  detection_method: DetectionMethodId;
  outlier_indices?: string; // JSON 数组
  outlier_count: number;
  detection_params?: string; // 实际使用的参数
  executed_at: string;
  status: OutlierResultStatus;
}

/**
 * 异常值详情表 (biz_outlier_detail)
 */
export interface OutlierDetail extends BaseEntity {
  id: number;
  result_id: number;
  row_index: number;
  original_value?: number;
  action: OutlierAction;
  replaced_value?: number;
  is_confirmed: number; // 0 or 1
}

/**
 * 检测方法参数定义
 */
export interface DetectionMethodParam {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean';
  default: number | string | boolean;
  options?: { label: string; value: number | string }[];
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}

/**
 * 检测方法定义
 */
export interface DetectionMethod {
  id: DetectionMethodId;
  name: string;
  category: 'threshold' | 'statistical' | 'ml' | 'dl';
  description: string;
  params: DetectionMethodParam[];
  requiresPython: boolean;
  isAvailable: boolean;
}

/**
 * 阈值配置 (解析后的结果)
 */
export interface ResolvedThresholdConfig {
  columnName: string;
  minThreshold?: number;
  maxThreshold?: number;
  physicalMin?: number;
  physicalMax?: number;
  warningMin?: number;
  warningMax?: number;
  unit?: string;
  variableType?: string;
  source: OutlierDetectionScopeType;
}

/**
 * 检测结果统计
 */
export interface DetectionResultStats {
  total: number;
  outlierCount: number;
  outlierRate: number;
  beforeStats: ColumnStats;
  afterStats?: ColumnStats;
}
