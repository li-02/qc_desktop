<script setup lang="ts">
import { computed } from "vue";
import type { DatasetVersionInfo } from "@shared/types/projectInterface";
import { getVersionDisplayName } from "@/utils/versionUtils";
import { formatLocalWithTZ } from "@/utils/timeUtils";

const props = defineProps<{
  versions: DatasetVersionInfo[];
}>();

interface TimelineItem {
  id: number;
  time: string;
  desc: string;
  dotColor: "green" | "blue" | "orange";
}

const DOT_MAP: Record<string, "green" | "blue" | "orange"> = {
  RAW: "green",
  FILTERED: "orange",
  QC: "blue",
  PARTITIONED: "blue",
};

const ACTION_MAP: Record<string, string> = {
  RAW: "导入数据集",
  FILTERED: "执行异常值检测",
  QC: "执行缺失值插补",
  PARTITIONED: "执行通量分割",
};

const items = computed<TimelineItem[]>(() => {
  // Show most recent first, max 5
  return [...props.versions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5)
    .map(v => ({
      id: v.id,
      time: formatLocalWithTZ(v.createdAt),
      desc: ACTION_MAP[v.stageType] || getVersionDisplayName(v.remark, v.stageType),
      dotColor: DOT_MAP[v.stageType] || "blue",
    }));
});
</script>

<template>
  <div class="activity-card">
    <div class="card-header">
      <span class="card-title">最近活动</span>
    </div>
    <div class="card-body">
      <div v-if="items.length === 0" class="empty-hint">暂无活动记录</div>
      <div v-else class="timeline">
        <div v-for="item in items" :key="item.id" class="tl-item">
          <div class="tl-dot" :class="`dot-${item.dotColor}`" />
          <div class="tl-content">
            <div class="tl-time">{{ item.time }}</div>
            <div class="tl-desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity-card {
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
  min-height: 0;
  overflow-y: auto;
}

.card-body::-webkit-scrollbar {
  width: 6px;
}

.card-body::-webkit-scrollbar-track {
  background: transparent;
}

.card-body::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 225, 0.6);
  border-radius: var(--radius-xs);
}

.card-body::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.8);
}

.empty-hint {
  color: var(--c-text-muted);
  font-size: var(--text-sm);
  text-align: center;
  padding: var(--space-6) 0;
}

/* Timeline */
.timeline {
  display: flex;
  flex-direction: column;
  padding-left: 4px;
}

.tl-item {
  display: flex;
  position: relative;
  padding-bottom: 16px;
}

.tl-item:last-child {
  padding-bottom: 0;
}

/* Vertical line */
.tl-item::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 15px;
  bottom: -5px;
  width: 2px;
  background: var(--color-neutral-200);
  z-index: 1;
}

.tl-item:last-child::before {
  display: none;
}

/* Dot */
.tl-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 4px;
  position: relative;
  z-index: 2;
  background: white;
  border: 2px solid var(--color-neutral-300);
  flex-shrink: 0;
}

.dot-green {
  border-color: var(--color-primary-500);
}

.dot-blue {
  border-color: var(--color-blue-600);
}

.dot-orange {
  border-color: var(--color-amber-600);
}

.tl-content {
  padding-left: var(--space-2-5);
  flex: 1;
}

.tl-time {
  font-size: var(--text-2xs);
  color: var(--c-text-muted);
  margin-bottom: 2px;
}

.tl-desc {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
}
</style>
