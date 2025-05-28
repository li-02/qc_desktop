<script setup lang="ts">
import {DataAnalysis} from "@element-plus/icons-vue";
import {useProjectStore} from "@/stores/useProjectStore";
import {computed} from "vue";

const projectStore = useProjectStore();
const projectName = computed(() => projectStore.currentProject?.name);
const latitude = computed(() => {
  let lat: number | string = projectStore.currentProject?.siteInfo.latitude;
  //lat 从string->number
  if (typeof lat === "string") {
    const parsedLat = parseFloat(lat);
    if (!isNaN(parsedLat)) {
      lat = parsedLat;
    } else {
      return "未知";
    }
  }
  const direction = Number(lat) >= 0 ? "N" : "S";
  return `${Math.abs(Number(lat))}° ${direction}`;
});
const longitude = computed(() => {
  let lon: number | string = projectStore.currentProject?.siteInfo.longitude;
  //lon 从string->number
  if (typeof lon === "string") {
    const parsedLon = parseFloat(lon);
    if (!isNaN(parsedLon)) {
      lon = parsedLon;
    } else {
      return "未知";
    }
  }
  const direction = Number(lon) >= 0 ? "E" : "W";
  return `${Math.abs(Number(lon))}° ${direction}`;
});
const altitude = computed(() => projectStore.currentProject?.siteInfo.altitude || 0);
const datasetCount = computed(() => projectStore.currentProject?.datasets.length || 0);
</script>

<template>
  <div class="flex items-center justify-between !m-2">
    <!-- 左侧项目名 地理信息 -->
    <div class="flex items-center gap-4">
      <div
        class="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
        <el-icon class="text-white text-xl">
          <DataAnalysis />
        </el-icon>
      </div>
      <div>
        <h1 class="text-xl font-bold text-gray-800">{{ projectName }}</h1>
        <p class="text-sm text-gray-600">经纬度: {{ longitude }}, {{ latitude }} 海拔: {{ altitude }}米</p>
      </div>
    </div>
    <!-- 右侧项目下数据集个数-->
    <div class="flex items-center gap-6 text-sm">
      <div class="text-center">
        <div class="text-lg font-semibold text-blue-600">{{ datasetCount }}</div>
        <div class="text-gray-600">数据集</div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
