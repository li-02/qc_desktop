<template>
  <div class="execution-view">
    <div class="execution-header">
      <div class="execution-info">
        <span class="execution-label">执行进度</span>
        <span class="execution-percent">{{ overallProgress }}%</span>
      </div>
      <button
        v-if="executing"
        class="btn-cancel"
        @click="$emit('cancel')"
      >
        取消执行
      </button>
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
import { computed } from 'vue';
import type { WorkflowProgressEvent } from '@shared/types/workflow';

const props = defineProps<{
  progress: WorkflowProgressEvent | null;
  overallProgress: number;
  executing: boolean;
}>();

defineEmits<{
  (e: 'cancel'): void;
}>();

const statusIcon = computed(() => {
  if (!props.progress) return '⏳';
  switch (props.progress.nodeStatus) {
    case 'RUNNING': return '⏳';
    case 'COMPLETED': return '✅';
    case 'FAILED': return '❌';
    case 'SKIPPED': return '⏭️';
    default: return '⏳';
  }
});

const statusClass = computed(() => {
  if (!props.progress) return '';
  return 'status-' + props.progress.nodeStatus.toLowerCase();
});
</script>

<style scoped>
.execution-view {
  padding: 16px 20px;
  border-top: 1px solid rgba(229, 231, 235, 0.4);
  background: rgba(255, 255, 255, 0.6);
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
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.execution-percent {
  font-size: 13px;
  font-weight: 600;
  color: #10b981;
  font-family: 'Courier New', monospace;
}

.btn-cancel {
  padding: 5px 14px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.06);
  color: #ef4444;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: #ef4444;
}

.progress-bar-container {
  height: 6px;
  background: rgba(229, 231, 235, 0.4);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.execution-message {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-icon {
  font-size: 14px;
}

.message-text {
  font-size: 13px;
  color: #6b7280;
}

.status-running { color: #f59e0b; }
.status-completed { color: #10b981; }
.status-failed { color: #ef4444; }
.status-skipped { color: #9ca3af; }
</style>
