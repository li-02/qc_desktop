<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { Loading, Refresh, Search, InfoFilled, TrendCharts, DocumentDelete, Connection } from "@element-plus/icons-vue";
import { useDatasetStore } from "@/stores/useDatasetStore";
import DataVisualizationChart from "../charts/DataVisualizationChart.vue";
import { API_ROUTES } from "@shared/constants/apiRoutes";

const datasetStore = useDatasetStore();
const datasetInfo = computed(() => datasetStore.currentDataset);
const versions = computed(() => datasetStore.versions);
const currentVersion = computed({
  get: () => datasetStore.currentVersion?.id,
  set: (val) => {
    if (val) datasetStore.setCurrentVersion(val);
  }
});
const currentVersionStats = computed(() => datasetStore.currentVersionStats);

// 总缺失值数量
const missingValueCount = computed(() => {
  return currentVersionStats.value?.totalMissingCount || 0;
});

const columnNumber = computed(() => {
  return currentVersionStats.value?.totalCols || 0;
});

const rowNumber = computed(() => {
  return currentVersionStats.value?.totalRows || 0;
});

const dataQualityPercentage = computed(() => {
  const totalRows = rowNumber.value;
  const totalCells = totalRows * columnNumber.value;
  const missingCells = missingValueCount.value;
  if (totalCells === 0) return 0;
  return ((totalCells - missingCells) / totalCells) * 100;
});

// 完整记录数量
const completeRecords = computed(() => {
  // Approximate if not available directly
  return rowNumber.value - (currentVersionStats.value?.totalMissingCount || 0); // This is rough, ideally backend provides it
});

const columns = computed(() => {
  const statsObj = currentVersionStats.value?.columnStats;
  if (statsObj) {
    // New format with nested structure
    if (statsObj.columnMissingStatus) {
      return statsObj.columnMissingStatus;
    }
    // Old format (direct map) or fallback
    // Check if values are numbers (old format)
    const values = Object.values(statsObj);
    if (values.length > 0 && typeof values[0] === 'number') {
       return statsObj;
    }
  }
  return {};
});

// 数值列过滤 - 基于你的实际数据列名
const numericColumns = computed(() => {
  const statsObj = currentVersionStats.value?.columnStats;
  if (statsObj) {
     // If we have detailed stats, use them to identify numeric columns
     if (statsObj.columnStatistics) {
         return Object.keys(statsObj.columnStatistics).map(name => ({ name, type: 'numeric' }));
     }
     // Fallback to all columns if we only have missing status
     if (statsObj.columnMissingStatus) {
         return Object.keys(statsObj.columnMissingStatus).map(name => ({ name, type: 'numeric' }));
     }
     // Old format fallback
     return Object.keys(statsObj).map(name => ({ name, type: 'numeric' }));
  }
  return datasetInfo.value?.originalFile?.columns?.map(name => ({ name, type: 'numeric' })) || [];
});// Emits
const emit = defineEmits<{
  refresh: [];
}>();

// Reactive state
const refreshing = ref(false);
const columnSearchText = ref("");
const selectedColumn = ref("");
const chartType = ref("scatter");
const chartLoading = ref(false);
const correlationLoading = ref(false);
const correlationMatrix = ref<Array<{ name: string; values: number[] }>>([]);
const correlationHeaders = ref<string[]>([]);
const csvData = ref<any>(null); // 存储读取的CSV数据
const columnStatistics = ref<{
  mean: number;
  std: number;
  min: number;
  max: number;
  count: number;
  validCount: number;
  minTimestamp?: string;
  maxTimestamp?: string;
} | null>(null); // 存储列统计信息

const dataQualityClass = computed(() => {
  const percentage = dataQualityPercentage.value;
  if (percentage >= 95) return "text-emerald-600";
  if (percentage >= 85) return "text-yellow-600";
  return "text-red-600";
});

// Methods
const getColumnStatusColor = (col: { missingCount: number }) => {
  if (col.missingCount > 10) return "bg-red-400";
  if (col.missingCount > 0) return "bg-orange-400";
  return "bg-emerald-400";
};

const getColumnTypeTag = (type: string) => {
  const typeMap: Record<string, string> = {
    numeric: "success",
    text: "info",
    datetime: "warning",
  };
  return typeMap[type] || "default";
};

const getColumnTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    numeric: "数值",
    text: "文本",
    datetime: "时间",
  };
  return typeMap[type] || type;
};

const getColumnTooltip = (col: { type: string; missingCount: number; uniqueCount: number }) => {
  return `类型: ${getColumnTypeLabel(col.type)}\n缺失值: ${col.missingCount}\n唯一值: ${col.uniqueCount}`;
};

const getColumnStats = (columnName: string) => {
  // 1. 优先使用后端预计算的统计信息
  const statsObj = currentVersionStats.value?.columnStats;
  if (statsObj && statsObj.columnStatistics && statsObj.columnStatistics[columnName]) {
      const s = statsObj.columnStatistics[columnName];
      return {
          mean: typeof s.mean === 'number' ? s.mean.toFixed(2) : s.mean,
          std: typeof s.std === 'number' ? s.std.toFixed(2) : s.std,
          min: typeof s.min === 'number' ? s.min.toFixed(2) : s.min,
          max: typeof s.max === 'number' ? s.max.toFixed(2) : s.max,
          minTimestamp: '', // 后端暂未计算时间戳
          maxTimestamp: ''
      };
  }

  // 2. 如果有从后端返回的实时统计信息（CSV读取），使用它
  if (columnStatistics.value && selectedColumn.value === columnName) {
      return {
      mean: columnStatistics.value.mean.toFixed(2),
      std: columnStatistics.value.std.toFixed(2),
      min: columnStatistics.value.min.toFixed(2),
      max: columnStatistics.value.max.toFixed(2),
      minTimestamp: columnStatistics.value.minTimestamp || '',
      maxTimestamp: columnStatistics.value.maxTimestamp || '',
    };
  }

    // 否则返回默认值（当数据未加载时）
  return {
    mean: "加载中...",
    std: "加载中...",
    min: "加载中...",
    max: "加载中...",
    minTimestamp: "",
    maxTimestamp: "",
  };
};

const getCorrelationColor = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 0.7) return "strong";
  if (abs >= 0.4) return "moderate";
  if (abs >= 0.2) return "weak";
  return "none";
};

// 格式化时间戳显示
const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '';
  
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      // 如果不是标准时间格式，可能是其他格式，直接返回
      return timestamp;
    }
    
    // 格式化为本地时间
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    console.error('时间格式化错误:', error);
    return timestamp;
  }
};

/**
 * 读取CSV数据（只在指标变化时调用）
 */
const loadCsvData = async () => {
  if (!selectedColumn.value) {
    csvData.value = null;
    columnStatistics.value = null;
    return;
  }

  chartLoading.value = true;
  try {
    // 从数据集信息中获取文件路径
    const filePath = datasetInfo.value?.originalFile?.filePath;
    if (!filePath) {
      throw new Error("未找到数据文件路径");
    }

    // 调用读取CSV数据的API
    const result = await window.electronAPI.invoke(API_ROUTES.FILES.READ_CSV_DATA, {
      filePath: filePath,
      columnName: selectedColumn.value,
    });

    if (!result.success) {
      throw new Error(result.error || "读取数据失败");
    }

    // 存储读取的数据，传递给DataVisualizationChart组件
    csvData.value = result.data;

    // 存储统计信息
    if (result.data && result.data.statistics) {
      columnStatistics.value = result.data.statistics;
      console.log("统计信息:", result.data.statistics);
    } else {
      columnStatistics.value = null;
    }

    console.log("读取到的数据:", result.data);

    ElMessage.success(`已读取 ${selectedColumn.value} 的数据`);
  } catch (error: any) {
    console.error("读取数据失败:", error);
    ElMessage.error(error.message || "读取数据失败，请重试");
    csvData.value = null;
    columnStatistics.value = null;
  } finally {
    chartLoading.value = false;
  }
};

/**
 * 更新图表类型（不重新读取数据）
 */
const updateChartType = () => {
  if (!selectedColumn.value) return;

  const chartTypeNames: Record<string, string> = {
    scatter: "时间序列图",
    heatmap: "热力图 (月-时)",
  };

  ElMessage.success(`已切换到${chartTypeNames[chartType.value] || "图表"}视图`);
};

const calculateCorrelation = async () => {
  correlationLoading.value = true;
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 清空相关性数据，不进行自动计算
    correlationHeaders.value = [];
    correlationMatrix.value = [];

    ElMessage.info("请前往'相关性分析'页面进行详细分析");
  } catch (error) {
    ElMessage.error("操作失败");
  } finally {
    correlationLoading.value = false;
  }
};

// 监听选中列的变化，自动加载数据
watch(
  () => selectedColumn.value,
  (newColumn, oldColumn) => {
    if (newColumn && newColumn !== oldColumn) {
      loadCsvData();
    }
  },
  { immediate: false }
);

// 监听数据集变化，清空当前数据
watch(
  () => datasetInfo.value,
  () => {
    csvData.value = null;
    columnStatistics.value = null;
    selectedColumn.value = "";
  }
);

// 组件挂载时，如果已有选中列则加载数据
onMounted(() => {
  if (selectedColumn.value && datasetInfo.value) {
    loadCsvData();
  }
});
</script>

<template>
  <div class="overview-container">
    <!-- 加载状态 -->
    <div v-if="datasetStore.loading" class="loading-container">
      <div class="loading-content">
        <el-icon class="loading-spinner">
          <Loading />
        </el-icon>
        <span class="loading-text">分析数据中...</span>
      </div>
    </div>

    <template v-else-if="datasetInfo">
      <!-- 数据统计摘要和列信息预览区域 -->
      <div class="overview-top-section">
        <!-- 数据统计摘要区域 -->
        <div class="stats-section">
          <div class="section-header">
            <div class="section-title">📊 数据统计摘要</div>
            <div class="header-controls" style="display: flex; align-items: center;">
              <el-select v-model="currentVersion" placeholder="选择版本" size="small" style="width: 200px; margin-right: 10px;">
                <el-option
                  v-for="v in versions"
                  :key="v.id"
                  :label="`${v.stageType} (${new Date(v.createdAt).toLocaleDateString()})`"
                  :value="v.id"
                />
              </el-select>
              <button class="action-btn refresh-btn" @click="$emit('refresh')" :disabled="refreshing" title="刷新数据">
                <el-icon class="action-icon" :class="{ spinning: refreshing }">
                  <Refresh />
                </el-icon>
              </button>
            </div>
          </div>

          <div class="stats-cards">
            <div class="stat-card primary">
              <div class="stat-icon datasets">📊</div>
              <div class="stat-content">
                <div class="stat-value">{{ columnNumber.toLocaleString() }}</div>
                <div class="stat-label">数据列</div>
              </div>
            </div>

            <div class="stat-card secondary">
              <div class="stat-icon rows">📝</div>
              <div class="stat-content">
                <div class="stat-value">{{ rowNumber.toLocaleString() }}</div>
                <div class="stat-label">数据行</div>
              </div>
            </div>

            <div class="stat-card warning">
              <div class="stat-icon missing">⚠️</div>
              <div class="stat-content">
                <div class="stat-value">{{ missingValueCount }}</div>
                <div class="stat-label">缺失值</div>
              </div>
            </div>

            <div class="stat-card success">
              <div class="stat-icon complete">✅</div>
              <div class="stat-content">
                <div class="stat-value">{{ completeRecords.toLocaleString() }}</div>
                <div class="stat-label">完整记录</div>
              </div>
            </div>
          </div>

          <!-- 数据质量指示器 -->
          <div class="quality-indicator">
            <div class="quality-header">
              <span class="quality-label">数据质量</span>
              <span :class="['quality-value', dataQualityClass]">{{ dataQualityPercentage.toFixed(1) }}%</span>
            </div>
            <div class="quality-bar">
              <div
                class="quality-fill"
                :style="{ width: dataQualityPercentage + '%' }"
                :class="{
                  excellent: dataQualityPercentage >= 95,
                  good: dataQualityPercentage >= 85 && dataQualityPercentage < 95,
                  poor: dataQualityPercentage < 85,
                }"></div>
            </div>
          </div>
        </div>

        <!-- 列信息预览区域 -->
        <div class="columns-section">
          <div class="section-header">
            <div class="section-title">📋 列信息预览</div>
            <div class="search-container">
              <el-input
                v-model="columnSearchText"
                placeholder="搜索列名..."
                size="small"
                clearable
                class="column-search">
                <template #prefix>
                  <el-icon class="search-icon"><Search /></el-icon>
                </template>
              </el-input>
            </div>
          </div>

          <div class="columns-list" v-if="Object.keys(columns).length > 0">
            <div
              v-for="(missingCount, colName) in columns"
              :key="colName"
              v-show="!columnSearchText || String(colName).toLowerCase().includes(columnSearchText.toLowerCase())"
              class="column-item"
              :class="{ 'has-missing': missingCount > 0, 'many-missing': missingCount > 10 }">
              <div class="column-header">
                <div
                  class="column-status"
                  :class="{
                    'status-complete': missingCount === 0,
                    'status-warning': missingCount > 0 && missingCount <= 10,
                    'status-error': missingCount > 10,
                  }"></div>
                <div class="column-name">{{ colName }}</div>
                <div v-if="missingCount > 0" class="missing-badge">
                  {{ missingCount }}
                </div>
              </div>
              <div v-if="missingCount > 0" class="column-meta">{{ missingCount }} 个缺失值</div>
            </div>
          </div>

          <div v-else class="empty-columns">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">未找到匹配的列</div>
          </div>
        </div>
      </div>

      <!-- 数据分布可视化区域 -->
      <div class="visualization-section">
        <div class="section-header">
          <div class="section-title">📈 数据分布可视化</div>
          <div class="viz-controls">
            <el-select v-model="selectedColumn" placeholder="选择列" size="small" class="column-select">
              <el-option v-for="col in numericColumns" :key="col.name" :label="col.name" :value="col.name" />
            </el-select>
            <el-select v-model="chartType" size="small" class="chart-select" @change="updateChartType">
              <el-option label="时间序列" value="scatter" />
              <el-option label="热力图 (月-时)" value="heatmap" />
            </el-select>
          </div>
        </div>

        <!-- 图表容器 -->
        <div class="chart-container">
          <!-- 性能优化提示 -->
          <div 
            v-if="csvData && csvData.tableData && csvData.tableData.length > 2000 && chartType === 'scatter'" 
            class="performance-tip">
            <div class="tip-icon">⚡</div>
            <div class="tip-text">
              检测到大数据集 ({{ csvData.tableData.length.toLocaleString() }} 个点)，已自动启用性能优化采样
            </div>
          </div>
          
          <DataVisualizationChart
            :selected-column="selectedColumn"
            :chart-type="chartType as 'histogram' | 'scatter' | 'cdf' | 'heatmap'"
            :loading="chartLoading"
            :csv-data="csvData" />
        </div>

        <!-- 统计信息 -->
        <div v-if="selectedColumn" class="stats-summary">
          <div class="summary-card">
            <div class="summary-label">均值</div>
            <div class="summary-value blue">{{ getColumnStats(selectedColumn).mean }}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">标准差</div>
            <div class="summary-value green">{{ getColumnStats(selectedColumn).std }}</div>
          </div>
          <div class="summary-card with-timestamp">
            <div class="summary-label">最小值</div>
            <div class="summary-value purple">{{ getColumnStats(selectedColumn).min }}</div>
            <div v-if="getColumnStats(selectedColumn).minTimestamp" class="summary-timestamp">
              {{ formatTimestamp(getColumnStats(selectedColumn).minTimestamp) }}
            </div>
          </div>
          <div class="summary-card with-timestamp">
            <div class="summary-label">最大值</div>
            <div class="summary-value orange">{{ getColumnStats(selectedColumn).max }}</div>
            <div v-if="getColumnStats(selectedColumn).maxTimestamp" class="summary-timestamp">
              {{ formatTimestamp(getColumnStats(selectedColumn).maxTimestamp) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 相关性分析区域 -->
      <div class="correlation-section">
        <div class="section-header">
          <div class="section-title">🔗 变量相关性分析</div>
          <button
            class="action-btn calculate-btn"
            @click="calculateCorrelation"
            :disabled="correlationLoading"
            title="重新计算">
            <el-icon class="action-icon" :class="{ spinning: correlationLoading }">
              <Refresh />
            </el-icon>
            <span v-if="!correlationLoading">计算</span>
          </button>
        </div>

        <div v-if="correlationLoading" class="correlation-loading">
          <el-icon class="loading-spinner">
            <Loading />
          </el-icon>
          <span class="loading-text">计算相关性中...</span>
        </div>

        <div v-else-if="correlationMatrix.length > 0" class="correlation-matrix">
          <div class="matrix-container">
            <table class="correlation-table">
              <thead>
                <tr>
                  <th class="matrix-header"></th>
                  <th v-for="header in correlationHeaders" :key="header" class="matrix-header">
                    {{ header }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIndex) in correlationMatrix" :key="rowIndex">
                  <td class="row-label">{{ row.name }}</td>
                  <td v-for="(value, colIndex) in row.values" :key="colIndex" class="correlation-cell">
                    <div :class="['correlation-value', getCorrelationColor(value)]">
                      {{ value.toFixed(2) }}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else class="correlation-empty">
          <div class="empty-icon">🔗</div>
          <div class="empty-text">相关性分析功能</div>
          <div class="empty-subtitle">请前往"相关性分析"页面进行详细的变量关系分析</div>
          <button class="empty-action" @click="calculateCorrelation">了解更多</button>
        </div>
      </div>
    </template>

    <!-- 无数据状态 -->
    <div v-else class="no-data-container">
      <div class="no-data-content">
        <div class="no-data-icon">📂</div>
        <div class="no-data-text">未选择数据集</div>
        <div class="no-data-subtitle">请从左侧选择一个数据集</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 主容器样式 */
.overview-container {
  padding: 20px;
  space-y: 20px;
  background: #f8fafc;
  min-height: 100vh;
}

.overview-container > * + * {
  margin-top: 20px;
}

/* 加载状态 */
.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  border: 1px solid rgba(229, 231, 235, 0.4);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-spinner {
  font-size: 24px;
  color: #10b981;
  animation: spin 1s linear infinite;
}

.loading-text {
  color: #6b7280;
  font-size: 14px;
}

/* 顶部section布局 */
.overview-top-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* 通用section样式 */
.stats-section,
.columns-section {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  padding: 12px;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.visualization-section,
.correlation-section {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  padding: 20px;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.stats-section::before,
.columns-section::before,
.visualization-section::before,
.correlation-section::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(to bottom, #10b981, #059669);
  border-radius: 0 2px 2px 0;
}

.stats-section:hover,
.columns-section:hover,
.visualization-section:hover,
.correlation-section:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

/* Section header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Action buttons */
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  font-weight: 500;
}

.action-btn:hover {
  background: rgba(16, 185, 129, 0.2);
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.action-icon {
  font-size: 14px;
}

.action-icon.spinning {
  animation: spin 1s linear infinite;
}

/* 统计卡片 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.3);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  border-radius: 0 2px 2px 0;
  transition: transform 0.2s ease;
  transform: scaleY(0);
}

.stat-card.primary::before {
  background: linear-gradient(to bottom, #3b82f6, #1d4ed8);
}

.stat-card.secondary::before {
  background: linear-gradient(to bottom, #8b5cf6, #7c3aed);
}

.stat-card.warning::before {
  background: linear-gradient(to bottom, #f59e0b, #d97706);
}

.stat-card.success::before {
  background: linear-gradient(to bottom, #10b981, #059669);
}

.stat-card:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(229, 231, 235, 0.6);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-card:hover::before {
  transform: scaleY(1);
}

.stat-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: white;
  flex-shrink: 0;
}

.stat-card.primary .stat-icon {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
}

.stat-card.secondary .stat-icon {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
}

.stat-card.warning .stat-icon {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.stat-card.success .stat-icon {
  background: linear-gradient(135deg, #10b981, #059669);
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 1px;
}

.stat-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
}

/* 数据质量指示器 */
.quality-indicator {
  background: rgba(248, 250, 252, 0.8);
  border-radius: 10px;
  padding: 10px;
  border: 1px solid rgba(229, 231, 235, 0.3);
}

.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.quality-label {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.quality-value {
  font-size: 14px;
  font-weight: 700;
}

.quality-bar {
  height: 6px;
  background: rgba(229, 231, 235, 0.5);
  border-radius: 3px;
  overflow: hidden;
}

.quality-fill {
  height: 100%;
  border-radius: 3px;
  transition: all 0.3s ease;
}

.quality-fill.excellent {
  background: linear-gradient(90deg, #10b981, #059669);
}

.quality-fill.good {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.quality-fill.poor {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

/* 列信息列表 */
.search-container {
  width: 200px;
}

.column-search {
  border-radius: 8px;
}

.search-icon {
  color: #9ca3af;
}

.columns-list {
  max-height: 200px;
  overflow-y: auto;
  padding-right: 8px;
}

.column-item {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.3);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 4px;
  transition: all 0.2s ease;
  position: relative;
}

.column-item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  border-radius: 0 2px 2px 0;
  transition: transform 0.2s ease;
  transform: scaleY(0);
}

.column-item:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(229, 231, 235, 0.6);
  transform: translateX(4px);
}

.column-item:hover::before {
  transform: scaleY(1);
  background: #6b7280;
}

.column-item.has-missing::before {
  background: #f59e0b;
}

.column-item.many-missing::before {
  background: #ef4444;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.column-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.column-status.status-complete {
  background: #10b981;
}

.column-status.status-warning {
  background: #f59e0b;
}

.column-status.status-error {
  background: #ef4444;
}

.column-name {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  flex: 1;
}

.missing-badge {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.column-meta {
  font-size: 10px;
  color: #9ca3af;
  margin-left: 12px;
}

/* 可视化控件 */
.viz-controls {
  display: flex;
  gap: 12px;
}

.column-select,
.chart-select {
  min-width: 120px;
}

.chart-container {
  height: 500px;
  background: rgba(248, 250, 252, 0.8);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.3);
  margin-bottom: 16px;
  overflow: hidden;
  position: relative;
}

/* 性能优化提示 */
.performance-tip {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #059669;
  backdrop-filter: blur(4px);
  transition: all 0.3s ease;
}

.performance-tip:hover {
  background: rgba(16, 185, 129, 0.15);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.tip-icon {
  font-size: 14px;
  animation: flash 2s infinite;
}

.tip-text {
  font-weight: 500;
  line-height: 1.2;
}

@keyframes flash {
  0%, 50% { opacity: 1; }
  25%, 75% { opacity: 0.7; }
}

/* 统计摘要 */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.summary-card {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.3);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  transition: all 0.2s ease;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.summary-card.with-timestamp {
  min-height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.summary-label {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 4px;
  font-weight: 500;
}

.summary-value {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 2px;
}

.summary-value.blue {
  color: #3b82f6;
}
.summary-value.green {
  color: #10b981;
}
.summary-value.purple {
  color: #8b5cf6;
}
.summary-value.orange {
  color: #f59e0b;
}

.summary-timestamp {
  font-size: 9px;
  color: #9ca3af;
  font-weight: 400;
  line-height: 1.2;
  margin-top: 2px;
}

/* 相关性分析 */
.correlation-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 150px;
  color: #6b7280;
}

.correlation-matrix {
  background: rgba(248, 250, 252, 0.8);
  border-radius: 12px;
  padding: 16px;
  overflow-x: auto;
}

.matrix-container {
  min-width: 100%;
}

.correlation-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 4px;
}

.matrix-header {
  text-align: center;
  padding: 8px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  min-width: 60px;
}

.row-label {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-align: left;
}

.correlation-cell {
  padding: 2px;
}

.correlation-value {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  transition: all 0.2s ease;
}

.correlation-value:hover {
  transform: scale(1.1);
}

.correlation-value.strong {
  background: #10b981;
  color: white;
}

.correlation-value.moderate {
  background: #34d399;
  color: white;
}

.correlation-value.weak {
  background: #a7f3d0;
  color: #065f46;
}

.correlation-value.none {
  background: #f3f4f6;
  color: #6b7280;
}

/* 空状态 */
.empty-columns {
  text-align: center;
  padding: 20px 10px;
  color: #9ca3af;
}

.correlation-empty,
.no-data-container {
  text-align: center;
  padding: 40px 20px;
  color: #9ca3af;
}

.empty-icon,
.no-data-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text,
.no-data-text {
  font-size: 14px;
  margin-bottom: 8px;
  color: #6b7280;
}

.empty-subtitle,
.no-data-subtitle {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 12px;
}

.empty-action {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 12px;
}

.empty-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* 滚动条样式 */
.columns-list::-webkit-scrollbar {
  width: 6px;
}

.columns-list::-webkit-scrollbar-track {
  background: rgba(229, 231, 235, 0.3);
  border-radius: 3px;
}

.columns-list::-webkit-scrollbar-thumb {
  background: rgba(107, 114, 128, 0.4);
  border-radius: 3px;
}

.columns-list::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 114, 128, 0.6);
}

/* 动画 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .overview-top-section {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

@media (max-width: 768px) {
  .overview-container {
    padding: 12px;
  }

  .overview-top-section {
    gap: 16px;
  }

  .stats-cards {
    grid-template-columns: 1fr;
  }

  .viz-controls {
    flex-direction: column;
    gap: 8px;
  }

  .stats-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .search-container {
    width: 100%;
  }
}
</style>
