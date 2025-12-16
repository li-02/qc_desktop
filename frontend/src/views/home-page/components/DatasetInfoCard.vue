<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "@/stores/useProjectStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import emitter from "@/utils/eventBus";

const router = useRouter();
const projectStore = useProjectStore();
const datasetStore = useDatasetStore();

const datasets = computed(() => projectStore.currentProject?.datasets || []);

const selectDataset = (dataset: any) => {
  if (projectStore.currentProject) {
    datasetStore.setCurrentDataset(dataset.id);
    router.push(`/data-view?dataset=${dataset.id}`);
  }
};

const handleImportData = () => {
  emitter.emit("open-import-data-dialog");
};

const handleRefresh = async () => {
  await projectStore.loadProjects();
  ElMessage.success("数据集已刷新");
};

const handleDelete = async (dataset: any) => {
  if (!projectStore.currentProject) return;
  
  try {
    await ElMessageBox.confirm(
      `确定要删除数据集 "${dataset.name}" 吗? 此操作不可恢复。`,
      "删除数据集",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    
    await datasetStore.deleteDataset(projectStore.currentProject.id, dataset.id);
  } catch (error) {
    if (error !== "cancel") {
      console.error(error);
    }
  }
};

const getIconName = (type: string) => {
  const iconMap: Record<string, string> = {
    flux: "Odometer",
    micrometeorology: "Cloudy",
    aqi: "Flag",
    sapflow: "Histogram",
    emerald: "IconEmerald",
  };
  return iconMap[type] || "IconDefault";
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

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString();
};
</script>

<template>
  <div class="dataset-card-container">
    <div class="section-header">
      <div class="section-title">数据集列表</div>
      <div class="section-actions">
        <button class="action-btn" title="刷新" @click="handleRefresh">🔄</button>
        <button class="action-btn" title="添加数据集" @click="handleImportData">➕</button>
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

            <button class="dataset-delete-btn" title="删除数据集" @click.stop="handleDelete(dataset)">🗑️</button>
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
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 30%,
    rgba(240, 253, 244, 0.85) 70%,
    rgba(236, 253, 245, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
  position: relative;
  overflow: hidden;
  height: 100%;
}

.dataset-card-container::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.02) 0%, transparent 50%);
  pointer-events: none;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  position: relative;
  z-index: 10;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #000000;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(107, 114, 128, 0.1);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #6b7280;
  font-size: 12px;
}

.action-btn:hover {
  background: rgba(16, 185, 129, 0.2);
  color: #059669;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.dataset-list {
  padding: 20px;
  height: calc(100% - 72px);
  overflow-y: auto;
  position: relative;
  z-index: 10;
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
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 20px;
}

.empty-text {
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.5;
}

.empty-action {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.empty-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* 数据集列表 */
.datasets-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dataset-item {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(229, 231, 235, 0.3);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.dataset-item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: #10b981;
  border-radius: 0 2px 2px 0;
  transform: scaleY(0);
  transition: transform 0.2s ease;
}

.dataset-item:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.dataset-item:hover::before {
  transform: scaleY(1);
}

.dataset-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.dataset-icon-wrapper {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  border: 1px solid rgba(229, 231, 235, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.dataset-item:hover .dataset-icon-wrapper {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.dataset-icon {
  color: #6b7280;
  transition: color 0.2s ease;
}

.dataset-item:hover .dataset-icon {
  color: white;
}

.dataset-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dataset-name {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.dataset-type-badge {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.tag-emerald {
  background: rgba(16, 185, 129, 0.1);
  color: #065f46;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.tag-flux {
  background: rgba(34, 197, 94, 0.1);
  color: #065f46;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.tag-sapflow {
  background: rgba(16, 185, 129, 0.1);
  color: #065f46;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.tag-aqi {
  background: rgba(139, 92, 246, 0.1);
  color: #581c87;
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.tag-micrometeorology {
  background: rgba(245, 158, 11, 0.1);
  color: #92400e;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.tag-default {
  background: rgba(107, 114, 128, 0.1);
  color: #374151;
  border: 1px solid rgba(107, 114, 128, 0.2);
}

.dataset-delete-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #dc2626;
  font-size: 10px;
  opacity: 0;
  flex-shrink: 0;
}

.dataset-item:hover .dataset-delete-btn {
  opacity: 1;
}

.dataset-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  transform: scale(1.1);
}

.dataset-meta {
  margin-left: 44px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dataset-description {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dataset-time {
  font-size: 10px;
  color: #9ca3af;
}

/* 自定义滚动条样式 */
.dataset-list::-webkit-scrollbar {
  width: 6px;
}

.dataset-list::-webkit-scrollbar-track {
  background: transparent;
}

.dataset-list::-webkit-scrollbar-thumb {
  background: rgba(107, 114, 128, 0.2);
  border-radius: 3px;
}

.dataset-list::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 114, 128, 0.3);
}
</style>
