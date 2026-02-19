<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import emitter from "@/utils/eventBus";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Plus,
  Refresh,
  ArrowDown,
  ArrowUp,
  CaretLeft,
  CaretRight,
  Sort,
  Delete,
  Files,
  Close,
  Setting,
} from "@element-plus/icons-vue";
import DatasetVersionTree from "@/components/sidebar/DatasetVersionTree.vue";
import { useProjectStore } from "@/stores/useProjectStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import SettingsDialog from "@/components/dialogs/SettingsDialog.vue";

const projectStore = useProjectStore();
const datasetStore = useDatasetStore();
const settingsStore = useSettingsStore();

// 设置对话框引用
const settingsDialogRef = ref<InstanceType<typeof SettingsDialog> | null>(null);

// 打开设置对话框
const openSettingsDialog = () => {
  settingsDialogRef.value?.open();
};

// 侧边栏状态
const isCollapsed = ref(false);
const expandedProjects = ref<Set<string>>(new Set());
const expandedDatasets = ref<Set<string>>(new Set());
const isBatchMode = ref(false);
const selectedProjectIds = ref<Set<string>>(new Set());

// 排序状态
const sortType = ref<"date" | "name">("date");
const sortOrder = ref<"asc" | "desc">("asc");

// 排序后的项目列表
const sortedProjects = computed(() => {
  const projects = [...projectStore.projects];
  return projects.sort((a, b) => {
    if (sortType.value === "date") {
      return sortOrder.value === "asc" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
    } else {
      return sortOrder.value === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }
  });
});

// 处理排序命令
const handleSortCommand = (command: string) => {
  const [type, order] = command.split("-");
  sortType.value = type as "date" | "name";
  sortOrder.value = order as "asc" | "desc";
};

// 批量删除处理
const toggleBatchMode = () => {
  isBatchMode.value = !isBatchMode.value;
  selectedProjectIds.value.clear();
};

const isAllSelected = computed(() => {
  return sortedProjects.value.length > 0 && selectedProjectIds.value.size === sortedProjects.value.length;
});

const toggleSelectAll = (val: any) => {
  if (val) {
    sortedProjects.value.forEach(p => selectedProjectIds.value.add(p.id));
  } else {
    selectedProjectIds.value.clear();
  }
};

const toggleProjectSelection = (projectId: string) => {
  if (selectedProjectIds.value.has(projectId)) {
    selectedProjectIds.value.delete(projectId);
  } else {
    selectedProjectIds.value.add(projectId);
  }
};

const handleBatchDelete = async () => {
  if (selectedProjectIds.value.size === 0) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedProjectIds.value.size} 个项目吗? 此操作不可恢复。`,
      "批量删除项目",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    await projectStore.batchDeleteProjects(Array.from(selectedProjectIds.value));
    selectedProjectIds.value.clear();
    isBatchMode.value = false;
  } catch (error) {
    if (error !== "cancel") {
      console.error(error);
    }
  }
};

// 路由相关
const router = useRouter();

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

// 数据集展开控制
const toggleDatasetExpanded = (datasetId: string) => {
  if (expandedDatasets.value.has(datasetId)) {
    expandedDatasets.value.delete(datasetId);
  } else {
    expandedDatasets.value.add(datasetId);
  }
};

const isDatasetExpanded = (datasetId: string): boolean => {
  return expandedDatasets.value.has(datasetId);
};

// 项目选择
const selectProject = (projectId: string) => {
  const project = projectStore.projects.find(p => p.id === projectId);
  if (project) {
    projectStore.setCurrentProject(projectId);
    router.push("/");
  }
};

const handleProjectClick = (projectId: string) => {
  selectProject(projectId);
  toggleProjectExpanded(projectId);
};

// 处理版本选择
const handleVersionSelect = async (projectId: string, datasetId: string, versionId: number) => {
  projectStore.setCurrentProject(projectId);
  if (datasetStore.currentDataset?.id !== datasetId) {
    await datasetStore.setCurrentDataset(datasetId);
  }
  await datasetStore.setCurrentVersion(versionId);
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

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const getTotalFiles = (project: any): number => {
  const datasets = Array.isArray(project?.datasets) ? project.datasets : [];
  return datasets.reduce((sum: number, d: any) => {
    const fc = typeof d?.fileCount === "number" ? d.fileCount : 0;
    // 如果后端暂未返回 fileCount，则至少按 1 个原始文件计
    return sum + (fc > 0 ? fc : d?.originalFile ? 1 : 0);
  }, 0);
};

const getTotalSize = (project: any): string => {
  const datasets = Array.isArray(project?.datasets) ? project.datasets : [];
  const totalBytes = datasets.reduce((sum: number, d: any) => {
    if (typeof d?.totalSizeBytes === "number" && d.totalSizeBytes > 0) return sum + d.totalSizeBytes;
    if (typeof d?.originalFileSizeBytes === "number" && d.originalFileSizeBytes > 0)
      return sum + d.originalFileSizeBytes;
    return sum;
  }, 0);
  return formatBytes(totalBytes);
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

// 监听导入成功，自动展开项目
const handleImportSuccess = () => {
  if (projectStore.currentProject) {
    expandedProjects.value.add(projectStore.currentProject.id);
  }
};

onMounted(async () => {
  await projectStore.loadProjects();
  if (!projectStore.currentProject && sortedProjects.value.length > 0) {
    selectProject(sortedProjects.value[0].id);
  }
  settingsStore.initSettings(); // 初始化系统设置
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
            <div class="app-subtitle">生态监测桌面端</div>
          </div>
        </div>
        <button v-if="!isCollapsed" class="settings-btn" @click="openSettingsDialog" title="系统设置">
          <el-icon><Setting /></el-icon>
        </button>
      </div>

      <!-- 侧边栏折叠按钮 -->
      <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开侧边栏' : '折叠侧边栏'">
        <el-icon class="collapse-icon">
          <CaretRight v-if="isCollapsed" />
          <CaretLeft v-else />
        </el-icon>
      </button>

      <!-- 项目管理区域 -->
      <div class="projects-section">
        <div class="section-header" v-show="!isCollapsed">
          <div class="section-title-wrap">
            <div class="section-title">项目管理</div>
            <span v-if="isBatchMode && selectedProjectIds.size > 0" class="selected-badge">
              已选 {{ selectedProjectIds.size }}
            </span>
          </div>

          <!-- 批量模式操作栏 -->
          <div v-if="isBatchMode" class="section-actions batch-actions">
            <el-checkbox class="batch-select-all" :model-value="isAllSelected" @change="toggleSelectAll" size="small"
              >全选</el-checkbox
            >

            <button
              class="action-btn delete-btn"
              @click="handleBatchDelete"
              title="删除选中"
              :disabled="selectedProjectIds.size === 0"
              :style="{ color: selectedProjectIds.size > 0 ? '#dc2626' : '#9ca3af' }">
              <el-icon><Delete /></el-icon>
            </button>
            <button class="action-btn" @click="toggleBatchMode" title="退出批量模式">
              <el-icon><Close /></el-icon>
            </button>
          </div>

          <!-- 正常模式操作栏 -->
          <div v-else class="section-actions">
            <button class="action-btn" @click="projectStore.loadProjects" title="刷新项目列表">
              <el-icon><Refresh /></el-icon>
            </button>
            <el-dropdown trigger="click" @command="handleSortCommand">
              <button class="action-btn" title="排序">
                <el-icon><Sort /></el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="date-asc" :class="{ active: sortType === 'date' && sortOrder === 'asc' }"
                    >创建时间 (正序)</el-dropdown-item
                  >
                  <el-dropdown-item command="date-desc" :class="{ active: sortType === 'date' && sortOrder === 'desc' }"
                    >创建时间 (倒序)</el-dropdown-item
                  >
                  <el-dropdown-item command="name-asc" :class="{ active: sortType === 'name' && sortOrder === 'asc' }"
                    >项目名称 (正序)</el-dropdown-item
                  >
                  <el-dropdown-item command="name-desc" :class="{ active: sortType === 'name' && sortOrder === 'desc' }"
                    >项目名称 (倒序)</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <button class="action-btn" @click="expandAllProjects" title="展开所有项目">
              <el-icon><ArrowDown /></el-icon>
            </button>
            <button class="action-btn" @click="collapseAllProjects" title="折叠所有项目">
              <el-icon><ArrowUp /></el-icon>
            </button>
            <button class="action-btn" @click="toggleBatchMode" title="批量管理">
              <el-icon><Files /></el-icon>
            </button>
            <button class="action-btn" @click="createNewProject" title="新建项目">
              <el-icon><Plus /></el-icon>
            </button>
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
              v-for="project in sortedProjects"
              :key="project.id"
              :class="[
                'project-item',
                {
                  active: projectStore.currentProject?.id === project.id,
                  'batch-mode': isBatchMode,
                },
              ]"
              @click="isBatchMode ? toggleProjectSelection(project.id) : handleProjectClick(project.id)">
              <!-- 批量选择复选框 -->
              <div v-if="isBatchMode" class="project-checkbox">
                <el-checkbox
                  :model-value="selectedProjectIds.has(project.id)"
                  @change="toggleProjectSelection(project.id)"
                  @click.stop />
              </div>

              <!-- 项目头部 -->
              <div class="project-header">
                <!-- 展开/收起按钮 (左侧) -->
                <button
                  class="project-expand-caret"
                  :class="{
                    expanded: isProjectExpanded(project.id),
                    invisible: !project.datasets?.length,
                  }"
                  @click.stop="toggleProjectExpanded(project.id)">
                  <el-icon><CaretRight /></el-icon>
                </button>

                <div class="project-main">
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

                <div class="project-right">
                  <div class="project-actions">
                    <button class="project-action-btn" @click.stop="handleImportData(project.id)" title="上传数据集">
                      <el-icon><Plus /></el-icon>
                    </button>
                    <button
                      class="project-action-btn delete-btn"
                      @click.stop="confirmDeleteProject(project.id)"
                      title="删除项目">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
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
                  <div v-for="dataset in project.datasets" :key="dataset.id" class="dataset-wrapper">
                    <!-- 数据集主行 -->
                    <div
                      :class="[
                        'dataset-item',
                        {
                          active: datasetStore.currentDataset?.id === dataset.id,
                          expanded: isDatasetExpanded(dataset.id),
                        },
                      ]"
                      @click.stop="toggleDatasetExpanded(dataset.id)">
                      <div class="dataset-header">
                        <!-- 展开/收起按钮 -->
                        <button
                          class="dataset-expand-btn"
                          :class="{ expanded: isDatasetExpanded(dataset.id) }"
                          @click.stop="toggleDatasetExpanded(dataset.id)">
                          <el-icon><CaretRight /></el-icon>
                        </button>
                        <div class="dataset-icon">{{ getDatasetIcon(dataset.type) }}</div>
                        <div class="dataset-name">{{ dataset.name }}</div>
                        <div class="dataset-type">{{ getDatasetTypeLabel(dataset.type) }}</div>
                        <button
                          class="dataset-delete-btn"
                          @click.stop="confirmDeleteDataset(project.id, dataset.id)"
                          title="删除数据集">
                          <el-icon><Delete /></el-icon>
                        </button>
                      </div>
                    </div>

                    <!-- 版本树 -->
                    <DatasetVersionTree
                      :dataset-id="dataset.id"
                      :is-expanded="isDatasetExpanded(dataset.id)"
                      @select-version="versionId => handleVersionSelect(project.id, dataset.id, versionId)" />
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

    <!-- 设置对话框 -->
    <SettingsDialog ref="settingsDialogRef" />
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
  --sb-surface: #f8fafc;
  --sb-surface-elevated: #ffffff;
  --sb-border: #e2e8f0;
  --sb-muted: #64748b;
  --sb-text: #1e293b;
  --sb-accent: #10b981;
  --sb-accent-soft: #ecfdf5;
  width: 320px;
  background: var(--sb-surface);
  border-right: 1px solid var(--sb-border);
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 12px rgba(15, 23, 42, 0.04);
  position: relative;
  transition: width 0.3s ease-in-out;
  overflow: visible;
  z-index: 20;
}

.sidebar.collapsed {
  width: 80px;
}

.sidebar::before {
  content: none;
}

/* 应用标题区域 */
.app-header {
  padding: 16px;
  border-bottom: 1px solid var(--sb-border);
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.sidebar.collapsed .app-header {
  padding: 16px 12px;
  justify-content: center;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.sidebar.collapsed .app-title {
  justify-content: center;
}

.app-icon {
  width: 34px;
  height: 34px;
  background: #d1fae5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  position: relative;
  flex-shrink: 0;
}

.app-icon::after {
  content: none;
}

.app-icon span {
  color: #047857;
}

.app-title-text {
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar.collapsed .app-title-text {
  opacity: 0;
  transform: translateX(-20px);
  width: 0;
  overflow: hidden;
}

/* 设置按钮 */
.settings-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--sb-border);
  background: var(--sb-surface-elevated);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--sb-muted);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.settings-btn:hover {
  background: var(--sb-accent-soft);
  color: var(--sb-accent);
  border-color: #a7f3d0;
}

.settings-btn .el-icon {
  font-size: 16px;
}

.app-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--sb-text);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.app-subtitle {
  font-size: 10px;
  color: var(--sb-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
  white-space: nowrap;
}

/* 侧边栏折叠按钮 - 悬浮在右侧边缘 */
.collapse-btn {
  position: absolute;
  top: 50%;
  right: -12px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border: 1px solid var(--sb-border);
  background: var(--sb-surface-elevated);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #94a3b8;
  z-index: 100;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  padding: 0;
}

.collapse-btn:hover {
  color: var(--sb-accent);
  border-color: #86efac;
  background: var(--sb-accent-soft);
  box-shadow: 0 3px 10px rgba(16, 185, 129, 0.14);
  transform: translateY(-50%);
}

.collapse-icon {
  font-size: 12px;
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 项目管理区域 */
.projects-section {
  flex: 1;
  padding: 0 12px 16px;
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
  margin-bottom: 6px;
  padding: 12px 2px 10px;
  position: sticky;
  top: 0;
  z-index: 20;
  background: #f8fafc;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.selected-badge {
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.batch-actions {
  align-items: center;
}

.batch-select-all {
  margin-right: 6px;
  height: 24px;
}

.action-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--sb-border);
  background: var(--sb-surface-elevated);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--sb-muted);
  font-size: 14px;
}

.action-btn:hover {
  background: var(--sb-accent-soft);
  color: #059669;
  border-color: #a7f3d0;
}

/* 项目列表 */
.project-item {
  background: var(--sb-surface-elevated);
  border: 1px solid var(--sb-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: visible;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.project-item.collapsed {
  padding: 12px;
  text-align: center;
}

.project-item.batch-mode {
  cursor: default;
}

.project-checkbox {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
}

.project-item.batch-mode .project-header,
.project-item.batch-mode .project-stats,
.project-item.batch-mode .datasets-list {
  padding-left: 24px;
  transition: padding-left 0.2s ease;
}

/* Gradient accent bar on hover/active */
.project-item::before {
  content: "";
  position: absolute;
  top: 10px;
  left: 0;
  width: 2px;
  bottom: 10px;
  background: var(--sb-accent);
  border-radius: 0 4px 4px 0;
  transform: scaleY(0);
  transition: transform 0.2s ease;
}

.project-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}

.project-item:hover::before {
  transform: scaleY(1);
}

.project-item.active {
  background: #f8fffb;
  border-color: #86efac;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
}

.project-item.active::before {
  transform: scaleY(1);
  background: #10b981;
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 8px; /* Add gap for caret */
}

/* New Caret Styles */
.project-expand-caret {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #94a3b8;
  font-size: 12px;
  flex-shrink: 0;
  margin-left: -4px; /* Pull slightly left to align */
}

.project-expand-caret:hover {
  background: #f0fdf4;
  color: #10b981;
}

.project-expand-caret.expanded {
  transform: rotate(90deg);
  color: #10b981;
}

.project-expand-caret.invisible {
  opacity: 0;
  pointer-events: none;
}

.project-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.project-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Removed old project-expand-btn styles */

.project-icon {
  width: 34px;
  height: 34px;
  background: #f1f5f9;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #475569;
  transition: all 0.3s ease;
  box-shadow: none;
}

.project-item:hover .project-icon,
.project-item.active .project-icon {
  background: #d1fae5;
  border-color: #86efac;
  color: #047857;
}

.project-info {
  min-width: 0;
  flex: 1;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}

.project-item.active .project-name {
  color: #047857;
}

.project-meta {
  font-size: 11px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-item.active .project-meta {
  color: #059669;
}

.project-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
  background: #ffffff;
  padding: 2px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  margin-left: -4px;
}

.project-item:hover .project-actions {
  opacity: 1;
  pointer-events: auto;
}

.project-item.active .project-actions {
  background: #f8fffb;
  border-color: #bbf7d0;
}

.project-action-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #64748b;
  font-size: 12px;
}

.project-action-btn:hover {
  background: #f0fdf4;
  border-color: #a7f3d0;
  color: #059669;
}

.project-action-btn.delete-btn:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}

.project-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #64748b;
}

.stat-icon {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.stat-icon.datasets {
  background: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.1);
}
.stat-icon.files {
  background: #8b5cf6;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
}
.stat-icon.size {
  background: #06b6d4;
  box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.1);
}

/* 数据集列表 - 使用 CSS Grid 实现平滑展开 */
.datasets-list {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  margin-top: 0;
  transition:
    grid-template-rows 0.25s ease-out,
    opacity 0.2s ease-out,
    margin-top 0.25s ease-out;
}

.datasets-list > .datasets-container,
.datasets-list > .datasets-empty {
  overflow: hidden;
}

.datasets-list.expanded {
  grid-template-rows: 1fr;
  opacity: 1;
  margin-top: 10px;
}

.datasets-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 6px;
  position: relative;
}

/* Connecting line for datasets */
.datasets-container::before {
  content: "";
  position: absolute;
  left: 16px;
  top: 2px;
  bottom: 10px;
  width: 1px;
  background: #dcfce7;
  border-radius: 1px;
}

.dataset-wrapper {
  margin-bottom: 2px;
  position: relative;
}

.dataset-item {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 8px 7px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 16px;
}

/* Connector curve */
.dataset-item::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  width: 8px;
  height: 1px;
  background: #bbf7d0;
}

.dataset-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
}

.dataset-item.active {
  background: #f8fffb;
  border-color: #86efac;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.1);
}

/* .dataset-item.expanded removed */

.dataset-header {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
}

/* 数据集展开按钮 */
.dataset-expand-btn {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #94a3b8;
  font-size: 10px;
  flex-shrink: 0;
  padding: 0;
}

.dataset-expand-btn:hover {
  background: #f0fdf4;
  color: #10b981;
}

.dataset-expand-btn.expanded {
  transform: rotate(90deg);
  color: #10b981;
}

.dataset-icon {
  width: 18px;
  height: 18px;
  background: #f8fafc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #64748b;
  transition: all 0.2s;
  border: 1px solid #e2e8f0;
}

.dataset-item:hover .dataset-icon,
.dataset-item.active .dataset-icon {
  background: #f0fdf4;
  color: #059669;
  border-color: #bbf7d0;
}

.dataset-name {
  font-size: 12px;
  font-weight: 500;
  color: #334155;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}

.dataset-item.active .dataset-name {
  color: #047857;
  font-weight: 600;
}

.dataset-type {
  font-size: 9px;
  padding: 1px 6px;
  background: #f8fafc;
  color: #64748b;
  border-radius: 4px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border: 1px solid #e2e8f0;
}

.dataset-delete-btn {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #ef4444;
  font-size: 12px;
  opacity: 0;
  margin-left: 4px;
}

.dataset-item:hover .dataset-delete-btn {
  opacity: 1;
}

.dataset-delete-btn:hover {
  background: #fef2f2;
  color: #dc2626;
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
  border-bottom: none;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

.main-nav {
  border: none;
  transition: all 0.3s ease;
}

.content-area {
  flex: 1;
  padding: 0;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  overflow: hidden; /* 防止外层滚动，强制内部滚动 */
  position: relative;
  display: flex; /* 使用 Flex 布局 */
  flex-direction: column; /* 垂直排列 */
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
}

:deep(.el-dropdown-menu__item.active) {
  color: #10b981;
  background-color: #ecfdf5;
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
