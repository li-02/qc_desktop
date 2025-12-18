/**
 * 缺失值插补相关类型定义
 */

// ==================== 基础类型 ====================

/** 插补方法ID */
export type ImputationMethodId = 
  | 'MEAN' | 'MEDIAN' | 'MODE' | 'FORWARD_FILL' | 'BACKWARD_FILL'
  | 'LINEAR' | 'SPLINE' | 'POLYNOMIAL' | 'SEASONAL'
  | 'ARIMA' | 'SARIMA' | 'ETS'
  | 'KNN' | 'RANDOM_FOREST' | 'GRADIENT_BOOSTING' | 'MICE' | 'MISSFOREST'
  | 'LSTM' | 'GRU' | 'TRANSFORMER' | 'VAE' | 'GAIN';

/** 插补方法分类 */
export type ImputationCategory = 'basic' | 'statistical' | 'timeseries' | 'ml' | 'dl';

/** 插补结果状态 */
export type ImputationResultStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'APPLIED' | 'REVERTED';

/** 预估耗时 */
export type EstimatedTime = 'fast' | 'medium' | 'slow';

/** 准确度等级 */
export type AccuracyLevel = 'low' | 'medium' | 'high';

/** 执行阶段 */
export type ImputationStage = 'preparing' | 'training' | 'imputing' | 'validating' | 'saving';

// ==================== 配置接口 ====================

/** 插补方法配置 */
export interface ImputationMethod {
  id: number;
  methodId: ImputationMethodId;
  methodName: string;
  category: ImputationCategory;
  description: string;
  defaultParams?: Record<string, any>;
  requiresPython: boolean;
  isAvailable: boolean;
  estimatedTime?: EstimatedTime;
  accuracy?: AccuracyLevel;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

/** 插补方法参数定义 */
export interface ImputationMethodParam {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  label: string;
  defaultValue: any;
  min?: number;
  max?: number;
  options?: { value: any; label: string }[];
  description?: string;
  required?: boolean;
}

// ==================== 结果接口 ====================

/** 插补结果 */
export interface ImputationResult {
  id: number;
  datasetId: number;
  versionId: number;
  newVersionId?: number;
  methodId: ImputationMethodId;
  targetColumns: string[];
  methodParams?: Record<string, any>;
  totalMissing: number;
  imputedCount: number;
  imputationRate: number;
  executionTimeMs?: number;
  status: ImputationResultStatus;
  errorMessage?: string;
  executedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** 插补详情 */
export interface ImputationDetail {
  id: number;
  resultId: number;
  columnName: string;
  rowIndex: number;
  timePoint?: string;
  originalValue?: number | null;
  imputedValue: number;
  confidence?: number;
  imputationMethod?: string;
  neighborValues?: number[];
  isApplied: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 插补列统计 */
export interface ImputationColumnStat {
  id: number;
  resultId: number;
  columnName: string;
  missingCount: number;
  imputedCount: number;
  imputationRate: number;
  meanBefore?: number;
  meanAfter?: number;
  stdBefore?: number;
  stdAfter?: number;
  minImputed?: number;
  maxImputed?: number;
  avgConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

/** 插补模型 */
export interface ImputationModel {
  id: number;
  datasetId: number;
  methodId: ImputationMethodId;
  modelName?: string;
  modelPath?: string;
  modelParams?: Record<string, any>;
  trainingColumns: string[];
  trainingSamples: number;
  validationScore?: number;
  isActive: boolean;
  trainedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 请求/响应接口 ====================

/** 执行插补请求 */
export interface ExecuteImputationRequest {
  datasetId: number;
  versionId: number;
  methodId: ImputationMethodId;
  targetColumns: string[];
  params?: Record<string, any>;
}

/** 执行插补响应 */
export interface ExecuteImputationResponse {
  success: boolean;
  resultId?: number;
  message?: string;
  error?: string;
}

/** 插补进度事件 */
export interface ImputationProgressEvent {
  resultId: number;
  stage: ImputationStage;
  progress: number;  // 0-100
  message: string;
  currentColumn?: string;
  processedColumns?: number;
  totalColumns?: number;
  processedRows?: number;
  totalRows?: number;
  estimatedRemainingMs?: number;
}

/** 获取插补方法列表请求 */
export interface GetImputationMethodsRequest {
  category?: ImputationCategory;
  onlyAvailable?: boolean;
}

/** 获取插补结果列表请求 */
export interface GetImputationResultsRequest {
  datasetId: number;
  versionId?: number;
  status?: ImputationResultStatus;
  limit?: number;
  offset?: number;
}

/** 获取插补详情请求 */
export interface GetImputationDetailsRequest {
  resultId: number;
  columnName?: string;
  limit?: number;
  offset?: number;
}

/** 应用插补结果请求 */
export interface ApplyImputationRequest {
  resultId: number;
  createNewVersion?: boolean;
  versionRemark?: string;
}

/** 应用插补结果响应 */
export interface ApplyImputationResponse {
  success: boolean;
  newVersionId?: number;
  message?: string;
  error?: string;
}

/** 撤销插补结果请求 */
export interface RevertImputationRequest {
  resultId: number;
}

/** 取消插补执行请求 */
export interface CancelImputationRequest {
  resultId: number;
}

// ==================== 可视化数据接口 ====================

/** 对比数据点 */
export interface ComparisonDataPoint {
  index: number;
  timestamp?: string;
  original: number | null;
  imputed: number;
  confidence?: number;
  isMissing: boolean;
}

/** 列对比数据 */
export interface ColumnComparisonData {
  columnName: string;
  totalRows: number;
  missingCount: number;
  imputedCount: number;
  dataPoints: ComparisonDataPoint[];
  statistics: {
    meanBefore: number;
    meanAfter: number;
    stdBefore: number;
    stdAfter: number;
    minImputed: number;
    maxImputed: number;
  };
}

// ==================== 数据库行类型 ====================

/** 插补方法数据库行 */
export interface ImputationMethodRow {
  id: number;
  method_id: string;
  method_name: string;
  category: string;
  description: string | null;
  default_params: string | null;
  requires_python: number;
  is_available: number;
  estimated_time: string | null;
  accuracy: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
  is_del: number;
}

/** 插补结果数据库行 */
export interface ImputationResultRow {
  id: number;
  dataset_id: number;
  version_id: number;
  new_version_id: number | null;
  method_id: string;
  target_columns: string;
  method_params: string | null;
  total_missing: number;
  imputed_count: number;
  imputation_rate: number;
  execution_time_ms: number | null;
  status: string;
  error_message: string | null;
  executed_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_del: number;
}

/** 插补详情数据库行 */
export interface ImputationDetailRow {
  id: number;
  result_id: number;
  column_name: string;
  row_index: number;
  time_point: string | null;
  original_value: number | null;
  imputed_value: number;
  confidence: number | null;
  imputation_method: string | null;
  neighbor_values: string | null;
  is_applied: number;
  created_at: string;
  updated_at: string;
  is_del: number;
}

/** 插补列统计数据库行 */
export interface ImputationColumnStatRow {
  id: number;
  result_id: number;
  column_name: string;
  missing_count: number;
  imputed_count: number;
  imputation_rate: number;
  mean_before: number | null;
  mean_after: number | null;
  std_before: number | null;
  std_after: number | null;
  min_imputed: number | null;
  max_imputed: number | null;
  avg_confidence: number | null;
  created_at: string;
  updated_at: string;
  is_del: number;
}

/** 插补模型数据库行 */
export interface ImputationModelRow {
  id: number;
  dataset_id: number;
  method_id: string;
  model_name: string | null;
  model_path: string | null;
  model_params: string | null;
  training_columns: string | null;
  training_samples: number | null;
  validation_score: number | null;
  is_active: number;
  trained_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_del: number;
}
