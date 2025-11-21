<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  DataAnalysis,
  FolderOpened,
  Upload,
  Plus,
  View,
  TrendCharts,
  ArrowRight,
  Document,
  Histogram,
  Clock,
  SuccessFilled,
  WarningFilled,
  Loading,
  Monitor,
  DataLine,
  PieChart,
} from "@element-plus/icons-vue";
import { useProjectStore } from "@/stores/useProjectStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import emitter from "@/utils/eventBus";
import ProjectInfoCard from "../../components/homepage/ProjectInfoCard.vue";
import DatasetInfoCard from "../../components/homepage/DatasetInfoCard.vue";

const router = useRouter();
const projectStore = useProjectStore();
const datasetStore = useDatasetStore();

// 项目基本信息
const projectInfo = ref({
  name: "密云水库生态监测站",
  coordinates: "116.8°E, 40.3°N",
  altitude: "156m",
  establishDate: "2024-01-15",
  datasetCount: 4,
  totalRecords: "16.5k",
});

// 数据集列表
const datasets = ref([
  {
    id: 1,
    name: "通量数据",
    fileName: "CO2_flux_2024.csv",
    iconName: "Odometer",
    records: "8.7k",
    status: "complete",
    color: "emerald",
    lastUpdate: "2小时前",
  },
  {
    id: 2,
    name: "微气象数据",
    fileName: "weather_2024.xlsx",
    iconName: "Cloudy",
    records: "4.4k",
    status: "warning",
    color: "blue",
    lastUpdate: "1天前",
  },
  {
    id: 3,
    name: "茎流数据",
    fileName: "sapflow_spring.csv",
    iconName: "Histogram",
    records: "2.2k",
    status: "error",
    color: "green",
    lastUpdate: "3天前",
  },
  {
    id: 4,
    name: "空气质量数据",
    fileName: "AQI_monitoring.csv",
    iconName: "Flag",
    records: "1.2k",
    status: "complete",
    color: "purple",
    lastUpdate: "5天前",
  },
]);

// 数据处理步骤
const processSteps = ref([
  {
    iconName: "Histogram",
    title: "数据视图",
    desc: "浏览和探索数据，了解数据基本情况",
    color: "blue",
    route: "/data-view",
  },
  {
    iconName: "WarnTriangleFilled",
    title: "异常值检测",
    desc: "识别和处理数据中的异常值",
    color: "orange",
    route: "/outlier-detection",
  },
  {
    iconName: "HelpFilled",
    title: "缺失值插补",
    desc: "修复和填补数据中的缺失值",
    color: "purple",
    route: "/missing-value-imputation",
  },
]);

// 最近活动记录
const recentActivities = ref([
  {
    id: 1,
    action: "数据导入",
    target: "CO2_flux_2024.csv",
    time: "2小时前",
    status: "success",
    icon: "Upload",
  },
  {
    id: 2,
    action: "异常值检测",
    target: "微气象数据",
    time: "1天前",
    status: "success",
    icon: "WarningFilled",
  },
  {
    id: 3,
    action: "缺失值插补",
    target: "茎流数据",
    time: "2天前",
    status: "processing",
    icon: "Loading",
  },
  {
    id: 4,
    action: "数据导出",
    target: "空气质量数据",
    time: "3天前",
    status: "success",
    icon: "Download",
  },
]);

// 快速统计数据
const quickStats = ref([
  {
    title: "总记录数",
    value: "16.5k",
    change: "+12.5%",
    trend: "up",
    color: "emerald",
    icon: "DataLine",
  },
  {
    title: "数据完整率",
    value: "87.5%",
    change: "+2.1%",
    trend: "up",
    color: "blue",
    icon: "PieChart",
  },
  {
    title: "处理任务",
    value: "8",
    change: "-3",
    trend: "down",
    color: "orange",
    icon: "Monitor",
  },
  {
    title: "存储使用",
    value: "2.3GB",
    change: "+156MB",
    trend: "up",
    color: "purple",
    icon: "FolderOpened",
  },
]);

const handleCreateProject = () => {
  emitter.emit("open-create-project-dialog");
};
// 获取状态颜色
const getStatusColor = (status: string) => {
  const statusMap: Record<string, string> = {
    success: "#10b981",
    processing: "#f59e0b",
    warning: "#ef4444",
    error: "#ef4444",
  };
  return statusMap[status] || "#6b7280";
};

// 获取趋势颜色
const getTrendColor = (trend: string) => {
  return trend === "up" ? "#10b981" : "#ef4444";
};

// 事件处理
const handleImportData = () => {
  emitter.emit("open-import-data-dialog");
};

const selectDataset = (dataset: any) => {
  ElMessage.info(`选择了数据集: ${dataset.name}`);
  // 这里可以设置当前数据集到store
};

const viewDataset = (dataset: any) => {
  ElMessage.info(`查看数据集: ${dataset.name}`);
  router.push(`/data-view?dataset=${dataset.id}`);
};

const processDataset = (dataset: any) => {
  ElMessage.info(`处理数据集: ${dataset.name}`);
  router.push(`/data-processing?dataset=${dataset.id}`);
};

const navigateToStep = (route: string) => {
  router.push(route);
};

const quickViewData = () => {
  if (datasets.value.length > 0) {
    viewDataset(datasets.value[0]);
  } else {
    ElMessage.warning("请先导入数据集");
  }
};

const showGuide = () => {
  ElMessage.info("打开使用指南");
  // 这里可以打开帮助文档或引导页面
};

// 初始化数据
onMounted(() => {
  // 从store加载实际的项目和数据集信息
  if (projectStore.currentProject) {
    projectInfo.value.name = projectStore.currentProject.name;
    projectInfo.value.datasetCount = projectStore.currentProject.datasets?.length || 0;
  }
});
</script>

<template>
  <div v-if="projectStore.hasProjects" class="home-container">
    <!-- 顶部项目信息 -->
    <ProjectInfoCard />

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 第一行：数据集管理 + 数据处理工作流 -->
      <div class="row-layout">
        <!-- 左侧：数据集管理 -->
        <div class="column-half dataset-section">
          <div class="dataset-wrapper">
            <DatasetInfoCard />
          </div>
        </div>

        <!-- 右侧：数据处理工作流 -->
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

      <!-- 第二行：统计概览 + 最近活动 -->
      <div class="row-layout">
        <!-- 左侧：快速统计 -->
        <div class="column-half stats-section">
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
                  <h4 class="stat-title">{{ stat.title }}</h4>
                  <div class="stat-value">{{ stat.value }}</div>
                  <div class="stat-change" :style="{ color: getTrendColor(stat.trend) }">
                    {{ stat.change }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：最近活动 -->
        <div class="column-half activity-section">
          <div class="activity-card">
            <div class="section-header">
              <h2 class="section-title">最近活动</h2>
            </div>
            <div class="activity-list">
              <div v-for="activity in recentActivities" :key="activity.id" class="activity-item">
                <div
                  class="activity-icon-container"
                  :style="{ backgroundColor: getStatusColor(activity.status) + '20' }">
                  <el-icon class="activity-icon" :style="{ color: getStatusColor(activity.status) }">
                    <Upload v-if="activity.icon === 'Upload'" />
                    <WarningFilled v-else-if="activity.icon === 'WarningFilled'" />
                    <Loading v-else-if="activity.icon === 'Loading'" />
                    <Document v-else-if="activity.icon === 'Download'" />
                  </el-icon>
                </div>
                <div class="activity-content">
                  <div class="activity-action">{{ activity.action }}</div>
                  <div class="activity-target">{{ activity.target }}</div>
                </div>
                <div class="activity-time">{{ activity.time }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 快速开始提示 -->
      <div class="quick-start-card">
        <div class="quick-start-content">
          <div class="quick-start-icon">
            <el-icon class="start-icon">
              <TrendCharts />
            </el-icon>
          </div>
          <div class="quick-start-text">
            <h3 class="start-title">开始数据分析</h3>
            <p class="start-desc">
              选择一个数据集开始分析，或导入新的数据文件。建议先查看数据概况，然后根据需要进行异常值检测和缺失值处理。
            </p>
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

  <!-- 无项目状态 -->
  <div v-else class="empty-state">
    <div class="empty-content">
      <h1 class="empty-title">开始您的生态监测之旅</h1>
      <p class="empty-desc">
        您还没有创建任何站点。<br />
        创建第一个站点来开始管理您的生态监测数据。
      </p>
      <el-button type="primary" size="large" @click="handleCreateProject" class="create-button">
        <el-icon class="button-icon">
          <Plus />
        </el-icon>
        创建站点
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
/* 主容器 */
.home-container {
  height: 100%;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  min-height: 0;
}

/* 行布局 */
.row-layout {
  display: flex;
  gap: 24px;
  min-height: 300px;
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
  padding: 0 0 16px 0;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  margin-bottom: 16px;
  position: relative;
  z-index: 10;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #000000;
  margin: 0;
}

/* 按钮样式 */
.primary-button {
  background-color: #059669 !important;
  border-color: #059669 !important;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.primary-button:hover {
  background-color: #047857 !important;
  border-color: #047857 !important;
  box-shadow: 0 8px 15px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.button-icon {
  margin-right: 8px;
}

/* 工作流样式 */
.workflow-card {
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 30%,
    rgba(240, 253, 244, 0.85) 70%,
    rgba(236, 253, 245, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
  padding: 20px;
  flex: 1;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.workflow-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.02) 0%, transparent 50%);
  pointer-events: none;
}

.workflow-steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  z-index: 10;
  height: calc(100% - 60px);
}

.step-item {
  display: flex;
  flex-direction: column;
}

.step-button {
  width: 100%;
  height: 80px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(229, 231, 235, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  position: relative;
  overflow: hidden;
}

.step-button::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(to bottom, #10b981, #059669);
  transform: scaleY(0);
  transition: transform 0.3s ease;
}

.step-button:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
}

.step-button:hover::before {
  transform: scaleY(1);
}

.step-icon-container {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  transition: transform 0.2s;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.step-button:hover .step-icon-container {
  transform: scale(1.1);
}

.step-icon-blue {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
}

.step-icon-orange {
  background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
}

.step-icon-purple {
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
}

.step-icon {
  font-size: 18px;
  color: white;
}

.step-content {
  flex: 1;
}

.step-title {
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 4px 0;
  font-size: 16px;
}

.step-desc {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.step-arrow {
  color: #9ca3af;
  margin-right: 12px;
  transition: all 0.2s;
}

.step-button:hover .step-arrow {
  color: #059669;
  transform: translateX(4px);
}

.step-separator {
  display: flex;
  justify-content: center;
  margin: 8px 0;
}

.step-separator::after {
  content: "";
  width: 1px;
  height: 16px;
  background: rgba(229, 231, 235, 0.5);
}

/* 统计容器样式 */
.stats-container {
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 30%,
    rgba(240, 253, 244, 0.85) 70%,
    rgba(236, 253, 245, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
  padding: 20px;
  flex: 1;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.stats-container::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.02) 0%, transparent 50%);
  pointer-events: none;
}

/* 统计卡片样式 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  height: calc(100% - 60px);
  position: relative;
  z-index: 10;
}

.stat-card {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(to bottom, #10b981, #059669);
  transform: scaleY(0);
  transition: transform 0.3s ease;
}

.stat-card:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
}

.stat-card:hover::before {
  transform: scaleY(1);
}

.stat-icon-container {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.stat-icon-emerald {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
}

.stat-icon-blue {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
}

.stat-icon-orange {
  background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
}

.stat-icon-purple {
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
}

.stat-icon {
  font-size: 20px;
  color: white;
}

.stat-content {
  flex: 1;
}

.stat-title {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 4px 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 4px 0;
}

.stat-change {
  font-size: 14px;
  font-weight: 500;
}

/* 活动记录样式 */
.activity-card {
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 30%,
    rgba(240, 253, 244, 0.85) 70%,
    rgba(236, 253, 245, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
  padding: 20px;
  flex: 1;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.activity-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.02) 0%, transparent 50%);
  pointer-events: none;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100% - 60px);
  overflow-y: auto;
  position: relative;
  z-index: 10;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(229, 231, 235, 0.4);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.activity-item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(to bottom, #10b981, #059669);
  transform: scaleY(0);
  transition: transform 0.3s ease;
}

.activity-item:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
}

.activity-item:hover::before {
  transform: scaleY(1);
}

.activity-icon-container {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.activity-icon {
  font-size: 18px;
}

.activity-content {
  flex: 1;
}

.activity-action {
  font-weight: 600;
  color: #1f2937;
  font-size: 14px;
  margin-bottom: 2px;
}

.activity-target {
  font-size: 13px;
  color: #6b7280;
}

.activity-time {
  font-size: 12px;
  color: #9ca3af;
  flex-shrink: 0;
}

/* 快速开始样式 */
.quick-start-card {
  background: linear-gradient(
    160deg,
    rgba(240, 253, 244, 0.9) 0%,
    rgba(236, 253, 245, 0.85) 30%,
    rgba(220, 252, 231, 0.8) 70%,
    rgba(209, 250, 229, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border: 1px solid rgba(187, 247, 208, 0.5);
  border-radius: 16px;
  box-shadow: 4px 0 24px rgba(16, 185, 129, 0.08);
  padding: 24px;
  flex-shrink: 0;
  margin-top: auto;
  position: relative;
  overflow: hidden;
}

.quick-start-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.05) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.03) 0%, transparent 50%);
  pointer-events: none;
}

.quick-start-content {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  position: relative;
  z-index: 10;
}

.quick-start-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.start-icon {
  color: white;
  font-size: 18px;
}

.quick-start-text {
  flex: 1;
}

.start-title {
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 8px 0;
  font-size: 18px;
}

.start-desc {
  font-size: 14px;
  color: #374151;
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.start-buttons {
  display: flex;
  gap: 12px;
}

.start-button-primary {
  background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
  border: none !important;
  color: white !important;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3) !important;
  transition: all 0.2s !important;
}

.start-button-primary:hover {
  background: linear-gradient(135deg, #047857 0%, #065f46 100%) !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 8px 20px rgba(5, 150, 105, 0.4) !important;
}

.start-button-secondary {
  border: 1px solid rgba(5, 150, 105, 0.5) !important;
  color: #059669 !important;
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(10px) !important;
  transition: all 0.2s !important;
}

.start-button-secondary:hover {
  background: rgba(240, 253, 244, 0.9) !important;
  border-color: #059669 !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2) !important;
}

/* 空状态样式 */
.empty-state {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #fafaf9 0%, rgba(240, 253, 244, 0.3) 50%, rgba(236, 253, 245, 0.2) 100%);
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
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 12px 0;
}

.empty-desc {
  color: #6b7280;
  margin: 0 0 32px 0;
  line-height: 1.6;
}

.create-button {
  padding: 12px 32px !important;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%) !important;
  border: none !important;
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
  transition: all 0.2s !important;
}

.create-button:hover {
  background: linear-gradient(135deg, #047857 0%, #059669 100%) !important;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
  transform: scale(1.05) !important;
}

.empty-features {
  margin-top: 48px;
  font-size: 14px;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.feature-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.feature-dot-emerald {
  background-color: #34d399;
}

.feature-dot-green {
  background-color: #22c55e;
}

.feature-dot-amber {
  background-color: #fbbf24;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-button--primary) {
  background-color: #059669;
  border-color: #059669;
}

:deep(.el-button--primary:hover) {
  background-color: #047857;
  border-color: #047857;
}

/* 自定义滚动条 */
.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track {
  background: rgba(241, 245, 249, 0.5);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 225, 0.8);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.8);
}

/* 动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.home-container {
  animation: fadeIn 0.5s ease-out;
}

.stat-card,
.activity-item,
.step-button {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
    padding: 16px;
    gap: 16px;
  }
}
</style>
