<template>
  <div class="quick-operation">
    <!-- 头部 -->
    <div class="qo-header">
      <div class="qo-header-left">
        <div class="qo-icon-wrap">
          <Zap :size="18" class="qo-icon" />
        </div>
        <div>
          <h3 class="qo-title">快速操作</h3>
          <p class="qo-subtitle">选择下方操作开始数据处理流程</p>
        </div>
      </div>

      <!-- 数据集状态指示器 -->
      <div v-if="datasetInfo" class="qo-status">
        <component :is="datasetStatusIcon.icon" :size="16" :class="['qo-status-icon', datasetStatusIcon.colorClass]" />
        <span :class="['qo-status-text', datasetStatusIcon.textClass]">{{ datasetStatusIcon.text }}</span>
      </div>
    </div>

    <!-- 操作按钮网格 -->
    <div class="qo-grid">
      <ActionButton
        icon="🔍"
        title="异常检测"
        description="识别数据中的异常值"
        :disabled="!datasetInfo"
        :loading="loadingStates.outlier"
        color="emerald"
        @click="handleOutlierDetection" />

      <ActionButton
        icon="🔧"
        title="缺失值处理"
        description="填补和修复缺失数据"
        :disabled="!datasetInfo"
        :loading="loadingStates.missing"
        :badge="missingValueCount > 0 ? missingValueCount : null"
        badge-type="warning"
        color="blue"
        @click="handleMissingValueImputation" />

      <ActionButton
        icon="🧹"
        title="数据清洗"
        description="格式化和标准化数据"
        :disabled="!datasetInfo"
        :loading="loadingStates.cleaning"
        color="purple"
        @click="handleDataCleaning" />

      <ActionButton
        icon="📊"
        title="生成报告"
        description="创建数据分析报告"
        :disabled="!datasetInfo"
        :loading="loadingStates.report"
        color="orange"
        @click="handleGenerateReport" />

      <ActionButton
        icon="📤"
        title="导出数据"
        description="导出处理后的数据"
        :disabled="!datasetInfo"
        :loading="loadingStates.export"
        color="gray"
        @click="handleExportData" />
    </div>

    <!-- 高级设置折叠面板 -->
    <el-collapse v-model="activeCollapse" class="qo-collapse">
      <el-collapse-item name="advanced">
        <template #title>
          <div class="collapse-title">
            <Settings :size="14" />
            <span>高级设置</span>
          </div>
        </template>

        <div class="advanced-settings">
          <div class="settings-grid">
            <div class="setting-item">
              <label class="setting-label">处理模式</label>
              <el-radio-group v-model="advancedSettings.processingMode" size="small">
                <el-radio-button label="auto">自动</el-radio-button>
                <el-radio-button label="manual">手动</el-radio-button>
                <el-radio-button label="batch">批量</el-radio-button>
              </el-radio-group>
            </div>

            <div class="setting-item">
              <label class="setting-label">输出格式</label>
              <el-select v-model="advancedSettings.outputFormat" size="small" style="width: 100%">
                <el-option label="CSV" value="csv" />
                <el-option label="Excel" value="excel" />
                <el-option label="JSON" value="json" />
                <el-option label="Parquet" value="parquet" />
              </el-select>
            </div>
          </div>

          <div class="threshold-section">
            <label class="setting-label">数据质量阈值</label>
            <div class="threshold-grid">
              <div class="threshold-item">
                <label class="threshold-label">缺失值容忍度</label>
                <el-slider
                  v-model="advancedSettings.missingThreshold"
                  :min="0"
                  :max="50"
                  :step="5"
                  show-input
                  size="small" />
              </div>
              <div class="threshold-item">
                <label class="threshold-label">异常值敏感度</label>
                <el-slider v-model="advancedSettings.outlierSensitivity" :min="1" :max="10" show-input size="small" />
              </div>
            </div>
          </div>

          <div class="settings-footer">
            <el-button size="small" @click="resetAdvancedSettings">重置</el-button>
            <el-button type="primary" size="small" @click="saveAdvancedSettings">保存设置</el-button>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- 操作历史 -->
    <div v-if="recentOperations.length > 0" class="recent-ops">
      <h4 class="recent-ops-title">最近操作</h4>
      <div class="recent-ops-list">
        <el-tag
          v-for="op in recentOperations"
          :key="op.id"
          :type="getOperationTagType(op.status)"
          size="small"
          class="op-tag"
          @click="viewOperationDetails(op)">
          <span class="op-icon">{{ op.icon }}</span>
          {{ op.name }}
          <span class="op-time">{{ formatRelativeTime(op.timestamp) }}</span>
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { formatLocalWithTZ } from "@/utils/timeUtils";
import { ElMessage, ElMessageBox } from "element-plus";
import { type Component } from "vue";
import { Zap, Settings, AlertTriangle, CheckCircle, XCircle } from "@/components/icons/iconoir";
import type { DatasetInfo } from "@shared/types/projectInterface";
import ActionButton from "./ActionButton.vue";

// Props
interface Props {
  datasetInfo?: DatasetInfo | null;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  startOutlierDetection: [options: any];
  startMissingValueImputation: [options: any];
  startDataCleaning: [options: any];
  generateReport: [options: any];
  exportData: [options: any];
}>();

// Reactive state
const activeCollapse = ref<string[]>([]);
const loadingStates = reactive({
  outlier: false,
  missing: false,
  cleaning: false,
  report: false,
  export: false,
});

const advancedSettings = reactive({
  processingMode: "auto",
  outputFormat: "csv",
  missingThreshold: 10,
  outlierSensitivity: 5,
});

const recentOperations = ref([
  { id: 1, name: "异常检测", icon: "🔍", status: "completed", timestamp: Date.now() - 1000 * 60 * 5 },
  { id: 2, name: "缺失值填补", icon: "🔧", status: "failed", timestamp: Date.now() - 1000 * 60 * 15 },
  { id: 3, name: "数据导出", icon: "📤", status: "completed", timestamp: Date.now() - 1000 * 60 * 60 * 2 },
]);

// Computed properties
const missingValueCount = computed(() => {
  if (!props.datasetInfo) return 0;
  return props.datasetInfo.missingValueTypes.length * 10;
});

const datasetStatusIcon = computed(() => {
  if (!props.datasetInfo) {
    return {
      icon: AlertTriangle as Component,
      colorClass: "icon-muted",
      textClass: "text-muted",
      text: "未选择数据集",
    };
  }

  const qualityScore = calculateDataQuality();
  if (qualityScore >= 95) {
    return {
      icon: CheckCircle as Component,
      colorClass: "icon-success",
      textClass: "text-success",
      text: "数据质量优秀",
    };
  } else if (qualityScore >= 80) {
    return {
      icon: AlertTriangle as Component,
      colorClass: "icon-warning",
      textClass: "text-warning",
      text: "数据质量良好",
    };
  } else {
    return { icon: XCircle as Component, colorClass: "icon-danger", textClass: "text-danger", text: "数据质量较差" };
  }
});

// Methods
const calculateDataQuality = (): number => {
  if (!props.datasetInfo) return 0;
  const totalCells = props.datasetInfo.originalFile.rows * props.datasetInfo.originalFile.columns.length;
  const missingCells = missingValueCount.value;
  return ((totalCells - missingCells) / totalCells) * 100;
};

const handleOutlierDetection = async () => {
  if (!props.datasetInfo) {
    ElMessage.warning("请先选择一个数据集");
    return;
  }
  try {
    await ElMessageBox.confirm("开始异常值检测将分析数据中的离群点，是否继续？", "异常值检测", {
      confirmButtonText: "开始检测",
      cancelButtonText: "取消",
      type: "info",
    });
    loadingStates.outlier = true;
    emit("startOutlierDetection", { sensitivity: advancedSettings.outlierSensitivity, method: "iqr" });
    setTimeout(() => {
      loadingStates.outlier = false;
      addRecentOperation("异常检测", "🔍", "completed");
      ElMessage.success("异常值检测已启动");
    }, 2000);
  } catch {
    /* 用户取消 */
  }
};

const handleMissingValueImputation = async () => {
  if (!props.datasetInfo) {
    ElMessage.warning("请先选择一个数据集");
    return;
  }
  loadingStates.missing = true;
  emit("startMissingValueImputation", {
    threshold: advancedSettings.missingThreshold,
    method: "mean",
    mode: advancedSettings.processingMode,
  });
  setTimeout(() => {
    loadingStates.missing = false;
    addRecentOperation("缺失值处理", "🔧", "completed");
    ElMessage.success("缺失值处理已启动");
  }, 1500);
};

const handleDataCleaning = async () => {
  if (!props.datasetInfo) {
    ElMessage.warning("请先选择一个数据集");
    return;
  }
  loadingStates.cleaning = true;
  emit("startDataCleaning", { mode: advancedSettings.processingMode, outputFormat: advancedSettings.outputFormat });
  setTimeout(() => {
    loadingStates.cleaning = false;
    addRecentOperation("数据清洗", "🧹", "completed");
    ElMessage.success("数据清洗已启动");
  }, 2500);
};

const handleGenerateReport = async () => {
  if (!props.datasetInfo) {
    ElMessage.warning("请先选择一个数据集");
    return;
  }
  loadingStates.report = true;
  emit("generateReport", { includeCharts: true, includeStats: true, format: "pdf" });
  setTimeout(() => {
    loadingStates.report = false;
    addRecentOperation("报告生成", "📊", "completed");
    ElMessage.success("报告生成已启动");
  }, 3000);
};

const handleExportData = async () => {
  if (!props.datasetInfo) {
    ElMessage.warning("请先选择一个数据集");
    return;
  }
  loadingStates.export = true;
  emit("exportData", { format: advancedSettings.outputFormat, includeMetadata: true });
  setTimeout(() => {
    loadingStates.export = false;
    addRecentOperation("数据导出", "📤", "completed");
    ElMessage.success("数据导出已启动");
  }, 1000);
};

const addRecentOperation = (name: string, icon: string, status: "completed" | "failed" | "running") => {
  recentOperations.value.unshift({ id: Date.now(), name, icon, status, timestamp: Date.now() });
  if (recentOperations.value.length > 5) recentOperations.value = recentOperations.value.slice(0, 5);
};

const getOperationTagType = (status: string) => {
  const statusMap: Record<string, string> = { completed: "success", failed: "danger", running: "warning" };
  return statusMap[status] || "info";
};

const formatRelativeTime = (timestamp: number): string => formatLocalWithTZ(timestamp);

const viewOperationDetails = (operation: any) => ElMessage.info(`查看操作详情: ${operation.name}`);

const resetAdvancedSettings = () => {
  Object.assign(advancedSettings, {
    processingMode: "auto",
    outputFormat: "csv",
    missingThreshold: 10,
    outlierSensitivity: 5,
  });
  ElMessage.success("设置已重置");
};

const saveAdvancedSettings = () => ElMessage.success("设置已保存");
</script>

<style scoped>
.quick-operation {
  background: var(--c-brand-soft);
  border: 1px solid var(--c-brand-border);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

/* 头部 */
.qo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.qo-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.qo-icon-wrap {
  width: 40px;
  height: 40px;
  background: var(--c-brand);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.qo-icon {
  color: var(--c-text-inverse);
}

.qo-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
  margin: 0 0 2px;
}

.qo-subtitle {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin: 0;
}

/* 状态 */
.qo-status {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
}

.qo-status-icon {
  flex-shrink: 0;
}

.icon-muted {
  color: var(--c-text-disabled);
}
.icon-success {
  color: var(--c-success);
}
.icon-warning {
  color: var(--c-warning);
}
.icon-danger {
  color: var(--c-danger);
}

.text-muted {
  color: var(--c-text-secondary);
}
.text-success {
  color: var(--c-success-text);
}
.text-warning {
  color: var(--c-warning-text);
}
.text-danger {
  color: var(--c-danger-text);
}

/* 操作网格 */
.qo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

/* 折叠面板 */
.qo-collapse {
  margin-top: var(--space-5);
  border-radius: var(--radius-panel);
  overflow: hidden;
}

:deep(.qo-collapse.el-collapse) {
  border: none;
  background: transparent;
}

:deep(.qo-collapse .el-collapse-item__header) {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  padding: var(--space-2) var(--space-3);
  font-weight: var(--font-medium);
}

:deep(.qo-collapse .el-collapse-item__wrap) {
  border: 1px solid var(--c-border);
  border-top: none;
  border-radius: 0 0 var(--radius-panel) var(--radius-panel);
  background: var(--c-bg-surface);
}

:deep(.qo-collapse .el-collapse-item__content) {
  padding-bottom: 0;
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--c-text-base);
  font-size: var(--text-sm);
}

/* 高级设置 */
.advanced-settings {
  padding: var(--space-4);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.setting-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--c-text-base);
}

.threshold-section {
  margin-bottom: var(--space-4);
}

.threshold-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.threshold-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.threshold-label {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
}

:deep(.el-slider__input) {
  width: 60px;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--c-border);
}

/* 最近操作 */
.recent-ops {
  margin-top: var(--space-5);
}

.recent-ops-title {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--c-text-base);
  margin: 0 0 var(--space-2);
}

.recent-ops-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.op-tag {
  cursor: pointer;
  transition: var(--transition-fast);
}

.op-tag:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-xs);
}

.op-icon {
  margin-right: 2px;
}

.op-time {
  margin-left: var(--space-1);
  font-size: var(--text-xs);
  opacity: 0.75;
}
</style>
