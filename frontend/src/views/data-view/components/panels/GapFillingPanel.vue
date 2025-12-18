<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { ElMessage, ElNotification } from "element-plus";
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
  Close
} from "@element-plus/icons-vue";
import type { DatasetInfo } from "@shared/types/projectInterface";
import * as echarts from 'echarts';

// ==================== 类型定义 ====================
type ImputationMethodId = 
  | 'MEAN' | 'MEDIAN' | 'MODE' | 'FORWARD_FILL' | 'BACKWARD_FILL'
  | 'LINEAR' | 'SPLINE' | 'POLYNOMIAL' | 'SEASONAL'
  | 'ARIMA' | 'SARIMA' | 'ETS'
  | 'KNN' | 'RANDOM_FOREST' | 'GRADIENT_BOOSTING' | 'MICE' | 'MISSFOREST'
  | 'LSTM' | 'GRU' | 'TRANSFORMER' | 'VAE' | 'GAIN';

type ImputationCategory = 'basic' | 'statistical' | 'timeseries' | 'ml' | 'dl';
type ImputationResultStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'APPLIED' | 'REVERTED';

interface ImputationMethod {
  id: ImputationMethodId;
  name: string;
  category: ImputationCategory;
  description: string;
  requiresPython: boolean;
  isAvailable: boolean;
  estimatedTime?: 'fast' | 'medium' | 'slow';
  accuracy?: 'low' | 'medium' | 'high';
}

interface ImputationResult {
  id: number;
  datasetId: number;
  versionId: number;
  methodId: ImputationMethodId;
  imputationParams: string;
  targetColumns: string | null;
  totalRows: number;
  imputedCount: number;
  imputationRate: number;
  status: ImputationResultStatus;
  progress: number;
  progressMessage?: string;
  resultFilePath?: string;
  executedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ImputationProgressEvent {
  resultId: number;
  progress: number;
  stage: 'preparing' | 'training' | 'imputing' | 'validating' | 'saving';
  message: string;
  currentColumn?: string;
  estimatedRemaining?: number;
}

interface ColumnInfo {
  name: string;
  missingCount: number;
  missingRate: number;
  type: string;
}

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
type ViewMode = 'config' | 'result';
const currentView = ref<ViewMode>('config');

// ==================== 侧边栏状态 ====================
const imputationResults = ref<ImputationResult[]>([]);
const currentResultId = ref<number | null>(null);

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

// 插补方法定义
const imputationMethods: ImputationMethod[] = [
  // 基础方法
  { id: 'MEAN', name: '均值插补', category: 'basic', description: '使用列均值填充缺失值', requiresPython: false, isAvailable: true, estimatedTime: 'fast', accuracy: 'low' },
  { id: 'MEDIAN', name: '中位数插补', category: 'basic', description: '使用列中位数填充缺失值', requiresPython: false, isAvailable: true, estimatedTime: 'fast', accuracy: 'low' },
  { id: 'MODE', name: '众数插补', category: 'basic', description: '使用列众数填充缺失值', requiresPython: false, isAvailable: true, estimatedTime: 'fast', accuracy: 'low' },
  { id: 'FORWARD_FILL', name: '前向填充', category: 'basic', description: '使用前一个有效值填充', requiresPython: false, isAvailable: true, estimatedTime: 'fast', accuracy: 'low' },
  { id: 'BACKWARD_FILL', name: '后向填充', category: 'basic', description: '使用后一个有效值填充', requiresPython: false, isAvailable: true, estimatedTime: 'fast', accuracy: 'low' },
  // 统计方法
  { id: 'LINEAR', name: '线性插值', category: 'statistical', description: '基于时间序列的线性插值方法', requiresPython: false, isAvailable: true, estimatedTime: 'fast', accuracy: 'medium' },
  { id: 'SPLINE', name: '样条插值', category: 'statistical', description: '三次样条插值，适合平滑数据', requiresPython: true, isAvailable: true, estimatedTime: 'fast', accuracy: 'medium' },
  { id: 'POLYNOMIAL', name: '多项式插值', category: 'statistical', description: '多项式拟合插值', requiresPython: true, isAvailable: true, estimatedTime: 'fast', accuracy: 'medium' },
  // 时间序列模型
  { id: 'ARIMA', name: 'ARIMA', category: 'timeseries', description: '自回归积分滑动平均模型', requiresPython: true, isAvailable: true, estimatedTime: 'medium', accuracy: 'high' },
  { id: 'SARIMA', name: 'SARIMA', category: 'timeseries', description: '季节性ARIMA模型', requiresPython: true, isAvailable: true, estimatedTime: 'medium', accuracy: 'high' },
  { id: 'ETS', name: '指数平滑', category: 'timeseries', description: '指数平滑状态空间模型', requiresPython: true, isAvailable: true, estimatedTime: 'medium', accuracy: 'medium' },
  // 机器学习
  { id: 'KNN', name: 'K近邻', category: 'ml', description: '基于相似样本的智能插补', requiresPython: true, isAvailable: true, estimatedTime: 'medium', accuracy: 'medium' },
  { id: 'RANDOM_FOREST', name: '随机森林', category: 'ml', description: '基于随机森林的插补', requiresPython: true, isAvailable: true, estimatedTime: 'slow', accuracy: 'high' },
  { id: 'MICE', name: 'MICE', category: 'ml', description: '多重插补链式方程', requiresPython: true, isAvailable: true, estimatedTime: 'slow', accuracy: 'high' },
  { id: 'MISSFOREST', name: 'MissForest', category: 'ml', description: '基于随机森林的迭代插补', requiresPython: true, isAvailable: true, estimatedTime: 'slow', accuracy: 'high' },
  // 深度学习
  { id: 'LSTM', name: 'LSTM', category: 'dl', description: '长短期记忆网络', requiresPython: true, isAvailable: false, estimatedTime: 'slow', accuracy: 'high' },
  { id: 'GRU', name: 'GRU', category: 'dl', description: '门控循环单元', requiresPython: true, isAvailable: false, estimatedTime: 'slow', accuracy: 'high' },
  { id: 'TRANSFORMER', name: 'Transformer', category: 'dl', description: '基于注意力机制的模型', requiresPython: true, isAvailable: false, estimatedTime: 'slow', accuracy: 'high' },
];

const recommendedMethodIds = ref<ImputationMethodId[]>(['LINEAR', 'ARIMA', 'KNN']);

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
const vizMode = ref<'timeseries' | 'distribution' | 'scatter' | 'table'>('timeseries');
const timeSeriesChart = ref<HTMLDivElement | null>(null);
const timeSeriesInstance = ref<echarts.ECharts | null>(null);
const comparisonTableData = ref<any[]>([]);

// ==================== Computed ====================
const filteredMethods = computed(() => {
  return imputationMethods.filter(m => m.category === activeCategory.value);
});

const selectedMethod = computed(() => {
  return imputationMethods.find(m => m.id === selectedMethodId.value) || null;
});

const availableColumns = computed<ColumnInfo[]>(() => {
  if (!props.datasetInfo?.originalFile?.columns) return [];
  return props.datasetInfo.originalFile.columns
    .filter(col => col !== "TIMESTAMP")
    .map(col => ({
      name: col,
      missingCount: getMissingCount(col),
      missingRate: getMissingRate(col),
      type: getColumnType(col),
    }));
});

const columnsWithMissing = computed(() => {
  return availableColumns.value.filter(col => col.missingCount > 0);
});

const canExecute = computed(() => {
  if (!selectedMethodId.value) return false;
  if (!props.datasetInfo) return false;
  if (columnSelectionMode.value === 'manual' && selectedColumns.value.length === 0) return false;
  return true;
});

const currentStage = computed(() => progressInfo.value?.stage || 'preparing');
const progress = computed(() => progressInfo.value?.progress || 0);
const progressMessage = computed(() => progressInfo.value?.message || '');

const stages = [
  { key: 'preparing', label: '准备', icon: '📋' },
  { key: 'training', label: '训练', icon: '🎯' },
  { key: 'imputing', label: '插补', icon: '✏️' },
  { key: 'validating', label: '验证', icon: '✅' },
  { key: 'saving', label: '保存', icon: '💾' },
];

// ==================== Methods ====================
const getMissingCount = (columnName: string): number => {
  if (!props.datasetInfo?.originalFile?.dataQuality?.columnMissingStatus) return 0;
  return props.datasetInfo.originalFile.dataQuality.columnMissingStatus[columnName] || 0;
};

const getMissingRate = (columnName: string): number => {
  const missingCount = getMissingCount(columnName);
  const totalRows = props.datasetInfo?.originalFile?.rows || 1;
  return (missingCount / totalRows) * 100;
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
  return imputationMethods.find(m => m.id === methodId)?.name || methodId;
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

const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};


const isStageCompleted = (stageKey: string): boolean => {
  const stageOrder = ['preparing', 'training', 'imputing', 'validating', 'saving'];
  const currentIndex = stageOrder.indexOf(currentStage.value);
  const targetIndex = stageOrder.indexOf(stageKey);
  return targetIndex < currentIndex;
};

// ==================== 视图切换 ====================
const switchToConfig = () => {
  currentView.value = 'config';
  currentResultId.value = null;
};

const viewResult = (result: ImputationResult) => {
  currentResultId.value = result.id;
  currentView.value = 'result';
  // 加载结果详情
  loadResultComparison(result.id);
};

// ==================== 方法选择 ====================
const selectMethod = (method: ImputationMethod) => {
  if (!method.isAvailable) return;
  selectedMethodId.value = method.id;
  // 初始化默认参数
  initMethodParams(method);
};

const initMethodParams = (method: ImputationMethod) => {
  // 根据方法类型初始化默认参数
  paramValues.value = {};
  if (method.id === 'ARIMA' || method.id === 'SARIMA') {
    paramValues.value = { p: 1, d: 1, q: 1, autoSelect: true };
  } else if (method.id === 'KNN') {
    paramValues.value = { n_neighbors: 5 };
  } else if (method.id === 'SPLINE') {
    paramValues.value = { degree: 3 };
  } else if (method.id === 'POLYNOMIAL') {
    paramValues.value = { degree: 2 };
  }
};

// ==================== 执行插补 ====================
const executeImputation = async () => {
  if (!canExecute.value || !selectedMethodId.value) return;

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
      ? null 
      : selectedColumns.value;

    ElNotification({
      title: "开始插补",
      message: `正在使用 ${getMethodName(selectedMethodId.value)} 方法进行插补...`,
      type: "info",
      duration: 3000,
    });

    // 模拟执行过程
    await simulateExecution();

    ElNotification({
      title: "插补完成",
      message: "缺失值插补处理完成",
      type: "success",
      duration: 5000,
    });

    // 添加到历史记录
    const newResult: ImputationResult = {
      id: Date.now(),
      datasetId: parseInt(props.datasetInfo?.id || '0'),
      versionId: 1,
      methodId: selectedMethodId.value,
      imputationParams: JSON.stringify(paramValues.value),
      targetColumns: targetCols ? JSON.stringify(targetCols) : null,
      totalRows: props.datasetInfo?.originalFile?.rows || 0,
      imputedCount: Math.floor(Math.random() * 100) + 50,
      imputationRate: Math.random() * 10 + 5,
      status: 'COMPLETED',
      progress: 100,
      executedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    imputationResults.value.unshift(newResult);

    emit("refresh");

  } catch (error: any) {
    console.error("插补处理失败:", error);
    ElMessage.error(error.message || "插补处理失败，请重试");
  } finally {
    isExecuting.value = false;
  }
};

const simulateExecution = async () => {
  const stageList: Array<{ stage: ImputationProgressEvent['stage']; message: string; duration: number }> = [
    { stage: 'preparing', message: '准备数据...', duration: 500 },
    { stage: 'training', message: '训练模型...', duration: 1000 },
    { stage: 'imputing', message: '执行插补...', duration: 1500 },
    { stage: 'validating', message: '验证结果...', duration: 500 },
    { stage: 'saving', message: '保存结果...', duration: 500 },
  ];

  let totalProgress = 0;
  for (const s of stageList) {
    progressInfo.value = {
      resultId: 0,
      progress: totalProgress,
      stage: s.stage,
      message: s.message,
    };
    addLog('info', s.message);
    await new Promise(resolve => setTimeout(resolve, s.duration));
    totalProgress += 20;
  }
  progressInfo.value = {
    resultId: 0,
    progress: 100,
    stage: 'saving',
    message: '完成',
  };
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
const deleteResult = async (resultId: number) => {
  imputationResults.value = imputationResults.value.filter(r => r.id !== resultId);
  if (currentResultId.value === resultId) {
    currentResultId.value = null;
    currentView.value = 'config';
  }
  ElMessage.success('已删除');
};

const loadResultComparison = async (_resultId: number) => {
  // 模拟加载对比数据
  await nextTick();
  if (columnsWithMissing.value.length > 0) {
    vizSelectedColumn.value = columnsWithMissing.value[0].name;
    updateComparisonChart();
  }
};

// ==================== 可视化 ====================
const generateTimeSeriesData = () => {
  const data = [];
  const startDate = new Date('2024-01-01');
  
  for (let i = 0; i < 100; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const value = Math.sin(i * 0.1) * 50 + Math.random() * 20 + 100;
    const isMissing = Math.random() < 0.1;
    
    data.push({
      timestamp: date.toISOString().split('T')[0],
      original: isMissing ? null : value,
      imputed: value + (Math.random() - 0.5) * 5,
      confidence: 0.8 + Math.random() * 0.2,
    });
  }
  
  return data;
};

const updateComparisonChart = async () => {
  if (!vizSelectedColumn.value) return;
  
  await nextTick();
  
  const data = generateTimeSeriesData();
  comparisonTableData.value = data.slice(0, 20);
  
  if (timeSeriesChart.value && !timeSeriesInstance.value) {
    timeSeriesInstance.value = echarts.init(timeSeriesChart.value);
  }
  
  if (timeSeriesInstance.value) {
    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          let result = `${params[0].axisValue}<br/>`;
          params.forEach((param: any) => {
            const value = param.value[1];
            result += `${param.seriesName}: ${value !== null ? value.toFixed(2) : '缺失'}<br/>`;
          });
          return result;
        }
      },
      legend: {
        data: ['原始数据', '插补数据', '缺失点'],
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
        axisLabel: { fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 10 }
      },
      series: [
        {
          name: '原始数据',
          type: 'line',
          data: data.map(d => [d.timestamp, d.original]).filter(d => d[1] !== null),
          itemStyle: { color: '#22c55e' },
          lineStyle: { width: 2 },
          symbol: 'circle',
          symbolSize: 4,
        },
        {
          name: '插补数据',
          type: 'line',
          data: data.filter(d => d.original === null).map(d => [d.timestamp, d.imputed]),
          itemStyle: { color: '#3b82f6' },
          lineStyle: { width: 2, type: 'dashed' },
          symbol: 'diamond',
          symbolSize: 8,
        },
        {
          name: '缺失点',
          type: 'scatter',
          data: data.filter(d => d.original === null).map(d => [d.timestamp, d.imputed]),
          itemStyle: { color: '#ef4444' },
          symbolSize: 10,
        }
      ]
    };
    
    timeSeriesInstance.value.setOption(option);
  }
};

// ==================== 生命周期 ====================
watch(
  () => props.datasetInfo,
  () => {
    selectedColumns.value = [];
    currentResultId.value = null;
    currentView.value = 'config';
  }
);

watch(vizSelectedColumn, () => {
  updateComparisonChart();
});

onMounted(() => {
  window.addEventListener('resize', () => {
    timeSeriesInstance.value?.resize();
  });
});

onUnmounted(() => {
  timeSeriesInstance.value?.dispose();
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
          <div class="sidebar-subtitle">插补历史</div>
          <div class="history-list">
            <div v-if="imputationResults.length === 0" class="history-empty">
              <span>暂无历史记录</span>
            </div>
            <div 
              v-for="result in imputationResults" 
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
                <span class="history-method">{{ getMethodName(result.methodId) }}</span>
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
          <div class="config-layout">
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
                  :key="method.id"
                  :class="[
                    'method-card', 
                    { 
                      'method-card--selected': selectedMethodId === method.id,
                      'method-card--unavailable': !method.isAvailable,
                      'method-card--recommended': isRecommended(method.id)
                    }
                  ]"
                  @click="selectMethod(method)">
                  
                  <!-- 推荐标签 -->
                  <div v-if="isRecommended(method.id)" class="recommended-badge">
                    <el-icon><Star /></el-icon>
                    <span>推荐</span>
                  </div>

                  <div class="method-card-header">
                    <span class="method-card-name">{{ method.name }}</span>
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
                    <div v-if="selectedMethodId === method.id" class="selected-indicator">
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
                    v-for="column in columnsWithMissing" 
                    :key="column.name"
                    class="column-item">
                    <label class="checkbox-item">
                      <input 
                        type="checkbox" 
                        :value="column.name"
                        v-model="selectedColumns"
                        :disabled="column.missingCount === 0">
                      <div class="column-info">
                        <span class="column-name">{{ column.name }}</span>
                        <span class="column-missing">{{ column.missingCount }} 缺失</span>
                        <span :class="['column-rate', getMissingRateClass(column.missingRate)]">
                          {{ column.missingRate.toFixed(1) }}%
                        </span>
                      </div>
                    </label>
                  </div>
                  <div v-if="columnsWithMissing.length === 0" class="no-columns">
                    <span>没有包含缺失值的列</span>
                  </div>
                </div>
              </div>

              <!-- 方法参数 -->
              <div v-if="selectedMethod" class="method-params">
                <h4 class="params-title">{{ selectedMethod.name }} 参数</h4>
                
                <!-- ARIMA 参数 -->
                <div v-if="selectedMethodId === 'ARIMA' || selectedMethodId === 'SARIMA'" class="params-form">
                  <div class="param-item">
                    <label class="param-label">
                      <input type="checkbox" v-model="paramValues.autoSelect">
                      <span>自动选择最优参数</span>
                    </label>
                  </div>
                  <div v-if="!paramValues.autoSelect" class="param-row">
                    <div class="param-item">
                      <label class="param-label">AR阶数 (p)</label>
                      <input type="number" v-model.number="paramValues.p" min="0" max="5" class="param-input">
                    </div>
                    <div class="param-item">
                      <label class="param-label">差分次数 (d)</label>
                      <input type="number" v-model.number="paramValues.d" min="0" max="2" class="param-input">
                    </div>
                    <div class="param-item">
                      <label class="param-label">MA阶数 (q)</label>
                      <input type="number" v-model.number="paramValues.q" min="0" max="5" class="param-input">
                    </div>
                  </div>
                </div>

                <!-- KNN 参数 -->
                <div v-else-if="selectedMethodId === 'KNN'" class="params-form">
                  <div class="param-item">
                    <label class="param-label">K近邻数量</label>
                    <input type="number" v-model.number="paramValues.n_neighbors" min="1" max="20" class="param-input">
                  </div>
                </div>

                <!-- 样条/多项式 参数 -->
                <div v-else-if="selectedMethodId === 'SPLINE' || selectedMethodId === 'POLYNOMIAL'" class="params-form">
                  <div class="param-item">
                    <label class="param-label">多项式度数</label>
                    <input type="number" v-model.number="paramValues.degree" min="1" max="5" class="param-input">
                  </div>
                </div>

                <!-- 其他方法无需额外参数 -->
                <div v-else class="params-form">
                  <p class="no-params">此方法无需额外参数配置</p>
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
          <div v-if="isExecuting || progressInfo" class="progress-section">
            <div class="progress-header">
              <h4 class="progress-title">执行进度</h4>
              <button v-if="isExecuting" class="cancel-btn" @click="cancelExecution">
                <el-icon><Close /></el-icon>
                <span>取消</span>
              </button>
            </div>

            <div class="progress-content">
              <!-- 阶段指示器 -->
              <div class="stage-indicators">
                <div 
                  v-for="stage in stages" 
                  :key="stage.key"
                  :class="[
                    'stage-item', 
                    { 
                      'stage-item--active': currentStage === stage.key,
                      'stage-item--completed': isStageCompleted(stage.key)
                    }
                  ]">
                  <div class="stage-icon">{{ stage.icon }}</div>
                  <div class="stage-name">{{ stage.label }}</div>
                </div>
              </div>

              <!-- 进度条 -->
              <div class="progress-bar-container">
                <div class="progress-bar">
                  <div class="progress-bar-fill" :style="{ width: progress + '%' }"></div>
                </div>
                <span class="progress-text">{{ progress }}%</span>
              </div>

              <!-- 进度信息 -->
              <div class="progress-info">
                <p class="progress-message">{{ progressMessage }}</p>
              </div>

              <!-- 执行日志 -->
              <div v-if="executionLogs.length > 0" class="execution-logs">
                <div class="logs-header">执行日志</div>
                <div class="logs-content">
                  <div v-for="log in executionLogs" :key="log.id" class="log-item">
                    <span class="log-time">{{ log.time }}</span>
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

          <!-- 列选择器 -->
          <div class="viz-controls">
            <div class="viz-column-select">
              <label>选择列：</label>
              <select v-model="vizSelectedColumn" class="viz-select">
                <option v-for="col in columnsWithMissing" :key="col.name" :value="col.name">
                  {{ col.name }} ({{ col.missingCount }} 缺失)
                </option>
              </select>
            </div>

            <div class="viz-mode-switch">
              <button 
                :class="['viz-mode-btn', { 'viz-mode-btn--active': vizMode === 'timeseries' }]"
                @click="vizMode = 'timeseries'">
                <el-icon><TrendCharts /></el-icon>
                <span>时序图</span>
              </button>
              <button 
                :class="['viz-mode-btn', { 'viz-mode-btn--active': vizMode === 'table' }]"
                @click="vizMode = 'table'">
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
            <table class="comparison-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>时间</th>
                  <th>原始值</th>
                  <th>插补值</th>
                  <th>置信度</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in comparisonTableData" :key="index">
                  <td class="cell-index">{{ index + 1 }}</td>
                  <td class="cell-time">{{ row.timestamp }}</td>
                  <td class="cell-original">
                    <span v-if="row.original === null" class="value-missing">缺失</span>
                    <span v-else class="value-normal">{{ row.original.toFixed(2) }}</span>
                  </td>
                  <td class="cell-imputed">
                    <span class="value-imputed">{{ row.imputed.toFixed(2) }}</span>
                  </td>
                  <td class="cell-confidence">
                    <div class="confidence-bar">
                      <div class="confidence-fill" :style="{ width: (row.confidence * 100) + '%' }"></div>
                    </div>
                  </td>
                  <td class="cell-status">
                    <span v-if="row.original === null" class="status-tag status-tag--imputed">已插补</span>
                    <span v-else class="status-tag status-tag--original">原始</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 图例 -->
          <div class="chart-legend">
            <div class="legend-item">
              <span class="legend-color legend-color--original"></span>
              <span class="legend-text">原始数据</span>
            </div>
            <div class="legend-item">
              <span class="legend-color legend-color--imputed"></span>
              <span class="legend-text">插补数据</span>
            </div>
            <div class="legend-item">
              <span class="legend-color legend-color--missing"></span>
              <span class="legend-text">缺失点</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
}

.sidebar-subtitle {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
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
  color: #3b82f6;
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
  background: #3b82f6;
}

.legend-color--missing {
  background: #ef4444;
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
