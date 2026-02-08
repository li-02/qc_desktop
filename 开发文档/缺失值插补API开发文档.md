# 缺失值插补模块 API 开发文档

> **版本**: v1.0  
> **最后更新**: 2026-01-12  
> **负责模块**: `GapFillingPanel.vue`, `ImputationController.ts`, `ImputationService.ts`, `ImputationRepository.ts`

---

## 目录

1. [模块概述](#1-模块概述)
2. [技术架构](#2-技术架构)
3. [API 路由总览](#3-api-路由总览)
4. [完整操作流程](#4-完整操作流程)
5. [API 详细说明](#5-api-详细说明)
   - [5.1 方法管理 API](#51-方法管理-api)
   - [5.2 执行插补 API](#52-执行插补-api)
   - [5.3 结果管理 API](#53-结果管理-api)
   - [5.4 结果应用与导出 API](#54-结果应用与导出-api)
6. [类型定义](#6-类型定义)
7. [前端组件使用](#7-前端组件使用)
8. [错误处理](#8-错误处理)
9. [常见问题](#9-常见问题)

---

## 1. 模块概述

### 1.1 功能简介

缺失值插补模块用于处理数据集中的缺失数据，提供多种插补方法，包括：

- **基础方法**: 均值、中位数、众数、前向/后向填充
- **统计方法**: 线性插值、样条插值、多项式插值
- **时序模型**: ARIMA、SARIMA、ETS（需 Python 环境）
- **机器学习**: KNN、随机森林、梯度提升、MICE（需 Python 环境）
- **深度学习**: LSTM、GRU、Transformer、VAE、GAIN（需 Python 环境）

### 1.2 核心功能

| 功能 | 说明 |
|------|------|
| 方法选择 | 支持按分类浏览和选择插补方法 |
| 参数配置 | 每个方法支持自定义参数配置 |
| 列选择 | 支持全部列或手动选择指定列进行插补 |
| 进度反馈 | 实时显示插补进度和当前处理的列 |
| 结果预览 | 插补完成后可预览结果，支持时序图和表格视图 |
| 版本保存 | 可将插补结果保存为新数据版本 |
| 文件导出 | 可导出插补后的数据为 CSV 文件 |
| 历史记录 | 查看和管理历史插补记录 |

---

## 2. 技术架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                   前端 (Vue 3 + TypeScript)                  │
│  GapFillingPanel.vue                                         │
│  - 用户界面渲染                                               │
│  - 方法选择、参数配置                                         │
│  - 进度展示、结果可视化                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (Electron API)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               控制器层 (ImputationController.ts)             │
│  - 路由注册与分发                                             │
│  - 请求参数验证                                               │
│  - 进度事件转发                                               │
│  - 响应格式化                                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                服务层 (ImputationService.ts)                 │
│  - 业务逻辑处理                                               │
│  - 插补算法实现                                               │
│  - 数据文件读写                                               │
│  - 版本创建                                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              仓储层 (ImputationRepository.ts)                │
│  - 数据库 CRUD 操作                                          │
│  - SQL 语句执行                                               │
│  - 数据映射                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 关键文件路径

| 层级 | 文件路径 |
|------|----------|
| 前端组件 | `frontend/src/views/data-view/components/panels/GapFillingPanel.vue` |
| API 路由常量 | `shared/constants/apiRoutes.ts` |
| 类型定义 | `shared/types/imputation.ts` |
| 控制器 | `electron/controller/ImputationController.ts` |
| 服务 | `electron/service/ImputationService.ts` |
| 仓储 | `electron/repository/ImputationRepository.ts` |

---

## 3. API 路由总览

所有 API 路由定义在 `shared/constants/apiRoutes.ts` 的 `IMPUTATION` 对象中：

```typescript
IMPUTATION: {
  // 方法管理
  GET_METHODS: "imputation:getMethods",                    // 获取所有方法
  GET_METHODS_BY_CATEGORY: "imputation:getMethodsByCategory", // 按分类获取方法
  GET_AVAILABLE_METHODS: "imputation:getAvailableMethods",  // 获取可用方法
  GET_METHOD_PARAMS: "imputation:getMethodParams",          // 获取方法参数定义
  GET_METHOD_WITH_PARAMS: "imputation:getMethodWithParams", // 获取方法及其参数
  
  // 执行插补
  EXECUTE: "imputation:execute",                           // 执行插补
  
  // 结果管理
  GET_RESULT: "imputation:getResult",                      // 获取单个结果
  GET_RESULTS_BY_DATASET: "imputation:getResultsByDataset", // 获取数据集的结果列表
  GET_DETAILS: "imputation:getDetails",                    // 获取插补详情
  GET_COLUMN_STATS: "imputation:getColumnStats",           // 获取列统计
  DELETE_RESULT: "imputation:deleteResult",                // 删除结果
  
  // 应用与导出
  APPLY_VERSION: "imputation:applyVersion",                // 保存为新版本
  EXPORT_FILE: "imputation:exportFile",                    // 导出为文件
}
```

---

## 4. 完整操作流程

### 4.1 用户操作流程图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  选择数据集  │ ──▶ │  加载方法   │ ──▶ │  选择方法   │ ──▶ │  配置参数   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                    │
                                                                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  保存/导出  │ ◀── │  预览结果   │ ◀── │  执行插补   │ ◀── │  选择目标列  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 4.2 详细流程步骤

#### 步骤 1: 初始化 - 加载可用方法

**时机**: 组件挂载时 (`onMounted`)

```typescript
// 前端调用
const loadImputationMethods = async () => {
  const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_AVAILABLE_METHODS);
  if (result.success) {
    imputationMethods.value = result.data;
  }
};
```

#### 步骤 2: 选择方法并加载参数

**时机**: 用户点击方法卡片时

```typescript
// 前端调用
const selectMethod = async (method: ImputationMethod) => {
  selectedMethodId.value = method.methodId;
  const params = await loadMethodParams(method.methodId);
  // 初始化默认参数值
  initMethodParams(params);
};

const loadMethodParams = async (methodId: string) => {
  const result = await window.electronAPI.invoke(
    API_ROUTES.IMPUTATION.GET_METHOD_PARAMS, 
    methodId
  );
  return result.success ? result.data : [];
};
```

#### 步骤 3: 配置目标列

**时机**: 用户选择插补范围时

```typescript
// 列选择模式
const columnSelectionMode = ref<'all' | 'manual'>('all');
const selectedColumns = ref<string[]>([]);

// 获取有缺失值的列
const columnsWithMissing = computed(() => {
  return availableColumns.value.filter(col => col.missingCount > 0);
});
```

#### 步骤 4: 执行插补

**时机**: 用户点击"开始插补"按钮

```typescript
// 前端调用
const executeImputation = async () => {
  const payload = {
    datasetId: parseInt(String(props.datasetInfo?.id)),
    versionId: currentVersion.value.id,
    methodId: selectedMethodId.value,
    targetColumns: columnSelectionMode.value === 'all' 
      ? availableColumns.value.map(c => c.name) 
      : selectedColumns.value,
    params: paramValues.value
  };
  
  const result = await window.electronAPI.invoke(
    API_ROUTES.IMPUTATION.EXECUTE, 
    payload
  );
  
  if (result.success) {
    currentResultId.value = result.resultId;
    isPreviewing.value = true;
  }
};
```

#### 步骤 5: 监听进度事件

**时机**: 插补执行过程中

```typescript
// 前端监听
const setupProgressListeners = () => {
  window.electronAPI.on('imputation:progress', (event: ImputationProgressEvent) => {
    progressInfo.value = event;
    // 更新进度UI
  });
};
```

#### 步骤 6: 预览结果

**时机**: 插补完成后自动进入预览模式

```typescript
// 切换到结果视图
const viewResult = (result: ImputationResult) => {
  currentResultId.value = result.id;
  currentView.value = 'result';
  loadResultComparison(result.id);
};
```

#### 步骤 7: 保存为新版本

**时机**: 用户确认保存

```typescript
// 前端调用
const saveAsNewVersion = async () => {
  const result = await window.electronAPI.invoke(
    API_ROUTES.IMPUTATION.APPLY_VERSION, 
    {
      resultId: currentResultId.value,
      remark: `Applied imputation using ${getMethodName(selectedMethodId.value)}`
    }
  );
  
  if (result.success) {
    // 刷新版本列表
    await datasetStore.loadVersions(String(props.datasetInfo?.id));
    // 切换到新版本
    if (result.data?.id) {
      await datasetStore.setCurrentVersion(result.data.id);
    }
  }
};
```

#### 步骤 8: 导出为文件

**时机**: 用户选择导出

```typescript
// 前端调用
const saveAsFile = async () => {
  const result = await window.electronAPI.invoke(
    API_ROUTES.IMPUTATION.EXPORT_FILE, 
    { resultId: currentResultId.value }
  );
  
  if (result.success && !result.cancelled) {
    ElMessage.success(`文件已导出: ${result.data}`);
  }
};
```

---

## 5. API 详细说明

### 5.1 方法管理 API

#### 5.1.1 获取所有插补方法

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_METHODS = "imputation:getMethods"

// 请求参数
无

// 响应
interface Response {
  success: boolean;
  data?: ImputationMethod[];
  error?: string;
}
```

#### 5.1.2 按分类获取方法

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_METHODS_BY_CATEGORY = "imputation:getMethodsByCategory"

// 请求参数
type ImputationCategory = 'basic' | 'statistical' | 'timeseries' | 'ml' | 'dl';
category: ImputationCategory

// 响应
interface Response {
  success: boolean;
  data?: ImputationMethod[];
  error?: string;
}
```

#### 5.1.3 获取可用方法

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_AVAILABLE_METHODS = "imputation:getAvailableMethods"

// 请求参数
无

// 响应
interface Response {
  success: boolean;
  data?: ImputationMethod[];  // 只返回 isAvailable = true 的方法
  error?: string;
}
```

#### 5.1.4 获取方法参数定义

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_METHOD_PARAMS = "imputation:getMethodParams"

// 请求参数
methodId: string  // 例如: "MEAN", "LINEAR", "KNN"

// 响应
interface Response {
  success: boolean;
  data?: ImputationMethodParam[];
  error?: string;
}
```

#### 5.1.5 获取方法及其参数定义

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_METHOD_WITH_PARAMS = "imputation:getMethodWithParams"

// 请求参数
methodId: string

// 响应
interface Response {
  success: boolean;
  data?: {
    method: ImputationMethod;
    params: ImputationMethodParam[];
  };
  error?: string;
}
```

---

### 5.2 执行插补 API

#### 5.2.1 执行插补

```typescript
// 路由
API_ROUTES.IMPUTATION.EXECUTE = "imputation:execute"

// 请求参数
interface ExecuteImputationRequest {
  datasetId: number;           // 数据集ID
  versionId: number;           // 版本ID
  methodId: ImputationMethodId; // 方法标识 (如 "MEAN", "LINEAR")
  targetColumns: string[] | null; // 目标列名数组，null 表示全部列
  params?: Record<string, any>;   // 方法参数
  validateSplit?: number;         // 验证集比例 (0-0.3)，可选
}

// 响应
interface ExecuteImputationResponse {
  success: boolean;
  resultId?: number;  // 插补结果ID，用于后续操作
  message?: string;
  error?: string;
}
```

**重要说明**:
- 该接口是异步执行的，返回 `resultId` 后可通过进度事件监听执行状态
- 进度事件通过 IPC 事件 `imputation:progress` 推送

#### 5.2.2 进度事件

```typescript
// 事件名
'imputation:progress'

// 事件数据
interface ImputationProgressEvent {
  resultId: number;           // 关联的结果ID
  stage: ImputationStage;     // 当前阶段
  progress: number;           // 进度百分比 (0-100)
  message: string;            // 进度消息
  currentColumn?: string;     // 当前处理的列名
  processedColumns?: number;  // 已处理列数
  totalColumns?: number;      // 总列数
  processedRows?: number;     // 已处理行数
  totalRows?: number;         // 总行数
  estimatedRemainingMs?: number; // 预估剩余时间(毫秒)
}

type ImputationStage = 'preparing' | 'training' | 'imputing' | 'validating' | 'saving';
```

**前端监听示例**:

```typescript
// 在 onMounted 中设置监听
window.electronAPI.on('imputation:progress', (event: ImputationProgressEvent) => {
  progressInfo.value = event;
  
  // 根据阶段更新UI
  switch (event.stage) {
    case 'preparing':
      // 显示准备中状态
      break;
    case 'imputing':
      // 显示插补进度
      break;
    case 'saving':
      // 显示保存中状态
      break;
  }
});
```

---

### 5.3 结果管理 API

#### 5.3.1 获取单个插补结果

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_RESULT = "imputation:getResult"

// 请求参数
resultId: number

// 响应
interface Response {
  success: boolean;
  data?: ImputationResult | null;
  error?: string;
}
```

#### 5.3.2 获取数据集的插补结果列表

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_RESULTS_BY_DATASET = "imputation:getResultsByDataset"

// 请求参数
interface GetImputationResultsRequest {
  datasetId: number;
  versionId?: number;  // 可选，过滤特定版本
  status?: ImputationResultStatus;  // 可选，过滤状态
  limit?: number;   // 默认 50
  offset?: number;  // 默认 0
}

// 响应
interface Response {
  success: boolean;
  data?: ImputationResult[];
  error?: string;
}
```

#### 5.3.3 获取插补详情

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_DETAILS = "imputation:getDetails"

// 请求参数
interface GetImputationDetailsRequest {
  resultId: number;
  columnName?: string;  // 可选，过滤特定列
  limit?: number;       // 默认 1000
  offset?: number;      // 默认 0
}

// 响应
interface Response {
  success: boolean;
  data?: ImputationDetail[];
  error?: string;
}
```

#### 5.3.4 获取列统计信息

```typescript
// 路由
API_ROUTES.IMPUTATION.GET_COLUMN_STATS = "imputation:getColumnStats"

// 请求参数
resultId: number

// 响应
interface Response {
  success: boolean;
  data?: ImputationColumnStat[];
  error?: string;
}
```

#### 5.3.5 删除插补结果

```typescript
// 路由
API_ROUTES.IMPUTATION.DELETE_RESULT = "imputation:deleteResult"

// 请求参数
resultId: number

// 响应
interface Response {
  success: boolean;
  error?: string;
}
```

**注意**: 这是软删除，不会真正删除数据库记录。

---

### 5.4 结果应用与导出 API

#### 5.4.1 保存为新版本

```typescript
// 路由
API_ROUTES.IMPUTATION.APPLY_VERSION = "imputation:applyVersion"

// 请求参数
interface Args {
  resultId: number;
  remark?: string;  // 版本备注
}

// 响应
interface Response {
  success: boolean;
  data?: DatasetVersion;  // 新创建的版本信息
  error?: string;
}
```

**处理逻辑**:
1. 读取原始版本数据文件
2. 应用插补详情中的插补值
3. 生成新的数据文件
4. 创建新版本记录 (stage_type = 'QC')
5. 更新插补结果的 new_version_id

#### 5.4.2 导出为文件

```typescript
// 路由
API_ROUTES.IMPUTATION.EXPORT_FILE = "imputation:exportFile"

// 请求参数
interface Args {
  resultId: number;
}

// 响应
interface Response {
  success: boolean;
  data?: string;      // 导出的文件路径
  cancelled?: boolean; // 用户是否取消了保存对话框
  error?: string;
}
```

**处理逻辑**:
1. 弹出文件保存对话框让用户选择保存位置
2. 重构数据（原始数据 + 插补值）
3. 将数据转换为 CSV 格式
4. 写入用户选择的文件路径

---

## 6. 类型定义

### 6.1 插补方法类型

```typescript
/** 插补方法ID */
export type ImputationMethodId = 
  // 基础方法
  | 'MEAN' | 'MEDIAN' | 'MODE' | 'FORWARD_FILL' | 'BACKWARD_FILL'
  // 统计/插值方法
  | 'LINEAR' | 'SPLINE' | 'POLYNOMIAL' | 'SEASONAL'
  // 时间序列模型
  | 'ARIMA' | 'SARIMA' | 'ETS'
  // 机器学习模型
  | 'KNN' | 'RANDOM_FOREST' | 'GRADIENT_BOOSTING' | 'MICE' | 'MISSFOREST'
  // 深度学习模型
  | 'LSTM' | 'GRU' | 'TRANSFORMER' | 'VAE' | 'GAIN';

/** 插补方法分类 */
export type ImputationCategory = 'basic' | 'statistical' | 'timeseries' | 'ml' | 'dl';

/** 插补结果状态 */
export type ImputationResultStatus = 
  | 'PENDING'    // 待执行
  | 'RUNNING'    // 执行中
  | 'COMPLETED'  // 已完成
  | 'FAILED'     // 失败
  | 'APPLIED'    // 已应用到数据集
  | 'REVERTED';  // 已撤销
```

### 6.2 插补方法配置

```typescript
/** 插补方法配置 */
export interface ImputationMethod {
  id: number;
  methodId: ImputationMethodId;
  methodName: string;
  category: ImputationCategory;
  description: string;
  requiresPython: boolean;      // 是否需要 Python 环境
  isAvailable: boolean;         // 当前是否可用
  estimatedTime?: 'fast' | 'medium' | 'slow';  // 预估耗时
  accuracy?: 'low' | 'medium' | 'high';        // 预估准确度
  priority: number;
  applicableDataTypes: string[];
  icon?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 6.3 方法参数定义

```typescript
/** 插补方法参数定义 */
export interface ImputationMethodParam {
  id: number;
  methodId: ImputationMethodId;
  paramKey: string;        // 参数键名
  paramName: string;       // 参数显示名称
  paramType: 'number' | 'select' | 'boolean' | 'range';
  defaultValue: string | null;
  minValue?: number;       // 数字类型的最小值
  maxValue?: number;       // 数字类型的最大值
  stepValue?: number;      // 数字类型的步进值
  options?: string | null; // JSON 格式的选项数组
  tooltip?: string;        // 参数说明提示
  isRequired: boolean;
  isAdvanced: boolean;     // 是否为高级参数
  paramOrder: number;      // 显示顺序
  createdAt: string;
  updatedAt: string;
}

// options 字段 JSON 格式示例:
// [{"label": "欧几里得", "value": "euclidean"}, {"label": "曼哈顿", "value": "manhattan"}]
```

### 6.4 插补结果

```typescript
/** 插补结果 */
export interface ImputationResult {
  id: number;
  datasetId: number;
  versionId: number;           // 源版本ID
  newVersionId?: number;       // 应用后生成的新版本ID
  methodId: ImputationMethodId;
  targetColumns: string[];
  methodParams?: Record<string, any>;
  totalMissing: number;        // 总缺失值数量
  imputedCount: number;        // 插补数量
  imputationRate: number;      // 插补率 (0-1)
  executionTimeMs?: number;    // 执行耗时(毫秒)
  status: ImputationResultStatus;
  errorMessage?: string;
  executedAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### 6.5 插补详情

```typescript
/** 插补详情 - 记录每个插补点的信息 */
export interface ImputationDetail {
  id: number;
  resultId: number;
  columnName: string;
  rowIndex: number;
  timePoint?: string;
  originalValue?: number | null;  // 原始值 (null 表示缺失)
  imputedValue: number;           // 插补值
  confidence?: number;            // 置信度 (0-1)
  imputationMethod?: string;
  neighborValues?: number[];
  isApplied: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 6.6 列统计

```typescript
/** 插补列统计 */
export interface ImputationColumnStat {
  id: number;
  resultId: number;
  columnName: string;
  missingCount: number;      // 原缺失值数量
  imputedCount: number;      // 已插补数量
  imputationRate: number;    // 插补率
  meanBefore?: number;       // 插补前均值
  meanAfter?: number;        // 插补后均值
  stdBefore?: number;        // 插补前标准差
  stdAfter?: number;         // 插补后标准差
  minImputed?: number;       // 插补值最小值
  maxImputed?: number;       // 插补值最大值
  avgConfidence?: number;    // 平均置信度
  createdAt: string;
  updatedAt: string;
}
```

---

## 7. 前端组件使用

### 7.1 核心状态管理

```typescript
// ==================== 视图模式 ====================
type ViewMode = 'config' | 'result';
const currentView = ref<ViewMode>('config');

// ==================== 方法选择状态 ====================
const activeCategory = ref<ImputationCategory>('basic');
const selectedMethodId = ref<ImputationMethodId | null>(null);
const imputationMethods = ref<ImputationMethod[]>([]);
const methodParamsCache = ref<Record<string, ImputationMethodParam[]>>({});

// ==================== 参数配置状态 ====================
const columnSelectionMode = ref<'all' | 'manual'>('all');
const selectedColumns = ref<string[]>([]);
const paramValues = ref<Record<string, any>>({});

// ==================== 执行状态 ====================
const isExecuting = ref<boolean>(false);
const isPreviewing = ref(false);
const progressInfo = ref<ImputationProgressEvent | null>(null);

// ==================== 结果状态 ====================
const imputationResults = ref<ImputationResult[]>([]);
const currentResultId = ref<number | null>(null);
```

### 7.2 执行阶段定义

```typescript
// 根据方法类型动态调整显示的阶段
const stages = computed(() => {
  const commonStages = [
    { key: 'imputing', label: '插补', icon: '✏️' },
    { key: 'validating', label: '验证', icon: '✅' },
    { key: 'preview', label: '预览', icon: '👁️' },
    { key: 'saving', label: '保存', icon: '💾' },
  ];

  // 基础和统计方法不需要准备和训练阶段
  if (['basic', 'statistical'].includes(activeCategory.value)) {
    return commonStages;
  }

  // ML/DL 方法需要准备和训练阶段
  return [
    { key: 'preparing', label: '准备', icon: '📋' },
    { key: 'training', label: '训练', icon: '🎯' },
    ...commonStages
  ];
});
```

### 7.3 执行条件判断

```typescript
const canExecute = computed(() => {
  if (!selectedMethodId.value) return false;
  if (!props.datasetInfo) return false;
  if (!currentVersion.value) return false;
  if (columnSelectionMode.value === 'manual' && selectedColumns.value.length === 0) {
    return false;
  }
  return true;
});
```

---

## 8. 错误处理

### 8.1 常见错误类型

| 错误码 | 错误信息 | 原因 | 解决方案 |
|--------|----------|------|----------|
| VERSION_NOT_FOUND | 版本不存在: {versionId} | 版本ID无效或已被删除 | 刷新页面或重新选择版本 |
| FILE_NOT_FOUND | 文件不存在: {filePath} | 数据文件被移动或删除 | 重新导入数据 |
| EMPTY_DATA | 数据为空 | 版本数据文件为空 | 检查数据文件 |
| INVALID_COLUMNS | 无效的列: {columns} | 选择的列不存在于数据中 | 重新选择目标列 |
| RESULT_NOT_FOUND | Result not found | 插补结果不存在 | 刷新结果列表 |

### 8.2 错误处理示例

```typescript
// 前端错误处理
const executeImputation = async () => {
  try {
    isExecuting.value = true;
    
    const result = await window.electronAPI.invoke(
      API_ROUTES.IMPUTATION.EXECUTE, 
      payload
    );
    
    if (result.success) {
      // 成功处理
    } else {
      throw new Error(result.error || '执行失败');
    }
  } catch (error: any) {
    console.error("插补处理失败:", error);
    ElMessage.error(error.message || "插补处理失败，请重试");
  } finally {
    isExecuting.value = false;
  }
};
```

---

## 9. 常见问题

### Q1: 如何添加新的插补方法？

1. 在数据库 `conf_imputation_method` 表中添加方法配置
2. 在 `conf_imputation_method_param` 表中添加参数配置
3. 在 `ImputationService.ts` 的 `imputeColumn` 方法中实现算法逻辑

### Q2: 为什么某些方法显示为"不可用"？

- Python 方法需要配置 Python 环境
- 检查 `conf_imputation_method` 表的 `is_available` 字段

### Q3: 插补进度卡住怎么办？

1. 点击"取消"按钮终止当前任务
2. 检查数据量是否过大
3. 检查控制台是否有错误日志

### Q4: 如何回滚已应用的插补结果？

目前版本管理支持切换回原始版本，直接选择原版本即可。

### Q5: 支持哪些数据文件格式？

目前主要支持 CSV 格式。文件读取使用 `papaparse` 库进行解析。

---

## 附录: 数据库表结构

### conf_imputation_method (插补方法配置表)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键 |
| method_id | VARCHAR(50) | 方法标识符 |
| method_name | VARCHAR(100) | 方法名称 |
| category | VARCHAR(20) | 分类: basic/statistical/timeseries/ml/dl |
| description | TEXT | 方法描述 |
| requires_python | INTEGER | 是否需要Python (0/1) |
| is_available | INTEGER | 是否可用 (0/1) |
| estimated_time | VARCHAR(20) | 预估耗时: fast/medium/slow |
| accuracy | VARCHAR(20) | 预估准确度: low/medium/high |
| priority | INTEGER | 排序优先级 |
| applicable_data_types | TEXT | 适用数据类型 (JSON) |
| icon | VARCHAR(100) | 图标 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| is_del | INTEGER | 软删除标记 |

### biz_imputation_result (插补结果表)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键 |
| dataset_id | INTEGER | 数据集ID |
| version_id | INTEGER | 源版本ID |
| new_version_id | INTEGER | 新版本ID (应用后) |
| method_id | VARCHAR(50) | 使用的方法 |
| target_columns | TEXT | 目标列 (JSON) |
| method_params | TEXT | 方法参数 (JSON) |
| total_missing | INTEGER | 总缺失值数量 |
| imputed_count | INTEGER | 插补数量 |
| imputation_rate | REAL | 插补率 |
| execution_time_ms | INTEGER | 执行耗时 (毫秒) |
| status | VARCHAR(20) | 状态 |
| error_message | TEXT | 错误信息 |
| executed_at | DATETIME | 执行时间 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| deleted_at | DATETIME | 删除时间 |
| is_del | INTEGER | 软删除标记 |

### biz_imputation_detail (插补详情表)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键 |
| result_id | INTEGER | 关联的结果ID |
| column_name | VARCHAR(100) | 列名 |
| row_index | INTEGER | 行索引 |
| time_point | DATETIME | 时间点 |
| original_value | REAL | 原始值 |
| imputed_value | REAL | 插补值 |
| confidence | REAL | 置信度 (0-1) |
| imputation_method | VARCHAR(50) | 使用的方法 |
| neighbor_values | TEXT | 邻近值 (JSON) |
| is_applied | INTEGER | 是否已应用 (0/1) |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| is_del | INTEGER | 软删除标记 |

### biz_imputation_column_stat (插补列统计表)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键 |
| result_id | INTEGER | 关联的结果ID |
| column_name | VARCHAR(100) | 列名 |
| missing_count | INTEGER | 缺失值数量 |
| imputed_count | INTEGER | 插补数量 |
| imputation_rate | REAL | 插补率 |
| mean_before | REAL | 插补前均值 |
| mean_after | REAL | 插补后均值 |
| std_before | REAL | 插补前标准差 |
| std_after | REAL | 插补后标准差 |
| min_imputed | REAL | 插补值最小值 |
| max_imputed | REAL | 插补值最大值 |
| avg_confidence | REAL | 平均置信度 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| is_del | INTEGER | 软删除标记 |

---

*文档结束*
