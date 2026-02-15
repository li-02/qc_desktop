<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { formatLocalWithTZ } from "@/utils/timeUtils";
import { translateRemark, getStageLabel } from "@/utils/versionUtils";
import { ElMessage } from "element-plus";
import { Loading, Refresh, Search, Connection } from "@element-plus/icons-vue";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import DataVisualizationChart from "../charts/DataVisualizationChart.vue";
import VersionManager from "../VersionManager.vue";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type { OutlierResult } from "@shared/types/database";

const datasetStore = useDatasetStore();
const outlierStore = useOutlierDetectionStore();
const datasetInfo = computed(() => datasetStore.currentDataset);

// UI 状态
const showVersionDrawer = ref(false);
const refreshing = ref(false);
const columnSearchText = ref("");
const selectedColumn = ref("");
const chartType = ref<"scatter" | "heatmap">("scatter");
const chartLoading = ref(false);
const csvData = ref<any>(null);
const columnStatistics = ref<any>(null);
const correlationLoading = ref(false);
const correlationHeaders = ref<string[]>([]);
const correlationMatrix = ref<{ name: string; values: number[] }[]>([]);

// 异常检测结果
const outlierResults = ref<OutlierResult[]>([]);
const latestOutlierResult = computed(() => {
  const completed = outlierResults.value.filter(r => r.status === "COMPLETED");
  return completed.length > 0 ? completed[0] : null;
});
const totalOutlierCount = computed(() => latestOutlierResult.value?.outlier_count || 0);
const outlierRate = computed(() => {
  if (!latestOutlierResult.value) return 0;
  const rate = (latestOutlierResult.value as any).outlier_rate;
  return typeof rate === "number" ? rate : 0;
});
const versions = computed(() => datasetStore.versions);
const currentVersion = computed({
  get: () => datasetStore.currentVersion?.id,
  set: val => {
    if (val) datasetStore.setCurrentVersion(val);
  },
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
    if (values.length > 0 && typeof values[0] === "number") {
      return statsObj;
    }
  }
  return {};
});

// 时间列名称（从数据库中获取）
const timeColumnName = computed(() => datasetInfo.value?.timeColumn || "");

// 数值列过滤 - 排除时间列
const numericColumns = computed(() => {
  const timeCol = timeColumnName.value;
  const filterTimeCol = (names: string[]) =>
    names.filter(name => name !== timeCol).map(name => ({ name, type: "numeric" }));

  const statsObj = currentVersionStats.value?.columnStats;
  if (statsObj) {
    if (statsObj.columnStatistics) {
      return filterTimeCol(Object.keys(statsObj.columnStatistics));
    }
    if (statsObj.columnMissingStatus) {
      return filterTimeCol(Object.keys(statsObj.columnMissingStatus));
    }
  }
  return filterTimeCol(datasetInfo.value?.originalFile?.columns || []);
});

const dataQualityClass = computed(() => {
  const p = dataQualityPercentage.value;
  if (p >= 95) return "excellent";
  if (p >= 85) return "good";
  return "poor";
});

// Methods
const handleVersionSwitch = async (versionId: number) => {
  if (versionId === datasetStore.currentVersion?.id) return;
  await datasetStore.setCurrentVersion(versionId);
  showVersionDrawer.value = false;
  ElMessage.success("已切换数据版本");
};

const getCorrelationColor = (value: number) => {
  const absValue = Math.abs(value);
  if (absValue >= 0.7) return "strong";
  if (absValue >= 0.4) return "moderate";
  if (absValue >= 0.2) return "weak";
  return "none";
};

const getColumnStats = (columnName: string) => {
  // 1. 优先使用后端预计算的统计信息
  const statsObj = currentVersionStats.value?.columnStats;
  if (statsObj && statsObj.columnStatistics && statsObj.columnStatistics[columnName]) {
    const s = statsObj.columnStatistics[columnName];
    return {
      mean: typeof s.mean === "number" ? s.mean.toFixed(2) : s.mean,
      std: typeof s.std === "number" ? s.std.toFixed(2) : s.std,
      min: typeof s.min === "number" ? s.min.toFixed(2) : s.min,
      max: typeof s.max === "number" ? s.max.toFixed(2) : s.max,
      minTimestamp: "", // 后端暂未计算时间戳
      maxTimestamp: "",
    };
  }

  // 2. 如果有从后端返回的实时统计信息（CSV读取），使用它
  if (columnStatistics.value && selectedColumn.value === columnName) {
    return {
      mean: columnStatistics.value.mean.toFixed(2),
      std: columnStatistics.value.std.toFixed(2),
      min: columnStatistics.value.min.toFixed(2),
      max: columnStatistics.value.max.toFixed(2),
      minTimestamp: columnStatistics.value.minTimestamp || "",
      maxTimestamp: columnStatistics.value.maxTimestamp || "",
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

const formatTimestamp = (timestamp: string | number) => {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return String(timestamp);
    }
    return formatLocalWithTZ(date.getTime());
  } catch (error) {
    console.error("时间格式化错误:", error);
    return String(timestamp);
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
    // 从数据集信息中获取文件路径 (优先使用当前版本的路径)
    const filePath = datasetStore.currentVersion?.filePath || datasetInfo.value?.originalFile?.filePath;
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

// 监听数据集变化，清空当前数据并默认选中第一列
watch(
  () => datasetInfo.value,
  () => {
    csvData.value = null;
    columnStatistics.value = null;
    selectedColumn.value = "";
    // 延迟等待 numericColumns 计算完成后默认选中第一列
    nextTick(() => {
      if (numericColumns.value.length > 0 && !selectedColumn.value) {
        selectedColumn.value = numericColumns.value[0].name;
      }
    });
  }
);

// 监听 numericColumns 变化，确保默认选中第一列
watch(
  numericColumns,
  cols => {
    if (cols.length > 0 && !selectedColumn.value) {
      selectedColumn.value = cols[0].name;
    }
  },
  { immediate: true }
);

// 加载异常检测结果
const loadOutlierResults = async () => {
  if (!datasetInfo.value?.id) return;
  const results = await outlierStore.getDetectionResults(String(datasetInfo.value.id));
  outlierResults.value = results || [];
};

// 监听数据集变化，加载异常结果
watch(
  () => datasetInfo.value?.id,
  newId => {
    if (newId) {
      loadOutlierResults();
    } else {
      outlierResults.value = [];
    }
  },
  { immediate: true }
);

// 组件挂载时，如果已有选中列则加载数据
onMounted(() => {
  if (selectedColumn.value && datasetInfo.value) {
    loadCsvData();
  }
  if (datasetInfo.value?.id) {
    loadOutlierResults();
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
            <div class="header-controls" style="display: flex; align-items: center">
              <el-select
                v-model="currentVersion"
                placeholder="选择版本"
                size="small"
                style="width: 200px; margin-right: 10px">
                <el-option
                  v-for="v in versions"
                  :key="v.id"
                  :label="`${translateRemark(v.remark) || getStageLabel(v.stageType)} #${v.id}`"
                  :value="v.id" />
              </el-select>
              <button class="action-btn" @click="showVersionDrawer = true" title="版本谱系" style="margin-right: 8px">
                <el-icon class="action-icon"><Connection /></el-icon>
              </button>
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

            <div class="stat-card" :class="totalOutlierCount > 0 ? 'danger' : 'info'">
              <div class="stat-icon outlier">🔴</div>
              <div class="stat-content">
                <div class="stat-value">{{ totalOutlierCount.toLocaleString() }}</div>
                <div class="stat-label">异常值</div>
                <div v-if="outlierRate > 0" class="stat-sub">{{ outlierRate.toFixed(2) }}%</div>
              </div>
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
            <el-select v-model="selectedColumn" placeholder="选择指标列" size="small" class="column-select" filterable>
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
          <!-- 性能优化提示
          <div 
            v-if="csvData && csvData.tableData && csvData.tableData.length > 2000 && chartType === 'scatter'" 
            class="performance-tip">
            <div class="tip-icon">⚡</div>
            <div class="tip-text">
              检测到大数据集 ({{ csvData.tableData.length.toLocaleString() }} 个点)，已自动启用性能优化采样
            </div>
          </div> -->

          <DataVisualizationChart
            :selected-column="selectedColumn"
            :chart-type="chartType"
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

      <!-- Version Manager Drawer -->
      <el-drawer v-model="showVersionDrawer" title="数据版本管理" size="450px" destroy-on-close append-to-body>
        <VersionManager
          v-if="datasetInfo"
          :dataset-id="datasetInfo.id"
          @switch-version="handleVersionSwitch"
          @close="showVersionDrawer = false" />
      </el-drawer>
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
  padding: 24px;
  background: #f8fafc;
  min-height: 100%;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 加载状态 */
.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-spinner {
  font-size: 32px;
  color: #10b981;
  animation: spin 1s linear infinite;
}

.loading-text {
  color: #4b5563;
  font-size: 15px;
  font-weight: 500;
}

/* 顶部section布局 */
.overview-top-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

/* 通用section样式 */
.stats-section,
.columns-section,
.visualization-section,
.correlation-section {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 20px;
  transition: all 0.2s ease;
  position: relative;
  overflow: visible;
  z-index: 1;
}

.stats-section:hover,
.columns-section:hover,
.visualization-section:hover,
.correlation-section:hover {
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  z-index: 10;
}

/* Section header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
}

.section-title::before {
  content: "";
  display: block;
  width: 4px;
  height: 16px;
  background: #10b981;
  border-radius: 2px;
  margin-right: 8px;
}

/* Action buttons */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  font-weight: 600;
  height: 36px;
}

.action-btn:hover {
  background: #ecfdf5;
  border-color: #86efac;
  color: #059669;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary Button (e.g. Calculate) */
.action-btn.calculate-btn {
  background: #10b981;
  color: white;
  border: none;
}

.action-btn.calculate-btn:hover {
  background: #059669;
}

.action-btn.calculate-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  color: white;
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
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.stat-card:hover {
  border-color: #86efac;
  background: #f8fffb;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
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

.stat-card.danger .stat-icon {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.stat-card.info .stat-icon {
  background: linear-gradient(135deg, #6b7280, #4b5563);
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
  margin-top: 2px;
}

.stat-sub {
  font-size: 11px;
  color: #ef4444;
  margin-top: 2px;
  font-weight: 600;
}

/* 数据质量指示器 */
.quality-indicator {
  background: #f8fafc;
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #e2e8f0;
}

.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.quality-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.quality-value {
  font-size: 15px;
  font-weight: 700;
}

.quality-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.quality-fill {
  height: 100%;
  border-radius: 4px;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
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

.column-search :deep(.el-input__wrapper) {
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: none;
  border: 1px solid #e2e8f0;
}

.column-search :deep(.el-input__wrapper:hover) {
  border-color: #cbd5e1;
}

.column-search :deep(.el-input__wrapper.is-focus) {
  border-color: #10b981;
}

.columns-list {
  max-height: 280px;
  overflow-y: auto;
  padding-right: 8px;
}

.column-item {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 6px;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.column-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.column-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.column-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.column-status.status-complete {
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.column-status.status-warning {
  background: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.column-status.status-error {
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
}

.column-name {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
}

.missing-badge {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.column-meta {
  font-size: 11px;
  color: #9ca3af;
}

/* 可视化控件 */
.viz-controls {
  display: flex;
  gap: 12px;
}

.column-select {
  width: 220px;
}

.chart-select {
  width: 180px;
}

.chart-container {
  height: 500px;
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  margin-bottom: 20px;
  padding: 16px;
  position: relative;
}

/* 统计摘要 - 新样式 */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
}

.summary-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  transition: all 0.2s ease;
}

.summary-card:hover {
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  border-color: #86efac;
  background: #f8fffb;
}

.summary-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
  font-weight: 500;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.02em;
  font-family: "Courier New", monospace;
}

.summary-timestamp {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 4px;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
}

/* 相关性分析 */
.correlation-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 200px;
  color: #64748b;
}

.correlation-matrix {
  background: #ffffff;
  border-radius: 10px;
  padding: 20px;
  overflow-x: auto;
  border: 1px solid #e2e8f0;
}

.correlation-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 6px;
}

.matrix-header {
  text-align: center;
  padding: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.row-label {
  padding: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-align: right;
  white-space: nowrap;
}

.correlation-value {
  padding: 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  transition: all 0.2s ease;
  cursor: default;
}

.correlation-value:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
  position: relative;
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
  background: #ecfdf5;
  color: #065f46;
}

.correlation-value.none {
  background: #f8fafc;
  color: #9ca3af;
}

/* 空状态 */
.empty-columns,
.correlation-empty,
.no-data-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
  color: #9ca3af;
}

.empty-icon,
.no-data-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text,
.no-data-text {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #1e293b;
}

.empty-subtitle,
.no-data-subtitle {
  font-size: 15px;
  color: #64748b;
  margin-bottom: 20px;
  max-width: 300px;
  line-height: 1.5;
}

.empty-action {
  background: #10b981;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
  min-width: 110px;
}

.empty-action:hover {
  background: #059669;
}

/* 滚动条美化 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(156, 163, 175, 0.3);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.5);
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

  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .overview-container {
    padding: 16px;
  }

  .stats-cards {
    grid-template-columns: 1fr;
  }

  .viz-controls {
    flex-direction: column;
    gap: 12px;
  }

  .stats-summary {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
