<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import emitter from "@/utils/eventBus";
import { ElMessage, ElMessageBox } from "element-plus";
import { DataAnalysis, HomeFilled, Operation, PieChart, Plus, Upload } from "@element-plus/icons-vue";
import { useProjectStore } from "@/stores/useProjectStore";
import { useDatasetStore } from "@/stores/useDatasetStore";

const projectStore = useProjectStore();
const datasetStore = useDatasetStore();

// 侧边栏状态
const isCollapsed = ref(false);
const expandedProjects = ref<Set<string>>(new Set());

// 路由相关
const route = useRoute();
const router = useRouter();
const activeIndex = computed(() => route.path);

// 主菜单项
const mainMenuItems = [
  { name: "首页", path: "/", icon: HomeFilled },
  { name: "数据视图", path: "/data-view", icon: DataAnalysis },
  { name: "异常值检测", path: "/outlier-detection", icon: Operation },
  { name: "缺失值插补", path: "/missing-value-imputation", icon: PieChart },
];

// 侧边栏控制
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 项目展开控制
const toggleProjectExpanded = (projectId: string) => {
  if (expandedProjects.value.has(projectId)) {
    expandedProjects.value.delete(projectId);
  } else {
    expandedProjects.value.add(projectId);
  }
};
// 展开所有项目
const expandAllProjects = () => {
  expandedProjects.value.clear();
  projectStore.projects.forEach(project => {
    if (project.datasets?.length > 0) {
      expandedProjects.value.add(project.id);
    }
  });
};

// 折叠所有项目
const collapseAllProjects = () => {
  expandedProjects.value.clear();
};

const isProjectExpanded = (projectId: string): boolean => {
  return expandedProjects.value.has(projectId);
};

// 项目选择
const selectProject = (projectId: string) => {
  const project = projectStore.projects.find(p => p.id === projectId);
  if (project) {
    projectStore.setCurrentProject(projectId);
  }
};

// 数据集选择
const selectDataset = (projectId: string, datasetId: string) => {
  projectStore.setCurrentProject(projectId);
  datasetStore.setCurrentDataset(datasetId);
  ElMessage.info(`已选择数据集: ${datasetId}`);
  router.push("/data-view");
};

// 创建新项目
const createNewProject = () => {
  emitter.emit("open-create-project-dialog");
};

// 处理导入数据
const handleImportData = (projectId?: string) => {
  if (projectId) {
    projectStore.setCurrentProject(projectId);
  }

  if (!projectStore.currentProject) {
    ElMessage.warning("请先选择一个项目");
    return;
  }

  emitter.emit("open-import-data-dialog");
};

// 确认删除项目
const confirmDeleteProject = (projectId: string) => {
  const project = projectStore.projects.find(p => p.id === projectId);
  if (!project) return;

  ElMessageBox.confirm(`确定要删除项目 "${project.name}" 吗? 此操作不可恢复。`, "删除项目", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      await projectStore.deleteProject(project.id);
    })
    .catch(() => {
      // 用户取消
    });
};

// 确认删除数据集
const confirmDeleteDataset = (projectId: string, datasetId: string) => {
  const project = projectStore.projects.find(p => p.id === projectId);
  const dataset = project?.datasets?.find(d => d.id === datasetId);
  if (!dataset) return;

  ElMessageBox.confirm(`确定要删除数据集 "${dataset.name}" 吗? 此操作不可恢复。`, "删除数据集", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      await datasetStore.deleteDataset(projectId, datasetId);
      ElMessage.success("数据集删除成功");
    })
    .catch(() => {
      // 用户取消
    });
};

// 工具函数
const getProjectIcon = (siteInfo: any): string => {
  const altitude = parseFloat(siteInfo.altitude);
  if (altitude > 1000) return "🏔️";
  if (altitude > 500) return "🌲";
  if (altitude > 100) return "🏕️";
  return "🌊";
};

const formatCoordinate = (value: string, direction: string): string => {
  const num = parseFloat(value);
  return `${Math.abs(num).toFixed(1)}°${direction}`;
};

const getTotalFiles = (project: any): number => {
  return project.datasets?.length * 4 || 0; // 模拟计算
};

const getTotalSize = (project: any): string => {
  const size = (project.datasets?.length || 0) * 0.5; // 模拟计算 GB
  if (size < 1) return `${(size * 1024).toFixed(0)} MB`;
  return `${size.toFixed(1)} GB`;
};

const getDatasetIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    flux: "📊",
    micrometeorology: "🌡️",
    aqi: "🌫️",
    sapflow: "🌊",
    nai: "⚡",
  };
  return iconMap[type] || "📄";
};

const getDatasetTypeLabel = (type: string): string => {
  const labelMap: Record<string, string> = {
    flux: "Flux",
    micrometeorology: "Micro",
    aqi: "AQI",
    sapflow: "Sap",
    nai: "NAI",
  };
  return labelMap[type] || type.toUpperCase();
};

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString();
};

// 监听导入成功，自动展开项目
const handleImportSuccess = () => {
  if (projectStore.currentProject) {
    expandedProjects.value.add(projectStore.currentProject.id);
  }
};

onMounted(() => {
  projectStore.loadProjects();
  emitter.on("data-imported", handleImportSuccess);
});

onUnmounted(() => {
  emitter.off("data-imported", handleImportSuccess);
});
</script>

<template>
  <!-- 应用窗口 -->
  <div class="app-container">
    <!-- 侧边栏 -->
    <div :class="['sidebar', { collapsed: isCollapsed }]">
      <!-- 应用标题区域 -->
      <div class="app-header">
        <div class="app-title">
          <div class="app-icon">
            <span>🌱</span>
          </div>
          <div v-if="!isCollapsed" class="app-title-text">
            <div class="app-name">生态监测平台</div>
            <div class="app-subtitle">Eco Monitor Desktop</div>
          </div>
        </div>
        <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开侧边栏' : '折叠侧边栏'">
          <span class="collapse-icon">{{ isCollapsed ? "▶️" : "◀️" }}</span>
        </button>
      </div>

      <!-- 项目管理区域 -->
      <div class="projects-section">
        <div class="section-header" v-show="!isCollapsed">
          <div class="section-title">项目管理</div>
          <div class="section-actions">
            <button class="action-btn" @click="expandAllProjects" title="展开所有项目">⬇️</button>
            <button class="action-btn" @click="collapseAllProjects" title="折叠所有项目">⬆️</button>
            <button class="action-btn" @click="projectStore.loadProjects" title="刷新项目列表">🔄</button>
            <button class="action-btn" @click="createNewProject" title="新建项目">➕</button>
          </div>
        </div>

        <!-- 项目列表 -->
        <div class="projects-list" v-show="!isCollapsed">
          <!-- 空状态 -->
          <div v-if="!projectStore.hasProjects" class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-text">
              还没有创建任何项目<br />
              开始您的生态监测之旅
            </div>
            <button class="empty-action" @click="createNewProject">创建第一个项目</button>
          </div>

          <!-- 项目列表 -->
          <div v-else class="projects-container">
            <div
              v-for="project in projectStore.projectsSortedByDate"
              :key="project.id"
              :class="[
                'project-item',
                {
                  active: projectStore.currentProject?.id === project.id,
                },
              ]"
              @click="selectProject(project.id)">
              <!-- 项目头部 -->
              <div class="project-header">
                <div class="project-main">
                  <button
                    v-if="project.datasets?.length > 0"
                    class="project-expand-btn"
                    :class="{ expanded: isProjectExpanded(project.id) }"
                    @click.stop="toggleProjectExpanded(project.id)">
                    ▶
                  </button>
                  <div v-else class="project-expand-placeholder"></div>

                  <div class="project-icon">
                    {{ getProjectIcon(project.siteInfo) }}
                  </div>

                  <div class="project-info">
                    <div class="project-name">{{ project.name }}</div>
                    <div class="project-meta">
                      <span>{{ formatCoordinate(project.siteInfo.longitude, "E") }}</span>
                      <span>•</span>
                      <span>{{ formatCoordinate(project.siteInfo.latitude, "N") }}</span>
                      <span>•</span>
                      <span>{{ project.siteInfo.altitude }}m</span>
                    </div>
                  </div>
                </div>

                <div class="project-actions">
                  <button class="project-action-btn" @click.stop="handleImportData(project.id)" title="上传数据">
                    ➕
                  </button>
                  <button
                    class="project-action-btn delete-btn"
                    @click.stop="confirmDeleteProject(project.id)"
                    title="删除项目">
                    🗑️
                  </button>
                </div>
              </div>

              <!-- 项目统计 -->
              <div class="project-stats">
                <div class="stat-item">
                  <div class="stat-icon datasets"></div>
                  <span>{{ project.datasets?.length || 0 }} 数据集</span>
                </div>
                <div class="stat-item">
                  <div class="stat-icon files"></div>
                  <span>{{ getTotalFiles(project) }} 文件</span>
                </div>
                <div class="stat-item">
                  <div class="stat-icon size"></div>
                  <span>{{ getTotalSize(project) }}</span>
                </div>
              </div>

              <!-- 数据集列表 -->
              <div :class="['datasets-list', { expanded: isProjectExpanded(project.id) }]">
                <div v-if="project.datasets?.length > 0" class="datasets-container">
                  <div
                    v-for="dataset in project.datasets"
                    :key="dataset.id"
                    :class="[
                      'dataset-item',
                      {
                        active: datasetStore.currentDataset?.id === dataset.id,
                      },
                    ]"
                    @click.stop="selectDataset(project.id, dataset.id)">
                    <div class="dataset-header">
                      <div class="dataset-icon">{{ getDatasetIcon(dataset.type) }}</div>
                      <div class="dataset-name">{{ dataset.name }}</div>
                      <div class="dataset-type">{{ getDatasetTypeLabel(dataset.type) }}</div>
                      <button
                        class="dataset-delete-btn"
                        @click.stop="confirmDeleteDataset(project.id, dataset.id)"
                        title="删除数据集">
                        🗑️
                      </button>
                    </div>
                    <div class="dataset-meta">修改于 {{ formatRelativeTime(dataset.createdAt) }}</div>
                  </div>
                </div>

                <!-- 无数据集提示 -->
                <div v-else class="datasets-empty">
                  <div class="datasets-empty-icon">📄</div>
                  <div class="datasets-empty-text">暂无数据集</div>
                  <button class="datasets-empty-action" @click.stop="handleImportData(project.id)">
                    导入第一个数据集
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 顶部工具栏 -->
      <div class="main-header">
        <!-- 主导航菜单 -->
        <!--        <el-menu-->
        <!--          mode="horizontal"-->
        <!--          :default-active="activeIndex"-->
        <!--          class="main-nav"-->
        <!--          background-color="#1F2937"-->
        <!--          text-color="#E5E7EB"-->
        <!--          active-text-color="#FFFFFF"-->
        <!--          router>-->
        <!--          <el-menu-item v-for="item in mainMenuItems" :key="item.path" :index="item.path">-->
        <!--            <el-icon>-->
        <!--              <component :is="item.icon" />-->
        <!--            </el-icon>-->
        <!--            <template #title>{{ item.name }}</template>-->
        <!--          </el-menu-item>-->
        <!--        </el-menu>-->

        <!-- 面包屑和工具按钮 -->
        <div class="main-toolbar">
          <div class="breadcrumb-section">
            <el-breadcrumb separator="/">
              <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
              <el-breadcrumb-item v-if="projectStore.currentProject">
                {{ projectStore.currentProject.name }}
              </el-breadcrumb-item>
            </el-breadcrumb>
          </div>

          <!--          <div class="toolbar-actions">-->
          <!--            <el-button-group>-->
          <!--              <el-button @click="handleImportData" :icon="Upload" size="default"> 导入数据 </el-button>-->
          <!--              <el-button type="primary" @click="createNewProject" :icon="Plus" size="default"> 新建项目 </el-button>-->
          <!--            </el-button-group>-->
          <!--          </div>-->
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="content-area">
        <router-view v-if="projectStore.currentProject || $route.path === '/'" />
        <div v-else class="content-empty">
          <el-empty description="请先选择一个项目" :image-size="128">
            <el-button type="primary" @click="createNewProject">新建项目</el-button>
          </el-empty>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 应用主容器 */
.app-container {
  display: flex;
  height: 100vh;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
}

/* 侧边栏主容器 */
.sidebar {
  width: 320px;
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 30%,
    rgba(240, 253, 244, 0.85) 70%,
    rgba(236, 253, 245, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border-right: 1px solid rgba(229, 231, 235, 0.4);
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
  position: relative;
  transition: width 0.3s ease-in-out;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 80px;
}

.sidebar::before {
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

/* 应用标题区域 */
.app-header {
  padding: 24px 20px 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar.collapsed .app-header {
  padding: 24px 16px 16px;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  position: relative;
  flex-shrink: 0;
}

.app-icon::after {
  content: "";
  position: absolute;
  inset: 2px;
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  border-radius: 8px;
  opacity: 0.8;
}

.app-icon span {
  position: relative;
  z-index: 1;
  color: white;
}

.app-title-text {
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.sidebar.collapsed .app-title-text {
  opacity: 0;
  transform: translateX(-20px);
  width: 0;
  overflow: hidden;
}

.app-name {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.app-subtitle {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
  white-space: nowrap;
}

/* 侧边栏底部 - 折叠按钮 */
.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(229, 231, 235, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.sidebar.collapsed .sidebar-footer {
  padding: 16px;
}

.collapse-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(107, 114, 128, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #6b7280;
  flex-shrink: 0;
}

.collapse-btn:hover {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.collapse-icon {
  font-size: 20px;
  font-weight: bold;
  transition: transform 0.3s ease;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

/* 项目管理区域 */
.projects-section {
  flex: 1;
  padding: 20px 16px;
  overflow-y: auto;
  position: relative;
  z-index: 10;
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.sidebar.collapsed .projects-section {
  opacity: 0;
  transform: translateX(-20px);
  pointer-events: none;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 4px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(107, 114, 128, 0.1);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #6b7280;
  font-size: 12px;
}

.action-btn:hover {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  transform: translateY(-1px);
}

/* 项目列表 */
.projects-container {
  space-y: 8px;
}

.project-item {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.project-item.collapsed {
  padding: 12px;
  text-align: center;
}

.project-item::before {
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

.project-item:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
}

.project-item:hover::before {
  transform: scaleY(1);
}

.project-item.active {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.15);
}

.project-item.active::before {
  transform: scaleY(1);
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.project-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.project-expand-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: rgba(107, 114, 128, 0.1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #6b7280;
  font-size: 10px;
  flex-shrink: 0;
}

.project-expand-btn:hover {
  background: rgba(16, 185, 129, 0.2);
  color: #059669;
}

.project-expand-btn.expanded {
  transform: rotate(90deg);
  background: rgba(16, 185, 129, 0.2);
  color: #059669;
}

.project-expand-placeholder {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.project-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.project-info {
  min-width: 0;
  flex: 1;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-meta {
  font-size: 11px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.project-item:hover .project-actions {
  opacity: 1;
}

.project-action-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: rgba(107, 114, 128, 0.1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #6b7280;
  font-size: 10px;
}

.project-action-btn:hover {
  background: rgba(16, 185, 129, 0.2);
  color: #059669;
}

.project-action-btn.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.project-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #6b7280;
}

.stat-icon {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.stat-icon.datasets {
  background: #fbbf24;
}

.stat-icon.files {
  background: #8b5cf6;
}

.stat-icon.size {
  background: #06b6d4;
}

/* 数据集列表 */
.datasets-list {
  margin-top: 12px;
  padding-left: 16px;
  border-left: 2px solid rgba(229, 231, 235, 0.3);
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.datasets-list.expanded {
  max-height: 400px;
}

.dataset-item {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(229, 231, 235, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.dataset-item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: #8b5cf6;
  border-radius: 0 2px 2px 0;
  transform: scaleY(0);
  transition: transform 0.2s ease;
}

.dataset-item:hover {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(139, 92, 246, 0.3);
  transform: translateX(4px);
}

.dataset-item:hover::before {
  transform: scaleY(1);
}

.dataset-item.active {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.15);
}

.dataset-item.active::before {
  transform: scaleY(1);
}

.dataset-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.dataset-icon {
  width: 16px;
  height: 16px;
  background: #8b5cf6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: white;
}

.dataset-name {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dataset-type {
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
  border-radius: 4px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.dataset-delete-btn {
  width: 16px;
  height: 16px;
  border: none;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #dc2626;
  font-size: 8px;
  opacity: 0;
  margin-left: 4px;
}

.dataset-item:hover .dataset-delete-btn {
  opacity: 1;
}

.dataset-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  transform: scale(1.1);
}

.dataset-meta {
  font-size: 10px;
  color: #9ca3af;
  margin-left: 24px;
}

/* 数据集空状态 */
.datasets-empty {
  text-align: center;
  padding: 16px 12px;
  color: #9ca3af;
}

.datasets-empty-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.datasets-empty-text {
  font-size: 11px;
  margin-bottom: 8px;
}

.datasets-empty-action {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.datasets-empty-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 32px 20px;
  color: #9ca3af;
}

.empty-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 20px;
}

.empty-text {
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.5;
}

.empty-action {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.empty-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* 滚动条样式 */
.projects-section::-webkit-scrollbar {
  width: 4px;
}

.projects-section::-webkit-scrollbar-track {
  background: transparent;
}

.projects-section::-webkit-scrollbar-thumb {
  background: rgba(16, 185, 129, 0.3);
  border-radius: 2px;
}

.projects-section::-webkit-scrollbar-thumb:hover {
  background: rgba(16, 185, 129, 0.5);
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.main-header {
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

.main-nav {
  border: none;
  transition: all 0.3s ease;
}

.main-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
}

.breadcrumb-section {
  flex: 1;
}

.toolbar-actions {
  display: flex;
  gap: 12px;
}

.content-area {
  flex: 1;
  padding: 24px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  overflow-y: auto;
  position: relative;
}

.content-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 响应式处理 */
@media (max-width: 768px) {
  .sidebar {
    width: 280px;
  }

  .sidebar.collapsed {
    width: 60px;
  }

  .app-header {
    padding: 20px 16px 12px;
  }

  .project-item {
    padding: 12px;
  }

  .main-toolbar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .toolbar-actions {
    justify-content: center;
  }
}

/* 微动画 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.project-item {
  animation: fadeInUp 0.3s ease forwards;
}

.project-item:nth-child(2) {
  animation-delay: 0.1s;
}

.project-item:nth-child(3) {
  animation-delay: 0.2s;
}

.project-item:nth-child(4) {
  animation-delay: 0.3s;
}

/* Element Plus 样式覆盖 */
:deep(.el-menu--horizontal) {
  justify-content: flex-start !important;
  padding-left: 0;
  border: none !important;
}

:deep(.el-menu-item.is-active) {
  background-color: #4b5563 !important;
}

:deep(.el-menu-item:hover) {
  background-color: #374151 !important;
}

:deep(.el-breadcrumb__item) {
  display: inline-flex;
  align-items: center;
}

:deep(.el-breadcrumb__inner) {
  font-weight: normal;
  color: #4b5563;
}

:deep(.el-breadcrumb__inner.is-link:hover) {
  color: #3b82f6;
}

:deep(.el-button-group .el-button) {
  margin-left: 0;
}

:deep(.el-button-group .el-button:first-child) {
  border-right: none;
}

:deep(.el-button-group .el-button + .el-button) {
  margin-left: -1px;
}

:deep(.el-dropdown-menu) {
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

:deep(.el-dropdown-menu__item) {
  padding: 8px 16px;
  font-size: 13px;
  transition: all 0.2s ease;
}

:deep(.el-dropdown-menu__item:hover) {
  background-color: rgba(16, 185, 129, 0.05);
  color: #059669;
}

/* 加载状态 */
.action-btn[loading] {
  position: relative;
  color: transparent;
}

.action-btn[loading]::after {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #059669;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
