<template>
  <div class="workflow-list">
    <div v-if="loading" class="list-loading">
      <span>加载中...</span>
    </div>
    <div v-else-if="workflows.length === 0" class="list-empty">
      <span class="empty-hint">暂无工作流</span>
    </div>
    <div
      v-for="wf in workflows"
      :key="wf.id"
      class="workflow-item"
      :class="{ active: wf.id === activeId }"
      @click="$emit('select', wf.id)"
    >
      <div class="item-main">
        <div class="item-name">{{ wf.name }}</div>
      </div>
      <div class="item-actions" @click.stop>
        <button class="action-btn" title="克隆" @click="$emit('clone', wf.id)">📋</button>
        <button class="action-btn danger" title="删除" @click="$emit('delete', wf.id)">🗑️</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Workflow } from '@shared/types/workflow';

defineProps<{
  workflows: Workflow[];
  loading: boolean;
  activeId?: number;
}>();

defineEmits<{
  (e: 'select', id: number): void;
  (e: 'delete', id: number): void;
  (e: 'clone', id: number): void;
}>();

</script>

<style scoped>
.workflow-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.list-loading, .list-empty {
  padding: 32px 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}

.workflow-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 4px;
}

.workflow-item:hover {
  background: rgba(16, 185, 129, 0.06);
}

.workflow-item.active {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.item-status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

.s-draft { background: rgba(156, 163, 175, 0.12); color: #6b7280; }
.s-ready { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.s-running { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.s-completed { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.s-failed { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

.item-time {
  font-size: 11px;
  color: #9ca3af;
}

.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.workflow-item:hover .item-actions {
  opacity: 1;
}

.action-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.15s;
}

.action-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
}
</style>
