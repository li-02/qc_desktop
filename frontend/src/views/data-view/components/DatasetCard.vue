<script setup lang="ts">
import { computed } from "vue";
import { formatLocalWithTZ } from "@/utils/timeUtils";
import { ElMessage } from "element-plus";
import { BarChart2, FileText, Copy, FileX, FolderOpen, RefreshCw } from "lucide-vue-next";
import { useDatasetStore } from "@/stores/useDatasetStore";

const datasetStore = useDatasetStore();
const datasetInfo = computed(() => datasetStore.currentDataset);

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

// Methods
const formatDate = (timestamp: number): string => {
  if (!timestamp) return "未知";
  return formatLocalWithTZ(timestamp);
};

const formatFileSize = (sizeStr: string | number): string => {
  if (!sizeStr) return "未知";

  if (typeof sizeStr === "string" && sizeStr.includes("B")) {
    return sizeStr;
  }

  const size = typeof sizeStr === "string" ? parseInt(sizeStr) : sizeStr;
  if (isNaN(size)) return "未知";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
</script>

<template>
  <div class="dataset-card">
    <div class="dataset-container">
      <!-- 数据集图标 -->
      <div class="dataset-icon-wrapper">
        <BarChart2 :size="24" class="dataset-icon" />
      </div>

      <!-- 数据集详细信息 -->
      <div class="dataset-content">
        <!-- 标题行 -->
        <div class="dataset-header">
          <div class="dataset-title-section">
            <div v-if="datasetStore.loading" class="loading-title">
              <el-skeleton-item variant="text" style="width: 200px; height: 24px" />
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
              <RefreshCw :size="12" class="meta-icon update-icon" />
              <span class="meta-text">{{ formatDate(datasetInfo.updatedAt) }}</span>
            </div>
          </div>
        </div>

        <!-- 文件信息 -->
        <div v-if="isDataReady && datasetInfo" class="file-info-section">
          <div class="file-size-info">
            <FileText :size="12" class="stat-icon" />
            <span class="stat-value">{{ formatFileSize(datasetInfo.originalFile.size) }}</span>
          </div>

          <div v-if="datasetInfo.originalFile.filePath" class="file-path-info">
            <FolderOpen :size="12" class="path-icon" />
            <code class="file-path">{{ datasetInfo.originalFile.filePath }}</code>
            <el-button text size="small" @click="copyFilePath" class="copy-btn">
              <Copy :size="12" />
            </el-button>
          </div>
        </div>

        <!-- 无数据提示 -->
        <div v-if="!datasetStore.loading && !datasetInfo" class="empty-section">
          <FileX :size="32" class="empty-icon" />
          <span class="empty-text">请从左侧选择一个数据集</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dataset-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--card-radius);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-base);
}

.dataset-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--c-brand-border);
}

.dataset-container {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}

/* 图标 */
.dataset-icon-wrapper {
  width: 44px;
  height: 44px;
  background: var(--c-brand);
  border-radius: var(--radius-panel);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-brand);
}

.dataset-icon {
  font-size: var(--text-3xl);
  color: var(--c-text-inverse);
}

/* 内容区 */
.dataset-content {
  flex: 1;
  min-width: 0;
}

.dataset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
  gap: var(--space-4);
}

.dataset-title-section {
  flex: 1;
  min-width: 0;
}

.loading-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.dataset-title {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.dataset-type-tag {
  text-transform: uppercase;
  font-weight: var(--font-medium);
  letter-spacing: 0.5px;
  font-size: var(--text-xs);
}

.no-dataset {
  display: flex;
  align-items: center;
}

.no-dataset-title {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--c-text-disabled);
  margin: 0;
}

/* 元数据 */
.dataset-meta-section {
  flex-shrink: 0;
}

.loading-meta {
  display: flex;
  gap: var(--space-2);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
}

.meta-icon {
  font-size: var(--text-xs);
}

.update-icon {
  color: var(--c-info);
}

.meta-text {
  white-space: nowrap;
}

/* 文件信息栏 */
.file-info-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  background: var(--c-bg-muted);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border-subtle);
}

.file-size-info {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.file-path-info {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
}

.stat-icon {
  color: var(--c-text-muted);
  font-size: var(--text-sm);
  flex-shrink: 0;
}

.stat-value {
  font-weight: var(--font-medium);
  color: var(--c-text-base);
  white-space: nowrap;
}

.path-icon {
  color: var(--c-text-muted);
  font-size: var(--text-xs);
  flex-shrink: 0;
}

.file-path {
  background: var(--c-bg-elevated);
  padding: 2px var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--c-text-base);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.copy-btn {
  padding: 2px;
  color: var(--c-text-muted);
  transition: color var(--transition-fast);
  min-height: auto;
}

.copy-btn:hover {
  color: var(--c-brand);
}

/* 空状态 */
.empty-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--c-text-disabled);
  padding: var(--space-4);
}

.empty-icon {
  font-size: var(--text-3xl);
  color: var(--c-border-strong);
}

.empty-text {
  font-size: var(--text-base);
}

/* 响应式 */
@media (max-width: 768px) {
  .dataset-card {
    padding: var(--space-3);
  }

  .dataset-container {
    gap: var(--space-3);
  }

  .dataset-icon-wrapper {
    width: 36px;
    height: 36px;
  }

  .dataset-icon {
    font-size: var(--text-xl);
  }

  .dataset-header {
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-start;
  }

  .dataset-title {
    font-size: var(--text-lg);
    max-width: none;
  }

  .file-info-section {
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-start;
  }

  .file-path-info {
    width: 100%;
  }

  .file-path {
    max-width: 200px;
  }
}

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

.file-size-info,
.file-path-info {
  animation: fadeIn 0.3s ease forwards;
}
</style>
