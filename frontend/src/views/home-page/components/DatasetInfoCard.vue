<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Refresh, Plus, Delete, Odometer, Cloudy, Flag, Histogram, Document } from "@element-plus/icons-vue";
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
    flux: Odometer,
    micrometeorology: Cloudy,
    aqi: Flag,
    sapflow: Histogram,
    emerald: Histogram,
  };
  return iconMap[type] || Document;
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
  // 按用户要求：所有时间显示为本地时间 + 时区后缀
  return formatLocalWithTZ(timestamp);
};
</script>

<template>
  <div class="dataset-card-container">
    <div class="section-header">
      <div class="section-title">数据集列表</div>
      <div class="section-actions">
        <button class="action-btn" title="刷新" @click="handleRefresh">
          <el-icon><Refresh /></el-icon>
        </button>
        <button class="action-btn" title="添加数据集" @click="handleImportData">
          <el-icon><Plus /></el-icon>
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
              <el-icon size="16" class="dataset-icon">
                <component :is="getIconName(dataset.type)" />
              </el-icon>
            </div>

            <div class="dataset-info">
              <div class="dataset-name">{{ dataset.name }}</div>
              <div class="dataset-type-badge" :class="getTypeTagClass(dataset.type)">
                {{ getDatasetTypeLabel(dataset.type) }}
              </div>
            </div>

            <button class="dataset-delete-btn" title="删除数据集" @click.stop="handleDelete(dataset)">
              <el-icon><Delete /></el-icon>
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  height: 100%;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  border-bottom: 1px solid #e2e8f0;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #64748b;
  font-size: 14px;
}

.action-btn:hover {
  background: #ecfdf5;
  border-color: #86efac;
  color: #059669;
}

.dataset-list {
  padding: 10px 12px;
  height: calc(100% - 48px);
  overflow-y: auto;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #9ca3af;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  width: 44px;
  height: 44px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 20px;
}

.empty-text {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 16px;
  line-height: 1.5;
}

.empty-action {
  background: #10b981;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.empty-action:hover {
  background: #059669;
}

/* 数据集列表 */
.datasets-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dataset-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dataset-item:hover {
  background: #ecfdf5;
  border-color: #86efac;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.dataset-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.dataset-icon-wrapper {
  width: 36px;
  height: 36px;
  background: #d1fae5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.dataset-item:hover .dataset-icon-wrapper {
  background: #a7f3d0;
  border-color: #6ee7b7;
}

.dataset-icon {
  color: #047857;
  font-size: 16px;
}

.dataset-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dataset-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.dataset-type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}

.tag-emerald {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.tag-flux {
  background: #dcfce7;
  color: #065f46;
  border: 1px solid #bbf7d0;
}

.tag-sapflow {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.tag-aqi {
  background: #ede9fe;
  color: #581c87;
  border: 1px solid #ddd6fe;
}

.tag-micrometeorology {
  background: #ffedd5;
  color: #92400e;
  border: 1px solid #fed7aa;
}

.tag-default {
  background: #d1fae5;
  color: #059669;
  border: 1px solid #a7f3d0;
}

.dataset-delete-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: #fef2f2;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #ef4444;
  font-size: 14px;
  opacity: 0;
  flex-shrink: 0;
}

.dataset-item:hover .dataset-delete-btn {
  opacity: 1;
}

.dataset-delete-btn:hover {
  background: #fecaca;
}

.dataset-meta {
  margin-left: 46px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dataset-description {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dataset-time {
  font-size: 10px;
  color: #94a3b8;
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
  border-radius: 3px;
}

.dataset-list::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.8);
}
</style>
