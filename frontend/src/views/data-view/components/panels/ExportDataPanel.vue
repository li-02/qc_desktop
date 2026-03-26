<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { Download, Refresh, Setting, Document, Select, InfoFilled } from "@element-plus/icons-vue";
import type { DatasetInfo } from "@shared/types/projectInterface";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type { ExportFormat, ExportDelimiter, ExportColumnInfo } from "@shared/types/exportData";

// ==================== Props & Emits ====================
interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

// ==================== Store ====================
const datasetStore = useDatasetStore();
const currentVersion = computed(() => datasetStore.currentVersion);
const versions = computed(() => datasetStore.versions);

// ==================== 导出预览状态 ====================
const previewLoading = ref(false);
const previewColumns = ref<ExportColumnInfo[]>([]);
const previewData = ref<Record<string, string>[]>([]);
const previewTotalRows = ref(0);
const isExporting = ref(false);

// ==================== 列选择 ====================
const selectedColumnNames = ref<string[]>([]);
const columnSearchQuery = ref("");

const filteredColumns = computed(() => {
  if (!columnSearchQuery.value) return previewColumns.value;
  const q = columnSearchQuery.value.toLowerCase();
  return previewColumns.value.filter(c => c.name.toLowerCase().includes(q));
});

const isAllSelected = computed(() => {
  return (
    filteredColumns.value.length > 0 && filteredColumns.value.every(c => selectedColumnNames.value.includes(c.name))
  );
});

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // 取消全选（只取消当前过滤出的列）
    const filtered = new Set(filteredColumns.value.map(c => c.name));
    selectedColumnNames.value = selectedColumnNames.value.filter(n => !filtered.has(n));
  } else {
    // 全选当前过滤出的列
    const current = new Set(selectedColumnNames.value);
    for (const col of filteredColumns.value) {
      current.add(col.name);
    }
    selectedColumnNames.value = Array.from(current);
  }
};

const toggleColumn = (colName: string) => {
  const idx = selectedColumnNames.value.indexOf(colName);
  if (idx >= 0) {
    selectedColumnNames.value.splice(idx, 1);
  } else {
    selectedColumnNames.value.push(colName);
  }
};

// ==================== 导出选项 ====================
const exportFormat = ref<ExportFormat>("csv");
const exportDelimiter = ref<ExportDelimiter>(",");
const missingValueOutput = ref("NA");
const includeHeader = ref(true);

const formatOptions = [
  { value: "csv", label: "CSV (UTF-8)", desc: "标准 CSV 文件" },
  { value: "csv_bom", label: "CSV (UTF-8 BOM)", desc: "兼容 Excel 的 CSV" },
  { value: "xlsx", label: "Excel (.xlsx)", desc: "Microsoft Excel 格式" },
];

const isXlsxFormat = computed(() => exportFormat.value === "xlsx");

const delimiterOptions = [
  { value: ",", label: "逗号 (,)" },
  { value: ";", label: "分号 (;)" },
  { value: "\t", label: "制表符 (Tab)" },
];

const missingValueOptions = [
  { value: "NA", label: "NA" },
  { value: "", label: "空值" },
  { value: "-9999", label: "-9999" },
  { value: "NaN", label: "NaN" },
];

// ==================== 版本显示 ====================
const getStageLabel = (stageType: string) => {
  switch (stageType) {
    case "RAW":
      return "原始数据";
    case "FILTERED":
      return "已过滤";
    case "QC":
      return "质量控制";
    default:
      return stageType;
  }
};

const getStageTagType = (stageType: string) => {
  switch (stageType) {
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

const formatDateTime = (timestamp: number | string) => {
  if (!timestamp) return "-";
  try {
    const d = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
    return d.toLocaleString();
  } catch {
    return String(timestamp);
  }
};

// ==================== 加载预览 ====================
const loadPreview = async () => {
  if (!currentVersion.value?.id) {
    previewColumns.value = [];
    previewData.value = [];
    previewTotalRows.value = 0;
    return;
  }

  try {
    previewLoading.value = true;
    const result = await window.electronAPI.invoke(API_ROUTES.EXPORT.GET_PREVIEW, {
      versionId: currentVersion.value.id,
      maxRows: 10,
    });

    if (result.success && result.data) {
      previewColumns.value = result.data.columns;
      previewData.value = result.data.sampleData;
      previewTotalRows.value = result.data.totalRows;

      // 默认全选所有列
      selectedColumnNames.value = result.data.columns.map((c: ExportColumnInfo) => c.name);
    } else {
      ElMessage.error(result.error || "加载预览失败");
    }
  } catch (error: any) {
    console.error("加载导出预览失败:", error);
    ElMessage.error(error.message || "加载预览失败");
  } finally {
    previewLoading.value = false;
  }
};

// ==================== 导出执行 ====================
const canExport = computed(() => {
  return currentVersion.value && selectedColumnNames.value.length > 0 && !isExporting.value && !previewLoading.value;
});

const generateFileName = () => {
  const dsName = props.datasetInfo?.name || "dataset";
  const versionRemark = currentVersion.value?.remark || currentVersion.value?.stageType || "export";
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const ext = exportFormat.value === "xlsx" ? "xlsx" : "csv";
  return `${dsName}_${versionRemark}_${dateStr}.${ext}`;
};

const executeExport = async () => {
  if (!canExport.value || !currentVersion.value) return;

  try {
    isExporting.value = true;

    const result = await window.electronAPI.invoke(API_ROUTES.EXPORT.EXECUTE, {
      versionId: currentVersion.value.id,
      selectedColumns: selectedColumnNames.value,
      format: exportFormat.value,
      delimiter: exportDelimiter.value,
      missingValueOutput: missingValueOutput.value,
      includeHeader: includeHeader.value,
      defaultFileName: generateFileName(),
    });

    if (result.success) {
      if (result.data?.canceled) {
        // 用户取消
        return;
      }
      ElMessage.success(`导出成功，共 ${result.data?.rowCount || 0} 行数据`);
    } else if (result.data?.canceled) {
      // 用户取消
    } else {
      ElMessage.error(result.error || "导出失败");
    }
  } catch (error: any) {
    console.error("导出失败:", error);
    ElMessage.error(error.message || "导出失败");
  } finally {
    isExporting.value = false;
  }
};

// ==================== 生命周期 ====================
watch(
  currentVersion,
  newVer => {
    if (newVer) {
      loadPreview();
    } else {
      previewColumns.value = [];
      previewData.value = [];
      previewTotalRows.value = 0;
      selectedColumnNames.value = [];
    }
  },
  { immediate: true }
);

watch(
  () => props.datasetInfo,
  () => {
    if (currentVersion.value) {
      loadPreview();
    }
  }
);
</script>

<template>
  <div class="export-data-panel">
    <!-- 侧边栏：版本选择与信息 -->
    <div class="panel-sidebar">
      <!-- 数据集信息 -->
      <div class="sidebar-header">
        <div class="dataset-info-section" v-if="datasetInfo">
          <div class="dataset-name">{{ datasetInfo.name }}</div>
          <div class="dataset-meta">
            <span class="meta-item">{{ datasetInfo.originalFile?.columns?.length || 0 }} 列</span>
            <span class="meta-sep">·</span>
            <span class="meta-item">{{ datasetInfo.originalFile?.rows || 0 }} 行</span>
          </div>
        </div>
        <div v-else class="dataset-info-section">
          <span class="no-data-hint">未选择数据集</span>
        </div>
      </div>

      <!-- 版本列表 -->
      <div class="version-section">
        <div class="sidebar-subtitle"><span>数据版本</span></div>
        <div class="version-list">
          <div v-if="versions.length === 0" class="version-empty">
            <span>暂无版本记录</span>
          </div>
          <div
            v-for="ver in versions"
            :key="ver.id"
            class="version-item"
            :class="{ 'version-item--active': currentVersion?.id === ver.id }"
            @click="datasetStore.setCurrentVersion(ver.id)">
            <div class="version-item-header">
              <el-tag size="small" :type="getStageTagType(ver.stageType)" effect="light" round>
                {{ getStageLabel(ver.stageType) }}
              </el-tag>
              <span class="version-id">v{{ ver.id }}</span>
            </div>
            <div class="version-item-remark" v-if="ver.remark">
              {{ ver.remark }}
            </div>
            <div class="version-item-time">
              {{ formatDateTime(ver.createdAt) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 当前版本统计摘要 -->
      <div class="stats-summary" v-if="currentVersion && previewTotalRows > 0">
        <div class="sidebar-subtitle"><span>导出摘要</span></div>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">总行数</span>
            <span class="stat-value">{{ previewTotalRows.toLocaleString() }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">总列数</span>
            <span class="stat-value">{{ previewColumns.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">已选列</span>
            <span class="stat-value stat-value--accent">{{ selectedColumnNames.length }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="panel-main">
      <!-- 头部操作栏 -->
      <div class="view-header">
        <div class="header-title">
          <h2>导出数据</h2>
          <span class="header-desc">选择数据版本和列，配置导出选项后导出为 CSV 或 Excel 文件</span>
        </div>
        <div class="header-actions">
          <el-button class="action-btn" plain @click="loadPreview" :loading="previewLoading">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
          <el-button
            class="action-btn primary-gradient-btn"
            type="primary"
            :loading="isExporting"
            :disabled="!canExport"
            @click="executeExport">
            <el-icon><Download /></el-icon> 导出文件
          </el-button>
        </div>
      </div>

      <!-- 无数据提示 -->
      <div v-if="!currentVersion" class="empty-state-main">
        <div class="empty-icon">📤</div>
        <h3>请先选择数据版本</h3>
        <p>选择左侧的数据版本以配置导出选项</p>
      </div>

      <!-- 主配置区域 -->
      <div v-else class="scrollable-content">
        <el-scrollbar>
          <!-- 加载中 -->
          <div v-if="previewLoading" class="loading-overlay">
            <el-icon class="is-loading" :size="32" color="#10b981"><Refresh /></el-icon>
            <span>正在加载数据预览...</span>
          </div>

          <template v-else>
            <!-- 导出选项区域 -->
            <div class="config-block">
              <div class="config-block-header">
                <h3>
                  <el-icon class="block-icon"><Setting /></el-icon> 导出选项
                </h3>
              </div>
              <div class="options-grid">
                <!-- 文件格式 -->
                <div class="option-item">
                  <label class="option-label">文件格式</label>
                  <el-select v-model="exportFormat" class="option-select">
                    <el-option v-for="opt in formatOptions" :key="opt.value" :label="opt.label" :value="opt.value">
                      <div class="option-desc-item">
                        <span>{{ opt.label }}</span>
                        <span class="option-hint">{{ opt.desc }}</span>
                      </div>
                    </el-option>
                  </el-select>
                </div>

                <!-- 分隔符 -->
                <div class="option-item" v-if="!isXlsxFormat">
                  <label class="option-label">分隔符</label>
                  <el-select v-model="exportDelimiter" class="option-select">
                    <el-option v-for="opt in delimiterOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                  </el-select>
                </div>

                <!-- 缺失值表示 -->
                <div class="option-item">
                  <label class="option-label">缺失值表示</label>
                  <el-select v-model="missingValueOutput" class="option-select" allow-create filterable>
                    <el-option
                      v-for="opt in missingValueOptions"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value" />
                  </el-select>
                </div>

                <!-- 包含表头 -->
                <div class="option-item">
                  <label class="option-label">包含表头</label>
                  <el-switch v-model="includeHeader" active-text="是" inactive-text="否" />
                </div>
              </div>
            </div>

            <!-- 列选择区域 -->
            <div class="config-block">
              <div class="config-block-header">
                <h3>
                  <el-icon class="block-icon"><Select /></el-icon> 选择导出列
                </h3>
                <div class="column-select-actions">
                  <span class="column-count">{{ selectedColumnNames.length }} / {{ previewColumns.length }} 列</span>
                  <el-button size="small" text type="primary" @click="toggleSelectAll">
                    {{ isAllSelected ? "取消全选" : "全选" }}
                  </el-button>
                </div>
              </div>

              <!-- 搜索框 -->
              <div class="column-search">
                <el-input
                  v-model="columnSearchQuery"
                  placeholder="搜索列名..."
                  clearable
                  size="small"
                  class="column-search-input" />
              </div>

              <!-- 列列表 -->
              <div class="column-list">
                <div
                  v-for="col in filteredColumns"
                  :key="col.name"
                  class="column-item"
                  :class="{ 'column-item--selected': selectedColumnNames.includes(col.name) }"
                  @click="toggleColumn(col.name)">
                  <el-checkbox
                    :model-value="selectedColumnNames.includes(col.name)"
                    @change="toggleColumn(col.name)"
                    @click.stop />
                  <div class="column-info">
                    <span class="column-name">{{ col.name }}</span>
                    <span class="column-meta">
                      <span v-if="col.missingCount > 0" class="missing-badge"> {{ col.missingCount }} 缺失 </span>
                      <span class="sample-values" v-if="col.sampleValues.length">
                        {{ col.sampleValues.slice(0, 3).join(", ") }}
                      </span>
                    </span>
                  </div>
                </div>
                <div v-if="filteredColumns.length === 0" class="column-empty">
                  <span>无匹配的列</span>
                </div>
              </div>
            </div>

            <!-- 数据预览 -->
            <div class="config-block">
              <div class="config-block-header">
                <h3>
                  <el-icon class="block-icon"><Document /></el-icon> 数据预览
                </h3>
                <span class="preview-hint">显示前 {{ previewData.length }} 行</span>
              </div>
              <div class="preview-table-wrapper">
                <table class="preview-table" v-if="previewData.length > 0">
                  <thead>
                    <tr>
                      <th class="row-num-col">#</th>
                      <th v-for="col in selectedColumnNames" :key="col" class="data-col">
                        {{ col }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in previewData" :key="idx">
                      <td class="row-num-col">{{ idx + 1 }}</td>
                      <td
                        v-for="col in selectedColumnNames"
                        :key="col"
                        class="data-col"
                        :class="{ 'missing-cell': !row[col] || row[col] === 'NaN' || row[col] === 'nan' }">
                        {{ row[col] || missingValueOutput }}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="preview-empty">
                  <el-icon><InfoFilled /></el-icon>
                  <span>暂无预览数据</span>
                </div>
              </div>
            </div>
          </template>
        </el-scrollbar>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 主布局 ==================== */
.export-data-panel {
  display: flex;
  height: 100%;
  width: 100%;
  background: #f8fafc;
  overflow: hidden;
  padding: 8px;
  gap: 8px;
  box-sizing: border-box;
}

/* ==================== 侧边栏 ==================== */
.panel-sidebar {
  width: 280px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.dataset-info-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dataset-name {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dataset-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}

.meta-sep {
  color: #cbd5e1;
}

.no-data-hint {
  font-size: 13px;
  color: #9ca3af;
}

.sidebar-subtitle {
  padding: 16px 20px 8px;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ==================== 版本列表 ==================== */
.version-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.version-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.version-empty {
  text-align: center;
  padding: 40px 16px;
  color: #9ca3af;
  font-size: 14px;
}

.version-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  background: #f8fafc;
}

.version-item:hover {
  background: #ffffff;
  border-color: #e2e8f0;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.version-item--active {
  background: #f8fffb;
  border-color: #86efac;
}

.version-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.version-id {
  font-size: 11px;
  color: #9ca3af;
  font-family: "Courier New", monospace;
}

.version-item-remark {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-item-time {
  font-size: 11px;
  color: #9ca3af;
}

/* ==================== 统计摘要 ==================== */
.stats-summary {
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 16px 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  color: #9ca3af;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  font-family: "Courier New", monospace;
}

.stat-value--accent {
  color: #10b981;
}

/* ==================== 主内容区 ==================== */
.panel-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 20px;
}

/* ==================== 头部 ==================== */
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.header-title h2 {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-desc {
  font-size: 13px;
  color: #64748b;
  margin-top: 6px;
  display: block;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-btn {
  border-radius: 8px;
  font-size: 13px;
}

.primary-gradient-btn {
  background: #10b981 !important;
  border: none !important;
  height: 36px;
  min-width: 110px;
  font-weight: 600;
}

.primary-gradient-btn:hover {
  background: #059669 !important;
}

.primary-gradient-btn:disabled {
  background: #9ca3af !important;
  color: #ffffff !important;
  cursor: not-allowed;
}

/* ==================== 空状态 ==================== */
.empty-state-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  color: #64748b;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.empty-state-main h3 {
  font-size: 18px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.empty-state-main p {
  font-size: 14px;
  color: #9ca3af;
  margin: 0;
}

/* ==================== 滚动内容区 ==================== */
.scrollable-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.scrollable-content :deep(.el-scrollbar) {
  height: 100%;
}

.scrollable-content :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 12px;
  color: #64748b;
  font-size: 14px;
}

/* ==================== 配置块 ==================== */
.config-block {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.config-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.config-block-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.block-icon {
  color: #10b981;
  font-size: 16px;
}

/* ==================== 导出选项 ==================== */
.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .options-grid {
    grid-template-columns: 1fr;
  }
}

.option-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.option-select {
  width: 100%;
}

.option-desc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.option-hint {
  font-size: 11px;
  color: #9ca3af;
}

/* ==================== 列选择 ==================== */
.column-select-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.column-count {
  font-size: 12px;
  color: #64748b;
  font-family: "Courier New", monospace;
}

.column-search {
  margin-bottom: 10px;
}

.column-search-input {
  width: 100%;
}

.column-list {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.column-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: all 0.15s ease;
}

.column-item:last-child {
  border-bottom: none;
}

.column-item:hover {
  background: #f8fafc;
}

.column-item--selected {
  background: #f0fdf4;
}

.column-item--selected:hover {
  background: #ecfdf5;
}

.column-info {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.column-name {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  font-family: "Courier New", monospace;
}

.column-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #9ca3af;
}

.missing-badge {
  background: #fef2f2;
  color: #dc2626;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid #fecaca;
}

.sample-values {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.column-empty {
  text-align: center;
  padding: 24px;
  color: #9ca3af;
  font-size: 13px;
}

/* ==================== 数据预览表格 ==================== */
.preview-hint {
  font-size: 12px;
  color: #9ca3af;
}

.preview-table-wrapper {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.preview-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.preview-table th {
  background: #f8fafc;
  color: #374151;
  font-weight: 600;
  padding: 8px 12px;
  text-align: left;
  border-bottom: 2px solid #e2e8f0;
  font-family: "Courier New", monospace;
  font-size: 12px;
}

.preview-table td {
  padding: 6px 12px;
  border-bottom: 1px solid #f1f5f9;
  color: #374151;
  font-family: "Courier New", monospace;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-table tr:hover td {
  background: #f8fafc;
}

.row-num-col {
  width: 40px;
  text-align: center;
  color: #9ca3af !important;
  font-size: 11px !important;
}

.missing-cell {
  color: #dc2626 !important;
  font-style: italic;
}

.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: #9ca3af;
  font-size: 13px;
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
  background: rgba(156, 163, 175, 0.3);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.5);
}

/* ==================== 响应式 ==================== */
@media (max-width: 768px) {
  .panel-sidebar {
    width: 240px;
  }
}
</style>
