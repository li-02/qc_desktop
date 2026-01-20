<template>
  <div class="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
          <el-icon class="text-white text-lg">
            <Lightning />
          </el-icon>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gray-800">⚡ 快速操作</h3>
          <p class="text-sm text-gray-600">选择下方操作开始数据处理流程</p>
        </div>
      </div>

      <!-- 数据集状态指示器 -->
      <div v-if="datasetInfo" class="flex items-center gap-2 text-sm">
        <el-icon :class="datasetStatusIcon.color">
          <component :is="datasetStatusIcon.icon" />
        </el-icon>
        <span :class="datasetStatusIcon.textColor">{{ datasetStatusIcon.text }}</span>
      </div>
    </div>

    <!-- 操作按钮网格 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      <!-- 异常检测 -->
      <ActionButton
        icon="🔍"
        title="异常检测"
        description="识别数据中的异常值"
        :disabled="!datasetInfo"
        :loading="loadingStates.outlier"
        color="emerald"
        @click="handleOutlierDetection" />

      <!-- 缺失值处理 -->
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

      <!-- 数据清洗 -->
      <ActionButton
        icon="🧹"
        title="数据清洗"
        description="格式化和标准化数据"
        :disabled="!datasetInfo"
        :loading="loadingStates.cleaning"
        color="purple"
        @click="handleDataCleaning" />

      <!-- 生成报告 -->
      <ActionButton
        icon="📊"
        title="生成报告"
        description="创建数据分析报告"
        :disabled="!datasetInfo"
        :loading="loadingStates.report"
        color="orange"
        @click="handleGenerateReport" />

      <!-- 导出数据 -->
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
    <el-collapse v-model="activeCollapse" class="mt-6 bg-white/50 rounded-lg">
      <el-collapse-item name="advanced" class="border-none">
        <template #title>
          <div class="flex items-center gap-2 text-gray-700">
            <el-icon><Setting /></el-icon>
            <span class="font-medium">高级设置</span>
          </div>
        </template>

        <div class="space-y-4 p-4 bg-white rounded-lg">
          <!-- 处理选项 -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">处理模式</label>
              <el-radio-group v-model="advancedSettings.processingMode" size="small">
                <el-radio-button label="auto">自动</el-radio-button>
                <el-radio-button label="manual">手动</el-radio-button>
                <el-radio-button label="batch">批量</el-radio-button>
              </el-radio-group>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">输出格式</label>
              <el-select v-model="advancedSettings.outputFormat" size="small" style="width: 100%">
                <el-option label="CSV" value="csv" />
                <el-option label="Excel" value="excel" />
                <el-option label="JSON" value="json" />
                <el-option label="Parquet" value="parquet" />
              </el-select>
            </div>
          </div>

          <!-- 质量阈值设置 -->
          <div class="space-y-3">
            <label class="block text-sm font-medium text-gray-700">数据质量阈值</label>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs text-gray-500 mb-1">缺失值容忍度</label>
                <el-slider
                  v-model="advancedSettings.missingThreshold"
                  :min="0"
                  :max="50"
                  :step="5"
                  show-input
                  size="small" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">异常值敏感度</label>
                <el-slider v-model="advancedSettings.outlierSensitivity" :min="1" :max="10" show-input size="small" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">相关性阈值</label>
                <el-slider
                  v-model="advancedSettings.correlationThreshold"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  show-input
                  size="small" />
              </div>
            </div>
          </div>

          <!-- 保存和重置 -->
          <div class="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <el-button size="small" @click="resetAdvancedSettings">重置</el-button>
            <el-button type="primary" size="small" @click="saveAdvancedSettings">保存设置</el-button>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- 操作历史 -->
    <div v-if="recentOperations.length > 0" class="mt-6">
      <h4 class="text-sm font-medium text-gray-700 mb-3">📝 最近操作</h4>
      <div class="flex flex-wrap gap-2">
        <el-tag
          v-for="op in recentOperations"
          :key="op.id"
          :type="getOperationTagType(op.status)"
          size="small"
          class="cursor-pointer"
          @click="viewOperationDetails(op)">
          <span class="mr-1">{{ op.icon }}</span>
          {{ op.name }}
          <span class="ml-1 text-xs opacity-75">{{ formatRelativeTime(op.timestamp) }}</span>
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { formatLocalWithTZ } from '@/utils/timeUtils';
import { ElMessage, ElMessageBox } from "element-plus";
import { Lightning, Setting } from "@element-plus/icons-vue";
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
  correlationThreshold: 0.3,
});

const recentOperations = ref([
  {
    id: 1,
    name: "异常检测",
    icon: "🔍",
    status: "completed",
    timestamp: Date.now() - 1000 * 60 * 5, // 5分钟前
  },
  {
    id: 2,
    name: "缺失值填补",
    icon: "🔧",
    status: "failed",
    timestamp: Date.now() - 1000 * 60 * 15, // 15分钟前
  },
  {
    id: 3,
    name: "数据导出",
    icon: "📤",
    status: "completed",
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2小时前
  },
]);

// Computed properties
const missingValueCount = computed(() => {
  if (!props.datasetInfo) return 0;
  return props.datasetInfo.missingValueTypes.length * 10; // 简化计算
});

const datasetStatusIcon = computed(() => {
  if (!props.datasetInfo) {
    return {
      icon: "WarningFilled",
      color: "text-gray-400",
      textColor: "text-gray-500",
      text: "未选择数据集",
    };
  }

  const qualityScore = calculateDataQuality();
  if (qualityScore >= 95) {
    return {
      icon: "SuccessFilled",
      color: "text-emerald-500",
      textColor: "text-emerald-600",
      text: "数据质量优秀",
    };
  } else if (qualityScore >= 80) {
    return {
      icon: "WarningFilled",
      color: "text-yellow-500",
      textColor: "text-yellow-600",
      text: "数据质量良好",
    };
  } else {
    return {
      icon: "CircleCloseFilled",
      color: "text-red-500",
      textColor: "text-red-600",
      text: "数据质量较差",
    };
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

    const options = {
      sensitivity: advancedSettings.outlierSensitivity,
      method: "iqr", // 可以基于用户选择调整
    };

    emit("startOutlierDetection", options);

    // 模拟异步操作
    setTimeout(() => {
      loadingStates.outlier = false;
      addRecentOperation("异常检测", "🔍", "completed");
      ElMessage.success("异常值检测已启动");
    }, 2000);
  } catch {
    // 用户取消操作
  }
};

const handleMissingValueImputation = async () => {
  if (!props.datasetInfo) {
    ElMessage.warning("请先选择一个数据集");
    return;
  }

  loadingStates.missing = true;

  const options = {
    threshold: advancedSettings.missingThreshold,
    method: "mean", // 可以基于用户选择调整
    mode: advancedSettings.processingMode,
  };

  emit("startMissingValueImputation", options);

  // 模拟异步操作
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

  const options = {
    mode: advancedSettings.processingMode,
    outputFormat: advancedSettings.outputFormat,
  };

  emit("startDataCleaning", options);

  // 模拟异步操作
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

  const options = {
    includeCharts: true,
    includeStats: true,
    format: "pdf",
  };

  emit("generateReport", options);

  // 模拟异步操作
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

  const options = {
    format: advancedSettings.outputFormat,
    includeMetadata: true,
  };

  emit("exportData", options);

  // 模拟异步操作
  setTimeout(() => {
    loadingStates.export = false;
    addRecentOperation("数据导出", "📤", "completed");
    ElMessage.success("数据导出已启动");
  }, 1000);
};

const addRecentOperation = (name: string, icon: string, status: "completed" | "failed" | "running") => {
  const newOp = {
    id: Date.now(),
    name,
    icon,
    status,
    timestamp: Date.now(),
  };

  recentOperations.value.unshift(newOp);

  // 只保留最近的5个操作
  if (recentOperations.value.length > 5) {
    recentOperations.value = recentOperations.value.slice(0, 5);
  }
};

const getOperationTagType = (status: string) => {
  const statusMap: Record<string, string> = {
    completed: "success",
    failed: "danger",
    running: "warning",
  };
  return statusMap[status] || "info";
};

const formatRelativeTime = (timestamp: number): string => {
  // 按要求显示 本地时间 + 时区 后缀
  return formatLocalWithTZ(timestamp);
};

const viewOperationDetails = (operation: any) => {
  ElMessage.info(`查看操作详情: ${operation.name}`);
  // 这里可以打开操作详情弹窗
};

const resetAdvancedSettings = () => {
  Object.assign(advancedSettings, {
    processingMode: "auto",
    outputFormat: "csv",
    missingThreshold: 10,
    outlierSensitivity: 5,
    correlationThreshold: 0.3,
  });
  ElMessage.success("设置已重置");
};

const saveAdvancedSettings = () => {
  // 这里应该保存设置到本地存储或发送到后端
  ElMessage.success("设置已保存");
};
</script>

<style scoped>
/* 折叠面板样式 */
:deep(.el-collapse) {
  border: none;
  background: transparent;
}

:deep(.el-collapse-item__header) {
  background: transparent;
  border: none;
  padding-left: 0;
  font-weight: 500;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 0;
}

:deep(.el-collapse-item__wrap) {
  border: none;
  background: transparent;
}

/* 滑块样式 */
:deep(.el-slider__input) {
  width: 60px;
}

/* 标签悬停效果 */
.el-tag.cursor-pointer:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>
