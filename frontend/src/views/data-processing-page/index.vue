<template>
  <div class="bg-white rounded-lg shadow-sm p-6">
    <div class="flex items-center mb-6">
      <el-icon class="text-blue-500 text-xl mr-2">
        <DataAnalysis />
      </el-icon>
      <h2 class="text-2xl font-bold text-gray-800">数据预处理</h2>
    </div>

    <el-steps :active="currentStep" finish-status="success" class="mb-8">
      <el-step title="导入数据" description="选择并上传数据文件"></el-step>
      <el-step title="数据清洗" description="处理异常和缺失值"></el-step>
      <el-step title="数据标准化" description="归一化和标准化处理"></el-step>
      <el-step title="特征工程" description="特征提取和转换"></el-step>
    </el-steps>

    <div class="bg-gray-50 p-6 rounded-lg mb-6">
      <h3 class="text-lg font-medium mb-4 text-gray-700">数据清洗选项</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <el-card shadow="hover" class="mb-4">
          <template #header>
            <div class="flex items-center justify-between">
              <span>缺失值处理</span>
              <el-switch v-model="options.handleMissingValues" />
            </div>
          </template>
          <div class="p-2">
            <el-radio-group v-model="options.missingValueStrategy" :disabled="!options.handleMissingValues">
              <el-radio label="mean">均值填充</el-radio>
              <el-radio label="median">中位数填充</el-radio>
              <el-radio label="mode">众数填充</el-radio>
              <el-radio label="drop">删除记录</el-radio>
            </el-radio-group>
          </div>
        </el-card>

        <el-card shadow="hover" class="mb-4">
          <template #header>
            <div class="flex items-center justify-between">
              <span>异常值处理</span>
              <el-switch v-model="options.handleOutliers" />
            </div>
          </template>
          <div class="p-2">
            <el-radio-group v-model="options.outlierStrategy" :disabled="!options.handleOutliers">
              <el-radio label="clip">截断处理</el-radio>
              <el-radio label="remove">删除异常值</el-radio>
              <el-radio label="transform">对数变换</el-radio>
            </el-radio-group>
          </div>
        </el-card>
      </div>

      <div class="mt-4">
        <el-card shadow="hover" class="mb-4">
          <template #header>
            <div class="flex items-center justify-between">
              <span>标准化处理</span>
              <el-switch v-model="options.standardize" />
            </div>
          </template>
          <div class="p-2">
            <el-radio-group v-model="options.standardizeMethod" :disabled="!options.standardize">
              <el-radio label="zscore">Z-Score标准化</el-radio>
              <el-radio label="minmax">Min-Max归一化</el-radio>
              <el-radio label="robust">Robust缩放</el-radio>
            </el-radio-group>
          </div>
        </el-card>
      </div>
    </div>

    <el-alert
      type="info"
      title="提示"
      description="请先导入数据后再进行预处理操作。导入数据后，系统会自动分析数据特征并提供建议的处理方案。"
      :closable="false"
      show-icon
      class="mb-6" />

    <div class="flex justify-between">
      <el-button @click="prevStep" :disabled="currentStep <= 0">
        <el-icon class="mr-1">
          <ArrowLeft />
        </el-icon>
        上一步
      </el-button>
      <el-button type="primary" @click="nextStep" :disabled="!dataLoaded">
        下一步
        <el-icon class="ml-1">
          <ArrowRight />
        </el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ArrowLeft, ArrowRight, DataAnalysis } from "@element-plus/icons-vue";

const currentStep = ref(0);
const dataLoaded = ref(false);

// 预处理选项
const options = ref({
  handleMissingValues: false,
  missingValueStrategy: "mean",
  handleOutliers: false,
  outlierStrategy: "clip",
  standardize: false,
  standardizeMethod: "zscore",
});

// 步骤导航
const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
};

const nextStep = () => {
  if (currentStep.value < 3) {
    currentStep.value++;
  }
};
</script>

<style scoped>
/* 组件特定样式 */
:deep(.el-step__title) {
  font-size: 14px;
}

:deep(.el-step__description) {
  font-size: 12px;
}

@media (max-width: 768px) {
  :deep(.el-step__main) {
    display: none;
  }
}
</style>
