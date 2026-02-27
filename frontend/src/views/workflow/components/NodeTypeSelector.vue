<template>
  <div class="selector-overlay" @click.self="$emit('close')">
    <div class="selector-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">选择节点类型</h3>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>
      <div class="type-grid">
        <div
          v-for="(meta, type) in NODE_TYPE_META"
          :key="type"
          class="type-card"
          @click="handleSelect(type as WorkflowNodeType)"
        >
          <span class="type-icon">{{ meta.icon }}</span>
          <div class="type-info">
            <span class="type-name">{{ meta.label }}</span>
            <span class="type-desc">{{ meta.description }}</span>
          </div>
          <span class="type-badge" v-if="meta.producesVersion">新版本</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkflowNodeType } from '@shared/types/workflow';
import { NODE_TYPE_META } from '@shared/types/workflow';

const emit = defineEmits<{
  (e: 'select', nodeType: WorkflowNodeType, nodeName: string): void;
  (e: 'close'): void;
}>();

const handleSelect = (type: WorkflowNodeType) => {
  const meta = NODE_TYPE_META[type];
  emit('select', type, meta.label);
};
</script>

<style scoped>
.selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.selector-dialog {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.btn-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  color: #9ca3af;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}

.btn-close:hover {
  color: #1f2937;
  background: rgba(0, 0, 0, 0.05);
}

.type-grid {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.type-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.type-card:hover {
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.2);
  transform: translateX(4px);
}

.type-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.type-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.type-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.type-desc {
  font-size: 12px;
  color: #9ca3af;
}

.type-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.08);
  color: #10b981;
  font-weight: 500;
  flex-shrink: 0;
}
</style>
