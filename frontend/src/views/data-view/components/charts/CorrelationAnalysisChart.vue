<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from "vue";
import * as echarts from "echarts";

interface Props {
  csvData?: {
    tableData: Array<any>;
    targetColumn: string;
  } | null;
  correlationMatrix?: number[][] | null; // Added
  selectedColumns: string[];
  analysisType: "heatmap" | "scatter-matrix" | "network" | "time-lag";
  correlationMethod: "pearson" | "spearman" | "kendall";
  loading?: boolean;
  minCorrelation?: number;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  csvData: null,
  correlationMatrix: null,
  minCorrelation: 0.1,
});

const chartContainer = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;

// 相关性计算工具函数
const calculatePearsonCorrelation = (x: number[], y: number[]): number => {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
  const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
  const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
};

const calculateSpearmanCorrelation = (x: number[], y: number[]): number => {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  // 创建排序索引
  const xRanks = getRanks(x.slice(0, n));
  const yRanks = getRanks(y.slice(0, n));

  return calculatePearsonCorrelation(xRanks, yRanks);
};

const getRanks = (arr: number[]): number[] => {
  const sorted = arr.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(arr.length);

  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].index] = i + 1;
  }

  return ranks;
};

const calculateKendallCorrelation = (x: number[], y: number[]): number => {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const xDiff = x[i] - x[j];
      const yDiff = y[i] - y[j];

      if ((xDiff > 0 && yDiff > 0) || (xDiff < 0 && yDiff < 0)) {
        concordant++;
      } else if ((xDiff > 0 && yDiff < 0) || (xDiff < 0 && yDiff > 0)) {
        discordant++;
      }
    }
  }

  const denominator = Math.sqrt((concordant + discordant) * (concordant + discordant));
  return denominator === 0 ? 0 : (concordant - discordant) / denominator;
};

// 从CSV数据中提取数值数组
const extractDataFromCsv = (csvData: any, columnName: string): number[] => {
  if (!csvData || !csvData.tableData || !Array.isArray(csvData.tableData)) {
    return [];
  }

  return csvData.tableData
    .map((row: any) => {
      const value = row[columnName];
      if (value !== null && value !== undefined && !isNaN(Number(value))) {
        return Number(value);
      }
      return null;
    })
    .filter((value: number | null) => value !== null) as number[];
};

// 计算相关性矩阵
const calculateCorrelationMatrix = (): { matrix: number[][]; labels: string[] } => {
  if (props.correlationMatrix && props.correlationMatrix.length > 0) {
    return { matrix: props.correlationMatrix, labels: props.selectedColumns };
  }

  if (!props.csvData || props.selectedColumns.length < 2) {
    return { matrix: [], labels: [] };
  }

  const labels = props.selectedColumns;
  const matrix: number[][] = [];
  const dataArrays = labels.map(col => extractDataFromCsv(props.csvData, col));

  for (let i = 0; i < labels.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < labels.length; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        let correlation = 0;
        switch (props.correlationMethod) {
          case "pearson":
            correlation = calculatePearsonCorrelation(dataArrays[i], dataArrays[j]);
            break;
          case "spearman":
            correlation = calculateSpearmanCorrelation(dataArrays[i], dataArrays[j]);
            break;
          case "kendall":
            correlation = calculateKendallCorrelation(dataArrays[i], dataArrays[j]);
            break;
        }
        matrix[i][j] = correlation;
      }
    }
  }

  return { matrix, labels };
};

// 获取列的中文标签
const getColumnLabel = (columnName: string) => {
  const labelMap: Record<string, string> = {
    RH: "相对湿度(%)",
    NEE_VUT_REF: "净生态系统交换",
    TS_F_MDS_1: "土壤温度(°C)",
    SWC_F_MDS_1: "土壤含水量",
    VPD_F_MDS: "水汽压差(Pa)",
    TA_F_MDS: "空气温度(°C)",
    NETRAD: "净辐射(W/m²)",
    SW_IN_F: "短波入射辐射(W/m²)",
  };
  return labelMap[columnName] || columnName;
};

// 生成热力图配置
const getHeatmapOption = () => {
  const { matrix, labels } = calculateCorrelationMatrix();
  if (matrix.length === 0) return null;

  const data: any[] = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      data.push([i, j, matrix[i][j]]);
    }
  }

  return {
    title: {
      text: `变量相关性矩阵热力图 (${props.correlationMethod.toUpperCase()})`,
      left: "center",
      textStyle: {
        fontSize: 16,
        fontWeight: "bold",
      },
    },
    tooltip: {
      position: "top",
      formatter: (params: any) => {
        const xLabel = getColumnLabel(labels[params.value[0]]);
        const yLabel = getColumnLabel(labels[params.value[1]]);
        const correlation = params.value[2];
        return `${xLabel} vs ${yLabel}<br/>相关系数: ${correlation.toFixed(3)}`;
      },
    },
    toolbox: {
      show: true,
      right: "20px",
      top: "60px",
      feature: {
        saveAsImage: {
          title: "保存为图片",
          type: "png",
          backgroundColor: "#fff",
        },
        restore: {
          title: "还原",
        },
      },
    },
    grid: {
      height: "70%",
      top: "15%",
      left: "15%",
      right: "15%",
    },
    xAxis: {
      type: "category",
      data: labels.map(getColumnLabel),
      splitArea: {
        show: true,
      },
      axisLabel: {
        rotate: 45,
        fontSize: 10,
      },
    },
    yAxis: {
      type: "category",
      data: labels.map(getColumnLabel),
      splitArea: {
        show: true,
      },
      axisLabel: {
        fontSize: 10,
      },
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "8%",
      inRange: {
        color: [
          "#313695",
          "#4575b4",
          "#74add1",
          "#abd9e9",
          "#e0f3f8",
          "#fee090",
          "#fdae61",
          "#f46d43",
          "#d73027",
          "#a50026",
        ],
      },
      text: ["强正相关", "强负相关"],
      textStyle: {
        fontSize: 12,
      },
    },
    series: [
      {
        name: "相关系数",
        type: "heatmap",
        data: data,
        label: {
          show: true,
          fontSize: 10,
          formatter: (params: any) => params.value[2].toFixed(2),
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };
};

// 生成散点图矩阵配置
const getScatterMatrixOption = () => {
  if (!props.csvData || props.selectedColumns.length < 2) return null;

  const columns = props.selectedColumns.slice(0, 6); // 调整为最多6个变量以适应更多指标
  const dataArrays = columns.map(col => extractDataFromCsv(props.csvData, col));
  const series: any[] = [];

  for (let i = 0; i < columns.length; i++) {
    for (let j = 0; j < columns.length; j++) {
      if (i !== j) {
        const scatterData = dataArrays[i]
          .map((value, index) => {
            if (index < dataArrays[j].length) {
              return [value, dataArrays[j][index]];
            }
            return null;
          })
          .filter(item => item !== null);

        series.push({
          name: `${getColumnLabel(columns[i])} vs ${getColumnLabel(columns[j])}`,
          type: "scatter",
          xAxisIndex: j,
          yAxisIndex: i,
          data: scatterData,
          symbolSize: 4,
          itemStyle: {
            color: "#10b981",
            opacity: 0.6,
          },
        });
      }
    }
  }

  const xAxes = columns.map((col, index) => ({
    type: "value",
    gridIndex: index,
    name: getColumnLabel(col),
    nameLocation: "middle",
    nameGap: 30,
    nameTextStyle: { fontSize: 10 },
    axisLabel: { fontSize: 8 },
  }));

  const yAxes = columns.map((col, index) => ({
    type: "value",
    gridIndex: index,
    name: getColumnLabel(col),
    nameLocation: "middle",
    nameGap: 40,
    nameTextStyle: { fontSize: 10 },
    axisLabel: { fontSize: 8 },
  }));

  const grids = [];
  const gridSize = 80 / columns.length;
  for (let i = 0; i < columns.length; i++) {
    for (let j = 0; j < columns.length; j++) {
      grids.push({
        left: `${10 + j * gridSize}%`,
        top: `${10 + i * gridSize}%`,
        width: `${gridSize - 2}%`,
        height: `${gridSize - 2}%`,
      });
    }
  }

  return {
    title: {
      text: "变量散点图矩阵",
      left: "center",
      textStyle: {
        fontSize: 16,
        fontWeight: "bold",
      },
    },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        return `${params.seriesName}<br/>X: ${params.value[0].toFixed(3)}<br/>Y: ${params.value[1].toFixed(3)}`;
      },
    },
    toolbox: {
      show: true,
      right: "20px",
      top: "60px",
      feature: {
        saveAsImage: {
          title: "保存为图片",
          type: "png",
          backgroundColor: "#fff",
        },
      },
    },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    series: series,
  };
};

// 生成网络关系图配置
const getNetworkOption = () => {
  const { matrix, labels } = calculateCorrelationMatrix();
  if (matrix.length === 0) return null;

  const nodes = labels.map((label, index) => ({
    id: index,
    name: getColumnLabel(label),
    symbolSize: 30,
    itemStyle: {
      color: "#10b981",
    },
  }));

  const links: any[] = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix[i].length; j++) {
      const correlation = Math.abs(matrix[i][j]);
      if (correlation >= props.minCorrelation) {
        links.push({
          source: i,
          target: j,
          value: correlation,
          lineStyle: {
            width: Math.max(1, correlation * 5),
            color: correlation > 0.5 ? "#dc2626" : correlation > 0.3 ? "#f59e0b" : "#6b7280",
            opacity: 0.8,
          },
          label: {
            show: correlation > 0.5,
            formatter: matrix[i][j].toFixed(2),
            fontSize: 10,
          },
        });
      }
    }
  }

  return {
    title: {
      text: `变量关系网络图 (阈值 ≥ ${props.minCorrelation})`,
      left: "center",
      textStyle: {
        fontSize: 16,
        fontWeight: "bold",
      },
    },
    tooltip: {
      formatter: (params: any) => {
        if (params.dataType === "edge") {
          return `${params.data.source} - ${params.data.target}<br/>相关系数: ${params.data.value.toFixed(3)}`;
        }
        return `变量: ${params.data.name}`;
      },
    },
    toolbox: {
      show: true,
      right: "20px",
      top: "60px",
      feature: {
        saveAsImage: {
          title: "保存为图片",
          type: "png",
          backgroundColor: "#fff",
        },
      },
    },
    legend: {
      show: true,
      bottom: "10%",
      data: [
        { name: "强相关 (>0.5)", icon: "line", textStyle: { color: "#dc2626" } },
        { name: "中等相关 (0.3-0.5)", icon: "line", textStyle: { color: "#f59e0b" } },
        { name: "弱相关 (<0.3)", icon: "line", textStyle: { color: "#6b7280" } },
      ],
    },
    series: [
      {
        type: "graph",
        layout: "force",
        data: nodes,
        links: links,
        roam: true,
        focusNodeAdjacency: true,
        force: {
          repulsion: 1000,
          edgeLength: [50, 200],
        },
        emphasis: {
          focus: "adjacency",
          lineStyle: {
            width: 10,
          },
        },
      },
    ],
  };
};

// 生成时间延迟相关性分析配置
const getTimeLagOption = () => {
  if (!props.csvData || props.selectedColumns.length < 2) return null;

  const baseColumn = props.selectedColumns[0];
  const targetColumn = props.selectedColumns[1];
  const baseData = extractDataFromCsv(props.csvData, baseColumn);
  const targetData = extractDataFromCsv(props.csvData, targetColumn);

  const maxLag = Math.min(20, Math.floor(baseData.length / 4));
  const lagData: Array<[number, number]> = [];

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let x = baseData;
    let y = targetData;

    if (lag > 0) {
      x = baseData.slice(0, -lag);
      y = targetData.slice(lag);
    } else if (lag < 0) {
      x = baseData.slice(-lag);
      y = targetData.slice(0, lag);
    }

    const correlation = calculatePearsonCorrelation(x, y);
    lagData.push([lag, correlation]);
  }

  return {
    title: {
      text: `时间延迟相关性分析: ${getColumnLabel(baseColumn)} vs ${getColumnLabel(targetColumn)}`,
      left: "center",
      textStyle: {
        fontSize: 16,
        fontWeight: "bold",
      },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const lag = params[0].value[0];
        const correlation = params[0].value[1];
        return `延迟: ${lag} 个时间单位<br/>相关系数: ${correlation.toFixed(3)}`;
      },
    },
    toolbox: {
      show: true,
      right: "20px",
      top: "60px",
      feature: {
        saveAsImage: {
          title: "保存为图片",
          type: "png",
          backgroundColor: "#fff",
        },
      },
    },
    grid: {
      left: "15%",
      right: "10%",
      bottom: "15%",
      top: "20%",
    },
    xAxis: {
      type: "value",
      name: "时间延迟",
      nameLocation: "middle",
      nameGap: 30,
      axisLine: {
        show: true,
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: "dashed",
        },
      },
    },
    yAxis: {
      type: "value",
      name: "相关系数",
      nameLocation: "middle",
      nameGap: 50,
      min: -1,
      max: 1,
      axisLine: {
        show: true,
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: "dashed",
        },
      },
    },
    series: [
      {
        name: "延迟相关性",
        type: "line",
        data: lagData,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: {
          color: "#10b981",
          width: 2,
        },
        itemStyle: {
          color: "#10b981",
        },
        markLine: {
          data: [{ yAxis: 0, lineStyle: { color: "#6b7280", type: "solid" } }],
        },
      },
    ],
  };
};

// 获取当前图表配置
const getChartOption = computed(() => {
  if (!props.csvData || props.selectedColumns.length < 2) {
    return null;
  }

  switch (props.analysisType) {
    case "heatmap":
      return getHeatmapOption();
    case "scatter-matrix":
      return getScatterMatrixOption();
    case "network":
      return getNetworkOption();
    case "time-lag":
      return getTimeLagOption();
    default:
      return null;
  }
});

// 初始化图表
const initChart = () => {
  if (!chartContainer.value) return;

  if (chartInstance) {
    chartInstance.dispose();
  }

  chartInstance = echarts.init(chartContainer.value);
  updateChart();

  window.addEventListener("resize", handleResize);
};

// 更新图表
const updateChart = () => {
  if (!chartInstance || !getChartOption.value) return;

  chartInstance.setOption(getChartOption.value, true);
};

// 处理窗口大小变化
const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize();
  }
};

// 监听属性变化
watch(
  [
    () => props.selectedColumns,
    () => props.analysisType,
    () => props.correlationMethod,
    () => props.csvData,
    () => props.correlationMatrix,
    () => props.minCorrelation,
  ],
  () => {
    nextTick(() => {
      updateChart();
    });
  },
  { immediate: true, deep: true }
);

// 生命周期钩子
onMounted(() => {
  nextTick(() => {
    initChart();
  });
});

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  window.removeEventListener("resize", handleResize);
});
</script>

<template>
  <div class="correlation-analysis">
    <div v-if="loading" class="chart-loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">分析变量相关性中...</div>
    </div>

    <div v-else-if="!csvData || selectedColumns.length < 2" class="chart-placeholder">
      <div class="placeholder-icon">🔗</div>
      <div class="placeholder-text">请选择至少两个数值列，然后点击"开始分析"</div>
      <div class="placeholder-subtitle">相关性分析可以帮助您发现变量间的统计关系</div>
    </div>

    <div v-else ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<style scoped>
.correlation-analysis {
  width: 100%;
  height: 100%;
  min-height: 600px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 600px;
}

.chart-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #6b7280;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top: 3px solid #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-text {
  font-size: 14px;
}

.chart-placeholder {
  text-align: center;
  color: #6b7280;
}

.placeholder-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.placeholder-text {
  font-size: 14px;
  margin-bottom: 8px;
}

.placeholder-subtitle {
  font-size: 12px;
  color: #9ca3af;
  font-style: italic;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
