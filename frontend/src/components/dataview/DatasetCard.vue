<script setup lang="ts">
import { computed } from "vue";
import { ElMessage } from "element-plus";
import {
  Calendar,
  CircleCheck,
  DataAnalysis,
  Document,
  DocumentCopy,
  DocumentDelete,
  FolderOpened,
  Refresh,
} from "@element-plus/icons-vue";
import { useDatasetStore } from "@/stores/useDatasetStore";

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

const missingValueCount = computed(() => {
  if (!isDataReady.value || !datasetInfo.value?.missingValueTypes) return 0;
  // 安全访问dataQuality属性
  return datasetInfo.value.originalFile.dataQuality?.totalMissingCount || 0;
});

const missingValueTextClass = computed(() => {
  return missingValueCount.value > 0 ? "missing-warning" : "missing-success";
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
  if (percentage >= 95) return "quality-excellent";
  if (percentage >= 85) return "quality-good";
  return "quality-poor";
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
    micrometeorology: "微气象",
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
    micrometeorology: "danger",
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
    case "export":
      emit("export");
      break;
  }
};
</script>

<template>
  <div class="dataset-card">
    <!-- 数据集信息容器 -->
    <div class="dataset-container">
      <!-- 数据集图标 -->
      <div class="dataset-icon-wrapper">
        <el-icon class="dataset-icon">
          <DataAnalysis />
        </el-icon>
      </div>

      <!-- 数据集详细信息 -->
      <div class="dataset-content">
        <!-- 标题行 -->
        <div class="dataset-header">
          <!-- 数据集名称 -->
          <div class="dataset-title-section">
            <div v-if="datasetStore.loading" class="loading-title">
              <el-skeleton-item variant="text" style="width: 200px; height: 28px" />
              <el-skeleton-item variant="button" style="width: 60px; height: 20px" />
            </div>
            <div v-else-if="datasetInfo" class="title-group">
              <h1 class="dataset-title">
                {{ datasetInfo.name || "未知数据集" }}
              </h1>
              <el-tag :type="getDatasetTypeTagType(datasetInfo.type)" size="small" class="dataset-type-tag">
                {{ getDatasetTypeLabel(datasetInfo.type) }}
              </el-tag>
            </div>
            <div v-else class="no-dataset">
              <h1 class="no-dataset-title">请选择数据集</h1>
            </div>
          </div>

          <!-- 时间信息 -->
          <div v-if="datasetInfo" class="dataset-meta-section">
            <div v-if="datasetStore.loading" class="loading-meta">
              <el-skeleton-item variant="text" style="width: 120px; height: 14px" />
            </div>
            <div v-else-if="datasetInfo.updatedAt" class="meta-item">
              <el-icon class="meta-icon update-icon">
                <Refresh />
              </el-icon>
              <span class="meta-text">{{ formatDate(datasetInfo.updatedAt) }}</span>
            </div>
          </div>
        </div>

        <!-- 统计信息 - 单行紧凑布局 -->
        <div v-if="isDataReady" class="dataset-stats">
          <div class="stat-item">
            <el-icon class="stat-icon">
              <Document />
            </el-icon>
            <span class="stat-value">{{ formatFileSize(datasetInfo!.originalFile.size) }}</span>
          </div>
        </div>

        <!-- 文件路径 - 简化显示 -->
        <div v-if="isDataReady && datasetInfo && datasetInfo.originalFile.filePath" class="file-path-section">
          <el-icon class="path-icon">
            <FolderOpened />
          </el-icon>
          <code class="file-path">{{ datasetInfo.originalFile.filePath }}</code>
          <el-button text size="small" @click="copyFilePath" class="copy-btn">
            <el-icon>
              <DocumentCopy />
            </el-icon>
          </el-button>
        </div>

        <!-- 无数据提示 -->
        <div v-if="!datasetStore.loading && !datasetInfo" class="empty-section">
          <el-icon class="empty-icon">
            <DocumentDelete />
          </el-icon>
          <span class="empty-text">请从左侧选择一个数据集</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 主容器 */
.dataset-card {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.dataset-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
}

.dataset-container {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

/* 数据集图标 */
.dataset-icon-wrapper {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.dataset-icon {
  font-size: 20px;
  color: white;
}

/* 数据集内容 */
.dataset-content {
  flex: 1;
  min-width: 0;
}

/* 标题部分 */
.dataset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 16px;
}

.dataset-title-section {
  flex: 1;
  min-width: 0;
}

.loading-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dataset-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.dataset-type-tag {
  text-transform: uppercase;
  font-weight: 500;
  letter-spacing: 0.5px;
  font-size: 11px;
}

.no-dataset {
  display: flex;
  align-items: center;
  gap: 12px;
}

.no-dataset-title {
  font-size: 20px;
  font-weight: 600;
  color: #9ca3af;
  margin: 0;
}

/* 元数据部分 */
.dataset-meta-section {
  flex-shrink: 0;
}

.loading-meta {
  display: flex;
  gap: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}

.meta-icon {
  font-size: 12px;
}

.update-icon {
  color: #3b82f6;
}

.meta-text {
  white-space: nowrap;
}

/* 统计信息 - 单行布局 */
.dataset-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #6b7280;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-icon {
  color: #6b7280;
  font-size: 14px;
  flex-shrink: 0;
}

.stat-value {
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}

.stat-separator {
  color: #d1d5db;
  font-weight: bold;
}

/* 数据质量样式 */
.quality-excellent {
  color: #059669;
}

.quality-good {
  color: #d97706;
}

.quality-poor {
  color: #dc2626;
}

/* 文件路径 - 简化 */
.file-path-section {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #6b7280;
  background: rgba(249, 250, 251, 0.6);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(229, 231, 235, 0.3);
}

.path-icon {
  color: #6b7280;
  font-size: 12px;
  flex-shrink: 0;
}

.file-path {
  background: rgba(229, 231, 235, 0.3);
  padding: 2px 6px;
  border-radius: 3px;
  color: #374151;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 10px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.copy-btn {
  padding: 2px;
  color: #6b7280;
  transition: color 0.2s ease;
  min-height: auto;
}

.copy-btn:hover {
  color: #059669;
}

/* 空状态 */
.empty-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #9ca3af;
  text-align: center;
  padding: 16px;
}

.empty-icon {
  font-size: 20px;
  color: #d1d5db;
}

.empty-text {
  font-size: 13px;
}

/* 响应式处理 */
@media (max-width: 768px) {
  .dataset-card {
    padding: 12px;
  }

  .dataset-container {
    gap: 12px;
  }

  .dataset-icon-wrapper {
    width: 40px;
    height: 40px;
  }

  .dataset-icon {
    font-size: 16px;
  }

  .dataset-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .dataset-title {
    font-size: 18px;
    max-width: none;
  }

  .dataset-stats {
    flex-wrap: wrap;
    gap: 6px;
  }

  .file-path {
    max-width: 200px;
  }
}

/* 微动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stat-item {
  animation: fadeIn 0.3s ease forwards;
}
</style>
