<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import * as echarts from "echarts";
import { useResizeObserver } from "@vueuse/core";
import type { OutlierDetail } from "@shared/types/database";

const props = defineProps<{
  summary: {
    columnResults: Array<{
      columnName: string;
      outlierCount: number;
    }>;
  } | null;
  details: OutlierDetail[];
  loading?: boolean;
}>();

const chartRef = ref<HTMLElement | null>(null);
const scatterChartRef = ref<HTMLElement | null>(null);
let barChart: echarts.ECharts | null = null;
let scatterChart: echarts.ECharts | null = null;

const selectedColumn = ref<string>("");

const availableColumns = computed(() => {
  if (!props.details || props.details.length === 0) return [];
  const cols = new Set(props.details.map(d => d.column_name || (d as any).columnName || 'Unknown'));
  return Array.from(cols);
});

// 初始化柱状图
const initBarChart = () => {
  if (!chartRef.value || !props.summary) return;

  if (!barChart) {
    barChart = echarts.init(chartRef.value);
  }

  const columns = props.summary.columnResults.map(c => c.columnName);
  const counts = props.summary.columnResults.map(c => c.outlierCount);

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      top: '10%',
      left: '3%',
      right: '4%',
      bottom: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: columns,
      axisLabel: {
        rotate: 45,
        interval: 0,
        color: '#6b7280'
      },
      axisLine: {
        lineStyle: { color: '#e5e7eb' }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#6b7280' },
      splitLine: {
        lineStyle: { type: 'dashed', color: '#f3f4f6' }
      }
    },
    series: [
      {
        name: '异常数量',
        type: 'bar',
        data: counts,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#f87171' },
            { offset: 1, color: '#ef4444' }
          ]),
          borderRadius: [4, 4, 0, 0]
        },
        barMaxWidth: 40
      }
    ]
  };

  barChart.setOption(option);
};

// 初始化散点图
const initScatterChart = () => {
  if (!scatterChartRef.value || !props.details.length) return;

  if (!scatterChart) {
    scatterChart = echarts.init(scatterChartRef.value);
  }

  // 检查是否有时间数据
  const hasTimeData = props.details.length > 0 && !!props.details[0].time_point;
  
  // 如果没有选中列，且有可用列，默认选中第一个
  if (!selectedColumn.value && availableColumns.value.length > 0) {
    selectedColumn.value = availableColumns.value[0];
  }

  // 过滤当前选中列的数据
  const currentDetails = props.details.filter(d => 
    (d.column_name || (d as any).columnName) === selectedColumn.value
  );

  const seriesData: any[] = [];
  
  const colData = currentDetails.map(d => [hasTimeData ? d.time_point : d.row_index, d.original_value]);

  seriesData.push({
    name: selectedColumn.value,
    type: 'scatter',
    symbolSize: 8, //稍微调大一点点
    data: colData,
    itemStyle: {
      color: '#f87171',
      opacity: 0.8
    }
  });


  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const xLabel = hasTimeData ? '时间' : '行号';
        return `${params.seriesName}<br/>${xLabel}: ${params.value[0]}<br/>值: ${params.value[1]}`;
      }
    },
    legend: {
      data: [selectedColumn.value],
      bottom: 0,
      textStyle: { color: '#6b7280' }
    },
    grid: {
      top: '10%',
      left: '5%',
      right: '5%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: hasTimeData ? 'time' : 'value',
      name: hasTimeData ? '时间' : '行号',
      nameLocation: 'middle',
      nameGap: 30,
      splitLine: { show: false },
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280' }
    },
    yAxis: {
      type: 'value',
      name: '数值',
      splitLine: {
        lineStyle: { type: 'dashed', color: '#f3f4f6' }
      },
      axisLabel: { color: '#6b7280' }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, bottom: 30 }
    ],
    series: seriesData
  };

  scatterChart.setOption(option, true); // true implies notMerge, to clear previous series
};

// 监听数据变化
watch(() => props.summary, () => {
  if (props.summary) {
    setTimeout(initBarChart, 100);
  }
}, { deep: true });

watch(() => props.details, () => {
  if (props.details.length) {
    // 数据更新时，如果没有选中或者选中不在新数据中，重置选中
    if (!selectedColumn.value || !availableColumns.value.includes(selectedColumn.value)) {
       selectedColumn.value = availableColumns.value[0] || "";
    }
    setTimeout(initScatterChart, 100);
  }
}, { deep: true });

// 监听选中列变化
watch(selectedColumn, () => {
    initScatterChart();
});

// 响应式调整
useResizeObserver(chartRef, () => barChart?.resize());
useResizeObserver(scatterChartRef, () => scatterChart?.resize());

onMounted(() => {
  if (props.summary) initBarChart();
  if (props.details.length) {
     if (!selectedColumn.value && availableColumns.value.length > 0) {
        selectedColumn.value = availableColumns.value[0];
     }
     initScatterChart();
  }
});
</script>

<template>
  <div class="charts-container">
    <div v-if="summary" class="chart-card">
      <div class="chart-header">
        <h4 class="chart-title">异常分布统计</h4>
        <span class="chart-subtitle">各变量异常值数量对比</span>
      </div>
      <div ref="chartRef" class="chart-body"></div>
    </div>
    
    <div v-if="details.length > 0" class="chart-card">
      <div class="chart-header">
        <div>
          <h4 class="chart-title">异常点分布视图</h4>
          <span class="chart-subtitle">异常值在序列中的位置分布</span>
        </div>
        <div class="chart-actions">
           <el-select 
             v-model="selectedColumn" 
             placeholder="选择指标" 
             size="small"
             style="width: 150px">
             <el-option
               v-for="col in availableColumns"
               :key="col"
               :label="col"
               :value="col"
             />
           </el-select>
        </div>
      </div>
      <div ref="scatterChartRef" class="chart-body"></div>
    </div>
  </div>
</template>

<style scoped>
.charts-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.chart-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(229, 231, 235, 0.5);
  display: flex;
  flex-direction: column;
}

.chart-header {
  margin-bottom: 16px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 4px 0;
}

.chart-subtitle {
  font-size: 12px;
  color: #6b7280;
}

.chart-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 4px 0;
}

.chart-subtitle {
  font-size: 12px;
  color: #6b7280;
}

.chart-actions {
  display: flex;
  align-items: center;
}

.chart-body {
  height: 300px;
  width: 100%;
}

@media (max-width: 768px) {
  .charts-container {
    grid-template-columns: 1fr;
  }
}
</style>
