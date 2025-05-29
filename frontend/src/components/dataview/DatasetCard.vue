<script setup lang="ts">
import {computed, ref, onMounted, watch} from "vue";
import {ElMessage} from "element-plus";
import {
  DataAnalysis,
  Document,
  Grid,
  List,
  Warning,
  QuestionFilled,
  CircleCheck,
  FolderOpened,
  DocumentCopy,
  MoreFilled,
  Refresh,
  View,
  Download,
  DocumentDelete,
  Calendar,
  Loading,
} from "@element-plus/icons-vue";
import type {DatasetInfo} from "@shared/types/projectInterface";
import {useDatasetStore} from "@/stores/useDatasetStore";

const datasetStore = useDatasetStore();
const datasetInfo = computed(() => datasetStore.currentDataset);

// Emits
const emit = defineEmits<{
  retry: [];
  refresh: [];
  export: [];
}>();
// 数据是否完整可用
const isDataReady = computed(() => {
  return !!(
    datasetInfo.value &&
    datasetInfo.value.originalFile &&
    datasetInfo.value.originalFile.size &&
    datasetInfo.value.originalFile.rows &&
    Array.isArray(datasetInfo.value.originalFile.columns)
  );
});

// Computed properties - 安全访问，提供默认值
const missingValueCount = computed(() => {
  if (!isDataReady.value || !datasetInfo.value?.missingValueTypes) return 0;
  return datasetInfo.value.missingValueTypes.length * 10; // 示例计算
});

const missingValueIconClass = computed(() => {
  return missingValueCount.value > 0 ? "text-orange-500" : "text-green-500";
});

const missingValueTextClass = computed(() => {
  return missingValueCount.value > 0 ? "font-medium text-orange-600" : "font-medium text-green-600";
});

const missingValueTooltip = computed(() => {
  if (!isDataReady.value || missingValueCount.value === 0) return "";
  return `缺失值类型: ${datasetInfo.value?.missingValueTypes?.join(", ") || ""}`;
});

const dataQualityPercentage = computed(() => {
  if (!isDataReady.value) return 0;
  const totalRows = datasetInfo.value!.originalFile.rows;
  const missingRows = missingValueCount.value;
  return ((totalRows - missingRows) / totalRows) * 100;
});

const dataQualityTextClass = computed(() => {
  const percentage = dataQualityPercentage.value;
  if (percentage >= 95) return "text-emerald-600";
  if (percentage >= 85) return "text-yellow-600";
  return "text-red-600";
});

const completeRecords = computed(() => {
  if (!isDataReady.value) return 0;
  return datasetInfo.value!.originalFile.rows - missingValueCount.value;
});

// Methods
const formatDate = (timestamp: number): string => {
  if (!timestamp) return "未知";
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFileSize = (sizeStr: string | number): string => {
  if (!sizeStr) return "未知";

  // 如果已经是格式化的字符串，直接返回
  if (typeof sizeStr === "string" && sizeStr.includes("B")) {
    return sizeStr;
  }

  // 如果是数字，进行格式化
  const size = typeof sizeStr === "string" ? parseInt(sizeStr) : sizeStr;
  if (isNaN(size)) return "未知";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatNumber = (num: number): string => {
  if (!num && num !== 0) return "0";
  return num.toLocaleString("zh-CN");
};

const getDatasetTypeLabel = (type: string): string => {
  if (!type) return "未知";
  const typeMap: Record<string, string> = {
    flux: "通量",
    aqi: "空气质量",
    nai: "负氧离子",
    sapflow: "茎流",
    micrometology: "微气象",
  };
  return typeMap[type] || type.toUpperCase();
};

const getDatasetTypeTagType = (type: string): string => {
  if (!type) return "info";
  const typeMap: Record<string, string> = {
    flux: "success",
    aqi: "warning",
    nai: "info",
    sapflow: "primary",
    micrometology: "danger",
  };
  return typeMap[type] || "info";
};

const copyFilePath = async () => {
  if (!isDataReady.value || !datasetInfo.value?.originalFile?.filePath) return;

  try {
    await navigator.clipboard.writeText(datasetInfo.value.originalFile.filePath);
    ElMessage.success("文件路径已复制到剪贴板");
  } catch (error) {
    ElMessage.error("复制失败");
  }
};

const handleCommand = (command: string) => {
  switch (command) {
    case "refresh":
      emit("refresh");
      break;
    case "togglePath":
      showFilePath.value = !showFilePath.value;
      break;
    case "export":
      emit("export");
      break;
  }
};
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
    <!-- 始终显示基本结构 -->
    <div class="flex items-start gap-6">
      <!-- 数据集图标 -->
      <div
        class="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
        <el-icon class="text-2xl text-white">
          <DataAnalysis />
        </el-icon>
      </div>

      <!-- 数据集详细信息 -->
      <div class="flex-1 min-w-0">
        <!-- 标题行 -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-3">
            <!-- 数据集名称 -->
            <div v-if="datasetStore.loading" class="flex items-center gap-2">
              <el-skeleton-item variant="text" style="width: 200px; height: 32px" />
              <el-skeleton-item variant="button" style="width: 60px; height: 24px" />
            </div>
            <div v-else-if="datasetInfo" class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-gray-800 truncate">
                {{ datasetInfo.name || "未知数据集" }}
              </h1>
              <el-tag :type="getDatasetTypeTagType(datasetInfo.type)" size="small" class="uppercase">
                {{ getDatasetTypeLabel(datasetInfo.type) }}
              </el-tag>
            </div>
            <div v-else class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-gray-400">请选择数据集</h1>
            </div>
          </div>

          <!-- 时间信息 -->
          <div class="flex items-center gap-4 text-sm text-gray-600 flex-shrink-0">
            <div v-if="datasetStore.loading" class="flex gap-4">
              <el-skeleton-item variant="text" style="width: 120px; height: 16px" />
              <el-skeleton-item variant="text" style="width: 120px; height: 16px" />
            </div>
            <template v-else-if="datasetInfo">
              <div v-if="datasetInfo.updatedAt" class="flex items-center gap-1">
                <el-icon class="text-blue-500">
                  <Refresh />
                </el-icon>
                <span>最后更新: {{ formatDate(datasetInfo.updatedAt) }}</span>
              </div>
              <div v-if="datasetInfo.createdAt" class="flex items-center gap-1">
                <el-icon class="text-green-500">
                  <Calendar />
                </el-icon>
                <span>创建时间: {{ formatDate(datasetInfo.createdAt) }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- 统计信息网格 -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <!-- 文件大小 -->
          <div class="flex items-center gap-2">
            <el-icon class="text-purple-500">
              <Document />
            </el-icon>
            <span class="text-gray-500 text-sm">文件大小:</span>
            <div v-if="datasetStore.loading" class="flex-1">
              <el-skeleton-item variant="text" style="width: 60px; height: 16px" />
            </div>
            <span v-else class="font-medium text-gray-700">
              {{ isDataReady ? formatFileSize(datasetInfo!.originalFile.size) : "等待加载..." }}
            </span>
          </div>

          <!-- 数据行数 -->
          <div class="flex items-center gap-2">
            <el-icon class="text-blue-500">
              <Grid />
            </el-icon>
            <span class="text-gray-500 text-sm">数据行数:</span>
            <div v-if="datasetStore.loading" class="flex-1">
              <el-skeleton-item variant="text" style="width: 60px; height: 16px" />
            </div>
            <span v-else class="font-medium text-gray-700">
              {{ isDataReady ? formatNumber(datasetInfo!.originalFile.rows) : "0" }} 行
            </span>
          </div>

          <!-- 数据列数 -->
          <div class="flex items-center gap-2">
            <el-icon class="text-green-500">
              <List />
            </el-icon>
            <span class="text-gray-500 text-sm">数据列数:</span>
            <div v-if="datasetStore.loading" class="flex-1">
              <el-skeleton-item variant="text" style="width: 60px; height: 16px" />
            </div>
            <span v-else class="font-medium text-gray-700">
              {{ isDataReady ? datasetInfo!.originalFile.columns.length : "0" }} 列
            </span>
          </div>

          <!-- 缺失值 -->
          <div class="flex items-center gap-2">
            <el-icon :class="missingValueIconClass">
              <Warning />
            </el-icon>
            <span class="text-gray-500 text-sm">缺失值:</span>
            <div v-if="datasetStore.loading" class="flex-1">
              <el-skeleton-item variant="text" style="width: 60px; height: 16px" />
            </div>
            <template v-else>
              <span :class="missingValueTextClass"> {{ missingValueCount }} 个 </span>
              <el-tooltip v-if="missingValueCount > 0" :content="missingValueTooltip" placement="top">
                <el-icon class="text-orange-400 cursor-help ml-1">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </template>
          </div>
        </div>

        <!-- 数据质量指示器 -->
        <div class="mt-4 pt-3 border-t border-gray-100">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-gray-600">数据质量:</span>
              <div class="flex items-center gap-2">
                <div class="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500"
                    :style="{width: `${dataQualityPercentage}%`}"></div>
                </div>
                <div v-if="datasetStore.loading">
                  <el-skeleton-item variant="text" style="width: 40px; height: 16px" />
                </div>
                <span v-else :class="dataQualityTextClass" class="text-sm font-medium">
                  {{ dataQualityPercentage.toFixed(1) }}%
                </span>
              </div>
            </div>

            <!-- 完整记录数 -->
            <div class="flex items-center gap-2 text-sm">
              <el-icon class="text-emerald-500">
                <CircleCheck />
              </el-icon>
              <span class="text-gray-600">完整记录:</span>
              <div v-if="datasetStore.loading">
                <el-skeleton-item variant="text" style="width: 60px; height: 16px" />
              </div>
              <span v-else class="font-medium text-gray-700">{{ formatNumber(completeRecords) }} 行</span>
            </div>
          </div>
        </div>

        <!-- 原始文件路径（可选显示） -->
        <div
          v-if="showFilePath && isDataReady && datasetInfo.originalFile.filePath"
          class="mt-3 pt-3 border-t border-gray-100">
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <el-icon>
              <FolderOpened />
            </el-icon>
            <span>原始文件:</span>
            <code class="bg-gray-100 px-2 py-1 rounded text-gray-700 truncate max-w-md">
              {{ datasetInfo.originalFile.filePath }}
            </code>
            <el-button text size="small" @click="copyFilePath" class="!p-1">
              <el-icon>
                <DocumentCopy />
              </el-icon>
            </el-button>
          </div>
        </div>

        <!-- 无数据提示 -->
        <div v-if="!datasetStore.loading && !datasetInfo" class="mt-4 pt-3 border-t border-gray-100">
          <div class="flex flex-col items-center justify-center h-20 text-gray-500">
            <el-icon class="text-2xl mb-1">
              <DocumentDelete />
            </el-icon>
            <span class="text-sm">请从左侧选择一个数据集</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮组 -->
      <div class="flex flex-col gap-2 flex-shrink-0">
        <el-dropdown trigger="click" @command="handleCommand" :disabled="datasetStore.loading">
          <el-button
            circle
            size="small"
            class="!border-gray-300 hover:!border-emerald-400"
            :loading="datasetStore.loading">
            <el-icon v-if="!datasetStore.loading">
              <MoreFilled />
            </el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="refresh">
                <el-icon class="mr-2">
                  <Refresh />
                </el-icon>
                刷新信息
              </el-dropdown-item>
              <el-dropdown-item command="togglePath" :disabled="!isDataReady">
                <el-icon class="mr-2">
                  <View />
                </el-icon>
                {{ showFilePath ? "隐藏" : "显示" }}文件路径
              </el-dropdown-item>
              <el-dropdown-item command="export" :disabled="!isDataReady" divided>
                <el-icon class="mr-2">
                  <Download />
                </el-icon>
                导出数据集信息
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自定义样式 */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .grid-cols-2 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .md\:grid-cols-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 数据质量进度条动画 */
.bg-gradient-to-r {
  background-image: linear-gradient(to right, var(--tw-gradient-stops));
}

/* 悬停效果 */
.hover\:border-emerald-400:hover {
  border-color: #6ee7b7;
}

/* 骨架屏动画 */
:deep(.el-skeleton-item) {
  border-radius: 4px;
}
</style>
