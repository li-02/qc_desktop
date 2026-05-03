<template>
  <button
    :disabled="disabled || loading"
    :class="['action-btn', `action-btn--${color}`, { 'is-disabled': disabled, 'is-loading': loading }]"
    @click="handleClick">
    <!-- 加载状态覆盖层 -->
    <div v-if="loading" class="loading-overlay">
      <Loader2 :size="18" class="spin-icon" />
    </div>

    <!-- 徽章 -->
    <div v-if="badge && !loading" :class="['action-badge', `badge--${badgeType}`]">
      {{ badge }}
    </div>

    <!-- 图标 -->
    <div :class="['action-icon', { 'is-faded': loading }]">
      {{ icon }}
    </div>

    <!-- 标题和描述 -->
    <div class="action-body">
      <div :class="['action-title', { 'is-faded': loading }]">{{ title }}</div>
      <div :class="['action-desc', { 'is-faded': loading }]">{{ description }}</div>
    </div>

    <!-- 状态指示器 -->
    <div v-if="showStatus" class="status-row">
      <span :class="['status-dot', `status-dot--${status}`]"></span>
      <span :class="['status-text', `status-text--${status}`]">{{ statusText }}</span>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Loader2 } from "@/components/icons/iconoir";

// Props
interface Props {
  icon: string;
  title: string;
  description: string;
  color?: "emerald" | "blue" | "purple" | "orange" | "gray" | "red";
  disabled?: boolean;
  loading?: boolean;
  badge?: string | number | null;
  badgeType?: "primary" | "success" | "warning" | "danger" | "info";
  status?: "idle" | "processing" | "completed" | "error";
  showStatus?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  color: "emerald",
  disabled: false,
  loading: false,
  badge: null,
  badgeType: "primary",
  status: "idle",
  showStatus: false,
});

// Emits
const emit = defineEmits<{
  click: [];
}>();

const statusText = computed(() => {
  const statusMap = { idle: "就绪", processing: "处理中", completed: "已完成", error: "失败" };
  return statusMap[props.status];
});

// Methods
const handleClick = () => {
  if (!props.disabled && !props.loading) {
    emit("click");
  }
};
</script>

<style scoped>
/* 基础按钮 */
.action-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border: none;
  border-radius: var(--radius-btn);
  min-height: 96px;
  cursor: pointer;
  text-align: center;
  font-family: inherit;
  transition: var(--transition-base);
  color: var(--c-text-inverse);
  box-shadow: var(--shadow-sm);
}

.action-btn:hover:not(.is-disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.action-btn.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 颜色变体 */
.action-btn--emerald {
  background: var(--c-brand);
}
.action-btn--emerald:hover:not(.is-disabled) {
  background: var(--c-brand-hover);
}

.action-btn--blue {
  background: var(--color-blue-600);
}
.action-btn--blue:hover:not(.is-disabled) {
  background: var(--color-blue-700);
}

.action-btn--purple {
  background: var(--color-purple-600);
}
.action-btn--purple:hover:not(.is-disabled) {
  background: var(--color-purple-700);
}

.action-btn--orange {
  background: var(--color-orange-600);
}
.action-btn--orange:hover:not(.is-disabled) {
  background: var(--color-orange-700);
}

.action-btn--gray {
  background: var(--color-neutral-600);
}
.action-btn--gray:hover:not(.is-disabled) {
  background: var(--color-neutral-700);
}

.action-btn--red {
  background: var(--color-red-600);
}
.action-btn--red:hover:not(.is-disabled) {
  background: var(--color-red-700);
}

/* 加载层 */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.2);
  border-radius: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.spin-icon {
  font-size: var(--text-xl);
  animation: qc-spin 1s linear infinite;
}

/* 徽章 */
.action-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  padding: 2px var(--space-1);
  border-radius: var(--radius-full);
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-xs);
  color: var(--c-text-inverse);
  animation: badge-appear 0.3s ease-out;
}

.badge--primary {
  background: var(--color-blue-500);
}
.badge--success {
  background: var(--c-brand);
}
.badge--warning {
  background: var(--color-amber-500);
}
.badge--danger {
  background: var(--color-red-500);
}
.badge--info {
  background: var(--color-neutral-500);
}

/* 图标 */
.action-icon {
  font-size: var(--text-4xl);
  transition: transform var(--transition-fast);
}

.action-btn:hover:not(.is-disabled) .action-icon {
  transform: scale(1.1);
}

.action-icon.is-faded {
  opacity: 0.3;
}

/* 文字 */
.action-body {
  flex: 1;
}

.action-title {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin-bottom: var(--space-1);
}

.action-title.is-faded {
  opacity: 0.5;
}

.action-desc {
  font-size: var(--text-xs);
  opacity: 0.8;
  line-height: 1.3;
}

.action-desc.is-faded {
  opacity: 0.3;
}

/* 状态指示器 */
.status-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.status-dot--idle {
  background: var(--color-neutral-400);
}
.status-dot--processing {
  background: var(--color-amber-400);
  animation: pulse 2s infinite;
}
.status-dot--completed {
  background: var(--c-brand);
}
.status-dot--error {
  background: var(--color-red-400);
}

.status-text--idle {
  opacity: 0.8;
}
.status-text--processing {
  color: var(--color-amber-400);
}
.status-text--completed {
  color: var(--c-text-inverse);
}
.status-text--error {
  color: var(--color-red-400);
}

@keyframes badge-appear {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (max-width: 768px) {
  .action-btn {
    min-height: 80px;
    padding: var(--space-2);
  }

  .action-icon {
    font-size: var(--text-3xl);
  }
}
</style>
