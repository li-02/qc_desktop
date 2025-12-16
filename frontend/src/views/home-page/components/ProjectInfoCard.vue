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
        <p class="project-meta">
          经纬度: {{ longitude }}, {{ latitude }} &nbsp;|&nbsp; 海拔: {{ altitude }}米
        </p>
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
  margin: 8px;
  padding: 20px;
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 30%,
    rgba(240, 253, 244, 0.85) 70%,
    rgba(236, 253, 245, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
  position: relative;
  overflow: hidden;
}

.project-info-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.02) 0%, transparent 50%);
  pointer-events: none;
}

.left-section {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  z-index: 10;
}

.project-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.icon {
  color: white;
  font-size: 24px;
}

.project-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-name {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

.project-meta {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 24px;
  position: relative;
  z-index: 10;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #059669; /* Emerald-600 */
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
}
</style>
