<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import {ElMessage} from "element-plus";
import {useDatasetStore} from "@/stores/useDatasetStore";
import DatasetCard from "@/components/dataview/DatasetCard.vue";
import DataAnalysisTabs from "@/components/dataview/DataAnalysisTabs.vue";
import QuickOperation from "@/components/dataview/QuickOperation.vue";

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
  <div class="min-h-screen bg-gradient-to-br from-stone-50 to-emerald-50/30 p-6">
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- 数据集信息卡片 -->
      <DatasetCard @refresh="refreshDatasetInfo" @export="handleExportData" />

      <!-- 主要功能区域 -->
      <div v-if="hasDataset" class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <!-- 数据分析选项卡 (占2/3宽度) -->
        <div class="xl:col-span-2">
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

        <!-- 快速操作面板 (占1/3宽度) -->
        <div class="xl:col-span-1">
          <QuickOperation
            :dataset-info="currentDataset"
            @start-outlier-detection="handleStartOutlierDetection"
            @start-missing-value-imputation="handleStartMissingValueImputation"
            @start-data-cleaning="handleStartDataCleaning"
            @generate-report="handleExportData"
            @export-data="handleExportData" />
        </div>
      </div>

      <!-- 无数据集时的空状态 -->
      <div
        v-else
        class="flex flex-col items-center justify-center h-96 bg-white rounded-xl shadow-sm border border-gray-100">
        <div class="text-center max-w-md">
          <div class="w-20 h-20 mx-auto mb-6 bg-emerald-100 rounded-full flex items-center justify-center">
            <span class="text-3xl">📊</span>
          </div>
          <h3 class="text-xl font-semibold text-gray-800 mb-3">开始数据分析</h3>
          <p class="text-gray-600 mb-6">
            请从左侧导航栏选择一个数据集，开始您的数据分析之旅。 我们为您提供了全面的数据探索和处理工具。
          </p>
          <div class="text-sm text-gray-500">💡 支持异常值检测、缺失值处理、数据清洗等功能</div>
        </div>
      </div>
    </div>
  </div>
</template>
