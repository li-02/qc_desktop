<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { formatLocalWithTZ } from "@/utils/timeUtils";
import { translateRemark, getStageLabel, getVersionDisplayName } from "@/utils/versionUtils";
import { ElMessage } from "element-plus";
import { Loader2, RefreshCw, Search, Link, List, Info, Play } from "lucide-vue-next";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import { useGapFillingStore } from "@/stores/useGapFillingStore";
import DataVisualizationChart from "../charts/DataVisualizationChart.vue";
import VersionManager from "../VersionManager.vue";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type { OutlierResult } from "@shared/types/database";
import MissingAnalysisView from "../gapfilling/MissingAnalysisView.vue";
import MissingMarkersEditor from "../common/MissingMarkersEditor.vue";

const datasetStore = useDatasetStore();
const outlierStore = useOutlierDetectionStore();
const gapFillingStore = useGapFillingStore();
const datasetInfo = computed(() => datasetStore.currentDataset);

// UI 状态
const showVersionDrawer = ref(false);
const refreshing = ref(false);
const columnSearchText = ref("");
const selectedColumn = ref("");
const chartType = ref<"scatter">("scatter");
const chartLoading = ref(false);
const csvData = ref<any>(null);
const columnStatistics = ref<any>(null);

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

// Methods
const handleVersionSwitch = async (versionId: number) => {
  if (versionId === datasetStore.currentVersion?.id) return;
  await datasetStore.setCurrentVersion(versionId);
  showVersionDrawer.value = false;
  ElMessage.success("已切换数据版本");
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

// ==================== 缺失分析 ====================
// 自动检测缺失值 (后台静默执行)
const autoDetectMissingValues = async () => {
  const currentVer = datasetStore.currentVersion;
  if (!datasetInfo.value?.id || !currentVer?.id) return;

  const datasetId = parseInt(datasetInfo.value.id);
  const versionId = currentVer.id;

  if (gapFillingStore.restoreFromHistory(datasetId, versionId)) return;

  try {
    gapFillingStore.setTargetVersion(datasetId, versionId);
    await gapFillingStore.loadVersionMissingStats(datasetId, versionId);
  } catch (error: any) {
    console.error("[自动检测] 缺失值检测失败:", error);
  }
};

// 手动触发缺失值检测
const detectMissingValues = async () => {
  const currentVer = datasetStore.currentVersion;
  if (!datasetInfo.value?.id || !currentVer?.id) {
    ElMessage.warning("请先选择数据集和版本");
    return;
  }

  try {
    gapFillingStore.setTargetVersion(parseInt(datasetInfo.value.id), currentVer.id);
    const stats = await gapFillingStore.loadVersionMissingStats(parseInt(datasetInfo.value.id), currentVer.id);
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

// 监听版本变化，自动检测缺失值
watch(
  () => datasetStore.currentVersion?.id,
  newId => {
    if (newId && datasetInfo.value?.id) {
      gapFillingStore.clearStats();
      autoDetectMissingValues();
    }
  }
);

// 组件挂载时，如果已有选中列则加载数据
onMounted(() => {
  if (selectedColumn.value && datasetInfo.value) {
    loadCsvData();
  }
  if (datasetInfo.value?.id) {
    loadOutlierResults();
    autoDetectMissingValues();
  }
});
</script>

<template>
  <div class="overview-container">
    <!-- 加载状态 -->
    <div v-if="datasetStore.loading" class="loading-container">
      <div class="loading-content">
        <Loader2 :size="32" class="loading-spinner" />
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
                <Link :size="16" class="action-icon" />
              </button>
              <button class="action-btn refresh-btn" @click="$emit('refresh')" :disabled="refreshing" title="刷新数据">
                <RefreshCw :size="16" class="action-icon" :class="{ spinning: refreshing }" />
              </button>
            </div>
          </div>

          <div class="stats-cards">
            <div class="stat-card primary">
              <div class="stat-icon datasets">📊</div>
              <div class="stat-info">
                <div class="stat-value">{{ columnNumber.toLocaleString() }}</div>
                <div class="stat-label">数据列</div>
              </div>
            </div>

            <div class="stat-card secondary">
              <div class="stat-icon rows">📝</div>
              <div class="stat-info">
                <div class="stat-value">{{ rowNumber.toLocaleString() }}</div>
                <div class="stat-label">数据行</div>
              </div>
            </div>

            <div class="stat-card warning">
              <div class="stat-icon missing">⚠️</div>
              <div class="stat-info">
                <div class="stat-value">{{ missingValueCount.toLocaleString() }}</div>
                <div class="stat-label">缺失值</div>
              </div>
            </div>

            <div class="stat-card" :class="totalOutlierCount > 0 ? 'danger' : 'info'">
              <div class="stat-icon outlier">🔴</div>
              <div class="stat-info">
                <div class="stat-value">{{ latestOutlierResult ? totalOutlierCount.toLocaleString() : "-" }}</div>
                <div class="stat-label">异常值</div>
                <div v-if="!latestOutlierResult" class="stat-sub not-detected">还未检测</div>
                <div v-else-if="outlierRate > 0" class="stat-sub">{{ outlierRate.toFixed(2) }}%</div>
              </div>
            </div>
          </div>

          <!-- 版本历史时间线 -->
          <div class="version-timeline-block">
            <div class="version-timeline-title">版本历史</div>
            <div class="version-timeline">
              <div
                v-for="(v, idx) in [...versions].reverse()"
                :key="v.id"
                class="vt-node"
                :class="{ 'vt-node--current': v.id === currentVersion }">
                <div class="vt-line-wrap">
                  <div class="vt-dot" :class="'vt-dot--' + (v.stageType || 'RAW').toLowerCase()"></div>
                  <div v-if="idx < versions.length - 1" class="vt-connector"></div>
                </div>
                <div class="vt-content">
                  <div class="vt-label">
                    <span class="vt-name">{{ getVersionDisplayName(v.remark, v.stageType) }}</span>
                    <span class="vt-id">#{{ v.id }}</span>
                    <span v-if="v.id === currentVersion" class="vt-current-badge">当前</span>
                  </div>
                  <div class="vt-date">{{ new Date(v.createdAt).toLocaleDateString("zh-CN") }}</div>
                </div>
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
                  <Search :size="14" class="search-icon" />
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
                <div v-if="missingCount > 0" class="missing-info-right">
                  <span class="missing-count-right">{{ missingCount }}</span>
                  <span class="missing-rate-right">{{
                    rowNumber > 0 ? ((missingCount / rowNumber) * 100).toFixed(1) + "%" : "-"
                  }}</span>
                </div>
              </div>
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

      <!-- 缺失分析区域 -->
      <div class="missing-analysis-section">
        <div class="section-header">
          <div class="section-title">🔍 缺失分析</div>
          <div class="missing-controls">
            <el-button
              type="primary"
              :loading="gapFillingStore.loading"
              @click="detectMissingValues"
              size="small"
              plain>
              <RefreshCw :size="14" />
              重新检测
            </el-button>
          </div>
        </div>

        <!-- 缺失值标记 -->
        <MissingMarkersEditor />

        <!-- 快速统计条 -->
        <div v-if="gapFillingStore.hasStats" class="missing-stats-strip">
          <div class="missing-stat-chip">
            <div class="missing-stat-chip-icon icon-blue">
              <List :size="16" />
            </div>
            <div class="missing-stat-chip-info">
              <span class="missing-stat-chip-value">{{
                gapFillingStore.missingStats?.totalRows.toLocaleString()
              }}</span>
              <span class="missing-stat-chip-label">总行数</span>
            </div>
          </div>
          <div class="missing-stat-divider"></div>
          <div class="missing-stat-chip">
            <div class="missing-stat-chip-icon icon-purple">
              <Info :size="16" />
            </div>
            <div class="missing-stat-chip-info">
              <span class="missing-stat-chip-value">{{ gapFillingStore.missingStats?.totalColumns }}</span>
              <span class="missing-stat-chip-label">总列数</span>
            </div>
          </div>
          <div class="missing-stat-divider"></div>
          <div class="missing-stat-chip missing-stat-chip--alert">
            <div class="missing-stat-chip-icon icon-red">
              <Play :size="16" />
            </div>
            <div class="missing-stat-chip-info">
              <span class="missing-stat-chip-value">{{ gapFillingStore.totalMissingCount.toLocaleString() }}</span>
              <span class="missing-stat-chip-label">缺失单元格</span>
            </div>
          </div>
        </div>

        <!-- 等待检测 / 加载状态 -->
        <div v-if="!gapFillingStore.hasStats" class="missing-empty-state">
          <Search :size="18" class="missing-empty-icon" :class="{ 'is-loading': gapFillingStore.loading }" />
          <span class="missing-empty-text">
            {{ gapFillingStore.loading ? "正在检测缺失值..." : "暂无缺失分析数据，请点击「重新检测」" }}
          </span>
        </div>

        <!-- 检测完成后的内容 -->
        <template v-if="gapFillingStore.hasStats">
          <MissingAnalysisView />
        </template>
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
  background: var(--c-bg-muted);
  min-height: 100%;
  border-radius: var(--radius-panel);
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
  background: var(--c-bg-surface);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-spinner {
  font-size: var(--text-display-sm);
  color: var(--c-brand);
  animation: spin 1s linear infinite;
}

.loading-text {
  color: #4b5563;
  font-size: var(--text-lg);
  font-weight: 500;
}

/* 顶部section布局 */
.overview-top-section {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
  align-items: stretch;
}

/* 通用section样式 */
.stats-section,
.columns-section,
.visualization-section,
.missing-analysis-section {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-bg-muted);
  border-radius: var(--radius-2xl);
  padding: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: visible;
  z-index: 1;
  box-shadow:
    0 1px 3px 0 rgba(0, 0, 0, 0.02),
    0 1px 2px 0 rgba(0, 0, 0, 0.01);
}

.stats-section:hover,
.columns-section:hover,
.visualization-section:hover,
.missing-analysis-section:hover {
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.05),
    0 4px 6px -2px rgba(0, 0, 0, 0.025);
  border-color: var(--c-border);
  z-index: 10;
}

/* Section header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--c-bg-muted);
}

.section-title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--c-text-primary);
  display: flex;
  align-items: center;
  letter-spacing: -0.01em;
}

.section-title::before {
  content: "";
  display: block;
  width: 4px;
  height: 18px;
  background: linear-gradient(to bottom, var(--c-brand), #34d399);
  border-radius: var(--radius-sm);
  margin-right: 10px;
}

/* Action buttons */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  color: var(--c-text-secondary);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: var(--text-sm);
  font-weight: 600;
  height: 36px;
}

.action-btn:hover {
  background: #f0fdf4;
  border-color: #86efac;
  color: var(--c-brand-active);
  transform: translateY(-1px);
}

.action-btn:active {
  transform: translateY(0);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Primary Button (e.g. Calculate) */
.action-btn.calculate-btn {
  background: linear-gradient(135deg, var(--c-brand), var(--c-brand-active));
  color: var(--c-text-inverse);
  border: none;
  box-shadow: 0 4px 6px -1px var(--c-brand-border);
}

.action-btn.calculate-btn:hover {
  box-shadow: 0 6px 8px -1px var(--c-brand-border);
  transform: translateY(-1px);
}

.action-btn.calculate-btn:disabled {
  background: var(--c-text-muted);
  cursor: not-allowed;
  color: var(--c-text-inverse);
  box-shadow: none;
}

.action-icon {
  font-size: var(--text-md);
}

.action-icon.spinning {
  animation: spin 1s linear infinite;
}

/* 版本历史时间线 */
.version-timeline-block {
  margin-top: 14px;
  padding: 12px 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid var(--c-bg-muted);
  border-radius: var(--radius-overlay);
}

.version-timeline-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-secondary);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.version-timeline {
  display: flex;
  flex-direction: column;
}

.vt-node {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.vt-line-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 12px;
}

.vt-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  border: 2px solid var(--c-border);
  background: var(--c-bg-surface);
  flex-shrink: 0;
  margin-top: 3px;
  transition: all 0.2s ease;
}

.vt-dot--raw {
  border-color: var(--c-info);
  background: #eff6ff;
}
.vt-dot--filtered {
  border-color: var(--c-warning);
  background: #fffbeb;
}
.vt-dot--qc {
  border-color: var(--c-brand);
  background: #ecfdf5;
}

.vt-node--current .vt-dot {
  width: 12px;
  height: 12px;
  margin-top: 2px;
}

.vt-node--current .vt-dot--raw {
  background: var(--c-info);
  border-color: var(--c-info);
}
.vt-node--current .vt-dot--filtered {
  background: var(--c-warning);
  border-color: var(--c-warning);
}
.vt-node--current .vt-dot--qc {
  background: var(--c-brand);
  border-color: var(--c-brand);
}

.vt-connector {
  width: 2px;
  flex: 1;
  min-height: 10px;
  background: var(--c-border);
  margin: 3px 0;
}

.vt-content {
  padding-bottom: 10px;
  flex: 1;
  min-width: 0;
}

.vt-node:last-child .vt-content {
  padding-bottom: 0;
}

.vt-label {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.vt-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
}

.vt-node--current .vt-name {
  color: var(--c-text-primary);
}

.vt-id {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  font-family: var(--font-mono);
}

.vt-current-badge {
  font-size: var(--text-2xs);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-control);
  background: #d1fae5;
  color: var(--c-brand-active);
}

.vt-date {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  margin-top: 1px;
}

/* 统计卡片 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 0;
}

.stat-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-bg-muted);
  border-radius: var(--radius-panel);
  padding: 12px 14px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  text-align: left;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.stat-card::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px; /* Vertical strip */
  background: transparent;
  transition: background 0.3s ease;
}

.stat-card:hover {
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-panel);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xl);
  color: var(--c-text-inverse);
  flex-shrink: 0;
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.1);
}

.stat-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
}

.stat-value {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--c-text-primary);
  letter-spacing: -0.02em;
  line-height: 1.2;
  font-family: var(--font-sans);
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  font-weight: 500;
}

/* Data Quality Section */
.data-quality-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--c-border);
}

.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.quality-title {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--c-text-base);
  display: flex;
  align-items: center;
  gap: 8px;
}

.quality-title::before {
  content: "✨";
  font-size: var(--text-md);
}

.quality-badge {
  font-size: var(--text-sm);
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-3xl);
  text-transform: uppercase;
}

.quality-badge.excellent {
  background: #ecfdf5;
  color: var(--c-brand-active);
  border: 1px solid #d1fae5;
}

.quality-badge.good {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fef3c7;
}

.quality-badge.poor {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fee2e2;
}

.quality-meter-container {
  display: flex;
  align-items: center;
  gap: 14px;
}

.quality-meter {
  width: 60px;
  height: 60px;
  position: relative;
  flex-shrink: 0;
}

.circular-chart {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  max-height: 100%;
}

.circle-bg {
  fill: none;
  stroke: var(--c-bg-muted);
  stroke-width: 2.8;
}

.circle {
  fill: none;
  stroke-width: 2.8;
  stroke-linecap: round;
  animation: progress 1s ease-out forwards;
}

@keyframes progress {
  0% {
    stroke-dasharray: 0 100;
  }
}

.circle.excellent {
  stroke: var(--c-brand);
}
.circle.good {
  stroke: var(--c-warning);
}
.circle.poor {
  stroke: var(--c-danger);
}

.percentage {
  fill: var(--c-text-base);
  font-family: var(--font-sans);
  font-weight: bold;
  font-size: var(--text-3xs);
  text-anchor: middle;
}

.quality-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-label {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  font-weight: 500;
}

.detail-bar-bg {
  height: 6px;
  background: var(--c-bg-muted);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.detail-bar-fill {
  height: 100%;
  border-radius: var(--radius-xs);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.detail-bar-fill.excellent {
  background: var(--c-brand);
}
.detail-bar-fill.good {
  background: var(--c-warning);
}
.detail-bar-fill.poor {
  background: var(--c-danger);
}

.detail-desc {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  line-height: 1.4;
}

.stat-card::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: transparent;
  transition: background 0.3s ease;
}

.stat-card:hover {
  border-color: #cbd5e1;
  transform: translateY(-4px);
  box-shadow:
    0 12px 20px -5px rgba(0, 0, 0, 0.08),
    0 6px 8px -3px rgba(0, 0, 0, 0.04);
}

/* duplicate stat-icon rule removed */

.stat-card.primary .stat-icon {
  background: linear-gradient(135deg, #60a5fa, #2563eb);
}
.stat-card.primary:hover::after {
  background: var(--c-info);
}

.stat-card.secondary .stat-icon {
  background: linear-gradient(135deg, #a78bfa, var(--color-purple-600));
}
.stat-card.secondary:hover::after {
  background: #8b5cf6;
}

.stat-card.warning .stat-icon {
  background: linear-gradient(135deg, #fbbf24, #d97706);
}
.stat-card.warning:hover::after {
  background: var(--c-warning);
}

.stat-card.success .stat-icon {
  background: linear-gradient(135deg, #34d399, var(--c-brand-active));
}

.stat-card.danger .stat-icon {
  background: linear-gradient(135deg, #f87171, #dc2626);
}
.stat-card.danger:hover::after {
  background: var(--c-danger);
}

.stat-card.info .stat-icon {
  background: linear-gradient(135deg, var(--c-text-muted), #4b5563);
}
.stat-card.info:hover::after {
  background: var(--c-text-secondary);
}

.stat-sub {
  font-size: var(--text-xs);
  color: var(--c-danger);
  margin-top: 4px;
  font-weight: 600;
  background: rgba(239, 68, 68, 0.1);
  padding: 2px 8px;
  border-radius: var(--radius-control);
}

.stat-sub.not-detected {
  color: var(--c-text-muted);
  background: #f3f4f6;
  font-weight: 500;
}

/* 数据质量指示器 */
.quality-indicator {
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
  padding: 20px;
  border: 1px solid var(--c-bg-muted);
}

.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.quality-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
}

.quality-value {
  font-size: var(--text-lg);
  font-weight: 700;
}

.quality-bar {
  height: 8px;
  background: var(--c-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.quality-fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.quality-fill.excellent {
  background: linear-gradient(90deg, var(--c-brand), var(--c-brand-active));
}

.quality-fill.good {
  background: linear-gradient(90deg, var(--c-warning), #d97706);
}

.quality-fill.poor {
  background: linear-gradient(90deg, var(--c-danger), #dc2626);
}

/* 列信息列表 */
.search-container {
  width: 240px;
}

.column-search :deep(.el-input__wrapper) {
  background-color: var(--c-bg-muted);
  border-radius: var(--radius-control);
  box-shadow: none;
  border: 1px solid var(--c-border);
  transition: all 0.2s ease;
}

.column-search :deep(.el-input__wrapper:hover) {
  border-color: #cbd5e1;
  background-color: var(--c-bg-surface);
}

.column-search :deep(.el-input__wrapper.is-focus) {
  border-color: var(--c-brand);
  background-color: var(--c-bg-surface);
  box-shadow: 0 0 0 2px var(--c-brand-soft);
}

.columns-list {
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.column-item {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-bg-muted);
  border-radius: var(--radius-panel);
  padding: 7px 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.column-item:hover {
  border-color: #cbd5e1;
  background: var(--c-bg-muted);
  transform: translateX(2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.column-item.has-missing {
  border-left: 3px solid var(--c-warning);
}

.column-item.many-missing {
  border-left: 3px solid var(--c-danger);
}

.column-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.column-status {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.column-status.status-complete {
  background: var(--c-brand);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
}

.column-status.status-warning {
  background: var(--c-warning);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}

.column-status.status-error {
  background: var(--c-danger);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
}

.column-name {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--c-text-base);
  font-family: var(--font-sans);
  flex: 1;
}

.missing-info-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.missing-count-right {
  background: #fef2f2;
  color: var(--c-danger);
  font-size: var(--text-xs);
  padding: 2px 8px;
  border-radius: var(--radius-control);
  font-weight: 700;
  border: 1px solid #fee2e2;
  font-family: var(--font-mono);
}

.missing-rate-right {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  font-weight: 500;
  font-family: var(--font-mono);
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
  background: var(--c-bg-surface);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border);
  margin-bottom: 20px;
  padding: 16px;
  position: relative;
}

/* 统计摘要 - 新样式 */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 20px;
}

.summary-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-bg-muted);
  border-radius: var(--radius-panel);
  padding: 20px;
  text-align: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.summary-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--c-border);
  transition: background 0.3s ease;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.05),
    0 4px 6px -2px rgba(0, 0, 0, 0.025);
  border-color: #cbd5e1;
}

.summary-card:hover::before {
  background: var(--c-info); /* Default hover color */
}

.summary-label {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin-bottom: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-value {
  font-size: var(--text-5xl);
  font-weight: 800;
  color: var(--c-text-primary);
  letter-spacing: -0.02em;
  font-family: var(--font-mono);
  line-height: 1.1;
}

.summary-value.blue {
  color: #2563eb;
}
.summary-value.green {
  color: var(--c-brand-active);
}
.summary-value.purple {
  color: var(--color-purple-600);
}
.summary-value.orange {
  color: #d97706;
}

.summary-timestamp {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  margin-top: 8px;
  background: var(--c-bg-muted);
  padding: 4px 8px;
  border-radius: var(--radius-panel);
  display: inline-block;
  font-weight: 500;
}

/* 空状态 */
.empty-columns,
.no-data-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
  color: var(--c-text-muted);
}

.empty-icon,
.no-data-icon {
  font-size: var(--text-display-lg);
  margin-bottom: 16px;
}

.empty-text,
.no-data-text {
  font-size: var(--text-3xl);
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--c-text-primary);
}

.empty-subtitle,
.no-data-subtitle {
  font-size: var(--text-lg);
  color: var(--c-text-secondary);
  margin-bottom: 20px;
  max-width: 300px;
  line-height: 1.5;
}

.empty-action {
  background: var(--c-brand);
  color: var(--c-text-inverse);
  border: none;
  border-radius: var(--radius-control);
  padding: 10px 20px;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
  min-width: 110px;
}

.empty-action:hover {
  background: var(--c-brand-active);
}

/* ==================== 缺失分析区域 ==================== */
.missing-analysis-section {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  padding: 20px;
  transition: all 0.2s ease;
  position: relative;
  overflow: visible;
  z-index: 1;
}

.missing-analysis-section:hover {
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  z-index: 10;
}

.missing-controls {
  display: flex;
  gap: 8px;
}

/* 快速统计条 */
.missing-stats-strip {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 16px;
  padding: 16px 20px;
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-bg-muted);
  margin-bottom: 24px;
}

.missing-stat-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: center;
}

.missing-stat-chip-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xl);
  color: var(--c-text-inverse);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.missing-stat-chip-icon.icon-blue {
  background: linear-gradient(135deg, #60a5fa, #2563eb);
}

.missing-stat-chip-icon.icon-purple {
  background: linear-gradient(135deg, #a78bfa, var(--color-purple-600));
}

.missing-stat-chip-icon.icon-red {
  background: linear-gradient(135deg, #f87171, #dc2626);
}

.missing-stat-chip-info {
  display: flex;
  flex-direction: column;
}

.missing-stat-chip-value {
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--c-text-primary);
  line-height: 1.1;
  font-family: var(--font-mono);
}

.missing-stat-chip-label {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.missing-stat-divider {
  width: 1px;
  height: 40px;
  background: var(--c-border);
  margin: 0 8px;
}

.missing-stat-chip--alert .missing-stat-chip-value {
  color: var(--c-danger);
}

/* 空状态 */
.missing-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--c-text-muted);
}

.missing-empty-icon {
  font-size: var(--text-4xl);
  color: #d1d5db;
}

.missing-empty-icon.is-loading {
  animation: spin 1s linear infinite;
  color: var(--c-brand);
}

.missing-empty-text {
  font-size: var(--text-md);
  color: var(--c-text-secondary);
}

/* 详细缺失报告表格 */
.missing-detail-table-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-bg-muted);
  border-radius: var(--radius-panel);
  padding: 20px;
  margin-top: 24px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.missing-detail-table-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  border-color: var(--c-border);
}

.missing-table-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--c-text-primary);
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
}

.missing-table-title::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 16px;
  background: var(--c-info);
  border-radius: var(--radius-xs);
  margin-right: 8px;
}

.missing-table-container {
  overflow-x: auto;
  max-height: 450px;
  overflow-y: auto;
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-bg-muted);
}

.missing-column-stats-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}

.missing-column-stats-table thead th {
  background: var(--c-bg-muted);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--c-text-secondary);
  border-bottom: 1px solid var(--c-border);
  position: sticky;
  top: 0;
  z-index: 1;
  text-transform: uppercase;
  font-size: var(--text-xs);
  letter-spacing: 0.05em;
}

.missing-column-stats-table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--c-bg-muted);
  color: var(--c-text-base);
  transition: background 0.2s ease;
}

.missing-column-stats-table tbody tr:last-child td {
  border-bottom: none;
}

.missing-column-stats-table tbody tr:hover td {
  background: var(--c-bg-muted);
}

.missing-column-stats-table tbody tr.has-missing {
  background: rgba(239, 68, 68, 0.02);
}

.missing-column-stats-table tbody tr.has-missing:hover {
  background: rgba(239, 68, 68, 0.05);
}

.column-name-text {
  font-weight: 500;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.missing-count-val {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--c-text-secondary);
}

.missing-count-val.has-missing {
  color: var(--c-danger);
}

.missing-rate-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.missing-rate-text {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  min-width: 45px;
  font-family: var(--font-mono);
}

.missing-rate-bar-bg {
  flex: 1;
  height: 6px;
  background: var(--c-border);
  border-radius: var(--radius-xs);
  overflow: hidden;
  min-width: 60px;
}

.missing-rate-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #f87171, var(--c-danger));
  border-radius: var(--radius-xs);
  transition: width 0.3s ease;
}

.total-count {
  font-family: var(--font-mono);
  color: var(--c-text-secondary);
}

.sample-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sample-item {
  font-size: var(--text-xs);
  display: flex;
  gap: 4px;
}

.sample-row {
  color: var(--c-text-muted);
  white-space: nowrap;
}

.sample-value {
  font-family: var(--font-mono);
  color: var(--c-text-base);
}

.sample-value.missing-value {
  color: var(--c-danger);
  font-style: italic;
}

.more-samples {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.no-samples {
  font-size: var(--text-xs);
  color: #d1d5db;
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
  border-radius: var(--radius-xs);
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
@media (max-width: 700px) {
  .overview-top-section {
    grid-template-columns: 1fr;
    gap: 16px;
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
