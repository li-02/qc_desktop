<script lang="ts" setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const isCollapsed = ref(false)
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}
const importData = () => {
  ElMessage.success('导入数据功能待实现')
}
const createNewProject = () => {
  ElMessage.success('新建项目功能待实现')
}
</script>

<template>
  <el-container class="h-screen bg-gray-100 md-bg-gray-200">
    <!-- 工具栏 -->
    <!-- <el-header class="bg-gray-700 text-white flex items-center px-4">
      <el-button type="primary" class="mr-2" @click="createNewProject"><span class="text-lg">新建项目</span></el-button>
      <el-button type="primary" class="mr-2"><span class="text-lg">-</span></el-button>
      <el-button type="primary">导入数据</el-button>
    </el-header> -->
    <!--    主布局-->
    <el-container>
      <!-- 侧边栏（可折叠） -->
      <el-aside
        :width="isCollapsed ? '60px' : '200px'"
        class="bg-white transition-all duration-300 md:w-[200px] lg:w-[250px]"
      >
        <div class="flex flex-col h-full p-4">
          <el-button
            @click="toggleCollapse"
            class="mb-4 toggle-btn"
            :icon="isCollapsed ? 'Expand' : 'fold'"
            text
          />

          <!-- 使用 Tailwind 的过渡类和 Vue 的 Transition -->
          <div class="flex flex-col h-full">
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
      <el-main class="bg-white p-4 sm:p-2 md:p-4">
        <div class="flex flex-col items-center justify-center h-full">
          <div
            class="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center transform transition-transform hover:scale-105"
          >
            <span class="text-5xl text-gray-400">+</span>
          </div>
          <h2 class="text-gray-500">密云监测站</h2>
          <p class="text-gray-500 mt-2">请导入数据以开始分析</p>
          <el-button
            type="primary"
            class="mt-4 transform transition-transform hover:scale-105"
            @click="importData"
            >导入数据
          </el-button>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.el-header {
  height: 40px !important;
}
.el-aside {
  border-right: 1px solid #e0e0e0;
}
.toggle-btn {
  font-size: 20px;
  justify-content: start;
}
</style>
