<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  FolderOpened,
  View,
  TrendCharts,
  ArrowRight,
  Document,
  Histogram,
  SuccessFilled,
  WarningFilled,
  Monitor,
  DataLine,
  PieChart,
  InfoFilled,
} from "@element-plus/icons-vue";
import { useCategoryStore } from "@/stores/useCategoryStore";
import emitter from "@/utils/eventBus";
import ProjectInfoCard from "./components/ProjectInfoCard.vue";
import DatasetInfoCard from "./components/DatasetInfoCard.vue";
import UserGuideModal from "./components/UserGuideModal.vue";

const router = useRouter();
const categoryStore = useCategoryStore();

// Data processing steps
const processSteps = ref([
  {
    iconName: "Histogram",
    title: "数据视图",
    desc: "浏览和探索数据基础信息",
    color: "blue",
    route: "/data-view",
  },
  {
    iconName: "WarnTriangleFilled",
    title: "异常值检测",
    desc: "识别并处理异常数据",
    color: "orange",
    route: "/outlier-detection",
  },
  {
    iconName: "HelpFilled",
    title: "缺失值插补",
    desc: "修复缺失的数据值",
    color: "purple",
    route: "/missing-value-imputation",
  },
  {
    iconName: "TrendCharts",
    title: "通量分割",
    desc: "进行通量数据分割处理",
    color: "green",
    route: "/flux-partitioning",
  },
]);

// Helper formatters
const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// Computed statistics based on real data
const quickStats = computed(() => {
  const category = categoryStore.currentCategory;
  const datasets = (category?.datasets || []) as any[];

  const totalSize = datasets.reduce((sum: number, d: any) => {
    return sum + (d.totalSizeBytes || d.originalFileSizeBytes || 0);
  }, 0);

  const totalFiles = datasets.reduce((sum: number, d: any) => {
    return sum + (d.versionCount || 0);
  }, 0);

  return [
    {
      title: "总大小",
      value: formatBytes(totalSize),
      trend: "up",
      color: "emerald",
      icon: "FolderOpened",
    },
    {
      title: "数据集",
      value: datasets.length.toString(),
      trend: "up",
      color: "blue",
      icon: "DataLine",
    },
    {
      title: "版本数",
      value: totalFiles.toString(),
      tooltip: "版本数 = 每个数据集的处理/版本个数",
      trend: "up",
      color: "orange",
      icon: "Monitor",
    },
    {
      title: "创建时间",
      value: category?.createdAt ? new Date(category.createdAt).toLocaleDateString() : "-",
      trend: "neutral",
      color: "purple",
      icon: "PieChart",
    },
  ];
});

// Event handlers
const handleCreateCategory = () => {
  emitter.emit("open-create-category-dialog");
};

const navigateToStep = (route: string) => {
  router.push(route);
};

const quickViewData = () => {
  const datasets = (categoryStore.currentCategory?.datasets || []) as any[];
  if (datasets.length > 0) {
    ElMessage.info(`正在查看数据集: ${datasets[0].name}`);
    router.push(`/data-view?dataset=${datasets[0].id}`);
  } else {
    ElMessage.warning("请先导入数据集");
  }
};

const guideVisible = ref(false);
const showGuide = () => {
  guideVisible.value = true;
};
</script>

<template>
  <div v-if="categoryStore.hasCategories" class="home-container">
    <!-- Top Project Info -->
    <ProjectInfoCard />

    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Row 1: Dataset Management + Workflow -->
      <div class="row-layout">
        <!-- Left: Dataset Management -->
        <div class="column-half dataset-section">
          <div class="dataset-wrapper">
            <DatasetInfoCard />
          </div>
        </div>

        <!-- Right: Workflow -->
        <div class="column-half workflow-section">
          <div class="workflow-card">
            <div class="section-header">
              <h2 class="section-title">数据处理工作流</h2>
            </div>
            <div class="workflow-steps">
              <div v-for="(step, index) in processSteps" :key="index" class="step-item">
                <button class="step-button" @click="navigateToStep(step.route)">
                  <div class="step-icon-container" :class="`step-icon-${step.color}`">
                    <el-icon class="step-icon">
                      <Histogram v-if="step.iconName === 'Histogram'" />
                      <WarningFilled v-else-if="step.iconName === 'WarnTriangleFilled'" />
                      <SuccessFilled v-else-if="step.iconName === 'HelpFilled'" />
                      <TrendCharts v-else-if="step.iconName === 'TrendCharts'" />
                    </el-icon>
                  </div>
                  <div class="step-content">
                    <h4 class="step-title">{{ step.title }}</h4>
                    <p class="step-desc">{{ step.desc }}</p>
                  </div>
                  <el-icon class="step-arrow">
                    <ArrowRight />
                  </el-icon>
                </button>
                <div v-if="index < processSteps.length - 1" class="step-separator"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Row 2: Stats Overview -->
      <div class="row-layout">
        <!-- Full Width: Quick Stats -->
        <div class="column-full stats-section">
          <div class="stats-container">
            <div class="section-header">
              <h2 class="section-title">数据概览</h2>
            </div>
            <div class="stats-grid">
              <div v-for="stat in quickStats" :key="stat.title" class="stat-card">
                <div class="stat-icon-container" :class="`stat-icon-${stat.color}`">
                  <el-icon class="stat-icon">
                    <DataLine v-if="stat.icon === 'DataLine'" />
                    <PieChart v-else-if="stat.icon === 'PieChart'" />
                    <Monitor v-else-if="stat.icon === 'Monitor'" />
                    <FolderOpened v-else-if="stat.icon === 'FolderOpened'" />
                  </el-icon>
                </div>
                <div class="stat-content">
                  <h4 class="stat-title">
                    {{ stat.title }}
                    <el-tooltip v-if="stat.tooltip" :content="stat.tooltip" placement="top">
                      <el-icon class="tooltip-icon"><InfoFilled /></el-icon>
                    </el-tooltip>
                  </h4>
                  <div class="stat-value">{{ stat.value }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 使用指南弹窗 -->
      <UserGuideModal v-model="guideVisible" />

      <!-- Quick Start -->
      <div class="quick-start-card">
        <div class="quick-start-content">
          <div class="quick-start-icon">
            <el-icon class="start-icon">
              <TrendCharts />
            </el-icon>
          </div>
          <div class="quick-start-text">
            <h3 class="start-title">开始分析</h3>
            <p class="start-desc">选择一个数据集开始，或导入新文件。建议先查看数据视图，然后进行异常值检测。</p>
            <div class="start-buttons">
              <el-button type="primary" @click="quickViewData" class="start-button-primary">
                <el-icon class="button-icon">
                  <View />
                </el-icon>
                查看数据
              </el-button>
              <el-button @click="showGuide" class="start-button-secondary">
                <el-icon class="button-icon">
                  <Document />
                </el-icon>
                使用指南
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty State -->
  <div v-else class="empty-state">
    <div class="empty-content">
      <h1 class="empty-title">开始您的生态监测之旅</h1>
      <p class="empty-desc">
        您还没有创建任何站点。<br />
        创建第一个站点以开始管理生态数据。
      </p>
      <el-button type="primary" size="large" @click="handleCreateCategory" class="create-button">
        <el-icon class="button-icon">
          <Plus />
        </el-icon>
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
/* ── Design Tokens ── */
.home-container {
  --surface: #f8fafc;
  --surface-elevated: #ffffff;
  --border: #e2e8f0;
  --text: #1e293b;
  --muted: #64748b;
  --accent: #10b981;
  --accent-hover: #059669;
  --accent-soft: #ecfdf5;
  --accent-border: #86efac;
}

/* 主容器 */
.home-container {
  height: 100%;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
}

/* 行布局 */
.row-layout {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

/* 列布局 */
.column-half {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.column-full {
  flex: 1;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 数据集包装器 */
.dataset-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 通用样式 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 10px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

/* 按钮样式 */
.button-icon {
  margin-right: 6px;
}

/* ── 工作流卡片 ── */
.workflow-card {
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  flex: 1;
  height: 100%;
  overflow: hidden;
}

.workflow-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: calc(100% - 46px);
}

.step-item {
  display: flex;
  flex-direction: column;
}

.step-button {
  width: 100%;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.step-button:hover {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.step-icon-container {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.step-button:hover .step-icon-container {
  transform: scale(1.05);
}

/* 步骤图标使用不同颜色区分功能 */
.step-icon-blue {
  background: #dbeafe;
  border: 1px solid #bfdbfe;
}

.step-icon-blue .step-icon {
  color: #2563eb;
}

.step-icon-orange {
  background: #ffedd5;
  border: 1px solid #fed7aa;
}

.step-icon-orange .step-icon {
  color: #ea580c;
}

.step-icon-purple {
  background: #ede9fe;
  border: 1px solid #ddd6fe;
}

.step-icon-purple .step-icon {
  color: #7c3aed;
}

.step-icon-green {
  background: #d1fae5;
  border: 1px solid #a7f3d0;
}

.step-icon-green .step-icon {
  color: #047857;
}

.step-icon {
  font-size: 18px;
}

.step-content {
  flex: 1;
}

.step-title {
  font-weight: 600;
  color: var(--text);
  margin: 0 0 2px 0;
  font-size: 14px;
}

.step-desc {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}

.step-arrow {
  color: #cbd5e1;
  margin-right: 8px;
  transition: all 0.2s;
}

.step-button:hover .step-arrow {
  color: var(--accent-hover);
  transform: translateX(2px);
}

.step-separator {
  display: flex;
  justify-content: center;
  margin: 4px 0;
}

.step-separator::after {
  content: "";
  width: 1px;
  height: 12px;
  background: var(--border);
}

/* ── 统计容器 ── */
.stats-container {
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  flex: 1;
  overflow: hidden;
}

/* 统计卡片网格 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s ease;
}

.stat-card:hover {
  border-color: var(--accent-border);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.stat-icon-container {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon-emerald {
  background: #d1fae5;
  border: 1px solid #a7f3d0;
}

.stat-icon-emerald .stat-icon {
  color: #047857;
}

.stat-icon-blue {
  background: #dbeafe;
  border: 1px solid #bfdbfe;
}

.stat-icon-blue .stat-icon {
  color: #2563eb;
}

.stat-icon-orange {
  background: #ffedd5;
  border: 1px solid #fed7aa;
}

.stat-icon-orange .stat-icon {
  color: #ea580c;
}

.stat-icon-purple {
  background: #ede9fe;
  border: 1px solid #ddd6fe;
}

.stat-icon-purple .stat-icon {
  color: #7c3aed;
}

.stat-icon {
  font-size: 18px;
}

.stat-content {
  flex: 1;
}

.stat-title {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 4px 0;
}

.tooltip-icon {
  font-size: 12px;
  color: #9ca3af;
  margin-left: 6px;
  vertical-align: middle;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

/* ── 快速开始卡片 ── */
.quick-start-card {
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  padding: 14px 16px;
  flex-shrink: 0;
  margin-top: auto;
}

.quick-start-content {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.quick-start-icon {
  width: 36px;
  height: 36px;
  background: #d1fae5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.start-icon {
  color: #047857;
  font-size: 17px;
}

.quick-start-text {
  flex: 1;
}

.start-title {
  font-weight: 600;
  color: var(--text);
  margin: 0 0 6px 0;
  font-size: 15px;
}

.start-desc {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 12px 0;
  line-height: 1.5;
}

.start-buttons {
  display: flex;
  gap: 8px;
}

.start-button-primary {
  background: var(--accent) !important;
  border: 1px solid var(--accent) !important;
  color: #ffffff !important;
  border-radius: 8px !important;
  font-weight: 600 !important;
  transition: all 0.2s !important;
}

.start-button-primary:hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
}

.start-button-secondary {
  border: 1px solid #cbd5e1 !important;
  color: #334155 !important;
  background: var(--surface-elevated) !important;
  border-radius: 8px !important;
  font-weight: 600 !important;
  transition: all 0.2s !important;
}

.start-button-secondary:hover {
  border-color: var(--accent-border) !important;
  color: var(--accent-hover) !important;
  background: var(--accent-soft) !important;
}

/* ── 空状态 ── */
.empty-state {
  width: 100%;
  height: 100%;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.empty-content {
  text-align: center;
  max-width: 448px;
  margin: 0 auto;
}

.empty-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 12px 0;
}

.empty-desc {
  color: var(--muted);
  margin: 0 0 32px 0;
  line-height: 1.6;
  font-size: 14px;
}

.create-button {
  padding: 10px 28px !important;
  background: var(--accent) !important;
  border: 1px solid var(--accent) !important;
  color: #ffffff !important;
  border-radius: 8px !important;
  font-weight: 600 !important;
  transition: all 0.2s !important;
}

.create-button:hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
}

.empty-features {
  margin-top: 40px;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.feature-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.feature-dot-emerald {
  background-color: #10b981;
}

.feature-dot-green {
  background-color: #22c55e;
}

.feature-dot-amber {
  background-color: #f59e0b;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-button--primary) {
  background-color: var(--accent);
  border-color: var(--accent);
}

:deep(.el-button--primary:hover) {
  background-color: var(--accent-hover);
  border-color: var(--accent-hover);
}

/* 自定义滚动条 */
.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 225, 0.6);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.8);
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .row-layout {
    flex-direction: column;
    min-height: auto;
  }

  .column-half {
    min-height: 250px;
  }

  .main-content {
    padding: 10px 12px;
    gap: 10px;
  }
}
</style>
