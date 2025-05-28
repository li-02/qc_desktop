<script setup lang="ts">
import {computed, ref} from "vue";
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

// Props
interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
  showFilePath?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  showFilePath: false,
});

// Emits
const emit = defineEmits<{
  retry: [];
  refresh: [];
  export: [];
}>();

// Reactive state
const showFilePath = ref(props.showFilePath);

// Computed properties
const missingValueCount = computed(() => {
  if (!props.datasetInfo) return 0;
  // 这里可以根据实际需求计算缺失值总数
  // 临时使用简单计算
  return props.datasetInfo.missingValueTypes.length * 10; // 示例计算
});

const missingValueIconClass = computed(() => {
  return missingValueCount.value > 0 ? "text-orange-500" : "text-green-500";
});

const missingValueTextClass = computed(() => {
  return missingValueCount.value > 0 ? "font-medium text-orange-600" : "font-medium text-green-600";
});

const missingValueTooltip = computed(() => {
  if (missingValueCount.value === 0) return "";
  return `缺失值类型: ${props.datasetInfo?.missingValueTypes.join(", ")}`;
});

const dataQualityPercentage = computed(() => {
  if (!props.datasetInfo) return 0;
  const totalRows = props.datasetInfo.originalFile.rows;
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
  if (!props.datasetInfo) return 0;
  return props.datasetInfo.originalFile.rows - missingValueCount.value;
});

// Methods
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFileSize = (sizeStr: string): string => {
  // 如果已经是格式化的字符串，直接返回
  if (typeof sizeStr === "string" && sizeStr.includes("B")) {
    return sizeStr;
  }

  // 如果是数字，进行格式化
  const size = parseInt(sizeStr);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatNumber = (num: number): string => {
  return num.toLocaleString("zh-CN");
};

const getDatasetTypeLabel = (type: string): string => {
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
  if (!props.datasetInfo?.originalFile.filePath) return;

  try {
    await navigator.clipboard.writeText(props.datasetInfo.originalFile.filePath);
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
    <!-- 加载状态 -->
    <div v-if="datasetStore.loading" class="flex items-center justify-center h-32">
      <el-icon class="animate-spin text-2xl text-emerald-600">
        <Loading />
      </el-icon>
      <span class="ml-2 text-gray-600">加载数据集信息...</span>
    </div>

    <!-- 数据集信息展示 -->
    <div v-else-if="datasetInfo" class="flex items-start gap-6">
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
            <h1 class="text-2xl font-bold text-gray-800 truncate">
              {{ datasetInfo.name }}
            </h1>
            <el-tag :type="getDatasetTypeTagType(datasetInfo.type)" size="small" class="uppercase">
              {{ getDatasetTypeLabel(datasetInfo.type) }}
            </el-tag>
          </div>

          <!-- 时间信息 -->
          <div class="flex items-center gap-4 text-sm text-gray-600 flex-shrink-0">
            <div class="flex items-center gap-1">
              <el-icon class="text-blue-500">
                <Refresh />
              </el-icon>
              <span>最后更新: {{ formatDate(datasetInfo.updatedAt) }}</span>
            </div>
            <div class="flex items-center gap-1">
              <el-icon class="text-green-500">
                <Calendar />
              </el-icon>
              <span>创建时间: {{ formatDate(datasetInfo.createdAt) }}</span>
            </div>
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
            <span class="font-medium text-gray-700">{{ formatFileSize(datasetInfo.originalFile.size) }}</span>
          </div>

          <!-- 数据行数 -->
          <div class="flex items-center gap-2">
            <el-icon class="text-blue-500">
              <Grid />
            </el-icon>
            <span class="text-gray-500 text-sm">数据行数:</span>
            <span class="font-medium text-gray-700">{{ formatNumber(datasetInfo.originalFile.rows) }} 行</span>
          </div>

          <!-- 数据列数 -->
          <div class="flex items-center gap-2">
            <el-icon class="text-green-500">
              <List />
            </el-icon>
            <span class="text-gray-500 text-sm">数据列数:</span>
            <span class="font-medium text-gray-700">{{ datasetInfo.originalFile.columns.length }} 列</span>
          </div>

          <!-- 缺失值 -->
          <div class="flex items-center gap-2">
            <el-icon :class="missingValueIconClass">
              <Warning />
            </el-icon>
            <span class="text-gray-500 text-sm">缺失值:</span>
            <span :class="missingValueTextClass"> {{ missingValueCount }} 个 </span>
            <el-tooltip v-if="missingValueCount > 0" :content="missingValueTooltip" placement="top">
              <el-icon class="text-orange-400 cursor-help ml-1">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
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
                    class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-300"
                    :style="{width: `${dataQualityPercentage}%`}"></div>
                </div>
                <span :class="dataQualityTextClass" class="text-sm font-medium">
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
              <span class="font-medium text-gray-700">{{ formatNumber(completeRecords) }} 行</span>
            </div>
          </div>
        </div>

        <!-- 原始文件路径（可选显示） -->
        <div v-if="showFilePath" class="mt-3 pt-3 border-t border-gray-100">
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
      </div>

      <!-- 操作按钮组 -->
      <div class="flex flex-col gap-2 flex-shrink-0">
        <el-dropdown trigger="click" @command="handleCommand">
          <el-button circle size="small" class="!border-gray-300 hover:!border-emerald-400">
            <el-icon>
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
              <el-dropdown-item command="togglePath">
                <el-icon class="mr-2">
                  <View />
                </el-icon>
                {{ showFilePath ? "隐藏" : "显示" }}文件路径
              </el-dropdown-item>
              <el-dropdown-item command="export" divided>
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

    <!-- 无数据状态 -->
    <div v-else class="flex flex-col items-center justify-center h-32 text-gray-500">
      <el-icon class="text-4xl mb-2">
        <DocumentDelete />
      </el-icon>
      <span>未找到数据集信息</span>
      <el-button text size="small" @click="$emit('retry')" class="mt-2"> 点击重试 </el-button>
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
</style>
