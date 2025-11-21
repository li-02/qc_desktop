<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { ElMessage, ElNotification } from "element-plus";
import { 
  Search, 
  Refresh, 
  Setting, 
  InfoFilled, 
  TrendCharts, 
  DocumentDelete,
  Check,
  Warning,
  CircleClose,
  Download,
  DataLine,
  PieChart,
  ArrowDown,
  Monitor,
  List
} from "@element-plus/icons-vue";
import type { DatasetInfo } from "@shared/types/projectInterface";
import * as echarts from 'echarts';

// Props
interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

// Emits
const emit = defineEmits<{
  startImputation: [options: any];
  refresh: [];
}>();

// Reactive state
const imputationMethod = ref("linear");
const isProcessing = ref<boolean>(false);
const hasImputationResult = ref<boolean>(false);
const timeSeriesChart = ref<HTMLDivElement | null>(null);
const timeSeriesInstance = ref<echarts.ECharts | null>(null);

// 结果查看相关状态
const selectedColumn = ref<string>("");
const searchKeyword = ref<string>("");
const isDropdownOpen = ref<boolean>(false);

// 视图切换状态
const viewMode = ref<'chart' | 'table'>('chart');

// 插补方法选项
const imputationMethods = [
  { value: "linear", label: "线性插值", description: "基于时间序列的线性插值方法", icon: "📈" },
  { value: "spline", label: "样条插值", description: "三次样条插值，适合平滑数据", icon: "〰️" },
  { value: "arima", label: "ARIMA插补", description: "基于时间序列ARIMA模型的智能插补", icon: "🎯" },
  { value: "mean", label: "均值插补", description: "使用列均值填充缺失值", icon: "📊" },
  { value: "median", label: "中位数插补", description: "使用列中位数填充缺失值", icon: "📏" },
  { value: "forward", label: "前向填充", description: "使用前一个有效值填充", icon: "⏩" },
  { value: "backward", label: "后向填充", description: "使用后一个有效值填充", icon: "⏪" },
  { value: "knn", label: "K近邻插补", description: "基于相似样本的智能插补", icon: "🤖" },
];

// 高级选项
const advancedOptions = ref({
  maxGapSize: 10,
  windowSize: 24,
  polynomialDegree: 3,
  knnNeighbors: 5,
  outlierThreshold: 3,
  preservePattern: true,
  // ARIMA特有参数
  arimaP: 1,
  arimaD: 1,
  arimaQ: 1,
  arimaAutoSelect: true,
});

// 预览数据
const previewTableData = ref<any[]>([]);

// Computed properties
const availableColumns = computed(() => {
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

// 过滤后的指标列表（仅搜索过滤）
const filteredColumns = computed(() => {
  if (!searchKeyword.value.trim()) {
    return availableColumns.value;
  }
  
  const keyword = searchKeyword.value.toLowerCase().trim();
  return availableColumns.value.filter(col =>
    col.name.toLowerCase().includes(keyword)
  );
});

const selectedColumnInfo = computed(() => {
  return availableColumns.value.find(col => col.name === selectedColumn.value) || null;
});

const canStartImputation = computed(() => {
  return !props.loading && !isProcessing.value;
});

// Methods
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
  // 基于列名推断类型
  if (columnName.includes("TIMESTAMP") || columnName.includes("TIME")) return "datetime";
  return "numeric";
};

const getMissingRateClass = (rate: number): string => {
  if (rate === 0) return "missing-rate--none";
  if (rate <= 5) return "missing-rate--low";
  if (rate <= 15) return "missing-rate--medium";
  return "missing-rate--high";
};

const selectColumn = (columnName: string) => {
  selectedColumn.value = columnName;
  closeDropdown();
  updateCharts();
  updatePreviewTable();
};

// 搜索相关方法
const clearSearch = () => {
  searchKeyword.value = "";
  isDropdownOpen.value = false;
};

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};

const closeDropdown = () => {
  isDropdownOpen.value = false;
};

const startImputation = async () => {
  if (!canStartImputation.value) return;

  try {
    isProcessing.value = true;

    const options = {
      maxGapSize: advancedOptions.value.maxGapSize,
      windowSize: advancedOptions.value.windowSize,
      polynomialDegree: advancedOptions.value.polynomialDegree,
      knnNeighbors: advancedOptions.value.knnNeighbors,
      outlierThreshold: advancedOptions.value.outlierThreshold,
      preservePattern: advancedOptions.value.preservePattern,
      arimaP: advancedOptions.value.arimaP,
      arimaD: advancedOptions.value.arimaD,
      arimaQ: advancedOptions.value.arimaQ,
      arimaAutoSelect: advancedOptions.value.arimaAutoSelect,
    };

    ElNotification({
      title: "开始处理",
      message: `正在插补...`,
      type: "info",
      duration: 3000,
    });

    // 调用后端API
    const result = await window.electronAPI.invoke('datasets/perform-imputation', {
      projectId: props.datasetInfo?.belongTo,
      datasetId: props.datasetInfo?.id,
      method: imputationMethod.value,
      options: options
    });

    if (result.success) {
      hasImputationResult.value = true;
      ElNotification({
        title: "插补完成",
        message: result.data.message || "整个数据集的缺失值插补处理完成",
        type: "success",
        duration: 5000,
      });

      // 发送刷新事件
      emit("refresh");
    } else {
      throw new Error(result.error || "插补处理失败");
    }

  } catch (error: any) {
    console.error("插补处理失败:", error);
    ElMessage.error(error.message || "插补处理失败，请重试");
  } finally {
    isProcessing.value = false;
  }
};

// 生成模拟时间序列数据
const generateTimeSeriesData = () => {
  const data = [];
  const startDate = new Date('2024-01-01');
  
  for (let i = 0; i < 100; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const value = Math.sin(i * 0.1) * 50 + Math.random() * 20 + 100;
    const isMissing = Math.random() < 0.1; // 10%概率为缺失值
    
    data.push({
      timestamp: date.toISOString().split('T')[0],
      original: isMissing ? null : value,
      imputed: value + (Math.random() - 0.5) * 5, // 模拟插补值
    });
  }
  
  return data;
};

// 更新图表
const updateCharts = async () => {
  if (!selectedColumn.value) return;
  
  await nextTick();
  
  const data = generateTimeSeriesData();
  
  // 更新时间序列图
  if (timeSeriesChart.value && !timeSeriesInstance.value) {
    timeSeriesInstance.value = echarts.init(timeSeriesChart.value);
  }
  
  if (timeSeriesInstance.value) {
    const option = {
      title: {
        text: `${selectedColumn.value} 时间序列`,
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600 }
      },
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
        data: ['原始数据', '缺失值', '插补数据'],
        bottom: 10
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
          lineStyle: { width: 2 }
        },
        {
          name: '缺失值',
          type: 'scatter',
          data: data.map(d => [d.timestamp, d.original === null ? d.imputed : null]).filter(d => d[1] !== null),
          itemStyle: { color: '#ef4444' },
          symbolSize: 8
        },
        {
          name: '插补数据',
          type: 'line',
          data: data.map(d => [d.timestamp, d.imputed]),
          itemStyle: { color: '#3b82f6' },
          lineStyle: { width: 1, type: 'dashed' }
        }
      ]
    };
    
    timeSeriesInstance.value.setOption(option);
  }
};

// 更新预览表格
const updatePreviewTable = () => {
  if (!selectedColumn.value) return;
  
  const data = generateTimeSeriesData();
  previewTableData.value = data.slice(0, 15);
};

const handleRefresh = () => {
  emit("refresh");
};

// 切换视图模式
const switchViewMode = (mode: 'chart' | 'table') => {
  viewMode.value = mode;
};

// Watch for dataset changes
watch(
  () => props.datasetInfo,
  () => {
    selectedColumn.value = "";
    searchKeyword.value = "";
    isDropdownOpen.value = false;
  }
);

// 组件挂载后初始化
onMounted(() => {
  window.addEventListener('resize', () => {
    timeSeriesInstance.value?.resize();
  });

  // 点击外部关闭下拉框
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (!target.closest('.custom-select')) {
      isDropdownOpen.value = false;
    }
  });
});
</script>

<template>
  <div class="gap-filling-panel">
    <!-- 数据集状态 -->
    <div v-if="!datasetInfo" class="empty-state">
      <div class="empty-icon">📊</div>
      <h3 class="empty-title">未选择数据集</h3>
      <p class="empty-description">请先选择一个数据集以开始缺失值处理</p>
    </div>

    <!-- 主要内容 -->
    <div v-else class="panel-content">
      <!-- 主工作区 -->
      <div class="main-workspace">
        <!-- 左侧：模型选择和参数配置 -->
        <div class="left-panel">
          <!-- 模型选择 -->
          <div class="model-selection-section">
            <div class="section-header">
              <h3 class="section-title">
                <el-icon><Setting /></el-icon>
                插补模型
              </h3>
            </div>

            <div class="methods-list">
              <div
                v-for="method in imputationMethods"
                :key="method.value"
                @click="imputationMethod = method.value"
                :class="[
                  'method-item',
                  { 'method-item--selected': imputationMethod === method.value }
                ]">
                
                <div class="method-icon">{{ method.icon }}</div>
                <div class="method-content">
                  <div class="method-name">{{ method.label }}</div>
                  <div class="method-description">{{ method.description }}</div>
                </div>
                
                <div v-if="imputationMethod === method.value" class="method-indicator">
                  <el-icon><Check /></el-icon>
                </div>
              </div>
            </div>
          </div>

          <!-- 参数配置 -->
          <div class="parameters-section">
            <div class="section-header">
              <h3 class="section-title">
                <el-icon><Setting /></el-icon>
                参数配置
              </h3>
            </div>

            <div class="parameters-form">
              <div class="parameter-group">
                <label class="parameter-label">最大间隙大小</label>
                <input 
                  v-model.number="advancedOptions.maxGapSize" 
                  type="number" 
                  class="parameter-input"
                  min="1"
                  max="100">
              </div>
              
              <div class="parameter-group">
                <label class="parameter-label">窗口大小</label>
                <input 
                  v-model.number="advancedOptions.windowSize" 
                  type="number" 
                  class="parameter-input"
                  min="1"
                  max="168">
              </div>
              
              <div class="parameter-group">
                <label class="parameter-label">多项式度数</label>
                <input 
                  v-model.number="advancedOptions.polynomialDegree" 
                  type="number" 
                  class="parameter-input"
                  min="1"
                  max="5">
              </div>
              
              <div class="parameter-group">
                <label class="parameter-label">K近邻数量</label>
                <input 
                  v-model.number="advancedOptions.knnNeighbors" 
                  type="number" 
                  class="parameter-input"
                  min="1"
                  max="20">
              </div>

              <!-- ARIMA特有参数 -->
              <div v-if="imputationMethod === 'arima'" class="arima-parameters">
                <div class="parameter-group-title">ARIMA模型参数</div>
                
                <div class="parameter-switches">
                  <label class="switch-item">
                    <input 
                      v-model="advancedOptions.arimaAutoSelect" 
                      type="checkbox" 
                      class="switch-input">
                    <span class="switch-label">自动选择最优参数</span>
                  </label>
                </div>

                <div v-if="!advancedOptions.arimaAutoSelect" class="arima-order-params">
                  <div class="parameter-row">
                    <div class="parameter-group">
                      <label class="parameter-label">AR阶数 (p)</label>
                      <input 
                        v-model.number="advancedOptions.arimaP" 
                        type="number" 
                        class="parameter-input"
                        min="0"
                        max="5">
                    </div>
                    
                    <div class="parameter-group">
                      <label class="parameter-label">差分次数 (d)</label>
                      <input 
                        v-model.number="advancedOptions.arimaD" 
                        type="number" 
                        class="parameter-input"
                        min="0"
                        max="2">
                    </div>
                    
                    <div class="parameter-group">
                      <label class="parameter-label">MA阶数 (q)</label>
                      <input 
                        v-model.number="advancedOptions.arimaQ" 
                        type="number" 
                        class="parameter-input"
                        min="0"
                        max="5">
                    </div>
                  </div>
                </div>
              </div>

              <div class="parameter-switches">
                <label class="switch-item">
                  <input 
                    v-model="advancedOptions.preservePattern" 
                    type="checkbox" 
                    class="switch-input">
                  <span class="switch-label">保持数据模式</span>
                </label>
              </div>

              <button 
                @click="startImputation"
                :disabled="!canStartImputation"
                class="process-button">
                <el-icon v-if="!isProcessing" class="button-icon"><Check /></el-icon>
                <div v-else class="loading-spinner"></div>
                {{ isProcessing ? '处理中...' : '开始整个数据集插补' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 右侧：插补结果查看 -->
        <div class="right-panel">
          <!-- 插补状态显示 -->
          <div v-if="!hasImputationResult" class="imputation-status-section">
            <div class="status-content">
              <div v-if="!isProcessing" class="waiting-state">
                <div class="waiting-icon">🎯</div>
                <h3 class="waiting-title">准备开始插补</h3>
                <p class="waiting-description">
                  配置插补参数后，点击"开始整个数据集插补"按钮
                </p>
              </div>
              <div v-else class="processing-state">
                <div class="processing-icon">
                  <div class="loading-spinner-large"></div>
                </div>
                <h3 class="processing-title">正在处理数据集...</h3>
                <p class="processing-description">
                  正在使用{{ imputationMethods.find(m => m.value === imputationMethod)?.label }}方法处理整个数据集的缺失值
                </p>
              </div>
            </div>
          </div>

          <!-- 结果查看：指标选择 -->
          <div v-else class="indicator-selection-section">
            <div class="section-header">
              <h3 class="section-title">
                <el-icon><Search /></el-icon>
                选择指标查看插补结果
              </h3>
              <div class="section-actions">
                <button @click="hasImputationResult = false; selectedColumn = ''" class="action-button">
                  <el-icon><Refresh /></el-icon>
                  重新插补
                </button>
              </div>
            </div>

            <!-- 选择框 -->
            <div class="select-container">
              <div class="custom-select" @click="toggleDropdown">
                <div class="select-display">
                  <span v-if="selectedColumn" class="selected-text">{{ selectedColumn }}</span>
                  <span v-else class="placeholder-text">请选择指标</span>
                  <el-icon class="select-arrow" :class="{ 'select-arrow--open': isDropdownOpen }">
                    <ArrowDown />
                  </el-icon>
                </div>
                
                <div v-show="isDropdownOpen" class="select-dropdown">
                  <!-- 搜索框 -->
                  <div class="dropdown-search">
                    <el-icon class="search-icon"><Search /></el-icon>
                    <input 
                      v-model="searchKeyword"
                      type="text"
                      placeholder="搜索指标..."
                      class="search-input"
                      @click.stop>
                    <button 
                      v-if="searchKeyword"
                      @click.stop="clearSearch"
                      class="clear-btn">
                      <el-icon><CircleClose /></el-icon>
                    </button>
                  </div>
                  
                  <!-- 选项列表 -->
                  <div class="options-list">
                    <div
                      v-for="column in filteredColumns"
                      :key="column.name"
                      @click.stop="selectColumn(column.name)"
                      :class="[
                        'option-item',
                        {
                          'option-item--selected': selectedColumn === column.name,
                          'option-item--no-missing': column.missingCount === 0,
                        }
                      ]">
                      <div class="option-content">
                        <span class="option-name">{{ column.name }}</span>
                        <div class="option-stats">
                          <span class="missing-count">{{ column.missingCount }} 缺失</span>
                          <span :class="['missing-rate', getMissingRateClass(column.missingRate)]">
                            {{ column.missingRate.toFixed(1) }}%
                          </span>
                        </div>
                      </div>
                      <el-icon v-if="selectedColumn === column.name" class="check-icon">
                        <Check />
                      </el-icon>
                    </div>
                    
                    <div v-if="filteredColumns.length === 0" class="no-options">
                      <span>未找到匹配的指标</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 选中指标信息 -->
            <div v-if="selectedColumnInfo" class="selected-info">
              <div class="info-item">
                <span class="info-label">缺失数量:</span>
                <span class="info-value">{{ selectedColumnInfo.missingCount }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">缺失率:</span>
                <span :class="['info-value', getMissingRateClass(selectedColumnInfo.missingRate)]">
                  {{ selectedColumnInfo.missingRate.toFixed(1) }}%
                </span>
              </div>
            </div>
          </div>

          <!-- 可视化区域 -->
          <div v-if="hasImputationResult" class="visualization-section">
            <div v-if="!selectedColumn" class="no-selection-state">
              <div class="no-selection-icon">📊</div>
              <p class="no-selection-text">请选择一个指标查看插补结果</p>
            </div>

            <div v-else class="visualization-content">
              <!-- 视图切换器 -->
              <div class="view-switcher">
                <div class="switch-buttons">
                  <button 
                    @click="switchViewMode('chart')"
                    :class="['switch-btn', { 'switch-btn--active': viewMode === 'chart' }]">
                    <el-icon><Monitor /></el-icon>
                    <span>图表视图</span>
                  </button>
                  <button 
                    @click="switchViewMode('table')"
                    :class="['switch-btn', { 'switch-btn--active': viewMode === 'table' }]">
                    <el-icon><List /></el-icon>
                    <span>表格视图</span>
                  </button>
                </div>
              </div>

              <!-- 图表视图 -->
              <div v-show="viewMode === 'chart'" class="chart-view">
                <div class="chart-container">
                  <div class="chart-header">
                    <h4 class="chart-title">
                      <el-icon><DataLine /></el-icon>
                      {{ selectedColumn }} 时间序列分析
                    </h4>
                  </div>
                  <div ref="timeSeriesChart" class="chart-area"></div>
                </div>
              </div>

              <!-- 表格视图 -->
              <div v-show="viewMode === 'table'" class="table-view">
                <div class="table-container">
                  <div class="table-header">
                    <h4 class="table-title">
                      <el-icon><DocumentDelete /></el-icon>
                      {{ selectedColumn }} 数据预览
                    </h4>
                    <div class="table-info">
                      <span class="data-count">显示前 {{ previewTableData.length }} 条数据</span>
                    </div>
                  </div>
                  <div class="table-wrapper">
                    <table class="preview-table">
                      <thead>
                        <tr>
                          <th>序号</th>
                          <th>时间</th>
                          <th>原始值</th>
                          <th>插补值</th>
                          <th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, index) in previewTableData" :key="index">
                          <td class="row-index">{{ index + 1 }}</td>
                          <td class="timestamp">{{ row.timestamp }}</td>
                          <td class="original-cell">
                            <span v-if="row.original === null" class="missing-value">--</span>
                            <span v-else class="original-value">{{ row.original.toFixed(2) }}</span>
                          </td>
                          <td class="imputed-cell">
                            <span class="imputed-value">{{ row.imputed.toFixed(2) }}</span>
                          </td>
                          <td class="status-cell">
                            <span v-if="row.original === null" class="status-missing">缺失</span>
                            <span v-else class="status-normal">正常</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 主容器 */
.gap-filling-panel {
  background: linear-gradient(135deg, rgba(250, 250, 249, 0.8) 0%, rgba(236, 253, 245, 0.3) 100%);
  border-radius: 16px;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 空状态 */
.empty-state {
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
  color: rgba(68, 64, 60, 1);
  margin: 0 0 8px 0;
}

.empty-description {
  color: rgba(120, 113, 108, 1);
  margin: 0;
}

/* 面板内容 */
.panel-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

/* 主工作区 */
.main-workspace {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: rgba(6, 78, 59, 1);
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 8px;
}

/* 左面板 */
.left-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}

/* 右面板 */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* 模型选择区域 */
.model-selection-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border: 1px solid rgba(167, 243, 208, 0.2);
  padding: 16px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.methods-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.method-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.method-item:hover {
  border-color: rgba(167, 243, 208, 0.6);
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.1);
}

.method-item--selected {
  border-color: rgba(34, 197, 94, 1);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.8) 0%, rgba(220, 252, 231, 0.6) 100%);
}

.method-icon {
  font-size: 20px;
  opacity: 0.8;
  flex-shrink: 0;
}

.method-content {
  flex: 1;
  min-width: 0;
}

.method-name {
  font-weight: 600;
  color: rgba(31, 41, 55, 1);
  font-size: 13px;
  margin-bottom: 2px;
}

.method-description {
  font-size: 11px;
  color: rgba(107, 114, 128, 1);
  line-height: 1.3;
}

.method-indicator {
  color: rgba(34, 197, 94, 1);
  font-weight: 600;
  flex-shrink: 0;
}

/* 参数配置区域 */
.parameters-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border: 1px solid rgba(167, 243, 208, 0.2);
  padding: 16px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  flex: 1;
}

.parameters-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.parameter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.parameter-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(55, 65, 81, 1);
}

.parameter-input {
  padding: 6px 10px;
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 6px;
  font-size: 12px;
  transition: border-color 0.2s ease;
}

.parameter-input:focus {
  outline: none;
  border-color: rgba(34, 197, 94, 1);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.1);
}

.parameter-switches {
  margin-top: 8px;
}

.switch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.switch-input {
  width: 14px;
  height: 14px;
}

.switch-label {
  font-size: 12px;
  color: rgba(55, 65, 81, 1);
}

/* ARIMA参数样式 */
.arima-parameters {
  margin-top: 16px;
  padding: 12px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(226, 232, 240, 1);
  border-radius: 8px;
}

.parameter-group-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(51, 65, 85, 1);
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(226, 232, 240, 1);
}

.parameter-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.parameter-row .parameter-group {
  flex: 1;
  margin-bottom: 0;
}

.process-button {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, rgba(34, 197, 94, 1) 0%, rgba(16, 185, 129, 1) 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px -1px rgba(34, 197, 94, 0.25);
}

.process-button:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(16, 185, 129, 1) 0%, rgba(5, 150, 105, 1) 100%);
  box-shadow: 0 4px 8px -2px rgba(34, 197, 94, 0.3);
  transform: translateY(-1px);
}

.process-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 插补状态区域 */
.imputation-status-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border: 1px solid rgba(167, 243, 208, 0.2);
  padding: 24px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-content {
  text-align: center;
  max-width: 400px;
}

.waiting-state, .processing-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.waiting-icon {
  font-size: 64px;
  opacity: 0.7;
}

.waiting-title, .processing-title {
  font-size: 20px;
  font-weight: 600;
  color: rgba(31, 41, 55, 1);
  margin: 0;
}

.waiting-description, .processing-description {
  font-size: 14px;
  color: rgba(107, 114, 128, 1);
  line-height: 1.5;
  margin: 0;
}

.processing-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner-large {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(34, 197, 94, 0.2);
  border-top: 4px solid rgba(34, 197, 94, 1);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* 指标选择区域 */
.indicator-selection-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border: 1px solid rgba(167, 243, 208, 0.2);
  padding: 16px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  z-index: 2;
}

/* 选择容器 */
.select-container {
  position: relative;
  z-index: 1001;
}

.custom-select {
  position: relative;
  cursor: pointer;
}

.select-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.select-display:hover {
  border-color: rgba(167, 243, 208, 0.6);
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.1);
}

.selected-text {
  font-weight: 600;
  color: rgba(31, 41, 55, 1);
  font-size: 13px;
}

.placeholder-text {
  color: rgba(107, 114, 128, 1);
  font-size: 13px;
}

.select-arrow {
  color: rgba(107, 114, 128, 1);
  transition: transform 0.2s ease;
}

.select-arrow--open {
  transform: rotate(180deg);
}

/* 下拉框 */
.select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  margin-top: 4px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 8px;
  box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

/* 下拉框搜索 */
.dropdown-search {
  position: relative;
  padding: 8px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.5);
}

.dropdown-search .search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(107, 114, 128, 1);
  font-size: 12px;
}

.dropdown-search .search-input {
  width: 100%;
  padding: 6px 28px 6px 28px;
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 6px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.9);
  transition: border-color 0.2s ease;
}

.dropdown-search .search-input:focus {
  outline: none;
  border-color: rgba(34, 197, 94, 1);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.1);
}

.dropdown-search .clear-btn {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(107, 114, 128, 1);
  padding: 2px;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.dropdown-search .clear-btn:hover {
  background: rgba(229, 231, 235, 1);
}

/* 选项列表 */
.options-list {
  max-height: 300px;
  overflow-y: auto;
}

.option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s ease;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
}

.option-item:hover {
  background: rgba(249, 250, 251, 0.8);
}

.option-item--selected {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.8) 0%, rgba(220, 252, 231, 0.6) 100%);
}

.option-item--no-missing {
  opacity: 0.6;
}

.option-content {
  flex: 1;
  min-width: 0;
}

.option-name {
  font-weight: 600;
  color: rgba(31, 41, 55, 1);
  font-size: 12px;
  margin-bottom: 2px;
  display: block;
}

.option-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
}

.missing-count {
  color: rgba(107, 114, 128, 1);
}

.missing-rate {
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 9px;
}

.missing-rate--none {
  background: rgba(209, 250, 229, 1);
  color: rgba(4, 120, 87, 1);
}

.missing-rate--low {
  background: rgba(254, 243, 199, 1);
  color: rgba(146, 64, 14, 1);
}

.missing-rate--medium {
  background: rgba(254, 232, 132, 1);
  color: rgba(133, 77, 14, 1);
}

.missing-rate--high {
  background: rgba(254, 202, 202, 1);
  color: rgba(153, 27, 27, 1);
}

.check-icon {
  color: rgba(34, 197, 94, 1);
  font-size: 14px;
  flex-shrink: 0;
}

.no-options {
  padding: 20px;
  text-align: center;
  color: rgba(107, 114, 128, 1);
  font-size: 12px;
  font-style: italic;
}

/* 选中指标信息 */
.selected-info {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: rgba(249, 250, 251, 0.8);
  border: 1px solid rgba(229, 231, 235, 1);
  border-radius: 6px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.info-label {
  font-size: 11px;
  color: rgba(107, 114, 128, 1);
  font-weight: 500;
}

.info-value {
  font-size: 11px;
  font-weight: 600;
  color: rgba(31, 41, 55, 1);
}

.info-value.missing-rate--none {
  background: rgba(209, 250, 229, 1);
  color: rgba(4, 120, 87, 1);
  padding: 1px 4px;
  border-radius: 3px;
}

.info-value.missing-rate--low {
  background: rgba(254, 243, 199, 1);
  color: rgba(146, 64, 14, 1);
  padding: 1px 4px;
  border-radius: 3px;
}

.info-value.missing-rate--medium {
  background: rgba(254, 232, 132, 1);
  color: rgba(133, 77, 14, 1);
  padding: 1px 4px;
  border-radius: 3px;
}

.info-value.missing-rate--high {
  background: rgba(254, 202, 202, 1);
  color: rgba(153, 27, 27, 1);
  padding: 1px 4px;
  border-radius: 3px;
}

/* 可视化区域 */
.visualization-section {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border: 1px solid rgba(167, 243, 208, 0.2);
  padding: 16px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  flex: 1;
  overflow: hidden;
}

.no-selection-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(107, 114, 128, 1);
}

.no-selection-icon {
  font-size: 48px;
  opacity: 0.5;
  margin-bottom: 12px;
}

.no-selection-text {
  font-size: 14px;
  margin: 0;
}

.visualization-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

/* 视图切换器 */
.view-switcher {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.switch-buttons {
  display: flex;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 8px;
  padding: 2px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.switch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  color: rgba(107, 114, 128, 1);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.switch-btn:hover {
  background: rgba(249, 250, 251, 0.8);
  color: rgba(55, 65, 81, 1);
}

.switch-btn--active {
  background: linear-gradient(135deg, rgba(34, 197, 94, 1) 0%, rgba(16, 185, 129, 1) 100%);
  color: white;
  box-shadow: 0 2px 4px -1px rgba(34, 197, 94, 0.25);
}

.switch-btn--active:hover {
  background: linear-gradient(135deg, rgba(16, 185, 129, 1) 0%, rgba(5, 150, 105, 1) 100%);
}

/* 图表视图 */
.chart-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 表格视图 */
.table-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chart-container {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  border: 1px solid rgba(229, 231, 235, 1);
  overflow: hidden;
  flex: 1;
  min-height: 200px;
}

.chart-header {
  padding: 12px 16px;
  background: rgba(249, 250, 251, 1);
  border-bottom: 1px solid rgba(229, 231, 235, 1);
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(31, 41, 55, 1);
  margin: 0;
}

.chart-area {
  height: calc(100% - 49px);
  min-height: 150px;
}

.table-container {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  border: 1px solid rgba(229, 231, 235, 1);
  overflow: hidden;
  flex-shrink: 0;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(249, 250, 251, 1);
  border-bottom: 1px solid rgba(229, 231, 235, 1);
}

.table-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.data-count {
  font-size: 11px;
  color: rgba(107, 114, 128, 1);
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(229, 231, 235, 1);
}

.table-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(31, 41, 55, 1);
  margin: 0;
}

.table-wrapper {
  max-height: 200px;
  overflow-y: auto;
}

/* 表格样式 */
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.preview-table th,
.preview-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(229, 231, 235, 1);
}

.preview-table th {
  background: rgba(249, 250, 251, 1);
  font-weight: 600;
  color: rgba(55, 65, 81, 1);
  font-size: 11px;
}

.preview-table td {
  color: rgba(75, 85, 99, 1);
}

.row-index {
  font-weight: 600;
  color: rgba(107, 114, 128, 1);
  text-align: center;
  background: rgba(249, 250, 251, 0.5);
}

.timestamp {
  font-family: monospace;
  font-size: 11px;
  color: rgba(55, 65, 81, 1);
}

.original-cell,
.imputed-cell,
.status-cell {
  text-align: center;
}

.missing-value {
  color: rgba(239, 68, 68, 1);
  font-style: italic;
  font-weight: 600;
}

.original-value {
  color: rgba(34, 197, 94, 1);
  font-weight: 600;
  font-family: monospace;
}

.imputed-value {
  color: rgba(59, 130, 246, 1);
  font-weight: 600;
  font-family: monospace;
}

.status-missing {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(254, 242, 242, 1);
  color: rgba(153, 27, 27, 1);
  border-radius: 4px;
}

.status-normal {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(209, 250, 229, 1);
  color: rgba(4, 120, 87, 1);
  border-radius: 4px;
}

/* 通用样式 */
.action-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.8);
  color: rgba(55, 65, 81, 1);
  border: 1px solid rgba(209, 213, 219, 1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button:hover:not(:disabled) {
  background: rgba(249, 250, 251, 1);
  border-color: rgba(156, 163, 175, 1);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: rgba(6, 78, 59, 1);
  margin: 0;
}

/* 滚动条样式 */
.methods-list::-webkit-scrollbar,
.options-list::-webkit-scrollbar,
.table-wrapper::-webkit-scrollbar {
  width: 4px;
}

.methods-list::-webkit-scrollbar-track,
.options-list::-webkit-scrollbar-track,
.table-wrapper::-webkit-scrollbar-track {
  background: rgba(120, 113, 108, 0.1);
  border-radius: 2px;
}

.methods-list::-webkit-scrollbar-thumb,
.options-list::-webkit-scrollbar-thumb,
.table-wrapper::-webkit-scrollbar-thumb {
  background: rgba(34, 197, 94, 0.3);
  border-radius: 2px;
  transition: background 0.2s ease;
}

.methods-list::-webkit-scrollbar-thumb:hover,
.options-list::-webkit-scrollbar-thumb:hover,
.table-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 197, 94, 0.5);
}

/* 动画 */
@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-5px);
  }
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .left-panel {
    width: 320px;
  }
}

@media (max-width: 768px) {
  .main-workspace {
    flex-direction: column;
    gap: 16px;
  }

  .left-panel {
    width: 100%;
  }

  .quick-filters {
    justify-content: flex-start;
  }

  .quick-filter-btn {
    font-size: 10px;
    padding: 4px 8px;
  }

  .filter-row {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .filter-group {
    flex: none;
  }

  .visualization-content {
    gap: 12px;
  }

  .chart-container {
    min-height: 150px;
  }

  .indicators-table th,
  .indicators-table td {
    padding: 6px 8px;
    font-size: 10px;
  }

  .pagination {
    flex-wrap: wrap;
    gap: 4px;
  }

  .pagination-numbers {
    order: -1;
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .results-summary {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .quick-filter-btn {
    font-size: 9px;
    padding: 3px 6px;
  }

  .search-input {
    font-size: 11px;
  }

  .indicators-table {
    font-size: 10px;
  }

  .col-name {
    width: 50%;
  }

  .col-missing,
  .col-rate {
    width: 20%;
  }

  .col-action {
    width: 10%;
  }

  .indicator-type {
    display: none;
  }

  .pagination-btn,
  .pagination-number {
    padding: 4px 8px;
    font-size: 10px;
  }
}
</style>
