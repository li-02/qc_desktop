<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import emitter from "@/utils/eventBus";
import {ElMessage, ElMessageBox} from "element-plus";
import type {ProjectInfo} from "@/types/electron";
import {
  DataAnalysis,
  Delete,
  DocumentCopy,
  HomeFilled,
  MoreFilled,
  Operation,
  PieChart,
  Plus,
  Refresh,
  Upload,
} from "@element-plus/icons-vue";

// 项目状态
const projects = ref<ProjectInfo[]>([]);
const selectedProject = ref<ProjectInfo | null>(null);
const loading = ref(false);

// 侧边栏状态
const isCollapsed = ref(false);
const tooltipText = computed(() => {
  return isCollapsed.value ? "点击展开" : "点击折叠";
});
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 路由相关
const route = useRoute();
const router = useRouter();
const activeIndex = computed(() => route.path);
const currentRouteName = computed(() => {
  const matchedRoute = router.resolve(route.path).matched[1]; // 获取当前激活的路由
  return matchedRoute?.name || "";
});

// 主菜单项
const mainMenuItems = [
  {name: "首页", path: "/", icon: HomeFilled},
  {name: "数据预处理", path: "/data-processing", icon: DataAnalysis},
  {name: "数据分析", path: "/data-analysis", icon: Operation},
  {name: "数据可视化", path: "/data-visualization", icon: PieChart},
  {name: "数据导出", path: "/data-export", icon: DocumentCopy},
];

// 格式化日期
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

// 选择项目
const selectProject = (project: ProjectInfo) => {
  selectedProject.value = project;
  // 触发项目选择的事件
  emitter.emit("project-selected", project);

  // 如果当前在首页，自动跳转到数据预处理页面
  if (route.path === "/") {
    router.push("/data-processing");
  }
};

// 创建新项目
const createNewProject = () => {
  emitter.emit("open-create-project-dialog");
};

// 处理项目命令
const handleProjectCommand = (command: string, project: ProjectInfo) => {
  if (command === "import") {
    handleImportData(project);
  } else if (command === "delete") {
    confirmDeleteProject(project);
  }
};

// 加载项目列表
const loadProjects = async () => {
  if (!window.electronAPI) {
    console.error("Electron API not available");
    return;
  }

  try {
    loading.value = true;
    projects.value = await window.electronAPI.getProjects();
    // 按创建时间降序排序（最新的在前面）
    projects.value.sort((a, b) => b.createdAt - a.createdAt);

    // 如果有选中的项目，更新一下选中的项目信息
    if (selectedProject.value) {
      const updated = projects.value.find(p => p.id === selectedProject.value?.id);
      if (updated) {
        selectedProject.value = updated;
      } else {
        // 如果当前选中的项目已被删除，则清空选择
        selectedProject.value = null;
      }
    }

    // 如果有项目但没有选中项目，自动选择第一个
    if (projects.value.length > 0 && !selectedProject.value) {
      selectedProject.value = projects.value[0];
    }
  } catch (error) {
    console.error("Failed to load projects:", error);
    ElMessage.error("加载项目列表失败");
  } finally {
    loading.value = false;
  }
};

// 处理导入数据点击事件
const handleImportData = (project?: ProjectInfo) => {
  // 如果提供了特定项目，先选中它
  if (project) {
    selectedProject.value = project;
  }

  // 检查是否有选中的项目
  if (!selectedProject.value) {
    ElMessage.warning("请先选择一个项目");
    return;
  }

  console.log("导入数据到项目:", selectedProject.value.name);
  emitter.emit("open-import-data-dialog");
};

// 确认删除项目
const confirmDeleteProject = (project: ProjectInfo) => {
  ElMessageBox.confirm(`确定要删除项目 "${project.name}" 吗? 此操作不可恢复。`, "删除项目", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      await deleteProject(project.id);
    })
    .catch(() => {
      // do nothing
    });
};

// 删除项目
const deleteProject = async (projectId: string) => {
  if (!window.electronAPI) {
    console.error("Electron API not available");
    return;
  }

  try {
    loading.value = true;
    const result = await window.electronAPI.deleteProject(projectId);

    if (result.success) {
      ElMessage.success("项目删除成功");

      // 如果删除的是当前选中的项目，则清空选择
      if (selectedProject.value?.id === projectId) {
        selectedProject.value = null;
      }

      // 刷新项目列表
      await loadProjects();
    } else {
      throw new Error(result.error || "删除项目失败");
    }
  } catch (error: any) {
    console.error("Delete project error:", error);
    ElMessage.error(error.message || "删除项目时出错");
  } finally {
    loading.value = false;
  }
};

// 监听项目刷新事件
const handleRefreshProjects = () => {
  loadProjects();
};

onMounted(() => {
  // 首次加载项目列表
  loadProjects();

  // 监听刷新项目列表事件
  emitter.on("refresh-projects", handleRefreshProjects);

  // 监听项目创建成功事件
  emitter.on("project-created", project => {
    loadProjects().then(() => {
      // 自动选择新创建的项目
      const newProject = projects.value.find(p => p.id === project.id);
      if (newProject) {
        selectProject(newProject);
      }
    });
  });
});

onUnmounted(() => {
  // 移除事件监听
  emitter.off("refresh-projects", handleRefreshProjects);
  emitter.off("project-created");
});
</script>
<template>
  <!-- 应用窗口 -->
  <div class="w-full h-full flex mx-auto overflow-hidden bg-white">
    <!-- 侧边栏 -->
    <div
      :class="[
        isCollapsed ? 'w-16' : 'w-54',
        'h-full flex flex-col bg-gray-800 text-white transition-[width] duration-300 ease-in-out',
      ]"
      @transitionstart="onTransitionStart"
      @transitionend="onTransitionEnd">
      <!-- 应用标题区 -->
      <div class="w-16 flex items-center">
        <div class="w-16 flex justify-center">
          <el-tooltip :content="tooltipText" :show-after="300" placement="right">
            <el-button
              @click="toggleCollapse"
              text
              class="!p-0 w-10 h-10 flex items-center justify-center no-hover-bg"
              :icon="isCollapsed ? 'Expand' : 'Fold'" />
          </el-tooltip>
        </div>
      </div>

      <!-- 项目管理部分 -->
      <div class="projects-section" v-if="!isCollapsed">
        <div class="projects-header">
          <h2>项目</h2>
          <div class="projects-actions">
            <el-tooltip content="刷新项目列表" placement="top">
              <el-button circle text size="small" :loading="loading" @click="loadProjects" :icon="Refresh" />
            </el-tooltip>
            <el-tooltip content="新建项目" placement="top">
              <el-button circle text size="small" @click="createNewProject" :icon="Plus" />
            </el-tooltip>
          </div>
        </div>

        <!-- 项目列表 -->
        <div class="projects-list">
          <el-empty v-if="projects.length === 0" description="暂无项目" :image-size="48" />
          <div
            v-for="project in projects"
            :key="project.id"
            class="project-item"
            :class="{active: selectedProject?.id === project.id}"
            @click="selectProject(project)">
            <div class="project-info">
              <p class="project-name">{{ project.name }}</p>
              <p class="project-date">{{ formatDate(project.createdAt) }}</p>
            </div>
            <el-dropdown trigger="click" @command="handleProjectCommand($event, project)">
              <el-button circle text size="small" :icon="MoreFilled" class="project-menu-btn" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="import">
                    <el-icon>
                      <Upload />
                    </el-icon>
                    <span>导入数据</span>
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <el-icon class="text-danger">
                      <Delete />
                    </el-icon>
                    <span class="text-danger">删除项目</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- 顶部工具栏 -->
      <div class="border-b border-gray-200 bg-white">
        <!-- 主导航菜单 -->
        <el-menu
          mode="horizontal"
          :default-active="activeIndex"
          class="w-full justify-start border-none transition-all duration-300 ease-in-out"
          background-color="#1F2937"
          text-color="#E5E7EB"
          active-text-color="#FFFFFF"
          router>
          <el-menu-item v-for="item in mainMenuItems" :key="item.path" :index="item.path">
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <template #title>{{ item.name }}</template>
          </el-menu-item>
        </el-menu>

        <!-- 第二行：面包屑 + 工具按钮 -->
        <div class="px-4 py-3">
          <div class="flex justify-between items-center w-full">
            <!-- 面包屑导航 -->
            <el-breadcrumb separator="/">
              <el-breadcrumb-item :to="{path: '/'}">首页</el-breadcrumb-item>
              <el-breadcrumb-item v-if="currentRouteName">{{ currentRouteName }}</el-breadcrumb-item>
              <el-breadcrumb-item v-if="selectedProject">{{ selectedProject.name }}</el-breadcrumb-item>
            </el-breadcrumb>

            <!-- 工具按钮 -->
            <div class="flex">
              <el-button-group>
                <el-button @click="handleImportData" :icon="Upload" size="default">导入数据</el-button>
                <el-button type="primary" @click="createNewProject" :icon="Plus" size="default">新建项目</el-button>
              </el-button-group>
            </div>
          </div>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="flex-1 p-6 overflow-y-auto bg-gray-50">
        <router-view v-if="selectedProject || $route.path === '/'" />
        <div v-else class="h-full flex items-center justify-center">
          <el-empty description="请先选择一个项目" :image-size="128">
            <el-button type="primary" @click="createNewProject">新建项目</el-button>
          </el-empty>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.no-hover-bg:hover) {
  background-color: transparent !important;
}
/* 主导航菜单样式 */
:deep(.el-menu--horizontal) {
  justify-content: flex-start !important;
  padding-left: 0;
}

:deep(.el-menu-item.is-active) {
  background-color: #4b5563 !important;
}

:deep(.el-menu-item:hover) {
  background-color: #374151 !important;
}

/* Element Plus 样式覆盖 */
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

.app-title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.el-menu--collapse) {
  width: 64px;
}

/* 项目管理部分 */
.projects-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-top: 16px;
  overflow: hidden;
}

.projects-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  margin-bottom: 8px;
}

.projects-header h2 {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  font-weight: 600;
  color: #9ca3af;
}

.projects-actions {
  display: flex;
  gap: 4px;
}

.projects-actions button {
  color: #9ca3af;
}

.projects-actions button:hover {
  color: #ffffff;
}

/* 项目列表 */
.projects-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.projects-list::-webkit-scrollbar {
  width: 4px;
}

.projects-list::-webkit-scrollbar-thumb {
  background-color: #4b5563;
  border-radius: 2px;
}

.projects-list::-webkit-scrollbar-track {
  background-color: transparent;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.project-item:hover {
  background-color: #374151;
}

.project-item.active {
  background-color: #3b82f6;
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-date {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}

.project-item.active .project-date {
  color: #e5e7eb;
}

.project-menu-btn {
  opacity: 0;
  color: #9ca3af;
  transition: opacity 0.2s ease;
}

.project-item:hover .project-menu-btn {
  opacity: 1;
}

.project-menu-btn:hover {
  color: #ffffff;
}

/* 折叠状态下项目图标 */
.collapsed-projects {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  gap: 8px;
}

.collapsed-projects button {
  color: #9ca3af;
}

.collapsed-projects button:hover {
  color: #ffffff;
}

.tools {
  display: flex;
  gap: 8px;
}

/* 内容区域 */
.content-area {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background-color: #f9fafb;
}

.content-area::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.content-area::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 3px;
}

.content-area::-webkit-scrollbar-track {
  background-color: #f3f4f6;
  border-radius: 3px;
}

/* 选择项目提示 */
.select-project-hint {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 辅助类 */
.text-danger {
  color: #ef4444;
}

/* Element Plus 自定义样式 */
:deep(.el-breadcrumb__item) {
  display: inline-flex;
  align-items: center;
}

:deep(.el-empty__image) {
  opacity: 0.8;
}

:deep(.el-menu) {
  border-right: none !important;
  transition: all 0.3s ease-in-out;
}
</style>
