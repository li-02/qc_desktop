<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, toRaw, shallowRef } from "vue";
import { ElMessage, ElNotification, ElMessageBox } from "element-plus";
import {
  Plus,
  Trash2,
  RefreshCw,
  Settings,
  LineChart,
  Check,
  List,
  Star,
  Play,
  X,
  Info,
  Search,
  ChevronRight,
  Link,
  Pencil,
  GripVertical,
  TrendingUp,
  Grid,
} from "lucide-vue-next";
import type { DatasetInfo } from "@shared/types/projectInterface";
import type { OutlierResult } from "@shared/types/database";
import type {
  ImputationMethodParam,
  ExecuteImputationRequest,
  ImputationMethodId,
  ImputationCategory,
  ImputationResultStatus,
  ImputationMethod,
  ImputationModel,
  ImputationResult,
  ImputationProgressEvent,
  ImputationColumnStat,
} from "@shared/types/imputation";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import { useGapFillingStore } from "@/stores/useGapFillingStore";
import { translateRemark } from "@/utils/versionUtils";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import * as echarts from "echarts";
import MissingMarkersEditor from "../common/MissingMarkersEditor.vue";
import CustomModelDialog from "./CustomModelDialog.vue";
import TargetColumnSelector from "../gapfilling/TargetColumnSelector.vue";
import type { ColumnInfo } from "../gapfilling/TargetColumnSelector.vue";

// ==================== Props & Emits ====================

interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  startImputation: [options: any];
  refresh: [];
}>();

// ==================== 视图模式 ====================
type ViewMode = "config" | "result";
const currentView = ref<ViewMode>("config");

// 监听视图模式变化，离开结果页时销毁图表
watch(currentView, newVal => {
  if (newVal !== "result") {
    disposeChart();
  }
});

// ==================== 侧边栏状态 ====================
const datasetStore = useDatasetStore();
const outlierStore = useOutlierDetectionStore();
const gapFillingStore = useGapFillingStore();
const currentVersion = computed(() => datasetStore.currentVersion);
const versions = computed(() => datasetStore.versions);
const currentVersionStats = computed(() => datasetStore.currentVersionStats);

// 异常检测结果（用于获取版本名称）
const outlierResults = ref<OutlierResult[]>([]);
// 版本ID -> 异常检测结果名称的映射
const versionNameMap = computed(() => {
  const map = new Map<number, string>();
  for (const result of outlierResults.value) {
    if (result.generated_version_id && result.name) {
      map.set(result.generated_version_id, result.name);
    }
  }
  return map;
});

const imputationResults = ref<ImputationResult[]>([]);
const currentResultId = ref<number | null>(null);

// 重命名状态
const editingResultId = ref<number | null>(null);
const editingName = ref("");

// 拖拽状态
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

const visibleImputationResults = computed(() => {
  return imputationResults.value;
});

// ==================== 方法选择状态 ====================
const categories = [
  { value: "basic", label: "基础方法", icon: "📊" },
  { value: "statistical", label: "统计方法", icon: "📈" },
  { value: "ml", label: "机器学习", icon: "🤖" },
  { value: "dl", label: "深度学习", icon: "🧠" },
  { value: "custom", label: "自定义模型", icon: "🔌" },
];

// ==================== 自定义模型对话框 ====================
const showCustomModelDialog = ref(false);

const onCustomModelRegistered = () => {
  // 刷新方法列表
  loadImputationMethods();
  // 切换到自定义分类
  activeCategory.value = "custom";
};

const activeCategory = ref<ImputationCategory>("basic");
const selectedMethodId = ref<ImputationMethodId | null>(null);

// 从数据库获取的插补方法
const imputationMethods = ref<ImputationMethod[]>([]);
// 硬编码的推荐方法ID
const recommendedMethodIds = ref<ImputationMethodId[]>(["LINEAR"]);

// 方法参数缓存
const methodParamsCache = ref<Record<string, ImputationMethodParam[]>>({});

// 加载插补方法
const loadImputationMethods = async () => {
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_AVAILABLE_METHODS);
    if (result.success) {
      imputationMethods.value = result.data;
    } else {
      ElMessage.error("加载插补方法失败: " + (result.error || "未知错误"));
    }
  } catch (error: any) {
    console.error("加载插补方法失败:", error);
    ElMessage.error("加载插补方法失败: " + error.message);
  }
};

// 获取方法参数
const loadMethodParams = async (methodId: string): Promise<ImputationMethodParam[]> => {
  if (methodParamsCache.value[methodId]) {
    return methodParamsCache.value[methodId];
  }

  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_METHOD_PARAMS, methodId);
    if (result.success) {
      methodParamsCache.value[methodId] = result.data;
      return result.data;
    } else {
      ElMessage.error("加载方法参数失败: " + (result.error || "未知错误"));
      return [];
    }
  } catch (error: any) {
    console.error("加载方法参数失败:", error);
    ElMessage.error("加载方法参数失败: " + error.message);
    return [];
  }
};

// 获取参数选项
const getParamOptions = (param: ImputationMethodParam): { label: string; value: any }[] => {
  if (!param.options) return [];

  try {
    const options = JSON.parse(param.options);
    return options.map((opt: any) => ({
      label: opt.label,
      value: typeof opt.value === "number" ? opt.value : opt.value,
    }));
  } catch (error) {
    console.error("解析参数选项失败:", error);
    return [];
  }
};

const isParamValueMissing = (param: ImputationMethodParam, value: any): boolean => {
  if (value === null || value === undefined) return true;

  switch (param.paramType) {
    case "number":
      return Number.isNaN(Number(value));
    case "string":
    case "select":
      return String(value).trim().length === 0;
    default:
      return false;
  }
};

const getNumberPrecision = (param: ImputationMethodParam): number | undefined => {
  const candidates = [param.stepValue, param.defaultValue]
    .map(v => (v === undefined || v === null ? "" : String(v)))
    .filter(Boolean);

  let precision = 0;
  for (const candidate of candidates) {
    const dotIndex = candidate.indexOf(".");
    if (dotIndex >= 0) {
      precision = Math.max(precision, candidate.length - dotIndex - 1);
    }
  }

  return precision > 0 ? precision : undefined;
};

// ==================== 参数配置状态 ====================
const columnSelectionMode = ref<"all" | "manual">("all");
const selectedColumns = ref<string[]>([]);
const paramValues = ref<Record<string, any>>({});

// 模型相关状态（ML/DL 方法）
const activeModels = ref<ImputationModel[]>([]);
const selectedModelId = ref<number | null>(null);
// 列名映射：key=模型期望列名, value=用户文件中选择的列名
const columnMapping = ref<Record<string, string>>({});
// 折叠面板状态：控制「列名映射」和「模型超参数」区域的展开/折叠
const modelConfigCollapse = ref<string[]>([]);

// ==================== 执行状态 ====================
const isExecuting = ref<boolean>(false);
const progressInfo = ref<ImputationProgressEvent | null>(null);
const executionLogs = ref<{ id: number; time: string; level: string; message: string }[]>([]);

// ==================== 可视化状态 ====================
const vizSelectedColumn = ref<string>("");
const vizMode = ref<"timeseries" | "distribution" | "scatter" | "table">("timeseries");
const timeSeriesChart = ref<HTMLDivElement | null>(null);
const timeSeriesInstance = shallowRef<echarts.ECharts | null>(null);
const distributionChart = ref<HTMLDivElement | null>(null);
const distributionInstance = shallowRef<echarts.ECharts | null>(null);
const scatterChart = ref<HTMLDivElement | null>(null);
const scatterInstance = shallowRef<echarts.ECharts | null>(null);
const allTableData = shallowRef<any[]>([]); // 存储所有表格数据
const imputedMap = shallowRef<Map<number, { value: number; confidence?: number }>>(new Map()); // 存储插补详情映射
const allColumnStats = shallowRef<ImputationColumnStat[]>([]); // 所有列的统计报告
// 缓存当前列数据，供分布图/散点图复用
const cachedOriginalValues = shallowRef<number[]>([]);
const cachedImputedValues = shallowRef<number[]>([]);
const cachedOriginalScatter = shallowRef<[number, number][]>([]); // [epochMs, value]
const cachedImputedScatter = shallowRef<[number, number][]>([]); // [epochMs, value]
const currentPage = ref(1);
const pageSize = ref(20);
const comparisonTableData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;

  return allTableData.value.slice(start, end).map((row: any, index: number) => {
    // 全局索引
    const globalIndex = start + index;
    const imputedInfo = imputedMap.value.get(globalIndex);

    return {
      index: globalIndex + 1, // 序号
      timestamp: row._epochMs ? new Date(row._epochMs).toLocaleString() : row.TIMESTAMP || "",
      original: row[vizSelectedColumn.value],
      imputed: imputedInfo?.value ?? null,
      confidence: imputedInfo?.confidence ?? null, // 保留数据以便逻辑处理，虽然界面不显示
    };
  });
});

const isSavedAsVersion = ref(false);

// ==================== Computed ====================
const filteredMethods = computed<ImputationMethod[]>(() => {
  return imputationMethods.value.filter(m => m.category === activeCategory.value);
});

const selectedMethod = computed<ImputationMethod | null>(() => {
  return imputationMethods.value.find(m => m.methodId === selectedMethodId.value) || null;
});

const isReddyProcMDSMethod = computed(() => selectedMethodId.value === "MDS_REDDYPROC");

// 判断当前方法是否需要模型（ML/DL/自定义 类方法）
const isModelBasedMethod = computed(() => {
  const method = selectedMethod.value;
  if (!method) return false;
  return method.category === "ml" || method.category === "dl" || method.category === "custom";
});

// 当前选中的模型对象
const selectedModel = computed<ImputationModel | null>(() => {
  if (!selectedModelId.value) return null;
  return activeModels.value.find(m => m.id === selectedModelId.value) || null;
});

// 模型要求的特征列（不含目标列，需要用户提供列映射的列）
const modelRequiredFeatureColumns = computed<string[]>(() => {
  const model = selectedModel.value;
  if (!model?.featureColumns) return [];
  return model.featureColumns;
});

// 选中模型的 modelParams 键列表（用于动态渲染模型超参数表单）
const selectedModelParamKeys = computed<string[]>(() => {
  const model = selectedModel.value;
  if (!model?.modelParams) return [];
  return Object.keys(model.modelParams);
});

// 将参数键名格式化为可读标签（下划线→空格，首字母大写）
const formatParamKey = (key: string): string => {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
};

// 列名映射是否完整（所有必需的特征列都已映射）
const isColumnMappingComplete = computed<boolean>(() => {
  if (!isModelBasedMethod.value || !selectedModel.value) return true;
  const required = modelRequiredFeatureColumns.value;
  if (required.length === 0) return true;
  return required.every(col => !!columnMapping.value[col]);
});

// 列名映射摘要（折叠标题用）
const columnMappingSummary = computed(() => {
  const required = modelRequiredFeatureColumns.value;
  if (required.length === 0) return { mapped: 0, total: 0, complete: true };
  const mapped = required.filter(col => !!columnMapping.value[col]).length;
  return { mapped, total: required.length, complete: mapped === required.length };
});

// 超参数摘要（折叠标题用）
const modelParamsSummary = computed(() => {
  const keys = selectedModelParamKeys.value;
  return { count: keys.length };
});

const availableColumns = computed<ColumnInfo[]>(() => {
  if (!props.datasetInfo?.originalFile?.columns) return [];

  // 1. 优先使用 GapFillingStore 的实时检测结果 (最准确)
  if (
    gapFillingStore.missingStats &&
    gapFillingStore.missingStats.datasetId === Number(props.datasetInfo.id) &&
    gapFillingStore.missingStats.versionId === currentVersion.value?.id
  ) {
    const statsMap = new Map(gapFillingStore.missingStats.columnStats.map(c => [c.columnName, c.missingCount]));
    const timeColumn = props.datasetInfo.timeColumn;

    return props.datasetInfo.originalFile.columns
      .filter(col => !timeColumn || col !== timeColumn)
      .map(col => {
        const count = statsMap.get(col) || 0;
        return {
          name: col,
          missingCount: count,
          missingRate: getMissingRate(col, count),
          type: getColumnType(col),
        };
      });
  }

  // 2. 其次使用当前版本的统计信息
  const stats = currentVersionStats.value;
  let missingStatus: Record<string, number> = {};

  if (stats?.columnStats) {
    if (stats.columnStats.columnMissingStatus) {
      missingStatus = stats.columnStats.columnMissingStatus;
    } else {
      // 兼容旧格式
      missingStatus = stats.columnStats;
    }
  } else {
    // 3. 回退到原始文件统计
    missingStatus = props.datasetInfo.originalFile.dataQuality?.columnMissingStatus || {};
  }

  // 获取时间列名称，用于过滤
  const timeColumn = props.datasetInfo.timeColumn;

  return props.datasetInfo.originalFile.columns
    .filter(col => !timeColumn || col !== timeColumn) // 过滤掉时间列
    .map(col => ({
      name: col,
      missingCount: missingStatus[col] || 0,
      missingRate: getMissingRate(col, missingStatus[col] || 0),
      type: getColumnType(col),
    }));
});

// 监听 vizMode 变化，切换时重绘/重置对应图表
watch(vizMode, newVal => {
  if (newVal === "timeseries") {
    nextTick(() => {
      timeSeriesInstance.value?.resize();
    });
  } else if (newVal === "distribution") {
    nextTick(() => {
      updateDistributionChart();
    });
  } else if (newVal === "scatter") {
    nextTick(() => {
      updateScatterChart();
    });
  }
});

// 监听选中列变化，刷新图表
watch(vizSelectedColumn, () => {
  if (vizSelectedColumn.value) {
    updateComparisonChart();
  }
});

// 切换模型时重新初始化列映射
watch(selectedModelId, () => {
  initColumnMapping();
  applyModelParams();
});

const columnsWithMissing = computed(() => {
  return availableColumns.value.filter(col => col.missingCount > 0);
});

const canExecute = computed(() => {
  if (!selectedMethodId.value) return false;
  if (!props.datasetInfo) return false;
  if (!currentVersion.value) return false; // 必须有选中的版本
  if (columnSelectionMode.value === "manual" && selectedColumns.value.length === 0) return false;
  // 使用注册模型（有 modelParams）时跳过通用方法参数的必填校验
  const usingModelParams = isModelBasedMethod.value && !!selectedModel.value && selectedModelParamKeys.value.length > 0;
  if (!usingModelParams && missingRequiredParams.value.length > 0) return false;
  if (isModelBasedMethod.value && !isColumnMappingComplete.value) return false;
  return true;
});

const progress = computed(() => {
  return progressInfo.value?.progress || 0;
});
const progressMessage = computed(() => progressInfo.value?.message || "");

// 当前方法的参数配置
const currentMethodParams = computed(() => {
  if (!selectedMethodId.value) return [];
  return methodParamsCache.value[selectedMethodId.value] || [];
});

const missingRequiredParams = computed(() => {
  return currentMethodParams.value.filter(
    param => param.isRequired && isParamValueMissing(param, paramValues.value[param.paramKey])
  );
});

// 高级参数
const isReddyProcGeoParam = (param: ImputationMethodParam) => {
  const key = param.paramKey.toLowerCase();
  const name = param.paramName.toLowerCase();
  return (
    /latitude|lat|纬度/.test(key) ||
    /latitude|lat|纬度/.test(name) ||
    /longitude|lon|lng|经度/.test(key) ||
    /longitude|lon|lng|经度/.test(name) ||
    /timezone|time_zone|tz|时区/.test(key) ||
    /timezone|time\s*zone|tz|时区/.test(name)
  );
};

const isReddyProcMappingParam = (param: ImputationMethodParam) => {
  if (!isReddyProcMDSMethod.value || isReddyProcGeoParam(param)) return false;
  const key = param.paramKey.toLowerCase();
  const name = param.paramName.toLowerCase();
  return param.paramType === "string" && (/_col$|_column$/.test(key) || /列|column/.test(name));
};

const getReddyProcMappingExpectedLabel = (param: ImputationMethodParam) => {
  const fallback = param.paramName.replace(/列/g, "").trim();
  return String(param.defaultValue ?? "").trim() || fallback || param.paramKey;
};

const isReddyProcMappingConfigured = (param: ImputationMethodParam) => {
  return String(paramValues.value[param.paramKey] ?? "").trim().length > 0;
};

const advancedParams = computed(() => {
  return currentMethodParams.value.filter(p => p.isAdvanced);
});

// 普通参数
const basicParams = computed(() => {
  return currentMethodParams.value.filter(p => !p.isAdvanced);
});

const reddyProcGeoParams = computed(() => {
  return basicParams.value.filter(isReddyProcGeoParam);
});

const reddyProcMappingParams = computed(() => {
  return basicParams.value.filter(isReddyProcMappingParam);
});

const reddyProcGeneralParams = computed(() => {
  return basicParams.value.filter(param => !isReddyProcGeoParam(param) && !isReddyProcMappingParam(param));
});

const reddyProcMappingSummary = computed(() => {
  const total = reddyProcMappingParams.value.length;
  const mapped = reddyProcMappingParams.value.filter(isReddyProcMappingConfigured).length;
  return { total, mapped, complete: total === 0 || mapped === total };
});

// 是否有高级参数
const hasAdvancedParams = computed(() => {
  return advancedParams.value.length > 0;
});

// ==================== 流程控制 ====================
const showVersionDrawer = ref(false);

const handleVersionSwitchFromManager = async (versionId: number) => {
  await handleVersionChange(versionId);
  showVersionDrawer.value = false;
};

// ==================== Methods ====================
// 获取缺失率 (传入缺失数以避免重复计算)
const getMissingRate = (columnName: string, count?: number): number => {
  const missingCount = count !== undefined ? count : getMissingCount(columnName);

  // 优先使用当前版本的总行数
  const totalRows = currentVersionStats.value?.totalRows || props.datasetInfo?.originalFile?.rows || 1;
  return (missingCount / totalRows) * 100;
};

// 获取缺失数 (仅用于非批量获取场景)
const getMissingCount = (columnName: string): number => {
  const stats = currentVersionStats.value;
  if (stats?.columnStats) {
    if (stats.columnStats.columnMissingStatus) {
      return stats.columnStats.columnMissingStatus[columnName] || 0;
    }
    return stats.columnStats[columnName] || 0;
  }
  return props.datasetInfo?.originalFile?.dataQuality?.columnMissingStatus?.[columnName] || 0;
};

const getColumnType = (columnName: string): string => {
  if (columnName.includes("TIMESTAMP") || columnName.includes("TIME")) return "datetime";
  return "numeric";
};

const isRecommended = (methodId: ImputationMethodId): boolean => {
  return recommendedMethodIds.value.includes(methodId);
};

const getTimeLabel = (time?: "fast" | "medium" | "slow"): string => {
  const labels = { fast: "快速", medium: "中等", slow: "较慢" };
  return labels[time || "medium"];
};

const getMethodName = (methodId: ImputationMethodId): string => {
  return imputationMethods.value.find(m => m.methodId === methodId)?.methodName || methodId;
};

const getStatusType = (status: ImputationResultStatus): string => {
  const types: Record<ImputationResultStatus, string> = {
    PENDING: "info",
    RUNNING: "warning",
    COMPLETED: "success",
    FAILED: "danger",
    APPLIED: "success",
    REVERTED: "info",
  };
  return types[status];
};

const getStatusText = (status: ImputationResultStatus): string => {
  const texts: Record<ImputationResultStatus, string> = {
    PENDING: "待执行",
    RUNNING: "执行中",
    COMPLETED: "已完成",
    FAILED: "失败",
    APPLIED: "已应用",
    REVERTED: "已撤销",
  };
  return texts[status];
};

const getStageLabel = (stage: string): string => {
  const map: Record<string, string> = {
    preparing: "准备数据",
    training: "模型训练",
    imputing: "执行插补",
    validating: "结果验证",
    preview: "生成预览",
    saving: "保存结果",
    completed: "完成",
  };
  return map[stage] || stage;
};

const getVersionLabel = (stage?: string, versionId?: number) => {
  // 优先使用版本的 remark
  if (versionId) {
    const ver = versions.value.find(v => v.id === versionId);
    if (ver?.remark) {
      return translateRemark(ver.remark);
    }
  }

  // 回退到默认标签
  if (stage === "RAW") return "原始版本";
  if (stage === "FILTERED" && versionId) {
    const outlierName = versionNameMap.value.get(versionId);
    if (outlierName) return outlierName;
    return "经过过滤";
  }
  if (stage === "QC") return "插补后";
  return stage || "未知版本";
};

const getVersionTagType = (stage?: string) => {
  switch (stage) {
    case "RAW":
      return "info";
    case "FILTERED":
      return "warning";
    case "QC":
      return "success";
    default:
      return "info";
  }
};

import { formatLocalWithTZ } from "@/utils/timeUtils";

const formatDateTime = (dateInput: string | number): string => {
  // 确保字符串时间被视为UTC (如果未包含时区信息)
  let input = dateInput;
  if (typeof input === "string" && !input.endsWith("Z") && !input.includes("+") && !input.includes("T")) {
    // 简单的 "YYYY-MM-DD HH:mm:ss" 格式，通常是数据库存储的 UTC 时间
    input = input.replace(" ", "T") + "Z";
  } else if (typeof input === "string" && !input.endsWith("Z") && !input.includes("+")) {
    // 已经是 ISO 格式但没有时区，视为 UTC
    input = input + "Z";
  }

  return formatLocalWithTZ(input);
};

const getHistoryTitle = (result: ImputationResult) => {
  // 如果有自定义名称，直接使用
  if (result.name) {
    return result.name;
  }

  // 默认名称：方法-参数
  const method = getMethodName(result.methodId);

  // 参数 (格式化，如果太多只显示一部分)
  let paramsStr = "";
  if (result.methodParams && Object.keys(result.methodParams).length > 0) {
    const entries = Object.entries(result.methodParams).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length > 0) {
      const maxShow = 2;
      const shown = entries
        .slice(0, maxShow)
        .map(([, v]) => String(v))
        .join(", ");
      paramsStr = entries.length > maxShow ? `${shown}...` : shown;
    }
  }

  return paramsStr ? `${method} - ${paramsStr}` : method;
};

const handleVersionChange = async (versionId: number) => {
  if (versionId === currentVersion.value?.id) return;
  await datasetStore.setCurrentVersion(versionId);
  // 切换版本时清除之前的缺失统计
  gapFillingStore.clearStats();
  ElMessage.success("已切换数据版本");
};

// 检测缺失值 (手动触发，带提示)
const detectMissingValues = async () => {
  if (!props.datasetInfo?.id || !currentVersion.value?.id) {
    ElMessage.warning("请先选择数据集和版本");
    return;
  }

  try {
    // 设置目标版本
    gapFillingStore.setTargetVersion(parseInt(props.datasetInfo.id), currentVersion.value.id);

    // 执行缺失值检测
    const stats = await gapFillingStore.loadVersionMissingStats(
      parseInt(props.datasetInfo.id),
      currentVersion.value.id
    );

    if (stats) {
      ElMessage.success(`检测完成，发现 ${stats.totalMissingValues} 个缺失值`);
    } else {
      ElMessage.error("检测失败，请重试");
    }
  } catch (error: any) {
    console.error("检测缺失值失败:", error);
    ElMessage.error("检测失败: " + error.message);
  }
};

// 自动检测缺失值 (后台静默执行，不阻塞UI)
const autoDetectMissingValues = async () => {
  if (!props.datasetInfo?.id || !currentVersion.value?.id) {
    return;
  }

  const datasetId = parseInt(props.datasetInfo.id);
  const versionId = currentVersion.value.id;

  // 如果已经有当前版本的检测结果，从历史记录恢复
  if (gapFillingStore.restoreFromHistory(datasetId, versionId)) {
    return;
  }

  try {
    // 设置目标版本
    gapFillingStore.setTargetVersion(datasetId, versionId);

    // 后台执行缺失值检测，不显示 loading 提示
    await gapFillingStore.loadVersionMissingStats(datasetId, versionId);
    // 自动检测完成后不显示成功消息，保持静默
  } catch (error: any) {
    console.error("[自动检测] 缺失值检测失败:", error);
    // 自动检测失败时静默处理，用户可以手动重试
  }
};

const formatVersionLabel = (version: any) => {
  const label = getVersionLabel(version.stageType, version.id);
  return `${label} #${version.id}`;
};

// ==================== 视图切换 ====================
const switchToConfig = () => {
  currentView.value = "config";
  currentResultId.value = null;
  progressInfo.value = null;
  isExecuting.value = false;
};

const viewResult = (result: ImputationResult) => {
  // Clear execution state to prevent "running" status from persisting
  isExecuting.value = false;
  progressInfo.value = null;

  // 确保清理旧图表
  disposeChart();

  currentResultId.value = result.id;
  currentView.value = "result";
  isSavedAsVersion.value = false;
  // 加载结果详情
  loadResultComparison(result.id);
};

const viewCurrentResult = () => {
  if (!currentResultId.value) return;
  const result = imputationResults.value.find(r => r.id === currentResultId.value);
  if (result) {
    viewResult(result);
  } else {
    // Fallback if result not found in list yet
    isExecuting.value = false;
    progressInfo.value = null;

    currentView.value = "result";
    isSavedAsVersion.value = false;
    loadResultComparison(currentResultId.value);
  }
};

// ==================== 方法选择 ====================
const selectMethod = async (method: ImputationMethod) => {
  if (!method.isAvailable) return;

  const mId =
    method.methodId || (typeof method.id === "string" ? (method.id as unknown as ImputationMethodId) : undefined);
  if (!mId) {
    console.error("Method ID missing:", method);
    ElMessage.error("方法ID缺失，无法选择");
    return;
  }

  selectedMethodId.value = mId;
  // 初始化默认参数
  await initMethodParams(method);
  // 如果是模型类方法，加载可用模型
  if (method.category === "ml" || method.category === "dl" || method.category === "custom") {
    await loadModelsForMethod();
  } else {
    activeModels.value = [];
    selectedModelId.value = null;
    columnMapping.value = {};
  }
};

const initMethodParams = async (method: ImputationMethod) => {
  // 初始化默认参数为空
  paramValues.value = {};

  // 从数据库加载方法参数配置
  const mId = selectedMethodId.value || method.methodId;
  if (!mId) return;
  const params = await loadMethodParams(mId);

  // 根据参数配置初始化默认值
  for (const param of params) {
    if (param.defaultValue !== null) {
      // 根据参数类型转换默认值
      switch (param.paramType) {
        case "number":
          paramValues.value[param.paramKey] = Number(param.defaultValue);
          break;
        case "boolean":
          paramValues.value[param.paramKey] = param.defaultValue === "true";
          break;
        case "select":
        case "string":
          paramValues.value[param.paramKey] = param.defaultValue;
          break;
        default:
          paramValues.value[param.paramKey] = param.defaultValue;
      }
    }
  }
};

// 根据模型 targetColumn 与当前数据集列名进行模糊匹配，选出最佳模型
const findBestMatchingModel = (models: ImputationModel[]): ImputationModel | null => {
  if (!models.length) return null;

  const userCols = availableColumns.value.map(c => c.name);
  const userColsLower = userCols.map(c => c.toLowerCase());

  // 对每个模型计算匹配分数：0=不匹配，1=包含匹配，2=忽略大小写精确匹配，3=精确匹配
  let bestModel: ImputationModel | null = null;
  let bestScore = 0;

  for (const model of models) {
    if (!model.targetColumn) continue;

    const targetLower = model.targetColumn.toLowerCase();

    // 3 分：精确匹配（大小写完全一致）
    if (userCols.includes(model.targetColumn)) {
      if (3 > bestScore || (3 === bestScore && model.isActive)) {
        bestModel = model;
        bestScore = 3;
      }
      continue;
    }

    // 2 分：忽略大小写的精确匹配（如 nee → NEE）
    if (userColsLower.includes(targetLower)) {
      if (2 > bestScore || (2 === bestScore && model.isActive)) {
        bestModel = model;
        bestScore = 2;
      }
      continue;
    }

    // 1 分：包含匹配（数据集列名包含模型目标列名，如 NEE_VUT_REF 包含 nee）
    const hasContainMatch = userColsLower.some(col => col.includes(targetLower));
    if (hasContainMatch) {
      if (1 > bestScore || (1 === bestScore && model.isActive)) {
        bestModel = model;
        bestScore = 1;
      }
    }
  }

  // 如果没找到匹配，回退到第一个激活的模型 → 第一个模型
  if (!bestModel) {
    bestModel = models.find(m => m.isActive) ?? models[0] ?? null;
  }

  return bestModel;
};

// 加载当前方法对应的可用模型
const loadModelsForMethod = async () => {
  if (!selectedMethodId.value) return;
  try {
    const datasetId = props.datasetInfo?.id ? Number(props.datasetInfo.id) : undefined;
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_MODELS_BY_DATASET, {
      datasetId,
      methodId: selectedMethodId.value,
    });
    if (result.success && result.data) {
      activeModels.value = result.data as ImputationModel[];
      // 智能选择模型：根据模型 targetColumn 与当前数据集列名的模糊匹配来自动选中
      const bestModel = findBestMatchingModel(activeModels.value);
      selectedModelId.value = bestModel?.id ?? activeModels.value[0]?.id ?? null;
      // 初始化列映射
      initColumnMapping();
      // 用模型训练时保存的超参数覆盖参数表单默认值
      applyModelParams();
    } else {
      activeModels.value = [];
      selectedModelId.value = null;
      columnMapping.value = {};
    }
  } catch (e) {
    console.error("加载模型列表失败:", e);
    activeModels.value = [];
    selectedModelId.value = null;
    columnMapping.value = {};
  }
};

// 初始化/重置列映射（基于选中模型的 featureColumns）
const initColumnMapping = () => {
  const model = selectedModel.value ?? activeModels.value.find(m => m.id === selectedModelId.value);
  if (!model?.featureColumns) {
    columnMapping.value = {};
    return;
  }
  const newMapping: Record<string, string> = {};
  const userCols = availableColumns.value.map(c => c.name);
  // 预计算小写列名用于模糊匹配
  const userColsLower = userCols.map(c => c.toLowerCase());

  for (const modelCol of model.featureColumns) {
    // 1. 已保存的映射优先
    if (model.columnMapping?.[modelCol]) {
      newMapping[modelCol] = model.columnMapping[modelCol];
      continue;
    }

    // 2. 精确同名匹配
    if (userCols.includes(modelCol)) {
      newMapping[modelCol] = modelCol;
      continue;
    }

    // 3. 默认模糊匹配：统一转小写后匹配
    const modelColLower = modelCol.toLowerCase();

    // 3a. 大小写不敏感的精确匹配（如 rh → RH, vpd → VPD）
    const exactIdx = userColsLower.indexOf(modelColLower);
    if (exactIdx !== -1) {
      newMapping[modelCol] = userCols[exactIdx];
      continue;
    }

    // 3b. 包含匹配：用户列名包含模型列名（如 PPFD_IN 包含 ppfd）
    //     取最短的匹配项（最具体的列名）
    let bestMatch = "";
    let bestLen = Infinity;
    for (let i = 0; i < userCols.length; i++) {
      if (userColsLower[i].includes(modelColLower) && userCols[i].length < bestLen) {
        bestMatch = userCols[i];
        bestLen = userCols[i].length;
      }
    }
    newMapping[modelCol] = bestMatch; // "" 如果没匹配到
  }
  columnMapping.value = newMapping;

  // 自动展开/折叠：映射不完整时展开列映射面板，完整时折叠
  const hasIncomplete = Object.values(newMapping).some(v => !v);
  if (hasIncomplete) {
    if (!modelConfigCollapse.value.includes("column-mapping")) {
      modelConfigCollapse.value = [...modelConfigCollapse.value, "column-mapping"];
    }
  } else {
    modelConfigCollapse.value = modelConfigCollapse.value.filter(v => v !== "column-mapping");
  }
};

// 将模型训练时保存的超参数覆盖到参数表单中（保留表单中模型未覆盖的参数）
const applyModelParams = () => {
  const model = selectedModel.value ?? activeModels.value.find(m => m.id === selectedModelId.value);
  if (!model?.modelParams) return;
  for (const [key, value] of Object.entries(model.modelParams)) {
    if (value !== null && value !== undefined) {
      paramValues.value[key] = value;
    }
  }
};

// 保存列映射到数据库
const saveColumnMapping = async () => {
  if (!selectedModelId.value) return;
  try {
    await window.electronAPI.invoke(API_ROUTES.IMPUTATION.UPDATE_MODEL, {
      modelId: selectedModelId.value,
      columnMapping: toRaw(columnMapping.value),
    });
  } catch (e) {
    console.error("保存列映射失败:", e);
  }
};

// ==================== 执行插补 ====================
const executeImputation = async () => {
  if (!canExecute.value || !selectedMethodId.value || !currentVersion.value) return;

  try {
    isExecuting.value = true;
    progressInfo.value = {
      resultId: 0,
      progress: 0,
      stage: "preparing",
      message: "准备数据...",
    };
    executionLogs.value = [];

    const targetCols =
      columnSelectionMode.value === "all"
        ? availableColumns.value.map(c => c.name) // 明确传递所有列名
        : selectedColumns.value;

    // 执行前保存列映射配置（持久化用户的映射选择）
    if (isModelBasedMethod.value && selectedModelId.value) {
      await saveColumnMapping();
    }

    ElNotification({
      title: "开始插补",
      message: `正在使用 ${getMethodName(selectedMethodId.value)} 方法进行插补...`,
      type: "info",
      duration: 3000,
    });

    if (!currentVersion.value?.id) {
      ElMessage.error("无法获取当前数据版本ID，请尝试重新选择版本或刷新页面");
      isExecuting.value = false;
      return;
    }

    const payload: ExecuteImputationRequest = {
      datasetId: parseInt(String(props.datasetInfo?.id || "0")),
      versionId: currentVersion.value.id,
      methodId: selectedMethodId.value!,
      targetColumns: toRaw(targetCols),
      params: toRaw(paramValues.value),
      columnMapping: isModelBasedMethod.value ? toRaw(columnMapping.value) : undefined,
    };

    console.log("[GapFillingPanel] Debug Execution Payload:", payload);

    // 调用后端 API
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.EXECUTE, payload);

    if (result.success) {
      ElNotification({
        title: "插补计算完成",
        message: "计算已完成，请查看结果",
        type: "success",
        duration: 5000,
      });

      // 更新状态，但不自动跳转
      currentResultId.value = result.resultId;
      isExecuting.value = false;

      // 手动设置进度为完成状态
      progressInfo.value = {
        resultId: result.resultId,
        progress: 100,
        stage: "completed",
        message: "插补计算已完成，请点击查看结果",
      };

      // 刷新历史记录
      await loadHistory();
      emit("refresh");
    } else {
      throw new Error(result.error || "执行失败");
    }
  } catch (error: any) {
    console.error("插补处理失败:", error);
    ElMessage.error(error.message || "插补处理失败，请重试");
    addLog("error", error.message || "插补处理失败");
    isExecuting.value = false;
  }
};

// 监听进度事件
const setupProgressListeners = () => {
  window.electronAPI.on("imputation:progress", (event: any) => {
    // 确保是当前任务的进度
    // 由于 executeImputation 是异步等待，我们这里直接更新 UI
    progressInfo.value = event;

    // 添加日志
    if (
      event.message &&
      (!executionLogs.value.length || executionLogs.value[executionLogs.value.length - 1].message !== event.message)
    ) {
      addLog("info", event.message);
    }
  });
};

const addLog = (level: string, message: string) => {
  executionLogs.value.push({
    id: Date.now(),
    time: new Date().toLocaleTimeString(),
    level,
    message,
  });
};

const cancelExecution = () => {
  isExecuting.value = false;
  progressInfo.value = null;
  ElMessage.warning("已取消执行");
};

// ==================== 结果相关 ====================
const loadHistory = async () => {
  if (!props.datasetInfo) return;

  // 版本隔离：如果没有选中版本，清空历史并返回
  if (!currentVersion.value?.id) {
    imputationResults.value = [];
    return;
  }

  const datasetId = parseInt(props.datasetInfo.id);
  const currentVerId = currentVersion.value.id;

  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_RESULTS_BY_DATASET, {
      datasetId,
      versionId: currentVerId, // 增加版本过滤
      limit: 50,
      offset: 0,
    });

    if (result.success) {
      imputationResults.value = result.data;
    }
  } catch (error) {
    console.error("加载历史记录失败:", error);
  }
};

const deleteResult = async (resultId: number) => {
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.DELETE_RESULT, resultId);
    if (result.success) {
      imputationResults.value = imputationResults.value.filter(r => r.id !== resultId);
      if (currentResultId.value === resultId) {
        currentResultId.value = null;
        currentView.value = "config";
      }
      ElMessage.success("已删除");
    } else {
      ElMessage.error(result.error || "删除失败");
    }
  } catch (error: any) {
    ElMessage.error(error.message || "删除失败");
  }
};

// === 重命名相关 ===
const startRenaming = (result: any) => {
  editingResultId.value = result.id;
  editingName.value = getHistoryTitle(result);
};

const saveRenaming = async () => {
  if (!editingResultId.value) return;
  const name = editingName.value.trim();
  if (!name) {
    cancelRenaming();
    return;
  }
  try {
    await window.electronAPI.invoke(API_ROUTES.IMPUTATION.RENAME_RESULT, {
      id: editingResultId.value,
      name,
    });
    const target = imputationResults.value.find(r => r.id === editingResultId.value);
    if (target) target.name = name;
  } catch (error: any) {
    ElMessage.error(error.message || "重命名失败");
  }
  cancelRenaming();
};

const cancelRenaming = () => {
  editingResultId.value = null;
  editingName.value = "";
};

// === 拖拽排序相关 ===
const onDragStart = (index: number) => {
  dragIndex.value = index;
};

const onDragOver = (index: number, event: DragEvent) => {
  event.preventDefault();
  dragOverIndex.value = index;
};

const onDrop = async (index: number) => {
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null;
    dragOverIndex.value = null;
    return;
  }
  const list = [...imputationResults.value];
  const [moved] = list.splice(dragIndex.value, 1);
  list.splice(index, 0, moved);
  imputationResults.value = list;
  dragIndex.value = null;
  dragOverIndex.value = null;
  const orders = list.map((r, i) => ({ id: r.id, sortOrder: i }));
  try {
    await window.electronAPI.invoke(API_ROUTES.IMPUTATION.REORDER_RESULTS, { orders });
  } catch (error: any) {
    ElMessage.error(error.message || "排序失败");
  }
};

const onDragEnd = () => {
  dragIndex.value = null;
  dragOverIndex.value = null;
};

const vizColumnOptions = computed(() => {
  if (currentView.value === "result" && currentResultId.value) {
    const result = imputationResults.value.find(r => r.id === currentResultId.value);
    if (result && result.targetColumns && result.targetColumns.length > 0) {
      return result.targetColumns.map(colName => {
        const currentStats = availableColumns.value.find(c => c.name === colName);
        return {
          name: colName,
          missingCount: currentStats ? currentStats.missingCount : "?",
        };
      });
    }
  }
  return columnsWithMissing.value;
});

const loadResultComparison = async (_resultId: number) => {
  await nextTick();
  // 加载全部列的统计数据，用于逐列统计报告
  try {
    const statsRes = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_COLUMN_STATS, _resultId);
    if (statsRes.success && statsRes.data) {
      allColumnStats.value = statsRes.data;
    } else {
      allColumnStats.value = [];
    }
  } catch (e) {
    console.error("加载列统计失败:", e);
    allColumnStats.value = [];
  }
  if (vizColumnOptions.value.length > 0) {
    const newCol = vizColumnOptions.value[0].name;
    // 如果列名没变，watcher不会触发，需要手动更新
    // 如果列名变了，watcher会触发更新，这里不需要调用
    if (vizSelectedColumn.value === newCol) {
      updateComparisonChart();
    } else {
      vizSelectedColumn.value = newCol;
    }
  }
};

// ==================== 可视化 ====================
const disposeChart = () => {
  if (timeSeriesInstance.value) {
    timeSeriesInstance.value.dispose();
    timeSeriesInstance.value = null;
  }
  if (distributionInstance.value) {
    distributionInstance.value.dispose();
    distributionInstance.value = null;
  }
  if (scatterInstance.value) {
    scatterInstance.value.dispose();
    scatterInstance.value = null;
  }
};

// 获取指定版本的文件路径
const getVersionFilePath = (versionId?: number): string | null => {
  if (!props.datasetInfo) return null;

  // 如果指定了版本ID，从 versions 列表中查找
  const targetVersionId = versionId ?? currentVersion.value?.id;
  if (!targetVersionId) return null;

  const targetVersion = versions.value.find(v => v.id === targetVersionId);
  if (targetVersion?.filePath) {
    return targetVersion.filePath;
  }

  return null;
};

const updateComparisonChart = async () => {
  if (currentView.value !== "result") return;
  if (!vizSelectedColumn.value) return;

  // 在结果视图中，使用插补结果的源版本ID获取文件路径
  let targetVersionId: number | undefined;
  if (currentView.value === "result" && currentResultId.value) {
    const result = imputationResults.value.find(r => r.id === currentResultId.value);
    targetVersionId = result?.versionId;
  }

  // 获取文件路径
  const filePath = getVersionFilePath(targetVersionId);
  if (!filePath) {
    ElMessage.warning("无法获取当前版本的文件路径");
    return;
  }

  try {
    // 显示加载状态
    if (timeSeriesInstance.value) {
      timeSeriesInstance.value.showLoading();
    }

    // 调用 API 读取 CSV 数据
    const result = await window.electronAPI.invoke(API_ROUTES.FILES.READ_CSV_DATA, {
      filePath: filePath,
      columnName: vizSelectedColumn.value,
      missingValueTypes: toRaw(props.datasetInfo?.missingValueTypes) || [],
    });

    if (currentView.value !== "result") return; // 防止在异步期间切换了视图

    if (timeSeriesInstance.value) {
      timeSeriesInstance.value.hideLoading();
    }

    if (!result.success || !result.data) {
      throw new Error(result.error || "读取数据失败");
    }

    const { tableData } = result.data;

    // 辅助：安全地将值转为数字或 null
    const toNumericValue = (val: any): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const num = Number(val);
      return isFinite(num) ? num : null;
    };

    // 处理数据用于 ECharts
    // 只使用有效的 _epochMs 时间戳
    const rawData: [number, number | null][] = tableData
      .filter((row: any) => row._epochMs != null && isFinite(row._epochMs))
      .map((row: any) => {
        const value = toNumericValue(row[vizSelectedColumn.value]);
        return [row._epochMs as number, value] as [number, number | null];
      });

    // 按时间戳严格排序
    rawData.sort((a, b) => a[0] - b[0]);

    // 对含缺失值的数据做安全降采样（按非空段独立采样，保留段间 null 间隔）
    const downsampleWithGaps = (data: [number, number | null][], maxPoints: number): [number, number | null][] => {
      // 将数据分成连续非 null 段
      const segments: { start: number; end: number }[] = [];
      let segStart = -1;
      for (let i = 0; i < data.length; i++) {
        if (data[i][1] !== null) {
          if (segStart === -1) segStart = i;
        } else {
          if (segStart !== -1) {
            segments.push({ start: segStart, end: i - 1 });
            segStart = -1;
          }
        }
      }
      if (segStart !== -1) segments.push({ start: segStart, end: data.length - 1 });

      const totalNonNull = segments.reduce((sum, s) => sum + (s.end - s.start + 1), 0);
      if (totalNonNull <= maxPoints) return data;

      const ratio = maxPoints / totalNonNull;
      const result: [number, number | null][] = [];

      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const segLen = seg.end - seg.start + 1;
        const targetLen = Math.max(2, Math.round(segLen * ratio));

        if (segLen <= targetLen) {
          for (let i = seg.start; i <= seg.end; i++) result.push(data[i]);
        } else {
          // 均匀采样，保留首末点
          result.push(data[seg.start]);
          const step = (segLen - 1) / (targetLen - 1);
          for (let j = 1; j < targetLen - 1; j++) {
            result.push(data[seg.start + Math.round(j * step)]);
          }
          result.push(data[seg.end]);
        }

        // 段间添加 null 间隔，防止跨段连线
        if (si < segments.length - 1) {
          const gapTs = data[seg.end][0] + 1;
          result.push([gapTs, null]);
        }
      }
      return result;
    };

    // 超过 8000 个非空点时降采样
    const originalData = downsampleWithGaps(rawData, 8000);

    // 加载插补结果数据
    let imputedData: any[] = [];
    let colStat: ImputationColumnStat | undefined;
    if (currentResultId.value) {
      try {
        const statsRes = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_COLUMN_STATS, currentResultId.value);
        if (statsRes.success && statsRes.data) {
          colStat = statsRes.data.find((s: ImputationColumnStat) => s.columnName === vizSelectedColumn.value);
          if (colStat?.imputedRowIndices && colStat?.imputedValues) {
            imputedData = colStat.imputedRowIndices
              .map((rowIdx: number, i: number) => {
                if (rowIdx >= 0 && rowIdx < tableData.length) {
                  const row = tableData[rowIdx];
                  if (row._epochMs == null || !isFinite(row._epochMs)) return null;
                  return [row._epochMs, colStat!.imputedValues![i]];
                }
                return null;
              })
              .filter((item: any) => item !== null);
          }
        }
      } catch (error) {
        console.error("加载插补统计失败:", error);
      }
    }

    await nextTick();

    // 增强的 DOM 就绪检查 (重试 3 次)
    let retries = 3;
    while (!timeSeriesChart.value && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries--;
    }

    if (!timeSeriesChart.value) {
      console.warn("ECharts container not found after retries");
      return;
    }

    // 检查容器尺寸
    if (timeSeriesChart.value.clientWidth === 0 || timeSeriesChart.value.clientHeight === 0) {
      // 尝试再给一点时间等待布局
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 实例管理
    if (timeSeriesInstance.value) {
      const dom = timeSeriesInstance.value.getDom();
      // 如果 DOM 引用变了，或者实例已经被销毁
      if (dom !== timeSeriesChart.value || timeSeriesInstance.value.isDisposed()) {
        try {
          timeSeriesInstance.value.dispose();
        } catch (e) {
          /* ignore */
        }
        timeSeriesInstance.value = null;
      }
    }

    if (!timeSeriesInstance.value) {
      try {
        timeSeriesInstance.value = echarts.init(timeSeriesChart.value);
      } catch (e) {
        console.error("ECharts init failed:", e);
        return;
      }
    }

    if (timeSeriesInstance.value) {
      // ========== 大数据量优化配置 ==========
      const dataLength = originalData.length;
      const imputedLength = imputedData.length;
      const isLargeData = dataLength > 5000 || imputedLength > 1000;

      const defaultEnd = isLargeData ? Math.min(20, (100 * 2000) / dataLength) : 100;

      const option = {
        animation: false,
        progressive: isLargeData ? 500 : 0,
        progressiveThreshold: 3000,
        hoverLayerThreshold: 3000,
        tooltip: {
          trigger: "axis",
          confine: true,
          enterable: false,
          hideDelay: 0,
          axisPointer: {
            type: isLargeData ? "line" : "cross",
            animation: false,
          },
          formatter: (params: any) => {
            let result = "";
            if (params[0] && params[0].value) {
              const date = new Date(params[0].value[0]);
              result += `${date.toLocaleString()}<br/>`;
            }
            params.forEach((param: any) => {
              const value = param.value[1];
              const label = param.seriesName;
              result += `${label}: ${value !== null && value !== undefined ? Number(value).toFixed(2) : "缺失"}<br/>`;
            });
            return result;
          },
        },
        legend: {
          data: ["原始数据", "插补值"],
          bottom: 10,
        },
        grid: {
          left: "3%",
          right: "4%",
          bottom: "15%",
          top: "5%",
          containLabel: true,
        },
        xAxis: {
          type: "time",
          axisLabel: { fontSize: 10 },
          splitNumber: isLargeData ? 5 : 8,
        },
        yAxis: {
          type: "value",
          scale: true,
          axisLabel: { fontSize: 10 },
          splitNumber: isLargeData ? 5 : 8,
        },
        dataZoom: [
          {
            type: "slider",
            show: true,
            xAxisIndex: [0],
            start: 0,
            end: defaultEnd,
            filterMode: "filter",
            throttle: 100,
          },
          {
            type: "inside",
            xAxisIndex: [0],
            start: 0,
            end: defaultEnd,
            filterMode: "filter",
            throttle: 100,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
          },
        ],
        series: [
          {
            name: "原始数据",
            type: "line",
            data: originalData,
            itemStyle: { color: "#22c55e" },
            lineStyle: { width: isLargeData ? 1 : 1.5 },
            showSymbol: false,
            // 不使用 sampling 和 large：它们会忽略 connectNulls:false，导致跨缺失段连线、线条交叉
            connectNulls: false,
            emphasis: {
              disabled: isLargeData,
            },
          },
          {
            name: "插补值",
            type: "scatter",
            data: imputedData,
            itemStyle: {
              color: "#f59e0b",
              opacity: imputedLength > 500 ? 0.7 : 1,
            },
            symbolSize: imputedLength > 1000 ? 2 : imputedLength > 500 ? 3 : 4,
            large: true,
            largeThreshold: 500,
            z: 10,
            emphasis: {
              disabled: imputedLength > 1000,
              scale: false,
            },
          },
        ],
      };

      timeSeriesInstance.value.setOption(option, true);
      timeSeriesInstance.value.resize(); // 确保大小正确
    }

    // 更新表格数据
    allTableData.value = tableData;

    // 创建插补数据的索引映射
    imputedMap.value = new Map();

    // 利用上面已获取的 colStat 构建表格映射
    if (colStat?.imputedRowIndices && colStat?.imputedValues) {
      const newMap = new Map<number, { value: number }>();
      colStat.imputedRowIndices.forEach((rowIdx: number, i: number) => {
        newMap.set(rowIdx, { value: colStat!.imputedValues![i] });
      });
      imputedMap.value = newMap;
    }

    // 缓存用于分布图和散点图的数据
    cachedOriginalValues.value = rawData.filter(d => d[1] !== null).map(d => d[1] as number);
    cachedImputedValues.value = colStat?.imputedValues ? [...colStat.imputedValues] : [];
    cachedOriginalScatter.value = rawData.filter(d => d[1] !== null).map(d => [d[0], d[1]] as [number, number]);
    cachedImputedScatter.value = imputedData as [number, number][];

    // 如果当前模式是分布图或散点图，同步更新
    if (vizMode.value === "distribution") {
      await nextTick();
      updateDistributionChart();
    } else if (vizMode.value === "scatter") {
      await nextTick();
      updateScatterChart();
    }

    currentPage.value = 1;
  } catch (error: any) {
    console.error("加载图表数据失败:", error);
    ElMessage.error("加载图表数据失败: " + error.message);
    if (timeSeriesInstance.value) {
      timeSeriesInstance.value.hideLoading();
    }
  }
};

// ==================== 分布对比图 ====================
const updateDistributionChart = () => {
  const originalVals = cachedOriginalValues.value;
  const imputedVals = cachedImputedValues.value;
  if (originalVals.length === 0) return;

  const allVals = [...originalVals, ...imputedVals];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  if (minVal === maxVal) return;

  const binCount = Math.min(30, Math.max(10, Math.ceil(Math.sqrt(originalVals.length))));
  const binWidth = (maxVal - minVal) / binCount;

  const originalBins = new Array(binCount).fill(0);
  const imputedBins = new Array(binCount).fill(0);

  originalVals.forEach(v => {
    const idx = Math.min(Math.floor((v - minVal) / binWidth), binCount - 1);
    originalBins[idx]++;
  });
  imputedVals.forEach(v => {
    const idx = Math.min(Math.floor((v - minVal) / binWidth), binCount - 1);
    imputedBins[idx]++;
  });

  const xData = Array.from({ length: binCount }, (_, i) => (minVal + (i + 0.5) * binWidth).toFixed(3));

  if (!distributionChart.value) return;
  if (!distributionInstance.value || distributionInstance.value.isDisposed()) {
    distributionInstance.value = echarts.init(distributionChart.value);
  } else {
    distributionInstance.value.resize();
  }

  distributionInstance.value.setOption(
    {
      animation: false,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          let html = `<div><b>区间中心: ${params[0].name}</b></div>`;
          params.forEach((p: any) => {
            html += `<div>${p.marker}${p.seriesName}: ${p.value} 个</div>`;
          });
          return html;
        },
      },
      legend: { data: ["原始数据", "插补值"], bottom: 10 },
      grid: { left: "3%", right: "4%", bottom: "18%", top: "8%", containLabel: true },
      xAxis: {
        type: "category",
        data: xData,
        axisLabel: { rotate: 30, fontSize: 10 },
        name: "数值",
        nameLocation: "end",
      },
      yAxis: { type: "value", name: "频数", nameTextStyle: { fontSize: 11 } },
      series: [
        {
          name: "原始数据",
          type: "bar",
          data: originalBins,
          barMaxWidth: 20,
          itemStyle: { color: "rgba(34,197,94,0.75)" },
          emphasis: { itemStyle: { color: "#22c55e" } },
        },
        {
          name: "插补值",
          type: "bar",
          data: imputedBins,
          barMaxWidth: 20,
          itemStyle: { color: "rgba(245,158,11,0.85)" },
          emphasis: { itemStyle: { color: "#f59e0b" } },
        },
      ],
    },
    true
  );
  distributionInstance.value.resize();
};

// ==================== 散点图 ====================
const updateScatterChart = () => {
  const originalPts = cachedOriginalScatter.value;
  const imputedPts = cachedImputedScatter.value;
  if (originalPts.length === 0) return;

  // 对原始散点进行降采样，防止点太多导致卡顿
  const MAX_ORIGINAL_SCATTER = 5000;
  let sampledOriginal = originalPts as any[];
  if (originalPts.length > MAX_ORIGINAL_SCATTER) {
    const step = Math.ceil(originalPts.length / MAX_ORIGINAL_SCATTER);
    sampledOriginal = originalPts.filter((_, i) => i % step === 0);
  }

  if (!scatterChart.value) return;
  if (!scatterInstance.value || scatterInstance.value.isDisposed()) {
    scatterInstance.value = echarts.init(scatterChart.value);
  } else {
    scatterInstance.value.resize();
  }

  scatterInstance.value.setOption(
    {
      animation: false,
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const d = new Date(params.value[0]);
          return `${d.toLocaleString()}<br/>${params.seriesName}: ${Number(params.value[1]).toFixed(3)}`;
        },
      },
      legend: { data: ["原始数据", "插补值"], bottom: 10 },
      grid: { left: "3%", right: "4%", bottom: "18%", top: "5%", containLabel: true },
      xAxis: { type: "time", axisLabel: { fontSize: 10 }, splitNumber: 6 },
      yAxis: { type: "value", scale: true, axisLabel: { fontSize: 10 } },
      dataZoom: [
        { type: "slider", show: true, xAxisIndex: [0], start: 0, end: 100, throttle: 100 },
        { type: "inside", xAxisIndex: [0], start: 0, end: 100, throttle: 100 },
      ],
      series: [
        {
          name: "原始数据",
          type: "scatter",
          data: sampledOriginal,
          symbolSize: 3,
          itemStyle: { color: "rgba(34,197,94,0.5)" },
          large: true,
          largeThreshold: 1000,
        },
        {
          name: "插补值",
          type: "scatter",
          data: imputedPts,
          symbolSize: imputedPts.length > 500 ? 4 : 6,
          itemStyle: { color: "#f59e0b" },
          z: 10,
        },
      ],
    },
    true
  );
  scatterInstance.value.resize();
};

// ==================== 保存结果 ====================
const saveAsNewVersion = async () => {
  if (!currentResultId.value) return;

  try {
    // 获取当前版本的名称作为默认值
    const currentVersionName =
      translateRemark(currentVersion.value?.remark) ||
      `插补处理 - ${getMethodName(selectedMethodId.value || ("UNKNOWN" as any))}`;

    // 弹出输入对话框
    const { value: versionName } = await ElMessageBox.prompt("请输入新版本的名称", "保存为新版本", {
      confirmButtonText: "保存",
      cancelButtonText: "取消",
      inputPlaceholder: "请输入版本名称",
      inputValue: currentVersionName,
      inputValidator: value => {
        if (!value || value.trim() === "") {
          return "版本名称不能为空";
        }
        return true;
      },
    });

    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.APPLY_VERSION, {
      resultId: currentResultId.value,
      remark: versionName.trim(),
    });

    if (result.success) {
      ElMessage.success("已成功保存为新版本");
      isSavedAsVersion.value = true;
      // 刷新版本列表
      await datasetStore.loadVersions(String(props.datasetInfo?.id));
      // 自动切换到新版本
      if (result.data?.id) {
        await datasetStore.setCurrentVersion(result.data.id);
      }
      // 重新加载插补历史记录，以显示更新后的版本名称
      await loadHistory();

      // 更新状态，保留在结果页，但更新UI状态
      // switchToConfig(); // 不再跳转回配置页
    } else {
      ElMessage.error(result.error || "保存版本失败");
    }
  } catch (error: any) {
    // 用户取消操作
    if (error === "cancel") {
      return;
    }
    ElMessage.error(error.message || "保存版本失败");
  }
};

const saveAsFile = async () => {
  if (!currentResultId.value) return;

  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.EXPORT_FILE, {
      resultId: currentResultId.value,
    });

    if (result.success) {
      ElMessage.success(`文件已导出: ${result.data}`);
    } else if (result.cancelled) {
      // 用户取消
    } else {
      ElMessage.error(result.error || "导出失败");
    }
  } catch (error: any) {
    console.error("导出失败", error);
    ElMessage.error(error.message || "导出失败");
  }
};

// ==================== 生命周期 ====================
const loadOutlierResults = async () => {
  if (!props.datasetInfo?.id) {
    outlierResults.value = [];
    return;
  }
  try {
    const results = await outlierStore.getDetectionResults(String(props.datasetInfo.id));
    outlierResults.value = results || [];
  } catch (e) {
    console.error("加载异常检测结果失败:", e);
    outlierResults.value = [];
  }
};

watch(
  () => props.datasetInfo,
  () => {
    selectedColumns.value = [];
    currentResultId.value = null;
    currentView.value = "config";
    loadHistory();
    loadOutlierResults();
  },
  { immediate: true }
);

// 监听版本变化，重新加载历史记录（实现版本隔离）并自动检测缺失值
watch(
  () => currentVersion.value?.id,
  (newId, oldId) => {
    if (newId) {
      // 仅在版本切换时（非首次加载）重置视图状态
      if (oldId !== undefined) {
        currentResultId.value = null;
        currentView.value = "config";
        progressInfo.value = null;
        isExecuting.value = false;
      }
      loadHistory();

      // 自动触发缺失值检测（后台静默执行）
      autoDetectMissingValues();
    }
  },
  { immediate: true } // 首次加载时也触发自动检测
);

watch(
  () => selectedMethodId.value,
  () => {
    // 保持选择方法后的参数初始化逻辑集中在方法切换上
  }
);

onMounted(async () => {
  window.addEventListener("resize", () => {
    timeSeriesInstance.value?.resize();
  });
  setupProgressListeners();

  // 加载插补方法数据
  await loadImputationMethods();
});

onUnmounted(() => {
  disposeChart();
});
</script>

<template>
  <div class="gap-filling-panel">
    <!-- eco backdrop decoration -->
    <div class="eco-backdrop" aria-hidden="true">
      <svg class="eco-leaf eco-leaf-1" viewBox="0 0 80 80" fill="none">
        <path d="M10 70 C30 50, 70 10, 10 10 C10 10, 10 50, 50 70 Z" fill="rgba(64,145,108,0.07)" />
      </svg>
      <svg class="eco-leaf eco-leaf-2" viewBox="0 0 60 60" fill="none">
        <path d="M5 55 C25 35, 55 5, 5 5 C5 5, 5 35, 45 55 Z" fill="rgba(82,183,136,0.05)" />
      </svg>
      <svg class="eco-leaf eco-leaf-3" viewBox="0 0 50 50" fill="none">
        <path d="M5 45 C20 30, 45 5, 5 5 C5 5, 5 30, 35 45 Z" fill="rgba(116,198,157,0.06)" />
      </svg>
      <svg class="eco-net" viewBox="0 0 200 200" fill="none">
        <circle cx="40" cy="40" r="3" fill="rgba(64,145,108,0.15)" />
        <circle cx="100" cy="30" r="2" fill="rgba(64,145,108,0.12)" />
        <circle cx="160" cy="60" r="3" fill="rgba(64,145,108,0.15)" />
        <circle cx="70" cy="100" r="2" fill="rgba(64,145,108,0.12)" />
        <circle cx="130" cy="110" r="3" fill="rgba(64,145,108,0.15)" />
        <circle cx="50" cy="160" r="2" fill="rgba(64,145,108,0.12)" />
        <circle cx="150" cy="170" r="3" fill="rgba(64,145,108,0.15)" />
        <circle cx="100" cy="140" r="2" fill="rgba(64,145,108,0.1)" />
        <circle cx="180" cy="120" r="2" fill="rgba(64,145,108,0.1)" />
        <line x1="40" y1="40" x2="100" y2="30" stroke="rgba(64,145,108,0.08)" stroke-width="1" />
        <line x1="100" y1="30" x2="160" y2="60" stroke="rgba(64,145,108,0.08)" stroke-width="1" />
        <line x1="40" y1="40" x2="70" y2="100" stroke="rgba(64,145,108,0.08)" stroke-width="1" />
        <line x1="100" y1="30" x2="130" y2="110" stroke="rgba(64,145,108,0.06)" stroke-width="1" />
        <line x1="160" y1="60" x2="130" y2="110" stroke="rgba(64,145,108,0.08)" stroke-width="1" />
        <line x1="70" y1="100" x2="50" y2="160" stroke="rgba(64,145,108,0.08)" stroke-width="1" />
        <line x1="130" y1="110" x2="150" y2="170" stroke="rgba(64,145,108,0.08)" stroke-width="1" />
        <line x1="70" y1="100" x2="100" y2="140" stroke="rgba(64,145,108,0.06)" stroke-width="1" />
        <line x1="130" y1="110" x2="100" y2="140" stroke="rgba(64,145,108,0.06)" stroke-width="1" />
        <line x1="160" y1="60" x2="180" y2="120" stroke="rgba(64,145,108,0.06)" stroke-width="1" />
      </svg>
    </div>
    <!-- 空状态 -->
    <div v-if="!datasetInfo" class="empty-state">
      <div class="empty-icon">📊</div>
      <h3 class="empty-title">未选择数据集</h3>
      <p class="empty-description">请先选择一个数据集以开始缺失值处理</p>
    </div>

    <!-- 主布局：侧边栏 + 主内容区 -->
    <div v-else class="panel-layout">
      <!-- 侧边栏 -->
      <div class="panel-sidebar">
        <!-- 新建按钮 -->
        <div class="sidebar-header">
          <button class="new-imputation-btn" @click="switchToConfig">
            <Plus :size="16" />
            <span>新建插补</span>
          </button>
        </div>

        <!-- 历史记录 -->
        <div class="history-section">
          <div class="sidebar-subtitle">
            <span>操作历史</span>
          </div>
          <div class="history-list">
            <div v-if="visibleImputationResults.length === 0" class="history-empty">
              <span>暂无操作记录</span>
            </div>
            <div
              v-for="(result, index) in visibleImputationResults"
              :key="result.id"
              class="history-item"
              :class="{
                'history-item--active': currentResultId === result.id,
                'history-item--drag-over': dragOverIndex === index,
              }"
              draggable="true"
              @dragstart="onDragStart(index)"
              @dragover="onDragOver(index, $event)"
              @drop="onDrop(index)"
              @dragend="onDragEnd"
              @click="viewResult(result)">
              <div class="history-item-header">
                <GripVertical :size="14" class="drag-handle" />
                <div v-if="editingResultId === result.id" class="history-name-edit" @click.stop>
                  <input
                    v-model="editingName"
                    class="history-name-input"
                    @keyup.enter="saveRenaming"
                    @keyup.escape="cancelRenaming"
                    @blur="saveRenaming"
                    autofocus />
                </div>
                <span v-else class="history-method" :title="getHistoryTitle(result)">{{
                  getHistoryTitle(result)
                }}</span>
                <div class="history-item-actions">
                  <button class="history-action-btn" @click.stop="startRenaming(result)" title="重命名">
                    <Pencil :size="13" />
                  </button>
                  <button
                    class="history-action-btn history-delete-btn"
                    @click.stop="deleteResult(result.id)"
                    title="删除">
                    <Trash2 :size="13" />
                  </button>
                </div>
              </div>
              <div class="history-item-content">
                <el-tag size="small" :type="getStatusType(result.status)" effect="light" round>
                  {{ getStatusText(result.status) }}
                </el-tag>
              </div>
              <div class="history-item-stats">
                <span class="stat-item">{{ result.imputedCount }} 个插补</span>
                <span class="stat-item">{{ result.imputationRate.toFixed(1) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="panel-main">
        <!-- 配置视图 -->
        <div v-if="currentView === 'config'" class="config-view">
          <!-- 顶部信息区：版本 + 检测 + 统计 -->
          <div class="top-info-area" v-if="currentVersion">
            <!-- 版本信息行 -->
            <div class="version-bar">
              <div class="version-bar-left">
                <Info :size="16" class="version-icon" />
                <span class="version-bar-label">数据版本</span>
                <el-select
                  :model-value="currentVersion.id"
                  @update:model-value="handleVersionChange"
                  class="version-selector"
                  size="small"
                  style="width: 260px">
                  <el-option v-for="ver in versions" :key="ver.id" :label="formatVersionLabel(ver)" :value="ver.id">
                    <div class="version-option-item">
                      <div class="version-option-left">
                        <el-tag
                          :type="getVersionTagType(ver.stageType)"
                          size="small"
                          effect="light"
                          class="version-tag">
                          {{ getVersionLabel(ver.stageType, ver.id) }}
                        </el-tag>
                        <span class="version-option-id">#{{ ver.id }}</span>
                      </div>
                      <span class="version-option-time">{{ formatDateTime(ver.createdAt) }}</span>
                    </div>
                  </el-option>
                </el-select>
                <span class="version-meta-text">{{ formatDateTime(currentVersion.createdAt) }}</span>
                <span v-if="currentVersion.remark" class="version-meta-remark">{{
                  translateRemark(currentVersion.remark)
                }}</span>
              </div>
              <el-button link type="primary" @click="showVersionDrawer = true" size="small">
                <Link :size="14" />
                版本谱系
              </el-button>
            </div>

            <!-- 检测控制行 -->
            <div class="detection-bar">
              <MissingMarkersEditor />
              <el-button
                type="primary"
                :loading="gapFillingStore.loading"
                @click="detectMissingValues"
                size="small"
                class="detect-btn">
                <RefreshCw :size="14" />
                重新检测
              </el-button>
            </div>

            <!-- 快速统计条 -->
            <div v-if="gapFillingStore.hasStats" class="stats-strip">
              <div class="stat-chip">
                <div class="stat-chip-icon icon-blue">
                  <List :size="16" />
                </div>
                <div class="stat-chip-info">
                  <span class="stat-chip-value">{{ gapFillingStore.missingStats?.totalRows.toLocaleString() }}</span>
                  <span class="stat-chip-label">总行数</span>
                </div>
              </div>
              <div class="stat-strip-divider"></div>
              <div class="stat-chip">
                <div class="stat-chip-icon icon-purple">
                  <Info :size="16" />
                </div>
                <div class="stat-chip-info">
                  <span class="stat-chip-value">{{ gapFillingStore.missingStats?.totalColumns }}</span>
                  <span class="stat-chip-label">总列数</span>
                </div>
              </div>
              <div class="stat-strip-divider"></div>
              <div class="stat-chip stat-chip--alert">
                <div class="stat-chip-icon icon-red">
                  <Play :size="16" />
                </div>
                <div class="stat-chip-info">
                  <span class="stat-chip-value">{{ gapFillingStore.totalMissingCount.toLocaleString() }}</span>
                  <span class="stat-chip-label">缺失单元格</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 等待检测 / 加载状态 -->
          <div v-if="!gapFillingStore.hasStats" class="detection-empty-state">
            <div class="empty-illustration">
              <Search :size="48" class="illustration-icon" :class="{ 'is-loading': gapFillingStore.loading }" />
              <div class="circles">
                <span class="circle c1"></span>
                <span class="circle c2"></span>
                <span class="circle c3"></span>
              </div>
            </div>
            <h3 class="empty-hint-title">
              {{ gapFillingStore.loading ? "正在检测缺失值..." : "准备好分析数据了吗？" }}
            </h3>
            <p class="empty-hint-desc">
              <template v-if="gapFillingStore.loading">
                系统正在后台自动扫描
                <b>{{ datasetInfo?.originalFile?.rows?.toLocaleString() || "-" }}</b> 行数据，请稍候...
              </template>
              <template v-else>
                系统将自动检测缺失值。如需修改缺失值标记后重新检测，请点击上方「重新检测」按钮。
              </template>
            </p>
          </div>

          <!-- 检测完成后的主内容 -->
          <template v-if="gapFillingStore.hasStats">
            <!-- 执行插补模块 -->
            <div class="module-container">
              <!-- 方法选择区 -->
              <div class="method-selection-section">
                <div class="section-header">
                  <h3 class="section-title">
                    <Settings :size="15" />
                    选择插补方法
                  </h3>
                </div>

                <!-- 分类Tab -->
                <div class="category-tabs">
                  <button
                    v-for="cat in categories"
                    :key="cat.value"
                    :class="['category-tab', { 'category-tab--active': activeCategory === cat.value }]"
                    @click="activeCategory = cat.value as ImputationCategory">
                    <span class="category-icon">{{ cat.icon }}</span>
                    <span class="category-name">{{ cat.label }}</span>
                  </button>
                </div>

                <!-- 方法卡片 -->
                <div class="methods-grid">
                  <div
                    v-for="method in filteredMethods"
                    :key="method.methodId"
                    :class="[
                      'method-card',
                      {
                        'method-card--selected': selectedMethodId === method.methodId,
                        'method-card--unavailable': !method.isAvailable,
                        'method-card--recommended': isRecommended(method.methodId),
                      },
                    ]"
                    @click="selectMethod(method)">
                    <!-- 推荐标签 -->
                    <div v-if="isRecommended(method.methodId)" class="recommended-badge">
                      <Star :size="11" />
                      <span>推荐</span>
                    </div>

                    <div class="method-card-header">
                      <span class="method-card-name">{{ method.methodName }}</span>
                      <div class="method-card-tags">
                        <span v-if="method.requiresPython" class="tag tag--python">Python</span>
                        <span :class="['tag', `tag--time-${method.estimatedTime}`]">
                          {{ getTimeLabel(method.estimatedTime) }}
                        </span>
                      </div>
                    </div>

                    <p class="method-card-description">{{ method.description }}</p>

                    <div class="method-card-footer">
                      <span class="accuracy-indicator">
                        准确度:
                        <span :class="`accuracy--${method.accuracy}`">
                          {{ method.accuracy === "high" ? "高" : method.accuracy === "medium" ? "中" : "低" }}
                        </span>
                      </span>
                      <div v-if="selectedMethodId === method.methodId" class="selected-indicator">
                        <Check :size="14" />
                      </div>
                    </div>
                  </div>

                  <!-- 自定义分类下的新增模型按钮 -->
                  <div
                    v-if="activeCategory === 'custom'"
                    class="method-card method-card--add"
                    @click="showCustomModelDialog = true">
                    <div class="add-model-content">
                      <Plus :size="28" />
                      <span class="add-model-text">新增模型</span>
                      <span class="add-model-hint">注册自训练模型或导入 YAML 配置</span>
                    </div>
                  </div>
                </div>

                <!-- 自定义分类空状态提示 -->
                <div v-if="activeCategory === 'custom' && filteredMethods.length === 0" class="custom-empty-hint">
                  <div class="custom-empty-icon">🔌</div>
                  <p class="custom-empty-title">暂无自定义模型</p>
                  <p class="custom-empty-desc">
                    您可以将自己训练好的深度学习模型注册到系统中，支持 PyPOTS、PyTorch、ONNX 等框架。<br />
                    点击上方「新增模型」按钮开始注册，或通过 YAML 配置文件批量导入。
                  </p>
                </div>
              </div>

              <!-- 参数配置区 -->
              <div class="params-config-section">
                <div class="section-header">
                  <h3 class="section-title">
                    <Settings :size="15" />
                    参数配置
                  </h3>
                </div>

                <!-- 模型信息卡（仅 ML/DL 方法显示） -->
                <div v-if="isModelBasedMethod" class="model-info-section">
                  <!-- 无可用模型提示 -->
                  <div v-if="activeModels.length === 0" class="model-info-empty">
                    <Info :size="14" />
                    <span>该方法暂无可用模型，请先在自定义模型中注册模型。</span>
                  </div>

                  <template v-else>
                    <!-- 模型选择器（多个模型时显示） -->
                    <div v-if="activeModels.length > 1" class="model-selector">
                      <label class="model-selector-label">选择模型</label>
                      <el-select v-model="selectedModelId" size="small" class="model-selector-input">
                        <el-option
                          v-for="m in activeModels"
                          :key="m.id"
                          :label="m.modelName || `模型 #${m.id}`"
                          :value="m.id" />
                      </el-select>
                    </div>

                    <!-- 模型详情卡 -->
                    <div v-if="selectedModel" class="model-info-card">
                      <div class="model-info-header">
                        <span class="model-info-name">{{
                          selectedModel.modelName || `模型 #${selectedModel.id}`
                        }}</span>
                        <span v-if="selectedModel.validationScore != null" class="model-info-score">
                          验证分数: {{ (selectedModel.validationScore * 100).toFixed(1) }}%
                        </span>
                      </div>
                      <div class="model-info-meta">
                        <div class="model-meta-item">
                          <span class="model-meta-label">目标列</span>
                          <span class="model-meta-value model-meta-value--target">{{
                            selectedModel.targetColumn || "—"
                          }}</span>
                        </div>
                        <div v-if="selectedModel.timeColumn" class="model-meta-item">
                          <span class="model-meta-label">时间列</span>
                          <span class="model-meta-value">{{ selectedModel.timeColumn }}</span>
                        </div>
                        <div v-if="selectedModel.featureColumns?.length" class="model-meta-item model-meta-item--full">
                          <span class="model-meta-label">需要特征列</span>
                          <div class="model-feature-tags">
                            <span v-for="col in selectedModel.featureColumns" :key="col" class="model-feature-tag">
                              {{ col }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 列名映射 + 模型超参数 折叠面板 -->
                    <el-collapse
                      v-if="
                        selectedModel && (modelRequiredFeatureColumns.length > 0 || selectedModelParamKeys.length > 0)
                      "
                      v-model="modelConfigCollapse"
                      class="model-config-collapse">
                      <!-- 列名映射折叠项 -->
                      <el-collapse-item
                        v-if="modelRequiredFeatureColumns.length > 0"
                        name="column-mapping"
                        class="model-config-collapse-item">
                        <template #title>
                          <div class="collapse-title-row">
                            <span class="collapse-title-text">列名映射配置</span>
                            <span
                              :class="[
                                'collapse-title-badge',
                                columnMappingSummary.complete
                                  ? 'collapse-title-badge--ok'
                                  : 'collapse-title-badge--warn',
                              ]">
                              {{ columnMappingSummary.mapped }}/{{ columnMappingSummary.total }} 已映射
                            </span>
                          </div>
                        </template>
                        <div class="column-mapping-section">
                          <span class="column-mapping-hint">将您数据文件中的列映射到模型训练时使用的列名</span>
                          <div class="column-mapping-table">
                            <div class="column-mapping-row column-mapping-row--header">
                              <span>模型期望列名</span>
                              <span>对应您文件中的列</span>
                              <span>状态</span>
                            </div>
                            <div
                              v-for="modelCol in modelRequiredFeatureColumns"
                              :key="modelCol"
                              class="column-mapping-row">
                              <span class="mapping-model-col">{{ modelCol }}</span>
                              <el-select
                                v-model="columnMapping[modelCol]"
                                size="small"
                                clearable
                                placeholder="请选择列"
                                class="mapping-user-col-select">
                                <el-option
                                  v-for="userCol in availableColumns"
                                  :key="userCol.name"
                                  :label="userCol.name"
                                  :value="userCol.name" />
                              </el-select>
                              <span
                                :class="[
                                  'mapping-status',
                                  columnMapping[modelCol] ? 'mapping-status--ok' : 'mapping-status--missing',
                                ]">
                                {{ columnMapping[modelCol] ? "已映射" : "未映射" }}
                              </span>
                            </div>
                          </div>
                          <div v-if="!isColumnMappingComplete" class="column-mapping-warning">
                            <Info :size="13" />
                            请完成所有列的映射后才能执行插补
                          </div>
                        </div>
                      </el-collapse-item>

                      <!-- 模型超参数折叠项 -->
                      <el-collapse-item
                        v-if="selectedModelParamKeys.length > 0"
                        name="model-params"
                        class="model-config-collapse-item">
                        <template #title>
                          <div class="collapse-title-row">
                            <span class="collapse-title-text">模型超参数</span>
                            <span class="collapse-title-badge collapse-title-badge--ok">
                              {{ modelParamsSummary.count }} 项已配置
                            </span>
                          </div>
                        </template>
                        <div class="model-params-section">
                          <span class="model-params-hint">预填自模型训练时保存的超参数，可在执行前调整</span>
                          <div class="params-form">
                            <div v-for="key in selectedModelParamKeys" :key="key" class="param-item">
                              <label class="param-label">{{ formatParamKey(key) }}</label>
                              <el-input-number
                                v-if="typeof (selectedModel.modelParams ?? {})[key] === 'number'"
                                v-model="paramValues[key]"
                                size="small"
                                class="param-input-number" />
                              <el-switch
                                v-else-if="typeof (selectedModel.modelParams ?? {})[key] === 'boolean'"
                                v-model="paramValues[key]"
                                size="small" />
                              <el-input v-else v-model="paramValues[key]" size="small" class="param-input-text" />
                            </div>
                          </div>
                        </div>
                      </el-collapse-item>
                    </el-collapse>
                  </template>
                </div>

                <!-- 目标列选择（模型方法时：全宽） -->
                <TargetColumnSelector
                  v-if="isModelBasedMethod && selectedModel && selectedModelParamKeys.length > 0"
                  v-model="selectedColumns"
                  :columns="availableColumns"
                  :mode="columnSelectionMode"
                  @update:mode="columnSelectionMode = $event" />

                <!-- REddyProc MDS：目标列单独占一行，参数配置另起一行 -->
                <template v-if="isReddyProcMDSMethod">
                  <TargetColumnSelector
                    v-model="selectedColumns"
                    :columns="availableColumns"
                    :mode="columnSelectionMode"
                    @update:mode="columnSelectionMode = $event" />

                  <div v-if="selectedMethod" class="method-params method-params--reddyproc">
                    <h4 class="params-title">{{ selectedMethod.methodName }} 参数</h4>

                    <div v-if="reddyProcGeneralParams.length > 0" class="params-form">
                      <div v-for="param in reddyProcGeneralParams" :key="param.paramKey" class="param-item">
                        <label class="param-label">
                          {{ param.paramName }}
                          <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                            <Info :size="13" class="param-tooltip-icon" />
                          </el-tooltip>
                        </label>

                        <el-input-number
                          v-if="param.paramType === 'number'"
                          v-model="paramValues[param.paramKey]"
                          :min="param.minValue"
                          :max="param.maxValue"
                          :step="param.stepValue || 1"
                          :precision="getNumberPrecision(param)"
                          size="small"
                          class="param-input-number" />

                        <el-select
                          v-else-if="param.paramType === 'select'"
                          v-model="paramValues[param.paramKey]"
                          size="small"
                          class="param-select">
                          <el-option
                            v-for="option in getParamOptions(param)"
                            :key="option.value"
                            :label="option.label"
                            :value="option.value" />
                        </el-select>

                        <el-switch
                          v-else-if="param.paramType === 'boolean'"
                          v-model="paramValues[param.paramKey]"
                          size="small" />

                        <el-slider
                          v-else-if="param.paramType === 'range'"
                          v-model="paramValues[param.paramKey]"
                          :min="param.minValue"
                          :max="param.maxValue"
                          :step="param.stepValue || 1"
                          show-input
                          size="small" />

                        <el-input
                          v-else-if="param.paramType === 'string'"
                          v-model="paramValues[param.paramKey]"
                          :placeholder="param.tooltip || '请输入'"
                          size="small"
                          class="param-input-text" />
                      </div>
                    </div>

                    <div v-if="reddyProcGeoParams.length > 0" class="reddyproc-geo-grid">
                      <div v-for="param in reddyProcGeoParams" :key="param.paramKey" class="param-item">
                        <label class="param-label">
                          {{ param.paramName }}
                          <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                            <Info :size="13" class="param-tooltip-icon" />
                          </el-tooltip>
                        </label>

                        <el-input-number
                          v-if="param.paramType === 'number'"
                          v-model="paramValues[param.paramKey]"
                          :min="param.minValue"
                          :max="param.maxValue"
                          :step="param.stepValue || 1"
                          :precision="getNumberPrecision(param)"
                          size="small"
                          class="param-input-number" />

                        <el-input
                          v-else
                          v-model="paramValues[param.paramKey]"
                          :placeholder="param.tooltip || '请输入'"
                          size="small"
                          class="param-input-text" />
                      </div>
                    </div>

                    <div v-if="reddyProcMappingParams.length > 0" class="reddyproc-mapping-section">
                      <div class="reddyproc-mapping-header">
                        <div>
                          <div class="reddyproc-mapping-title">列名映射配置</div>
                          <div class="reddyproc-mapping-hint">将您数据文件中的列映射到方法执行时使用的列名</div>
                        </div>
                        <span
                          :class="[
                            'collapse-title-badge',
                            reddyProcMappingSummary.complete
                              ? 'collapse-title-badge--ok'
                              : 'collapse-title-badge--warn',
                          ]">
                          {{ reddyProcMappingSummary.mapped }}/{{ reddyProcMappingSummary.total }} 已映射
                        </span>
                      </div>

                      <div class="column-mapping-table column-mapping-table--reddyproc">
                        <div class="column-mapping-row column-mapping-row--header">
                          <span>模型期望列名</span>
                          <span>对应您文件中的列</span>
                          <span>状态</span>
                        </div>
                        <div v-for="param in reddyProcMappingParams" :key="param.paramKey" class="column-mapping-row">
                          <span class="mapping-model-col">{{ getReddyProcMappingExpectedLabel(param) }}</span>
                          <el-select
                            v-model="paramValues[param.paramKey]"
                            size="small"
                            clearable
                            placeholder="请选择列"
                            class="mapping-user-col-select">
                            <el-option
                              v-for="userCol in availableColumns"
                              :key="userCol.name"
                              :label="userCol.name"
                              :value="userCol.name" />
                          </el-select>
                          <span
                            :class="[
                              'mapping-status',
                              isReddyProcMappingConfigured(param) ? 'mapping-status--ok' : 'mapping-status--missing',
                            ]">
                            {{ isReddyProcMappingConfigured(param) ? "已映射" : "未映射" }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div v-if="missingRequiredParams.length > 0" class="params-warning">
                      还需填写必填参数：{{ missingRequiredParams.map(param => param.paramName).join("、") }}
                    </div>

                    <div v-if="currentMethodParams.length === 0" class="no-params">
                      <p>此方法无需额外参数配置</p>
                    </div>

                    <el-collapse v-if="hasAdvancedParams" class="advanced-params-collapse">
                      <el-collapse-item title="高级参数" name="advanced">
                        <div v-for="param in advancedParams" :key="param.paramKey" class="param-item">
                          <label class="param-label">
                            {{ param.paramName }}
                            <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                              <Info :size="13" class="param-tooltip-icon" />
                            </el-tooltip>
                          </label>

                          <el-input-number
                            v-if="param.paramType === 'number'"
                            v-model="paramValues[param.paramKey]"
                            :min="param.minValue"
                            :max="param.maxValue"
                            :step="param.stepValue || 1"
                            :precision="getNumberPrecision(param)"
                            size="small"
                            class="param-input-number" />

                          <el-select
                            v-else-if="param.paramType === 'select'"
                            v-model="paramValues[param.paramKey]"
                            size="small"
                            class="param-select">
                            <el-option
                              v-for="option in getParamOptions(param)"
                              :key="option.value"
                              :label="option.label"
                              :value="option.value" />
                          </el-select>

                          <el-switch
                            v-else-if="param.paramType === 'boolean'"
                            v-model="paramValues[param.paramKey]"
                            size="small" />

                          <el-slider
                            v-else-if="param.paramType === 'range'"
                            v-model="paramValues[param.paramKey]"
                            :min="param.minValue"
                            :max="param.maxValue"
                            :step="param.stepValue || 1"
                            show-input
                            size="small" />

                          <el-input
                            v-else-if="param.paramType === 'string'"
                            v-model="paramValues[param.paramKey]"
                            :placeholder="param.tooltip || '请输入'"
                            size="small"
                            class="param-input-text" />
                        </div>
                      </el-collapse-item>
                    </el-collapse>
                  </div>
                </template>

                <!-- 指标列 + 参数配置 并排布局（非模型方法且非 REddyProc MDS 时使用） -->
                <div
                  v-else-if="!(isModelBasedMethod && selectedModel && selectedModelParamKeys.length > 0)"
                  class="columns-params-row">
                  <!-- 列选择（左侧） -->
                  <TargetColumnSelector
                    v-model="selectedColumns"
                    :columns="availableColumns"
                    :mode="columnSelectionMode"
                    @update:mode="columnSelectionMode = $event" />

                  <!-- 方法参数（右侧） -->
                  <div v-if="selectedMethod" class="method-params">
                    <h4 class="params-title">{{ selectedMethod.methodName }} 参数</h4>

                    <div class="params-form">
                      <!-- 基础参数 -->
                      <div v-for="param in basicParams" :key="param.paramKey" class="param-item">
                        <label class="param-label">
                          {{ param.paramName }}
                          <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                            <Info :size="13" class="param-tooltip-icon" />
                          </el-tooltip>
                        </label>

                        <!-- 数字输入 -->
                        <el-input-number
                          v-if="param.paramType === 'number'"
                          v-model="paramValues[param.paramKey]"
                          :min="param.minValue"
                          :max="param.maxValue"
                          :step="param.stepValue || 1"
                          :precision="getNumberPrecision(param)"
                          size="small"
                          class="param-input-number" />

                        <!-- 选择框 -->
                        <el-select
                          v-else-if="param.paramType === 'select'"
                          v-model="paramValues[param.paramKey]"
                          size="small"
                          class="param-select">
                          <el-option
                            v-for="option in getParamOptions(param)"
                            :key="option.value"
                            :label="option.label"
                            :value="option.value" />
                        </el-select>

                        <!-- 开关 -->
                        <el-switch
                          v-else-if="param.paramType === 'boolean'"
                          v-model="paramValues[param.paramKey]"
                          size="small" />

                        <!-- 范围滑块 -->
                        <el-slider
                          v-else-if="param.paramType === 'range'"
                          v-model="paramValues[param.paramKey]"
                          :min="param.minValue"
                          :max="param.maxValue"
                          :step="param.stepValue || 1"
                          show-input
                          size="small" />

                        <!-- 文本输入 (用于列名等字符串参数) -->
                        <el-input
                          v-else-if="param.paramType === 'string'"
                          v-model="paramValues[param.paramKey]"
                          :placeholder="param.tooltip || '请输入'"
                          size="small"
                          class="param-input-text" />
                      </div>
                    </div>

                    <div v-if="missingRequiredParams.length > 0" class="params-warning">
                      还需填写必填参数：{{ missingRequiredParams.map(param => param.paramName).join("、") }}
                    </div>

                    <!-- 无参数提示 -->
                    <div v-if="currentMethodParams.length === 0" class="no-params">
                      <p>此方法无需额外参数配置</p>
                    </div>

                    <!-- 高级参数折叠 -->
                    <el-collapse v-if="hasAdvancedParams" class="advanced-params-collapse">
                      <el-collapse-item title="高级参数" name="advanced">
                        <div v-for="param in advancedParams" :key="param.paramKey" class="param-item">
                          <label class="param-label">
                            {{ param.paramName }}
                            <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                              <Info :size="13" class="param-tooltip-icon" />
                            </el-tooltip>
                          </label>

                          <!-- 数字输入 -->
                          <el-input-number
                            v-if="param.paramType === 'number'"
                            v-model="paramValues[param.paramKey]"
                            :min="param.minValue"
                            :max="param.maxValue"
                            :step="param.stepValue || 1"
                            :precision="getNumberPrecision(param)"
                            size="small"
                            class="param-input-number" />

                          <!-- 选择框 -->
                          <el-select
                            v-else-if="param.paramType === 'select'"
                            v-model="paramValues[param.paramKey]"
                            size="small"
                            class="param-select">
                            <el-option
                              v-for="option in getParamOptions(param)"
                              :key="option.value"
                              :label="option.label"
                              :value="option.value" />
                          </el-select>

                          <!-- 开关 -->
                          <el-switch
                            v-else-if="param.paramType === 'boolean'"
                            v-model="paramValues[param.paramKey]"
                            size="small" />

                          <!-- 范围滑块 -->
                          <el-slider
                            v-else-if="param.paramType === 'range'"
                            v-model="paramValues[param.paramKey]"
                            :min="param.minValue"
                            :max="param.maxValue"
                            :step="param.stepValue || 1"
                            show-input
                            size="small" />

                          <!-- 文本输入 (用于列名等字符串参数) -->
                          <el-input
                            v-else-if="param.paramType === 'string'"
                            v-model="paramValues[param.paramKey]"
                            :placeholder="param.tooltip || '请输入'"
                            size="small"
                            class="param-input-text" />
                        </div>
                      </el-collapse-item>
                    </el-collapse>
                  </div>
                </div>


                <!-- 执行按钮 -->
                <div class="action-buttons">
                  <button
                    class="execute-btn"
                    :class="{ 'execute-btn--loading': isExecuting }"
                    :disabled="!canExecute || isExecuting"
                    @click="executeImputation">
                    <Play v-if="!isExecuting" :size="16" />
                    <div v-else class="loading-spinner"></div>
                    <span>{{ isExecuting ? "执行中..." : "开始插补" }}</span>
                  </button>
                </div>
              </div>

              <!-- 进度展示区 -->
              <div v-if="isExecuting || progressInfo" class="progress-section">
                <div class="progress-header">
                  <h4 class="progress-title">
                    <span v-if="isExecuting" class="status-dot status-dot--running"></span>
                    <span v-else class="status-dot status-dot--completed"></span>
                    执行进度
                  </h4>
                  <button v-if="isExecuting" class="cancel-btn" @click="cancelExecution">
                    <X :size="14" />
                    <span>取消</span>
                  </button>
                </div>

                <div class="progress-content">
                  <!-- 进度条 -->
                  <div class="progress-bar-container">
                    <div class="progress-bar">
                      <div class="progress-bar-fill" :style="{ width: progress + '%' }">
                        <div class="progress-bar-glow"></div>
                      </div>
                    </div>
                    <span class="progress-text">{{ progress }}%</span>
                  </div>

                  <!-- 进度信息 -->
                  <div class="progress-info">
                    <p class="progress-message">{{ progressMessage }}</p>
                    <p class="progress-detail" v-if="progressInfo?.stage">
                      当前阶段: {{ getStageLabel(progressInfo.stage) }}
                    </p>

                    <!-- 完成后的操作按钮 -->
                    <div v-if="progressInfo?.stage === 'completed'" class="completion-actions">
                      <el-button type="success" @click="viewCurrentResult">
                        查看插补结果
                        <ChevronRight :size="14" class="el-icon--right" />
                      </el-button>
                    </div>
                  </div>

                  <!-- 执行日志 -->
                  <div v-if="executionLogs.length > 0" class="execution-logs">
                    <div class="logs-header">执行日志</div>
                    <div class="logs-content" ref="logsContentRef">
                      <div v-for="log in executionLogs" :key="log.id" class="log-item">
                        <span class="log-time">[{{ log.time }}]</span>
                        <span :class="['log-level', `log-level--${log.level}`]">{{ log.level }}</span>
                        <span class="log-message">{{ log.message }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- 结果视图 -->
        <div v-else-if="currentView === 'result'" class="result-view">
          <div class="result-header">
            <h3 class="result-title">插补结果对比</h3>
            <div class="result-header-actions">
              <template v-if="currentResultId">
                <button
                  class="compact-save-btn"
                  :class="{ 'compact-save-btn--done': isSavedAsVersion }"
                  :disabled="isSavedAsVersion"
                  @click="saveAsNewVersion">
                  <Plus v-if="!isSavedAsVersion" :size="14" />
                  <Check v-else :size="14" />
                  <span>{{ isSavedAsVersion ? "已保存为版本" : "保存为新版本" }}</span>
                </button>
                <button class="compact-save-btn" @click="saveAsFile">
                  <List :size="14" />
                  <span>保存为文件</span>
                </button>
              </template>
              <button class="back-btn" @click="switchToConfig">
                <RefreshCw :size="14" />
                <span>返回配置</span>
              </button>
            </div>
          </div>

          <!-- 逐列统计报告 -->
          <div v-if="allColumnStats.length > 0" class="stats-report">
            <div class="stats-report-header">
              <TrendingUp :size="15" />
              <span>逐列插补统计报告</span>
            </div>
            <div class="stats-report-table-wrapper">
              <table class="stats-report-table">
                <thead>
                  <tr>
                    <th>列名</th>
                    <th>插补前均值</th>
                    <th>插补后均值</th>
                    <th>均值变化</th>
                    <th>插补前标准差</th>
                    <th>插补后标准差</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="stat in allColumnStats" :key="stat.columnName">
                    <tr v-if="stat.missingCount > 0">
                      <td class="stat-col-name">{{ stat.columnName }}</td>
                      <td class="stat-num">{{ stat.meanBefore != null ? stat.meanBefore.toFixed(4) : "—" }}</td>
                      <td class="stat-num">{{ stat.meanAfter != null ? stat.meanAfter.toFixed(4) : "—" }}</td>
                      <td>
                        <span
                          v-if="stat.meanBefore != null && stat.meanAfter != null"
                          class="stat-delta"
                          :class="{
                            'stat-delta--pos': stat.meanAfter > stat.meanBefore,
                            'stat-delta--neg': stat.meanAfter < stat.meanBefore,
                          }">
                          {{ stat.meanAfter > stat.meanBefore ? "▲" : stat.meanAfter < stat.meanBefore ? "▼" : "—" }}
                          {{ Math.abs(stat.meanAfter - stat.meanBefore).toFixed(4) }}
                        </span>
                        <span v-else>—</span>
                      </td>
                      <td class="stat-num">{{ stat.stdBefore != null ? stat.stdBefore.toFixed(4) : "—" }}</td>
                      <td class="stat-num">{{ stat.stdAfter != null ? stat.stdAfter.toFixed(4) : "—" }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 列选择器 -->
          <div class="viz-controls">
            <div class="viz-column-select">
              <label>选择列：</label>
              <select v-model="vizSelectedColumn" class="viz-select">
                <option v-for="col in vizColumnOptions" :key="col.name" :value="col.name">
                  {{ col.name }}
                </option>
              </select>
            </div>

            <div class="viz-mode-switch">
              <button
                type="button"
                :class="['viz-mode-btn', { 'viz-mode-btn--active': vizMode === 'timeseries' }]"
                @click.stop="vizMode = 'timeseries'">
                <LineChart :size="14" />
                <span>时序图</span>
              </button>
              <button
                type="button"
                :class="['viz-mode-btn', { 'viz-mode-btn--active': vizMode === 'distribution' }]"
                @click.stop="vizMode = 'distribution'">
                <TrendingUp :size="14" />
                <span>分布图</span>
              </button>
              <button
                type="button"
                :class="['viz-mode-btn', { 'viz-mode-btn--active': vizMode === 'scatter' }]"
                @click.stop="vizMode = 'scatter'">
                <Grid :size="14" />
                <span>散点图</span>
              </button>
              <button
                type="button"
                :class="['viz-mode-btn', { 'viz-mode-btn--active': vizMode === 'table' }]"
                @click.stop="vizMode = 'table'">
                <List :size="14" />
                <span>表格</span>
              </button>
            </div>
          </div>

          <!-- 图表区域 -->
          <div v-show="vizMode === 'timeseries'" class="chart-container">
            <div ref="timeSeriesChart" class="chart-area"></div>
          </div>

          <!-- 分布对比图 -->
          <div v-show="vizMode === 'distribution'" class="chart-container">
            <div ref="distributionChart" class="chart-area"></div>
          </div>

          <!-- 散点图 -->
          <div v-show="vizMode === 'scatter'" class="chart-container">
            <div ref="scatterChart" class="chart-area"></div>
          </div>

          <!-- 表格视图 -->
          <div v-show="vizMode === 'table'" class="table-container">
            <!-- 表格图例 -->
            <div class="chart-legend table-legend">
              <div class="legend-item">
                <span class="legend-color legend-color--original"></span>
                <span class="legend-text">原始数据</span>
              </div>
              <div class="legend-item">
                <span class="legend-color legend-color--imputed"></span>
                <span class="legend-text">插补数据</span>
              </div>
            </div>

            <table class="comparison-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>时间</th>
                  <th>数值</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in comparisonTableData" :key="index">
                  <td class="cell-index">{{ row.index }}</td>
                  <td class="cell-time">{{ row.timestamp }}</td>
                  <td class="cell-value">
                    <span v-if="row.original !== null && row.original !== undefined" class="value-normal">
                      {{ Number(row.original).toFixed(2) }}
                    </span>
                    <span v-else-if="row.imputed !== null && row.imputed !== undefined" class="value-imputed">
                      {{ Number(row.imputed).toFixed(2) }}
                    </span>
                    <span v-else class="value-missing">缺失</span>
                  </td>
                  <td class="cell-status">
                    <span v-if="row.original === null" class="status-tag status-tag--imputed">已插补</span>
                    <span v-else class="status-tag status-tag--original">原始</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- 分页控件 -->
            <div class="table-pagination">
              <el-pagination
                v-model:current-page="currentPage"
                v-model:page-size="pageSize"
                :page-sizes="[20, 50, 100, 200]"
                layout="total, sizes, prev, pager, next, jumper"
                :total="allTableData.length"
                size="small" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Version Manager Drawer -->
    <el-drawer v-model="showVersionDrawer" title="数据版本管理" size="450px" destroy-on-close append-to-body>
      <VersionManager
        v-if="datasetInfo"
        :dataset-id="datasetInfo.id"
        @switch-version="handleVersionSwitchFromManager"
        @close="showVersionDrawer = false" />
    </el-drawer>

    <!-- 自定义模型注册对话框 -->
    <CustomModelDialog v-model:visible="showCustomModelDialog" @registered="onCustomModelRegistered" />
  </div>
</template>

<style scoped>
/* ==================== 顶部信息区 ==================== */
.top-info-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  padding: 16px 20px;
}

/* 版本信息行 */
.version-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.version-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.version-bar-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--eco-text-dark);
  white-space: nowrap;
}

.version-meta-text {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  white-space: nowrap;
}

.version-meta-remark {
  font-size: var(--text-sm);
  color: var(--eco-text-mid);
  background: rgba(64, 145, 108, 0.08);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

/* 检测控制行 */
.detection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--eco-border-light);
}

.detection-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.bar-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  white-space: nowrap;
}

.markers-inline {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* 快速统计条 */
.stats-strip {
  display: flex;
  align-items: center;
  gap: 0;
  padding-top: 12px;
  border-top: 1px solid var(--eco-border-light);
}

.stat-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  padding: 8px 12px;
}

.stat-chip-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xl);
  flex-shrink: 0;
}

.stat-chip-icon.icon-blue {
  background: rgba(59, 130, 246, 0.1);
  color: var(--c-info);
}

.stat-chip-icon.icon-purple {
  background: rgba(139, 92, 246, 0.1);
  color: var(--color-purple-600);
}

.stat-chip-icon.icon-red {
  background: rgba(239, 68, 68, 0.1);
  color: var(--c-danger);
}

.stat-chip-info {
  display: flex;
  flex-direction: column;
}

.stat-chip-value {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--c-text-primary);
  line-height: 1.2;
  font-family: var(--font-mono);
}

.stat-chip-label {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  font-weight: 500;
}

.stat-chip--alert .stat-chip-value {
  color: var(--c-danger);
}

.stat-strip-divider {
  width: 1px;
  height: 32px;
  background: var(--c-border);
  flex-shrink: 0;
}

/* ==================== 模块切换Tab ==================== */
.module-switch-tabs {
  display: flex;
  background: var(--eco-surface);
  padding: 4px;
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
}

.module-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: var(--radius-control);
  cursor: pointer;
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--c-text-secondary);
  transition: all 0.3s ease;
}

.module-tab-item:hover {
  background: var(--eco-white);
  color: var(--eco-text-dark);
}

.module-tab-item--active {
  background: var(--eco-white);
  color: var(--eco-moss);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.module-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ==================== 主容器 ==================== */
.gap-filling-panel {
  /* eco design tokens → 设计系统变量映射 */
  --eco-forest: var(--c-text-primary);
  --eco-forest-mid: var(--c-text-primary);
  --eco-pine: var(--c-text-base);
  --eco-moss: var(--c-brand);
  --eco-fern: var(--c-brand-active);
  --eco-spring: var(--c-brand);
  --eco-leaf: var(--c-brand-border);
  --eco-mint: var(--c-border);
  --eco-mist: var(--c-brand-soft);
  --eco-ice: var(--c-bg-muted);
  --eco-surface: var(--c-bg-muted);
  --eco-white: var(--c-bg-surface);
  --eco-border: var(--c-brand-border);
  --eco-border-light: var(--c-border);
  --eco-text-dark: var(--c-text-primary);
  --eco-text-mid: var(--c-text-base);
  --eco-text-muted: var(--c-text-secondary);

  display: flex;
  height: 100%;
  width: 100%;
  background: var(--eco-surface);
  background-image:
    radial-gradient(ellipse at 10% 20%, rgba(45, 106, 79, 0.07) 0%, transparent 50%),
    radial-gradient(ellipse at 90% 80%, rgba(64, 145, 108, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(116, 198, 157, 0.03) 0%, transparent 70%);
  overflow: hidden;
  padding: 8px;
  gap: 8px;
  box-sizing: border-box;
  position: relative;
}

/* eco backdrop decoration */
.eco-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.eco-leaf {
  position: absolute;
}

.eco-leaf-1 {
  top: -20px;
  right: -10px;
  width: 180px;
  height: 180px;
  transform: rotate(15deg);
}
.eco-leaf-2 {
  bottom: 60px;
  left: -20px;
  width: 120px;
  height: 120px;
  transform: rotate(-30deg);
}
.eco-leaf-3 {
  top: 40%;
  right: 5%;
  width: 80px;
  height: 80px;
  transform: rotate(60deg);
}

.eco-net {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 220px;
  height: 220px;
  opacity: 0.8;
}

/* ==================== 空状态 ==================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 64px 24px;
}

.empty-icon {
  font-size: var(--text-display-2xl);
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-title {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--eco-text-dark);
  margin: 0 0 8px 0;
}

.empty-description {
  color: var(--eco-text-muted);
  font-size: var(--text-lg);
  margin: 0;
}

/* ==================== 主布局 ==================== */
.panel-layout {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  gap: 8px;
  position: relative;
  z-index: 1;
}

/* ==================== 侧边栏 ==================== */
.panel-sidebar {
  width: 280px;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--eco-border-light);
}

.new-imputation-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 36px;
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--c-text-inverse);
  background: linear-gradient(135deg, var(--eco-moss), var(--eco-forest-mid));
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(45, 106, 79, 0.3);
}

.new-imputation-btn:hover {
  background: linear-gradient(135deg, var(--eco-pine), var(--eco-forest));
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(45, 106, 79, 0.4);
}

/* ==================== 详细表格 ==================== */
.glass-effect {
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
}

.detailed-table-card {
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  padding: 20px;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.detection-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  margin-top: 20px;
}

.empty-illustration {
  position: relative;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.illustration-icon {
  font-size: var(--text-display-lg);
  color: var(--eco-moss);
  z-index: 2;
  background: var(--eco-white);
  padding: 16px;
  border-radius: var(--radius-full);
  border: 1px solid var(--eco-border-light);
  transition: transform 0.2s ease;
}

.illustration-icon.is-loading {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.circles .circle {
  position: absolute;
  border-radius: var(--radius-full);
  border: 1px solid var(--eco-moss);
  opacity: 0;
  animation: ripple 2s infinite;
}

.circles .c1 {
  width: 60px;
  height: 60px;
  animation-delay: 0s;
}
.circles .c2 {
  width: 80px;
  height: 80px;
  animation-delay: 0.5s;
}
.circles .c3 {
  width: 100px;
  height: 100px;
  animation-delay: 1s;
}

@keyframes ripple {
  0% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.empty-hint-title {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--eco-text-dark);
  margin-bottom: 8px;
}

.empty-hint-desc {
  text-align: center;
  color: var(--eco-text-muted);
  font-size: var(--text-lg);
  line-height: 1.6;
}

.sidebar-subtitle {
  padding: 16px 20px 8px;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--c-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.history-empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--c-text-muted);
  font-size: var(--text-md);
}

.history-item {
  padding: 14px;
  border-radius: var(--radius-panel);
  cursor: pointer;
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  background: var(--eco-surface);
}

.history-item:hover {
  background: var(--eco-ice);
  border-color: var(--eco-border-light);
  box-shadow: 0 2px 8px rgba(45, 106, 79, 0.06);
}

.history-item--active,
.history-item.active {
  background: var(--eco-mist);
  border-color: var(--eco-border);
}

.history-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.drag-handle {
  cursor: grab;
  color: var(--c-text-muted);
  font-size: var(--text-md);
  flex-shrink: 0;
}

.drag-handle:active {
  cursor: grabbing;
}

.history-item--drag-over {
  border-top: 2px solid var(--c-info) !important;
}

.history-name-edit {
  flex: 1;
  min-width: 0;
}

.history-name-input {
  width: 100%;
  padding: 2px 6px;
  border: 1px solid var(--eco-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  outline: none;
  background: var(--eco-white);
}

.history-item-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
}

.history-action-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--c-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
}

.history-action-btn:hover {
  background: rgba(59, 130, 246, 0.1);
  color: var(--c-info);
}

.history-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  color: var(--c-danger) !important;
}

.history-item-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.history-method {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--eco-text-dark);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-stats {
  display: flex;
  gap: 12px;
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
}

/* ==================== 主内容区 ==================== */
.panel-main {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
}

/* ==================== 配置视图 ==================== */
.config-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.version-icon {
  color: var(--eco-moss);
  font-size: var(--text-xl);
}

.version-selector :deep(.el-input__wrapper) {
  background-color: var(--eco-white);
  box-shadow: none;
  border: 1px solid var(--eco-border-light);
}

.version-option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.version-option-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-option-id {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  font-family: var(--font-mono);
}

.version-option-time {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.version-id {
  font-family: var(--font-mono);
  color: var(--c-text-muted);
  font-size: var(--text-sm);
}

/* missing-detection-section removed — detection controls now in .detection-bar inside .top-info-area */

.marker-tag {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  padding: 2px 6px;
}

.detect-btn {
  height: 30px;
  min-width: 100px;
  padding: 0 14px;
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius-control);
  transition: all 0.2s ease;
}

.detect-btn:hover {
  background: var(--eco-pine);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--eco-text-dark);
  display: flex;
  align-items: center;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.table-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--eco-text-dark);
  margin: 0;
  display: flex;
  align-items: center;
}

.table-title::before {
  content: "";
  display: block;
  width: 4px;
  height: 16px;
  background: var(--eco-moss);
  border-radius: var(--radius-xs);
  margin-right: 8px;
}

.table-info {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
}

.table-container {
  overflow-x: auto;
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
}

.column-stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.column-stats-table thead th {
  background: var(--eco-surface);
  padding: 14px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--eco-text-mid);
  border-bottom: 1px solid var(--eco-border-light);
  position: sticky;
  top: 0;
  z-index: 10;
  white-space: nowrap;
}

.column-stats-table thead th.col-missing,
.column-stats-table thead th.col-rate,
.column-stats-table thead th.col-total {
  text-align: center;
}

.column-stats-table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--eco-border-light);
  background: var(--eco-white);
}

.column-stats-table tbody tr:hover td {
  background: var(--eco-ice);
}

.column-stats-table tbody tr.has-missing td {
  background: rgba(254, 242, 242, 0.3);
}

.column-stats-table tbody tr.has-missing:hover td {
  background: rgba(254, 226, 226, 0.4);
}

.col-name {
  min-width: 120px;
  max-width: 200px;
}

.col-missing {
  min-width: 100px;
  text-align: center;
}

.col-rate {
  min-width: 120px;
  text-align: center;
}

.col-total {
  min-width: 100px;
  text-align: center;
}

.col-preview {
  min-width: 200px;
}

.column-name-text {
  font-weight: 500;
  color: var(--eco-text-dark);
}

.missing-count {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--c-text-secondary);
}

.missing-count.has-missing {
  color: var(--c-danger);
}

.total-count {
  font-family: var(--font-mono);
  color: var(--c-text-secondary);
}

/* 缺失率进度条 */
.rate-bar-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.rate-text {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  min-width: 45px;
  text-align: right;
}

.rate-bar-bg {
  flex: 1;
  height: 6px;
  background: var(--c-border);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.rate-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  border-radius: var(--radius-xs);
  transition: width 0.5s ease;
}

.column-stats-table tbody tr.has-missing .rate-bar-fill {
  background: linear-gradient(90deg, #f87171 0%, var(--c-danger) 100%);
}

/* 数据预览 */
.sample-preview {
  font-size: var(--text-xs);
  line-height: 1.4;
}

.sample-item {
  display: flex;
  gap: 6px;
  margin-bottom: 2px;
}

.sample-row {
  color: var(--c-text-muted);
  font-weight: 500;
  min-width: 35px;
}

.sample-value {
  font-family: var(--font-mono);
  color: var(--c-text-secondary);
  word-break: break-all;
}

.sample-value.missing-value {
  color: var(--c-danger);
  font-style: italic;
}

.more-samples {
  color: var(--c-text-muted);
  font-style: italic;
  margin-top: 2px;
}

.no-samples {
  color: var(--c-text-muted);
  font-style: italic;
  font-size: var(--text-xs);
}

/* config-layout removed — imputation module now uses module-container */

/* ==================== 方法选择区 ==================== */
.method-selection-section {
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  padding: 20px;
}

.section-header {
  margin-bottom: 16px;
}

.section-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--eco-text-dark);
  display: flex;
  align-items: center;
  margin: 0;
}

.section-title::before {
  content: "";
  display: block;
  width: 4px;
  height: 16px;
  background: var(--eco-moss);
  border-radius: var(--radius-xs);
  margin-right: 8px;
}

.category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--eco-text-muted);
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-tab:hover {
  border-color: var(--eco-border);
  color: var(--eco-text-dark);
}

.category-tab--active {
  background: linear-gradient(135deg, var(--eco-moss), var(--eco-forest-mid));
  color: var(--c-text-inverse);
  border-color: transparent;
}

.category-icon {
  font-size: var(--text-md);
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.method-card {
  position: relative;
  padding: 14px;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  cursor: pointer;
  transition: all 0.2s ease;
}

.method-card:hover {
  border-color: var(--eco-border);
  background: var(--eco-ice);
  box-shadow: 0 2px 8px rgba(45, 106, 79, 0.08);
}

.method-card--selected {
  background: var(--eco-mist);
  border-color: var(--eco-moss);
  box-shadow: 0 0 0 2px rgba(64, 145, 108, 0.15);
}

.method-card--unavailable {
  opacity: 0.5;
  cursor: not-allowed;
}

.method-card--unavailable:hover {
  transform: none;
  box-shadow: none;
}

.recommended-badge {
  position: absolute;
  top: -8px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--c-warning);
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-radius: var(--radius-control);
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.2);
}

.method-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.method-card-name {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--eco-text-dark);
}

.method-card-tags {
  display: flex;
  gap: 4px;
}

.tag {
  padding: 2px 6px;
  font-size: var(--text-2xs);
  font-weight: 500;
  border-radius: var(--radius-sm);
}

.tag--python {
  background: rgba(59, 130, 246, 0.1);
  color: var(--c-info);
}

.tag--time-fast {
  background: rgba(64, 145, 108, 0.1);
  color: var(--eco-moss);
}

.tag--time-medium {
  background: rgba(245, 158, 11, 0.1);
  color: var(--c-warning);
}

.tag--time-slow {
  background: rgba(239, 68, 68, 0.1);
  color: var(--c-danger);
}

.method-card-description {
  font-size: var(--text-sm);
  color: var(--eco-text-muted);
  line-height: 1.5;
  margin: 0 0 10px 0;
}

.method-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.accuracy-indicator {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.accuracy--high {
  color: var(--eco-moss);
  font-weight: 600;
}

.accuracy--medium {
  color: var(--c-warning);
  font-weight: 600;
}

.accuracy--low {
  color: var(--c-danger);
  font-weight: 600;
}

.selected-indicator {
  color: var(--eco-moss);
}

/* ==================== 参数配置区 ==================== */
.params-config-section {
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 指标列 + 参数配置 并排布局 */
.columns-params-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.columns-params-row > .target-col-collapse {
  flex: 1;
  min-width: 0;
}

.columns-params-row > .method-params {
  flex: 1;
  min-width: 0;
}

/* ==================== 模型信息卡样式 ==================== */
.model-info-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-info-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--c-bg-muted);
  border-radius: 6px;
  color: var(--eco-text-secondary);
  font-size: 13px;
}

.model-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-selector-label {
  font-size: 13px;
  color: var(--eco-text-secondary);
  white-space: nowrap;
}

.model-selector-input {
  flex: 1;
}

.model-info-card {
  background: var(--c-bg-muted);
  border: 1px solid var(--eco-border-light);
  border-radius: 8px;
  padding: 14px;
}

.model-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.model-info-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--eco-text-primary);
}

.model-info-score {
  font-size: 12px;
  color: var(--eco-primary);
  font-weight: 500;
}

.model-info-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.model-meta-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
}

.model-meta-item--full {
  flex: 0 0 100%;
  align-items: flex-start;
}

.model-meta-label {
  color: var(--eco-text-secondary);
  white-space: nowrap;
  padding-top: 2px;
}

.model-meta-value {
  color: var(--eco-text-primary);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  background: var(--eco-border-light);
  padding: 1px 5px;
  border-radius: 3px;
}

.model-meta-value--target {
  background: rgba(var(--eco-primary-rgb, 34, 139, 34), 0.1);
  color: var(--eco-primary);
}

.model-feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.model-feature-tag {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  background: var(--eco-border-light);
  color: var(--eco-text-primary);
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid var(--eco-border);
}

/* ==================== 模型配置折叠面板样式 ==================== */
.model-config-collapse {
  border: none;
}

.model-config-collapse .model-config-collapse-item {
  border: 1px solid var(--eco-border-light);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
}

.model-config-collapse :deep(.el-collapse-item__header) {
  height: 42px;
  line-height: 42px;
  padding: 0 14px;
  background: var(--c-bg-muted);
  border-bottom: none;
  font-size: 13px;
}

.model-config-collapse :deep(.el-collapse-item__header.is-active) {
  border-bottom: 1px solid var(--eco-border-light);
}

.model-config-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

.model-config-collapse :deep(.el-collapse-item__content) {
  padding: 0;
}

.collapse-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.collapse-title-text {
  font-weight: 600;
  color: var(--eco-text-primary);
  white-space: nowrap;
}

.collapse-title-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.collapse-title-badge--ok {
  background: var(--eco-ice, #e8f5e9);
  color: var(--eco-primary, #4caf50);
}

.collapse-title-badge--warn {
  background: #fff8e1;
  color: var(--eco-warning, #e6a23c);
}

.collapse-title-badge--neutral {
  background: var(--eco-border-light, #eee);
  color: var(--eco-text-secondary, #666);
}

/* ==================== 列名映射配置样式 ==================== */
.column-mapping-section {
  padding: 14px;
}

.column-mapping-hint {
  display: block;
  font-size: 12px;
  color: var(--eco-text-secondary);
  margin-bottom: 12px;
}

.column-mapping-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.column-mapping-table--reddyproc {
  gap: 8px;
}

.column-mapping-row {
  display: grid;
  grid-template-columns: 1fr 1fr 80px;
  align-items: center;
  gap: 10px;
}

.column-mapping-row--header {
  font-size: 11px;
  font-weight: 600;
  color: var(--eco-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--eco-border-light);
}

.mapping-model-col {
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--eco-text-primary);
  background: var(--c-bg-muted);
  padding: 4px 8px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mapping-user-col-select {
  width: 100%;
}

.mapping-status {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
}

.mapping-status--ok {
  color: var(--eco-primary);
}

.mapping-status--missing {
  color: var(--eco-warning, #e6a23c);
}

.column-mapping-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--eco-warning, #e6a23c);
}

.model-params-section {
  padding: 14px;
}

.model-params-hint {
  display: block;
  font-size: 12px;
  color: var(--eco-text-secondary);
  margin-bottom: 12px;
}

.method-params {
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
  padding: 14px;
}

.method-params--reddyproc {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 未选择方法 / 无参数时的占位提示 */
.method-params--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--c-text-muted);
  font-size: var(--text-sm);
  text-align: center;
  line-height: 1.6;
}

.params-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  margin: 0 0 12px 0;
}

.params-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reddyproc-geo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.reddyproc-mapping-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reddyproc-mapping-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.reddyproc-mapping-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
}

.reddyproc-mapping-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--eco-text-secondary);
}

.param-row {
  display: flex;
  gap: 10px;
}

.param-item {
  flex: 1;
}

.param-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin-bottom: 6px;
}

.param-input {
  width: 100%;
  padding: 8px 10px;
  font-size: var(--text-sm);
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: var(--radius-control);
  transition: all 0.2s ease;
}

.param-input:focus {
  outline: none;
  border-color: var(--eco-moss);
  box-shadow: 0 0 0 3px rgba(64, 145, 108, 0.1);
}

.param-input-text {
  width: 100%;
}

.param-input-text :deep(.el-input__wrapper) {
  border-radius: var(--radius-control);
}

.param-input-text :deep(.el-input__inner) {
  font-size: var(--text-sm);
}

.params-warning {
  padding: 8px 10px;
  font-size: var(--text-sm);
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: var(--radius-panel);
}

.no-params {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  margin: 0;
}

.action-buttons {
  margin-top: auto;
}

.execute-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 20px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--c-text-inverse);
  background: linear-gradient(135deg, var(--eco-moss), var(--eco-forest-mid));
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
  min-width: 110px;
  box-shadow: 0 2px 10px rgba(45, 106, 79, 0.35);
}

.execute-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--eco-pine), var(--eco-forest));
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(45, 106, 79, 0.45);
}

.execute-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ==================== 进度区 ==================== */
.progress-section {
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  padding: 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.progress-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--eco-text-dark);
  margin: 0;
}

.cancel-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: var(--text-sm);
  color: var(--c-danger);
  background: rgba(254, 242, 242, 0.8);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: rgba(254, 226, 226, 1);
  border-color: var(--c-danger);
}

.progress-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stage-indicators {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.stage-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
  opacity: 0.5;
  transition: all 0.3s ease;
}

.stage-item--active {
  opacity: 1;
  background: var(--eco-ice);
  border: 1px solid var(--eco-border);
}

.stage-item--completed {
  opacity: 1;
  background: var(--eco-mist);
}

.stage-icon {
  font-size: var(--text-3xl);
}

.stage-name {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--c-text-secondary);
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 10px;
  background: var(--c-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  border-radius: var(--radius-md);
  transition: width 0.3s ease;
  position: relative;
  overflow: hidden;
}

.progress-bar-glow {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 100%;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
  transform: translateX(-100%);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  margin-right: 8px;
}

.status-dot--running {
  background-color: var(--c-info);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  animation: pulse 2s infinite;
}

.status-dot--completed {
  background-color: var(--eco-moss);
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.progress-detail {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  margin-top: 4px;
}

.save-btn--disabled {
  opacity: 0.7;
  cursor: not-allowed;
  background: rgba(243, 244, 246, 0.8);
  border-color: rgba(209, 213, 219, 0.8);
}

.save-btn--disabled:hover {
  transform: none;
  box-shadow: none;
  background: rgba(243, 244, 246, 0.8);
  border-color: rgba(209, 213, 219, 0.8);
}

.save-btn--disabled .el-icon {
  color: var(--eco-moss);
}

.save-btn--disabled span:first-of-type {
  color: var(--eco-moss);
}

.progress-text {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--eco-moss);
  min-width: 45px;
  text-align: right;
}

.progress-info {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.completion-actions {
  margin-top: 8px;
  animation: fadeIn 0.5s ease;
}

.progress-message {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin: 0;
}

.execution-logs {
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
  overflow: hidden;
}

.logs-header {
  padding: 10px 14px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  background: var(--c-bg-muted);
  border-bottom: 1px solid var(--c-border);
}

.logs-content {
  max-height: 120px;
  overflow-y: auto;
  padding: 8px;
}

.log-item {
  display: flex;
  gap: 10px;
  padding: 4px 6px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}

.log-time {
  color: var(--c-text-muted);
}

.log-level {
  font-weight: 600;
  text-transform: uppercase;
}

.log-level--info {
  color: var(--c-info);
}

.log-level--warning {
  color: var(--c-warning);
}

.log-level--error {
  color: var(--c-danger);
}

.log-message {
  color: var(--c-text-base);
}

/* ==================== 结果视图 ==================== */
.result-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

/* ==================== 逐列统计报告 ==================== */
.stats-report {
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  overflow: hidden;
}

.stats-report-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--eco-surface);
  border-bottom: 1px solid var(--eco-border-light);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--eco-text-mid);
}

.stats-report-table-wrapper {
  overflow-x: auto;
}

.stats-report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  white-space: nowrap;
}

.stats-report-table th {
  padding: 9px 14px;
  background: var(--eco-surface);
  font-weight: 600;
  color: var(--eco-text-mid);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border-bottom: 1px solid var(--eco-border-light);
  text-align: left;
}

.stats-report-table td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--c-bg-muted);
  vertical-align: middle;
}

.stats-report-table tbody tr:last-child td {
  border-bottom: none;
}

.stats-report-table tbody tr:hover td {
  background: var(--eco-surface);
}

.stat-col-name {
  font-weight: 600;
  color: var(--eco-text-dark);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-missing {
  color: var(--c-danger);
  font-weight: 500;
  font-family: var(--font-mono);
}

.stat-imputed {
  color: var(--c-info);
  font-weight: 500;
  font-family: var(--font-mono);
}

.stat-num {
  font-family: var(--font-mono);
  color: var(--c-text-base);
}

.stat-rate-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
  font-weight: 600;
}
.stat-rate-badge--low {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}
.stat-rate-badge--mid {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}
.stat-rate-badge--high {
  background: rgba(239, 68, 68, 0.12);
  color: var(--c-danger);
}

.stat-delta {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
}
.stat-delta--pos {
  color: var(--eco-pine);
}
.stat-delta--neg {
  color: var(--c-danger);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-title {
  font-size: var(--text-3xl);
  font-weight: 600;
  color: var(--eco-text-dark);
  margin: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--eco-text-muted);
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
}

.back-btn:hover {
  background: var(--eco-mist);
  border-color: var(--eco-border);
  color: var(--eco-pine);
}

.viz-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
}

.viz-column-select {
  display: flex;
  align-items: center;
  gap: 10px;
}

.viz-column-select label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--c-text-base);
}

.viz-select {
  padding: 8px 12px;
  font-size: var(--text-sm);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-control);
  background: var(--eco-white);
  min-width: 200px;
}

.viz-select:focus {
  outline: none;
  border-color: var(--eco-moss);
}

.viz-mode-switch {
  display: flex;
  gap: 6px;
}

.viz-mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--eco-text-muted);
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
}

.viz-mode-btn:hover {
  border-color: var(--eco-border);
  color: var(--eco-text-dark);
}

.viz-mode-btn--active {
  background: linear-gradient(135deg, var(--eco-moss), var(--eco-forest-mid));
  color: var(--c-text-inverse);
  border-color: transparent;
}

.chart-container {
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  padding: 16px;
  min-height: 350px;
}

.chart-area {
  width: 100%;
  height: 320px;
}

.table-container {
  background: var(--eco-white);
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  overflow: hidden;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.comparison-table th,
.comparison-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--eco-border-light);
}

.comparison-table th {
  background: var(--eco-surface);
  font-weight: 600;
  color: var(--eco-text-mid);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.cell-index {
  color: var(--c-text-muted);
  font-weight: 500;
  text-align: center;
  width: 60px;
}

.cell-time {
  font-family: var(--font-mono);
  color: var(--c-text-secondary);
}

.value-missing {
  color: var(--c-danger);
  font-style: italic;
}

.value-normal {
  color: #22c55e;
  font-weight: 500;
  font-family: var(--font-mono);
}

.value-imputed {
  color: var(--c-warning);
  font-weight: 600;
  font-family: var(--font-mono);
}

.confidence-bar {
  width: 60px;
  height: 6px;
  background: var(--c-border);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  border-radius: var(--radius-xs);
}

.status-tag {
  display: inline-block;
  padding: 3px 8px;
  font-size: var(--text-2xs);
  font-weight: 600;
  border-radius: var(--radius-control);
}

.status-tag--imputed {
  background: rgba(59, 130, 246, 0.1);
  color: var(--c-info);
}

.status-tag--original {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding: 12px;
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-xs);
}

.legend-color--original {
  background: #22c55e;
}

.legend-color--imputed {
  background: var(--c-warning);
}

.legend-color--missing {
  background: var(--c-danger);
}

.result-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-save-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--eco-pine);
  background: var(--eco-ice);
  border: 1px solid var(--eco-border);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.compact-save-btn:hover:not(:disabled) {
  background: var(--eco-mist);
  border-color: var(--eco-moss);
}

.compact-save-btn:disabled,
.compact-save-btn--done {
  opacity: 0.7;
  cursor: default;
}

.legend-text {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
}

/* ==================== 滚动条样式 ==================== */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(64, 145, 108, 0.25);
  border-radius: var(--radius-xs);
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(64, 145, 108, 0.45);
}

.table-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  padding: 0 4px;
}

/* ==================== 响应式设计 ==================== */
@media (max-width: 1200px) {
  .panel-sidebar {
    width: 240px;
  }

  .reddyproc-geo-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .panel-layout {
    flex-direction: column;
  }

  .panel-sidebar {
    width: 100%;
    max-height: 200px;
  }

  .methods-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }

  .category-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .viz-controls {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .viz-mode-switch {
    justify-content: center;
  }

  .columns-params-row {
    flex-direction: column;
  }

  .column-mapping-row {
    grid-template-columns: 1fr;
  }

  .reddyproc-mapping-header {
    flex-direction: column;
  }
}

/* ==================== 自定义模型相关样式 ==================== */
.method-card--add {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  border: 2px dashed var(--c-border);
  background: var(--c-bg-muted);
  cursor: pointer;
}

.method-card--add:hover {
  border-color: var(--eco-moss);
  background: var(--eco-ice);
}

.add-model-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--eco-text-muted);
}

.method-card--add:hover .add-model-content {
  color: var(--eco-moss);
}

.add-model-text {
  font-size: var(--text-md);
  font-weight: 600;
}

.add-model-hint {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  text-align: center;
}

.custom-empty-hint {
  text-align: center;
  padding: 24px 16px 8px;
}

.custom-empty-icon {
  font-size: var(--text-display-md);
  margin-bottom: 8px;
}

.custom-empty-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--c-text-base);
  margin: 0 0 8px;
}

.custom-empty-desc {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  line-height: 1.6;
  margin: 0;
}
</style>
