<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import emitter from "@/utils/eventBus";
import {ElMessage, ElMessageBox} from "element-plus";
import {
  ArrowRight,
  DataAnalysis,
  Delete,
  DocumentCopy,
  FolderOpened, // 添加这个图标
  Document, // 添加这个图标
  HomeFilled,
  MoreFilled,
  Operation,
  PieChart,
  Plus,
  Refresh,
  Upload,
} from "@element-plus/icons-vue";
import {useProjectStore} from "@/stores/useProjectStore";

const projectStore = useProjectStore();

// 删除重复的状态管理，只保留必要的
const expandedProjects = ref<Set<string>>(new Set());

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
  const matchedRoute = router.resolve(route.path).matched[1];
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

// 切换项目展开状态
const toggleProjectExpanded = (projectId: string) => {
  if (expandedProjects.value.has(projectId)) {
    expandedProjects.value.delete(projectId);
  } else {
    expandedProjects.value.add(projectId);
  }
};

const isProjectExpanded = (projectId: string): boolean => {
  return expandedProjects.value.has(projectId);
};

// 格式化日期
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

// 选择项目 - 修正参数类型
const selectProject = (projectId: string) => {
  // 找到项目对象
  const project = projectStore.projects.find(p => p.id === projectId);
  if (project) {
    projectStore.setCurrentProject(projectId);

    // 如果当前在首页，自动跳转到数据预处理页面
    if (route.path === "/") {
      router.push("/data-processing");
    }
  }
};

const selectDataset = (projectId: string, dataset: any) => {
  projectStore.setCurrentProject(projectId);
  ElMessage.info(`已选择数据集: ${dataset.name}`);
};

const createNewProject = () => {
  emitter.emit("open-create-project-dialog");
};

// 处理项目命令
const handleProjectCommand = (command: string, projectId: string) => {
  if (command === "import") {
    handleImportData(projectId);
  } else if (command === "delete") {
    confirmDeleteProject(projectId);
  }
};

// 处理导入数据点击事件
const handleImportData = (projectId?: string) => {
  if (projectId) {
    projectStore.setCurrentProject(projectId);
  }

  if (!projectStore.currentProject) {
    ElMessage.warning("请先选择一个项目");
    return;
  }

  console.log("导入数据到项目:", projectStore.currentProject.name);
  emitter.emit("open-import-data-dialog");
};

// 监听导入成功，自动展开项目
const handleImportSuccess = () => {
  if (projectStore.currentProject) {
    expandedProjects.value.add(projectStore.currentProject.id);
  }
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
  <div class="w-full h-full flex mx-auto overflow-hidden bg-white">
    <!-- 侧边栏 -->
    <div
      :class="[
        isCollapsed ? 'w-16' : 'w-54',
        'h-full flex flex-col bg-gray-800 text-white transition-[width] duration-300 ease-in-out',
      ]">
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
      <div class="flex-1 flex flex-col mt-4 overflow-hidden" v-if="!isCollapsed">
        <div class="flex items-center justify-between px-4 mb-2">
          <h2 class="m-0 text-xs uppercase font-semibold text-gray-400">项目</h2>
          <div class="flex gap-1">
            <el-tooltip content="刷新项目列表" placement="top">
              <el-button
                circle
                text
                size="small"
                :loading="projectStore.loading"
                @click="projectStore.loadProjects"
                :icon="Refresh"
                class="text-gray-400 hover:text-white" />
            </el-tooltip>
            <el-tooltip content="新建项目" placement="top">
              <el-button
                circle
                text
                size="small"
                @click="createNewProject"
                :icon="Plus"
                class="text-gray-400 hover:text-white" />
            </el-tooltip>
          </div>
        </div>

        <!-- 项目列表 -->
        <div class="flex-1 overflow-y-auto px-2 custom-scrollbar">
          <el-empty v-if="!projectStore.hasProjects" description="暂无项目" :image-size="48" />

          <div v-else class="space-y-1">
            <div v-for="project in projectStore.projectsSortedByDate" :key="project.id" class="group">
              <!-- 项目头部 -->
              <div
                class="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-700"
                :class="{
                  'bg-blue-600 hover:bg-blue-700': projectStore.currentProject?.id === project.id,
                  'bg-transparent': projectStore.currentProject?.id !== project.id,
                }"
                @click="selectProject(project.id)">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <!-- 展开/折叠按钮 -->
                    <button
                      v-if="project.datasets?.length > 0"
                      @click.stop="toggleProjectExpanded(project.id)"
                      class="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white transition-colors duration-200">
                      <el-icon
                        class="transform transition-transform duration-200 text-xs"
                        :class="{'rotate-90': isProjectExpanded(project.id)}">
                        <ArrowRight />
                      </el-icon>
                    </button>
                    <div v-else class="w-4 h-4"></div>

                    <!-- 项目图标 -->
                    <el-icon class="text-green-400 text-base flex-shrink-0">
                      <FolderOpened />
                    </el-icon>

                    <!-- 项目名称和数据集数量 -->
                    <span class="text-sm font-medium text-white truncate">
                      {{ project.name }}
                    </span>
                    <span
                      v-if="project.datasets?.length"
                      class="text-xs px-2 py-0.5 bg-gray-600 text-gray-300 rounded-full flex-shrink-0">
                      {{ project.datasets.length }}
                    </span>
                  </div>

                  <!-- 项目创建日期 -->
                  <p class="text-xs text-gray-400 mt-1 pl-6 truncate">
                    {{ formatDate(project.createdAt) }}
                  </p>
                </div>

                <!-- 项目操作菜单 -->
                <el-dropdown trigger="click" @command="handleProjectCommand($event, project.id)" @click.stop>
                  <el-button
                    circle
                    text
                    size="small"
                    class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-white ml-2"
                    :icon="MoreFilled" />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="import">
                        <el-icon class="mr-2"><Upload /></el-icon>
                        <span>导入数据</span>
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" divided>
                        <el-icon class="text-red-500 mr-2"><Delete /></el-icon>
                        <span class="text-red-500">删除项目</span>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>

              <!-- 数据集列表（展开时显示） -->
              <transition
                enter-active-class="transition-all duration-300 ease-out"
                enter-from-class="opacity-0 transform -translate-y-2 scale-95"
                enter-to-class="opacity-100 transform translate-y-0 scale-100"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 transform translate-y-0 scale-100"
                leave-to-class="opacity-0 transform -translate-y-2 scale-95">
                <div v-if="isProjectExpanded(project.id)" class="ml-6 mt-2 space-y-1 border-l border-gray-600 pl-4">
                  <!-- 有数据集时显示列表 -->
                  <div v-if="project.datasets?.length" class="space-y-1">
                    <div
                      v-for="dataset in project.datasets"
                      :key="dataset.id"
                      @click="selectDataset(project.id, dataset)"
                      class="flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-all duration-200 hover:bg-gray-700 group/dataset">
                      <el-icon class="text-purple-400 text-sm flex-shrink-0">
                        <Document />
                      </el-icon>

                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="text-sm text-gray-200 truncate font-medium">
                            {{ dataset.name }}
                          </span>
                          <span
                            class="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-200 rounded-full flex-shrink-0 border border-purple-700/30">
                            {{ dataset.type }}
                          </span>
                        </div>
                        <p class="text-xs text-gray-500 truncate">
                          {{ formatDate(dataset.createdAt) }}
                        </p>
                      </div>

                      <!-- 数据集操作指示器 -->
                      <div class="opacity-0 group-hover/dataset:opacity-100 transition-opacity duration-200">
                        <el-icon class="text-gray-500 text-xs">
                          <ArrowRight />
                        </el-icon>
                      </div>
                    </div>
                  </div>

                  <!-- 无数据集时的提示 -->
                  <div
                    v-else
                    class="flex flex-col items-center gap-3 p-6 text-center bg-gray-800/30 rounded-lg border border-dashed border-gray-600">
                    <el-icon class="text-gray-500 text-2xl">
                      <Document />
                    </el-icon>
                    <div>
                      <span class="text-sm text-gray-400 block mb-2">暂无数据集</span>
                      <el-button
                        text
                        size="small"
                        @click="handleImportData(project)"
                        class="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 px-3 py-1 rounded-md transition-all duration-200">
                        <el-icon class="mr-1 text-xs">
                          <Upload />
                        </el-icon>
                        导入第一个数据集
                      </el-button>
                    </div>
                  </div>
                </div>
              </transition>
            </div>
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
              <el-breadcrumb-item v-if="projectStore.currentProject">
                {{ projectStore.currentProject.name }}
              </el-breadcrumb-item>
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
        <router-view v-if="projectStore.currentProject || $route.path === '/'" />
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
/* 只保留必要的 Element Plus 样式覆盖 */
:deep(.no-hover-bg:hover) {
  background-color: transparent !important;
}

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

:deep(.el-menu--collapse) {
  width: 64px;
}

:deep(.el-menu) {
  border-right: none !important;
  transition: all 0.3s ease-in-out;
}

.projects-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  margin-bottom: 8px;
}
</style>
