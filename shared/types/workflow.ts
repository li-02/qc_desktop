/**
 * 自动化工作流相关类型定义
 */

// ==================== 枚举类型 ====================

/** 工作流节点类型 */
export type WorkflowNodeType = "OUTLIER_DETECTION" | "IMPUTATION" | "FLUX_PARTITIONING" | "EXPORT";

/** 工作流状态 */
export type WorkflowStatus = "DRAFT" | "READY" | "RUNNING" | "COMPLETED" | "FAILED";

/** 执行状态 */
export type ExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

/** 节点执行状态 */
export type NodeExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

// ==================== 数据模型 ====================

/** 工作流定义（流程模板，不绑定数据集） */
export interface Workflow {
  id: number;
  name: string;
  description: string | null;
  datasetId: number | null;
  initialVersionId: number | null;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
}

/** 工作流节点 */
export interface WorkflowNode {
  id: number;
  workflowId: number;
  nodeOrder: number;
  nodeType: WorkflowNodeType;
  nodeName: string;
  configJson: string | null;
  isEnabled: boolean;
  positionX: number | null;
  positionY: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 工作流执行记录（绑定目标数据集） */
export interface WorkflowExecution {
  id: number;
  workflowId: number;
  datasetId: number;
  datasetName?: string;
  label?: string | null;
  initialVersionId: number;
  status: ExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  totalNodes: number;
  completedNodes: number;
  errorMessage: string | null;
  createdAt: string;
}

/** 节点执行详情 */
export interface WorkflowNodeExecution {
  id: number;
  executionId: number;
  nodeId: number;
  inputVersionId: number | null;
  outputVersionId: number | null;
  status: NodeExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  resultJson: string | null;
  errorMessage: string | null;
  createdAt: string;
}

// ==================== 复合类型 ====================

/** 工作流详情（含节点和最近执行） */
export interface WorkflowWithNodes {
  workflow: Workflow;
  nodes: WorkflowNode[];
  lastExecution?: WorkflowExecution;
}

/** 执行详情（含节点执行列表） */
export interface WorkflowExecutionDetail {
  execution: WorkflowExecution;
  nodeExecutions: (WorkflowNodeExecution & {
    nodeName: string;
    nodeType: WorkflowNodeType;
    nodeOrder: number;
  })[];
}

// ==================== 请求类型 ====================

/** 创建工作流请求（不绑定数据集） */
export interface CreateWorkflowRequest {
  name: string;
  description?: string;
}

/** 更新工作流请求 */
export interface UpdateWorkflowRequest {
  workflowId: number;
  name?: string;
  description?: string;
  status?: WorkflowStatus;
}

/** 执行工作流请求（应用到数据集） */
export interface ExecuteWorkflowRequest {
  workflowId: number;
  datasetId: number;
  initialVersionId: number;
}

/** 添加节点请求 */
export interface AddNodeRequest {
  workflowId: number;
  nodeType: WorkflowNodeType;
  nodeName: string;
  configJson?: string;
  nodeOrder?: number;
}

/** 更新节点请求 */
export interface UpdateNodeRequest {
  nodeId: number;
  nodeName?: string;
  configJson?: string;
  isEnabled?: boolean;
}

/** 重排节点顺序请求 */
export interface ReorderNodesRequest {
  workflowId: number;
  nodeIds: number[];
}

// ==================== 进度事件 ====================

/** 工作流执行进度事件 */
export interface WorkflowProgressEvent {
  executionId: number;
  currentNodeIndex: number;
  totalNodes: number;
  nodeStatus: NodeExecutionStatus;
  nodeProgress?: number;
  message: string;
}

// ==================== 节点配置类型 ====================

/** 异常检测节点配置 */
export interface OutlierDetectionNodeConfig {
  detectionMethod: "THRESHOLD_STATIC" | "ZSCORE" | "IQR";
  targetColumns: string[] | null;
  methodParams: Record<string, any>;
  autoApply: boolean;
}

/** 缺失值插补节点配置 */
export interface ImputationNodeConfig {
  methodId: string;
  targetColumns: string[] | null;
  methodParams: Record<string, any>;
  autoApply: boolean;
}

/** 通量分割节点配置 */
export interface FluxPartitioningNodeConfig {
  methodId: "NIGHTTIME_REICHSTEIN" | "DAYTIME_LASSLOP";
  columnMapping: Record<string, string>;
  siteInfo: { latitude: number; longitude: number; timezone: number };
  options?: Record<string, any>;
}

/** 数据导出节点配置 */
export interface ExportNodeConfig {
  format: "csv" | "xlsx";
  columns: string[] | null;
  outputPath?: string;
  fileNameTemplate?: string;
}

// ==================== 节点类型元信息 ====================

/** 节点类型元信息 */
export interface NodeTypeMeta {
  label: string;
  icon: string;
  producesVersion: boolean;
  description: string;
}

/** 节点类型元信息映射 */
export const NODE_TYPE_META: Record<WorkflowNodeType, NodeTypeMeta> = {
  OUTLIER_DETECTION: {
    label: "异常检测",
    icon: "🔍",
    producesVersion: true,
    description: "检测异常值并应用过滤",
  },
  IMPUTATION: {
    label: "缺失值插补",
    icon: "🔧",
    producesVersion: true,
    description: "填补数据中的缺失值",
  },
  FLUX_PARTITIONING: {
    label: "通量分割",
    icon: "📊",
    producesVersion: true,
    description: "将 NEE 分割为 GPP 和 Reco",
  },
  EXPORT: {
    label: "数据导出",
    icon: "📤",
    producesVersion: false,
    description: "将数据导出为文件",
  },
};

// ==================== 执行器接口 ====================

/** 节点执行上下文 */
export interface NodeExecutionContext {
  datasetId: number;
  inputVersionId: number;
  config: any;
  onProgress: (progress: number, message: string) => void;
}

/** 节点执行结果 */
export interface NodeExecutionResult {
  outputVersionId: number | null;
  resultData?: Record<string, any>;
}

// ==================== 数据库行类型 ====================

/** 工作流数据库行 */
export interface WorkflowRow {
  id: number;
  name: string;
  description: string | null;
  dataset_id: number | null;
  initial_version_id: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_del: number;
}

/** 工作流节点数据库行 */
export interface WorkflowNodeRow {
  id: number;
  workflow_id: number;
  node_order: number;
  node_type: string;
  node_name: string;
  config_json: string | null;
  is_enabled: number;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_del: number;
}

/** 工作流执行记录数据库行 */
export interface WorkflowExecutionRow {
  id: number;
  workflow_id: number;
  dataset_id: number;
  dataset_name?: string;
  label?: string | null;
  initial_version_id: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  total_nodes: number;
  completed_nodes: number;
  error_message: string | null;
  created_at: string;
}

/** 节点执行详情数据库行 */
export interface WorkflowNodeExecutionRow {
  id: number;
  execution_id: number;
  node_id: number;
  input_version_id: number | null;
  output_version_id: number | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  result_json: string | null;
  error_message: string | null;
  created_at: string;
}
