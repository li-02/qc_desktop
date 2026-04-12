<script setup lang="ts">
import { computed } from "vue";
import { useDatasetStore } from "@/stores/useDatasetStore";
import type { DatasetVersionInfo } from "@shared/types/projectInterface";
import { ElMessageBox, ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import VersionNodeItem from "./VersionNodeItem.vue";

defineProps<{
  datasetId: string | number;
}>();

const emit = defineEmits<{
  (e: "switch-version", versionId: number): void;
  (e: "close"): void;
}>();

const datasetStore = useDatasetStore();

// Tree Node Interface
interface VersionNode {
  id: number;
  data: DatasetVersionInfo;
  children: VersionNode[];
  isCurrent: boolean;
}

// Build Tree from flat list
const versionTree = computed(() => {
  const versions = datasetStore.versions;
  if (!versions.length) return [];

  const nodeMap = new Map<number, VersionNode>();
  const roots: VersionNode[] = [];

  // 1. Create Nodes
  versions.forEach(v => {
    nodeMap.set(v.id, {
      id: v.id,
      data: v,
      children: [],
      isCurrent: datasetStore.currentVersion?.id === v.id,
    });
  });

  // 2. Build Hierarchy
  // Sort by ID to ensure parents usually come before children if IDs are sequential,
  // but we rely on parentVersionId map.
  versions
    .sort((a, b) => a.id - b.id)
    .forEach(v => {
      const node = nodeMap.get(v.id)!;
      if (v.parentVersionId && nodeMap.has(v.parentVersionId)) {
        const parent = nodeMap.get(v.parentVersionId)!;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

  return roots;
});

const handleSwitch = (versionId: number) => {
  if (versionId === datasetStore.currentVersion?.id) return;

  ElMessageBox.confirm("切换版本将重新加载数据视图，确定要切换吗？", "切换版本", {
    confirmButtonText: "切换",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("switch-version", versionId);
    })
    .catch(() => {});
};

const handleDelete = async (versionId: number) => {
  ElMessageBox.confirm("删除此版本将不可恢复，且其所有子版本也可能受到影响。确定删除吗？", "删除版本", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "error",
  })
    .then(async () => {
      // TODO: Implement delete API in backend first
      console.log("Delete version:", versionId);
      ElMessage.warning("删除功能暂未开放");
    })
    .catch(() => {});
};

const handleExport = async (versionId: number) => {
  // Use existing export logic
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.EXPORT, { versionId: String(versionId) });
    // Usually opens a dialog, response handling depends on implementation
    if (result?.success) {
      ElMessage.success("导出成功");
    }
  } catch (e) {
    console.error(e);
  }
};
</script>

<template>
  <div class="version-manager">
    <div class="header">
      <h3>版本谱系</h3>
      <span class="subtitle">管理数据处理的历史版本与分支</span>
    </div>

    <div class="tree-container">
      <div v-for="root in versionTree" :key="root.id" class="tree-root">
        <div class="tree-node-wrapper">
          <VersionNodeItem :node="root" @switch="handleSwitch" @delete="handleDelete" @export="handleExport" />
        </div>
      </div>

      <div v-if="versionTree.length === 0" class="empty-state">
        <el-empty description="暂无版本记录" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-surface);
}

.header {
  padding: var(--card-padding);
  border-bottom: 1px solid var(--c-border);
}

.header h3 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
}

.subtitle {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  margin-top: var(--space-1);
  display: block;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--card-padding);
}
</style>
