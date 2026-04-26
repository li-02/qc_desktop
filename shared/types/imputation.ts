/**
 * 缺失值插补相关类型定义
 */

// ==================== 基础类型 ====================

/** 插补方法ID */
export type ImputationMethodId =
  | "MEAN"
  | "MEDIAN"
  | "MODE"
  | "FORWARD_FILL"
  | "BACKWARD_FILL"
  | "LINEAR"
  | "SPLINE"
  | "POLYNOMIAL"
  | "SEASONAL"
  | "MDS_REDDYPROC"
  | "XGBOOST"
  | "RANDOM_FOREST"
  | "ITRANSFORMER"
  | "SAITS"
  | "TIMEMIXER"
  | `CUSTOM_${string}`;

/** 插补方法分类 */
export type ImputationCategory = "basic" | "statistical" | "ml" | "dl" | "custom";

/** 插补结果状态 */
export type ImputationResultStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "APPLIED" | "REVERTED";

/** 预估耗时 */
export type EstimatedTime = "fast" | "medium" | "slow";

/** 准确度等级 */
export type AccuracyLevel = "low" | "medium" | "high";

/** 执行阶段 */
export type ImputationStage = "preparing" | "training" | "imputing" | "validating" | "saving" | "completed";

// ==================== 配置接口 ====================

/** 插补方法配置 */
export interface ImputationMethod {
  id: number;
  methodId: ImputationMethodId;
  methodName: string;
  category: ImputationCategory;
  description: string;
  requiresPython: boolean;
  isAvailable: boolean;
  estimatedTime?: EstimatedTime;
  accuracy?: AccuracyLevel;
  priority: number;
  applicableDataTypes: string[]; // 适用的数据类型
  icon?: string; // 方法图标
  createdAt: string;
  updatedAt: string;
}

/** 插补方法参数定义 */
export interface ImputationMethodParam {
  id: number;
  methodId: ImputationMethodId;
  paramKey: string;
  paramName: string;
  paramType: "number" | "select" | "boolean" | "range" | "string";
  defaultValue: string | null;
  minValue?: number;
  maxValue?: number;
  stepValue?: number;
  options?: string | null; // JSON字符串
  tooltip?: string;
  isRequired: boolean;
  isAdvanced: boolean;
  paramOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 插补方法参数选项 */
export interface ImputationMethodParamOption {
  label: string;
  value: number | string;
}

/** 插补方法参数配置（前端使用） */
export interface ImputationMethodParamConfig {
  key: string;
  label: string;
  type: "number" | "select" | "boolean" | "range";
  default: number | string | boolean;
  options?: ImputationMethodParamOption[];
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  advanced?: boolean; // 是否为高级参数
}

// ==================== 结果接口 ====================

/** 插补结果 */
export interface ImputationResult {
  id: number;
  datasetId: number;
  versionId: number;
  newVersionId?: number;
  methodId: ImputationMethodId;
  name?: string;
  targetColumns: string[];
  methodParams?: Record<string, any>;
  outputFilePath?: string;
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
  imputedRowIndices?: number[];
  imputedValues?: number[];
  createdAt: string;
  updatedAt: string;
}

/** 插补模型 */
export interface ImputationModel {
  id: number;
  datasetId?: number; // 数据集ID（可为空表示通用模型）
  methodId: ImputationMethodId;
  modelName?: string;
  modelPath?: string;
  modelParams?: Record<string, any>; // 模型超参数
  targetColumn?: string; // 目标插补列名
  featureColumns?: string[]; // 模型需要的特征列（包含目标列）
  timeColumn?: string; // 模型期望的时间列名（默认 record_time）
  columnMapping?: Record<string, string>; // 列名映射（用户文件列名 → 模型期望列名）
  trainingColumns?: string[]; // 训练使用的列（兼容旧字段）
  trainingSamples?: number;
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
  targetColumns: string[] | null; // null表示全部列
  params?: Record<string, any>;
  validateSplit?: number; // 验证集比例（0-0.3）
  columnMapping?: Record<string, string>; // 列名映射（用户文件列名 → 模型期望列名）
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
  progress: number; // 0-100
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
  requires_python: number;
  is_available: number;
  estimated_time: string | null;
  accuracy: string | null;
  priority: number;
  applicable_data_types: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
  is_del: number;
}

/** 插补方法参数数据库行 */
export interface ImputationMethodParamRow {
  id: number;
  method_id: string;
  param_key: string;
  param_name: string;
  param_type: string;
  default_value: string | null;
  min_value: number | null;
  max_value: number | null;
  step_value: number | null;
  options: string | null;
  tooltip: string | null;
  is_required: number;
  is_advanced: number;
  param_order: number;
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
  name: string | null;
  target_columns: string;
  method_params: string | null;
  output_file_path: string | null;
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
  imputed_row_indices: string | null;
  imputed_values: string | null;
  created_at: string;
  updated_at: string;
  is_del: number;
}

/** 插补模型数据库行 */
export interface ImputationModelRow {
  id: number;
  dataset_id: number | null;
  method_id: string;
  model_name: string | null;
  model_path: string | null;
  model_params: string | null;
  target_column: string | null;
  feature_columns: string | null;
  time_column: string | null;
  column_mapping: string | null; // JSON对象: {用户列名: 模型期望列名}
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

// ==================== 自定义模型注册 ====================

/** 自定义模型参数定义 */
export interface CustomModelParamDef {
  paramKey: string;
  paramName: string;
  paramType: "number" | "select" | "boolean" | "string";
  defaultValue: string;
  minValue?: number;
  maxValue?: number;
  stepValue?: number;
  options?: { label: string; value: string }[];
  tooltip?: string;
  isRequired: boolean;
  isAdvanced: boolean;
}

/** 自定义模型注册配置 */
export interface CustomModelConfig {
  /** 模型名称（用户可读） */
  modelName: string;
  /** 模型ID（自动生成 CUSTOM_xxx） */
  methodId?: ImputationMethodId;
  /** 模型描述 */
  description: string;
  /** 模型文件路径（.pypots / .pt / .onnx 等） */
  modelFilePath: string;
  /** 推理脚本路径（Python 脚本） */
  inferenceScriptPath: string;
  /** 模型框架 */
  framework: "pypots" | "pytorch" | "onnx" | "other";
  /** 模型需要的输入列 */
  featureColumns: string[];
  /** 目标插补列 */
  targetColumn?: string;
  /** 时间列名称 */
  timeColumn?: string;
  /** 序列长度（时序模型需要） */
  seqLen?: number;
  /** 预估耗时 */
  estimatedTime: EstimatedTime;
  /** 准确度等级 */
  accuracy: AccuracyLevel;
  /** 自定义参数定义 */
  params: CustomModelParamDef[];
}

/** 自定义模型导入方式 */
export type CustomModelImportMode = "file" | "yaml";
