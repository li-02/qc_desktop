<script setup lang="ts">
import { DataAnalysis } from "@element-plus/icons-vue";
import { useProjectStore } from "@/stores/useProjectStore";
import { computed } from "vue";

const projectStore = useProjectStore();
const projectName = computed(() => projectStore.currentProject?.name);
const latitude = computed(() => {
  if (!projectStore.currentProject) return "未知";
  let lat: number | string = projectStore.currentProject.siteInfo.latitude;
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
  if (!projectStore.currentProject) return "未知";
  let lon: number | string = projectStore.currentProject.siteInfo.longitude;
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
  <div class="project-info-card">
    <!-- 左侧项目名 地理信息 -->
    <div class="left-section">
      <div class="project-icon">
        <el-icon class="icon">
          <DataAnalysis />
        </el-icon>
      </div>
      <div class="project-details">
        <h1 class="project-name">{{ projectName }}</h1>
        <p class="project-meta">经纬度: {{ longitude }}, {{ latitude }} &nbsp;|&nbsp; 海拔: {{ altitude }}米</p>
      </div>
    </div>

    <!-- 右侧项目下数据集个数-->
    <div class="right-section">
      <div class="stat-item">
        <div class="stat-value">{{ datasetCount }}</div>
        <div class="stat-label">数据集</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-info-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 16px 0;
  padding: 12px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.left-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-icon {
  width: 40px;
  height: 40px;
  background: #d1fae5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon {
  color: #047857;
  font-size: 20px;
}

.project-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-name {
  font-size: 17px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.project-meta {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #10b981;
}

.stat-label {
  font-size: 11px;
  color: #64748b;
}
</style>
