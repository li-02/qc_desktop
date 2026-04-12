<template>
  <el-collapse v-model="activeCollapse" class="target-col-collapse">
    <el-collapse-item name="target-columns" class="target-col-collapse-item">
      <template #title>
        <div class="collapse-title-row">
          <span class="collapse-title-text">目标列选择</span>
          <span class="collapse-title-badge collapse-title-badge--ok">
            {{ summary.total }} 列，{{ summary.withMissing }} 列有缺失
          </span>
          <span v-if="currentMode === 'manual'" class="collapse-title-badge collapse-title-badge--neutral">
            已选 {{ modelValue.length }} 列
          </span>
        </div>
      </template>
      <div class="target-col-body">
        <div class="target-col-header">
          <div class="target-col-mode">
            <label class="target-col-radio">
              <input type="radio" :checked="currentMode === 'all'" @change="setMode('all')" />
              <span>全部列</span>
            </label>
            <label class="target-col-radio">
              <input type="radio" :checked="currentMode === 'manual'" @change="setMode('manual')" />
              <span>手动选择</span>
            </label>
          </div>
        </div>

        <!-- 手动选择模式 -->
        <div v-if="currentMode === 'manual'" class="target-col-list">
          <div v-for="column in columns" :key="column.name" class="target-col-item">
            <label class="target-col-checkbox">
              <input
                type="checkbox"
                :value="column.name"
                :checked="modelValue.includes(column.name)"
                @change="toggleColumn(column.name, ($event.target as HTMLInputElement).checked)" />
              <div class="target-col-info">
                <span class="target-col-name">{{ column.name }}</span>
                <span class="target-col-missing">{{ column.missingCount }} 缺失</span>
                <span :class="['target-col-rate', getMissingRateClass(column.missingRate)]">
                  {{ column.missingRate.toFixed(1) }}%
                </span>
              </div>
            </label>
          </div>
          <div v-if="columns.length === 0" class="target-col-empty">
            <span>没有可用的列</span>
          </div>
        </div>

        <!-- 全部列模式 -->
        <div v-else class="target-col-list target-col-list--readonly">
          <div v-for="column in columns" :key="column.name" class="target-col-item target-col-item--compact">
            <div class="target-col-info">
              <span class="target-col-name">{{ column.name }}</span>
              <span class="target-col-missing">{{ column.missingCount }} 缺失</span>
              <span :class="['target-col-rate', getMissingRateClass(column.missingRate)]">
                {{ column.missingRate.toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

export interface ColumnInfo {
  name: string;
  missingCount: number;
  missingRate: number;
  type: string;
}

const props = defineProps<{
  columns: ColumnInfo[];
  modelValue: string[];
  mode: "all" | "manual";
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
  "update:mode": [value: "all" | "manual"];
}>();

// 默认折叠
const activeCollapse = ref<string[]>([]);

const currentMode = computed(() => props.mode);

const summary = computed(() => {
  const total = props.columns.length;
  const withMissing = props.columns.filter(c => c.missingCount > 0).length;
  return { total, withMissing };
});

const setMode = (mode: "all" | "manual") => {
  emit("update:mode", mode);
};

const toggleColumn = (name: string, checked: boolean) => {
  const current = [...props.modelValue];
  if (checked) {
    if (!current.includes(name)) current.push(name);
  } else {
    const idx = current.indexOf(name);
    if (idx !== -1) current.splice(idx, 1);
  }
  emit("update:modelValue", current);
};

const getMissingRateClass = (rate: number): string => {
  if (rate === 0) return "missing-rate--none";
  if (rate <= 5) return "missing-rate--low";
  if (rate <= 15) return "missing-rate--medium";
  return "missing-rate--high";
};
</script>

<style scoped>
/* ==================== 折叠面板 ==================== */
.target-col-collapse {
  border: none;
}

.target-col-collapse-item {
  border: 1px solid var(--eco-border-light);
  border-radius: 8px;
  margin-bottom: 0;
  overflow: hidden;
}

.target-col-collapse :deep(.el-collapse-item__header) {
  height: 42px;
  line-height: 42px;
  padding: 0 14px;
  background: var(--c-bg-muted);
  border-bottom: none;
  font-size: 13px;
}

.target-col-collapse :deep(.el-collapse-item__header.is-active) {
  border-bottom: 1px solid var(--eco-border-light);
}

.target-col-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

.target-col-collapse :deep(.el-collapse-item__content) {
  padding: 0;
}

/* ==================== 标题栏 ==================== */
.collapse-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.collapse-title-text {
  font-weight: 600;
  color: var(--eco-text-primary);
  white-space: nowrap;
}

.collapse-title-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.collapse-title-badge--ok {
  background: var(--eco-ice, #e8f5e9);
  color: var(--eco-primary, #4caf50);
}

.collapse-title-badge--neutral {
  background: var(--eco-border-light, #eee);
  color: var(--eco-text-secondary, #666);
}

/* ==================== 内容区 ==================== */
.target-col-body {
  padding: 14px;
}

.target-col-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 12px;
}

.target-col-mode {
  display: flex;
  gap: 12px;
}

.target-col-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm, 13px);
  color: var(--c-text-secondary, #666);
  cursor: pointer;
}

.target-col-radio input {
  accent-color: var(--eco-moss, #4caf50);
}

/* ==================== 列表 ==================== */
.target-col-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.target-col-list--readonly {
  gap: 4px;
}

.target-col-item {
  padding: 8px 10px;
  background: var(--eco-white, #fff);
  border: 1px solid var(--eco-border-light, #eee);
  border-radius: var(--radius-panel, 6px);
}

.target-col-item--compact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: var(--radius-sm, 4px);
  font-size: var(--text-sm, 13px);
}

.target-col-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.target-col-checkbox input {
  accent-color: var(--eco-moss, #4caf50);
}

.target-col-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.target-col-name {
  font-size: var(--text-sm, 13px);
  font-weight: 500;
  color: var(--c-text-base, #333);
}

.target-col-missing {
  font-size: var(--text-xs, 11px);
  color: var(--c-text-muted, #999);
}

.target-col-rate {
  font-size: var(--text-2xs, 10px);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-sm, 4px);
}

.target-col-empty {
  padding: 20px;
  text-align: center;
  color: var(--c-text-muted, #999);
  font-size: var(--text-sm, 13px);
}

/* ==================== 缺失率色阶 ==================== */
.missing-rate--none {
  background: rgba(209, 250, 229, 1);
  color: var(--c-brand-active, #059669);
}

.missing-rate--low {
  background: rgba(254, 243, 199, 1);
  color: #92400e;
}

.missing-rate--medium {
  background: rgba(254, 215, 170, 1);
  color: #9a3412;
}

.missing-rate--high {
  background: rgba(254, 202, 202, 1);
  color: #991b1b;
}

/* ==================== 滚动条 ==================== */
.target-col-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.target-col-list::-webkit-scrollbar-track {
  background: transparent;
}

.target-col-list::-webkit-scrollbar-thumb {
  background: var(--eco-border, #ddd);
  border-radius: 3px;
}
</style>
