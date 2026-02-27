<template>
  <div class="workflow-editor">
    <div class="pipeline-container">
      <!-- 节点列表 -->
      <div class="node-list">
        <div
          v-for="(node, index) in nodes"
          :key="node.id"
          class="node-wrapper"
        >
          <!-- 连接线 -->
          <div v-if="index > 0" class="connector-line"></div>

          <WorkflowNodeCard
            :node="node"
            :index="index"
            :is-running="isNodeRunning(index)"
            :is-completed="isNodeCompleted(index)"
            :is-failed="isNodeFailed(index)"
            @click="$emit('select-node', node)"
            @delete="$emit('delete-node', node.id)"
            @toggle="(enabled) => $emit('toggle-node', node.id, enabled)"
          />
        </div>
      </div>

      <!-- 添加节点按钮 -->
      <div class="add-node-area">
        <div v-if="nodes.length > 0" class="connector-line"></div>
        <button class="btn-add-node" @click="$emit('add-node')">
          <span class="add-icon">+</span>
          <span>添加节点</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkflowNode, WorkflowProgressEvent } from '@shared/types/workflow';
import WorkflowNodeCard from './WorkflowNodeCard.vue';

const props = defineProps<{
  nodes: WorkflowNode[];
  executing: boolean;
  executionProgress: WorkflowProgressEvent | null;
}>();

defineEmits<{
  (e: 'add-node'): void;
  (e: 'select-node', node: WorkflowNode): void;
  (e: 'delete-node', nodeId: number): void;
  (e: 'toggle-node', nodeId: number, enabled: boolean): void;
  (e: 'reorder', nodeIds: number[]): void;
}>();

const isNodeRunning = (index: number) => {
  if (!props.executing || !props.executionProgress) return false;
  return props.executionProgress.currentNodeIndex === index &&
    props.executionProgress.nodeStatus === 'RUNNING';
};

const isNodeCompleted = (index: number) => {
  if (!props.executionProgress) return false;
  return props.executionProgress.currentNodeIndex > index ||
    (props.executionProgress.currentNodeIndex === index &&
      props.executionProgress.nodeStatus === 'COMPLETED');
};

const isNodeFailed = (index: number) => {
  if (!props.executionProgress) return false;
  return props.executionProgress.currentNodeIndex === index &&
    props.executionProgress.nodeStatus === 'FAILED';
};
</script>

<style scoped>
.workflow-editor {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.pipeline-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 520px;
  margin: 0 auto;
}

.node-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.node-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.connector-line {
  width: 2px;
  height: 24px;
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.15));
  border-radius: 1px;
}

.add-node-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.btn-add-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border: 2px dashed rgba(16, 185, 129, 0.35);
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.04);
  color: #10b981;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  justify-content: center;
}

.btn-add-node:hover {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
  transform: translateY(-1px);
}

.add-icon {
  font-size: 18px;
  font-weight: 700;
}
</style>
