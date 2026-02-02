<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, toRaw, shallowRef } from "vue";
import { ElMessage, ElNotification, ElMessageBox } from "element-plus";
import { 
  Plus,
  Delete,
  Refresh, 
  Setting, 
  TrendCharts, 
  Check,
  List,
  Star,
  VideoPlay,
  Close,
  InfoFilled,
  Search,
  Edit,
  ArrowRight,
  Connection
} from "@element-plus/icons-vue";
import type { DatasetInfo } from "@shared/types/projectInterface";
import type { OutlierResult } from "@shared/types/database";
import type { 
  ImputationMethodParam, 
  ExecuteImputationRequest,
  ImputationMethodId,
  ImputationCategory,
  ImputationResultStatus,
  ImputationMethod,
  ImputationResult,
  ImputationProgressEvent,
  ImputationDetail
} from "@shared/types/imputation";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import { useGapFillingStore } from "@/stores/useGapFillingStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import * as echarts from 'echarts';
import MissingAnalysisView from '../gapfilling/MissingAnalysisView.vue';

// ==================== Props & Emits ====================
interface ColumnInfo {
  name: string;
  missingCount: number;
  missingRate: number;
  type: string;
}

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
type ViewMode = 'config' | 'result';
const currentView = ref<ViewMode>('config');
const activeModule = ref<'detection' | 'analysis' | 'imputation'>('detection');

// 监听视图模式变化，离开结果页时销毁图表
watch(currentView, (newVal) => {
  if (newVal !== 'result') {
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
const showArchivedHistory = ref(false); // 是否显示已归档(已应用)的历史记录

const visibleImputationResults = computed(() => {
  if (showArchivedHistory.value) {
    return imputationResults.value;
  }
  // 默认隐藏已应用的记录，只显示草稿/失败/进行中的记录
  return imputationResults.value.filter(r => r.status !== 'APPLIED');
});

// ==================== 方法选择状态 ====================
const categories = [
  { value: 'basic', label: '基础方法', icon: '📊' },
  { value: 'statistical', label: '统计方法', icon: '📈' },
  { value: 'timeseries', label: '时序模型', icon: '⏱️' },
  { value: 'ml', label: '机器学习', icon: '🤖' },
  { value: 'dl', label: '深度学习', icon: '🧠' },
];

const activeCategory = ref<ImputationCategory>('basic');
const selectedMethodId = ref<ImputationMethodId | null>(null);

// 从数据库获取的插补方法
const imputationMethods = ref<ImputationMethod[]>([]);
// 硬编码的推荐方法ID
const recommendedMethodIds = ref<ImputationMethodId[]>(['LINEAR', 'ARIMA', 'KNN']);

// 方法参数缓存
const methodParamsCache = ref<Record<string, ImputationMethodParam[]>>({});

// 加载插补方法
const loadImputationMethods = async () => {
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_AVAILABLE_METHODS);
    if (result.success) {
      imputationMethods.value = result.data;
    } else {
      ElMessage.error('加载插补方法失败: ' + (result.error || '未知错误'));
    }
  } catch (error: any) {
    console.error('加载插补方法失败:', error);
    ElMessage.error('加载插补方法失败: ' + error.message);
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
      ElMessage.error('加载方法参数失败: ' + (result.error || '未知错误'));
      return [];
    }
  } catch (error: any) {
    console.error('加载方法参数失败:', error);
    ElMessage.error('加载方法参数失败: ' + error.message);
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
      value: typeof opt.value === 'number' ? opt.value : opt.value
    }));
  } catch (error) {
    console.error('解析参数选项失败:', error);
    return [];
  }
};

// ==================== 参数配置状态 ====================
const columnSelectionMode = ref<'all' | 'manual'>('all');
const selectedColumns = ref<string[]>([]);
const paramValues = ref<Record<string, any>>({});

// ==================== 执行状态 ====================
const isExecuting = ref<boolean>(false);
const progressInfo = ref<ImputationProgressEvent | null>(null);
const executionLogs = ref<{ id: number; time: string; level: string; message: string }[]>([]);

// ==================== 可视化状态 ====================
const vizSelectedColumn = ref<string>('');
const vizMode = ref<'timeseries' | 'table'>('timeseries');
const timeSeriesChart = ref<HTMLDivElement | null>(null);
const timeSeriesInstance = shallowRef<echarts.ECharts | null>(null);
const allTableData = shallowRef<any[]>([]); // 存储所有表格数据
const imputedMap = shallowRef<Map<number, { value: number; confidence?: number }>>(new Map()); // 存储插补详情映射
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
      timestamp: row._epochMs ? new Date(row._epochMs).toLocaleString() : (row.TIMESTAMP || ''),
      original: row[vizSelectedColumn.value],
      imputed: imputedInfo?.value ?? null,
      confidence: imputedInfo?.confidence ?? null // 保留数据以便逻辑处理，虽然界面不显示
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

const availableColumns = computed<ColumnInfo[]>(() => {
  if (!props.datasetInfo?.originalFile?.columns) return [];
  
  // 1. 优先使用 GapFillingStore 的实时检测结果 (最准确)
  if (gapFillingStore.missingStats && 
      gapFillingStore.missingStats.datasetId === Number(props.datasetInfo.id) &&
      gapFillingStore.missingStats.versionId === currentVersion.value?.id) {
    
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

// 监听 vizMode 变化，切换回时序图时重置大小
watch(vizMode, (newVal) => {
  if (newVal === 'timeseries') {
    nextTick(() => {
      timeSeriesInstance.value?.resize();
    });
  }
});

// 监听选中列变化，刷新图表
watch(vizSelectedColumn, () => {
  if (vizSelectedColumn.value) {
    updateComparisonChart();
  }
});

const columnsWithMissing = computed(() => {
  return availableColumns.value.filter(col => col.missingCount > 0);
});

const canExecute = computed(() => {
  if (!selectedMethodId.value) return false;
  if (!props.datasetInfo) return false;
  if (!currentVersion.value) return false; // 必须有选中的版本
  if (columnSelectionMode.value === 'manual' && selectedColumns.value.length === 0) return false;
  return true;
});

const progress = computed(() => {
  return progressInfo.value?.progress || 0;
});
const progressMessage = computed(() => progressInfo.value?.message || '');

// 当前方法的参数配置
const currentMethodParams = computed(() => {
  if (!selectedMethodId.value) return [];
  return methodParamsCache.value[selectedMethodId.value] || [];
});

// 高级参数
const advancedParams = computed(() => {
  return currentMethodParams.value.filter(p => p.isAdvanced);
});

// 普通参数
const basicParams = computed(() => {
  return currentMethodParams.value.filter(p => !p.isAdvanced);
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

const getMissingRateClass = (rate: number): string => {
  if (rate === 0) return "missing-rate--none";
  if (rate <= 5) return "missing-rate--low";
  if (rate <= 15) return "missing-rate--medium";
  return "missing-rate--high";
};

const isRecommended = (methodId: ImputationMethodId): boolean => {
  return recommendedMethodIds.value.includes(methodId);
};

const getTimeLabel = (time?: 'fast' | 'medium' | 'slow'): string => {
  const labels = { fast: '快速', medium: '中等', slow: '较慢' };
  return labels[time || 'medium'];
};

const getMethodName = (methodId: ImputationMethodId): string => {
  return imputationMethods.value.find(m => m.methodId === methodId)?.methodName || methodId;
};

const getStatusType = (status: ImputationResultStatus): string => {
  const types: Record<ImputationResultStatus, string> = {
    PENDING: 'info',
    RUNNING: 'warning',
    COMPLETED: 'success',
    FAILED: 'danger',
    APPLIED: 'success',
    REVERTED: 'info',
  };
  return types[status];
};

const getStatusText = (status: ImputationResultStatus): string => {
  const texts: Record<ImputationResultStatus, string> = {
    PENDING: '待执行',
    RUNNING: '执行中',
    COMPLETED: '已完成',
    FAILED: '失败',
    APPLIED: '已应用',
    REVERTED: '已撤销',
  };
  return texts[status];
};

const getStageLabel = (stage: string): string => {
  const map: Record<string, string> = {
    preparing: '准备数据',
    training: '模型训练',
    imputing: '执行插补',
    validating: '结果验证',
    preview: '生成预览',
    saving: '保存结果',
    completed: '完成'
  };
  return map[stage] || stage;
};

const getVersionLabel = (stage?: string, versionId?: number) => {
  // 优先使用版本的 remark
  if (versionId) {
    const ver = versions.value.find(v => v.id === versionId);
    if (ver?.remark) {
      return ver.remark;
    }
  }
  
  // 回退到默认标签
  if (stage === 'RAW') return '原始版本';
  if (stage === 'FILTERED' && versionId) {
    const outlierName = versionNameMap.value.get(versionId);
    if (outlierName) return outlierName;
    return '经过过滤';
  }
  if (stage === 'QC') return '插补后';
  return stage || '未知版本';
};

const getVersionTagType = (stage?: string) => {
  switch (stage) {
    case 'RAW': return 'info';
    case 'FILTERED': return 'warning';
    case 'QC': return 'success';
    default: return 'info';
  }
};

import { formatLocalWithTZ } from '@/utils/timeUtils';

const formatDateTime = (dateInput: string | number): string => {
  // 确保字符串时间被视为UTC (如果未包含时区信息)
  let input = dateInput;
  if (typeof input === 'string' && !input.endsWith('Z') && !input.includes('+') && !input.includes('T')) {
    // 简单的 "YYYY-MM-DD HH:mm:ss" 格式，通常是数据库存储的 UTC 时间
    input = input.replace(' ', 'T') + 'Z';
  } else if (typeof input === 'string' && !input.endsWith('Z') && !input.includes('+')) {
    // 已经是 ISO 格式但没有时区，视为 UTC
    input = input + 'Z';
  }
  
  return formatLocalWithTZ(input);
};

const getHistoryTitle = (result: ImputationResult) => {
  // 1. 版本信息 - 如果已应用，显示新版本名称；否则显示源版本名称
  let verLabel = '';
  
  // 优先使用新生成的版本（如果已应用）
  if (result.newVersionId) {
    const newVer = versions.value.find(v => v.id === result.newVersionId);
    if (newVer) {
      verLabel = newVer.remark || getVersionLabel(newVer.stageType, newVer.id);
    } else {
      verLabel = `版本#${result.newVersionId}`;
    }
  } else {
    // 未应用时，显示源版本信息
    const ver = versions.value.find(v => v.id === result.versionId);
    if (ver) {
      verLabel = ver.remark || getVersionLabel(ver.stageType, ver.id);
    } else {
      verLabel = `版本#${result.versionId}`;
    }
  }
  
  // 2. 方法名称
  const method = getMethodName(result.methodId);
  
  // 3. 参数 (格式化展示)
  let paramsStr = '';
  if (result.methodParams && Object.keys(result.methodParams).length > 0) {
    const validParams = Object.values(result.methodParams)
      .filter(v => v !== null && v !== undefined && v !== '')
      .join(', ');
    if (validParams) {
      paramsStr = ` - [${validParams}]`;
    }
  }
  
  // 4. 时间
  const timeStr = formatDateTime(result.executedAt);
  
  return `${verLabel} - ${method}${paramsStr} - ${timeStr}`;
};

const handleVersionChange = async (versionId: number) => {
  if (versionId === currentVersion.value?.id) return;
  await datasetStore.setCurrentVersion(versionId);
  // 切换版本时清除之前的缺失统计
  gapFillingStore.clearStats();
  ElMessage.success('已切换数据版本');
};

// 检测缺失值 (手动触发，带提示)
const detectMissingValues = async () => {
  if (!props.datasetInfo?.id || !currentVersion.value?.id) {
    ElMessage.warning('请先选择数据集和版本');
    return;
  }

  try {
    // 设置目标版本
    gapFillingStore.setTargetVersion(
      parseInt(props.datasetInfo.id),
      currentVersion.value.id
    );

    // 执行缺失值检测
    const stats = await gapFillingStore.loadVersionMissingStats(
      parseInt(props.datasetInfo.id),
      currentVersion.value.id
    );

    if (stats) {
      ElMessage.success(`检测完成，发现 ${stats.totalMissingValues} 个缺失值`);
    } else {
      ElMessage.error('检测失败，请重试');
    }
  } catch (error: any) {
    console.error('检测缺失值失败:', error);
    ElMessage.error('检测失败: ' + error.message);
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
    console.error('[自动检测] 缺失值检测失败:', error);
    // 自动检测失败时静默处理，用户可以手动重试
  }
};

const formatVersionLabel = (version: any) => {
  const label = getVersionLabel(version.stageType, version.id);
  return `${label} #${version.id}`;
};

// ==================== 视图切换 ====================
const switchToConfig = () => {
  currentView.value = 'config';
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
  currentView.value = 'result';
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
    
    currentView.value = 'result';
    isSavedAsVersion.value = false;
    loadResultComparison(currentResultId.value);
  }
};

// ==================== 方法选择 ====================
const selectMethod = async (method: ImputationMethod) => {
  if (!method.isAvailable) return;

  const mId = method.methodId || (typeof method.id === 'string' ? (method.id as unknown as ImputationMethodId) : undefined);
  if (!mId) {
     console.error('Method ID missing:', method);
     ElMessage.error('方法ID缺失，无法选择');
     return;
  }

  selectedMethodId.value = mId;
  // 初始化默认参数
  await initMethodParams(method);
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
        case 'number':
          paramValues.value[param.paramKey] = Number(param.defaultValue);
          break;
        case 'boolean':
          paramValues.value[param.paramKey] = param.defaultValue === 'true';
          break;
        case 'select':
          paramValues.value[param.paramKey] = param.defaultValue;
          break;
        default:
          paramValues.value[param.paramKey] = param.defaultValue;
      }
    }
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
      stage: 'preparing',
      message: '准备数据...',
    };
    executionLogs.value = [];

    const targetCols = columnSelectionMode.value === 'all' 
      ? availableColumns.value.map(c => c.name) // 明确传递所有列名
      : selectedColumns.value;

    ElNotification({
      title: "开始插补",
      message: `正在使用 ${getMethodName(selectedMethodId.value)} 方法进行插补...`,
      type: "info",
      duration: 3000,
    });

    if (!currentVersion.value?.id) {
      ElMessage.error('无法获取当前数据版本ID，请尝试重新选择版本或刷新页面');
      isExecuting.value = false;
      return;
    }

    const payload: ExecuteImputationRequest = {
      datasetId: parseInt(String(props.datasetInfo?.id || '0')),
      versionId: currentVersion.value.id,
      methodId: selectedMethodId.value!,
      targetColumns: toRaw(targetCols),
      params: toRaw(paramValues.value)
    };
    
    console.log('[GapFillingPanel] Debug Execution Payload:', payload);

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
        stage: 'completed',
        message: '插补计算已完成，请点击查看结果',
      };

      // 刷新历史记录
      await loadHistory();
      emit("refresh");
    } else {
      throw new Error(result.error || '执行失败');
    }

  } catch (error: any) {
    console.error("插补处理失败:", error);
    ElMessage.error(error.message || "插补处理失败，请重试");
    addLog('error', error.message || "插补处理失败");
    isExecuting.value = false;
  }
};

// 监听进度事件
const setupProgressListeners = () => {
  window.electronAPI.on('imputation:progress', (event: any) => {
    // 确保是当前任务的进度
    // 由于 executeImputation 是异步等待，我们这里直接更新 UI
    progressInfo.value = event;
    
    // 添加日志
    if (event.message && (!executionLogs.value.length || executionLogs.value[executionLogs.value.length - 1].message !== event.message)) {
      addLog('info', event.message);
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
  ElMessage.warning('已取消执行');
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
      offset: 0
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
        currentView.value = 'config';
      }
      ElMessage.success('已删除');
    } else {
      ElMessage.error(result.error || '删除失败');
    }
  } catch (error: any) {
     ElMessage.error(error.message || '删除失败');
  }
};

const vizColumnOptions = computed(() => {
  if (currentView.value === 'result' && currentResultId.value) {
    const result = imputationResults.value.find(r => r.id === currentResultId.value);
    if (result && result.targetColumns && result.targetColumns.length > 0) {
      return result.targetColumns.map(colName => {
        const currentStats = availableColumns.value.find(c => c.name === colName);
        return {
          name: colName,
          missingCount: currentStats ? currentStats.missingCount : '?'
        };
      });
    }
  }
  return columnsWithMissing.value;
});

const loadResultComparison = async (_resultId: number) => {
  // 模拟加载对比数据
  await nextTick();
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
  if (currentView.value !== 'result') return;
  if (!vizSelectedColumn.value) return;
  
  // 在结果视图中，使用插补结果的源版本ID获取文件路径
  let targetVersionId: number | undefined;
  if (currentView.value === 'result' && currentResultId.value) {
    const result = imputationResults.value.find(r => r.id === currentResultId.value);
    targetVersionId = result?.versionId;
  }
  
  // 获取文件路径
  const filePath = getVersionFilePath(targetVersionId);
  if (!filePath) {
    ElMessage.warning('无法获取当前版本的文件路径');
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
      missingValueTypes: toRaw(props.datasetInfo?.missingValueTypes) || []
    });

    if (currentView.value !== 'result') return; // 防止在异步期间切换了视图

    if (timeSeriesInstance.value) {
      timeSeriesInstance.value.hideLoading();
    }

    if (!result.success || !result.data) {
      throw new Error(result.error || '读取数据失败');
    }

    const { tableData } = result.data;

    // 处理数据用于 ECharts
    const originalData = tableData.map((row: any) => {
      const timestamp = row._epochMs || row.TIMESTAMP || row.record_time || row.time;
      const value = row[vizSelectedColumn.value];
      return [timestamp, value];
    });

    // 加载插补结果数据
    let imputedData: any[] = [];
    if (currentResultId.value) {
      try {
        const detailsRes = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_DETAILS, {
          resultId: currentResultId.value,
          columnName: vizSelectedColumn.value,
          limit: 100000 // 获取足够多的插补详情
        });

        if (detailsRes.success && detailsRes.data) {
          imputedData = detailsRes.data.map((detail: ImputationDetail) => {
            if (detail.rowIndex >= 0 && detail.rowIndex < tableData.length) {
              const row = tableData[detail.rowIndex];
              const timestamp = row._epochMs || row.TIMESTAMP || row.record_time || row.time;
              return [timestamp, detail.imputedValue];
            }
            return null;
          }).filter((item: any) => item !== null);
        }
      } catch (error) {
        console.error('加载插补详情失败:', error);
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
      console.warn('ECharts container not found after retries');
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
        } catch (e) { /* ignore */ }
        timeSeriesInstance.value = null;
      }
    }

    if (!timeSeriesInstance.value) {
      try {
        timeSeriesInstance.value = echarts.init(timeSeriesChart.value);
      } catch (e) {
        console.error('ECharts init failed:', e);
        return;
      }
    }
    
    if (timeSeriesInstance.value) {
      // ========== 大数据量优化配置 ==========
      const dataLength = originalData.length;
      const imputedLength = imputedData.length;
      const isLargeData = dataLength > 5000 || imputedLength > 1000;

      const defaultEnd = isLargeData ? Math.min(20, 100 * 2000 / dataLength) : 100;

      const option = {
        animation: false,
        progressive: isLargeData ? 500 : 0,
        progressiveThreshold: 3000,
        hoverLayerThreshold: 3000,
        tooltip: {
          trigger: 'axis',
          confine: true,
          enterable: false,
          hideDelay: 0,
          axisPointer: {
            type: isLargeData ? 'line' : 'cross',
            animation: false
          },
          formatter: (params: any) => {
            let result = '';
            if (params[0] && params[0].value) {
              const date = new Date(params[0].value[0]);
              result += `${date.toLocaleString()}<br/>`;
            }
            params.forEach((param: any) => {
              const value = param.value[1];
              const label = param.seriesName;
              result += `${label}: ${value !== null && value !== undefined ? Number(value).toFixed(2) : '缺失'}<br/>`;
            });
            return result;
          }
        },
        legend: {
          data: ['原始数据', '插补值'],
          bottom: 10
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '5%',
          containLabel: true
        },
        xAxis: {
          type: 'time',
          axisLabel: { fontSize: 10 },
          splitNumber: isLargeData ? 5 : 8
        },
        yAxis: {
          type: 'value',
          scale: true,
          axisLabel: { fontSize: 10 },
          splitNumber: isLargeData ? 5 : 8
        },
        dataZoom: [
          {
            type: 'slider',
            show: true,
            xAxisIndex: [0],
            start: 0,
            end: defaultEnd,
            filterMode: 'filter',
            throttle: 100
          },
          {
            type: 'inside',
            xAxisIndex: [0],
            start: 0,
            end: defaultEnd,
            filterMode: 'filter',
            throttle: 100,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true
          }
        ],
        series: [
          {
            name: '原始数据',
            type: 'line',
            data: originalData,
            itemStyle: { color: '#22c55e' },
            lineStyle: { width: isLargeData ? 1 : 1.5 },
            showSymbol: false,
            sampling: 'lttb',
            connectNulls: false,
            large: isLargeData,
            largeThreshold: 2000,
            emphasis: {
              disabled: isLargeData
            }
          },
          {
            name: '插补值',
            type: 'scatter',
            data: imputedData,
            itemStyle: {
              color: '#f59e0b',
              opacity: imputedLength > 500 ? 0.7 : 1
            },
            symbolSize: imputedLength > 1000 ? 2 : (imputedLength > 500 ? 3 : 4),
            large: true,
            largeThreshold: 500,
            z: 10,
            emphasis: {
              disabled: imputedLength > 1000,
              scale: false
            }
          }
        ]
      };

      timeSeriesInstance.value.setOption(option, true);
      timeSeriesInstance.value.resize(); // 确保大小正确
    }

    // 更新表格数据
    allTableData.value = tableData;

    // 创建插补数据的索引映射
    imputedMap.value = new Map();

    if (imputedData.length > 0) {
      // 重新构建 Map，这里复用之前获取的 imputedData 逻辑有点麻烦，
      // 但由于 format 变了 (imputedData是[time, value])，我们还是得用 detailsRes 的原始数据
      // 或者简单点，再次遍历 imputedData? 不，imputedData 已经丢失了 rowIndex
      // 所以最好是在上面 try catch 里把 detailsRes 保存下来或者同时构建 map
      // 为简化代码，这里再次调用一次 map 逻辑 (内存操作很快)
      // 不过为了性能，我们在上面获取 detailsRes 时直接构建 map 更好。
      // 下面是修复逻辑：
    }

    // 修正：在上面获取 detailsRes 时已经构建了 imputedData，这里需要重新获取一次 raw details 用于表格？
    // 或者我们在上面就一起做。
    //
    // 重新获取一下用于表格的 Map (虽然有点重复，但逻辑清晰)
    if (currentResultId.value) {
      try {
        // 使用缓存或者重新请求
        const detailsRes = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_DETAILS, {
          resultId: currentResultId.value,
          columnName: vizSelectedColumn.value,
          limit: 100000
        });
        if (detailsRes.success && detailsRes.data) {
          const newMap = new Map<number, { value: number; confidence?: number }>();
          detailsRes.data.forEach((detail: ImputationDetail) => {
            newMap.set(detail.rowIndex, {
              value: detail.imputedValue,
              confidence: detail.confidence
            });
          });
          imputedMap.value = newMap;
        }
      } catch (e) {
        console.error('加载插补详情(表格)失败', e);
      }
    }

    currentPage.value = 1;

  } catch (error: any) {
    console.error('加载图表数据失败:', error);
    ElMessage.error('加载图表数据失败: ' + error.message);
    if (timeSeriesInstance.value) {
      timeSeriesInstance.value.hideLoading();
    }
  }
};



// ==================== 保存结果 ====================
const saveAsNewVersion = async () => {
  if (!currentResultId.value) return;
  
  try {
    // 获取当前版本的名称作为默认值
    const currentVersionName = currentVersion.value?.remark || `插补处理 - ${getMethodName(selectedMethodId.value || 'UNKNOWN' as any)}`;
    
    // 弹出输入对话框
    const { value: versionName } = await ElMessageBox.prompt('请输入新版本的名称', '保存为新版本', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPlaceholder: '请输入版本名称',
      inputValue: currentVersionName,
      inputValidator: (value) => {
        if (!value || value.trim() === '') {
          return '版本名称不能为空';
        }
        return true;
      }
    });
    
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.APPLY_VERSION, {
      resultId: currentResultId.value,
      remark: versionName.trim()
    });
    
    if (result.success) {
      ElMessage.success('已成功保存为新版本');
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
      ElMessage.error(result.error || '保存版本失败');
    }
  } catch (error: any) {
    // 用户取消操作
    if (error === 'cancel') {
      return;
    }
    ElMessage.error(error.message || '保存版本失败');
  }
};

const saveAsFile = async () => {
  if (!currentResultId.value) return;
  
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.EXPORT_FILE, {
      resultId: currentResultId.value
    });
    
    if (result.success) {
      ElMessage.success(`文件已导出: ${result.data}`);
    } else if (result.cancelled) {
      // 用户取消
    } else {
      ElMessage.error(result.error || '导出失败');
    }
  } catch (error: any) {
    console.error('导出失败', error);
    ElMessage.error(error.message || '导出失败');
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
    console.error('加载异常检测结果失败:', e);
    outlierResults.value = [];
  }
};

watch(
  () => props.datasetInfo,
  () => {
    selectedColumns.value = [];
    currentResultId.value = null;
    currentView.value = 'config';
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
        currentView.value = 'config';
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

onMounted(async () => {
  window.addEventListener('resize', () => {
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
            <el-icon><Plus /></el-icon>
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
              <span>暂无草稿记录</span>
            </div>
            <div 
              v-for="result in visibleImputationResults" 
              :key="result.id" 
              class="history-item"
              :class="{ 'history-item--active': currentResultId === result.id }"
              @click="viewResult(result)">
              <div class="history-item-header">
                <span class="history-time">{{ formatDateTime(result.executedAt) }}</span>
                <button class="history-delete-btn" @click.stop="deleteResult(result.id)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
              <div class="history-item-content">
                <span class="history-method" :title="getHistoryTitle(result)">{{ getHistoryTitle(result) }}</span>
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
          
          <!-- 版本信息横幅 -->
          <div class="version-info-banner" v-if="currentVersion">
            <div class="version-info-item">
              <el-icon class="version-icon"><InfoFilled /></el-icon>
              <span class="version-label">当前数据版本：</span>
              <div class="version-value">
                <el-select
                  :model-value="currentVersion.id"
                  @update:model-value="handleVersionChange"
                  class="version-selector"
                  size="small"
                  style="width: 320px"
                >
                  <el-option
                    v-for="ver in versions"
                    :key="ver.id"
                    :label="formatVersionLabel(ver)"
                    :value="ver.id"
                  >
                    <div class="version-option-item">
                      <div class="version-option-left">
                        <el-tag :type="getVersionTagType(ver.stageType)" size="small" effect="light" class="version-tag">
                          {{ getVersionLabel(ver.stageType, ver.id) }}
                        </el-tag>
                        <span class="version-option-id">#{{ ver.id }}</span>
                      </div>
                      <span class="version-option-time">{{ formatDateTime(ver.createdAt) }}</span>
                    </div>
                  </el-option>
                </el-select>
                <el-button link type="primary" @click="showVersionDrawer = true" class="version-lineage-btn">
                  <el-icon><Connection /></el-icon>
                  版本谱系
                </el-button>
              </div>
            </div>

            <div class="version-info-item">
              <span class="version-label">创建时间：</span>
              <span class="version-value">{{ formatDateTime(currentVersion.createdAt) }}</span>
            </div>

            <div class="version-info-item" v-if="currentVersion.remark">
              <span class="version-label">备注：</span>
              <span class="version-value">{{ currentVersion.remark }}</span>
            </div>
          </div>

          <!-- 模块切换Tabs -->
          <div class="module-switch-tabs">
            <div 
              class="module-tab-item" 
              :class="{ 'module-tab-item--active': activeModule === 'detection' }"
              @click="activeModule = 'detection'">
              <el-icon><Search /></el-icon>
              <span>缺失值检测</span>
            </div>
            <div 
              class="module-tab-item" 
              :class="{ 'module-tab-item--active': activeModule === 'imputation' }"
              @click="activeModule = 'imputation'">
              <el-icon><Edit /></el-icon>
              <span>执行插补</span>
            </div>
          </div>

          <!-- 缺失值检测模块 -->
          <div v-if="activeModule === 'detection'" class="module-container">
            <!-- 缺失值检测区域 -->
            <div class="missing-detection-section" v-if="currentVersion">
              <div class="missing-markers-display">
                <div class="markers-header">
                  <span class="markers-label">缺失值标记：</span>
                  <div class="markers-list">
                    <el-tag
                      v-for="marker in datasetStore.currentDatasetMissingMarkers"
                      :key="marker"
                      size="small"
                      type="info"
                      effect="light"
                      class="marker-tag">
                      "{{ marker }}"
                    </el-tag>
                    <el-tag v-if="datasetStore.currentDatasetMissingMarkers.length === 0" size="small" type="warning" effect="light">
                      无配置
                    </el-tag>
                  </div>
                </div>
              <div class="detection-controls">
                <el-button
                  type="primary"
                  :loading="gapFillingStore.loading"
                  @click="detectMissingValues"
                  class="detect-btn">
                  <el-icon><Refresh /></el-icon>
                  重新检测
                </el-button>
              </div>
            </div>
            </div>
            
            <!-- 如果没有检测结果，显示加载状态或引导页 -->
            <div v-if="!gapFillingStore.hasStats" class="detection-empty-state">
              <div class="empty-illustration">
                <el-icon class="illustration-icon" :class="{ 'is-loading': gapFillingStore.loading }"><Search /></el-icon>
                <div class="circles">
                  <span class="circle c1"></span>
                  <span class="circle c2"></span>
                  <span class="circle c3"></span>
                </div>
              </div>
              <h3 class="empty-hint-title">{{ gapFillingStore.loading ? '正在检测缺失值...' : '准备好分析数据了吗？' }}</h3>
              <p class="empty-hint-desc">
                <template v-if="gapFillingStore.loading">
                  系统正在后台自动扫描 <b>{{ datasetInfo?.originalFile?.rows?.toLocaleString() || '-' }}</b> 行数据，<br>
                  请稍候...
                </template>
                <template v-else>
                  系统将自动检测缺失值。如需修改 <b>"缺失值标记"</b> 后重新检测，<br>
                  请点击上方 <b>"重新检测"</b> 按钮。
                </template>
              </p>
            </div>
          
          <!-- 仪表盘区域 (仅在有数据时显示) -->
          <div v-if="gapFillingStore.hasStats" class="dashboard-container">
            
            <!-- 顶层指标行 -->
            <div class="dashboard-row summary-row">


              <!-- 核心指标卡片组 -->
              <div class="metric-cards-group">
                <div class="metric-card glass-effect">
                  <div class="metric-icon bg-blue-100 text-blue-600"><el-icon><List /></el-icon></div>
                  <div class="metric-info">
                    <div class="metric-value">{{ gapFillingStore.missingStats?.totalRows.toLocaleString() }}</div>
                    <div class="metric-label">总行数</div>
                  </div>
                </div>
                <div class="metric-card glass-effect">
                  <div class="metric-icon bg-purple-100 text-purple-600"><el-icon><InfoFilled /></el-icon></div>
                  <div class="metric-info">
                    <div class="metric-value">{{ gapFillingStore.missingStats?.totalColumns }}</div>
                    <div class="metric-label">总列数</div>
                  </div>
                </div>
                <div class="metric-card glass-effect">
                  <div class="metric-icon bg-red-100 text-red-600"><el-icon><VideoPlay /></el-icon></div>
                  <div class="metric-info">
                    <div class="metric-value">{{ gapFillingStore.totalMissingCount.toLocaleString() }}</div>
                    <div class="metric-label">缺失单元格</div>
                  </div>
                </div>
              </div>
            </div>


            <!-- 综合分析视图 -->
            <div v-if="gapFillingStore.hasStats" class="analysis-section-container" style="margin-top: 20px;">
              <MissingAnalysisView />
            </div>

            <!-- 详细数据表格 -->
            <div class="detailed-table-card glass-effect">
              <div class="card-header-row">
                 <h4 class="table-title">详细缺失报告</h4>
                 <div class="table-actions">
                   <el-button size="small" type="primary" plain @click="activeModule = 'imputation'">
                     前往插补 <el-icon class="el-icon--right"><Edit /></el-icon>
                   </el-button>
                 </div>
              </div>

              <div class="table-container">
                <table class="column-stats-table">
                  <thead>
                    <tr>
                      <th class="col-name">列名</th>
                      <th class="col-missing">缺失数</th>
                      <th class="col-rate">缺失率</th>
                      <th class="col-total">总行数</th>
                      <th class="col-preview">数据预览</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="col in gapFillingStore.missingStats?.columnStats || []"
                      :key="col.columnName"
                      :class="{ 'has-missing': col.missingCount > 0 }">
                      <td class="col-name">
                        <span class="column-name-text">{{ col.columnName }}</span>
                      </td>
                      <td class="col-missing">
                        <span :class="['missing-count', { 'has-missing': col.missingCount > 0 }]">
                          {{ col.missingCount.toLocaleString() }}
                        </span>
                      </td>
                      <td class="col-rate">
                        <div class="rate-bar-container">
                          <div class="rate-text">{{ col.missingRate.toFixed(1) }}%</div>
                          <div class="rate-bar-bg">
                            <div
                              class="rate-bar-fill"
                              :style="{ width: Math.min(col.missingRate, 100) + '%' }">
                            </div>
                          </div>
                        </div>
                      </td>
                      <td class="col-total">
                        <span class="total-count">{{ col.totalCount.toLocaleString() }}</span>
                      </td>
                      <td class="col-preview">
                        <div v-if="col.sampleRows && col.sampleRows.length > 0" class="sample-preview">
                          <div
                            v-for="(sample, index) in col.sampleRows.slice(0, 2)"
                            :key="index"
                            class="sample-item">
                            <span class="sample-row">行{{ sample.rowIndex + 1 }}:</span>
                            <span class="sample-value" :class="{ 'missing-value': sample.isMissing }">
                              {{ sample.value === null ? 'null' : `"${sample.value}"` }}
                            </span>
                          </div>
                          <div v-if="col.sampleRows.length > 2" class="more-samples">
                            ...等 {{ col.sampleRows.length }} 个样本
                          </div>
                        </div>
                        <div v-else class="no-samples">无样本数据</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </div>


          <!-- Imputation Module -->
          <div v-if="activeModule === 'imputation'" class="config-layout">
            <!-- 方法选择区 -->
            <div class="method-selection-section">
              <div class="section-header">
                <h3 class="section-title">
                  <el-icon><Setting /></el-icon>
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
                      'method-card--recommended': isRecommended(method.methodId)
                    }
                  ]"
                  @click="selectMethod(method)">

                  <!-- 推荐标签 -->
                  <div v-if="isRecommended(method.methodId)" class="recommended-badge">
                    <el-icon><Star /></el-icon>
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
                        {{ method.accuracy === 'high' ? '高' : method.accuracy === 'medium' ? '中' : '低' }}
                      </span>
                    </span>
                    <div v-if="selectedMethodId === method.methodId" class="selected-indicator">
                      <el-icon><Check /></el-icon>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 参数配置区 -->
            <div class="params-config-section">
              <div class="section-header">
                <h3 class="section-title">
                  <el-icon><Setting /></el-icon>
                  参数配置
                </h3>
              </div>

              <!-- 列选择 -->
              <div class="column-selection">
                <div class="selection-header">
                  <h4 class="selection-title">目标列选择</h4>
                  <div class="selection-mode">
                    <label class="radio-item">
                      <input type="radio" v-model="columnSelectionMode" value="all">
                      <span>全部列</span>
                    </label>
                    <label class="radio-item">
                      <input type="radio" v-model="columnSelectionMode" value="manual">
                      <span>手动选择</span>
                    </label>
                  </div>
                </div>

                <div v-if="columnSelectionMode === 'manual'" class="column-list">
                  <div 
                    v-for="column in availableColumns" 
                    :key="column.name"
                    class="column-item">
                    <label class="checkbox-item">
                      <input 
                        type="checkbox" 
                        :value="column.name"
                        v-model="selectedColumns">
                      <div class="column-info">
                        <span class="column-name">{{ column.name }}</span>
                        <span class="column-missing">{{ column.missingCount }} 缺失</span>
                        <span :class="['column-rate', getMissingRateClass(column.missingRate)]">
                          {{ column.missingRate.toFixed(1) }}%
                        </span>
                      </div>
                    </label>
                  </div>
                  <div v-if="availableColumns.length === 0" class="no-columns">
                    <span>没有可用的列</span>
                  </div>
                </div>
              </div>

              <!-- 方法参数 -->
              <div v-if="selectedMethod" class="method-params">
                <h4 class="params-title">{{ selectedMethod.methodName }} 参数</h4>

                <div class="params-form">
                  <!-- 基础参数 -->
                  <div
                    v-for="param in basicParams"
                    :key="param.paramKey"
                    class="param-item">
                    <label class="param-label">
                      {{ param.paramName }}
                      <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                        <el-icon class="param-tooltip-icon"><InfoFilled /></el-icon>
                      </el-tooltip>
                    </label>

                    <!-- 数字输入 -->
                    <el-input-number
                      v-if="param.paramType === 'number'"
                      v-model="paramValues[param.paramKey]"
                      :min="param.minValue"
                      :max="param.maxValue"
                      :step="param.stepValue || 1"
                      :precision="0"
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
                  </div>

                  <!-- 无参数提示 -->
                  <div v-if="currentMethodParams.length === 0" class="no-params">
                    <p>此方法无需额外参数配置</p>
                  </div>

                  <!-- 高级参数折叠 -->
                  <el-collapse v-if="hasAdvancedParams" class="advanced-params-collapse">
                    <el-collapse-item title="高级参数" name="advanced">
                      <div
                        v-for="param in advancedParams"
                        :key="param.paramKey"
                        class="param-item">
                        <label class="param-label">
                          {{ param.paramName }}
                          <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                            <el-icon class="param-tooltip-icon"><InfoFilled /></el-icon>
                          </el-tooltip>
                        </label>

                        <!-- 数字输入 -->
                        <el-input-number
                          v-if="param.paramType === 'number'"
                          v-model="paramValues[param.paramKey]"
                          :min="param.minValue"
                          :max="param.maxValue"
                          :step="param.stepValue || 1"
                          :precision="0"
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
                  <el-icon v-if="!isExecuting"><VideoPlay /></el-icon>
                  <div v-else class="loading-spinner"></div>
                  <span>{{ isExecuting ? '执行中...' : '开始插补' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 进度展示区 -->
          <div v-if="(isExecuting || progressInfo) && activeModule === 'imputation'" class="progress-section">
            <div class="progress-header">
              <h4 class="progress-title">
                <span v-if="isExecuting" class="status-dot status-dot--running"></span>
                <span v-else class="status-dot status-dot--completed"></span>
                执行进度
              </h4>
              <button v-if="isExecuting" class="cancel-btn" @click="cancelExecution">
                <el-icon><Close /></el-icon>
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
                <p class="progress-detail" v-if="progressInfo?.stage">当前阶段: {{ getStageLabel(progressInfo.stage) }}</p>
                
                <!-- 完成后的操作按钮 -->
                <div v-if="progressInfo?.stage === 'completed'" class="completion-actions">
                  <el-button type="success" @click="viewCurrentResult">
                    查看插补结果
                    <el-icon class="el-icon--right"><ArrowRight /></el-icon>
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

        <!-- 结果视图 -->
        <div v-else-if="currentView === 'result'" class="result-view">
          <div class="result-header">
            <h3 class="result-title">插补结果对比</h3>
            <button class="back-btn" @click="switchToConfig">
              <el-icon><Refresh /></el-icon>
              <span>返回配置</span>
            </button>
          </div>

          <!-- 保存操作区 -->
           <div class="save-actions" v-if="currentResultId">
             <div class="save-actions-header">
               <el-icon><Check /></el-icon>
               <span>确认并保存结果</span>
             </div>
             <div class="save-buttons">
               <button 
                 class="save-btn save-btn--version" 
                 :class="{ 'save-btn--disabled': isSavedAsVersion }"
                 @click="saveAsNewVersion" 
                 :disabled="isSavedAsVersion">
                 <el-icon v-if="!isSavedAsVersion"><Plus /></el-icon>
                 <el-icon v-else><Check /></el-icon>
                 <span>{{ isSavedAsVersion ? '已保存为新版本' : '保存为新版本' }}</span>
                 <span class="btn-desc" v-if="!isSavedAsVersion">保存到当前数据集版本历史</span>
               </button>
               
               <button class="save-btn save-btn--file" @click="saveAsFile">
                 <el-icon><List /></el-icon>
                 <span>保存为文件</span>
                 <span class="btn-desc">导出为 CSV/Excel 文件</span>
               </button>
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
                <el-icon><TrendCharts /></el-icon>
                <span>时序图</span>
              </button>
              <button 
                type="button"
                :class="['viz-mode-btn', { 'viz-mode-btn--active': vizMode === 'table' }]"
                @click.stop="vizMode = 'table'">
                <el-icon><List /></el-icon>
                <span>表格</span>
              </button>
            </div>
          </div>

          <!-- 图表区域 -->
          <div v-show="vizMode === 'timeseries'" class="chart-container">
            <div ref="timeSeriesChart" class="chart-area"></div>
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
                size="small"
              />
            </div>
          </div>

        </div>
      </div>
    </div>
    
    <!-- Version Manager Drawer -->
    <el-drawer
      v-model="showVersionDrawer"
      title="数据版本管理"
      size="450px"
      destroy-on-close
      append-to-body
    >
      <VersionManager 
        v-if="datasetInfo"
        :dataset-id="datasetInfo.id"
        @switch-version="handleVersionSwitchFromManager"
        @close="showVersionDrawer = false"
      />
    </el-drawer>
  </div>
</template>

<style scoped>
/* ==================== 模块切换Tab ==================== */
.module-switch-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
}

.module-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  transition: all 0.3s ease;
}

.module-tab-item:hover {
  background: rgba(255, 255, 255, 0.5);
  color: #374151;
}

.module-tab-item--active {
  background: white;
  color: #10b981;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.module-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ==================== 主容器 ==================== */
.gap-filling-panel {
  background: linear-gradient(135deg, rgba(250, 250, 249, 0.8) 0%, rgba(236, 253, 245, 0.3) 100%);
  border-radius: 16px;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
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
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 8px 0;
}

.empty-description {
  color: #6b7280;
  margin: 0;
}

/* ==================== 主布局 ==================== */
.panel-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ==================== 侧边栏 ==================== */
.panel-sidebar {
  width: 260px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.95) 0%, rgba(249, 250, 251, 0.9) 50%, rgba(236, 253, 245, 0.9) 100%);
  border-right: 1px solid rgba(229, 231, 235, 0.6);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
}

.new-imputation-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}

.new-imputation-btn:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
  transform: translateY(-1px);
}


/* ==================== 检测仪表盘样式 ==================== */
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-row {
  display: flex;
  gap: 16px;
}

.summary-row {
  height: 140px;
}



.metric-cards-group {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.metric-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  transition: transform 0.2s;
}

.metric-card:hover {
  transform: translateY(-2px);
}

.metric-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.metric-info {
  display: flex;
  flex-direction: column;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
}

.metric-label {
  font-size: 13px;
  color: #6b7280;
}

.charts-row {
  height: 300px;
}

.chart-card {
  flex: 1;
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  overflow: hidden;
}

.chart-canvas {
  width: 100%;
  height: 100%;
}

.detailed-table-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
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
  background: rgba(255, 255, 255, 0.4);
  border-radius: 16px;
  border: 2px dashed rgba(229, 231, 235, 0.6);
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
  font-size: 48px;
  color: #10b981;
  z-index: 2;
  background: white;
  padding: 16px;
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.2);
  transition: transform 0.3s ease;
}

.illustration-icon.is-loading {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.circles .circle {
  position: absolute;
  border-radius: 50%;
  border: 1px solid #10b981;
  opacity: 0;
  animation: ripple 2s infinite;
}

.circles .c1 { width: 60px; height: 60px; animation-delay: 0s; }
.circles .c2 { width: 80px; height: 80px; animation-delay: 0.5s; }
.circles .c3 { width: 100px; height: 100px; animation-delay: 1s; }

@keyframes ripple {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1.5); opacity: 0; }
}

.empty-hint-title {
  font-size: 18px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.empty-hint-desc {
  text-align: center;
  color: #6b7280;
  line-height: 1.6;
}


.sidebar-subtitle {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: #9ca3af;
  font-size: 13px;
}

.history-item {
  padding: 12px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.history-item--active {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.9) 0%, rgba(220, 252, 231, 0.8) 100%);
  border-color: #10b981;
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.history-time {
  font-size: 11px;
  color: #9ca3af;
}

.history-delete-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.history-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.history-item-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.history-method {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.history-item-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #6b7280;
}

/* ==================== 主内容区 ==================== */
.panel-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  min-width: 0;
}

/* ==================== 配置视图 ==================== */
.config-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.version-info-banner {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.version-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
}

.version-icon {
  color: #10b981;
  font-size: 16px;
}

.version-label {
  color: #6b7280;
}

.version-value {
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-selector :deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 0 1px rgba(209, 213, 219, 1) inset;
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
  font-size: 11px;
  color: #9ca3af;
  font-family: monospace;
}

.version-option-time {
  font-size: 11px;
  color: #9ca3af;
}

.version-id {
  font-family: monospace;
  color: #9ca3af;
  font-size: 12px;
}

/* ==================== 缺失值检测区域 ==================== */
.missing-detection-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.missing-markers-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.markers-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.markers-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}

.markers-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.marker-tag {
  font-family: monospace;
  font-size: 11px;
  padding: 2px 6px;
}

.detection-controls {
  flex-shrink: 0;
}

.detect-btn {
  height: 32px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
  transition: all 0.3s ease;
}

.detect-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
}

/* ==================== 缺失统计展示区域 ==================== */
.missing-stats-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 概览卡片 */
.stats-overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.overview-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.overview-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.overview-card.highlight {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.9) 0%, rgba(220, 252, 231, 0.8) 100%);
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.1);
}

.card-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.overview-card.highlight .card-icon {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
  margin-bottom: 4px;
}

.overview-card.highlight .card-value {
  color: #047857;
}

.card-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

/* ==================== 时序分析区域 ==================== */
.temporal-analysis-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.temporal-charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.full-width-chart {
  grid-column: 1 / -1;
}

.chart-wrapper {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(229, 231, 235, 0.6);
  height: 300px; /* Fixed height for charts */
}

.chart-div {
  width: 100%;
  height: 100%;
}

/* 列级统计表格 */
.column-stats-table-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.table-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.table-info {
  font-size: 12px;
  color: #6b7280;
}

.table-container {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid rgba(229, 231, 235, 0.6);
}

.column-stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.column-stats-table thead th {
  background: rgba(249, 250, 251, 0.9);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid rgba(229, 231, 235, 0.8);
  white-space: nowrap;
}

.column-stats-table thead th.col-missing,
.column-stats-table thead th.col-rate,
.column-stats-table thead th.col-total {
  text-align: center;
}

.column-stats-table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
  background: rgba(255, 255, 255, 0.6);
}

.column-stats-table tbody tr:hover td {
  background: rgba(240, 253, 244, 0.5);
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
  color: #1f2937;
}

.missing-count {
  font-family: monospace;
  font-weight: 600;
  color: #6b7280;
}

.missing-count.has-missing {
  color: #ef4444;
}

.total-count {
  font-family: monospace;
  color: #6b7280;
}

/* 缺失率进度条 */
.rate-bar-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.rate-text {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  min-width: 45px;
  text-align: right;
}

.rate-bar-bg {
  flex: 1;
  height: 6px;
  background: rgba(229, 231, 235, 0.6);
  border-radius: 3px;
  overflow: hidden;
}

.rate-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.column-stats-table tbody tr.has-missing .rate-bar-fill {
  background: linear-gradient(90deg, #f87171 0%, #ef4444 100%);
}

/* 数据预览 */
.sample-preview {
  font-size: 11px;
  line-height: 1.4;
}

.sample-item {
  display: flex;
  gap: 6px;
  margin-bottom: 2px;
}

.sample-row {
  color: #9ca3af;
  font-weight: 500;
  min-width: 35px;
}

.sample-value {
  font-family: monospace;
  color: #6b7280;
  word-break: break-all;
}

.sample-value.missing-value {
  color: #ef4444;
  font-style: italic;
}

.more-samples {
  color: #9ca3af;
  font-style: italic;
  margin-top: 2px;
}

.no-samples {
  color: #9ca3af;
  font-style: italic;
  font-size: 11px;
}

.config-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 20px;
}

/* ==================== 方法选择区 ==================== */
.method-selection-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.section-header {
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #064e3b;
  margin: 0;
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
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-tab:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #374151;
}

.category-tab--active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.category-icon {
  font-size: 14px;
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.method-card {
  position: relative;
  padding: 14px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.method-card:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.method-card--selected {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.95) 0%, rgba(220, 252, 231, 0.9) 100%);
  border-color: #10b981;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.2);
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
  font-size: 10px;
  font-weight: 600;
  color: #f59e0b;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.2);
}

.method-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.method-card-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.method-card-tags {
  display: flex;
  gap: 4px;
}

.tag {
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 4px;
}

.tag--python {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.tag--time-fast {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.tag--time-medium {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.tag--time-slow {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.method-card-description {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
  margin: 0 0 10px 0;
}

.method-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.accuracy-indicator {
  font-size: 11px;
  color: #9ca3af;
}

.accuracy--high {
  color: #10b981;
  font-weight: 600;
}

.accuracy--medium {
  color: #f59e0b;
  font-weight: 600;
}

.accuracy--low {
  color: #ef4444;
  font-weight: 600;
}

.selected-indicator {
  color: #10b981;
}

/* ==================== 参数配置区 ==================== */
.params-config-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.column-selection {
  background: rgba(249, 250, 251, 0.8);
  border-radius: 8px;
  padding: 14px;
}

.selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.selection-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.selection-mode {
  display: flex;
  gap: 12px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
}

.radio-item input {
  accent-color: #10b981;
}

.column-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.column-item {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 6px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.checkbox-item input {
  accent-color: #10b981;
}

.column-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.column-name {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.column-missing {
  font-size: 11px;
  color: #9ca3af;
}

.column-rate {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.no-columns {
  padding: 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
}

.method-params {
  background: rgba(249, 250, 251, 0.8);
  border-radius: 8px;
  padding: 14px;
}

.params-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px 0;
}

.params-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.param-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 12px;
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.param-input:focus {
  outline: none;
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.no-params {
  font-size: 12px;
  color: #9ca3af;
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
  font-size: 15px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}

.execute-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
  transform: translateY(-1px);
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
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==================== 进度区 ==================== */
.progress-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.progress-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.cancel-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 12px;
  color: #ef4444;
  background: rgba(254, 242, 242, 0.8);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: rgba(254, 226, 226, 1);
  border-color: #ef4444;
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
  background: rgba(249, 250, 251, 0.8);
  border-radius: 8px;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.stage-item--active {
  opacity: 1;
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.9) 0%, rgba(220, 252, 231, 0.8) 100%);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
}

.stage-item--completed {
  opacity: 1;
  background: rgba(220, 252, 231, 0.6);
}

.stage-icon {
  font-size: 20px;
}

.stage-name {
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 10px;
  background: rgba(229, 231, 235, 0.6);
  border-radius: 5px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  border-radius: 5px;
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
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 100%
  );
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
  border-radius: 50%;
  margin-right: 8px;
}

.status-dot--running {
  background-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  animation: pulse 2s infinite;
}

.status-dot--completed {
  background-color: #10b981;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
}

.progress-detail {
  font-size: 11px;
  color: #9ca3af;
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
  color: #10b981;
}

.save-btn--disabled span:first-of-type {
  color: #10b981;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: #10b981;
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
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}

.execution-logs {
  background: rgba(249, 250, 251, 0.8);
  border-radius: 8px;
  overflow: hidden;
}

.logs-header {
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  background: rgba(243, 244, 246, 0.8);
  border-bottom: 1px solid rgba(229, 231, 235, 0.6);
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
  font-size: 11px;
  font-family: monospace;
}

.log-time {
  color: #9ca3af;
}

.log-level {
  font-weight: 600;
  text-transform: uppercase;
}

.log-level--info {
  color: #3b82f6;
}

.log-level--warning {
  color: #f59e0b;
}

.log-level--error {
  color: #ef4444;
}

.log-message {
  color: #374151;
}

/* ==================== 结果视图 ==================== */
.result-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-title {
  font-size: 18px;
  font-weight: 600;
  color: #064e3b;
  margin: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 1);
  border-color: #10b981;
  color: #10b981;
}

.viz-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  border: 1px solid rgba(229, 231, 235, 0.4);
}

.viz-column-select {
  display: flex;
  align-items: center;
  gap: 10px;
}

.viz-column-select label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.viz-select {
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 6px;
  background: white;
  min-width: 200px;
}

.viz-select:focus {
  outline: none;
  border-color: #10b981;
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
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.viz-mode-btn:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(16, 185, 129, 0.3);
}

.viz-mode-btn--active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border-color: transparent;
}

.chart-container {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 16px;
  min-height: 350px;
}

.chart-area {
  width: 100%;
  height: 320px;
}

.table-container {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  overflow: hidden;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.comparison-table th,
.comparison-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(229, 231, 235, 0.6);
}

.comparison-table th {
  background: rgba(249, 250, 251, 0.9);
  font-weight: 600;
  color: #374151;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.cell-index {
  color: #9ca3af;
  font-weight: 500;
  text-align: center;
  width: 60px;
}

.cell-time {
  font-family: monospace;
  color: #6b7280;
}

.value-missing {
  color: #ef4444;
  font-style: italic;
}

.value-normal {
  color: #22c55e;
  font-weight: 500;
  font-family: monospace;
}

.value-imputed {
  color: #f59e0b;
  font-weight: 600;
  font-family: monospace;
}

.confidence-bar {
  width: 60px;
  height: 6px;
  background: rgba(229, 231, 235, 0.6);
  border-radius: 3px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  border-radius: 3px;
}

.status-tag {
  display: inline-block;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 10px;
}

.status-tag--imputed {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
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
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.legend-color--original {
  background: #22c55e;
}

.legend-color--imputed {
  background: #f59e0b;
}

.legend-color--missing {
  background: #ef4444;
}

.save-actions {
  background: white;
  border-radius: 10px;
  border: 1px solid #10b981;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);
}

.save-actions-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #059669;
  margin-bottom: 12px;
}

.save-buttons {
  display: flex;
  gap: 16px;
}

.save-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(229, 231, 235, 0.8);
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.save-btn:hover {
  border-color: #10b981;
  background: rgba(236, 253, 245, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.save-btn .el-icon {
  font-size: 24px;
  color: #10b981;
  margin-bottom: 4px;
}

.save-btn span:first-of-type {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.save-btn .btn-desc {
  font-size: 11px;
  color: #9ca3af;
}



.legend-text {
  font-size: 12px;
  color: #6b7280;
}

/* ==================== 缺失率样式 ==================== */
.missing-rate--none {
  background: rgba(209, 250, 229, 1);
  color: #047857;
}

.missing-rate--low {
  background: rgba(254, 243, 199, 1);
  color: #92400e;
}

.missing-rate--medium {
  background: rgba(254, 215, 170, 1);
  color: #9a3412;
}

.missing-rate--high {
  background: rgba(254, 202, 202, 1);
  color: #991b1b;
}

/* ==================== 滚动条样式 ==================== */
.history-list::-webkit-scrollbar,
.column-list::-webkit-scrollbar,
.logs-content::-webkit-scrollbar {
  width: 4px;
}

.history-list::-webkit-scrollbar-track,
.column-list::-webkit-scrollbar-track,
.logs-content::-webkit-scrollbar-track {
  background: rgba(229, 231, 235, 0.3);
  border-radius: 2px;
}

.history-list::-webkit-scrollbar-thumb,
.column-list::-webkit-scrollbar-thumb,
.logs-content::-webkit-scrollbar-thumb {
  background: rgba(16, 185, 129, 0.3);
  border-radius: 2px;
}

.history-list::-webkit-scrollbar-thumb:hover,
.column-list::-webkit-scrollbar-thumb:hover,
.logs-content::-webkit-scrollbar-thumb:hover {
  background: rgba(16, 185, 129, 0.5);
}

.table-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  padding: 0 4px;
}

/* ==================== 响应式设计 ==================== */
@media (max-width: 1200px) {
  .config-layout {
    grid-template-columns: 1fr;
  }
  
  .panel-sidebar {
    width: 220px;
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
}
</style>
