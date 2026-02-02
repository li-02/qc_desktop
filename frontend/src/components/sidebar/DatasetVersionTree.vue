<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useDatasetStore } from '@/stores/useDatasetStore';
import type { DatasetVersionInfo } from '@shared/types/projectInterface';

const props = defineProps<{
  datasetId: string;
  isExpanded: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-version', versionId: number): void;
}>();

const datasetStore = useDatasetStore();
const versions = ref<DatasetVersionInfo[]>([]);
const loading = ref(false);

// 版本树节点
interface VersionNode {
  id: number;
  data: DatasetVersionInfo;
  children: VersionNode[];
  depth: number;
}

// 加载版本列表
const loadVersions = async () => {
  if (!props.datasetId) return;
  
  loading.value = true;
  try {
    await datasetStore.loadVersions(props.datasetId);
    versions.value = datasetStore.versions;
  } catch (error) {
    console.error('Failed to load versions:', error);
  } finally {
    loading.value = false;
  }
};

// 构建版本树
const versionTree = computed(() => {
  if (!versions.value.length) return [];

  const nodeMap = new Map<number, VersionNode>();
  const roots: VersionNode[] = [];

  // 创建节点
  versions.value.forEach(v => {
    nodeMap.set(v.id, {
      id: v.id,
      data: v,
      children: [],
      depth: 0
    });
  });

  // 构建层级关系
  versions.value.sort((a, b) => a.id - b.id).forEach(v => {
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

// 扁平化树结构用于渲染
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

// 当前选中的版本
const currentVersionId = computed(() => datasetStore.currentVersion?.id);

// 获取阶段标签配置
const getStageConfig = (stageType: string) => {
  const configs: Record<string, { label: string; color: string; bgColor: string }> = {
    'RAW': { label: '原始', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.1)' },
    'FILTERED': { label: '去异常', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
    'QC': { label: '已清洗', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.1)' },
  };
  return configs[stageType] || { label: stageType, color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.1)' };
};

// 获取版本图标
const getVersionIcon = (stageType: string, isRoot: boolean) => {
  if (isRoot) return '📄'; // CSV 文件图标
  if (stageType === 'FILTERED') return '🔧'; // 处理图标
  if (stageType === 'QC') return '✨'; // 清洗图标
  return '📄';
};

// 处理版本点击
const handleVersionClick = (versionId: number) => {
  emit('select-version', versionId);
};

// 监听展开状态，展开时加载版本
watch(() => props.isExpanded, (expanded) => {
  if (expanded && versions.value.length === 0) {
    loadVersions();
  }
}, { immediate: true });

// 监听 datasetId 变化
watch(() => props.datasetId, () => {
  versions.value = [];
  if (props.isExpanded) {
    loadVersions();
  }
});

onMounted(() => {
  if (props.isExpanded) {
    loadVersions();
  }
});
</script>

<template>
  <div class="version-tree" v-if="isExpanded">
    <!-- 加载状态 -->
    <div v-if="loading" class="version-loading">
      <span class="loading-dot"></span>
      <span>加载中...</span>
    </div>

    <!-- 版本列表 -->
    <div v-else-if="flattenedVersions.length > 0" class="version-list">
      <div
        v-for="node in flattenedVersions"
        :key="node.id"
        class="version-item"
        :class="{ 
          'is-active': currentVersionId === node.id,
          'is-child': node.depth > 0
        }"
        :style="{ paddingLeft: `${12 + node.depth * 16}px` }"
        @click.stop="handleVersionClick(node.id)"
      >
        <!-- 连接线 -->
        <div v-if="node.depth > 0" class="version-connector">
          <div class="connector-line"></div>
          <div class="connector-branch"></div>
        </div>

        <!-- 版本图标 -->
        <div class="version-icon">
          {{ getVersionIcon(node.data.stageType, node.depth === 0) }}
        </div>

        <!-- 版本名称 -->
        <div class="version-name">
          {{ node.data.remark || `版本 #${node.id}` }}
        </div>

        <!-- 状态标签 (右侧胶囊) -->
        <div 
          class="version-stage-tag"
          :style="{ 
            color: getStageConfig(node.data.stageType).color,
            backgroundColor: getStageConfig(node.data.stageType).bgColor
          }"
        >
          {{ getStageConfig(node.data.stageType).label }}
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="version-empty">
      <span>暂无版本记录</span>
    </div>
  </div>
</template>

<style scoped>
.version-tree {
  margin-top: 4px;
  padding-left: 8px;
  border-left: 2px solid rgba(139, 92, 246, 0.2);
  margin-left: 8px;
}

.version-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  color: #9ca3af;
}

.loading-dot {
  width: 6px;
  height: 6px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  padding-right: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  background: transparent;
}

.version-item:hover {
  background: rgba(139, 92, 246, 0.06);
}

.version-item.is-active {
  background: rgba(16, 185, 129, 0.1);
}

.version-item.is-active .version-name {
  color: #059669;
  font-weight: 600;
}

.version-item.is-active .version-icon {
  transform: scale(1.1);
}

/* 连接线样式 */
.version-connector {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 50%;
  width: 12px;
  pointer-events: none;
}

.connector-line {
  position: absolute;
  left: 0;
  top: -8px;
  bottom: 0;
  width: 2px;
  background: rgba(139, 92, 246, 0.2);
}

.connector-branch {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 10px;
  height: 2px;
  background: rgba(139, 92, 246, 0.2);
}

.version-icon {
  font-size: 12px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.version-name {
  flex: 1;
  font-size: 11px;
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.version-stage-tag {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

.version-empty {
  padding: 8px 12px;
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
}
</style>
