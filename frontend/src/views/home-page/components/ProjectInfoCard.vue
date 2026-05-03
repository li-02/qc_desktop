<script setup lang="ts">
import { BarChart2 } from "@/components/icons/iconoir";
import { useCategoryStore } from "@/stores/useCategoryStore";
import { computed } from "vue";

const categoryStore = useCategoryStore();
const categoryName = computed(() => categoryStore.currentCategory?.name || "");
const datasetCount = computed(() => categoryStore.currentCategory?.datasets?.length || 0);
const createdAt = computed(() => {
  const ts = categoryStore.currentCategory?.createdAt;
  return ts ? new Date(ts).toLocaleDateString() : "";
});
</script>

<template>
  <div class="project-info-card">
    <!-- 左侧项目名 地理信息 -->
    <div class="left-section">
      <div class="project-icon">
        <BarChart2 :size="20" class="icon" />
      </div>
      <div class="project-details">
        <h1 class="project-name">{{ categoryName }}</h1>
        <p class="project-meta">创建于: {{ createdAt }}</p>
      </div>
    </div>

    <!-- 右侧项目下数据集个数-->
    <div class="right-section">
      <div class="stat-item">
        <div class="stat-value">{{ datasetCount }}</div>
        <div class="stat-label">数据集</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-info-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: var(--space-2) var(--space-4) 0;
  padding: var(--space-3) var(--space-4);
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
}

.left-section {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.project-icon {
  width: 40px;
  height: 40px;
  background: var(--color-primary-100);
  border: 1px solid var(--color-primary-200);
  border-radius: var(--radius-panel);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon {
  color: var(--color-primary-700);
  font-size: var(--text-3xl);
}

.project-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-name {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--c-text-base);
  margin: 0;
}

.project-meta {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  margin: 0;
}

.right-section {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--c-brand);
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}
</style>
