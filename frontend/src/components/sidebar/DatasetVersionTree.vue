<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { translateRemark } from "@/utils/versionUtils";
import type { DatasetVersionInfo } from "@shared/types/projectInterface";
import { ElMessageBox } from "element-plus";

const props = defineProps<{
  datasetId: string;
  isExpanded: boolean;
}>();

const emit = defineEmits<{
  (e: "select-version", versionId: number): void;
}>();

const datasetStore = useDatasetStore();
const versions = ref<DatasetVersionInfo[]>([]);
const loading = ref(false);

interface VersionNode {
  id: number;
  data: DatasetVersionInfo;
  children: VersionNode[];
  depth: number;
}

const loadVersions = async () => {
  if (!props.datasetId) return;

  loading.value = true;
  try {
    await datasetStore.loadVersions(props.datasetId);
    versions.value = datasetStore.versions;
    if (flattenedVersions.value.length > 0) {
      emit("select-version", flattenedVersions.value[0].id);
    }
  } catch (error) {
    console.error("Failed to load versions:", error);
  } finally {
    loading.value = false;
  }
};

const versionTree = computed(() => {
  if (!versions.value.length) return [];

  const nodeMap = new Map<number, VersionNode>();
  const roots: VersionNode[] = [];

  versions.value.forEach(v => {
    nodeMap.set(v.id, {
      id: v.id,
      data: v,
      children: [],
      depth: 0,
    });
  });

  versions.value
    .sort((a, b) => a.id - b.id)
    .forEach(v => {
      const node = nodeMap.get(v.id)!;
      if (v.parentVersionId && nodeMap.has(v.parentVersionId)) {
        const parent = nodeMap.get(v.parentVersionId)!;
        node.depth = parent.depth + 1;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

  return roots;
});

const flattenedVersions = computed(() => {
  const result: VersionNode[] = [];
  const traverse = (nodes: VersionNode[]) => {
    nodes.forEach(node => {
      result.push(node);
      if (node.children.length > 0) {
        traverse(node.children);
      }
    });
  };
  traverse(versionTree.value);
  return result;
});

const currentVersionId = computed(() => datasetStore.currentVersion?.id);

const getStageColor = (stageType: string) => {
  const colors: Record<string, string> = {
    RAW: "#94a3b8", // Slate-400
    FILTERED: "#06b6d4", // Cyan-500
    QC: "#2d6a4f", // Emerald-500
  };
  return colors[stageType] || "#94a3b8";
};

const getStageLabel = (stageType: string) => {
  const labels: Record<string, string> = {
    RAW: "原始",
    FILTERED: "过滤",
    QC: "质控",
  };
  return labels[stageType] || stageType;
};

const handleVersionClick = (versionId: number) => {
  emit("select-version", versionId);
};

const formatTime = (date: string | number) => {
  return new Date(date).toLocaleString();
};

// 版本管理操作
const editingVersionId = ref<number | null>(null);
const editingRemark = ref("");
const editInputRef = ref<HTMLInputElement | null>(null);

const hasChildren = (nodeId: number) => {
  return flattenedVersions.value.some(n => n.data.parentVersionId === nodeId);
};

const isRootRaw = (node: VersionNode) => {
  return node.data.stageType === "RAW" && !node.data.parentVersionId;
};

const canDelete = (node: VersionNode) => {
  return !isRootRaw(node) && !hasChildren(node.id);
};

const startRename = (node: VersionNode, event: Event) => {
  event.stopPropagation();
  editingVersionId.value = node.id;
  editingRemark.value = node.data.remark || "";
  nextTick(() => editInputRef.value?.focus());
};

const confirmRename = async (node: VersionNode) => {
  if (editingVersionId.value !== node.id) return;
  const newRemark = editingRemark.value.trim();
  try {
    await datasetStore.updateVersionRemark(node.id, newRemark);
    // 同步本地 versions
    const v = versions.value.find(v => v.id === node.id);
    if (v) v.remark = newRemark;
  } catch {
    // error already shown by store
  } finally {
    editingVersionId.value = null;
  }
};

const cancelRename = () => {
  editingVersionId.value = null;
};

const confirmDelete = (node: VersionNode, event: Event) => {
  event.stopPropagation();
  ElMessageBox.confirm(
    `确定要删除版本 #${node.id} (${getStageLabel(node.data.stageType)}) 吗？此操作不可恢复。`,
    "删除版本",
    { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }
  )
    .then(async () => {
      await datasetStore.deleteVersion(node.id);
      versions.value = datasetStore.versions;
    })
    .catch(() => {});
};

watch(
  () => props.isExpanded,
  expanded => {
    if (expanded && versions.value.length === 0) {
      loadVersions();
    }
  },
  { immediate: true }
);

watch(
  () => props.datasetId,
  () => {
    versions.value = [];
    if (props.isExpanded) {
      loadVersions();
    }
  }
);

onMounted(() => {
  if (props.isExpanded) {
    loadVersions();
  }
});
</script>

<template>
  <div class="version-tree-container" v-if="isExpanded">
    <!-- Loading -->
    <div v-if="loading" class="version-loading">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- Tree List -->
    <div v-else-if="flattenedVersions.length > 0" class="version-list">
      <div
        v-for="node in flattenedVersions"
        :key="node.id"
        class="version-row"
        :class="{ 'is-active': currentVersionId === node.id }"
        :style="{ paddingLeft: `${node.depth * 10 + 6}px` }"
        @click.stop="handleVersionClick(node.id)"
        :title="`版本 #${node.id} - ${formatTime(node.data.createdAt)}`">
        <!-- Tree guide lines for depth > 0 -->
        <div class="tree-guide" v-if="node.depth > 0"></div>

        <!-- Stage Icon -->
        <div
          class="version-icon"
          :style="{
            color: getStageColor(node.data.stageType),
            backgroundColor: `${getStageColor(node.data.stageType)}1A`,
          }">
          {{ getStageLabel(node.data.stageType).charAt(0) }}
        </div>

        <!-- 内联编辑备注 -->
        <template v-if="editingVersionId === node.id">
          <input
            ref="editInputRef"
            class="version-remark-input"
            v-model="editingRemark"
            @keyup.enter.stop="confirmRename(node)"
            @keyup.escape.stop="cancelRename"
            @blur="confirmRename(node)"
            @click.stop />
        </template>
        <template v-else>
          <!-- Name -->
          <div class="version-name">
            {{ translateRemark(node.data.remark) || `v${node.id}` }}
          </div>

          <div class="version-stage" :style="{ color: getStageColor(node.data.stageType) }">
            {{ getStageLabel(node.data.stageType) }}
          </div>

          <!-- 操作按钮（hover 显示） -->
          <div class="version-actions">
            <button class="version-action-btn" title="重命名" @click.stop="startRename(node, $event)">✎</button>
            <button
              v-if="canDelete(node)"
              class="version-action-btn version-action-danger"
              title="删除版本"
              @click.stop="confirmDelete(node, $event)">
              ×
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="version-empty">
      <span>无版本记录</span>
    </div>
  </div>
</template>

<style scoped>
.version-tree-container {
  margin-top: 2px;
  margin-left: 30px;
  border-left: 1px solid var(--c-border);
  padding-left: 2px;
}

.version-loading {
  padding: 6px 8px;
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.loading-spinner {
  width: 8px;
  height: 8px;
  border: 1px solid var(--c-border);
  border-left-color: var(--c-brand);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.version-list {
  display: flex;
  flex-direction: column;
}

.version-row {
  display: flex;
  align-items: center;
  height: 26px;
  padding-right: 8px;
  cursor: pointer;
  border-radius: var(--radius-control);
  transition: background-color 0.15s ease;
  position: relative;
  gap: 6px;
}

.version-row:hover {
  background-color: var(--sb-item-bg-hover);
}

.version-row.is-active {
  background-color: var(--sb-item-bg-active);
}

.version-row.is-active .version-name {
  color: var(--c-brand);
  font-weight: 600;
}

/* Tree connection guide for nested items */
.tree-guide {
  position: absolute;
  left: -6px;
  top: 1px;
  bottom: 50%;
  width: 6px;
  border-bottom: 1px solid var(--c-border);
  border-left: 1px solid var(--c-border);
}

.version-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-3xs);
  font-weight: 600;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.version-name {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}

.version-stage {
  font-size: var(--text-2xs);
  background: var(--c-bg-subtle);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-full);
  padding: 1px 6px;
  line-height: 1.2;
  flex-shrink: 0;
  color: var(--c-text-muted);
}

.version-empty {
  padding: 6px 8px;
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

/* 操作按钮区域 - hover 时显示 */
.version-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.version-row:hover .version-actions {
  display: flex;
}

.version-action-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  padding: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  line-height: 1;
}

.version-action-btn:hover {
  background-color: var(--sb-item-bg-hover);
  color: var(--c-brand);
}

.version-action-btn.version-action-danger:hover {
  background-color: var(--c-danger-bg);
  color: var(--c-danger);
}

/* 内联编辑输入框 */
.version-remark-input {
  flex: 1;
  height: 20px;
  font-size: var(--text-xs);
  color: var(--c-text-base);
  border: 1px solid var(--c-brand);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  outline: none;
  background: var(--c-bg-surface);
  min-width: 0;
}

.version-loading {
  padding: 6px 8px;
  font-size: var(--text-xs);
  color: rgba(255, 255, 255, 0.45);
  display: flex;
  align-items: center;
  gap: 6px;
}

.loading-spinner {
  width: 8px;
  height: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-left-color: rgba(255, 255, 255, 0.7);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.version-list {
  display: flex;
  flex-direction: column;
}

.version-row {
  display: flex;
  align-items: center;
  height: 26px;
  padding-right: 8px;
  cursor: pointer;
  border-radius: var(--radius-control);
  transition: background-color 0.15s ease;
  position: relative;
  gap: 6px;
}

.version-row:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.version-row.is-active {
  background-color: rgba(255, 255, 255, 0.13);
}

.version-row.is-active .version-name {
  color: var(--sb-text-primary);
  font-weight: 600;
}

/* Tree connection guide for nested items */
.tree-guide {
  position: absolute;
  left: -6px;
  top: 1px;
  bottom: 50%;
  width: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  border-left: 1px solid rgba(255, 255, 255, 0.15);
}

.version-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-3xs);
  font-weight: 600;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.version-name {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--sb-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}

.version-stage {
  font-size: var(--text-2xs);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--radius-full);
  padding: 1px 6px;
  line-height: 1.2;
  flex-shrink: 0;
  color: var(--sb-text-secondary);
}

.version-stage {
  font-size: var(--text-2xs);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-full);
  padding: 1px 6px;
  line-height: 1.2;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.6);
}

.version-empty {
  padding: 6px 8px;
  font-size: var(--text-xs);
  color: rgba(255, 255, 255, 0.35);
}

/* 操作按钮区域 - hover 时显示 */
.version-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.version-row:hover .version-actions {
  display: flex;
}

.version-action-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-sm);
  color: rgba(255, 255, 255, 0.45);
  padding: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  line-height: 1;
}

.version-action-btn:hover {
  background-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.version-action-btn.version-action-danger:hover {
  background-color: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

/* 内联编辑输入框 */
.version-remark-input {
  flex: 1;
  height: 20px;
  font-size: var(--text-xs);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  min-width: 0;
}
</style>
