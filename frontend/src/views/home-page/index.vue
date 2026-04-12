<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Plus, Eye, Search, Download, AlertTriangle, FileText } from "lucide-vue-next";
import { useCategoryStore } from "@/stores/useCategoryStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import emitter from "@/utils/eventBus";

import ProjectInfoCard from "./components/ProjectInfoCard.vue";
import DatasetInfoCard from "./components/DatasetInfoCard.vue";
import DataQualityOverview from "./components/DataQualityOverview.vue";
import MissingDistribution from "./components/MissingDistribution.vue";
import WorkflowProgress from "./components/WorkflowProgress.vue";
import RecentActivity from "./components/RecentActivity.vue";
import VersionTree from "./components/VersionTree.vue";
import UserGuideModal from "./components/UserGuideModal.vue";

const router = useRouter();
const categoryStore = useCategoryStore();
const datasetStore = useDatasetStore();

// ── Data loading ──
// Auto-load the first dataset's details when category changes
const dataLoading = ref(false);

const firstDataset = computed(() => {
  const datasets = categoryStore.currentCategory?.datasets || [];
  return datasets.length > 0 ? datasets[0] : null;
});

watch(
  () => firstDataset.value,
  async ds => {
    if (ds) {
      dataLoading.value = true;
      try {
        await datasetStore.setCurrentDataset(ds.id);
      } finally {
        dataLoading.value = false;
      }
    }
  },
  { immediate: true }
);

// ── Computed data for child components ──
const versionStats = computed(() => datasetStore.currentVersionStats);
const versions = computed(() => datasetStore.versions);
const qualityPercentage = computed(() => {
  const dq = datasetStore.currentDataset?.originalFile?.dataQuality;
  return dq?.qualityPercentage ?? undefined;
});

// ── Navigation ──
const quickViewData = () => {
  const ds = firstDataset.value;
  if (ds) {
    router.push(`/data-view?dataset=${ds.id}`);
  } else {
    ElMessage.warning("请先导入数据集");
  }
};

const navigateTo = (route: string) => {
  router.push(route);
};

const handleExport = async () => {
  const version = datasetStore.currentVersion;
  if (version) {
    await datasetStore.exportVersion(version.id);
  } else {
    ElMessage.warning("暂无可导出的版本");
  }
};

// ── Empty state ──
const handleCreateCategory = () => {
  emitter.emit("open-create-category-dialog");
};

const guideVisible = ref(false);
const showGuide = () => {
  guideVisible.value = true;
};
</script>

<template>
  <div v-if="categoryStore.hasCategories" class="home-container">
    <!-- Top Project Info (kept from original) -->
    <ProjectInfoCard />

    <!-- Main Content -->
    <div class="main-content">
      <!-- Row 1: Dataset List + Quality Overview -->
      <div class="row-grid">
        <DatasetInfoCard />
        <DataQualityOverview :stats="versionStats" :quality-percentage="qualityPercentage" />
      </div>

      <!-- Row 2: Missing Distribution + Workflow Progress -->
      <div class="row-grid">
        <MissingDistribution :stats="versionStats" />
        <WorkflowProgress :versions="versions" />
      </div>

      <!-- Row 3: Recent Activity + Version Tree (fixed height, scroll inside) -->
      <div class="row-grid row-grid-fixed">
        <RecentActivity :versions="versions" />
        <VersionTree :versions="versions" />
      </div>
    </div>

    <!-- Action Bar (pinned to bottom, outside scroll area) -->
    <div class="action-bar">
      <button class="action-btn action-btn-primary" @click="quickViewData">
        <Eye :size="14" />
        查看数据
      </button>
      <button class="action-btn" @click="navigateTo('/outlier-detection')">
        <AlertTriangle :size="14" />
        检测异常
      </button>
      <button class="action-btn" @click="navigateTo('/missing-value-imputation')">
        <Search :size="14" />
        插补缺失
      </button>
      <button class="action-btn" @click="showGuide">
        <FileText :size="14" />
        使用指南
      </button>
      <div class="action-spacer" />
      <button class="action-btn" @click="handleExport">
        <Download :size="14" />
        导出数据
      </button>
    </div>

    <UserGuideModal v-model="guideVisible" />
  </div>

  <!-- Empty State (preserved from original) -->
  <div v-else class="empty-state">
    <div class="empty-content">
      <h1 class="empty-title">开始您的生态监测之旅</h1>
      <p class="empty-desc">
        您还没有创建任何站点。<br />
        创建第一个站点以开始管理生态数据。
      </p>
      <el-button type="primary" size="large" @click="handleCreateCategory" class="create-button">
        <Plus :size="16" class="button-icon" />
        新建分类
      </el-button>
      <div class="empty-features">
        <div class="feature-item">
          <div class="feature-dot feature-dot-emerald"></div>
          <span>生态数据管理</span>
        </div>
        <div class="feature-item">
          <div class="feature-dot feature-dot-green"></div>
          <span>智能分析处理</span>
        </div>
        <div class="feature-item">
          <div class="feature-dot feature-dot-amber"></div>
          <span>可视化展示</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Main container ── */
.home-container {
  height: 100%;
  background: var(--c-bg-page);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  padding: var(--space-3) var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
  min-height: 0;
}

/* ── 2-column row grid ── */
.row-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  align-items: stretch;
}

/* Row 3: fixed height, children scroll internally */
.row-grid-fixed {
  flex: 1;
  min-height: 180px;
}

.row-grid-fixed > :deep(*) {
  max-height: 100%;
  overflow: hidden;
}

.row-grid-fixed > :deep(*) .card-body {
  overflow-y: auto;
}

/* ── Action bar (pinned bottom) ── */
.action-bar {
  display: flex;
  gap: var(--space-2-5);
  padding: var(--space-2-5) var(--space-4);
  margin: 0 var(--space-4) var(--space-3);
  background: var(--c-brand-soft);
  border-radius: var(--radius-card);
  border: 1px solid var(--c-brand-border);
  align-items: center;
  flex-shrink: 0;
}

.action-spacer {
  flex: 1;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--space-1-5) var(--space-3);
  border-radius: var(--radius-btn);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  cursor: pointer;
  border: 1px solid var(--c-border-strong);
  background: var(--c-bg-surface);
  color: var(--c-text-secondary);
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--c-bg-muted);
  border-color: var(--c-brand-border);
  color: var(--c-brand);
}

.action-btn-primary {
  background: var(--c-brand);
  color: var(--c-text-inverse);
  border-color: var(--c-brand);
  padding: var(--space-2) var(--space-4);
}

.action-btn-primary:hover {
  background: var(--c-brand-hover);
  border-color: var(--c-brand-hover);
  color: var(--c-text-inverse);
}

/* ── Button icon helper ── */
.button-icon {
  margin-right: 6px;
}

/* ── Empty State ── */
.empty-state {
  width: 100%;
  height: 100%;
  background: var(--c-bg-page);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}

.empty-content {
  text-align: center;
  max-width: 448px;
  margin: 0 auto;
}

.empty-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--c-text-base);
  margin: 0 0 var(--space-3) 0;
}

.empty-desc {
  color: var(--c-text-muted);
  margin: 0 0 var(--space-8) 0;
  line-height: var(--leading-relaxed);
  font-size: var(--text-md);
}

.create-button {
  padding: var(--space-2) 28px !important;
  background: var(--c-brand) !important;
  border: 1px solid var(--c-brand) !important;
  color: var(--c-text-inverse) !important;
  border-radius: var(--radius-btn) !important;
  font-weight: var(--font-semibold) !important;
  transition: all var(--transition-fast) !important;
}

.create-button:hover {
  background: var(--c-brand-hover) !important;
  border-color: var(--c-brand-hover) !important;
}

.empty-features {
  margin-top: var(--space-10);
  font-size: var(--text-base);
  color: var(--c-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.feature-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}

.feature-dot-emerald {
  background-color: var(--c-brand);
}

.feature-dot-green {
  background-color: var(--color-green-500);
}

.feature-dot-amber {
  background-color: var(--color-amber-500);
}

/* ── Element Plus overrides ── */
:deep(.el-button--primary) {
  background-color: var(--c-brand);
  border-color: var(--c-brand);
}

:deep(.el-button--primary:hover) {
  background-color: var(--c-brand-hover);
  border-color: var(--c-brand-hover);
}

/* ── Scrollbar ── */
.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
  border-radius: var(--radius-xs);
}

.main-content::-webkit-scrollbar-thumb {
  background: var(--c-border-strong);
  border-radius: var(--radius-xs);
  opacity: 0.6;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-neutral-400);
}

/* ── Responsive ── */
@media (max-width: 1200px) {
  .row-grid {
    grid-template-columns: 1fr;
  }

  .main-content {
    padding: var(--space-2) var(--space-3);
    gap: var(--space-2);
  }

  .action-bar {
    flex-wrap: wrap;
  }
}
</style>
