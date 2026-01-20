<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Loading, Refresh, Search, Setting, Check, Close, VideoPlay, Delete, Plus, ArrowLeft, MagicStick, RefreshLeft, Download, Edit } from "@element-plus/icons-vue";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import type { DatasetInfo } from "@shared/types/projectInterface";
import type { ColumnSetting, OutlierResult, OutlierDetail } from "@shared/types/database";
import OutlierChart from "../charts/OutlierChart.vue";

const datasetStore = useDatasetStore();
const outlierStore = useOutlierDetectionStore();

interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
});

const datasetInfo = computed(() => props.datasetInfo ?? datasetStore.currentDataset);

const panelLoading = computed(() => props.loading || outlierStore.loading);

// View State
const activeView = ref<'config' | 'result'>('config');

// 检测结果状态
const detectionResults = ref<OutlierResult[]>([]);
const currentResult = ref<OutlierResult | null>(null);
const lastDetectionSummary = ref<{
  totalRows: number;
  columnsChecked: number;
  outlierCount: number;
  outlierRate: number;
  columnResults: Array<{
    columnName: string;
    outlierCount: number;
    missingCount?: number;
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
const applying = ref(false); // 应用过滤中
const currentSelectedColumn = ref("");

// 重命名状态
const editingResultId = ref<number | null>(null);
const editingName = ref("");

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

const switchToConfig = () => {
  activeView.value = 'config';
  currentResultId.value = null;
  currentResult.value = null;
  lastDetectionSummary.value = null;
};

const executeDetection = async () => {
  if (!datasetInfo.value?.id) return;
  
  // 确定要检测的列
  let targetColumnNames: string[] | undefined = undefined;
  
  if (selectedColumns.value.length > 0) {
    // 如果用户选择了列，只检测选中的列
    const selectedCols = outlierStore.columnThresholds.filter(c => selectedColumns.value.includes(c.id));
    targetColumnNames = selectedCols.map(c => c.column_name);
    
    // 检查选中的列是否有配置阈值
    const hasConfigured = selectedCols.some(c => c.min_threshold !== null || c.max_threshold !== null);
    if (!hasConfigured) {
      ElMessage.warning("选中的列未配置阈值");
      return;
    }
  } else {
    // 如果未选择列，检测所有配置了阈值的列
    const configuredColumns = outlierStore.columnThresholds.filter(
      c => c.min_threshold !== null || c.max_threshold !== null
    );
    
    if (configuredColumns.length === 0) {
      ElMessage.warning("请先为至少一个列配置阈值");
      return;
    }
  }
  
  try {
    executing.value = true;
    // 使用版本 ID，如果没有则使用 0
    const versionId = datasetInfo.value.id; // TODO: 获取实际版本 ID
    
    const result = await outlierStore.executeThresholdDetection(
      String(datasetInfo.value.id),
      String(versionId),
      targetColumnNames
    );
    
    if (result) {
      // 这里的逻辑需要调整，因为 viewResult 会重新解析
      // 我们可以先加载列表，然后自动选择最新的一项
      await loadDetectionResults();
      if (detectionResults.value.length > 0) {
        await viewResult(detectionResults.value[0]);
      }
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
  currentResult.value = result;
  activeView.value = 'result';
  currentSelectedColumn.value = "";
  
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
               try {
                  const params = JSON.parse(result.detection_params || '{}');
                  if (params.columns) {
                      columnResults = params.columns.map((c: string) => ({
                          columnName: c,
                          outlierCount: 0,
                          missingCount: 0
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
  
  detailPage.value = 1;
  await loadResultDetails();
};


const deleteResult = async (resultId: number, event?: Event) => {
  if (event) {
    event.stopPropagation();
  }
  
  try {
    await ElMessageBox.confirm(
      '确定要删除这条检测结果吗？',
      '删除确认',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning', customClass: 'qc-message-box' }
    );
    
    const success = await outlierStore.deleteDetectionResult(String(resultId));
    if (success) {
      await loadDetectionResults();
      if (currentResultId.value === resultId) {
        switchToConfig();
      }
    }
  } catch {
    // 用户取消
  }
};

const getResultDisplayName = (result: OutlierResult) => {
  if (result.name) {
    return result.name;
  }
  // 默认名称：方法-时间
  const methodName = getMethodDisplayName(result.detection_method);
  const time = formatDateTime(result.executed_at);
  return `${methodName}-${time}`;
};

const getMethodDisplayName = (method: string) => {
  const methodMap: Record<string, string> = {
    'THRESHOLD_STATIC': '静态阈值',
    'ZSCORE': 'Z-Score',
    'MODIFIED_ZSCORE': 'MAD Z-Score',
    'IQR': 'IQR',
    'DESPIKING_MAD': 'MAD Despiking'
  };
  return methodMap[method] || method;
};

const startRenaming = (result: OutlierResult, event: Event) => {
  event.stopPropagation();
  editingResultId.value = result.id;
  editingName.value = result.name || getResultDisplayName(result);
};

const cancelRenaming = (event?: Event) => {
  if (event) {
    event.stopPropagation();
  }
  editingResultId.value = null;
  editingName.value = "";
};

const saveRenaming = async (event?: Event) => {
  if (event) {
    event.stopPropagation();
  }
  if (!editingResultId.value || !editingName.value.trim()) {
    cancelRenaming();
    return;
  }
  
  const success = await outlierStore.renameDetectionResult(
    String(editingResultId.value),
    editingName.value.trim()
  );
  
  if (success) {
    // 更新本地状态
    const result = detectionResults.value.find(r => r.id === editingResultId.value);
    if (result) {
      result.name = editingName.value.trim();
    }
  }
  
  cancelRenaming();
};

const applyFiltering = async () => {
  if (!currentResultId.value) return;
  
  try {
    await ElMessageBox.confirm(
      '此操作将创建一个新版本的数据文件，并将检测到的所有异常值置为空（删除）。确定要继续吗？',
      '过滤异常值',
      { confirmButtonText: '确定过滤', cancelButtonText: '取消', type: 'warning', customClass: 'qc-message-box qc-message-box--outlier-filter' }
    );
    
    applying.value = true;
    const result = await outlierStore.applyOutlierFiltering(String(currentResultId.value));
    
    if (result) {
      // 重新加载结果列表以更新状态
      await loadDetectionResults();
      // 更新当前结果的状态显示
      if (currentResult.value) {
        currentResult.value.status = 'APPLIED';
        currentResult.value.generated_version_id = result.versionId;
      }
      
      // 可以选择是否通知 DatasetStore 刷新版本列表
      if (datasetInfo.value?.id) {
        datasetStore.loadVersions(datasetInfo.value.id);
      }
    }
  } catch (e) {
    // Cancelled
  } finally {
    applying.value = false;
  }
};

const revertFiltering = async () => {
  if (!currentResultId.value) return;
  
  try {
    await ElMessageBox.confirm(
      '确定要撤销过滤操作吗？这将恢复检测结果的状态，但已生成的版本文件将保留（作为历史记录）。',
      '撤销过滤',
      { confirmButtonText: '确定撤销', cancelButtonText: '取消', type: 'info', customClass: 'qc-message-box' }
    );
    
    applying.value = true;
    const success = await outlierStore.revertOutlierFiltering(String(currentResultId.value));
    
    if (success) {
      await loadDetectionResults();
      if (currentResult.value) {
        currentResult.value.status = 'COMPLETED';
      }
    }
  } catch (e) {
    // Cancelled
  } finally {
    applying.value = false;
  }
};

const exportCleanedData = async () => {
  if (!currentResult.value?.generated_version_id) return;
  
  const versionId = currentResult.value.generated_version_id;
  const fileName = `cleaned_data_v${versionId}.csv`;
  
  await datasetStore.exportVersion(Number(versionId), fileName);
};

import { formatLocalWithTZ } from '@/utils/timeUtils';
const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '-';
  return formatLocalWithTZ(dateStr);
};

const getStatusType = (status: string) => {
  switch (status) {
    case 'COMPLETED': return 'success';
    case 'RUNNING': return 'warning';
    case 'FAILED': return 'danger';
    case 'APPLIED': return 'success'; // 已应用也用绿色，或者深绿色
    case 'REVERTED': return 'info';
    default: return 'info';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'COMPLETED': return '已完成';
    case 'RUNNING': return '运行中';
    case 'FAILED': return '失败';
    case 'PENDING': return '待执行';
    case 'APPLIED': return '已过滤';
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
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning', customClass: 'qc-message-box' }
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
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning', customClass: 'qc-message-box' }
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

const getMissingCount = (columnName: string) => {
  const stats = datasetStore.currentVersionStats?.columnStats;
  if (!stats) return null;
  
  if (stats.columnMissingStatus && stats.columnMissingStatus[columnName] !== undefined) {
    return stats.columnMissingStatus[columnName];
  }
  
  // Fallback for flat structure
  if (typeof stats[columnName] === 'number') {
    return stats[columnName];
  }
  
  return null;
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
    <div v-if="panelLoading && !datasetInfo" class="loading-overlay">
      <div class="loading-content">
        <el-icon class="loading-spinner"><Loading /></el-icon>
        <span class="loading-text">加载中...</span>
      </div>
    </div>

    <template v-else-if="datasetInfo">
      <!-- 侧边栏：历史记录 -->
      <div class="panel-sidebar glass-panel">
        <div class="sidebar-header">
          <el-button type="primary" class="new-detection-btn" @click="switchToConfig" :class="{ active: activeView === 'config' }">
            <el-icon><Plus /></el-icon> 新建检测
          </el-button>
        </div>
        
        <div class="history-list-container">
          <div class="sidebar-subtitle">检测历史</div>
          <el-scrollbar>
            <div class="history-list">
              <div 
                v-for="result in detectionResults" 
                :key="result.id" 
                class="history-item"
                :class="{ active: currentResultId === result.id }"
                @click="viewResult(result)">
                <div class="history-item-header">
                  <!-- 名称显示/编辑区域 -->
                  <div class="history-name-wrapper" v-if="editingResultId !== result.id">
                    <span class="history-name" :title="getResultDisplayName(result)">{{ getResultDisplayName(result) }}</span>
                    <el-button 
                      size="small" 
                      text 
                      class="rename-btn"
                      @click="startRenaming(result, $event)">
                      <el-icon><Edit /></el-icon>
                    </el-button>
                  </div>
                  <!-- 编辑模式 -->
                  <div class="history-name-edit" v-else @click.stop>
                    <el-input
                      v-model="editingName"
                      size="small"
                      placeholder="输入名称"
                      @keyup.enter="saveRenaming($event)"
                      @keyup.escape="cancelRenaming($event)"
                      autofocus
                    />
                    <el-button size="small" type="primary" text @click="saveRenaming($event)">
                      <el-icon><Check /></el-icon>
                    </el-button>
                    <el-button size="small" text @click="cancelRenaming($event)">
                      <el-icon><Close /></el-icon>
                    </el-button>
                  </div>
                  <el-button 
                    size="small" 
                    text 
                    type="danger" 
                    class="delete-btn"
                    @click="deleteResult(result.id, $event)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
                <div class="history-item-content">
                  <el-tag size="small" :type="getStatusType(result.status)" effect="light" round>{{ getStatusText(result.status) }}</el-tag>
                  <span class="history-count" v-if="result.status === 'COMPLETED'">
                    {{ result.outlier_count }} 个异常
                  </span>
                </div>
              </div>
              
              <div v-if="detectionResults.length === 0" class="no-history">
                暂无检测记录
              </div>
            </div>
          </el-scrollbar>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="panel-main">
        <!-- 配置模式 -->
        <div v-if="activeView === 'config'" class="view-container config-view">
          <!-- 上半部分：配置卡片 -->
          <div class="main-card glass-panel">
            <div class="view-header">
              <div class="header-title">
                <h2>阈值配置与检测</h2>
                <span class="header-desc">为每个变量设置有效数据范围，超出范围的值将被标记为异常</span>
              </div>
              <div class="header-actions">
                <el-dropdown @command="applyTemplate" :disabled="outlierStore.saving">
                  <el-button class="action-btn" plain>
                    <el-icon><Setting /></el-icon> 模板
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
                  class="action-btn"
                  plain
                  @click="loadData" 
                  :loading="outlierStore.loading">
                  <el-icon><Refresh /></el-icon> 刷新
                </el-button>
                <el-button 
                  class="action-btn primary-gradient-btn"
                  type="primary"
                  :loading="executing"
                  @click="executeDetection">
                  <el-icon><VideoPlay /></el-icon> 开始检测
                </el-button>
              </div>
            </div>

            <!-- 筛选区域 -->
            <div class="filter-section">
              <div class="filter-left">
                <el-input
                  v-model="searchText"
                  placeholder="搜索列名..."
                  class="search-input"
                  clearable>
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
                <el-checkbox 
                  :model-value="selectedColumns.length === filteredColumns.length && filteredColumns.length > 0"
                  :indeterminate="selectedColumns.length > 0 && selectedColumns.length < filteredColumns.length"
                  @change="toggleSelectAll">
                  全选
                </el-checkbox>
              </div>
              <div class="filter-right">
                <transition name="fade">
                  <el-button 
                    v-if="selectedColumns.length > 0"
                    size="small" 
                    type="danger" 
                    plain
                    round
                    @click="batchClearThresholds">
                    清除选中 ({{ selectedColumns.length }})
                  </el-button>
                </transition>
              </div>
            </div>

            <!-- 阈值配置表格与方法说明 -->
            <div class="threshold-table-container">
              <el-scrollbar>
                <div class="table-wrapper">
                  <table class="threshold-table">
                    <thead>
                      <tr>
                        <th class="col-checkbox"></th>
                        <th class="col-name">列名</th>
                        <th class="col-status">状态</th>
                        <th class="col-missing">缺失值</th>
                        <th class="col-threshold">最小阈值</th>
                        <th class="col-threshold">最大阈值</th>

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
                        <td class="col-missing">
                          <span class="missing-count" :class="{ 'has-missing': (getMissingCount(column.column_name) || 0) > 0 }">
                            {{ getMissingCount(column.column_name) ?? '-' }}
                          </span>
                        </td>
                        
                        <!-- 编辑模式 -->
                        <template v-if="editingColumn === column.id">
                          <td class="col-threshold">
                            <el-input-number 
                              v-model="editForm.min_threshold" 
                              size="small" 
                              :controls="false"
                              placeholder="最小值"
                              class="edit-input" />
                          </td>
                          <td class="col-threshold">
                            <el-input-number 
                              v-model="editForm.max_threshold" 
                              size="small" 
                              :controls="false"
                              placeholder="最大值"
                              class="edit-input" />
                          </td>

                          <td class="col-unit">
                            <el-input 
                              v-model="editForm.unit" 
                              size="small" 
                              placeholder="单位"
                              class="edit-input" />
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

                          <td class="col-unit">
                            <span class="unit-text">{{ column.unit || '-' }}</span>
                          </td>
                          <td class="col-actions">
                            <el-button 
                              size="small" 
                              type="primary" 
                              link
                              class="edit-btn"
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

                <!-- 检测方法说明 (移动到这里) -->
                <div class="methods-section">
                  <div class="section-header-small">
                    <div class="section-title">可用检测方法</div>
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
                        Python
                      </div>
                    </div>
                  </div>
                </div>
              </el-scrollbar>
            </div>
          </div>
        </div>

        <!-- 结果展示模式 -->
        <div v-else-if="activeView === 'result'" class="view-container result-view">
          <div class="glass-panel result-panel">
            <div class="view-header">
              <div class="header-title">
                <el-button link @click="switchToConfig" class="back-btn">
                  <el-icon><ArrowLeft /></el-icon>
                </el-button>
                <h2>检测结果详情</h2>
                <el-tag 
                  v-if="currentResult" 
                  :type="getStatusType(currentResult.status)" 
                  effect="plain" 
                  round>
                  {{ getStatusText(currentResult.status) }}
                </el-tag>
              </div>
              <div class="header-actions">
                <!-- 过滤按钮 (仅在COMPLETED状态且有异常值时显示) -->
                <el-button 
                  v-if="currentResult?.status === 'COMPLETED' && (lastDetectionSummary?.outlierCount || 0) > 0"
                  type="primary" 
                  class="primary-gradient-btn"
                  :loading="applying"
                  @click="applyFiltering">
                  <el-icon><MagicStick /></el-icon> 过滤异常值
                </el-button>

                <!-- 撤销按钮 (仅在APPLIED状态显示) -->
                <el-button 
                  v-if="currentResult?.status === 'APPLIED'"
                  type="warning" 
                  plain
                  :loading="applying"
                  @click="revertFiltering">
                  <el-icon><RefreshLeft /></el-icon> 撤销过滤
                </el-button>

                <!-- 导出按钮 (仅在APPLIED状态且有生成版本ID时显示) -->
                <el-button 
                  v-if="currentResult?.status === 'APPLIED' && currentResult?.generated_version_id"
                  type="success" 
                  plain
                  @click="exportCleanedData">
                  <el-icon><Download /></el-icon> 导出数据
                </el-button>

                <el-button 
                  type="danger" 
                  plain 
                  text
                  @click="deleteResult(currentResultId!)">
                  <el-icon><Delete /></el-icon> 删除结果
                </el-button>
              </div>
            </div>

            <div class="result-content" v-if="lastDetectionSummary">
              <!-- 摘要卡片 -->
              <div class="summary-cards">
                <div class="summary-card glass-effect">
                  <div class="card-label">检测行数</div>
                  <div class="card-value">{{ lastDetectionSummary.totalRows.toLocaleString() }}</div>
                </div>
                <div class="summary-card glass-effect">
                  <div class="card-label">检测列数</div>
                  <div class="card-value">{{ lastDetectionSummary.columnsChecked }}</div>
                </div>
                <div class="summary-card highlight">
                  <div class="card-label">异常值总数</div>
                  <div class="card-value">{{ lastDetectionSummary.outlierCount.toLocaleString() }}</div>
                </div>
                <div class="summary-card glass-effect">
                  <div class="card-label">异常率</div>
                  <div class="card-value">{{ lastDetectionSummary.outlierRate.toFixed(2) }}%</div>
                </div>
              </div>

              <!-- 各列异常统计横向列表 -->
              <div class="column-stats-row glass-effect" v-if="lastDetectionSummary.columnResults.length > 0">
                <div class="stats-row-header">
                  <span class="stats-title">各列异常分布</span>
                  <span class="stats-subtitle">点击查看详情</span>
                </div>
                <el-scrollbar>
                  <div class="column-stats-list">
                    <div 
                      v-for="col in lastDetectionSummary.columnResults" 
                      :key="col.columnName"
                      class="stat-item"
                      :class="{ 
                        active: currentSelectedColumn === col.columnName,
                        'has-outliers': col.outlierCount > 0
                      }"
                      @click="currentSelectedColumn = col.columnName">
                      <div class="stat-item-header">
                        <span class="col-name" :title="col.columnName">{{ col.columnName }}</span>
                      </div>
                      <div class="stat-metrics">
                        <div class="stat-metric">
                          <span class="count">{{ col.outlierCount }}</span>
                          <span class="label">异常</span>
                        </div>
                        <div class="stat-divider"></div>
                        <div class="stat-metric">
                          <span class="count missing">{{ col.missingCount ?? getMissingCount(col.columnName) ?? '-' }}</span>
                          <span class="label">缺失</span>
                        </div>
                      </div>
                      <div class="stat-bar-bg">
                        <div 
                          class="stat-bar-fill" 
                          :style="{ width: Math.min((col.outlierCount / (lastDetectionSummary.totalRows || 1)) * 100, 100) + '%' }">
                        </div>
                      </div>
                    </div>
                  </div>
                </el-scrollbar>
              </div>

              <!-- 异常分析视图 -->
              <div class="chart-section glass-effect">
                <OutlierChart 
                  :summary="lastDetectionSummary" 
                  :details="resultDetails"
                  :loading="detailLoading"
                  :file-path="datasetInfo?.originalFile?.filePath"
                  :show-summary-chart="false"
                  :show-detail-chart="true"
                  v-model:modelValue="currentSelectedColumn"
                />
              </div>
            </div>
            
            <div v-else class="loading-result">
              <el-icon class="loading-spinner"><Loading /></el-icon>
              加载结果中...
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
/* 核心布局与背景 */
.outlier-panel {
  display: flex;
  height: 100%;
  width: 100%;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  overflow: hidden;
  padding: 8px;
  gap: 8px;
  box-sizing: border-box;
}

/* Glass Panel 通用样式 */
.glass-panel {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  border-radius: 16px;
  overflow: hidden;
}

.glass-effect {
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

/* 侧边栏 */
.panel-sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
}

.new-detection-btn {
  width: 100%;
  height: 42px;
  font-size: 14px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
  transition: all 0.3s ease;
}

.new-detection-btn.active {
  background-color: #059669;
  border-color: #059669;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.history-list-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-subtitle {
  padding: 16px 20px 8px;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.history-list {
  padding: 8px 16px;
}

.history-item {
  padding: 14px;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(255, 255, 255, 0.4);
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.history-item.active {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%);
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.history-name-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: 13px;
  color: #1f2937;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 2px;
  height: auto;
  flex-shrink: 0;
}

.history-item:hover .rename-btn {
  opacity: 0.6;
}

.history-item:hover .rename-btn:hover {
  opacity: 1;
  color: #10b981;
}

.history-name-edit {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.history-name-edit .el-input {
  flex: 1;
}

.history-name-edit .el-input :deep(.el-input__inner) {
  font-size: 12px;
  height: 26px;
}

.history-time {
  font-size: 13px;
  color: #1f2937;
  font-weight: 600;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 4px;
  height: auto;
  flex-shrink: 0;
}

.history-item:hover .delete-btn {
  opacity: 1;
}

.history-item-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-count {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.no-history {
  text-align: center;
  padding: 40px 16px;
  color: #9ca3af;
  font-size: 14px;
}

/* 主内容区域 */
.panel-main {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.view-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 16px;
}

.config-view {
  width: 100%;
}

.main-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 允许 flex 子项收缩 */
}

.view-header {
  padding: 16px 24px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.result-view .header-title {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.back-btn {
  margin-right: 4px;
  padding: 4px;
  height: auto;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.back-btn:hover {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 4px;
}

.back-btn :deep(.el-icon) {
  font-size: 20px;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #1f2937 0%, #4b5563 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-desc {
  font-size: 13px;
  color: #6b7280;
  margin-top: 6px;
  display: block;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  border-radius: 8px;
  height: 36px;
  font-weight: 500;
}

.primary-gradient-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
  transition: all 0.3s ease;
}

.primary-gradient-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 15px rgba(16, 185, 129, 0.4);
  opacity: 0.95;
}

/* 筛选区域 */
.filter-section {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.3);
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-input {
  width: 260px;
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* 表格区域 */
.threshold-table-container {
  flex: 1;
  overflow: hidden;
  padding: 0;
  min-height: 200px; /* 防止在极小屏幕下表格完全消失 */
  display: flex;
  flex-direction: column;
}

.table-wrapper {
  padding: 0 24px 16px;
}

/* 强制滚动条充满容器 */
.threshold-table-container :deep(.el-scrollbar) {
  height: 100%;
  width: 100%;
}

.threshold-table-container :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
}

.threshold-table-container :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  min-width: fit-content;
}

.threshold-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  margin-top: 8px;
}

.threshold-table th {
  background: rgba(243, 244, 246, 0.8);
  padding: 14px 16px;
  text-align: left;
  font-weight: 600;
  color: #4b5563;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(4px);
  white-space: nowrap;
}

.threshold-table td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.6);
  background: rgba(255, 255, 255, 0.4);
  transition: background 0.2s;
  white-space: nowrap;
}

.threshold-table tr:hover td {
  background: rgba(240, 253, 244, 0.5); /* Emerald-50 with opacity */
}

.threshold-table tr.row-editing td {
  background: rgba(59, 130, 246, 0.05);
}

.threshold-table tr:last-child td {
  border-bottom: none;
}

/* 表格列宽与样式 */
.col-checkbox { width: 40px; min-width: 40px; text-align: center; }
.col-name { width: auto; min-width: 120px; max-width: 300px; }
.col-status { width: 90px; min-width: 90px; }
.col-missing { width: 80px; min-width: 80px; text-align: center; }
.col-threshold { width: 90px; min-width: 90px; }

.col-unit { width: 160px; min-width: 160px; }
.col-unit .edit-input { width: 100%; }
.col-actions { width: 100px; min-width: 100px; text-align: center; }

.column-name-cell { display: flex; flex-direction: column; gap: 4px; }
.column-name { font-weight: 600; color: #1f2937; }
.variable-type { 
  font-size: 10px; 
  color: #6b7280; 
  background: #f3f4f6; 
  padding: 2px 6px; 
  border-radius: 4px; 
  align-self: flex-start; 
}

.status-badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.status-badge.configured { background: rgba(16, 185, 129, 0.15); color: #059669; }
.status-badge.not-configured { background: rgba(156, 163, 175, 0.15); color: #6b7280; }

.missing-count { color: #6b7280; font-family: monospace; }
.missing-count.has-missing { color: #ef4444; font-weight: 600; }

.value-set { color: #111827; font-weight: 600; font-family: monospace; }

.unit-text { color: #9ca3af; font-style: italic; }


.action-buttons { display: flex; gap: 6px; justify-content: center; }

.edit-btn {
  font-weight: 500;
  opacity: 0.7;
}
.edit-btn:hover {
  opacity: 1;
}

.empty-table {
  padding: 64px;
  text-align: center;
  border-radius: 8px;
  margin-top: 16px;
}
.empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.5; }
.empty-text { color: #6b7280; font-size: 16px; }

/* 方法区域容器 - 内部样式 */
.methods-section {
  padding: 16px 24px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.4);
  border-top: 1px solid rgba(229, 231, 235, 0.4);
}

.section-header-small {
  margin-bottom: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #374151;
  display: flex;
  align-items: center;
}
.section-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 16px;
  background: #10b981;
  border-radius: 2px;
  margin-right: 8px;
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.method-card {
  background: #fff;
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.method-card:hover {
  border-color: #10b981;
  transform: translateY(-4px);
  box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.15), 0 8px 10px -6px rgba(16, 185, 129, 0.1);
}

.method-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, #10b981, #059669);
  opacity: 0;
  transition: opacity 0.3s;
}

.method-card:hover::before {
  opacity: 1;
}

.method-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.method-name {
  font-weight: 700;
  color: #1f2937;
  font-size: 14px;
}

.method-category {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  text-transform: uppercase;
}
.method-category.threshold { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.method-category.statistical { background: rgba(16, 185, 129, 0.1); color: #059669; }
.method-category.ml { background: rgba(139, 92, 246, 0.1); color: #7c3aed; }

.method-description {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.method-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

/* 结果详情视图 */
.result-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.summary-card {
  padding: 12px 14px;
  transition: transform 0.3s;
}
.summary-card:hover {
  transform: translateY(-2px);
}

.summary-card.highlight {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  box-shadow: 0 6px 14px rgba(16, 185, 129, 0.3);
  color: #fff;
  border-radius: 10px;
}

.summary-card.highlight .card-label,
.summary-card.highlight .card-value {
  color: #fff;
}

.card-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
  font-weight: 500;
}

.card-value {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.02em;
}

.column-breakdown {
  padding: 24px;
  margin-bottom: 24px;
}

.breakdown-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}
.breakdown-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 18px;
  background: #10b981;
  margin-right: 8px;
  border-radius: 2px;
}

.breakdown-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.column-tag {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  font-size: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.tag-name {
  padding: 6px 12px;
  color: #374151;
  font-weight: 500;
}

.tag-count {
  padding: 6px 10px;
  background: #f3f4f6;
  color: #6b7280;
  font-weight: 600;
  border-left: 1px solid #e5e7eb;
}

.tag-count.has-outliers {
  background: #fef2f2;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.chart-section {
  padding: 24px;
  min-height: 400px;
}

.loading-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  gap: 16px;
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
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

/* No Data */
.no-data-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}

.no-data-content {
  text-align: center;
  background: rgba(255, 255, 255, 0.6);
  padding: 48px;
  border-radius: 24px;
  backdrop-filter: blur(20px);
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.no-data-icon {
  font-size: 64px;
  margin-bottom: 24px;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
}

.no-data-text {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 8px;
}

.no-data-subtitle {
  color: #6b7280;
  font-size: 15px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Scrollbar beautification */
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

/* Column Statistics Row */
.column-stats-row {
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.stats-row-header {
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stats-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.stats-subtitle {
  font-size: 11px;
  color: #9ca3af;
}

.column-stats-list {
  display: flex;
  gap: 10px;
  padding: 4px 4px 8px; /* 增加顶部和底部内边距，为 hover 动效留出空间 */
}

.stat-item {
  flex: 0 0 110px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.stat-item:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.stat-item.active {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%);
  border-color: #10b981;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
}

.stat-item.has-outliers .count {
  color: #ef4444;
}

.stat-item-header {
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.col-name {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.stat-item.active .col-name {
  color: #059669;
}

.stat-metrics {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 0 2px;
}

.stat-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.stat-divider {
  width: 1px;
  height: 16px;
  background: rgba(229, 231, 235, 0.8);
}

.count {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
}

.count.missing {
  color: #f59e0b;
}

.label {
  font-size: 9px;
  color: #9ca3af;
  transform: scale(0.9);
}

.stat-bar-bg {
  height: 3px;
  background: #f3f4f6;
  border-radius: 2px;
  overflow: hidden;
  width: 100%;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981, #059669);
  border-radius: 2px;
  transition: width 0.5s ease;
}

.stat-item.has-outliers .stat-bar-fill {
  background: linear-gradient(90deg, #f87171, #ef4444);
}
</style>
