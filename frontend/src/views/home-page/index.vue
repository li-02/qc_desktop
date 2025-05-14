<template>
  <div class="bg-white rounded-lg shadow-sm p-6">
    <div class="flex items-center mb-6">
      <el-icon class="text-blue-500 text-xl mr-2">
        <HomeFilled/>
      </el-icon>
      <h2 class="text-2xl font-bold text-gray-800">密云监测站数据分析</h2>
    </div>

    <el-card class="welcome-card mb-6">
      <template #header>
        <div class="flex items-center">
          <el-icon class="mr-2">
            <InfoFilled/>
          </el-icon>
          <span>项目概览</span>
        </div>
      </template>
      <div class="flex flex-col md:flex-row">
        <div class="flex items-center justify-center md:w-1/3 mb-4 md:mb-0">
          <div
              class="w-24 h-24 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center transform transition-transform hover:scale-105"
          >
            <el-icon class="text-4xl">
              <DataAnalysis/>
            </el-icon>
          </div>
        </div>
        <div class="md:w-2/3">
          <h3 class="text-lg font-medium mb-2">欢迎使用数据分析平台</h3>
          <p class="text-gray-600 mb-4">本平台提供全面的数据处理和分析功能，帮助您从数据中获取有价值的见解。</p>
          <el-button
              type="primary"
              @click="importData"
              class="transform transition-transform hover:scale-105"
          >
            <el-icon class="mr-1">
              <Upload/>
            </el-icon>
            导入数据
          </el-button>
        </div>
      </div>
    </el-card>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <el-card shadow="hover" v-for="(step, index) in workflowSteps" :key="index">
        <template #header>
          <div class="flex items-center">
            <el-icon class="mr-2">
              <component :is="step.icon"/>
            </el-icon>
            <span>{{ step.title }}</span>
          </div>
        </template>
        <div class="h-32 flex flex-col justify-between">
          <p class="text-gray-600">{{ step.description }}</p>
          <router-link :to="step.path">
            <el-button text class="mt-2 text-blue-500">
              前往
              <el-icon class="ml-1">
                <ArrowRight/>
              </el-icon>
            </el-button>
          </router-link>
        </div>
      </el-card>
    </div>

    <el-alert
        title="系统提示"
        type="info"
        description="在开始分析前，请先导入数据文件。支持CSV、Excel、JSON等格式。"
        show-icon
        :closable="false"
        class="mb-4"
    />
  </div>
</template>

<script setup lang="ts">
import {ElMessage} from 'element-plus'
import {ArrowRight, DataAnalysis, HomeFilled, InfoFilled, Upload} from '@element-plus/icons-vue'

// 导入数据功能
const importData = () => {
  ElMessage.success('导入数据功能待实现')
}

// 工作流程步骤
const workflowSteps = [
  {
    title: '数据预处理',
    description: '清洗、标准化和处理原始数据，为后续分析做准备。',
    icon: 'DataAnalysis',
    path: '/data-processing'
  },
  {
    title: '数据分析',
    description: '使用统计和机器学习方法深入挖掘数据中的模式和关系。',
    icon: 'Operation',
    path: '/data-analysis'
  },
  {
    title: '数据可视化',
    description: '创建直观的图表和仪表板，帮助理解数据并传达见解。',
    icon: 'PieChart',
    path: '/data-visualization'
  }
]
</script>

<style scoped>
.welcome-card {
  background-color: #f8fafc;
  border-left: 4px solid #3b82f6;
}
</style>