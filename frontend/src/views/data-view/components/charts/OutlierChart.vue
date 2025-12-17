<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import * as echarts from "echarts";
import { useResizeObserver } from "@vueuse/core";
import type { OutlierDetail } from "@shared/types/database";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import { ElMessage } from "element-plus";

interface Props {
  summary: {
    columnResults: Array<{
      columnName: string;
      outlierCount: number;
      minThreshold?: number | null;
      maxThreshold?: number | null;
    }>;
  } | null;
  details: OutlierDetail[];
  loading?: boolean;
  filePath?: string;
  showSummaryChart?: boolean;
  showDetailChart?: boolean;
  modelValue?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  showSummaryChart: true,
  showDetailChart: true
});

const emit = defineEmits(['update:modelValue']);

const chartRef = ref<HTMLElement | null>(null);
const detailChartRef = ref<HTMLElement | null>(null);
let barChart: echarts.ECharts | null = null;
let detailChart: echarts.ECharts | null = null;

const localSelectedColumn = ref<string>("");
const selectedColumn = computed({
  get: () => props.modelValue !== undefined ? props.modelValue : localSelectedColumn.value,
  set: (val) => {
    localSelectedColumn.value = val;
    emit('update:modelValue', val);
  }
});

const chartType = ref<"scatter" | "box" | "histogram">("scatter");
const fullColumnData = ref<number[]>([]);
const isFetchingData = ref(false);

const availableColumns = computed(() => {
  if (props.summary?.columnResults) {
    return props.summary.columnResults.map(c => c.columnName);
  }
  if (!props.details || props.details.length === 0) return [];
  const cols = new Set(props.details.map(d => d.column_name || (d as any).columnName || 'Unknown'));
  return Array.from(cols);
});

// 获取当前列的阈值信息
const currentThresholds = computed(() => {
  if (!props.summary?.columnResults || !selectedColumn.value) return null;
  return props.summary.columnResults.find(c => c.columnName === selectedColumn.value);
});

// 初始化柱状图
const initBarChart = () => {
  if (!chartRef.value || !props.summary) return;

  const existingInstance = echarts.getInstanceByDom(chartRef.value);
  if (existingInstance) {
    barChart = existingInstance;
  } else {
    // 如果 barChart 变量指向了旧的实例（DOM已销毁），先销毁它
    if (barChart) {
      barChart.dispose();
    }
    barChart = echarts.init(chartRef.value);
    
    // 绑定事件
    barChart.on('click', (params) => {
      if (params.name) {
        selectedColumn.value = params.name;
      }
    });
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

// 获取全量数据
const fetchFullColumnData = async () => {
  if (!props.filePath || !selectedColumn.value) return;
  
  isFetchingData.value = true;
  fullColumnData.value = [];
  
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.FILES.READ_CSV_DATA, {
      filePath: props.filePath,
      columnName: selectedColumn.value,
    });

    if (result.success && result.data?.tableData) {
      // 提取数值
      fullColumnData.value = result.data.tableData
        .map((row: any) => {
          const val = row[selectedColumn.value];
          return (val !== null && val !== undefined && val !== '') ? Number(val) : NaN;
        })
        .filter((val: number) => !isNaN(val));
    }
  } catch (error) {
    console.error("获取全量数据失败:", error);
    ElMessage.error("获取列数据失败，部分图表无法显示");
  } finally {
    isFetchingData.value = false;
  }
};

// 确保 detailChart 实例正确初始化
const ensureDetailChart = () => {
  if (!detailChartRef.value) return false;
  
  const existingInstance = echarts.getInstanceByDom(detailChartRef.value);
  if (existingInstance) {
    detailChart = existingInstance;
  } else {
    if (detailChart) {
      detailChart.dispose();
    }
    detailChart = echarts.init(detailChartRef.value);
  }
  return true;
};

// 初始化散点图
const initScatterChart = () => {
  if (!ensureDetailChart()) return;
  if (!detailChart) return;
  
  detailChart.clear();

  // 检查是否有时间数据
  const hasTimeData = props.details.length > 0 && !!props.details[0].time_point;
  
  // 过滤当前选中列的数据
  const currentDetails = props.details.filter(d => 
    (d.column_name || (d as any).columnName) === selectedColumn.value
  );

  const seriesData: any[] = [];
  
  const colData = currentDetails.map(d => [hasTimeData ? d.time_point : d.row_index, d.original_value]);

  seriesData.push({
    name: '异常点',
    type: 'scatter',
    symbolSize: 8,
    data: colData,
    itemStyle: {
      color: '#ef4444',
      opacity: 0.8
    },
    markLine: {
      symbol: ['none', 'none'],
      label: { show: true },
      data: [
        ...(currentThresholds.value?.minThreshold !== undefined && currentThresholds.value?.minThreshold !== null ? [{
          yAxis: currentThresholds.value.minThreshold,
          name: '下限阈值',
          lineStyle: { color: '#f59e0b', type: 'dashed' }
        }] : []),
        ...(currentThresholds.value?.maxThreshold !== undefined && currentThresholds.value?.maxThreshold !== null ? [{
          yAxis: currentThresholds.value.maxThreshold,
          name: '上限阈值',
          lineStyle: { color: '#f59e0b', type: 'dashed' }
        }] : [])
      ]
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
      scale: true,
      splitLine: { show: false },
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280' }
    },
    yAxis: {
      type: 'value',
      name: '数值',
      scale: true,
      splitLine: {
        lineStyle: { type: 'dashed', color: '#f3f4f6' }
      },
      axisLabel: { color: '#6b7280' }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, bottom: 10 }
    ],
    series: seriesData
  };

  detailChart.setOption(option);
};

// 初始化箱线图
const initBoxPlot = () => {
  if (fullColumnData.value.length === 0) return;
  if (!ensureDetailChart()) return;
  if (!detailChart) return;
  
  detailChart.clear();

  // 手动计算五数概括
  const sorted = [...fullColumnData.value].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  
  const option: echarts.EChartsOption = {
    title: {
      text: '数据分布箱线图',
      left: 'center',
      textStyle: { fontSize: 14, color: '#6b7280' }
    },
    tooltip: {
      trigger: 'item',
      confine: true
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '15%'
    },
    xAxis: {
      type: 'category',
      data: [selectedColumn.value],
      boundaryGap: true,
      nameGap: 30,
      splitArea: {
        show: false
      },
      axisLabel: {
        formatter: '{value}'
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: '数值',
      splitArea: {
        show: true
      }
    },
    series: [
      {
        name: 'BoxPlot',
        type: 'boxplot',
        data: [[min, q1, median, q3, max]],
        tooltip: {
            formatter: (param: any) => {
                return [
                    '变量: ' + param.name,
                    '最大值: ' + param.data[5],
                    '上四分位数 (Q3): ' + param.data[4],
                    '中位数: ' + param.data[3],
                    '下四分位数 (Q1): ' + param.data[2],
                    '最小值: ' + param.data[1]
                ].join('<br/>');
            }
        }
      }
    ]
  };

  // 添加阈值线
  const markLineData = [];
  if (currentThresholds.value?.minThreshold != null) {
      markLineData.push({ yAxis: currentThresholds.value.minThreshold, name: '下限', lineStyle: { color: '#f59e0b' } });
  }
  if (currentThresholds.value?.maxThreshold != null) {
      markLineData.push({ yAxis: currentThresholds.value.maxThreshold, name: '上限', lineStyle: { color: '#f59e0b' } });
  }
  
  if (markLineData.length > 0) {
      (option.series as any)[0].markLine = {
          data: markLineData,
          symbol: ['none', 'none']
      };
  }

  detailChart.setOption(option);
};

// 初始化直方图
const initHistogram = () => {
  if (fullColumnData.value.length === 0) return;
  if (!ensureDetailChart()) return;
  if (!detailChart) return;
  
  detailChart.clear();

  const data = fullColumnData.value;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const binCount = Math.min(Math.ceil(Math.sqrt(data.length)), 50); // 最多50个箱子
  const binWidth = (max - min) / binCount;

  const bins = new Array(binCount).fill(0);
  // 简单的直方图统计
  data.forEach(v => {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      bins[idx]++;
  });

  const histogramData = bins.map((count, i) => [min + i * binWidth + binWidth/2, count]);
  
  const option: echarts.EChartsOption = {
      title: {
        text: '数据分布直方图',
        left: 'center',
        textStyle: { fontSize: 14, color: '#6b7280' }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
            const p = params[0];
            const val = p.value[0];
            const halfWidth = binWidth / 2;
            return `区间: [${(val - halfWidth).toFixed(2)}, ${(val + halfWidth).toFixed(2)})<br/>频数: ${p.value[1]}`;
        }
      },
      grid: { left: '10%', right: '10%', bottom: '15%' },
      xAxis: {
          type: 'value',
          min: min,
          max: max,
          scale: true
      },
      yAxis: { type: 'value', name: '频数' },
      series: [{
          type: 'bar',
          barWidth: '95%',
          data: histogramData,
          itemStyle: { color: '#60a5fa' },
          markLine: {
              symbol: ['none', 'none'],
              label: { position: 'end', formatter: '{b}: {c}' },
              data: [
                  ...(currentThresholds.value?.minThreshold != null ? [{ xAxis: currentThresholds.value.minThreshold, name: '下限', lineStyle: { color: '#ef4444', type: 'solid' as const, width: 2 } }] : []),
                  ...(currentThresholds.value?.maxThreshold != null ? [{ xAxis: currentThresholds.value.maxThreshold, name: '上限', lineStyle: { color: '#ef4444', type: 'solid' as const, width: 2 } }] : [])
              ]
          }
      }]
  };

  detailChart.setOption(option);
};

const updateDetailChart = async () => {
    if (!selectedColumn.value) return;
    
    // 如果是箱线图或直方图，需要全量数据
    if (chartType.value === 'box' || chartType.value === 'histogram') {
        if (fullColumnData.value.length === 0 || !isFullDataCurrentColumn()) {
            await fetchFullColumnData();
        }
        
        if (chartType.value === 'box') initBoxPlot();
        else initHistogram();
    } else {
        // 散点图
        initScatterChart();
    }
};

const isFullDataCurrentColumn = () => {
    // 简单判断：如果fullColumnData不为空，假设它是当前列的（因为切换列会清空）
    return fullColumnData.value.length > 0;
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
    // 更新详情图表
    updateDetailChart();
  }
}, { deep: true });

// 监听选中列变化
watch(selectedColumn, async (newVal, oldVal) => {
    if (newVal !== oldVal) {
        fullColumnData.value = []; // 切换列时清空缓存
        await updateDetailChart();
    }
});

// 监听 DOM 元素变化，确保图表初始化
watch(chartRef, () => {
  if (chartRef.value) {
    setTimeout(initBarChart, 0);
  }
});

watch(detailChartRef, () => {
  if (detailChartRef.value) {
    setTimeout(updateDetailChart, 0);
  }
});

// 监听图表类型变化
watch(chartType, async () => {
    await updateDetailChart();
});

// 响应式调整
useResizeObserver(chartRef, () => barChart?.resize());
useResizeObserver(detailChartRef, () => detailChart?.resize());

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
    <div v-if="(showSummaryChart !== false) && summary" class="chart-card">
      <div class="chart-header">
        <h4 class="chart-title">异常分布统计</h4>
        <span class="chart-subtitle">各变量异常值数量对比</span>
      </div>
      <div ref="chartRef" class="chart-body"></div>
    </div>
    
    <div v-if="(showDetailChart !== false) && details.length > 0" class="chart-card">
      <div class="chart-header">
        <div>
          <h4 class="chart-title">异常分析视图</h4>
          <span class="chart-subtitle">
             <template v-if="chartType === 'scatter'">异常点分布视图</template>
             <template v-else-if="chartType === 'box'">数据分布箱线图 (含异常)</template>
             <template v-else-if="chartType === 'histogram'">数据分布直方图</template>
          </span>
        </div>
        <div class="chart-actions">
           <el-radio-group v-model="chartType" size="small" style="margin-right: 12px">
             <el-radio-button label="scatter">散点图</el-radio-button>
             <el-radio-button label="box">箱线图</el-radio-button>
             <el-radio-button label="histogram">直方图</el-radio-button>
           </el-radio-group>
           
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
               :disabled="isFetchingData"
             />
           </el-select>
        </div>
      </div>
      
      <div class="chart-content-wrapper">
          <div v-if="isFetchingData" class="chart-loading-overlay">
             <div class="loading-spinner"></div>
             <span>加载全量数据中...</span>
          </div>
          <div ref="detailChartRef" class="chart-body"></div>
      </div>
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

.chart-content-wrapper {
  position: relative;
  flex: 1;
}

.chart-body {
  height: 300px;
  width: 100%;
}

.chart-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
  font-size: 12px;
  color: #6b7280;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .charts-container {
    grid-template-columns: 1fr;
  }
}
</style>
