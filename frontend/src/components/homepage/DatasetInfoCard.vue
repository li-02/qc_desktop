<script setup lang="ts">
import {ElMessage} from "element-plus";
import {computed, ref} from "vue";
import {useProjectStore} from "@/stores/useProjectStore";

const projectStore = useProjectStore();
const datasets = computed(() => projectStore.currentProject?.datasets || []);

const selectDataset = (dataset: any) => {
  ElMessage.info(`选择了数据集: ${dataset.name}`);
  // 这里可以设置当前数据集到store
};

const getColorClasses = (color: string) => {
  const colorMap: Record<string, {bg: string; text: string}> = {
    flux: {bg: "bg-blue-100", text: "!text-blue-600"},
    micrometeorology: {bg: "bg-orange-100", text: "!text-orange-600"},
    aqi: {bg: "bg-purple-100", text: "!text-purple-600"},
    sapflow: {bg: "bg-green-100", text: "!text-green-600"},
    red: {bg: "bg-red-100", text: "!text-red-600"},
  };
  return colorMap[color] || {bg: "bg-gray-50", text: "!text-gray-600"};
};
const getIconName = (type: string) => {
  const iconMap: Record<string, string> = {
    flux: "Odometer",
    micrometeorology: "Cloudy",
    aqi: "Flag",
    sapflow: "Histogram",
    emerald: "IconEmerald",
  };
  return iconMap[type] || "IconDefault";
};
const getIconColor = (type: string) => {
  const colors: Record<string, string> = {
    emerald: "!text-emerald-600 !important",
    flux: "!text-blue-600 !important",
    sapflow: "!text-green-600 !important",
    aqi: "!text-purple-600 !important",
    micrometeorology: "!text-orange-600 !important",
  };
  return colors[type] || "!text-gray-600 !important";
};
</script>
<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                getIconColor(dataset.type),
              ]">
              <el-icon size="24">
                <component :is="getIconName(dataset.type)" />
              </el-icon>
            </div>
          </div>
          <div class="flex-1 flex flex-col h-full">
            <!--dataset info-->
            <div class="flex items-center flex-[2]">
              <h3 class="font-semibold text-lg text-gray-800">{{ dataset.name }}</h3>
              <el-tag :color="getIconColor(dataset.type)" class="!ml-1">{{ dataset.type }}</el-tag>
            </div>
            <!-- <div class="flex flex-[1] justify-between items-center !mr-2">
              <p class="text-sm text-gray-500 truncate">{{ dataset.originalFile }}</p>
            </div> -->
          </div>
        </div>
      </div>
      <!-- 添加数据集区域 -->
      <!-- <div
              class="w-full items-center border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-green-300 hover:bg-green-50/30 transition-all cursor-pointer group"
              @click="handleImportData">
              <div
                class="w-11 h-11 bg-green-100 rounded-full flex items-center justify-center !mx-auto !mt-1 group-hover:scale-110 transition-transform">
                <el-icon class="text-green-600" :size="20">
                  <Plus />
                </el-icon>
              </div>
              <h3 class="font-medium text-gray-800 mb-1">添加新数据集</h3>
              <p class="text-sm text-gray-500">支持 CSV、Excel 格式</p>
            </div> -->
    </div>
  </div>
</template>
