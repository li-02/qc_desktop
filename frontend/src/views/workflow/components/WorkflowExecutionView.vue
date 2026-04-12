<template>
  <div class="execution-view">
    <div class="execution-header">
      <div class="execution-info">
        <span class="execution-label">执行进度</span>
        <span class="execution-percent">{{ overallProgress }}%</span>
      </div>
      <button v-if="executing" class="btn-cancel" @click="$emit('cancel')">取消执行</button>
    </div>

    <div class="progress-bar-container">
      <div class="progress-bar" :style="{ width: overallProgress + '%' }"></div>
    </div>

    <div class="execution-message" v-if="progress">
      <span class="message-icon" :class="statusClass">{{ statusIcon }}</span>
      <span class="message-text">{{ progress.message }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WorkflowProgressEvent } from "@shared/types/workflow";

const props = defineProps<{
  progress: WorkflowProgressEvent | null;
  overallProgress: number;
  executing: boolean;
}>();

defineEmits<{
  (e: "cancel"): void;
}>();

const statusIcon = computed(() => {
  if (!props.progress) return "⏳";
  switch (props.progress.nodeStatus) {
    case "RUNNING":
      return "⏳";
    case "COMPLETED":
      return "✅";
    case "FAILED":
      return "❌";
    case "SKIPPED":
      return "⏭️";
    default:
      return "⏳";
  }
});

const statusClass = computed(() => {
  if (!props.progress) return "";
  return "status-" + props.progress.nodeStatus.toLowerCase();
});
</script>

<style scoped>
.execution-view {
  padding: 16px 20px;
  border-top: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  backdrop-filter: blur(8px);
}

.execution-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.execution-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.execution-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
}

.execution-percent {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-brand);
  font-family: var(--font-mono);
}

.btn-cancel {
  padding: 5px 14px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-control);
  background: rgba(239, 68, 68, 0.06);
  color: var(--c-danger);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: var(--c-danger);
}

.progress-bar-container {
  height: 6px;
  background: var(--c-border);
  border-radius: var(--radius-xs);
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--c-brand), var(--color-primary-300));
  border-radius: var(--radius-xs);
  transition: width 0.4s ease;
}

.execution-message {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-icon {
  font-size: var(--text-md);
}

.message-text {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
}

.status-running {
  color: var(--c-warning);
}
.status-completed {
  color: var(--c-brand);
}
.status-failed {
  color: var(--c-danger);
}
.status-skipped {
  color: var(--c-text-muted);
}
</style>
