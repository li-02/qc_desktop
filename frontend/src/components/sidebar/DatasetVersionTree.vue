<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { translateRemark } from "@/utils/versionUtils";
import type { DatasetVersionInfo } from "@shared/types/projectInterface";

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
    QC: "#10b981", // Emerald-500
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

        <!-- Name -->
        <div class="version-name">
          {{ translateRemark(node.data.remark) || `v${node.id}` }}
        </div>

        <div class="version-stage" :style="{ color: getStageColor(node.data.stageType) }">
          {{ getStageLabel(node.data.stageType) }}
        </div>
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
  border-left: 1px solid #dcfce7;
  padding-left: 2px;
}

.version-loading {
  padding: 6px 8px;
  font-size: 11px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.loading-spinner {
  width: 8px;
  height: 8px;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-left-color: #10b981;
  border-radius: 50%;
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
  border-radius: 6px;
  transition: background-color 0.15s ease;
  position: relative;
  gap: 6px;
}

.version-row:hover {
  background-color: #f8fafc;
}

.version-row.is-active {
  background-color: #ecfdf5;
}

.version-row.is-active .version-name {
  color: #047857;
  font-weight: 600;
}

/* Tree connection guide for nested items */
.tree-guide {
  position: absolute;
  left: -6px;
  top: 1px;
  bottom: 50%;
  width: 6px;
  border-bottom: 1px solid #bbf7d0;
  border-left: 1px solid #bbf7d0;
}

.version-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  border-radius: 4px;
  flex-shrink: 0;
}

.version-name {
  flex: 1;
  font-size: 11px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}

.version-stage {
  font-size: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 1px 6px;
  line-height: 1.2;
  flex-shrink: 0;
}

.version-empty {
  padding: 6px 8px;
  font-size: 11px;
  color: #94a3b8;
}
</style>
