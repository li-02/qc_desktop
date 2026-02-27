# 自动化工作流模块 API 开发文档

> **版本**: v2.0  
> **最后更新**: 2026-02-24  
> **负责模块**: `WorkflowController.ts`, `WorkflowService.ts`, `WorkflowRepository.ts`, `workflow/index.vue`

---

## 目录

1. [模块概述](#1-模块概述)
2. [技术架构](#2-技术架构)
3. [API 路由总览](#3-api-路由总览)
4. [完整操作流程](#4-完整操作流程)
5. [API 详细说明](#5-api-详细说明)
   - [5.1 工作流管理 API](#51-工作流管理-api)
   - [5.2 节点管理 API](#52-节点管理-api)
   - [5.3 执行管理 API](#53-执行管理-api)
6. [类型定义](#6-类型定义)
7. [前端组件使用](#7-前端组件使用)
8. [错误处理](#8-错误处理)
9. [常见问题](#9-常见问题)

---

## 1. 模块概述

### 1.1 功能简介

自动化工作流模块允许用户将应用现有的数据处理功能编排成线性流水线，支持：

- 工作流的创建、编辑、删除、克隆（工作流为独立流程模板，不绑定数据集）
- 节点的添加、配置、排序、启用/禁用
- 将工作流应用到指定数据集（执行时选择目标数据集和初始版本），节点间自动传递数据版本
- 执行历史查看和节点级结果追溯（每次执行记录含目标数据集信息）

### 1.2 核心功能

| 功能         | 说明                                  |
| ------------ | ------------------------------------- |
| 工作流管理   | 创建/编辑/删除/克隆工作流（独立模板） |
| 节点编排     | 添加/删除/配置/排序节点               |
| 应用到数据集 | 选择目标数据集和初始版本，执行工作流  |
| 进度监控     | 实时显示执行进度和当前节点状态        |
| 执行历史     | 查看历史执行记录和节点级详情          |

---

## 2. 技术架构

### 2.1 分层架构

```text
┌─────────────────────────────────────────────────────────────┐
│                   前端 (Vue 3 + TypeScript)                  │
│  views/workflow/index.vue                                    │
│  - 工作流列表、编辑器、节点配置、执行视图                       │
│  stores/useWorkflowStore.ts                                  │
│  - Pinia 状态管理                                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (Electron API)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               控制器层 (WorkflowController.ts)               │
│  - 路由注册与分发                                             │
│  - 请求参数验证                                               │
│  - 进度事件转发 (mainWindow.webContents.send)                 │
│  - 响应格式化                                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                服务层 (WorkflowService.ts)                    │
│  - 工作流 CRUD 业务逻辑                                       │
│  - 节点管理逻辑                                               │
│  - 执行引擎 (线性调度)                                        │
│  - 调用已有 Service (Outlier/Imputation/FluxPartitioning)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              仓储层 (WorkflowRepository.ts)                   │
│  - 数据库 CRUD 操作                                          │
│  - SQL 语句执行                                               │
│  - 数据映射 (DB row → TypeScript object)                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 关键文件路径

| 层级         | 文件路径                                    |
| ------------ | ------------------------------------------- |
| 类型定义     | `shared/types/workflow.ts`                  |
| API 路由常量 | `shared/constants/apiRoutes.ts`             |
| 控制器       | `electron/controller/WorkflowController.ts` |
| 服务         | `electron/service/WorkflowService.ts`       |
| 仓储         | `electron/repository/WorkflowRepository.ts` |
| 前端页面     | `frontend/src/views/workflow/index.vue`     |
| 前端状态     | `frontend/src/stores/useWorkflowStore.ts`   |

---

## 3. API 路由总览

所有 API 路由定义在 `shared/constants/apiRoutes.ts` 的 `WORKFLOW` 对象中：

```typescript
WORKFLOW: {
  // 工作流管理
  CREATE: "workflow:create",
  UPDATE: "workflow:update",
  DELETE: "workflow:delete",
  GET_ALL: "workflow:getAll",
  GET_BY_ID: "workflow:getById",
  // GET_BY_DATASET: "workflow:getByDataset",  // v2.0 废弃：工作流不再绑定数据集
  CLONE: "workflow:clone",

  // 节点管理
  ADD_NODE: "workflow:addNode",
  UPDATE_NODE: "workflow:updateNode",
  DELETE_NODE: "workflow:deleteNode",
  REORDER_NODES: "workflow:reorderNodes",
  GET_NODES: "workflow:getNodes",

  // 执行管理
  EXECUTE: "workflow:execute",
  CANCEL: "workflow:cancel",
  GET_EXECUTIONS: "workflow:getExecutions",
  GET_EXECUTION_DETAIL: "workflow:getExecutionDetail",
}
```

### 路由汇总表

| 路由                          | 参数                      | 返回值                    | 说明                      |
| ----------------------------- | ------------------------- | ------------------------- | ------------------------- |
| `workflow:create`             | `CreateWorkflowRequest`   | `Workflow`                | 创建工作流（仅名称+描述） |
| `workflow:update`             | `UpdateWorkflowRequest`   | `Workflow`                | 更新工作流                |
| `workflow:delete`             | `{ workflowId }`          | `boolean`                 | 删除工作流                |
| `workflow:getAll`             | 无                        | `Workflow[]`              | 获取全部工作流            |
| `workflow:getById`            | `{ workflowId }`          | `WorkflowWithNodes`       | 获取工作流详情(含节点)    |
| `workflow:clone`              | `{ workflowId, newName }` | `Workflow`                | 克隆工作流                |
| `workflow:addNode`            | `AddNodeRequest`          | `WorkflowNode`            | 添加节点                  |
| `workflow:updateNode`         | `UpdateNodeRequest`       | `WorkflowNode`            | 更新节点                  |
| `workflow:deleteNode`         | `{ nodeId }`              | `boolean`                 | 删除节点                  |
| `workflow:reorderNodes`       | `ReorderNodesRequest`     | `boolean`                 | 重排节点顺序              |
| `workflow:getNodes`           | `{ workflowId }`          | `WorkflowNode[]`          | 获取工作流全部节点        |
| `workflow:execute`            | `ExecuteWorkflowRequest`  | `WorkflowExecution`       | 应用工作流到数据集并执行  |
| `workflow:cancel`             | `{ executionId }`         | `boolean`                 | 取消执行                  |
| `workflow:getExecutions`      | `{ workflowId }`          | `WorkflowExecution[]`     | 获取执行历史              |
| `workflow:getExecutionDetail` | `{ executionId }`         | `WorkflowExecutionDetail` | 获取执行详情              |

---

## 4. 完整操作流程

### 4.1 创建工作流并执行

```text
                前端                              后端
                 │                                 │
  1. 用户点击[新建工作流]（仅填名称+描述）              │
                 │ ── workflow:create ──────────▶  │
                 │                                 │ 创建工作流记录 (DRAFT)
                 │ ◀─── 返回 Workflow ────────────  │
                 │                                 │
  2. 用户添加节点                                    │
                 │ ── workflow:addNode ─────────▶  │
                 │                                 │ 插入节点, node_order++
                 │ ◀─── 返回 WorkflowNode ────────  │
                 │                                 │
  3. 用户配置节点参数                                 │
                 │ ── workflow:updateNode ──────▶  │
                 │                                 │ 更新 config_json
                 │ ◀─── 返回 WorkflowNode ────────  │
                 │                                 │
  4. 重复步骤 2-3 添加更多节点                        │
                 │                                 │
  5. 用户点击[应用到数据集]，选择目标数据集+版本         │
                 │ ── workflow:execute ─────────▶  │
                 │    {workflowId, datasetId,      │ 创建 execution 记录
                 │     initialVersionId}           │ (含目标数据集信息)
                 │ ◀─── 返回 WorkflowExecution ──  │ 开始异步执行
                 │                                 │
  6. 执行引擎逐节点运行                               │
                 │ ◀── IPC event: progress ────── │ 节点1开始
                 │ ◀── IPC event: progress ────── │ 节点1完成
                 │ ◀── IPC event: progress ────── │ 节点2开始
                 │ ◀── IPC event: progress ────── │ 节点2完成
                 │       ...                       │
                 │ ◀── IPC event: complete ─────  │ 全部完成
                 │                                 │
  7. 用户查看执行结果                                 │
                 │ ── workflow:getExecutionDetail ▶ │
                 │ ◀─── 返回详情 ─────────────────  │
```

### 4.2 进度事件推送

执行过程中，后端通过 IPC 事件向前端推送进度信息：

```typescript
// 事件名称
const WORKFLOW_PROGRESS_EVENT = "workflow:progress";

// 事件数据结构
interface WorkflowProgressEvent {
  executionId: number;
  currentNodeIndex: number; // 当前执行的节点索引 (0-based)
  totalNodes: number; // 总节点数
  nodeStatus: NodeExecutionStatus;
  nodeProgress?: number; // 当前节点内部进度 0-100
  message: string; // 进度描述信息
}
```

前端监听方式：

```typescript
// preload.ts 中暴露
onWorkflowProgress: (callback: (event: WorkflowProgressEvent) => void) => {
  ipcRenderer.on("workflow:progress", (_event, data) => callback(data));
};

// Vue 组件中使用
onMounted(() => {
  window.electronAPI.onWorkflowProgress(event => {
    workflowStore.updateProgress(event);
  });
});
```

---

## 5. API 详细说明

### 5.1 工作流管理 API

#### 5.1.1 创建工作流 `workflow:create`

**请求参数**：

```typescript
interface CreateWorkflowRequest {
  name: string; // 工作流名称
  description?: string; // 描述（可选）
  // v2.0: 不再需要 datasetId 和 initialVersionId
}
```

**返回值**：`Workflow` 对象

**示例**：

```typescript
const workflow = await window.electronAPI.invoke("workflow:create", {
  name: "标准QC流水线",
  description: "异常检测→插补→通量分割",
});
```

**业务规则**：

- `name` 不能为空
- 创建后状态为 `DRAFT`
- 工作流为独立模板，不绑定数据集

---

#### 5.1.2 更新工作流 `workflow:update`

**请求参数**：

```typescript
interface UpdateWorkflowRequest {
  workflowId: number;
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  // v2.0: 移除 initialVersionId，工作流不再绑定数据集
}
```

**返回值**：更新后的 `Workflow` 对象

---

#### 5.1.3 删除工作流 `workflow:delete`

**请求参数**：`{ workflowId: number }`

**返回值**：`boolean`

**业务规则**：

- 软删除（设置 `is_del = 1`）
- 同时软删除关联的所有节点
- 不删除已有的执行记录（保留历史）
- 正在执行中的工作流不能删除

---

#### 5.1.4 获取全部工作流 `workflow:getAll`

**请求参数**：无

**返回值**：`Workflow[]`

**说明**：返回所有未删除的工作流，按 `updated_at` 降序排列。

---

#### 5.1.5 获取工作流详情 `workflow:getById`

**请求参数**：`{ workflowId: number }`

**返回值**：

```typescript
interface WorkflowWithNodes {
  workflow: Workflow;
  nodes: WorkflowNode[]; // 按 node_order 排序
  lastExecution?: WorkflowExecution; // 最近一次执行记录
}
```

---

#### 5.1.6 克隆工作流 `workflow:clone`

**请求参数**：`{ workflowId: number, newName: string }`

**返回值**：新的 `Workflow` 对象

**业务规则**：

- 复制工作流定义和所有节点
- 新工作流状态为 `DRAFT`
- 不复制执行历史

---

### 5.2 节点管理 API

#### 5.2.1 添加节点 `workflow:addNode`

**请求参数**：

```typescript
interface AddNodeRequest {
  workflowId: number;
  nodeType: WorkflowNodeType;
  nodeName: string;
  configJson?: string; // JSON 字符串，可选（后续再配置）
  nodeOrder?: number; // 不指定则追加到末尾
}
```

**返回值**：`WorkflowNode` 对象

**业务规则**：

- `nodeType` 必须为合法的枚举值
- 如果指定 `nodeOrder`，已有节点的 `node_order` 会自动调整（后移）
- 如果不指定 `nodeOrder`，则追加到当前最大 `node_order + 1`
- 添加节点后，工作流状态重置为 `DRAFT`

---

#### 5.2.2 更新节点 `workflow:updateNode`

**请求参数**：

```typescript
interface UpdateNodeRequest {
  nodeId: number;
  nodeName?: string;
  configJson?: string;
  isEnabled?: boolean;
}
```

**返回值**：更新后的 `WorkflowNode` 对象

**业务规则**：

- 更新 `configJson` 时，后端进行基础的 JSON 解析验证
- 更新后，工作流状态重置为 `DRAFT`

---

#### 5.2.3 删除节点 `workflow:deleteNode`

**请求参数**：`{ nodeId: number }`

**返回值**：`boolean`

**业务规则**：

- 软删除节点
- 删除后自动重排剩余节点的 `node_order`（保持连续）
- 工作流状态重置为 `DRAFT`

---

#### 5.2.4 重排节点顺序 `workflow:reorderNodes`

**请求参数**：

```typescript
interface ReorderNodesRequest {
  workflowId: number;
  nodeIds: number[]; // 按新顺序排列的节点 ID 数组
}
```

**返回值**：`boolean`

**业务规则**：

- `nodeIds` 必须包含该工作流下所有启用且未删除的节点 ID
- 按数组顺序重新分配 `node_order`（从 1 开始）
- 工作流状态重置为 `DRAFT`

---

#### 5.2.5 获取节点列表 `workflow:getNodes`

**请求参数**：`{ workflowId: number }`

**返回值**：`WorkflowNode[]`（按 `node_order` 升序）

---

### 5.3 执行管理 API

#### 5.3.1 执行工作流（应用到数据集） `workflow:execute`

**请求参数**：

```typescript
interface ExecuteWorkflowRequest {
  workflowId: number; // 工作流 ID
  datasetId: number; // v2.0 新增：目标数据集 ID
  initialVersionId: number; // v2.0 新增：初始数据版本 ID
}
```

**返回值**：`WorkflowExecution` 对象

**业务规则**：

- 工作流必须至少有一个启用的节点
- 同一工作流不能同时有多个 `RUNNING` 的执行
- `datasetId` 必须存在且未被删除
- `initialVersionId` 必须属于该数据集
- 创建 `biz_workflow_execution` 记录（状态 `PENDING`，含 `dataset_id` 和 `initial_version_id`）
- 为每个启用的节点创建 `biz_workflow_node_execution` 记录（状态 `PENDING`）
- 立即返回 execution 对象，执行在后台异步进行
- 工作流状态更新为 `RUNNING`
- 执行过程中通过 IPC 事件推送进度

**执行流程**（异步）：

```text
1. execution.status = RUNNING, started_at = now()
2. currentVersionId = execution.initial_version_id (从 execution 记录读取)
3. FOR EACH enabledNode (按 node_order):
   a. nodeExecution.status = RUNNING, started_at = now()
   b. nodeExecution.input_version_id = currentVersionId
   c. 根据 node_type 调用对应 Service
   d. 如果成功:
      - nodeExecution.status = COMPLETED
      - nodeExecution.output_version_id = newVersionId (如有)
      - nodeExecution.result_json = {...}
      - currentVersionId = newVersionId (如有)
      - execution.completed_nodes++
   e. 如果失败:
      - nodeExecution.status = FAILED
      - nodeExecution.error_message = error.message
      - execution.status = FAILED
      - execution.error_message = error.message
      - 中断执行
4. 全部成功:
   - execution.status = COMPLETED, finished_at = now()
   - workflow.status = COMPLETED
```

---

#### 5.3.2 取消执行 `workflow:cancel`

**请求参数**：`{ executionId: number }`

**返回值**：`boolean`

**业务规则**：

- 仅能取消状态为 `RUNNING` 的执行
- 当前正在运行的节点会尝试中断（最终状态可能是 `COMPLETED` 或 `FAILED`）
- 后续未执行的节点状态设为 `SKIPPED`
- 执行状态更新为 `CANCELLED`
- 工作流状态更新为 `FAILED`

---

#### 5.3.3 获取执行历史 `workflow:getExecutions`

**请求参数**：`{ workflowId: number }`

**返回值**：`WorkflowExecution[]`（按 `created_at` 降序）

---

#### 5.3.4 获取执行详情 `workflow:getExecutionDetail`

**请求参数**：`{ executionId: number }`

**返回值**：

```typescript
interface WorkflowExecutionDetail {
  execution: WorkflowExecution;
  nodeExecutions: (WorkflowNodeExecution & {
    nodeName: string;
    nodeType: WorkflowNodeType;
    nodeOrder: number;
  })[];
}
```

---

## 6. 类型定义

完整类型定义位于 `shared/types/workflow.ts`：

```typescript
// ===== 枚举类型 =====

export type WorkflowNodeType =
  | "OUTLIER_DETECTION"
  | "IMPUTATION"
  | "FLUX_PARTITIONING"
  | "CORRELATION_ANALYSIS"
  | "EXPORT";

export type WorkflowStatus = "DRAFT" | "READY" | "RUNNING" | "COMPLETED" | "FAILED";

export type ExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type NodeExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

// ===== 数据模型 =====

export interface Workflow {
  id: number;
  name: string;
  description: string | null;
  datasetId: number | null; // v2.0: 改为可空
  initialVersionId: number | null; // v2.0: 改为可空
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
}

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

export interface WorkflowExecution {
  id: number;
  workflowId: number;
  datasetId: number; // v2.0 新增
  initialVersionId: number; // v2.0 新增
  status: ExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  totalNodes: number;
  completedNodes: number;
  errorMessage: string | null;
  createdAt: string;
}

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

// ===== 复合类型 =====

export interface WorkflowWithNodes {
  workflow: Workflow;
  nodes: WorkflowNode[];
  lastExecution?: WorkflowExecution;
}

export interface WorkflowExecutionDetail {
  execution: WorkflowExecution;
  nodeExecutions: (WorkflowNodeExecution & {
    nodeName: string;
    nodeType: WorkflowNodeType;
    nodeOrder: number;
  })[];
}

// ===== 请求类型 =====

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  // v2.0: 不再需要 datasetId 和 initialVersionId
}

export interface UpdateWorkflowRequest {
  workflowId: number;
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  // v2.0: 移除 initialVersionId
}

export interface ExecuteWorkflowRequest {
  workflowId: number;
  datasetId: number; // 目标数据集 ID
  initialVersionId: number; // 初始数据版本 ID
}

export interface AddNodeRequest {
  workflowId: number;
  nodeType: WorkflowNodeType;
  nodeName: string;
  configJson?: string;
  nodeOrder?: number;
}

export interface UpdateNodeRequest {
  nodeId: number;
  nodeName?: string;
  configJson?: string;
  isEnabled?: boolean;
}

export interface ReorderNodesRequest {
  workflowId: number;
  nodeIds: number[];
}

// ===== 进度事件 =====

export interface WorkflowProgressEvent {
  executionId: number;
  currentNodeIndex: number;
  totalNodes: number;
  nodeStatus: NodeExecutionStatus;
  nodeProgress?: number;
  message: string;
}

// ===== 节点配置类型 =====

export interface OutlierDetectionNodeConfig {
  detectionMethod: "THRESHOLD_STATIC" | "ZSCORE" | "IQR";
  targetColumns: string[] | null;
  methodParams: Record<string, any>;
  autoApply: boolean;
}

export interface ImputationNodeConfig {
  methodId: string;
  targetColumns: string[] | null;
  methodParams: Record<string, any>;
  autoApply: boolean;
}

export interface FluxPartitioningNodeConfig {
  methodId: "NIGHTTIME_REICHSTEIN" | "DAYTIME_LASSLOP";
  columnMapping: Record<string, string>;
  siteInfo: { latitude: number; longitude: number; timezone: number };
  options?: Record<string, any>;
}

export interface CorrelationAnalysisNodeConfig {
  columns: string[];
  method: "pearson" | "spearman" | "kendall";
}

export interface ExportNodeConfig {
  format: "csv" | "xlsx";
  columns: string[] | null;
  outputPath?: string;
  fileNameTemplate?: string;
}

// ===== 节点类型元信息 =====

export const NODE_TYPE_META: Record<
  WorkflowNodeType,
  {
    label: string;
    icon: string;
    producesVersion: boolean;
    description: string;
  }
> = {
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
  CORRELATION_ANALYSIS: {
    label: "相关性分析",
    icon: "🔗",
    producesVersion: false,
    description: "分析变量间的相关关系",
  },
  EXPORT: {
    label: "数据导出",
    icon: "📤",
    producesVersion: false,
    description: "将数据导出为文件",
  },
};
```

---

## 7. 前端组件使用

### 7.1 Store 使用

```typescript
// stores/useWorkflowStore.ts
import { defineStore } from "pinia";
import type {
  Workflow,
  WorkflowNode,
  WorkflowWithNodes,
  WorkflowExecution,
  WorkflowProgressEvent,
  CreateWorkflowRequest,
  AddNodeRequest,
} from "@shared/types/workflow";
import { API_ROUTES } from "@shared/constants/apiRoutes";

export const useWorkflowStore = defineStore("workflow", {
  state: () => ({
    workflows: [] as Workflow[],
    currentWorkflow: null as WorkflowWithNodes | null,
    currentExecution: null as WorkflowExecution | null,
    executionProgress: null as WorkflowProgressEvent | null,
    loading: false,
  }),

  actions: {
    // 加载所有工作流
    async loadWorkflows() {
      this.loading = true;
      try {
        this.workflows = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.GET_ALL);
      } finally {
        this.loading = false;
      }
    },

    // 加载工作流详情
    async loadWorkflowDetail(workflowId: number) {
      this.currentWorkflow = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.GET_BY_ID, { workflowId });
    },

    // 创建工作流
    async createWorkflow(request: CreateWorkflowRequest) {
      const workflow = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.CREATE, request);
      this.workflows.push(workflow);
      return workflow;
    },

    // 添加节点
    async addNode(request: AddNodeRequest) {
      const node = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.ADD_NODE, request);
      if (this.currentWorkflow) {
        this.currentWorkflow.nodes.push(node);
        this.currentWorkflow.nodes.sort((a, b) => a.nodeOrder - b.nodeOrder);
      }
      return node;
    },

    // 执行工作流（应用到数据集）
    async executeWorkflow(workflowId: number, datasetId: number, initialVersionId: number) {
      this.currentExecution = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.EXECUTE, {
        workflowId,
        datasetId,
        initialVersionId,
      });
      return this.currentExecution;
    },

    // 更新进度（由 IPC 事件回调）
    updateProgress(event: WorkflowProgressEvent) {
      this.executionProgress = event;
    },
  },
});
```

### 7.2 路由配置

```typescript
// router/index.ts 中新增
{
  path: "workflow",
  name: "Workflow",
  component: () => import("../views/workflow/index.vue"),
}
```

### 7.3 IPC API 扩展

在 `electron/preload.ts` 中新增：

```typescript
// 工作流进度监听
onWorkflowProgress: (callback: (event: any) => void) => {
  ipcRenderer.on('workflow:progress', (_event, data) => callback(data));
},
removeWorkflowProgressListener: () => {
  ipcRenderer.removeAllListeners('workflow:progress');
},
```

---

## 8. 错误处理

### 8.1 错误码规范

| 错误码                     | 说明                       |
| -------------------------- | -------------------------- |
| `WORKFLOW_NOT_FOUND`       | 工作流不存在               |
| `WORKFLOW_ALREADY_RUNNING` | 工作流已在执行中           |
| `WORKFLOW_NO_NODES`        | 工作流没有启用的节点       |
| `NODE_NOT_FOUND`           | 节点不存在                 |
| `NODE_CONFIG_INVALID`      | 节点配置无效               |
| `EXECUTION_NOT_FOUND`      | 执行记录不存在             |
| `EXECUTION_NOT_RUNNING`    | 执行不在运行中（无法取消） |
| `DATASET_NOT_FOUND`        | 数据集不存在               |
| `VERSION_NOT_FOUND`        | 数据版本不存在             |
| `NODE_EXECUTION_FAILED`    | 节点执行失败               |

### 8.2 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### 8.3 节点执行错误处理

当某个节点执行失败时：

1. 当前节点的 `node_execution` 标记为 `FAILED`，记录 `error_message`
2. 后续节点标记为 `SKIPPED`
3. 整体执行标记为 `FAILED`
4. 已完成节点产生的数据版本**保留**（不回滚）
5. 通过 IPC 事件通知前端失败信息

---

## 9. 常见问题

### Q1: 工作流执行是同步还是异步的？

**异步**。`workflow:execute` 接口立即返回 `WorkflowExecution` 对象，执行在后台进行。进度通过 IPC 事件推送到前端。

### Q2: 节点失败后，已完成节点的结果会回滚吗？

**不会**。已完成节点产生的数据版本和业务结果都保留。用户可以在 data-view 中查看中间版本。

### Q3: 能否修改正在执行中的工作流？

**不能**。执行中的工作流拒绝 update/addNode/deleteNode/reorderNodes 操作，返回 `WORKFLOW_ALREADY_RUNNING` 错误。

### Q4: 克隆工作流时会复制什么？

复制工作流定义（name、description）和所有节点（包括 config_json）。不复制执行历史。新工作流状态为 `DRAFT`。

### Q5: 禁用的节点在执行时如何处理？

禁用的节点（`is_enabled = false`）会被跳过，对应的 `node_execution` 状态标记为 `SKIPPED`。数据版本不变，继续传递给下一个启用的节点。

### Q6: 工作流如何复用到不同数据集？（v2.0 新增）

工作流是独立的流程模板，不绑定数据集。每次点击「应用到数据集」时选择目标数据集和初始版本即可执行。同一个工作流可反复应用到不同数据集上，执行历史中会记录每次应用的目标数据集信息。
