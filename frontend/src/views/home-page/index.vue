<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  DataAnalysis,
  Upload,
  Plus,
  View,
  TrendCharts,
  ArrowRight,
  Document,
  Histogram,
} from "@element-plus/icons-vue";
import { useProjectStore } from "@/stores/useProjectStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import emitter from "@/utils/eventBus";
import ProjectInfoCard from "../../components/homepage/ProjectInfoCard.vue";
import DatasetInfoCard from "../../components/homepage/DatasetInfoCard.vue";
const router = useRouter();
const projectStore = useProjectStore();
const datasetStore = useDatasetStore();

// 项目基本信息
const projectInfo = ref({
  name: "密云水库生态监测站",
  coordinates: "116.8°E, 40.3°N",
  altitude: "156m",
  establishDate: "2024-01-15",
  datasetCount: 4,
  totalRecords: "16.5k",
});

// 数据集列表
const datasets = ref([
  {
    id: 1,
    name: "通量数据",
    fileName: "CO2_flux_2024.csv",
    iconName: "Odometer",
    records: "8.7k",
    status: "complete",
    color: "emerald",
    lastUpdate: "2小时前",
  },
  {
    id: 2,
    name: "微气象数据",
    fileName: "weather_2024.xlsx",
    iconName: "Cloudy",
    records: "4.4k",
    status: "warning",
    color: "blue",
    lastUpdate: "1天前",
  },
  {
    id: 3,
    name: "茎流数据",
    fileName: "sapflow_spring.csv",
    iconName: "Histogram",
    records: "2.2k",
    status: "error",
    color: "green",
    lastUpdate: "3天前",
  },
  {
    id: 4,
    name: "空气质量数据",
    fileName: "AQI_monitoring.csv",
    iconName: "Flag",
    records: "1.2k",
    status: "complete",
    color: "purple",
    lastUpdate: "5天前",
  },
]);

// 数据处理步骤
const processSteps = ref([
  {
    iconName: "Histogram",
    title: "数据视图",
    desc: "浏览和探索数据，了解数据基本情况",
    color: "blue",
    route: "/data-view",
  },
  {
    iconName: "WarnTriangleFilled",
    title: "异常值检测",
    desc: "识别和处理数据中的异常值",
    color: "orange",
    route: "/outlier-detection",
  },
  {
    iconName: "HelpFilled",
    title: "缺失值插补",
    desc: "修复和填补数据中的缺失值",
    color: "purple",
    route: "/missing-value-imputation",
  },
]);
const getColorClasses = (color: string) => {
  const colorMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-blue-100", text: "!text-blue-600" },
    orange: { bg: "bg-orange-100", text: "!text-orange-600" },
    purple: { bg: "bg-purple-100", text: "!text-purple-600" },
    green: { bg: "bg-green-100", text: "!text-green-600" },
    red: { bg: "bg-red-100", text: "!text-red-600" },
  };
  return colorMap[color] || { bg: "bg-gray-50", text: "!text-gray-600" };
};
const getIconColor = (color: string) => {
  const colors: Record<string, string> = {
    emerald: "!text-emerald-600 !important",
    blue: "!text-blue-600 !important",
    green: "!text-green-600 !important",
    purple: "!text-purple-600 !important",
    orange: "!text-orange-600 !important",
  };
  return colors[color] || "!text-gray-600 !important";
};

// 事件处理
const handleImportData = () => {
  emitter.emit("open-import-data-dialog");
};

const selectDataset = (dataset: any) => {
  ElMessage.info(`选择了数据集: ${dataset.name}`);
  // 这里可以设置当前数据集到store
};

const viewDataset = (dataset: any) => {
  ElMessage.info(`查看数据集: ${dataset.name}`);
  router.push(`/data-view?dataset=${dataset.id}`);
};

const processDataset = (dataset: any) => {
  ElMessage.info(`处理数据集: ${dataset.name}`);
  router.push(`/data-processing?dataset=${dataset.id}`);
};

const navigateToStep = (route: string) => {
  router.push(route);
};

const quickViewData = () => {
  if (datasets.value.length > 0) {
    viewDataset(datasets.value[0]);
  } else {
    ElMessage.warning("请先导入数据集");
  }
};

const showGuide = () => {
  ElMessage.info("打开使用指南");
  // 这里可以打开帮助文档或引导页面
};

// 初始化数据
onMounted(() => {
  // 从store加载实际的项目和数据集信息
  if (projectStore.currentProject) {
    projectInfo.value.name = projectStore.currentProject.name;
    projectInfo.value.datasetCount = projectStore.currentProject.datasets?.length || 0;
  }
});
</script>

<template>
  <div class="h-full bg-gradient-to-br from-slate-50 to-green-50 flex flex-col overflow-hidden">
    <!-- 顶部项目信息 -->
    <ProjectInfoCard />

    <!-- 主内容区域 -->
    <div class="flex-1 flex gap-6 p-6 overflow-hidden">
      <!-- 左侧：数据集管理-->
      <div class="w-1/2 flex flex-col !ml-2">
        <!-- label + button -->
        <div class="flex items-center justify-between !mb-2">
          <h2 class="text-lg font-semibold text-gray-800">数据集管理</h2>
          <el-button
            type="primary"
            class="bg-green-600 hover:bg-green-700 border-green-600 hover:border-green-700 shadow-md hover:shadow-lg">
            <el-icon class="mr-2">
              <Upload />
            </el-icon>
            导入新数据
          </el-button>
        </div>
        <!-- dataset list -->
        <!-- <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="p-4 space-y-3 h-full overflow-y-auto">
            <div
              v-for="dataset in datasets"
              :key="dataset.id"
              class="h-20 group border border-gray-100 rounded-xl p-4 !m-1 hover:shadow-md transition-all duration-200 hover:border-green-200 cursor-pointer"
              @click="selectDataset(dataset.id)">
              <div class="flex h-full">
                <div class="flex items-center mr-4 !mx-2">
                  <div
                    :class="[
                      'p-2.5 rounded-lg bg-gray-50 group-hover:scale-110 transition-transform',
                      getIconColor(dataset.color),
                    ]">
                    <el-icon size="24">
                      <component :is="dataset.iconName" />
                    </el-icon>
                  </div>
                </div>
                <div class="flex-1 flex flex-col h-full">
                  <div class="flex items-center flex-[2]">
                    <h3 class="font-semibold text-lg text-gray-800">{{ dataset.name }}</h3>
                  </div>
                  <div class="flex flex-[1] justify-between items-center !mr-2">
                    <p class="text-sm text-gray-500 truncate">{{ dataset.fileName }}</p>
                    <span class="text-sm text-gray-600">
                      记录数: <span class="font-xs">{{ dataset.records }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div> -->
        <DatasetInfoCard />
      </div>
      <!-- 右侧：数据处理工作流 -->
      <div class="w-1/2 flex flex-col !mr-2">
        <div class="items-center !mb-2">
          <h2 class="text-lg font-semibold text-gray-800">数据处理工作流</h2>
        </div>

        <!-- 数据处理流程 -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="space-y-4">
            <!--step-->
            <div v-for="(step, index) in processSteps" :key="index" class="group h-20 flex items-center">
              <button
                class="w-full h-full flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-all text-left border border-gray-100 hover:border-green-200 hover:shadow-md"
                @click="navigateToStep(step.route)">
                <div
                  :class="[
                    'w-12 h-12 rounded-xl !ml-2 flex items-center justify-center group-hover:scale-110 transition-transform',
                    getColorClasses(step.color).bg,
                  ]">
                  <el-icon :class="['text-lg', getColorClasses(step.color).text]">
                    <Histogram v-if="step.iconName === 'Histogram'" />
                    <WarnTriangleFilled v-else-if="step.iconName === 'WarnTriangleFilled'" />
                    <HelpFilled v-else-if="step.iconName === 'HelpFilled'" />
                  </el-icon>
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-800 mb-1">{{ step.title }}</h4>
                  <p class="text-sm text-gray-600">{{ step.desc }}</p>
                </div>
                <el-icon
                  class="!text-gray-400 !mr-3 group-hover:text-green-600 group-hover:translate-x-1 transition-all">
                  <ArrowRight />
                </el-icon>
              </button>
              <div v-if="index < processSteps.length - 1" class="flex justify-center my-2">
                <div class="w-px h-4 bg-gray-200"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 快速开始提示 -->
        <div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
              <el-icon class="text-white text-lg">
                <TrendCharts />
              </el-icon>
            </div>
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">开始数据分析</h3>
              <p class="text-sm text-gray-700 mb-4">
                选择一个数据集开始分析，或导入新的数据文件。建议先查看数据概况，然后根据需要进行异常值检测和缺失值处理。
              </p>
              <div class="flex gap-3">
                <el-button
                  type="primary"
                  @click="quickViewData"
                  class="bg-green-600 hover:bg-green-700 border-green-600 hover:border-green-700">
                  <el-icon class="mr-1">
                    <View />
                  </el-icon>
                  查看数据
                </el-button>
                <el-button @click="showGuide" class="border-green-600 text-green-600 hover:bg-green-50">
                  <el-icon class="mr-1">
                    <Document />
                  </el-icon>
                  使用指南
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Element Plus 组件样式覆盖 */
:deep(.el-button--primary) {
  background-color: #059669;
  border-color: #059669;
}

:deep(.el-button--primary:hover) {
  background-color: #047857;
  border-color: #047857;
}

:deep(.el-tag--success) {
  background-color: #d1fae5;
  color: #065f46;
  border: none;
}

:deep(.el-tag--warning) {
  background-color: #fef3c7;
  color: #92400e;
  border: none;
}

:deep(.el-tag--danger) {
  background-color: #fecaca;
  color: #991b1b;
  border: none;
}

/* 自定义滚动条 */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
