<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-100">
    <!-- 选项卡导航 -->
    <div class="border-b border-gray-100">
      <nav class="flex space-x-1 p-1">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="switchTab(tab.id)"
          :disabled="tab.disabled"
          :class="[
            'px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2',
            {
              'bg-emerald-50 text-emerald-700 shadow-sm': activeTab === tab.id,
              'text-gray-600 hover:text-emerald-600 hover:bg-emerald-50/50': activeTab !== tab.id && !tab.disabled,
              'text-gray-400 cursor-not-allowed': tab.disabled,
            },
          ]">
          <span>{{ tab.icon }}</span>
          <span>{{ tab.name }}</span>
          <el-badge v-if="tab.badge" :value="tab.badge" :type="tab.badgeType || 'primary'" class="ml-1" />
        </button>
      </nav>
    </div>

    <!-- 选项卡内容区域 -->
    <div class="min-h-96">
      <!-- 数据概览 -->
      <div v-if="activeTab === 'overview'" class="p-6">
        <DataOverviewPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
      </div>

      <!-- 异常检测 -->
      <div v-else-if="activeTab === 'outlier'" class="p-6">
        <OutlierDetectionPanel
          :dataset-info="datasetInfo"
          :loading="contentLoading"
          @start-detection="handleStartOutlierDetection" />
      </div>

      <!-- 缺失值处理 -->
      <div v-else-if="activeTab === 'missing'" class="p-6">
        <MissingValuePanel
          :dataset-info="datasetInfo"
          :loading="contentLoading"
          @start-imputation="handleStartMissingValueImputation" />
      </div>

      <!-- 数据清洗 -->
      <!--      <div v-else-if="activeTab === 'cleaning'" class="p-6">-->
      <!--        <DataCleaningPanel-->
      <!--          :dataset-info="datasetInfo"-->
      <!--          :loading="contentLoading"-->
      <!--          @start-cleaning="handleStartDataCleaning" />-->
      <!--      </div>-->
      <!--      -->
      <!--      <div v-else-if="activeTab === 'export'" class="p-6">-->
      <!--        <DataExportPanel -->
      <!--          :dataset-info="datasetInfo"-->
      <!--          :loading="contentLoading"-->
      <!--          @export-data="handleExportData"-->
      <!--        />-->
      <!--      </div>-->

      <div v-else class="p-12 text-center">
        <div class="text-6xl mb-4">🚧</div>
        <h3 class="text-xl font-semibold text-gray-600 mb-2">功能开发中</h3>
        <p class="text-gray-500">{{ getTabDescription(activeTab) }}</p>
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
// import DataCleaningPanel from "./DataCleaningPanel.vue";
// import DataExportPanel from "./DataExportPanel.vue";

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
  // 简化计算，实际应该从数据分析结果获取
  return props.datasetInfo.missingValueTypes.length * 10;
});

const hasOutliers = computed(() => {
  // 这里应该从数据分析结果获取，暂时模拟
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

const handleExportData = (options: any) => {
  emit("exportData", options);
};

// Watch for dataset changes
watch(
  () => props.datasetInfo,
  newDataset => {
    if (!newDataset && activeTab.value !== "overview") {
      // 如果数据集被移除且当前不在概览标签，切换到概览
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
/* 选项卡过渡效果 */
.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 200ms;
}

/* 禁用状态样式 */
.cursor-not-allowed {
  cursor: not-allowed;
}

/* Badge 位置调整 */
:deep(.el-badge) {
  vertical-align: top;
}

:deep(.el-badge__content) {
  font-size: 10px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  min-width: 16px;
}
</style>
