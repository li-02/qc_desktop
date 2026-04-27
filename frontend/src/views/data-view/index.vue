<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useWorkflowStore } from "@/stores/useWorkflowStore";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft } from "lucide-vue-next";

import DataAnalysisTabs from "./components/DataAnalysisTabs.vue";

// Store & Router
const datasetStore = useDatasetStore();
const workflowStore = useWorkflowStore();
const route = useRoute();
const router = useRouter();

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

// 处理路由参数以支持从工作流直接跳转
const handleRouteQuery = async () => {
  const { dataset, datasetId, tab, versionId } = route.query;
  const targetDatasetId = datasetId || dataset;
  if (targetDatasetId) {
    // 强制选中这个 dataset 如果有必要
    const idStr = String(targetDatasetId);
    if (!currentDataset.value || String(currentDataset.value.id) !== idStr) {
      // 通过 setCurrentDataset 获取并设定
      await datasetStore.setCurrentDataset(idStr);
    }
  }

  if (versionId) {
    const id = Number(versionId);
    if (!Number.isNaN(id)) {
      await datasetStore.setCurrentVersion(id);
    }
  }

  if (tab && typeof tab === "string") {
    currentTab.value = tab;
  }
};

const returnToWorkflow = async () => {
  // Navigating back; workflow page will clear workflowReturnState after restoring state
  await router.push({ name: "Workflow" });
};

// 生命周期
onMounted(async () => {
  console.log("DataView 组件已挂载");

  await handleRouteQuery();
});

// 监听路由参数变化（以防在同一个视图里直接 query 变化）
watch(
  () => route.query,
  async () => {
    await handleRouteQuery();
  }
);

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
            :initial-business-result-id="route.query.businessResultId as string"
            :initial-version-id="route.query.versionId as string"
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

    <!-- 返回工作流悬浮按钮 -->
    <div v-if="workflowStore.workflowReturnState.active" class="return-workflow-float">
      <el-button type="warning" size="large" class="btn-return" @click="returnToWorkflow">
        <ArrowLeft :size="16" class="mr-2" />
        返回工作流
      </el-button>
    </div>
  </div>
</template>

<style scoped>
/* 主容器 */
.data-view-container {
  width: 100%;
  height: 100%;
  background: var(--c-bg-page);
  overflow: hidden;
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
  flex: 1;
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
  background: var(--c-bg-surface);
  border-radius: var(--radius-card);
  border: 1px solid var(--c-border);
  box-shadow: var(--shadow-md);
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
  background: linear-gradient(90deg, transparent, var(--c-brand-border), transparent);
}

/* 空状态内容 */
.empty-state-content {
  text-align: center;
  max-width: 400px;
  padding: var(--space-8);
}

/* 空状态图标 */
.empty-state-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-6);
  background: linear-gradient(135deg, var(--color-primary-300) 0%, var(--c-brand) 100%);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-brand);
  position: relative;
}

.empty-state-icon::before {
  content: "";
  position: absolute;
  inset: 2px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.2), transparent);
  border-radius: var(--radius-full);
  pointer-events: none;
}

.empty-state-icon span {
  font-size: var(--text-display-sm);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

/* 空状态标题 */
.empty-state-title {
  font-size: var(--text-4xl);
  font-weight: var(--font-bold);
  color: var(--c-text-base);
  margin-bottom: var(--space-4);
  letter-spacing: var(--tracking-tight);
}

/* 空状态描述 */
.empty-state-description {
  color: var(--c-text-muted);
  margin-bottom: var(--space-6);
  line-height: var(--leading-relaxed);
  font-size: var(--text-xl);
}

/* 空状态提示 */
.empty-state-tip {
  font-size: var(--text-md);
  color: var(--c-text-muted);
  background: var(--c-brand-soft);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-brand-border);
  display: inline-block;
  font-weight: var(--font-medium);
}

/* 悬停效果 */
.empty-state-container:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  transition: all var(--transition-base);
}

.empty-state-icon:hover {
  transform: scale(1.05);
  transition: transform var(--transition-base);
}

/* 返回工作流悬浮按钮 */
.return-workflow-float {
  position: absolute;
  top: var(--space-4);
  right: var(--space-6);
  z-index: var(--z-above);
  animation: slide-in var(--transition-base) cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.btn-return {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-3xl);
  font-weight: var(--font-semibold);
  border: 1px solid rgba(245, 158, 11, 0.5);
  background: linear-gradient(135deg, var(--color-amber-500) 0%, var(--color-amber-600) 100%);
  color: var(--c-text-inverse);
  padding: var(--space-2) var(--space-5);
}

.btn-return:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
