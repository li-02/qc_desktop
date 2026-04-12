<script setup lang="ts">
import { computed } from "vue";
import { List, Columns3, CheckCircle, AlertTriangle } from "lucide-vue-next";
import type { VersionStatsInfo } from "@shared/types/projectInterface";

const props = defineProps<{
  stats: VersionStatsInfo | null;
  qualityPercentage?: number;
}>();

const totalRows = computed(() => props.stats?.totalRows ?? 0);
const totalCols = computed(() => props.stats?.totalCols ?? 0);
const totalOutliers = computed(() => props.stats?.totalOutlierCount ?? 0);

const completeness = computed(() => {
  if (props.qualityPercentage != null) return Number(props.qualityPercentage.toFixed(2));
  if (!props.stats) return 0;
  const { totalRows, totalCols, totalMissingCount } = props.stats;
  const totalCells = totalRows * totalCols;
  if (totalCells === 0) return 0;
  return Number((((totalCells - totalMissingCount) / totalCells) * 100).toFixed(2));
});

const formatNumber = (n: number): string => {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
};
</script>

<template>
  <div class="quality-card">
    <div class="card-header">
      <span class="card-title">数据质量概览</span>
    </div>
    <div class="card-body">
      <div class="stats-grid">
        <div class="stat-cell">
          <div class="stat-icon-wrapper icon-green">
            <List :size="15" />
          </div>
          <div class="stat-label">总行数</div>
          <div class="stat-value">{{ formatNumber(totalRows) }}</div>
        </div>
        <div class="stat-cell">
          <div class="stat-icon-wrapper icon-blue">
            <Columns3 :size="15" />
          </div>
          <div class="stat-label">总列数</div>
          <div class="stat-value">{{ totalCols }}</div>
        </div>
        <div class="stat-cell">
          <div class="stat-icon-wrapper icon-green">
            <CheckCircle :size="15" />
          </div>
          <div class="stat-label">数据完整率</div>
          <div class="stat-value">{{ completeness }}%</div>
        </div>
        <div class="stat-cell">
          <div class="stat-icon-wrapper icon-amber">
            <AlertTriangle :size="15" />
          </div>
          <div class="stat-label">异常值</div>
          <div class="stat-value" :class="{ 'value-warn': totalOutliers > 0 }">
            {{ totalOutliers }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quality-card {
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
}

.card-title {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--c-text-primary);
}

.card-body {
  padding: var(--space-3);
  flex: 1;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2-5);
  height: 100%;
}

.stat-cell {
  background: var(--c-bg-muted);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  padding: var(--space-2-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
}

.stat-icon-wrapper {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-green {
  background: var(--color-primary-100);
  color: var(--color-primary-500);
}

.icon-blue {
  background: var(--color-blue-100);
  color: var(--color-blue-600);
}

.icon-amber {
  background: var(--color-amber-100);
  color: var(--color-amber-600);
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.stat-value {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--c-text-base);
}

.value-warn {
  color: var(--color-amber-600);
}
</style>
