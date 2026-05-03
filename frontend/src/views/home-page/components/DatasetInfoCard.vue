<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { RefreshCw, Plus, Trash2, Gauge, Cloud, Flag, BarChart, FileText } from "@/components/icons/iconoir";
import { useCategoryStore } from "@/stores/useCategoryStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import emitter from "@/utils/eventBus";

const router = useRouter();
const categoryStore = useCategoryStore();
const datasetStore = useDatasetStore();

const datasets = computed(() => categoryStore.currentCategory?.datasets || []);

const selectDataset = (dataset: any) => {
  if (categoryStore.currentCategory) {
    datasetStore.setCurrentDataset(dataset.id);
    router.push(`/data-view?dataset=${dataset.id}`);
  }
};

const handleImportData = () => {
  emitter.emit("open-import-data-dialog");
};

const handleRefresh = async () => {
  await categoryStore.loadCategories();
  ElMessage.success("数据集已刷新");
};

const handleDelete = async (dataset: any) => {
  if (!categoryStore.currentCategory) return;

  try {
    await ElMessageBox.confirm(`确定要删除数据集 "${dataset.name}" 吗? 此操作不可恢复。`, "删除数据集", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });

    await datasetStore.deleteDataset(categoryStore.currentCategory.id, dataset.id);
  } catch (error) {
    if (error !== "cancel") {
      console.error(error);
    }
  }
};

const getIconName = (type: string) => {
  const iconMap: Record<string, any> = {
    flux: Gauge,
    micrometeorology: Cloud,
    aqi: Flag,
    sapflow: BarChart,
    emerald: BarChart,
  };
  return iconMap[type] || FileText;
};

const getTypeTagClass = (type: string) => {
  const styles: Record<string, string> = {
    emerald: "tag-emerald",
    flux: "tag-flux",
    sapflow: "tag-sapflow",
    aqi: "tag-aqi",
    micrometeorology: "tag-micrometeorology",
  };
  return styles[type] || "tag-default";
};

const getDatasetTypeLabel = (type: string): string => {
  const labelMap: Record<string, string> = {
    flux: "通量数据",
    micrometeorology: "微气象",
    aqi: "空气质量",
    sapflow: "茎流数据",
    nai: "负氧离子",
  };
  return labelMap[type] || type;
};

import { formatLocalWithTZ } from "@/utils/timeUtils";
const formatRelativeTime = (timestamp: number): string => {
  return formatLocalWithTZ(timestamp);
};
</script>

<template>
  <div class="dataset-card-container">
    <div class="section-header">
      <div class="section-title">数据集列表</div>
      <div class="section-actions">
        <button class="action-btn" title="刷新" @click="handleRefresh">
          <RefreshCw :size="14" />
        </button>
        <button class="action-btn" title="添加数据集" @click="handleImportData">
          <Plus :size="14" />
        </button>
      </div>
    </div>

    <div class="dataset-list">
      <!-- Empty State -->
      <div v-if="datasets.length === 0" class="empty-state">
        <div class="empty-icon">📂</div>
        <div class="empty-text">
          暂无数据集<br />
          请导入您的第一个数据集
        </div>
        <button class="empty-action" @click="handleImportData">导入数据集</button>
      </div>

      <!-- Dataset List -->
      <div v-else class="datasets-container">
        <div v-for="dataset in datasets" :key="dataset.id" class="dataset-item" @click="selectDataset(dataset)">
          <div class="dataset-header">
            <div class="dataset-icon-wrapper">
              <component :is="getIconName(dataset.type)" :size="16" class="dataset-icon" />
            </div>

            <div class="dataset-info">
              <div class="dataset-name">{{ dataset.name }}</div>
              <div class="dataset-type-badge" :class="getTypeTagClass(dataset.type)">
                {{ getDatasetTypeLabel(dataset.type) }}
              </div>
            </div>

            <button class="dataset-delete-btn" title="删除数据集" @click.stop="handleDelete(dataset)">
              <Trash2 :size="14" />
            </button>
          </div>

          <div class="dataset-meta">
            <div class="dataset-description">
              {{ dataset.originalFile || "未指定文件" }}
            </div>
            <div class="dataset-time">更新于 {{ formatRelativeTime(dataset.createdAt || Date.now()) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dataset-card-container {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  overflow: hidden;
  height: 100%;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4) var(--space-2-5);
  border-bottom: 1px solid var(--c-border);
}

.section-title {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--c-text-primary);
}

.section-actions {
  display: flex;
  gap: var(--space-1);
}

.action-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  border-radius: var(--radius-btn);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-fast);
  color: var(--c-text-secondary);
  font-size: var(--text-base);
}

.action-btn:hover {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
  color: var(--c-brand);
}

.dataset-list {
  padding: var(--space-2-5) var(--space-3);
  height: calc(100% - 48px);
  overflow-y: auto;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: var(--space-10) var(--space-5);
  color: var(--c-text-muted);
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  width: 44px;
  height: 44px;
  background: var(--c-bg-muted);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-3);
  font-size: var(--text-3xl);
}

.empty-text {
  font-size: var(--text-base);
  color: var(--c-text-secondary);
  margin-bottom: var(--space-4);
  line-height: 1.5;
}

.empty-action {
  background: var(--c-brand);
  color: var(--c-text-inverse);
  border: none;
  border-radius: var(--radius-btn);
  padding: var(--space-2) var(--space-5);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  cursor: pointer;
  transition: var(--transition-fast);
}

.empty-action:hover {
  background: var(--c-brand-hover);
}

/* 数据集列表 */
.datasets-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dataset-item {
  background: var(--c-bg-muted);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  padding: var(--space-2-5) var(--space-3);
  cursor: pointer;
  transition: var(--transition-fast);
}

.dataset-item:hover {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
  box-shadow: var(--shadow-xs);
}

.dataset-header {
  display: flex;
  align-items: center;
  gap: var(--space-2-5);
  margin-bottom: var(--space-1);
}

.dataset-icon-wrapper {
  width: 36px;
  height: 36px;
  background: var(--color-primary-100);
  border: 1px solid var(--color-primary-200);
  border-radius: var(--radius-card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: var(--transition-fast);
}

.dataset-item:hover .dataset-icon-wrapper {
  background: var(--color-primary-200);
  border-color: var(--color-primary-300);
}

.dataset-icon {
  color: var(--color-primary-700);
  font-size: var(--text-base);
}

.dataset-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.dataset-name {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.dataset-type-badge {
  font-size: var(--text-xs);
  padding: 2px var(--space-2);
  border-radius: var(--radius-btn);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  flex-shrink: 0;
}

.tag-emerald,
.tag-flux,
.tag-sapflow,
.tag-default {
  background: var(--color-primary-100);
  color: var(--color-primary-800);
  border: 1px solid var(--color-primary-200);
}

.tag-aqi {
  background: var(--color-purple-100);
  color: var(--color-purple-900);
  border: 1px solid var(--color-purple-200);
}

.tag-micrometeorology {
  background: var(--color-orange-100);
  color: var(--color-orange-800);
  border: 1px solid var(--color-orange-200);
}

.dataset-delete-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: var(--c-danger-bg);
  border-radius: var(--radius-btn);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-fast);
  color: var(--c-danger);
  font-size: var(--text-base);
  opacity: 0;
  flex-shrink: 0;
}

.dataset-item:hover .dataset-delete-btn {
  opacity: 1;
}

.dataset-delete-btn:hover {
  background: var(--color-red-100);
}

.dataset-meta {
  margin-left: 46px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dataset-description {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dataset-time {
  font-size: var(--text-2xs);
  color: var(--c-text-muted);
}

/* 自定义滚动条样式 */
.dataset-list::-webkit-scrollbar {
  width: 6px;
}

.dataset-list::-webkit-scrollbar-track {
  background: transparent;
}

.dataset-list::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 225, 0.6);
  border-radius: var(--radius-xs);
}

.dataset-list::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.8);
}
</style>
