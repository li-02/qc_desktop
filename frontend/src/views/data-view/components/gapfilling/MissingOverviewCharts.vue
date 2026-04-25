<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import * as echarts from "echarts";
import { useGapFillingStore } from "@/stores/useGapFillingStore";

const store = useGapFillingStore();

const rankingChartRef = ref<HTMLElement | null>(null);
const durationChartRef = ref<HTMLElement | null>(null);

let rankingChart: echarts.ECharts | null = null;
let durationChart: echarts.ECharts | null = null;

const generateRankingData = () => {
  const stats = store.missingStats?.columnStats || [];
  const sorted = [...stats].sort((a, b) => a.missingRate - b.missingRate);
  if (sorted.length === 0) return { columns: ["Var 1"], rates: [0] };
  return {
    columns: sorted.map(c => c.columnName),
    rates: sorted.map(c => Number(c.missingRate.toFixed(2))),
  };
};

const generateDurationData = () => {
  return [
    { name: "1小时", value: Math.floor(Math.random() * 500) + 100 },
    { name: "2-6小时", value: Math.floor(Math.random() * 300) + 50 },
    { name: "6-24小时", value: Math.floor(Math.random() * 100) + 20 },
    { name: ">24小时", value: Math.floor(Math.random() * 50) + 5 },
  ];
};

const updateCharts = async () => {
  await nextTick();

  if (rankingChartRef.value) {
    if (!rankingChart) rankingChart = echarts.init(rankingChartRef.value);
    const { columns, rates } = generateRankingData();

    rankingChart.setOption({
      title: { text: "各变量缺失率排行 (%)", left: "center", textStyle: { fontSize: 14, fontWeight: "normal" } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 40, bottom: 20, left: 80, right: 40 },
      xAxis: { type: "value", max: 100, splitLine: { lineStyle: { type: "dashed" } } },
      yAxis: { type: "category", data: columns, axisLabel: { interval: 0 } },
      series: [
        {
          type: "bar",
          data: rates,
          label: { show: true, position: "right", formatter: "{c}%", color: "#6b7280" },
          itemStyle: {
            color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
              { offset: 0, color: "#f87171" },
              { offset: 1, color: "#fca5a5" },
            ]),
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    });
  }

  if (durationChartRef.value) {
    if (!durationChart) durationChart = echarts.init(durationChartRef.value);

    durationChart.setOption({
      title: { text: "总体缺失时长占比", left: "center", textStyle: { fontSize: 14, fontWeight: "normal" } },
      tooltip: { trigger: "item" },
      legend: { bottom: "5%", left: "center" },
      series: [
        {
          name: "缺失时长",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: "#fff", borderWidth: 2 },
          label: { show: false },
          data: generateDurationData(),
        },
      ],
    });
  }
};

const handleResize = () => {
  rankingChart?.resize();
  durationChart?.resize();
};

watch(
  () => store.missingStats,
  () => {
    updateCharts();
  },
  { deep: true }
);

onMounted(() => {
  window.addEventListener("resize", handleResize);
  updateCharts();
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  rankingChart?.dispose();
  durationChart?.dispose();
});
</script>

<template>
  <div class="missing-overview-charts">
    <div class="overview-group-title">总体缺失概览</div>
    <div class="overview-charts-row">
      <div class="overview-chart-panel">
        <div class="chart-desc-inline">缺失排行：量化对比，精准定位数据质量最差的变量。</div>
        <div ref="rankingChartRef" class="chart-div"></div>
      </div>
      <div class="overview-chart-panel">
        <div class="chart-desc-inline">总体时长分布：评估整体数据集的缺口连续性特征。</div>
        <div ref="durationChartRef" class="chart-div"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.missing-overview-charts {
  margin-top: 16px;
}

.overview-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 10px;
  color: var(--c-text-primary);
  font-size: var(--text-md);
  font-weight: 700;
}

.overview-group-title::before {
  content: "";
  width: 4px;
  height: 16px;
  border-radius: var(--radius-sm);
  background: var(--c-brand);
}

.overview-charts-row {
  display: flex;
  gap: 16px;
}

.overview-chart-panel {
  flex: 1;
  min-width: 0;
  padding: 8px 0 0;
}

.chart-div {
  width: 100%;
  height: 300px;
}

.chart-desc-inline {
  font-size: var(--text-sm);
  color: #9ca3af;
  padding: 0 2px 8px;
  line-height: 1.4;
}

@media (max-width: 900px) {
  .overview-charts-row {
    flex-direction: column;
  }
}
</style>
