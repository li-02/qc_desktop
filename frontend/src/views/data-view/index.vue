<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useDatasetStore } from "@/stores/useDatasetStore";

import DataAnalysisTabs from "./components/DataAnalysisTabs.vue";

// Store
const datasetStore = useDatasetStore();

// 响应式状态
const loading = ref(false);
const refreshing = ref(false);
const currentTab = ref("overview");

// 计算属性
const currentDataset = computed(() => datasetStore.currentDataset);
const hasDataset = computed(() => !!currentDataset.value);

// 数据刷新
const refreshDatasetInfo = async () => {
  if (!currentDataset.value) return;

  try {
    refreshing.value = true;
    await datasetStore.loadDatasets();
    ElMessage.success("数据集信息已刷新");
  } catch (error) {
    console.error("刷新数据集失败:", error);
    ElMessage.error("刷新失败，请稍后重试");
  } finally {
    refreshing.value = false;
  }
};

// 选项卡切换处理
const handleTabChange = (tabId: string) => {
  currentTab.value = tabId;
  console.log("切换到选项卡:", tabId);
};

// 数据分析操作处理
const handleStartOutlierDetection = async (options: any) => {
  try {
    loading.value = true;
    ElMessage.info("正在启动异常值检测...");
    // TODO: 调用IPC接口
    console.log("异常值检测选项:", options);
  } catch (error) {
    ElMessage.error("启动异常值检测失败");
  } finally {
    loading.value = false;
  }
};

const handleStartMissingValueImputation = async (options: any) => {
  try {
    loading.value = true;
    ElMessage.info("正在启动缺失值处理...");
    // TODO: 调用IPC接口
    console.log("缺失值处理选项:", options);
  } catch (error) {
    ElMessage.error("启动缺失值处理失败");
  } finally {
    loading.value = false;
  }
};

const handleStartDataCleaning = async (options: any) => {
  try {
    loading.value = true;
    ElMessage.info("正在启动数据清洗...");
    // TODO: 调用IPC接口
    console.log("数据清洗选项:", options);
  } catch (error) {
    ElMessage.error("启动数据清洗失败");
  } finally {
    loading.value = false;
  }
};

const handleExportData = async (options: any = {}) => {
  try {
    loading.value = true;
    ElMessage.info("正在导出数据...");
    // TODO: 调用IPC接口
    console.log("导出选项:", options);
  } catch (error) {
    ElMessage.error("数据导出失败");
  } finally {
    loading.value = false;
  }
};

// 生命周期
onMounted(() => {
  console.log("DataView 组件已挂载");
  if (!currentDataset.value) {
    ElMessage.warning("请先从左侧选择一个数据集");
  }
});

// 监听数据集变化
watch(currentDataset, (newDataset, oldDataset) => {
  if (newDataset && newDataset.id !== oldDataset?.id) {
    ElMessage.success(`已切换到数据集: ${newDataset.name}`);
    currentTab.value = "overview"; // 重置到概览选项卡
  }
});
</script>

<template>
  <div class="data-view-container">
    <div class="content-wrapper">
      <!-- 数据集信息卡片 -->

      <!-- 主要功能区域 -->
      <div v-if="hasDataset" class="main-content-grid">
        <!-- 数据分析选项卡 -->
        <div class="analysis-tabs-section">
          <DataAnalysisTabs
            :dataset-info="currentDataset"
            :content-loading="loading"
            :default-tab="currentTab"
            @tab-change="handleTabChange"
            @refresh="refreshDatasetInfo"
            @start-outlier-detection="handleStartOutlierDetection"
            @start-missing-value-imputation="handleStartMissingValueImputation"
            @start-data-cleaning="handleStartDataCleaning"
            @export-data="handleExportData" />
        </div>
      </div>

      <!-- 无数据集时的空状态 -->
      <div v-else class="empty-state-container">
        <div class="empty-state-content">
          <div class="empty-state-icon">
            <span>📊</span>
          </div>
          <h3 class="empty-state-title">开始数据分析</h3>
          <p class="empty-state-description">请从左侧导航栏选择一个数据集，开始您的数据分析之旅。</p>
          <div class="empty-state-tip">💡 支持异常值检测、缺失值处理、数据清洗等功能</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 主容器 */
.data-view-container {
  width: 100%;
  height: 100%; /* 适配父容器高度 */
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  overflow: hidden; /* 防止外层滚动 */
  display: flex;
  flex-direction: column;
}

/* 内容包装器 */
.content-wrapper {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  flex: 1; /* 填充剩余空间 */
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
}

/* 主要功能区域网格 */
.main-content-grid {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  margin-top: 0;
}

/* 数据分析选项卡区域 */
.analysis-tabs-section {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 空状态容器 */
.empty-state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 384px;
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 30%,
    rgba(240, 253, 244, 0.85) 70%,
    rgba(236, 253, 245, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(229, 231, 235, 0.4);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}

.empty-state-container::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.3), transparent);
}

/* 空状态内容 */
.empty-state-content {
  text-align: center;
  max-width: 400px;
  padding: 32px;
}

/* 空状态图标 */
.empty-state-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(16, 185, 129, 0.3);
  position: relative;
}

.empty-state-icon::before {
  content: "";
  position: absolute;
  inset: 2px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.2), transparent);
  border-radius: 50%;
  pointer-events: none;
}

.empty-state-icon span {
  font-size: 32px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

/* 空状态标题 */
.empty-state-title {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 16px;
  letter-spacing: -0.02em;
}

/* 空状态描述 */
.empty-state-description {
  color: #6b7280;
  margin-bottom: 24px;
  line-height: 1.6;
  font-size: 16px;
}

/* 空状态提示 */
.empty-state-tip {
  font-size: 14px;
  color: #6b7280;
  background: rgba(16, 185, 129, 0.08);
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  display: inline-block;
  font-weight: 500;
}

/* 响应式布局 */
/* @media (min-width: 1280px) {
  .main-content-grid {
    grid-template-columns: 2fr 1fr;
  }
} */

/* 悬停和交互效果 */
.empty-state-container:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.empty-state-icon:hover {
  transform: scale(1.05);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 加载状态动画 */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.content-wrapper[data-loading="true"] {
  animation: pulse 2s infinite;
}

/* 渐变动画 */
@keyframes gradient-shift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.data-view-container {
  background-size: 400% 400%;
  animation: gradient-shift 15s ease infinite;
}
</style>
