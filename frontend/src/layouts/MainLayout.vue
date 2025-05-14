<template>
  <el-container class="h-screen bg-gray-100">
    <el-container>
      <!-- 侧边栏（固定显示） -->
      <el-aside
        :width="isCollapsed ? '40px' : '200px'"
        class="bg-white transition-all duration-300 md:w-[200px] lg:w-[250px] border-r border-gray-200 relative overflow-hidden"
      >
        <!-- 侧边栏内容容器 -->
        <div class="flex flex-col h-full">
          <!-- 固定位置的按钮容器 -->
          <div class="py-4 pl-4 relative z-10">
            <el-button
              @click="toggleCollapse"
              class="!p-0 !w-8 !h-8 flex items-center justify-center"
              :icon="isCollapsed ? 'Expand' : 'Fold'"
              text
            />
          </div>

          <!-- 使用 Tailwind 的过渡类和 Vue 的 Transition -->
          <div class="flex flex-col flex-grow overflow-hidden">
            <Transition
              enter-active-class="transition-opacity duration-300 delay-200"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <div v-if="!isCollapsed" class="flex flex-col h-full bg-gray-100 !p-1">
                <!-- 项目浏览器部分 -->
                <div class="flex flex-col h-1/2 min-h-0">
                  <p class="bg-gray-600 rounded !py-1 !my-1 flex items-center h-6">
                    <span class="text-white text-sm !ml-2"> 项目浏览器 </span>
                  </p>
                  <div
                    class="bg-white !p-2 border border-gray-300 mt-1 rounded flex-grow overflow-auto"
                  >
                    <p class="bg-blue-500 p-1 rounded flex items-center h-6">
                      <span class="text-white text-xs !ml-2">密云监测站</span>
                    </p>
                    <p class="p-1 bg-gray-200 !my-1 flex items-center h-5 rounded">
                      <span class="text-gray-500 text-xs !ml-2">暂无数据</span>
                    </p>
                  </div>
                </div>
                <!-- 数据处理步骤部分 -->
                <div class="flex flex-col h-1/2 min-h-0 !mt-1">
                  <p class="bg-gray-600 rounded !py-1 !my-1 flex items-center h-6">
                    <span class="text-white text-sm !ml-2"> 数据处理步骤 </span>
                  </p>
                  <div
                    class="bg-white !p-2 border border-gray-300 mt-1 rounded flex-grow overflow-auto !py-1"
                  >
                    <p class="p-1 bg-gray-200 !my-1 h-5 flex items-center rounded">
                      <span class="text-gray-500 text-xs !ml-2">导入数据</span>
                    </p>
                    <p>数据预处理</p>
                    <p>数据分析</p>
                    <p>数据可视化</p>
                    <p>数据导出</p>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </el-aside>

      <!-- 右侧内容区域 -->
      <el-container class="flex flex-col overflow-hidden">
        <!-- 顶部导航条 - 使用 Element Plus 的 el-menu 组件 -->
        <el-header class="p-0 bg-white border-b border-gray-200 shadow-sm">
          <el-menu
            :default-active="activeIndex"
            mode="horizontal"
            router
            class="flex-1"
            @select="handleSelect"
            background-color="#ffffff"
            text-color="#606266"
            active-text-color="#409EFF"
          >
            <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
              <el-icon>
                <component :is="item.icon" />
              </el-icon>
              <span>{{ item.name }}</span>
            </el-menu-item>

            <!-- 右侧按钮区域 -->
            <div class="flex-1"></div>
            <div class="flex items-center pr-4">
              <el-button type="primary" size="small" @click="createNewProject" class="mr-2">
                <el-icon class="mr-1">
                  <Plus />
                </el-icon>
                新建项目
              </el-button>
              <el-button type="primary" size="small" plain @click="importData">
                <el-icon class="mr-1">
                  <Upload />
                </el-icon>
                导入数据
              </el-button>
            </div>
          </el-menu>
        </el-header>

        <!-- 主内容区域 -->
        <el-main class="bg-gray-50 p-4 sm:p-2 md:p-4 overflow-auto">
          <!-- 路由内容将在这里显示 -->
          <router-view></router-view>
        </el-main>
      </el-container>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import {ref, watch} from "vue";
import {useRoute} from "vue-router";
import {ElMessage} from "element-plus";
import {Plus, Upload} from "@element-plus/icons-vue";

const isCollapsed = ref(false);
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 获取当前路由
const route = useRoute();
const activeIndex = ref(route.path);

// 监听路由变化，更新激活的菜单项
watch(() => route.path, (newPath) => {
  activeIndex.value = newPath;
});

// 菜单项数据
const menuItems = [
  {name: "首页", path: "/", icon: "HomeFilled"},
  {name: "数据预处理", path: "/data-processing", icon: "DataAnalysis"},
  {name: "数据分析", path: "/data-analysis", icon: "Operation"},
  {name: "数据可视化", path: "/data-visualization", icon: "PieChart"},
  {name: "数据导出", path: "/data-export", icon: "Document"},
];

// 菜单选择处理
const handleSelect = (key: string) => {
  console.log("选择的菜单项:", key);
};

// 按钮功能
const createNewProject = () => {
  ElMessage.success("新建项目功能待实现");
};

const importData = () => {
  ElMessage.success("导入数据功能待实现");
};
</script>

<style scoped>
.el-header {
  height: auto !important;
  padding: 0;
}

/* 修改 el-menu 样式，使其填满整个 header 并允许右侧操作按钮 */
:deep(.el-menu) {
  display: flex;
  border-bottom: none !important;
}

:deep(.el-menu--horizontal > .el-menu-item) {
  height: 56px;
  line-height: 56px;
}

/* 自定义弹性布局 */
.flex-1 {
  flex: 1;
}

/* 自定义按钮容器样式 */
:deep(.el-menu--horizontal) .flex.items-center {
  height: 56px;
}

/* 增强滚动条样式 */
.el-main::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.el-main::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.el-main::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}
</style>