<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import type { DatasetInfo } from "@shared/types/projectInterface";
import DataOverviewPanel from "./panels/DataOverviewPanel.vue";
import CorrelationAnalysisPanel from "./panels/CorrelationAnalysisPanel.vue";
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
  exportData: [options: any];
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
    id: "correlation",
    name: "相关性分析",
    icon: "🔗",
    disabled: !props.datasetInfo,
    description: "分析变量间的相关性关系",
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
  {
    id: "export",
    name: "导出数据",
    icon: "📤",
    disabled: !props.datasetInfo,
    description: "导出处理后的数据文件",
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

// Event handlers
const handleRefresh = () => {
  emit("refresh");
};

const handleStartOutlierDetection = (options: any) => {
  emit("startOutlierDetection", options);
};

const handleStartMissingValueImputation = (options: any) => {
  emit("startMissingValueImputation", options);
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

<template>
  <div class="data-analysis-tabs">
    <!-- 选项卡导航 - 采用自然生态风格 -->
    <div class="tabs-header">
      <nav class="tabs-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="switchTab(tab.id)"
          :disabled="tab.disabled"
          :class="[
            'tab-button',
            {
              'tab-button--active': activeTab === tab.id,
              'tab-button--inactive': activeTab !== tab.id && !tab.disabled,
              'tab-button--disabled': tab.disabled,
            },
          ]">
          <!-- 图标容器 -->
          <div class="tab-icon-container">
            <span
              class="tab-icon"
              :class="{
                'tab-icon--hover': !tab.disabled,
                'tab-icon--active': activeTab === tab.id,
              }">
              {{ tab.icon }}
            </span>

            <!-- 激活状态的光晕效果 -->
            <div v-if="activeTab === tab.id" class="tab-icon-glow"></div>
          </div>

          <!-- 标签文字 -->
          <span class="tab-text">{{ tab.name }}</span>

          <!-- 徽章指示器 -->
          <div v-if="tab.badge && !tab.disabled" class="tab-badge-container">
            <div :class="['tab-badge', `tab-badge--${tab.badgeType}`]">
              {{ tab.badge }}
            </div>
            <!-- 徽章光晕效果 -->
            <div class="tab-badge-glow" :class="`tab-badge-glow--${tab.badgeType}`"></div>
          </div>

          <!-- 禁用状态遮罩 -->
          <div v-if="tab.disabled" class="tab-disabled-mask"></div>
        </button>
      </nav>
    </div>

    <!-- 选项卡内容区域 -->
    <div class="tabs-content">
      <!-- 数据概览 -->
      <div v-if="activeTab === 'overview'" class="tab-panel">
        <div class="panel-wrapper">
          <DataOverviewPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
        </div>
      </div>

      <!-- 相关性分析 -->
      <div v-else-if="activeTab === 'correlation'" class="tab-panel">
        <div class="panel-wrapper">
          <CorrelationAnalysisPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
        </div>
      </div>

      <!-- 异常检测 -->
      <div v-else-if="activeTab === 'outlier'" class="tab-panel full-height-panel">
        <div class="panel-wrapper full-height-wrapper">
          <OutlierDetectionPanel
            :dataset-info="datasetInfo"
            :loading="contentLoading"
            @start-detection="handleStartOutlierDetection" />
        </div>
      </div>

      <!-- 缺失值处理 -->
      <div v-else-if="activeTab === 'missing'" class="tab-panel">
        <div class="panel-wrapper">
          <MissingValuePanel
            :dataset-info="datasetInfo"
            :loading="contentLoading"
            @start-imputation="handleStartMissingValueImputation" />
        </div>
      </div>

      <!-- 开发中占位符 -->
      <div v-else class="tab-panel tab-panel--placeholder">
        <div class="placeholder-container">
          <!-- 动态图标 -->
          <div class="placeholder-icon">
            <div class="placeholder-emoji">🚧</div>
            <!-- 装饰性小点 -->
            <div class="placeholder-dots">
              <div class="placeholder-dot placeholder-dot--1"></div>
              <div class="placeholder-dot placeholder-dot--2"></div>
              <div class="placeholder-dot placeholder-dot--3"></div>
            </div>
          </div>

          <!-- 标题与描述 -->
          <div class="placeholder-content">
            <h3 class="placeholder-title">功能开发中</h3>
            <div class="placeholder-divider"></div>
            <p class="placeholder-description">{{ getTabDescription(activeTab) }}</p>
          </div>

          <!-- 装饰性元素 -->
          <div class="placeholder-decoration">
            <div class="decoration-dots">
              <div class="decoration-dot decoration-dot--1"></div>
              <div class="decoration-dot decoration-dot--2"></div>
              <div class="decoration-dot decoration-dot--3"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 主容器 */
.data-analysis-tabs {
  background: white;
  border-radius: 12px;
  box-shadow:
    0 1px 3px 0 rgba(0, 0, 0, 0.1),
    0 1px 2px 0 rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(120, 113, 108, 0.2);
  overflow: hidden;
  height: 100%; /* 占满父容器 */
  display: flex;
  flex-direction: column;
}

/* 选项卡头部 */
.tabs-header {
  flex-shrink: 0; /* 防止头部被压缩 */
  background: linear-gradient(
    to right,
    rgba(250, 250, 249, 1) 0%,
    rgba(236, 253, 245, 0.3) 50%,
    rgba(240, 253, 244, 0.4) 100%
  );
  border-bottom: 1px solid rgba(120, 113, 108, 0.15);
  padding: 8px;
  position: relative;
}

.tabs-header::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image:
    radial-gradient(circle at 25% 25%, rgba(34, 197, 94, 0.03) 0%, transparent 25%),
    radial-gradient(circle at 75% 75%, rgba(74, 222, 128, 0.03) 0%, transparent 25%);
  pointer-events: none;
}

.tabs-nav {
  display: flex;
  gap: 8px;
  position: relative;
  z-index: 1;
}

/* 选项卡按钮 */
.tab-button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 120px;
  justify-content: center;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  background: none;
  outline: none;
}

.tab-button:hover {
  transform: translateY(-1px);
}

/* 激活状态 */
.tab-button--active {
  background: linear-gradient(135deg, rgba(209, 250, 229, 1) 0%, rgba(187, 247, 208, 1) 100%);
  color: rgba(6, 78, 59, 1);
  box-shadow:
    0 10px 15px -3px rgba(16, 185, 129, 0.1),
    0 4px 6px -2px rgba(16, 185, 129, 0.05);
  border-color: rgba(167, 243, 208, 0.6);
  transform: scale(1.02);
}

/* 未激活状态 */
.tab-button--inactive {
  background: rgba(255, 255, 255, 0.7);
  color: rgba(87, 83, 78, 1);
}

.tab-button--inactive:hover {
  color: rgba(4, 120, 87, 1);
  background: linear-gradient(135deg, rgba(236, 253, 245, 1) 0%, rgba(240, 253, 244, 0.5) 100%);
  border-color: rgba(209, 250, 229, 1);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transform: scale(1.01) translateY(-1px);
}

/* 禁用状态 */
.tab-button--disabled {
  background: rgba(245, 245, 244, 0.5);
  color: rgba(168, 162, 158, 1);
  cursor: not-allowed;
  border-color: rgba(245, 245, 244, 0.6);
  position: relative;
  overflow: hidden;
}

.tab-button--disabled::after {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(156, 163, 175, 0.1), transparent);
  animation: shimmer 2s infinite;
}

/* 图标容器 */
.tab-icon-container {
  position: relative;
}

.tab-icon {
  font-size: 18px;
  line-height: 1;
  display: block;
  transition: transform 0.2s ease;
}

.tab-icon--hover:hover {
  transform: scale(1.1);
}

.tab-icon--active {
  transform: scale(1.05);
  animation: breathe 3s ease-in-out infinite;
}

.tab-icon-glow {
  position: absolute;
  inset: 0;
  background: rgba(52, 211, 153, 0.2);
  border-radius: 50%;
  filter: blur(4px);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 标签文字 */
.tab-text {
  font-weight: 600;
  letter-spacing: 0.025em;
}

/* 徽章 */
.tab-badge-container {
  position: relative;
}

.tab-badge {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  border: 1px solid;
  transform: scale(1);
  transition: all 0.2s ease;
}

.tab-button:hover .tab-badge {
  transform: scale(1.1);
}

.tab-badge--primary {
  background: linear-gradient(to right, rgba(219, 234, 254, 1), rgba(191, 219, 254, 1));
  color: rgba(29, 78, 216, 1);
  border-color: rgba(191, 219, 254, 1);
}

.tab-badge--success {
  background: linear-gradient(to right, rgba(209, 250, 229, 1), rgba(187, 247, 208, 1));
  color: rgba(4, 120, 87, 1);
  border-color: rgba(167, 243, 208, 1);
}

.tab-badge--warning {
  background: linear-gradient(to right, rgba(254, 243, 199, 1), rgba(253, 230, 138, 1));
  color: rgba(146, 64, 14, 1);
  border-color: rgba(252, 211, 77, 1);
}

.tab-badge--danger {
  background: linear-gradient(to right, rgba(254, 242, 242, 1), rgba(254, 202, 202, 1));
  color: rgba(153, 27, 27, 1);
  border-color: rgba(252, 165, 165, 1);
}

.tab-badge--info {
  background: linear-gradient(to right, rgba(250, 250, 249, 1), rgba(245, 245, 244, 1));
  color: rgba(68, 64, 60, 1);
  border-color: rgba(231, 229, 228, 1);
}

.tab-badge-glow {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  filter: blur(4px);
  opacity: 0.3;
}

.tab-badge-glow--primary {
  background: rgba(59, 130, 246, 1);
}
.tab-badge-glow--success {
  background: rgba(52, 211, 153, 1);
}
.tab-badge-glow--warning {
  background: rgba(251, 191, 36, 1);
}
.tab-badge-glow--danger {
  background: rgba(239, 68, 68, 1);
}
.tab-badge-glow--info {
  background: rgba(120, 113, 108, 1);
}

/* 禁用遮罩 */
.tab-disabled-mask {
  position: absolute;
  inset: 0;
  background: rgba(231, 229, 228, 0.2);
  border-radius: 12px;
  backdrop-filter: blur(1px);
}

/* 选项卡内容 */
.tabs-content {
  /* min-height: 384px; */
  background: linear-gradient(135deg, rgba(250, 250, 249, 0.3) 0%, rgba(236, 253, 245, 0.2) 100%);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-panel {
  padding: 24px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.tab-panel--placeholder {
  padding: 48px;
  text-align: center;
  align-items: center;
  justify-content: center;
}

.panel-wrapper {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  border: 1px solid rgba(120, 113, 108, 0.15);
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  padding: 4px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 占位符样式 */
.placeholder-container {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(4px);
  border-radius: 16px;
  border: 2px dashed rgba(167, 243, 208, 0.6);
  padding: 48px;
  max-width: 384px;
  margin: 0 auto;
}

.placeholder-icon {
  position: relative;
  margin-bottom: 24px;
}

.placeholder-emoji {
  font-size: 60px;
  margin-bottom: 8px;
  animation: bounce 1s infinite;
}

.placeholder-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.placeholder-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.placeholder-dot--1 {
  background: rgba(110, 231, 183, 1);
}

.placeholder-dot--2 {
  background: rgba(34, 197, 94, 1);
  animation-delay: 0.1s;
}

.placeholder-dot--3 {
  background: rgba(52, 211, 153, 1);
  animation-delay: 0.2s;
}

.placeholder-content {
  margin-bottom: 32px;
}

.placeholder-title {
  font-size: 20px;
  font-weight: 600;
  color: rgba(68, 64, 60, 1);
  letter-spacing: 0.025em;
  margin-bottom: 12px;
}

.placeholder-divider {
  width: 64px;
  height: 2px;
  background: linear-gradient(to right, rgba(110, 231, 183, 1), rgba(34, 197, 94, 1));
  margin: 0 auto;
  border-radius: 9999px;
  margin-bottom: 12px;
}

.placeholder-description {
  color: rgba(120, 113, 108, 1);
  line-height: 1.625;
  font-weight: 500;
}

.placeholder-decoration {
  display: flex;
  justify-content: center;
}

.decoration-dots {
  display: flex;
  gap: 4px;
}

.decoration-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
}

.decoration-dot--1 {
  background: rgba(167, 243, 208, 1);
}
.decoration-dot--2 {
  background: rgba(34, 197, 94, 1);
}
.decoration-dot--3 {
  background: rgba(110, 231, 183, 1);
}

/* 高级动画效果 */
@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
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

/* 自定义滚动条 */
:deep(.overflow-y-auto::-webkit-scrollbar) {
  width: 6px;
}

:deep(.overflow-y-auto::-webkit-scrollbar-track) {
  background: rgba(120, 113, 108, 0.1);
  border-radius: 3px;
}

:deep(.overflow-y-auto::-webkit-scrollbar-thumb) {
  background: rgba(34, 197, 94, 0.3);
  border-radius: 3px;
  transition: background 0.2s ease;
}

:deep(.overflow-y-auto::-webkit-scrollbar-thumb:hover) {
  background: rgba(34, 197, 94, 0.5);
}

/* 响应式调整 */
@media (max-width: 768px) {
  .tab-button {
    min-width: 100px;
    font-size: 12px;
    padding: 12px;
  }

  .tabs-nav {
    gap: 4px;
  }

  .tab-panel {
    padding: 16px;
  }

  .tab-panel--placeholder {
    padding: 32px;
  }

  .placeholder-container {
    padding: 32px;
  }

  .placeholder-emoji {
    font-size: 48px;
  }

  .placeholder-title {
    font-size: 18px;
  }
}

/* 全屏面板样式 */
.full-height-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 0 !important; /* 覆盖默认padding */
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
  border-radius: 0;
  padding: 0;
}
</style>
