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
          @click="handleSelect(type as WorkflowNodeType)">
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
import type { WorkflowNodeType } from "@shared/types/workflow";
import { NODE_TYPE_META } from "@shared/types/workflow";

const emit = defineEmits<{
  (e: "select", nodeType: WorkflowNodeType, nodeName: string): void;
  (e: "close"): void;
}>();

const handleSelect = (type: WorkflowNodeType) => {
  const meta = NODE_TYPE_META[type];
  emit("select", type, meta.label);
};
</script>

<style scoped>
.selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(17, 24, 39, 0.36);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(3px);
}

.selector-dialog {
  background: #ffffff;
  border-radius: var(--radius-2xl);
  border: 1px solid rgba(212, 232, 219, 0.82);
  box-shadow: 0 18px 42px rgb(17 24 39 / 0.18);
  width: 440px;
  max-width: calc(100vw - 40px);
  max-height: min(640px, calc(100vh - 56px));
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 16px 20px;
  background: linear-gradient(180deg, #f4fbf7 0%, #edf7f2 100%);
  border-bottom: none;
}

.dialog-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: #172033;
  margin: 0;
}

.btn-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 28px;
  color: var(--c-text-muted);
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: var(--radius-control);
  transition: all 0.15s;
}

.btn-close:hover {
  color: var(--c-text-primary);
  background: rgba(0, 0, 0, 0.05);
}

.type-grid {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.type-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 14px;
  border-radius: var(--radius-panel);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.type-card:hover {
  background: #f4fbf7;
  border-color: #b8d9c4;
  transform: translateX(2px);
}

.type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  background: #d8faec;
  border: 1px solid #8ee6c0;
  color: #087a57;
  font-size: var(--text-2xl);
  flex-shrink: 0;
}

.type-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.type-name {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  color: #172033;
}

.type-desc {
  font-size: var(--text-sm);
  color: #61708a;
}

.type-badge {
  font-size: var(--text-2xs);
  padding: 2px 8px;
  border-radius: var(--radius-control);
  background: rgba(16, 185, 129, 0.08);
  color: var(--c-brand);
  font-weight: 500;
  flex-shrink: 0;
}
</style>
