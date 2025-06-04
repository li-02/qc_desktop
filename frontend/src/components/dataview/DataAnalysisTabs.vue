<template>
  <div class="bg-white rounded-xl shadow-sm border border-stone-200/80 overflow-hidden">
    <!-- 选项卡导航 - 采用自然生态风格 -->
    <div class="bg-gradient-to-r from-stone-50 via-emerald-50/30 to-green-50/40 border-b border-stone-200/60 px-2 py-3">
      <nav class="flex space-x-2">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="switchTab(tab.id)"
          :disabled="tab.disabled"
          :class="[
            'relative group px-4 py-3.5 text-sm font-medium rounded-xl transition-all duration-300 ease-out flex items-center gap-2.5 min-w-[120px] justify-center',
            {
              // 激活状态 - 自然绿色主题
              'bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-800 shadow-lg shadow-emerald-100/50 border-2 border-emerald-200/60 transform scale-[1.02]': activeTab === tab.id,
              // 未激活状态 - 温润中性色
              'bg-white/70 text-stone-600 hover:text-emerald-700 hover:bg-gradient-to-br hover:from-emerald-50 hover:to-green-50/50 border-2 border-transparent hover:border-emerald-100 hover:shadow-md hover:shadow-stone-200/40 hover:transform hover:scale-[1.01]': activeTab !== tab.id && !tab.disabled,
              // 禁用状态 - 柔和灰色
              'bg-stone-100/50 text-stone-400 cursor-not-allowed border-2 border-stone-100/60': tab.disabled,
            },
          ]">
          <!-- 图标容器 -->
          <div class="relative">
            <span
              class="text-lg leading-none block transform transition-transform duration-200"
              :class="{
                'group-hover:scale-110': !tab.disabled,
                'scale-105': activeTab === tab.id
              }">
              {{ tab.icon }}
            </span>

            <!-- 激活状态的光晕效果 -->
            <div
              v-if="activeTab === tab.id"
              class="absolute inset-0 bg-emerald-400/20 rounded-full blur-sm animate-pulse"></div>
          </div>

          <!-- 标签文字 -->
          <span class="font-semibold tracking-wide">{{ tab.name }}</span>

          <!-- 徽章指示器 - 重新设计 -->
          <div v-if="tab.badge && !tab.disabled" class="relative">
            <div :class="[
              'px-2.5 py-1 rounded-full text-xs font-bold shadow-sm border',
              'transform transition-all duration-200 group-hover:scale-110',
              getBadgeClasses(tab.badgeType)
            ]">
              {{ tab.badge }}
            </div>
            <!-- 徽章光晕效果 -->
            <div class="absolute inset-0 rounded-full blur-sm opacity-30"
                 :class="getBadgeGlowClasses(tab.badgeType)"></div>
          </div>

          <!-- 禁用状态遮罩 -->
          <div
            v-if="tab.disabled"
            class="absolute inset-0 bg-stone-200/20 rounded-xl backdrop-blur-[1px]"></div>
        </button>
      </nav>
    </div>

    <!-- 选项卡内容区域 - 保持原有布局 -->
    <div class="min-h-96 bg-gradient-to-br from-stone-50/30 to-emerald-50/20">
      <!-- 数据概览 -->
      <div v-if="activeTab === 'overview'" class="p-6">
        <div class="bg-white/80 backdrop-blur-sm rounded-xl border border-stone-200/60 shadow-sm p-1">
          <DataOverviewPanel :dataset-info="datasetInfo" :loading="contentLoading" @refresh="handleRefresh" />
        </div>
      </div>

      <!-- 异常检测 -->
      <div v-else-if="activeTab === 'outlier'" class="p-6">
        <div class="bg-white/80 backdrop-blur-sm rounded-xl border border-stone-200/60 shadow-sm p-1">
          <OutlierDetectionPanel
            :dataset-info="datasetInfo"
            :loading="contentLoading"
            @start-detection="handleStartOutlierDetection" />
        </div>
      </div>

      <!-- 缺失值处理 -->
      <div v-else-if="activeTab === 'missing'" class="p-6">
        <div class="bg-white/80 backdrop-blur-sm rounded-xl border border-stone-200/60 shadow-sm p-1">
          <MissingValuePanel
            :dataset-info="datasetInfo"
            :loading="contentLoading"
            @start-imputation="handleStartMissingValueImputation" />
        </div>
      </div>

      <!-- 开发中占位符 - 重新设计 -->
      <div v-else class="p-12 text-center">
        <div class="bg-white/60 backdrop-blur-sm rounded-2xl border-2 border-dashed border-emerald-200/60 p-12 max-w-md mx-auto">
          <!-- 动态图标 -->
          <div class="relative mb-6">
            <div class="text-6xl mb-2 animate-bounce">🚧</div>
            <!-- 装饰性小点 -->
            <div class="flex justify-center space-x-2 mt-2">
              <div class="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></div>
              <div class="w-2 h-2 bg-green-300 rounded-full animate-pulse delay-100"></div>
              <div class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse delay-200"></div>
            </div>
          </div>

          <!-- 标题与描述 -->
          <div class="space-y-3">
            <h3 class="text-xl font-semibold text-stone-700 tracking-wide">功能开发中</h3>
            <div class="w-16 h-0.5 bg-gradient-to-r from-emerald-300 to-green-300 mx-auto rounded-full"></div>
            <p class="text-stone-500 leading-relaxed font-medium">{{ getTabDescription(activeTab) }}</p>
          </div>

          <!-- 装饰性元素 -->
          <div class="mt-8 flex justify-center">
            <div class="flex space-x-1">
              <div class="w-1 h-1 bg-emerald-200 rounded-full"></div>
              <div class="w-1 h-1 bg-green-200 rounded-full"></div>
              <div class="w-1 h-1 bg-emerald-300 rounded-full"></div>
            </div>
          </div>
        </div>
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

// 徽章样式方法
const getBadgeClasses = (type: string = 'primary') => {
  const typeMap = {
    primary: "bg-gradient-to-r from-blue-100 to-blue-200 text-blue-700 border-blue-200",
    success: "bg-gradient-to-r from-emerald-100 to-green-200 text-emerald-700 border-emerald-200",
    warning: "bg-gradient-to-r from-amber-100 to-orange-200 text-amber-700 border-amber-200",
    danger: "bg-gradient-to-r from-rose-100 to-red-200 text-rose-700 border-rose-200",
    info: "bg-gradient-to-r from-stone-100 to-gray-200 text-stone-700 border-stone-200",
  };
  return typeMap[type as keyof typeof typeMap] || typeMap.primary;
};

const getBadgeGlowClasses = (type: string = 'primary') => {
  const glowMap = {
    primary: "bg-blue-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-rose-400",
    info: "bg-stone-400",
  };
  return glowMap[type as keyof typeof glowMap] || glowMap.primary;
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

<style scoped>
/* 高级动画效果 */
@keyframes breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
}

/* 选项卡悬停时的微妙动画 */
.group:hover {
  transform: translateY(-1px);
}

/* 激活选项卡的呼吸效果 */
.scale-105 {
  animation: breathe 3s ease-in-out infinite;
}

/* 渐变背景动画 */
@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
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

/* 背景纹理效果 */
.bg-gradient-to-r.from-stone-50::before {
  content: '';
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

/* 禁用状态的特殊效果 */
.cursor-not-allowed {
  position: relative;
  overflow: hidden;
}

.cursor-not-allowed::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(156, 163, 175, 0.1),
    transparent
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 100%; }
}

/* 响应式调整 */
@media (max-width: 768px) {
  .min-w-\[120px\] {
    min-width: 100px;
    font-size: 0.8rem;
  }

  .space-x-2 > * + * {
    margin-left: 0.25rem;
  }

  .px-4 {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
}
</style>