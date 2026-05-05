<script setup lang="ts">
import { computed } from "vue";
import type { VersionStatsInfo } from "@shared/types/projectInterface";

const props = defineProps<{
  stats: VersionStatsInfo | null;
  datasetName?: string;
}>();

interface BarItem {
  name: string;
  count: number;
  rate: number; // percentage
}

const topMissing = computed<BarItem[]>(() => {
  if (!props.stats) return [];
  const colStats = props.stats.columnStats;
  if (!colStats) return [];

  const missingMap = getMissingMap(colStats);

  const totalRows = props.stats.totalRows || 1;
  const entries = Object.entries(missingMap)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([name, count]) => ({
      name,
      count,
      rate: Number(((count / totalRows) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return entries;
});

const emptyHint = computed(() => {
  if (!props.stats) return "暂无统计数据";
  if (props.stats.totalMissingCount === 0) return "当前版本未检测到缺失值";
  return "暂无缺失值分布数据";
});

const getMissingMap = (colStats: Record<string, any>): Record<string, number> => {
  if (Array.isArray(colStats)) {
    return colStats.reduce<Record<string, number>>((acc, item) => {
      const name = item.columnName || item.column || item.name;
      const count = item.missingCount ?? item.missing_count ?? item.missing ?? 0;
      if (name && typeof count === "number") acc[name] = count;
      return acc;
    }, {});
  }

  const nested = colStats.columnMissingStatus ?? colStats.missingStatus ?? colStats.missingCounts;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested;

  return colStats;
};

const maxRate = computed(() => {
  if (topMissing.value.length === 0) return 1;
  return Math.max(...topMissing.value.map(i => i.rate), 0.1);
});
</script>

<template>
  <div class="missing-card">
    <div class="card-header">
      <span class="card-title">缺失值分布 (Top 5)</span>
      <span v-if="datasetName" class="dataset-chip">{{ datasetName }}</span>
    </div>
    <div class="card-body">
      <div v-if="topMissing.length === 0" class="empty-hint">{{ emptyHint }}</div>
      <div v-else class="bar-list">
        <div v-for="item in topMissing" :key="item.name" class="bar-item">
          <div class="bar-label-row">
            <span class="bar-name">{{ item.name }}</span>
            <span class="bar-pct">{{ item.rate }}%</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: `${(item.rate / maxRate) * 100}%` }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.missing-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.card-header {
  padding: var(--space-2-5) var(--space-3);
  border-bottom: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.card-title {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--c-text-primary);
}

.dataset-chip {
  min-width: 0;
  max-width: 50%;
  font-size: var(--text-xs);
  color: var(--c-brand);
  background: var(--c-brand-soft);
  border: 1px solid var(--c-brand-border);
  border-radius: var(--radius-btn);
  padding: var(--space-0-5) var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-body {
  padding: var(--space-3);
  flex: 1;
}

.empty-hint {
  color: var(--c-text-muted);
  font-size: var(--text-sm);
  text-align: center;
  padding: var(--space-6) 0;
}

.bar-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
}

.bar-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bar-label-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
}

.bar-name {
  color: var(--c-text-secondary);
  font-weight: var(--font-medium);
}

.bar-pct {
  color: var(--c-text-muted);
}

.bar-track {
  height: 6px;
  background: var(--color-neutral-200);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: var(--color-primary-400);
  border-radius: 3px;
  transition: width 0.4s ease;
}
</style>
