<script setup lang="ts">
import type { DatasetVersionInfo } from "@shared/types/projectInterface";
import { translateRemark } from "@/utils/versionUtils";
import { Download, Check, Timer } from "@element-plus/icons-vue";

// Tree Node Interface defined in parent, repeated here for type safety if needed,
// or just use 'any' for the recursive prop if strict types are hard to share without a common file.
// Ideally types are in a shared file.
interface VersionNode {
  id: number;
  data: DatasetVersionInfo;
  children: VersionNode[];
  isCurrent: boolean;
}

const props = defineProps<{
  node: VersionNode;
}>();

const emit = defineEmits<{
  (e: "switch", id: number): void;
  (e: "delete", id: number): void;
  (e: "export", id: number): void;
}>();

const getStageColor = (stage: string) => {
  switch (stage) {
    case "RAW":
      return "#909399"; // Info/Gray
    case "FILTERED":
      return "#e6a23c"; // Warning/Orange
    case "QC":
      return "#67c23a"; // Success/Green
    default:
      return "#409eff"; // Primary/Blue
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
          <el-tag size="small" :color="getStageColor(node.data.stageType)" effect="dark" style="border: none">
            {{ getStageLabel(node.data.stageType) }}
          </el-tag>
          <span class="version-id">#{{ node.id }}</span>
          <el-icon v-if="node.isCurrent" class="current-icon"><Check /></el-icon>
        </div>

        <div class="node-info">
          <div class="info-row remark" :title="translateRemark(node.data.remark)">
            {{ translateRemark(node.data.remark) || "无备注" }}
          </div>
          <div class="info-row time">
            <el-icon><Timer /></el-icon>
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
              <el-icon><Download /></el-icon>
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
  background: white;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.2s;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.node-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
  border-color: var(--el-color-primary-light-7);
}

.node-card.is-current {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.node-status-line {
  width: 4px;
  flex-shrink: 0;
}

.node-main {
  flex: 1;
  padding: 10px 12px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.version-id {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.current-icon {
  color: var(--el-color-primary);
  margin-left: auto;
}

.node-info {
  margin-bottom: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 2px;
}

.info-row.time {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.remark {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.node-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.current-text {
  font-size: 11px;
  color: var(--el-color-primary);
  font-weight: bold;
}

.secondary-actions {
  display: flex;
  gap: 4px;
}

/* Branch Logic */
.node-children {
  margin-left: 20px; /* Indent */
  padding-left: 12px;
  border-left: 2px dashed var(--el-border-color-light);
  position: relative;
}

.branch-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -11px; /* Adjust based on padding */
  width: 1px;
  background-color: var(--el-border-color-light);
}

.children-list {
  display: flex;
  flex-direction: column;
}
</style>
