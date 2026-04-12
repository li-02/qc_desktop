<script setup lang="ts">
import { computed } from "vue";
import type { DatasetVersionInfo } from "@shared/types/projectInterface";
import { getVersionDisplayName, getStageLabel } from "@/utils/versionUtils";

const props = defineProps<{
  versions: DatasetVersionInfo[];
}>();

interface TreeNode {
  id: number;
  label: string;
  date: string;
  badge: string;
  badgeClass: string;
  isChild: boolean;
}

const BADGE_MAP: Record<string, string> = {
  RAW: "badge-green",
  FILTERED: "badge-amber",
  QC: "badge-blue",
  PARTITIONED: "badge-purple",
};

const treeNodes = computed<TreeNode[]>(() => {
  // Sort oldest first for tree display
  const sorted = [...props.versions].sort((a, b) => a.createdAt - b.createdAt);
  return sorted.map((v, i) => ({
    id: v.id,
    label: `v${i + 1} ${getVersionDisplayName(v.remark, v.stageType)}`,
    date: new Date(v.createdAt).toLocaleDateString(),
    badge: getStageLabel(v.stageType),
    badgeClass: BADGE_MAP[v.stageType] || "badge-default",
    isChild: i > 0,
  }));
});
</script>

<template>
  <div class="version-card">
    <div class="card-header">
      <span class="card-title">版本管理</span>
    </div>
    <div class="card-body">
      <div v-if="treeNodes.length === 0" class="empty-hint">暂无版本记录</div>
      <div v-else class="v-tree">
        <div v-for="node in treeNodes" :key="node.id" class="v-node" :class="{ child: node.isChild }">
          <span class="v-name">{{ node.label }}</span>
          <span class="v-date">({{ node.date }})</span>
          <span class="v-badge" :class="node.badgeClass">{{ node.badge }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-card {
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

/* Version Tree */
.v-tree {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
}

.v-node {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.v-node.child {
  padding-left: 24px;
  position: relative;
}

.v-node.child::before {
  content: "└─";
  position: absolute;
  left: 4px;
  color: var(--color-neutral-300);
  font-size: var(--text-xs);
}

.v-name {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--c-text-base);
}

.v-date {
  font-size: var(--text-2xs);
  color: var(--c-text-disabled);
}

.v-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-btn);
  font-weight: var(--font-semibold);
}

.badge-green {
  background: var(--color-green-100);
  color: var(--color-green-600);
}

.badge-amber {
  background: var(--color-amber-100);
  color: var(--color-amber-600);
}

.badge-blue {
  background: var(--color-blue-100);
  color: var(--color-blue-600);
}

.badge-purple {
  background: var(--color-purple-100);
  color: var(--color-purple-600);
}

.badge-default {
  background: var(--color-neutral-200);
  color: var(--color-neutral-600);
}
</style>
