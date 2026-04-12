<template>
  <div class="workflow-editor">
    <div class="pipeline-container">
      <!-- 节点列表 -->
      <div class="node-list">
        <div v-for="(node, index) in nodes" :key="node.id" class="node-wrapper">
          <!-- 连接线 -->
          <div v-if="index > 0" class="connector-line"></div>

          <WorkflowNodeCard
            :node="node"
            :index="index"
            :node-execution="workflowStore.getNodeExecution(node.id)"
            :is-running="isNodeRunning(index)"
            :is-completed="isNodeCompleted(index)"
            :is-failed="isNodeFailed(index)"
            @click="$emit('select-node', node)"
            @delete="$emit('delete-node', node.id)"
            @toggle="enabled => $emit('toggle-node', node.id, enabled)"
            @view-result="$emit('view-result', node)" />
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
import type { WorkflowNode, WorkflowProgressEvent } from "@shared/types/workflow";
import { useWorkflowStore } from "@/stores/useWorkflowStore";
import WorkflowNodeCard from "./WorkflowNodeCard.vue";

const workflowStore = useWorkflowStore();

const props = defineProps<{
  nodes: WorkflowNode[];
  executing: boolean;
  executionProgress: WorkflowProgressEvent | null;
}>();

defineEmits<{
  (e: "add-node"): void;
  (e: "select-node", node: WorkflowNode): void;
  (e: "delete-node", nodeId: number): void;
  (e: "toggle-node", nodeId: number, enabled: boolean): void;
  (e: "reorder", nodeIds: number[]): void;
  (e: "view-result", node: WorkflowNode): void;
}>();

const isNodeRunning = (index: number) => {
  if (!props.executing || !props.executionProgress) return false;
  return props.executionProgress.currentNodeIndex === index && props.executionProgress.nodeStatus === "RUNNING";
};

const isNodeCompleted = (index: number) => {
  if (props.executionProgress) {
    return (
      props.executionProgress.currentNodeIndex > index ||
      (props.executionProgress.currentNodeIndex === index && props.executionProgress.nodeStatus === "COMPLETED")
    );
  }
  // 无实时进度时，降级读取历史执行记录
  const node = props.nodes[index];
  if (!node) return false;
  const exec = workflowStore.getNodeExecution(node.id);
  return exec?.status === "COMPLETED";
};

const isNodeFailed = (index: number) => {
  if (props.executionProgress) {
    return props.executionProgress.currentNodeIndex === index && props.executionProgress.nodeStatus === "FAILED";
  }
  // 无实时进度时，降级读取历史执行记录
  const node = props.nodes[index];
  if (!node) return false;
  const exec = workflowStore.getNodeExecution(node.id);
  return exec?.status === "FAILED";
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
  background: linear-gradient(180deg, var(--c-brand-border), var(--c-brand-soft));
  border-radius: var(--radius-xs);
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
  border: 2px dashed var(--c-brand-border);
  border-radius: var(--radius-control);
  background: rgba(16, 185, 129, 0.04);
  color: var(--c-brand);
  font-size: var(--text-md);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  justify-content: center;
}

.btn-add-node:hover {
  background: var(--c-brand-soft);
  border-color: var(--c-brand);
  transform: translateY(-1px);
}

.add-icon {
  font-size: var(--text-2xl);
  font-weight: 700;
}
</style>
