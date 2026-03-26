/**
 * 通量分割相关类型定义
 */

// ==================== 基础类型 ====================

/** 分割方法ID */
export type FluxPartitioningMethodId = 'NIGHTTIME_REICHSTEIN' | 'DAYTIME_LASSLOP';

/** 分割结果状态 */
export type FluxPartitioningStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'APPLIED';

/** 执行阶段 */
export type FluxPartitioningStage =
  | 'checking'
  | 'loading'
  | 'preparing'
  | 'gapfilling'
  | 'partitioning'
  | 'saving'
  | 'completed';

// ==================== 请求/响应接口 ====================

/** 执行通量分割请求 */
export interface ExecuteFluxPartitioningRequest {
  datasetId: number;
  versionId: number;
  methodId: FluxPartitioningMethodId;
  /** 列映射 */
  columnMapping: {
    neeCol: string;
    rgCol: string;
    tairCol: string;
    vpdCol: string;
    rhCol?: string;
    ustarCol?: string;
  };
  /** 站点位置信息 */
  siteInfo: {
    latDeg: number;
    longDeg: number;
    timezoneHour: number;
  };
  /** 高级选项 */
  options?: {
    ustarFiltering?: boolean;
  };
}

/** 执行通量分割响应 */
export interface ExecuteFluxPartitioningResponse {
  success: boolean;
  resultId?: number;
  message?: string;
  error?: string;
}

/** 通量分割进度事件 */
export interface FluxPartitioningProgressEvent {
  resultId: number;
  stage: FluxPartitioningStage;
  progress: number; // 0-100
  message: string;
}

/** 通量分割结果 */
export interface FluxPartitioningResult {
  id: number;
  datasetId: number;
  versionId: number;
  newVersionId?: number;
  methodId: FluxPartitioningMethodId;
  methodName: string;
  name?: string;
  columnMapping: Record<string, string>;
  siteInfo: Record<string, number>;
  options?: Record<string, any>;
  /** 输出列名 */
  outputColumns: string[];
  /** GPP 统计信息 */
  gppStats?: FluxPartitioningColumnStats;
  /** Reco 统计信息 */
  recoStats?: FluxPartitioningColumnStats;
  executionTimeMs?: number;
  status: FluxPartitioningStatus;
  errorMessage?: string;
  executedAt: string;
  createdAt: string;
}

/** 分割结果列统计 */
export interface FluxPartitioningColumnStats {
  column: string;
  count: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
}

// ==================== 数据库行类型 ====================

/** 通量分割结果数据库行 */
export interface FluxPartitioningResultRow {
  id: number;
  dataset_id: number;
  version_id: number;
  new_version_id: number | null;
  method_id: string;
  method_name: string;
  name: string | null;
  column_mapping: string; // JSON
  site_info: string; // JSON
  options: string | null; // JSON
  output_columns: string | null; // JSON
  gpp_stats: string | null; // JSON
  reco_stats: string | null; // JSON
  execution_time_ms: number | null;
  status: string;
  error_message: string | null;
  executed_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_del: number;
}
