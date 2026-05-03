<script setup lang="ts">
import type { DatasetVersionInfo } from "@shared/types/projectInterface";
import { translateRemark } from "@/utils/versionUtils";
import { Download, Check, Clock } from "@/components/icons/iconoir";

// Tree Node Interface defined in parent, repeated here for type safety if needed,
// or just use 'any' for the recursive prop if strict types are hard to share without a common file.
// Ideally types are in a shared file.
interface VersionNode {
  id: number;
  data: DatasetVersionInfo;
  children: VersionNode[];
  isCurrent: boolean;
}

defineProps<{
  node: VersionNode;
}>();

defineEmits<{
  (e: "switch", id: number): void;
  (e: "delete", id: number): void;
  (e: "export", id: number): void;
}>();

const getStageColor = (stage: string) => {
  switch (stage) {
    case "RAW":
      return "var(--color-neutral-400)";
    case "FILTERED":
      return "var(--color-amber-500)";
    case "QC":
      return "var(--c-brand)";
    default:
      return "var(--color-blue-500)";
  }
};

const getStageLabel = (stage: string) => {
  switch (stage) {
    case "RAW":
      return "原始导入";
    case "FILTERED":
      return "异常处理";
    case "QC":
      return "缺失插补";
    default:
      return stage;
  }
};

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};
</script>

<template>
  <div class="version-node">
    <!-- Node Content -->
    <div class="node-card" :class="{ 'is-current': node.isCurrent }" @click="$emit('switch', node.id)">
      <div class="node-status-line" :style="{ backgroundColor: getStageColor(node.data.stageType) }"></div>

      <div class="node-main">
        <div class="node-header">
          <el-tag
            size="small"
            :color="getStageColor(node.data.stageType)"
            :effect="node.isCurrent ? 'dark' : 'plain'"
            :style="{ border: 'none', fontWeight: node.isCurrent ? 'var(--font-semibold)' : 'var(--font-normal)' }">
            {{ getStageLabel(node.data.stageType) }}
          </el-tag>
          <span class="version-id">#{{ node.id }}</span>
          <Check v-if="node.isCurrent" :size="14" class="current-icon" />
        </div>

        <div class="node-info">
          <div class="info-row remark" :title="translateRemark(node.data.remark)">
            {{ translateRemark(node.data.remark) || "无备注" }}
          </div>
          <div class="info-row time">
            <Clock :size="12" />
            {{ formatTime(node.data.createdAt) }}
          </div>
        </div>

        <div class="node-actions">
          <el-button v-if="!node.isCurrent" link type="primary" size="small" @click.stop="$emit('switch', node.id)">
            切换
          </el-button>
          <span v-else class="current-text">当前版本</span>

          <div class="secondary-actions">
            <el-button link size="small" @click.stop="$emit('export', node.id)">
              <Download :size="14" />
            </el-button>
            <!-- Delete button reserved for future use or strict permissions -->
            <!-- <el-button link type="danger" size="small" @click.stop="$emit('delete', node.id)">
              <el-icon><Delete /></el-icon>
            </el-button> -->
          </div>
        </div>
      </div>
    </div>

    <!-- Children (Recursive) -->
    <div v-if="node.children.length > 0" class="node-children">
      <!-- Connecting Line -->
      <div class="branch-line"></div>

      <div class="children-list">
        <VersionNodeItem
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          @switch="$emit('switch', $event)"
          @delete="$emit('delete', $event)"
          @export="$emit('export', $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-node {
  display: flex;
  flex-direction: column;
  position: relative;
}

.node-card {
  position: relative;
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  margin-bottom: var(--space-3);
  transition: var(--transition-base);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  box-shadow: var(--shadow-xs);
}

.node-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
  border-color: var(--c-brand-border);
}

.node-card.is-current {
  border-color: var(--c-brand);
  background-color: var(--c-brand-soft);
}

.node-status-line {
  width: 4px;
  flex-shrink: 0;
}

.node-main {
  flex: 1;
  padding: var(--space-2) var(--space-3);
}

.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.version-id {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  font-family: var(--font-mono);
}

.current-icon {
  color: var(--c-brand);
  margin-left: auto;
}

.node-info {
  margin-bottom: var(--space-2);
}

.info-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--c-text-base);
  margin-bottom: 2px;
}

.info-row.time {
  color: var(--c-text-secondary);
  font-size: var(--text-2xs);
}

.remark {
  font-weight: var(--font-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.node-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px dashed var(--c-border);
}

.current-text {
  font-size: var(--text-xs);
  color: var(--c-brand);
  font-weight: var(--font-bold);
}

.secondary-actions {
  display: flex;
  gap: var(--space-1);
}

/* Branch Logic */
.node-children {
  margin-left: 20px;
  padding-left: 12px;
  border-left: 2px dashed var(--c-border);
  position: relative;
}

.branch-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -11px;
  width: 1px;
  background-color: var(--c-border);
}

.children-list {
  display: flex;
  flex-direction: column;
}
</style>
