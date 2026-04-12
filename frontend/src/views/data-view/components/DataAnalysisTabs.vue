<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import type { DatasetInfo } from "@shared/types/projectInterface";
import DataOverviewPanel from "./panels/DataOverviewPanel.vue";
import OutlierDetectionPanel from "./panels/OutlierDetectionPanel.vue";
import MissingValuePanel from "./panels/GapFillingPanel.vue";
import FluxPartitioningPanel from "./panels/FluxPartitioningPanel.vue";
import ExportDataPanel from "./panels/ExportDataPanel.vue";

interface Props {
  datasetInfo?: DatasetInfo | null;
  contentLoading?: boolean;
  defaultTab?: string;
  initialBusinessResultId?: string;
  initialVersionId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  contentLoading: false,
  defaultTab: "overview",
});

const emit = defineEmits<{
  tabChange: [tabId: string];
  refresh: [];
  startOutlierDetection: [options: any];
  startMissingValueImputation: [options: any];
  startDataCleaning: [options: any];
  exportData: [options: any];
}>();

const activeTab = ref(props.defaultTab);

const tabs = computed(() => [
  { id: "overview", name: "数据概览", icon: "📈", disabled: false, description: "查看数据集的基本统计信息和分布" },
  {
    id: "outlier",
    name: "异常值检测",
    icon: "🔍",
    disabled: !props.datasetInfo,
    description: "识别和过滤数据中的异常值",
  },
  {
    id: "missing",
    name: "缺失值插补",
    icon: "🔧",
    disabled: !props.datasetInfo,
    description: "对数据中的缺失值进行科学插补",
  },
  {
    id: "flux-partitioning",
    name: "通量分割",
    icon: "📊",
    disabled: !props.datasetInfo,
    description: "将NEE分解为GPP与Reco，ET分解为T与E",
  },
  { id: "export", name: "导出数据", icon: "📤", disabled: !props.datasetInfo, description: "导出处理后的数据文件" },
]);

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

const handleRefresh = () => emit("refresh");
const handleStartOutlierDetection = (options: any) => emit("startOutlierDetection", options);
const handleStartMissingValueImputation = (options: any) => emit("startMissingValueImputation", options);

watch(
  () => props.datasetInfo,
  (newDataset, oldDataset) => {
    if (!newDataset && oldDataset && activeTab.value !== "overview") {
      activeTab.value = "overview";
      emit("tabChange", "overview");
    }
  }
);

watch(
  () => props.defaultTab,
  newTab => {
    if (newTab && newTab !== activeTab.value) {
      const tab = tabs.value.find(t => t.id === newTab);
      if (tab && !tab.disabled) activeTab.value = newTab;
    }
  }
);

defineExpose({ switchTab, activeTab });
</script>

<template>
  <div class="data-analysis-tabs">
    <div class="tabs-header">
      <nav class="tabs-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :disabled="tab.disabled"
          :class="[
            'tab-button',
            {
              'tab-button--active': activeTab === tab.id,
              'tab-button--inactive': activeTab !== tab.id && !tab.disabled,
              'tab-button--disabled': tab.disabled,
            },
          ]"
          @click="switchTab(tab.id)">
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-text">{{ tab.name }}</span>
          <div v-if="tab.disabled" class="tab-disabled-mask"></div>
        </button>
      </nav>
    </div>

    <div class="tabs-content">
      <div v-if="activeTab === 'overview'" class="tab-panel">
        <div class="panel-wrapper">
          <DataOverviewPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
        </div>
      </div>

      <div v-else-if="activeTab === 'outlier'" class="tab-panel full-height-panel">
        <div class="panel-wrapper full-height-wrapper">
          <OutlierDetectionPanel
            :dataset-info="datasetInfo"
            :loading="contentLoading"
            :initial-result-id="initialBusinessResultId"
            @start-detection="handleStartOutlierDetection" />
        </div>
      </div>

      <div v-else-if="activeTab === 'missing'" class="tab-panel full-height-panel">
        <div class="panel-wrapper full-height-wrapper">
          <MissingValuePanel
            :dataset-info="datasetInfo"
            :loading="contentLoading"
            @start-imputation="handleStartMissingValueImputation" />
        </div>
      </div>

      <div v-else-if="activeTab === 'flux-partitioning'" class="tab-panel full-height-panel">
        <div class="panel-wrapper full-height-wrapper">
          <FluxPartitioningPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
        </div>
      </div>

      <div v-else-if="activeTab === 'export'" class="tab-panel full-height-panel">
        <div class="panel-wrapper full-height-wrapper">
          <ExportDataPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
        </div>
      </div>

      <div v-else class="tab-panel tab-panel--placeholder">
        <div class="placeholder-container">
          <div class="placeholder-emoji">🚧</div>
          <div class="placeholder-dots">
            <div class="placeholder-dot placeholder-dot--1"></div>
            <div class="placeholder-dot placeholder-dot--2"></div>
            <div class="placeholder-dot placeholder-dot--3"></div>
          </div>
          <h3 class="placeholder-title">功能开发中</h3>
          <div class="placeholder-divider"></div>
          <p class="placeholder-description">{{ getTabDescription(activeTab) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-analysis-tabs {
  background: var(--c-bg-surface);
  border-radius: var(--radius-panel);
  border: none;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tabs-header {
  flex-shrink: 0;
  background: var(--c-bg-surface);
  border-bottom: 1px solid var(--c-border);
  box-shadow: var(--shadow-xs);
  padding: 9px var(--space-3);
  position: relative;
  z-index: 20;
}

.tabs-nav {
  display: flex;
  gap: var(--space-1);
  padding: 3px;
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border);
}

.tab-button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  padding: var(--space-3) 14px;
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  border-radius: var(--radius-btn);
  border: 1px solid transparent;
  transition: var(--transition-fast);
  cursor: pointer;
  background: transparent;
  outline: none;
  white-space: nowrap;
  color: var(--c-text-secondary);
}

.tab-button--active {
  background: var(--c-bg-surface);
  color: var(--c-brand-hover);
  box-shadow: var(--shadow-xs);
  border-color: var(--c-brand-border);
  font-weight: var(--font-semibold);
}

.tab-button--inactive:hover {
  color: var(--c-brand-hover);
  background: var(--c-bg-surface);
}

.tab-button--disabled {
  color: var(--c-text-disabled);
  cursor: not-allowed;
  overflow: hidden;
}

.tab-icon {
  font-size: var(--text-lg);
  line-height: 1;
}

.tab-text {
  font-size: var(--text-base);
  letter-spacing: 0.01em;
}

.tab-disabled-mask {
  position: absolute;
  inset: 0;
  background: rgba(231, 229, 228, 0.2);
  border-radius: var(--radius-btn);
}

.tabs-content {
  background: var(--c-bg-page);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-panel {
  padding: var(--space-4) 0 0 0;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.tab-panel--placeholder {
  padding: var(--space-10);
  align-items: center;
  justify-content: center;
}

.panel-wrapper {
  background: var(--c-bg-surface);
  border-radius: var(--radius-card);
  border: none;
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.placeholder-container {
  background: var(--c-bg-surface);
  border-radius: var(--radius-card);
  border: 2px dashed var(--c-brand-border);
  padding: var(--space-10);
  max-width: 384px;
  margin: 0 auto;
  text-align: center;
}

.placeholder-emoji {
  font-size: var(--text-display-xl);
  margin-bottom: var(--space-2);
  animation: bounce 1s infinite;
}

.placeholder-dots {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  margin-bottom: var(--space-6);
}

.placeholder-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.placeholder-dot--1 {
  background: var(--color-primary-300);
}
.placeholder-dot--2 {
  background: var(--color-primary-500);
  animation-delay: 0.1s;
}
.placeholder-dot--3 {
  background: var(--color-primary-400);
  animation-delay: 0.2s;
}

.placeholder-title {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
  letter-spacing: 0.025em;
  margin-bottom: var(--space-3);
}

.placeholder-divider {
  width: 64px;
  height: 2px;
  background: var(--c-brand);
  margin: 0 auto var(--space-3);
  border-radius: var(--radius-full);
}

.placeholder-description {
  color: var(--c-text-secondary);
  line-height: 1.625;
  font-weight: var(--font-medium);
  font-size: var(--text-base);
}

.full-height-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 !important;
}

.full-height-wrapper {
  flex: 1;
  position: relative;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: none;
  background: transparent;
  box-shadow: none;
  border-radius: var(--radius-panel);
  padding: 0;
}

@keyframes bounce {
  0%,
  20%,
  53%,
  80%,
  100% {
    animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
    transform: translate3d(0, 0, 0);
  }
  40%,
  43% {
    animation-timing-function: cubic-bezier(0.755, 0.05, 0.855, 0.06);
    transform: translate3d(0, -30px, 0);
  }
  70% {
    animation-timing-function: cubic-bezier(0.755, 0.05, 0.855, 0.06);
    transform: translate3d(0, -15px, 0);
  }
  90% {
    transform: translate3d(0, -4px, 0);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
