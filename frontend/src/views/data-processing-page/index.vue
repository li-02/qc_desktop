<template>
  <div class="processing-page">
    <div class="processing-header">
      <BarChart2 :size="24" class="header-icon" />
      <h2 class="header-title">数据预处理</h2>
    </div>

    <el-steps :active="currentStep" finish-status="success" class="processing-steps">
      <el-step title="导入数据" description="选择并上传数据文件"></el-step>
      <el-step title="数据清洗" description="处理异常和缺失值"></el-step>
      <el-step title="数据标准化" description="归一化和标准化处理"></el-step>
      <el-step title="特征工程" description="特征提取和转换"></el-step>
    </el-steps>

    <div class="options-section">
      <h3 class="options-title">数据清洗选项</h3>
      <div class="options-grid">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>缺失值处理</span>
              <el-switch v-model="options.handleMissingValues" />
            </div>
          </template>
          <div class="card-body">
            <el-radio-group v-model="options.missingValueStrategy" :disabled="!options.handleMissingValues">
              <el-radio label="mean">均值填充</el-radio>
              <el-radio label="median">中位数填充</el-radio>
              <el-radio label="mode">众数填充</el-radio>
              <el-radio label="drop">删除记录</el-radio>
            </el-radio-group>
          </div>
        </el-card>

        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>异常值处理</span>
              <el-switch v-model="options.handleOutliers" />
            </div>
          </template>
          <div class="card-body">
            <el-radio-group v-model="options.outlierStrategy" :disabled="!options.handleOutliers">
              <el-radio label="clip">截断处理</el-radio>
              <el-radio label="remove">删除异常值</el-radio>
              <el-radio label="transform">对数变换</el-radio>
            </el-radio-group>
          </div>
        </el-card>
      </div>

      <div class="options-extra">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>标准化处理</span>
              <el-switch v-model="options.standardize" />
            </div>
          </template>
          <div class="card-body">
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
      class="processing-alert" />

    <div class="processing-footer">
      <el-button @click="prevStep" :disabled="currentStep <= 0">
        <ChevronLeft :size="16" class="mr-1" />
        上一步
      </el-button>
      <el-button type="primary" @click="nextStep" :disabled="!dataLoaded">
        下一步
        <ChevronRight :size="16" class="ml-1" />
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ChevronLeft, ChevronRight, BarChart2 } from "lucide-vue-next";

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
.processing-page {
  background: var(--c-bg-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sm);
  padding: var(--space-6);
}

.processing-header {
  display: flex;
  align-items: center;
  margin-bottom: var(--space-6);
}

.header-icon {
  color: var(--c-brand);
  font-size: var(--text-2xl);
  margin-right: var(--space-2);
}

.header-title {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--c-text-base);
  margin: 0;
}

.processing-steps {
  margin-bottom: var(--space-8);
}

.options-section {
  background: var(--c-bg-page);
  padding: var(--space-6);
  border-radius: var(--radius-card);
  margin-bottom: var(--space-6);
}

.options-title {
  font-size: var(--text-lg);
  font-weight: var(--font-medium);
  margin-bottom: var(--space-4);
  color: var(--c-text-secondary);
  margin-top: 0;
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
}

.options-extra {
  margin-top: var(--space-4);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-body {
  padding: var(--space-2);
}

.processing-alert {
  margin-bottom: var(--space-6);
}

.processing-footer {
  display: flex;
  justify-content: space-between;
}

@media (max-width: 768px) {
  .options-grid {
    grid-template-columns: 1fr;
  }
}

:deep(.el-step__title) {
  font-size: var(--text-md);
}

:deep(.el-step__description) {
  font-size: var(--text-sm);
}

@media (max-width: 768px) {
  :deep(.el-step__main) {
    display: none;
  }
}
</style>
