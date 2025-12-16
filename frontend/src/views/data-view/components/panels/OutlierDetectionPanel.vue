<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Loading, Refresh, Search, Setting, Check, Close, VideoPlay, Delete, View } from "@element-plus/icons-vue";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import type { ColumnSetting, OutlierResult, OutlierDetail } from "@shared/types/database";
import OutlierChart from "../charts/OutlierChart.vue";

const datasetStore = useDatasetStore();
const outlierStore = useOutlierDetectionStore();

const datasetInfo = computed(() => datasetStore.currentDataset);

// 检测结果状态
const detectionResults = ref<OutlierResult[]>([]);
const lastDetectionSummary = ref<{
  totalRows: number;
  columnsChecked: number;
  outlierCount: number;
  outlierRate: number;
  columnResults: Array<{
    columnName: string;
    outlierCount: number;
    minThreshold: number | null;
    maxThreshold: number | null;
  }>;
} | null>(null);

// 详情展示状态
const currentResultId = ref<number | null>(null);
const resultDetails = ref<OutlierDetail[]>([]);
const detailLoading = ref(false);
const detailPage = ref(1);
const detailPageSize = ref(100);

const executing = ref(false);

// 本地状态
const searchText = ref("");
const selectedColumns = ref<number[]>([]);
const editingColumn = ref<number | null>(null);
const editForm = ref<{
  min_threshold: number | undefined;
  max_threshold: number | undefined;
  physical_min: number | undefined;
  physical_max: number | undefined;
  unit: string;
}>({
  min_threshold: undefined,
  max_threshold: undefined,
  physical_min: undefined,
  physical_max: undefined,
  unit: ""
});

// 计算属性
const filteredColumns = computed(() => {
  const timeColumn = datasetInfo.value?.timeColumn;
  
  if (!searchText.value) {
    // 默认不显示时间列（根据数据集解析时识别的时间列名称）
    if (timeColumn) {
      return outlierStore.columnThresholds.filter(col => col.column_name !== timeColumn);
    }
    return outlierStore.columnThresholds;
  }
  const search = searchText.value.toLowerCase();
  return outlierStore.columnThresholds.filter(col => 
    col.column_name.toLowerCase().includes(search)
  );
});

const templateOptions = computed(() => {
  return Object.keys(outlierStore.thresholdTemplates).map(key => ({
    label: key === 'standard' ? '标准模板' : key === 'strict' ? '严格模板' : key,
    value: key
  }));
});

// 方法
const loadData = async () => {
  if (!datasetInfo.value?.id) return;
  
  await Promise.all([
    outlierStore.loadColumnThresholds(datasetInfo.value.id),
    outlierStore.loadDetectionMethods(),
    outlierStore.loadThresholdTemplates(),
    loadDetectionResults()
  ]);
};

const loadDetectionResults = async () => {
  if (!datasetInfo.value?.id) return;
  const results = await outlierStore.getDetectionResults(String(datasetInfo.value.id));
  detectionResults.value = results || [];
};

const executeDetection = async () => {
  if (!datasetInfo.value?.id) return;
  
  // 检查是否有配置阈值的列
  const configuredColumns = outlierStore.columnThresholds.filter(
    c => c.min_threshold !== null || c.max_threshold !== null
  );
  
  if (configuredColumns.length === 0) {
    ElMessage.warning("请先为至少一个列配置阈值");
    return;
  }
  
  try {
    executing.value = true;
    // 使用版本 ID，如果没有则使用 0
    const versionId = datasetInfo.value.id; // TODO: 获取实际版本 ID
    
    const result = await outlierStore.executeThresholdDetection(
      String(datasetInfo.value.id),
      String(versionId)
    );
    
    if (result) {
      lastDetectionSummary.value = result.summary;
      currentResultId.value = result.resultId;
      detailPage.value = 1; // 重置页码
      await Promise.all([
        loadDetectionResults(),
        loadResultDetails()
      ]);
    }
  } finally {
    executing.value = false;
  }
};

const loadResultDetails = async () => {
  if (!currentResultId.value) return;
  
  detailLoading.value = true;
  try {
    const res = await outlierStore.getDetectionResultDetails(
      String(currentResultId.value),
      undefined,
      detailPageSize.value,
      (detailPage.value - 1) * detailPageSize.value
    );
    resultDetails.value = res.details;
  } catch (error) {
    console.error("加载详情失败:", error);
    ElMessage.error("加载详情失败");
  } finally {
    detailLoading.value = false;
  }
};

const viewResult = async (result: OutlierResult) => {
  currentResultId.value = result.id;
  // 重构 summary 对象以适配显示
  let summary = null;
  if (result.outlier_count !== undefined) {
      // 尝试解析 detection_params 来获取列信息
      let columnsChecked = 0;
      let columnResults: any[] = [];
      try {
          if (result.detection_params) {
              const params = JSON.parse(result.detection_params);
              if (params.columns && Array.isArray(params.columns)) {
                  columnsChecked = params.columns.length;
                  
                  if (params.columnResults) {
                      columnResults = params.columnResults;
                  }
              }
          }
      } catch (e) {
          console.error("解析参数失败", e);
      }

      // 关键修正：如果 columnResults 为空但有异常值，或者我们要确保数据准确性，尝试从后端获取实时统计
      // 这种情况常见于历史记录或者参数解析不完整的旧数据
      if (columnResults.length === 0 && (result.outlier_count > 0 || columnsChecked > 0)) {
          const stats = await outlierStore.getOutlierResultStats(String(result.id));
          if (stats && stats.length > 0) {
              columnResults = stats;
              // 如果之前没解析出列数，现在可以用统计到的列数修正
              if (columnsChecked === 0) {
                  columnsChecked = stats.length;
              }
          } else if (columnResults.length === 0 && columnsChecked > 0) {
              // 如果统计返回也没数据，且明确有检查列，可能是真的没有异常值
              // 构造一个全 0 的结果
               try {
                  const params = JSON.parse(result.detection_params || '{}');
                  if (params.columns) {
                      columnResults = params.columns.map((c: string) => ({
                          columnName: c,
                          outlierCount: 0 
                      }));
                  }
              } catch (e) {}
          }
      }

      summary = {
          totalRows: result.total_rows ?? 0,
          columnsChecked: columnsChecked,
          outlierCount: result.outlier_count,
          outlierRate: result.outlier_rate ?? 0,
          columnResults: columnResults
      };
      
      lastDetectionSummary.value = summary;
  }
  
  // 滚动到详情区域
  const detailsEl = document.querySelector('.analysis-section');
  if (detailsEl) {
      detailsEl.scrollIntoView({ behavior: 'smooth' });
  }

  detailPage.value = 1;
  await loadResultDetails();
};


const deleteResult = async (resultId: number) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这条检测结果吗？',
      '删除确认',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    );
    
    const success = await outlierStore.deleteDetectionResult(String(resultId));
    if (success) {
      await loadDetectionResults();
      if (lastDetectionSummary.value) {
        lastDetectionSummary.value = null;
      }
    }
  } catch {
    // 用户取消
  }
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getStatusType = (status: string) => {
  switch (status) {
    case 'COMPLETED': return 'success';
    case 'RUNNING': return 'warning';
    case 'FAILED': return 'danger';
    default: return 'info';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'COMPLETED': return '已完成';
    case 'RUNNING': return '运行中';
    case 'FAILED': return '失败';
    case 'PENDING': return '待执行';
    case 'APPLIED': return '已应用';
    case 'REVERTED': return '已撤销';
    default: return status;
  }
};

const startEditing = (column: ColumnSetting) => {
  editingColumn.value = column.id;
  editForm.value = {
    min_threshold: column.min_threshold ?? undefined,
    max_threshold: column.max_threshold ?? undefined,
    physical_min: column.physical_min ?? undefined,
    physical_max: column.physical_max ?? undefined,
    unit: column.unit || ""
  };
};

const cancelEditing = () => {
  editingColumn.value = null;
  editForm.value = {
    min_threshold: undefined,
    max_threshold: undefined,
    physical_min: undefined,
    physical_max: undefined,
    unit: ""
  };
};

const saveColumnThreshold = async () => {
  if (!editingColumn.value) return;
  
  const success = await outlierStore.updateColumnThreshold(editingColumn.value, {
    min_threshold: editForm.value.min_threshold,
    max_threshold: editForm.value.max_threshold,
    physical_min: editForm.value.physical_min,
    physical_max: editForm.value.physical_max,
    unit: editForm.value.unit || undefined
  });
  
  if (success) {
    cancelEditing();
  }
};

const applyTemplate = async (templateName: string) => {
  if (!datasetInfo.value?.id) return;
  
  try {
    await ElMessageBox.confirm(
      `确定要应用"${templateName === 'standard' ? '标准' : '严格'}"模板吗？这将覆盖匹配列的现有阈值配置。`,
      '应用模板',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    );
    
    await outlierStore.applyThresholdTemplate(datasetInfo.value.id, templateName);
  } catch {
    // 用户取消
  }
};

const batchClearThresholds = async () => {
  if (selectedColumns.value.length === 0) {
    ElMessage.warning("请先选择要清除的列");
    return;
  }
  
  try {
    await ElMessageBox.confirm(
      `确定要清除选中的 ${selectedColumns.value.length} 列的阈值配置吗？`,
      '清除阈值',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    );
    
    const updates = selectedColumns.value.map(id => ({
      id,
      min_threshold: undefined,
      max_threshold: undefined
    }));
    
    await outlierStore.batchUpdateThresholds(updates as any);
    selectedColumns.value = [];
  } catch {
    // 用户取消
  }
};

const toggleSelectAll = () => {
  if (selectedColumns.value.length === filteredColumns.value.length) {
    selectedColumns.value = [];
  } else {
    selectedColumns.value = filteredColumns.value.map(c => c.id);
  }
};

const getThresholdStatus = (column: ColumnSetting) => {
  if (column.min_threshold !== null || column.max_threshold !== null) {
    return 'configured';
  }
  return 'not-configured';
};

const getThresholdStatusText = (column: ColumnSetting) => {
  const status = getThresholdStatus(column);
  if (status === 'configured') {
    const parts = [];
    if (column.min_threshold !== null) parts.push(`≥${column.min_threshold}`);
    if (column.max_threshold !== null) parts.push(`≤${column.max_threshold}`);
    return parts.join(', ');
  }
  return '未配置';
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return typeof value === 'number' ? value.toFixed(2) : value;
};

// 监听数据集变化
watch(
  () => datasetInfo.value?.id,
  (newId) => {
    if (newId) {
      loadData();
    } else {
      outlierStore.reset();
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (datasetInfo.value?.id) {
    loadData();
  }
});
</script>

<template>
  <div class="outlier-panel">
    <!-- 加载状态 -->
    <div v-if="outlierStore.loading" class="loading-container">
      <div class="loading-content">
        <el-icon class="loading-spinner"><Loading /></el-icon>
        <span class="loading-text">加载阈值配置...</span>
      </div>
    </div>

    <template v-else-if="datasetInfo">
      <!-- 顶部工具栏 -->
      <div class="toolbar-section">
        <div class="toolbar-left">
          <div class="section-title">🔍 阈值配置</div>
          <div class="toolbar-hint">为每个变量设置有效数据范围，超出范围的值将被标记为异常</div>
        </div>
        <div class="toolbar-right">
          <el-dropdown @command="applyTemplate" :disabled="outlierStore.saving">
            <el-button size="small" type="primary" plain>
              <el-icon><Setting /></el-icon>
              应用模板
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item 
                  v-for="opt in templateOptions" 
                  :key="opt.value" 
                  :command="opt.value">
                  {{ opt.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button 
            size="small" 
            @click="loadData" 
            :loading="outlierStore.loading">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button 
            size="small" 
            type="success"
            :loading="executing"
            @click="executeDetection">
            <el-icon><VideoPlay /></el-icon>
            执行检测
          </el-button>
        </div>
      </div>

      <!-- 最近检测结果摘要 -->
      <div v-if="lastDetectionSummary" class="detection-summary">
        <div class="summary-header">
          <span class="summary-title">📊 最近检测结果</span>
          <el-button size="small" text type="primary" @click="lastDetectionSummary = null">关闭</el-button>
        </div>
        <div class="summary-stats">
          <div class="stat-item">
            <span class="stat-label">检测行数</span>
            <span class="stat-value">{{ lastDetectionSummary.totalRows.toLocaleString() }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">检测列数</span>
            <span class="stat-value">{{ lastDetectionSummary.columnsChecked }}</span>
          </div>
          <div class="stat-item highlight">
            <span class="stat-label">异常值数</span>
            <span class="stat-value">{{ lastDetectionSummary.outlierCount.toLocaleString() }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">异常率</span>
            <span class="stat-value">{{ lastDetectionSummary.outlierRate.toFixed(2) }}%</span>
          </div>
        </div>
        <div v-if="lastDetectionSummary.columnResults.length > 0" class="column-results">
          <div class="column-result" v-for="col in lastDetectionSummary.columnResults" :key="col.columnName">
            <span class="col-name">{{ col.columnName }}</span>
            <span class="col-outliers" :class="{ 'has-outliers': col.outlierCount > 0 }">
              {{ col.outlierCount }} 个异常
            </span>
          </div>
        </div>
      </div>

      <!-- 详细分析区域 -->
      <div v-if="currentResultId && (lastDetectionSummary || resultDetails.length > 0)" class="analysis-section">
        <div class="section-header">
          <div class="section-title">📈 异常分析详情</div>
        </div>
        
        <OutlierChart 
          :summary="lastDetectionSummary" 
          :details="resultDetails"
          :loading="detailLoading"
        />
        
      </div>

      <!-- 历史检测结果 -->
      <div v-if="detectionResults.length > 0" class="history-section">
        <div class="section-header">
          <div class="section-title">📜 检测历史</div>
        </div>
        <div class="history-list">
          <div v-for="result in detectionResults.slice(0, 5)" :key="result.id" class="history-item">
            <div class="history-info">
              <span class="history-method">{{ result.detection_method }}</span>
              <el-tag size="small" :type="getStatusType(result.status)">{{ getStatusText(result.status) }}</el-tag>
            </div>
            <div class="history-meta">
              <span class="history-time">{{ formatDateTime(result.executed_at) }}</span>
              <span class="history-count">{{ result.outlier_count }} 个异常</span>
            </div>
            <div class="history-actions">
              <el-button size="small" text type="primary" @click="viewResult(result)">
                <el-icon><View /></el-icon>
              </el-button>
              <el-button size="small" text type="danger" @click="deleteResult(result.id)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 搜索和批量操作 -->
      <div class="filter-section">
        <div class="filter-left">
          <el-input
            v-model="searchText"
            placeholder="搜索列名..."
            size="small"
            clearable
            class="search-input">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-checkbox 
            :model-value="selectedColumns.length === filteredColumns.length && filteredColumns.length > 0"
            :indeterminate="selectedColumns.length > 0 && selectedColumns.length < filteredColumns.length"
            @change="toggleSelectAll"
            size="small">
            全选
          </el-checkbox>
        </div>
        <div class="filter-right">
          <el-button 
            v-if="selectedColumns.length > 0"
            size="small" 
            type="danger" 
            plain
            @click="batchClearThresholds">
            清除选中 ({{ selectedColumns.length }})
          </el-button>
        </div>
      </div>

      <!-- 阈值配置表格 -->
      <div class="threshold-table-container">
        <table class="threshold-table">
          <thead>
            <tr>
              <th class="col-checkbox"></th>
              <th class="col-name">列名</th>
              <th class="col-status">状态</th>
              <th class="col-threshold">最小阈值</th>
              <th class="col-threshold">最大阈值</th>
              <th class="col-physical">物理范围</th>
              <th class="col-unit">单位</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="column in filteredColumns" 
              :key="column.id"
              :class="{ 'row-editing': editingColumn === column.id }">
              <td class="col-checkbox">
                <el-checkbox 
                  v-model="selectedColumns" 
                  :value="column.id"
                  size="small" />
              </td>
              <td class="col-name">
                <div class="column-name-cell">
                  <span class="column-name">{{ column.column_name }}</span>
                  <span v-if="column.variable_type" class="variable-type">{{ column.variable_type }}</span>
                </div>
              </td>
              <td class="col-status">
                <div 
                  class="status-badge"
                  :class="getThresholdStatus(column)">
                  {{ getThresholdStatusText(column) }}
                </div>
              </td>
              
              <!-- 编辑模式 -->
              <template v-if="editingColumn === column.id">
                <td class="col-threshold">
                  <el-input-number 
                    v-model="editForm.min_threshold" 
                    size="small" 
                    :controls="false"
                    placeholder="最小值" />
                </td>
                <td class="col-threshold">
                  <el-input-number 
                    v-model="editForm.max_threshold" 
                    size="small" 
                    :controls="false"
                    placeholder="最大值" />
                </td>
                <td class="col-physical">
                  <div class="physical-inputs">
                    <el-input-number 
                      v-model="editForm.physical_min" 
                      size="small" 
                      :controls="false"
                      placeholder="物理最小" />
                    <span class="range-separator">~</span>
                    <el-input-number 
                      v-model="editForm.physical_max" 
                      size="small" 
                      :controls="false"
                      placeholder="物理最大" />
                  </div>
                </td>
                <td class="col-unit">
                  <el-input 
                    v-model="editForm.unit" 
                    size="small" 
                    placeholder="单位" />
                </td>
                <td class="col-actions">
                  <div class="action-buttons">
                    <el-button 
                      size="small" 
                      type="success" 
                      circle
                      :loading="outlierStore.saving"
                      @click="saveColumnThreshold">
                      <el-icon><Check /></el-icon>
                    </el-button>
                    <el-button 
                      size="small" 
                      circle
                      @click="cancelEditing">
                      <el-icon><Close /></el-icon>
                    </el-button>
                  </div>
                </td>
              </template>
              
              <!-- 显示模式 -->
              <template v-else>
                <td class="col-threshold">
                  <span :class="{ 'value-set': column.min_threshold !== null }">
                    {{ formatNumber(column.min_threshold) }}
                  </span>
                </td>
                <td class="col-threshold">
                  <span :class="{ 'value-set': column.max_threshold !== null }">
                    {{ formatNumber(column.max_threshold) }}
                  </span>
                </td>
                <td class="col-physical">
                  <span class="physical-range">
                    {{ formatNumber(column.physical_min) }} ~ {{ formatNumber(column.physical_max) }}
                  </span>
                </td>
                <td class="col-unit">
                  <span class="unit-text">{{ column.unit || '-' }}</span>
                </td>
                <td class="col-actions">
                  <el-button 
                    size="small" 
                    type="primary" 
                    text
                    @click="startEditing(column)">
                    编辑
                  </el-button>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
        
        <div v-if="filteredColumns.length === 0" class="empty-table">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">未找到匹配的列</div>
        </div>
      </div>

      <!-- 检测方法说明 -->
      <div class="methods-section">
        <div class="section-header">
          <div class="section-title">📋 可用检测方法</div>
        </div>
        <div class="methods-grid">
          <div 
            v-for="method in outlierStore.availableMethods" 
            :key="method.id"
            class="method-card"
            :class="{ 'method-unavailable': !method.isAvailable }">
            <div class="method-header">
              <span class="method-name">{{ method.name }}</span>
              <span 
                class="method-category"
                :class="method.category">
                {{ method.category === 'threshold' ? '阈值' : 
                   method.category === 'statistical' ? '统计' : 
                   method.category === 'ml' ? '机器学习' : method.category }}
              </span>
            </div>
            <div class="method-description">{{ method.description }}</div>
            <div v-if="method.requiresPython" class="method-badge python">
              需要 Python
            </div>
          </div>
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
.outlier-panel {
  padding: 20px;
  background: #f8fafc;
  min-height: 100%;
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

/* 工具栏 */
.toolbar-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
}

.toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.toolbar-hint {
  font-size: 12px;
  color: #6b7280;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* 筛选区域 */
.filter-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-input {
  width: 240px;
}

/* 阈值表格 */
.threshold-table-container {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  overflow: hidden;
  margin-bottom: 20px;
}

.threshold-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.threshold-table th {
  background: linear-gradient(to bottom, #f9fafb, #f3f4f6);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid rgba(229, 231, 235, 0.6);
  white-space: nowrap;
}

.threshold-table td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  vertical-align: middle;
}

.threshold-table tr:hover {
  background: rgba(16, 185, 129, 0.03);
}

.threshold-table tr.row-editing {
  background: rgba(59, 130, 246, 0.05);
}

.col-checkbox {
  width: 40px;
  text-align: center;
}

.col-name {
  min-width: 150px;
}

.col-status {
  width: 120px;
}

.col-threshold {
  width: 100px;
}

.col-physical {
  width: 180px;
}

.col-unit {
  width: 80px;
}

.col-actions {
  width: 100px;
  text-align: center;
}

/* 列名单元格 */
.column-name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.column-name {
  font-weight: 500;
  color: #1f2937;
}

.variable-type {
  font-size: 11px;
  color: #9ca3af;
}

/* 状态徽章 */
.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.configured {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.status-badge.not-configured {
  background: rgba(156, 163, 175, 0.1);
  color: #6b7280;
}

/* 数值显示 */
.value-set {
  color: #1f2937;
  font-weight: 500;
}

.physical-range {
  color: #6b7280;
  font-size: 12px;
}

.unit-text {
  color: #9ca3af;
}

/* 编辑模式输入 */
.physical-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.range-separator {
  color: #9ca3af;
}

.action-buttons {
  display: flex;
  gap: 4px;
  justify-content: center;
}

/* 空表格 */
.empty-table {
  padding: 48px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  color: #6b7280;
  font-size: 14px;
}

/* 检测方法区域 */
.methods-section {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 16px;
}

.section-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.method-card {
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
}

.method-card:hover {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.method-card.method-unavailable {
  opacity: 0.6;
}

.method-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.method-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 13px;
}

.method-category {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.method-category.threshold {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.method-category.statistical {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.method-category.ml {
  background: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.method-description {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.method-badge {
  margin-top: 8px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
}

.method-badge.python {
  background: rgba(251, 191, 36, 0.1);
  color: #d97706;
}

/* 检测结果摘要 */
.detection-summary {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(59, 130, 246, 0.05));
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.summary-title {
  font-weight: 600;
  color: #1f2937;
}

.summary-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-item.highlight .stat-value {
  color: #dc2626;
  font-size: 18px;
}

.stat-label {
  font-size: 11px;
  color: #6b7280;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.column-results {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(229, 231, 235, 0.3);
}

.column-result {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  font-size: 12px;
}

.column-result .col-name {
  color: #374151;
  font-weight: 500;
}

.col-outliers {
  color: #6b7280;
}

.col-outliers.has-outliers {
  color: #dc2626;
  font-weight: 500;
}

/* 历史记录 */
.history-section {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  padding: 16px;
  margin-bottom: 16px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.8);
  border-radius: 8px;
  border: 1px solid rgba(229, 231, 235, 0.3);
}

.history-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-method {
  font-weight: 500;
  color: #374151;
  font-size: 13px;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #6b7280;
}

.history-count {
  color: #059669;
  font-weight: 500;
}

/* 无数据状态 */
.no-data-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  border: 1px solid rgba(229, 231, 235, 0.4);
}

.no-data-content {
  text-align: center;
}

.no-data-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.no-data-text {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
}

.no-data-subtitle {
  font-size: 13px;
  color: #6b7280;
}

/* 动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 响应式 */
@media (max-width: 768px) {
  .toolbar-section {
    flex-direction: column;
    gap: 12px;
  }
  
  .filter-section {
    flex-direction: column;
    gap: 12px;
  }
  
  .filter-left {
    width: 100%;
  }
  
  .search-input {
    width: 100%;
  }
  
  .methods-grid {
    grid-template-columns: 1fr;
  }
}
</style>
