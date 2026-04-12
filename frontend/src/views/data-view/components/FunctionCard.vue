<template>
  <div class="function-card">
    <!-- 选项卡导航 -->
    <div class="tab-nav-bar">
      <nav class="tab-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="switchTab(tab.id)"
          :disabled="tab.disabled"
          :class="['tab-btn', { 'is-active': activeTab === tab.id, 'is-disabled': tab.disabled }]">
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-name">{{ tab.name }}</span>
          <el-badge v-if="tab.badge" :value="tab.badge" :type="tab.badgeType || 'primary'" class="tab-badge" />
        </button>
      </nav>
    </div>

    <!-- 选项卡内容区域 -->
    <div class="tab-content">
      <!-- 数据概览 -->
      <div v-if="activeTab === 'overview'" class="tab-pane">
        <DataOverviewPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
      </div>

      <!-- 异常检测 -->
      <div v-else-if="activeTab === 'outlier'" class="tab-pane">
        <OutlierDetectionPanel
          :dataset-info="datasetInfo"
          :loading="contentLoading"
          @start-detection="handleStartOutlierDetection" />
      </div>

      <!-- 缺失值处理 -->
      <div v-else-if="activeTab === 'missing'" class="tab-pane">
        <MissingValuePanel
          :dataset-info="datasetInfo"
          :loading="contentLoading"
          @start-imputation="handleStartMissingValueImputation" />
      </div>

      <!-- 数据清洗 -->
      <div v-else-if="activeTab === 'cleaning'" class="tab-pane">
        <DataCleaningPanel
          :dataset-info="datasetInfo"
          :loading="contentLoading"
          @start-cleaning="handleStartDataCleaning" />
      </div>

      <!-- 数据导出 -->
      <div v-else-if="activeTab === 'export'" class="tab-pane">
        <DataExportPanel :dataset-info="datasetInfo" :loading="contentLoading" @export-data="handleExportData" />
      </div>

      <!-- 开发中占位符 -->
      <div v-else class="tab-pane tab-placeholder">
        <div class="placeholder-icon">🚧</div>
        <h3 class="placeholder-title">功能开发中</h3>
        <p class="placeholder-desc">{{ getTabDescription(activeTab) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import type { DatasetInfo } from "@shared/types/projectInterface";
import DataOverviewPanel from "./panels/DataOverviewPanel.vue";
import OutlierDetectionPanel from "./panels/OutlierDetectionPanel.vue";
import MissingValuePanel from "./panels/GapFillingPanel.vue";

// Props
interface Props {
  datasetInfo?: DatasetInfo | null;
  contentLoading?: boolean;
  defaultTab?: string;
}

const props = withDefaults(defineProps<Props>(), {
  contentLoading: false,
  defaultTab: "overview",
});

// Emits
const emit = defineEmits<{
  tabChange: [tabId: string];
  refresh: [];
  startOutlierDetection: [options: any];
  startMissingValueImputation: [options: any];
  startDataCleaning: [options: any];
}>();

// Reactive state
const activeTab = ref(props.defaultTab);

// Tab configuration
const tabs = computed(() => [
  {
    id: "overview",
    name: "数据概览",
    icon: "📈",
    disabled: false,
    description: "查看数据集的基本统计信息和分布",
  },
  {
    id: "outlier",
    name: "异常检测",
    icon: "🔍",
    disabled: !props.datasetInfo,
    badge: hasOutliers.value ? "!" : null,
    badgeType: "warning" as const,
    description: "识别和处理数据中的异常值",
  },
  {
    id: "missing",
    name: "缺失值处理",
    icon: "🔧",
    disabled: !props.datasetInfo,
    badge: hasMissingValues.value ? missingValueCount.value : null,
    badgeType: "danger" as const,
    description: "检测和填补数据中的缺失值",
  },
  {
    id: "cleaning",
    name: "数据清洗",
    icon: "🧹",
    disabled: !props.datasetInfo,
    description: "数据格式化和标准化处理",
  },
]);

// Computed properties
const hasMissingValues = computed(() => {
  return props.datasetInfo?.missingValueTypes && props.datasetInfo.missingValueTypes.length > 0;
});

const missingValueCount = computed(() => {
  if (!props.datasetInfo) return 0;
  return props.datasetInfo.missingValueTypes.length * 10;
});

const hasOutliers = computed(() => {
  return props.datasetInfo && Math.random() > 0.5;
});

// Methods
const switchTab = (tabId: string) => {
  const tab = tabs.value.find(t => t.id === tabId);
  if (tab?.disabled) {
    ElMessage.warning("请先选择一个数据集");
    return;
  }

  activeTab.value = tabId;
  emit("tabChange", tabId);
};

const getTabDescription = (tabId: string) => {
  const tab = tabs.value.find(t => t.id === tabId);
  return tab?.description || "功能即将推出...";
};

const handleRefresh = () => {
  emit("refresh");
};

const handleStartOutlierDetection = (options: any) => {
  emit("startOutlierDetection", options);
};

const handleStartMissingValueImputation = (options: any) => {
  emit("startMissingValueImputation", options);
};

const handleStartDataCleaning = (options: any) => {
  emit("startDataCleaning", options);
};

// Watch for dataset changes
watch(
  () => props.datasetInfo,
  newDataset => {
    if (!newDataset && activeTab.value !== "overview") {
      activeTab.value = "overview";
      emit("tabChange", "overview");
    }
  },
  { immediate: true }
);

// Expose methods
defineExpose({
  switchTab,
  activeTab: activeTab,
});
</script>

<style scoped>
.function-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  overflow: hidden;
}

/* 导航栏 */
.tab-nav-bar {
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg-muted);
}

.tab-nav {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-btn);
  background: transparent;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--c-text-secondary);
  cursor: pointer;
  transition: var(--transition-fast);
  white-space: nowrap;
}

.tab-btn:hover:not(.is-disabled) {
  color: var(--c-brand);
  background: var(--c-brand-soft);
}

.tab-btn.is-active {
  background: var(--c-brand-soft);
  color: var(--c-brand);
  box-shadow: var(--shadow-xs);
}

.tab-btn.is-disabled {
  color: var(--c-text-disabled);
  cursor: not-allowed;
}

.tab-icon {
  font-size: var(--text-base);
}

.tab-name {
  font-size: var(--text-sm);
}

.tab-badge {
  margin-left: var(--space-1);
  vertical-align: top;
}

:deep(.tab-badge .el-badge__content) {
  font-size: var(--text-2xs);
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  min-width: 16px;
}

/* 内容区 */
.tab-content {
  min-height: 384px;
}

.tab-pane {
  padding: var(--space-5);
}

/* 占位符 */
.tab-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-10);
  text-align: center;
}

.placeholder-icon {
  font-size: var(--text-display-lg);
  margin-bottom: var(--space-3);
}

.placeholder-title {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--c-text-secondary);
  margin: 0 0 var(--space-2);
}

.placeholder-desc {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  margin: 0;
}
</style>
