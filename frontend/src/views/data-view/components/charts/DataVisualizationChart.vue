<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from "vue";
import * as echarts from "echarts";

interface Props {
  selectedColumn: string;
  chartType: "histogram" | "scatter" | "cdf" | "heatmap";
  loading?: boolean;
  csvData?: {
    tableData: Array<any>;
    targetColumn: string;
  } | null;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  csvData: null,
});

const chartContainer = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;

// 全屏状态管理
const isFullscreen = ref(false);

// 数据采样配置
const SAMPLING_CONFIG = {
  MAX_POINTS: 2000, // 最大显示点数
  MIN_POINTS: 500,  // 最小显示点数
  ZOOM_THRESHOLD: 0.1, // 缩放阈值，小于此值时显示全部数据
};

/**
 * 智能数据采样函数
 * 根据数据量和缩放级别进行采样
 */
const sampleTimeSeriesData = (
  timeData: Array<{ time: string; value: number }>,
  maxPoints: number = SAMPLING_CONFIG.MAX_POINTS
): Array<{ time: string; value: number }> => {
  if (timeData.length <= maxPoints) {
    return timeData;
  }

  const sampledData: Array<{ time: string; value: number }> = [];
  const step = Math.ceil(timeData.length / maxPoints);

  // 确保包含第一个和最后一个数据点
  sampledData.push(timeData[0]);

  // 采样中间数据点，保留重要特征
  for (let i = step; i < timeData.length - step; i += step) {
    // 在采样窗口内找到最大值和最小值，保留数据的波动特征
    let minIndex = i;
    let maxIndex = i;
    let minValue = timeData[i].value;
    let maxValue = timeData[i].value;

    for (let j = i; j < Math.min(i + step, timeData.length - 1); j++) {
      if (timeData[j].value < minValue) {
        minValue = timeData[j].value;
        minIndex = j;
      }
      if (timeData[j].value > maxValue) {
        maxValue = timeData[j].value;
        maxIndex = j;
      }
    }

    // 添加极值点以保持数据特征
    if (minIndex !== maxIndex) {
      sampledData.push(timeData[minIndex]);
      sampledData.push(timeData[maxIndex]);
    } else {
      sampledData.push(timeData[i]);
    }
  }

  // 确保包含最后一个数据点
  if (timeData.length > 1) {
    sampledData.push(timeData[timeData.length - 1]);
  }

  // 按时间排序
  sampledData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  console.log(`数据采样: ${timeData.length} -> ${sampledData.length} 个点`);
  return sampledData;
};

/**
 * 自适应采样：根据缩放级别动态调整采样率
 */
const adaptiveSampleData = (
  timeData: Array<{ time: string; value: number }>,
  zoomStart: number = 0,
  zoomEnd: number = 100
): Array<{ time: string; value: number }> => {
  const zoomRange = (zoomEnd - zoomStart) / 100;
  
  // 如果缩放范围很小，显示更多数据点
  let maxPoints = SAMPLING_CONFIG.MAX_POINTS;
  if (zoomRange < 0.1) {
    maxPoints = SAMPLING_CONFIG.MAX_POINTS * 2;
  } else if (zoomRange < 0.5) {
    maxPoints = SAMPLING_CONFIG.MAX_POINTS * 1.5;
  }

  return sampleTimeSeriesData(timeData, maxPoints);
};

// 全屏切换函数
const toggleFullscreen = () => {
  const chartViz = document.querySelector(".chart-visualization") as HTMLElement;
  if (!chartViz) return;

  if (document.fullscreenElement) {
    document.exitFullscreen();
    chartViz.classList.remove("fullscreen-mode");
    isFullscreen.value = false;
  } else {
    chartViz
      .requestFullscreen()
      .then(() => {
        chartViz.classList.add("fullscreen-mode");
        isFullscreen.value = true;
        // 全屏后需要重新调整图表大小
        setTimeout(() => {
          if (chartInstance) {
            chartInstance.resize();
          }
        }, 100);
      })
      .catch(err => {
        console.error("进入全屏失败:", err);
      });
  }
};

// 监听全屏变化事件
const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
  if (chartInstance) {
    // 延迟调整图表大小，确保DOM已更新
    setTimeout(() => {
      chartInstance?.resize();
    }, 100);
  }
};

// 通用工具箱配置
const getCommonToolbox = () => ({
  show: true,
  right: "20px",
  top: "60px",
  feature: {
    // 保存为图片
    saveAsImage: {
      title: "保存为图片",
      type: "png",
      backgroundColor: "#fff",
    },
    // 还原
    restore: {
      title: "还原",
    },
    // 全屏显示
    myFullScreen: {
      show: true,
      title: isFullscreen.value ? "退出全屏" : "全屏显示",
      icon: isFullscreen.value
        ? "path://M391 169.9L312.1 91 278.9 124.2 353.4 198.6 256 296 390.2 430.2 487.6 332.8 412.1 257.4 486.6 182.9 453.4 149.7 391 169.9zM296 256L198.6 353.4 124.2 278.9 91 312.1 169.9 391 149.7 453.4 182.9 486.6 257.4 412.1 332.8 487.6 430.2 390.2 296 256z"
        : "path://M128 192V64h128v128H128zM320 192V64h128v128H320zM128 448V320h128v128H128zM320 448V320h128v128H320z M64 64h32v32H64z M448 64h32v32h-32z M64 448h32v32H64z M448 448h32v32h-32z",
      onclick: toggleFullscreen,
    },
  },
});

// 从CSV数据中提取数值数组
const extractDataFromCsv = (csvData: any, columnName: string): number[] => {
  if (!csvData || !csvData.tableData || !Array.isArray(csvData.tableData)) {
    console.log("CSV数据无效或为空:", csvData);
    return [];
  }

  console.log(`正在提取列 "${columnName}" 的数据，总行数: ${csvData.tableData.length}`);

  const extractedData = csvData.tableData
    .map((row: any) => {
      const value = row[columnName];
      // 确保是有效的数字
      if (value !== null && value !== undefined && !isNaN(Number(value))) {
        return Number(value);
      }
      return null;
    })
    .filter((value: number | null) => value !== null) as number[];

  console.log(`成功提取 ${extractedData.length} 个有效数据点`);
  return extractedData;
};

// 从CSV数据中提取时间序列数据
const extractTimeSeriesFromCsv = (csvData: any, columnName: string): Array<{ time: string; value: number }> => {
  if (!csvData || !csvData.tableData || !Array.isArray(csvData.tableData)) {
    return [];
  }

  // 智能识别时间戳列
  let timestampKey = '';
  
  if (csvData.tableData.length > 0) {
    const firstRow = csvData.tableData[0];
    const keys = Object.keys(firstRow);

    // 1. 优先匹配常见的时间列名
    const priorityKeys = ['TIMESTAMP', 'timestamp', 'Timestamp', 'Date', 'date', 'Time', 'time', 'record_time', 'Record_Time', 'RECORD_TIME'];
    for (const key of priorityKeys) {
      if (keys.includes(key)) {
        timestampKey = key;
        break;
      }
    }

    // 2. 如果没找到，尝试智能识别内容
    if (!timestampKey) {
      for (const key of keys) {
        // 跳过当前选中的数值列
        if (key === columnName) continue;
        
        const value = firstRow[key];
        // 检查是否为字符串且包含日期特征
        if (typeof value === 'string') {
            // 简单的日期格式检查：包含 - / : 且能被 Date 解析
            // 排除纯数字字符串（虽然 Date.parse 可能接受，但通常不是我们想要的格式）
            if ((value.includes('-') || value.includes('/') || value.includes(':')) && !isNaN(Date.parse(value))) {
                 timestampKey = key;
                 break;
            }
        }
      }
    }
    
    // 3. 如果还是没找到，但存在 TIMESTAMP 列，回退到默认
    if (!timestampKey && keys.includes('TIMESTAMP')) {
        timestampKey = 'TIMESTAMP';
    }
  }

  if (!timestampKey) {
      console.warn("无法识别时间列，将使用索引作为X轴");
      return csvData.tableData.map((row: any, index: number) => {
          const value = row[columnName];
          if (value !== null && value !== undefined && !isNaN(Number(value))) {
              return {
                  time: String(index + 1),
                  value: Number(value)
              };
          }
          return null;
      }).filter((item: any) => item !== null);
  }

  console.log(`识别到的时间列名: ${timestampKey}`);

  return csvData.tableData
    .map((row: any) => {
      const value = row[columnName];
      const timestamp = row[timestampKey];

      // 确保数值和时间戳都有效
      if (value !== null && value !== undefined && !isNaN(Number(value)) && timestamp) {
        return {
          time: String(timestamp),
          value: Number(value),
        };
      }
      return null;
    })
    .filter((item: any) => item !== null) as Array<{ time: string; value: number }>;
};

// 使用你的真实数据生成图表数据
const generateMockData = (columnName: string, count = 100) => {
  console.log(`生成模拟数据 for column: ${columnName}, count: ${count}`);

  // 你的真实数据样本
  const realDataSamples: Record<string, number[]> = {
    RH: [43.9214, 50.9205, 52.0586, 53.5052, 51.3854, 54.3842, 56.4379],
    NEE_VUT_REF: [-6.5715, -2.14313, -0.450498, -1.62386, -1.91802, -0.163534, 0.235391],
    TS_F_MDS_1: [3.8, 3.8, 3.8, 3.8, 3.8, 3.8, 3.8],
    SWC_F_MDS_1: [0.18261, 0.182608, 0.182915, 0.183072, 0.182841, 0.182852, 0.1832],
    VPD_F_MDS: [294.658, 234.387, 222.963, 209.767, 224.594, 204.151, 188.354],
    TA_F_MDS: [-0.947, -2.557, -2.764, -3.243, -2.847, -3.3, -3.736],
    NETRAD: [-70.2052, -68.7972, -68.8334, -67.8122, -68.0891, -67.074, -67.1258],
    SW_IN_F: [0.937008, 0.94609, 0.929527, 0.927886, 0.937879, 0.927147, 0.931464],
  };

  const baseSample = realDataSamples[columnName];
  if (!baseSample || baseSample.length === 0) {
    return [];
  }

  // 基于真实数据计算统计特征
  const mean = baseSample.reduce((sum, val) => sum + val, 0) / baseSample.length;
  const variance = baseSample.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / baseSample.length;
  const std = Math.sqrt(variance);

  const data: number[] = [];

  // 使用真实数据的特征生成更多样本点
  for (let i = 0; i < count; i++) {
    if (i < baseSample.length) {
      // 前几个使用真实数据
      data.push(baseSample[i]);
    } else {
      // 后面基于真实数据的统计特征生成
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      data.push(mean + z0 * std);
    }
  }

  return data;
};

// 生成基于真实数据的时间序列数据
const generateTimeSeriesData = (columnName: string) => {
  console.log(`生成模拟时间序列数据 for column: ${columnName}`);

  // 基础数据样本，用于计算均值和标准差
  const realDataSamples: Record<string, number[]> = {
    RH: [43.9214, 50.9205, 52.0586, 53.5052, 51.3854, 54.3842, 56.4379],
    NEE_VUT_REF: [-6.5715, -2.14313, -0.450498, -1.62386, -1.91802, -0.163534, 0.235391],
    TS_F_MDS_1: [3.8, 3.8, 3.8, 3.8, 3.8, 3.8, 3.8],
    SWC_F_MDS_1: [0.18261, 0.182608, 0.182915, 0.183072, 0.182841, 0.182852, 0.1832],
    VPD_F_MDS: [294.658, 234.387, 222.963, 209.767, 224.594, 204.151, 188.354],
    TA_F_MDS: [-0.947, -2.557, -2.764, -3.243, -2.847, -3.3, -3.736],
    NETRAD: [-70.2052, -68.7972, -68.8334, -67.8122, -68.0891, -67.074, -67.1258],
    SW_IN_F: [0.937008, 0.94609, 0.929527, 0.927886, 0.937879, 0.927147, 0.931464],
  };

  const baseSample = realDataSamples[columnName];
  if (!baseSample || baseSample.length === 0) {
    return [];
  }

  // 基于真实数据计算统计特征
  const mean = baseSample.reduce((sum, val) => sum + val, 0) / baseSample.length;
  const variance = baseSample.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / baseSample.length;
  const std = Math.sqrt(variance);

  const data: Array<{ time: string; value: number }> = [];
  const now = new Date();

  // 生成过去 120 天的数据，每 6 小时一个点
  const totalDays = 120;
  for (let i = totalDays * 4; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(d.getHours() - i * 6, 0, 0, 0); // 每 6 小时一个数据点

    // 使用 Box-Muller 变换生成正态分布的随机数
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const value = mean + z0 * std * 0.5; // 添加一些随机性

    data.push({ time: d.toISOString(), value });
  }

  return data;
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

// 生成直方图配置
const getHistogramOption = (data: number[]) => {
  if (data.length === 0) return null;

  // 计算直方图数据
  const min = Math.min(...data);
  const max = Math.max(...data);

  // 智能计算分箱数量
  const binCount = Math.min(Math.max(Math.ceil(Math.sqrt(data.length)), 10), 30);
  const binWidth = (max - min) / binCount;

  const bins = new Array(binCount).fill(0);
  const binLabels: string[] = [];

  data.forEach(value => {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
    bins[binIndex]++;
  });

  for (let i = 0; i < binCount; i++) {
    const binStart = min + i * binWidth;
    const binEnd = min + (i + 1) * binWidth;
    binLabels.push(`${binStart.toFixed(2)}-${binEnd.toFixed(2)}`);
  }

  return {
    title: {
      text: `${props.selectedColumn} 数据分布直方图 (${data.length} 个数据点)`,
      left: "center",
      textStyle: {
        fontSize: 16,
        fontWeight: "bold",
      },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      formatter: (params: any) => {
        const data = params[0];
        return `${data.name}<br/>频数: ${data.value}`;
      },
    },
    // 工具箱配置
    toolbox: {
      show: true,
      right: "20px",
      top: "60px",
      feature: {
        // 保存为图片
        saveAsImage: {
          title: "保存为图片",
          type: "png",
          backgroundColor: "#fff",
        },
        // 还原
        restore: {
          title: "还原",
        },
        // 全屏显示
        myFullScreen: {
          show: true,
          title: "全屏显示",
          icon: "path://M432 48H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8V80h232a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8zM288 432H56a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h288a16 16 0 0 0 16-16v-72a8 8 0 0 0-8-8h-56a8 8 0 0 0-8 8zM432 288h56a8 8 0 0 0 8-8v-16a8 8 0 0 0-8-8H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8v-56h232a8 8 0 0 0 8-8zM200 80h56a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8z",
          onclick: function () {
            const container = document.querySelector(".chart-container") as HTMLElement;
            if (container) {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                container.requestFullscreen();
              }
            }
          },
        },
      },
    },
    // 数据区域缩放组件
    dataZoom: [
      {
        type: "slider", // 滑动条型数据区域缩放组件 - Y轴
        show: true,
        yAxisIndex: [0],
        start: 0,
        end: 100,
        left: "10px",
        width: 20,
        orient: "vertical",
        showDetail: false,
        filterMode: "empty",
        handleStyle: {
          color: "#10b981",
          shadowBlur: 3,
          shadowColor: "rgba(0, 0, 0, 0.6)",
          shadowOffsetX: 2,
          shadowOffsetY: 2,
        },
      },
    ],
    grid: {
      left: "20%", // 为Y轴滑动条留出空间
      right: "15%",
      bottom: "15%",
      top: "20%",
    },
    xAxis: {
      type: "category",
      data: binLabels,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
      },
      name: "数值区间",
      nameLocation: "middle",
      nameGap: 60,
    },
    yAxis: {
      type: "value",
      name: "频数",
      nameLocation: "middle",
      nameGap: 40,
    },
    series: [
      {
        name: "频数",
        type: "bar",
        data: bins,
        itemStyle: {
          color: "#10b981",
          borderColor: "#047857",
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            color: "#059669",
          },
        },
      },
    ],
  };
};

// 生成高性能时间序列图配置
const getScatterOption = (timeData: Array<{ time: string; value: number }>) => {
  if (timeData.length === 0) return null;

  // 对大数据集进行采样以提高性能
  const originalLength = timeData.length;
  const sampledData = timeData.length > SAMPLING_CONFIG.MAX_POINTS 
    ? sampleTimeSeriesData(timeData) 
    : timeData;

  // 性能优化说明：
  // 1. 智能数据采样：超过2000个点时自动采样到2000个点以内
  // 2. 保留极值点：采样时保留最大值和最小值，保持数据特征
  // 3. 动态符号大小：大数据集时隐藏点符号，只显示连线
  // 4. LTTB采样：ECharts内置的Largest-Triangle-Three-Buckets算法
  // 5. 大数据模式：启用ECharts的large模式优化渲染性能
  // 6. 禁用动画：大数据集时关闭动画以提升交互响应速度

  const data = sampledData.map(d => [d.time, d.value]);

  // Check if data is index-based (not a date string)
  const isIndexBased = sampledData.length > 0 && !isNaN(Number(sampledData[0].time)) && !sampledData[0].time.includes('-') && !sampledData[0].time.includes(':');

  let timeSpanDays = 0;
  if (!isIndexBased && sampledData.length > 1) {
    const firstTime = new Date(sampledData[0].time);
    const lastTime = new Date(sampledData[sampledData.length - 1].time);
    if (!isNaN(firstTime.getTime()) && !isNaN(lastTime.getTime())) {
      timeSpanDays = (lastTime.getTime() - firstTime.getTime()) / (1000 * 3600 * 24);
    }
  }

  let axisInterval;
  let axisLabelFormatter: string | ((value: any) => string) = "{MM}-{dd}";

  if (isIndexBased) {
      axisLabelFormatter = (value: any) => value;
  } else if (timeSpanDays > 90) {
    // 大于3个月，按月分割
    axisInterval = 30 * 24 * 3600 * 1000;
    axisLabelFormatter = "{yyyy}-{MM}";
  } else if (timeSpanDays > 30) {
    // 1-3个月，按周分割
    axisInterval = 7 * 24 * 3600 * 1000;
    axisLabelFormatter = "{MM}-{dd}";
  } else {
    // 小于1个月，按日分割
    axisInterval = 24 * 3600 * 1000;
    axisLabelFormatter = "{MM}-{dd}";
  }

  return {
    title: {
      text: `${props.selectedColumn} 时间序列趋势图`,
      subtext: originalLength > SAMPLING_CONFIG.MAX_POINTS 
        ? `显示 ${sampledData.length} / ${originalLength} 个数据点 (已优化采样)` 
        : `${sampledData.length} 个数据点`,
      left: "center",
      textStyle: {
        fontSize: 16,
        fontWeight: "bold",
      },
      subtextStyle: {
        fontSize: 12,
        color: "#666",
      },
    },
    tooltip: {
      trigger: "axis",
      confine: true, // 限制在图表区域内
      enterable: false, // 禁止鼠标进入tooltip
      hideDelay: 0, // 立即隐藏
      formatter: (params: any) => {
        const dataPoint = params[0];
        let timeStr = dataPoint.value[0];
        if (!isIndexBased) {
            const date = new Date(dataPoint.value[0]);
            timeStr = echarts.format.formatTime("yyyy-MM-dd hh:mm:ss", date.getTime());
        }
        return `时间/索引: ${timeStr}<br/>${props.selectedColumn}: ${dataPoint.value[1].toFixed(3)}`;
      },
    },
    // 工具箱配置
    toolbox: {
      show: true,
      right: "20px",
      top: "60px",
      feature: {
        // 数据区域缩放
        dataZoom: {
          yAxisIndex: "none",
          title: {
            zoom: "区域缩放",
            back: "区域缩放还原",
          },
        },
        // 配置项还原
        restore: {
          title: "还原",
        },
        // 保存为图片
        saveAsImage: {
          title: "保存为图片",
          type: "png",
          backgroundColor: "#fff",
        },
        // 全屏显示
        myFullScreen: {
          show: true,
          title: "全屏显示",
          icon: "path://M432 48H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8V80h232a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8zM288 432H56a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h288a16 16 0 0 0 16-16v-72a8 8 0 0 0-8-8h-56a8 8 0 0 0-8 8zM432 288h56a8 8 0 0 0 8-8v-16a8 8 0 0 0-8-8H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8v-56h232a8 8 0 0 0 8-8zM200 80h56a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8z",
          onclick: function () {
            const container = document.querySelector(".chart-container") as HTMLElement;
            if (container) {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                container.requestFullscreen();
              }
            }
          },
        },
      },
    },
    // 优化的数据区域缩放组件 - X轴和Y轴
    dataZoom: [
      {
        type: "inside", // 内置型数据区域缩放组件 - X轴
        xAxisIndex: [0],
        start: 0,
        end: 100,
        filterMode: "filter",
        throttle: 100, // 限制缩放频率
      },
      {
        type: "inside", // 内置型数据区域缩放组件 - Y轴
        yAxisIndex: [0],
        start: 0,
        end: 100,
        filterMode: "empty",
        throttle: 100, // 限制缩放频率
      },
      {
        type: "slider", // 滑动条型数据区域缩放组件 - X轴
        show: true,
        xAxisIndex: [0],
        start: 0,
        end: 100,
        bottom: "10px",
        height: 20,
        showDetail: false,
        throttle: 100, // 限制缩放频率
        handleStyle: {
          color: "#10b981",
        },
        fillerColor: "rgba(16, 185, 129, 0.2)",
        borderColor: "#10b981",
      },
      {
        type: "slider", // 滑动条型数据区域缩放组件 - Y轴
        show: true,
        yAxisIndex: [0],
        start: 0,
        end: 100,
        left: "10px",
        width: 20,
        orient: "vertical",
        showDetail: false,
        throttle: 100, // 限制缩放频率
        handleStyle: {
          color: "#10b981",
        },
        fillerColor: "rgba(16, 185, 129, 0.2)",
        borderColor: "#10b981",
      },
    ],
    grid: {
      left: "12%", // 为Y轴滑动条留出空间
      right: "8%",
      bottom: "15%", // 为X轴滑动条留出空间
      top: "15%",
      containLabel: true,
    },
    xAxis: {
      type: isIndexBased ? "category" : "time",
      name: isIndexBased ? "索引" : "时间",
      nameLocation: "middle",
      nameGap: 50,
      axisLabel: {
        fontSize: 12,
        rotate: 0,
        formatter: axisLabelFormatter,
      },
      interval: axisInterval,
    },
    yAxis: {
      type: "value",
      name: props.selectedColumn,
      nameLocation: "middle",
      nameGap: 60,
      scale: true, // 自适应数据范围
    },
    series: [
      {
        name: props.selectedColumn,
        type: "line",
        data: data,
        symbol: sampledData.length > 1000 ? "none" : "circle", // 大数据集时隐藏点
        symbolSize: sampledData.length > 1000 ? 0 : 3, // 优化点大小
        sampling: "lttb", // 使用LTTB算法进行进一步采样
        large: sampledData.length > 1000, // 启用大数据优化
        largeThreshold: 1000, // 大数据阈值
        lineStyle: {
          color: "#10b981",
          width: sampledData.length > 5000 ? 1 : 2, // 大数据集时使用细线
        },
        itemStyle: {
          color: "#10b981",
        },
        emphasis: {
          disabled: sampledData.length > 3000, // 大数据集时禁用高亮效果
          scale: false,
        },
        smooth: false,
        connectNulls: false,
        // 移除markLine以提高性能
      },
    ],
    // 优化的动画配置
    animation: sampledData.length < 2000, // 大数据集时禁用动画
    animationDuration: sampledData.length < 1000 ? 800 : 0,
    animationEasing: "cubicOut" as const,
    // 性能优化配置
    progressive: sampledData.length > 1000 ? 1000 : 0, // 分批渲染
    progressiveThreshold: 1000, // 分批渲染阈值
    useUTC: !isIndexBased, // 使用UTC时间提高性能
  };
};

// 生成累计分布函数图配置
const getCdfOption = (data: number[]) => {
  if (data.length === 0) return null;

  // 对数据排序
  const sortedData = [...data].sort((a, b) => a - b);

  // 计算累计分布函数
  const cdfData = sortedData.map((value, index) => {
    const probability = (index + 1) / sortedData.length;
    return [value, probability];
  });

  return {
    title: {
      text: `${props.selectedColumn} 累计分布函数图 (${data.length} 个数据点)`,
      left: "center",
      textStyle: {
        fontSize: 16,
        fontWeight: "bold",
      },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const dataPoint = params[0];
        return `数值: ${dataPoint.value[0].toFixed(3)}<br/>累计概率: ${(dataPoint.value[1] * 100).toFixed(1)}%`;
      },
    },
    // 工具箱配置
    toolbox: {
      show: true,
      right: "20px",
      top: "60px",
      feature: {
        // 保存为图片
        saveAsImage: {
          title: "保存为图片",
          type: "png",
          backgroundColor: "#fff",
        },
        // 还原
        restore: {
          title: "还原",
        },
        // 全屏显示
        myFullScreen: {
          show: true,
          title: "全屏显示",
          icon: "path://M432 48H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8V80h232a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8zM288 432H56a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h288a16 16 0 0 0 16-16v-72a8 8 0 0 0-8-8h-56a8 8 0 0 0-8 8zM432 288h56a8 8 0 0 0 8-8v-16a8 8 0 0 0-8-8H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8v-56h232a8 8 0 0 0 8-8zM200 80h56a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8H144a16 16 0 0 0-16 16v72a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8z",
          onclick: function () {
            const container = document.querySelector(".chart-container") as HTMLElement;
            if (container) {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                container.requestFullscreen();
              }
            }
          },
        },
      },
    },
    // 数据区域缩放组件
    dataZoom: [
      {
        type: "inside", // 内置型数据区域缩放组件
        xAxisIndex: [0],
        start: 0,
        end: 100,
        filterMode: "filter",
      },
      {
        type: "slider", // 滑动条型数据区域缩放组件 - X轴
        show: true,
        xAxisIndex: [0],
        start: 0,
        end: 100,
        bottom: "10px",
        height: 20,
        showDetail: false,
        handleStyle: {
          color: "#10b981",
          shadowBlur: 3,
          shadowColor: "rgba(0, 0, 0, 0.6)",
          shadowOffsetX: 2,
          shadowOffsetY: 2,
        },
      },
    ],
    grid: {
      left: "15%",
      right: "10%",
      bottom: "20%", // 为X轴滑动条留出空间
      top: "20%",
    },
    xAxis: {
      type: "value",
      name: props.selectedColumn,
      nameLocation: "middle",
      nameGap: 50,
      scale: true,
    },
    yAxis: {
      type: "value",
      name: "累计概率",
      nameLocation: "middle",
      nameGap: 50,
      min: 0,
      max: 1,
      axisLabel: {
        formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
      },
    },
    series: [
      {
        name: "累计分布函数",
        type: "line",
        data: cdfData,
        step: "end", // 阶梯状线条
        symbol: "none",
        lineStyle: {
          color: "#10b981",
          width: 2,
        },
        itemStyle: {
          color: "#10b981",
        },
        emphasis: {
          lineStyle: {
            width: 3,
          },
        },
        markLine: {
          data: [
            {
              yAxis: 0.5,
              name: "中位数线",
              lineStyle: {
                color: "#f59e0b",
                type: "dashed",
              },
            },
          ],
        },
      },
    ],
    // 动画配置
    animation: true,
    animationDuration: 1000,
    animationEasing: "cubicOut" as const,
  };
};

// 生成热力图配置
const getHeatmapOption = (timeData: Array<{ time: string; value: number }>) => {
  if (timeData.length === 0) return null;

  // 初始化聚合数组: 12个月 * 24小时
  const aggregation = new Array(12).fill(0).map(() => new Array(24).fill(0).map(() => ({ sum: 0, count: 0 })));

  timeData.forEach(item => {
    const date = new Date(item.time);
    if (isNaN(date.getTime())) return;

    const month = date.getMonth(); // 0-11
    const hour = date.getHours(); // 0-23

    aggregation[month][hour].sum += item.value;
    aggregation[month][hour].count += 1;
  });

  // 转换为 ECharts 需要的格式 [monthIndex, hourIndex, averageValue]
  const data: [number, number, number][] = [];
  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let m = 0; m < 12; m++) {
    for (let h = 0; h < 24; h++) {
      const { sum, count } = aggregation[m][h];
      if (count > 0) {
        const avg = parseFloat((sum / count).toFixed(3));
        data.push([m, h, avg]);
        if (avg < minVal) minVal = avg;
        if (avg > maxVal) maxVal = avg;
      }
    }
  }

  // 如果没有数据，避免 min/max 为 Infinity
  if (minVal === Infinity) minVal = 0;
  if (maxVal === -Infinity) maxVal = 100;

  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const hours = Array.from({length: 24}, (_, i) => `${i}点`);

  return {
    title: {
        text: `${props.selectedColumn} 月份-小时热力图`,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: "bold",
        },
    },
    tooltip: {
        position: 'top',
        formatter: function (params: any) {
            return `${months[params.value[0]]} ${hours[params.value[1]]}<br />平均值: ${params.value[2]}`;
        }
    },
    toolbox: getCommonToolbox(),
    grid: {
        height: '70%',
        top: '10%',
        left: '10%',
        right: '10%'
    },
    xAxis: {
        type: 'category',
        data: months,
        splitArea: {
            show: true
        }
    },
    yAxis: {
        type: 'category',
        data: hours,
        splitArea: {
            show: true
        }
    },
    visualMap: {
        min: minVal,
        max: maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
            color: ['#f6efa6', '#d88273', '#bf444c'] // 经典热力图配色
        }
    },
    series: [{
        name: 'Heatmap',
        type: 'heatmap',
        data: data,
        label: {
            show: false
        },
        emphasis: {
            itemStyle: {
                shadowBlur: 10,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
        }
    }]
  };
};

// 获取当前图表配置
const getChartOption = computed(() => {
  console.log("getChartOption 计算属性被调用:", {
    selectedColumn: props.selectedColumn,
    chartType: props.chartType,
    hasCsvData: !!props.csvData,
    csvDataLength: props.csvData?.tableData?.length || 0,
  });

  if (!props.selectedColumn) {
    console.log("没有选中的列，返回 null");
    return null;
  }

  if (props.chartType === "histogram") {
    // 优先使用真实数据，如果没有则使用模拟数据
    let data: number[];
    if (props.csvData && props.csvData.tableData.length > 0) {
      console.log("使用真实CSV数据生成直方图");
      data = extractDataFromCsv(props.csvData, props.selectedColumn);
    } else {
      console.log("使用模拟数据生成直方图");
      data = generateMockData(props.selectedColumn);
    }

    if (data.length === 0) {
      console.log("提取的数据为空，使用模拟数据");
      data = generateMockData(props.selectedColumn);
    }

    console.log("直方图数据:", data.slice(0, 5), "...总共", data.length, "个点");
    return getHistogramOption(data);
  } else if (props.chartType === "scatter") {
    // 优先使用真实数据，如果没有则使用模拟数据
    let timeData: Array<{ time: string; value: number }>;
    if (props.csvData && props.csvData.tableData.length > 0) {
      console.log("使用真实CSV数据生成时间序列图");
      timeData = extractTimeSeriesFromCsv(props.csvData, props.selectedColumn);
    } else {
      console.log("使用模拟数据生成时间序列图");
      timeData = generateTimeSeriesData(props.selectedColumn);
    }

    if (timeData.length === 0) {
      console.log("提取的时间序列数据为空，使用模拟数据");
      timeData = generateTimeSeriesData(props.selectedColumn);
    }

    console.log("时间序列数据:", timeData.slice(0, 3), "...总共", timeData.length, "个点");
    return getScatterOption(timeData);
  } else if (props.chartType === "heatmap") {
    // 热力图逻辑
    let timeData: Array<{ time: string; value: number }>;
    if (props.csvData && props.csvData.tableData.length > 0) {
      console.log("使用真实CSV数据生成热力图");
      timeData = extractTimeSeriesFromCsv(props.csvData, props.selectedColumn);
    } else {
      console.log("使用模拟数据生成热力图");
      timeData = generateTimeSeriesData(props.selectedColumn);
    }

    if (timeData.length === 0) {
      console.log("提取的时间序列数据为空，使用模拟数据");
      timeData = generateTimeSeriesData(props.selectedColumn);
    }

    console.log("热力图数据:", timeData.slice(0, 3), "...总共", timeData.length, "个点");
    return getHeatmapOption(timeData);
  } else if (props.chartType === "cdf") {
    // 优先使用真实数据，如果没有则使用模拟数据
    let data: number[];
    if (props.csvData && props.csvData.tableData.length > 0) {
      console.log("使用真实CSV数据生成累计分布函数图");
      data = extractDataFromCsv(props.csvData, props.selectedColumn);
    } else {
      console.log("使用模拟数据生成累计分布函数图");
      data = generateMockData(props.selectedColumn);
    }

    if (data.length === 0) {
      console.log("提取的数据为空，使用模拟数据");
      data = generateMockData(props.selectedColumn);
    }

    console.log("累计分布函数数据:", data.slice(0, 5), "...总共", data.length, "个点");
    return getCdfOption(data);
  }

  console.log("未知的图表类型:", props.chartType);
  return null;
});

// 初始化图表
const initChart = () => {
  console.log("initChart 被调用");

  if (!chartContainer.value) {
    console.error("图表容器 DOM 元素不存在");
    return;
  }

  console.log("图表容器 DOM 元素:", chartContainer.value);

  if (chartInstance) {
    console.log("销毁现有图表实例");
    chartInstance.dispose();
  }

  console.log("初始化新的图表实例");
  chartInstance = echarts.init(chartContainer.value, null, {
    renderer: 'canvas', // 使用canvas渲染器，性能更好
    useDirtyRect: true, // 启用脏矩形优化
    useCoarsePointer: true, // 优化移动设备性能
  });

  if (!chartInstance) {
    console.error("图表实例初始化失败");
    return;
  }

  console.log("图表实例初始化成功，调用 updateChart");
  updateChart();

  // 监听窗口大小变化
  window.addEventListener("resize", handleResize);
};

// 防抖的图表更新
let updateTimeout: ReturnType<typeof setTimeout> | null = null;

const updateChart = () => {
  console.log("updateChart 被调用:", {
    hasChartInstance: !!chartInstance,
    hasChartOption: !!getChartOption.value,
    selectedColumn: props.selectedColumn,
    chartType: props.chartType,
    csvData: props.csvData,
  });

  // 清除之前的更新任务
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  // 延迟更新以避免频繁重绘
  updateTimeout = setTimeout(() => {
    if (!chartInstance) {
      console.warn("图表实例不存在，重新初始化");
      initChart();
      return;
    }

    const option = getChartOption.value;
    if (!option) {
      console.warn("图表配置为空");
      return;
    }

    console.log("设置图表配置:", option);
    
    // 根据数据量选择更新策略
    const dataLength = option.series?.[0]?.data?.length || 0;
    
    if (dataLength > 3000) {
      // 大数据集时使用静默更新，减少重绘
      chartInstance.setOption(option, {
        notMerge: true,
        silent: true,
        lazyUpdate: true,
      });
    } else if (dataLength > 1000) {
      // 中等数据集时使用标准更新
      chartInstance.setOption(option, {
        notMerge: true,
        lazyUpdate: false,
      });
    } else {
      // 小数据集时使用完整更新
      chartInstance.setOption(option, true);
    }
  }, 50); // 50ms防抖延迟
};

// 处理窗口大小变化
const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize();
  }
};

// 优化的属性监听 - 减少不必要的更新
watch(
  [() => props.selectedColumn, () => props.chartType, () => props.csvData],
  (newValues, oldValues) => {
    const [newColumn, newChartType, newCsvData] = newValues;
    const [oldColumn, oldChartType, oldCsvData] = oldValues || [null, null, null];
    
    // 只有在真正需要时才更新图表
    const shouldUpdate = 
      newColumn !== oldColumn ||
      newChartType !== oldChartType ||
      (newCsvData !== oldCsvData && newCsvData);
    
    if (newColumn && shouldUpdate) {
      nextTick(() => {
        updateChart();
      });
    }
  },
  { immediate: true }
);

// 监听加载状态，确保图表在容器重新出现时重新初始化
watch(
  () => props.loading,
  (isLoading, wasLoading) => {
    // 当从加载状态切换到非加载状态时
    if (wasLoading && !isLoading) {
      // 确保此时应该显示图表
      if (props.selectedColumn) {
        nextTick(() => {
          // DOM容器可能已被v-if/v-else重新创建，所以需要重新初始化
          initChart();
        });
      }
    }
  }
);

// 生命周期钩子
onMounted(() => {
  nextTick(() => {
    initChart();
  });
  // 添加全屏事件监听
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  // 清理定时器
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }
  
  // 清理图表实例
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  
  // 移除事件监听器
  window.removeEventListener("resize", handleResize);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
});
</script>

<template>
  <div class="chart-visualization">
    <div v-if="loading" class="chart-loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">生成图表中...</div>
    </div>

    <div v-else-if="!selectedColumn" class="chart-placeholder">
      <div class="placeholder-icon">📊</div>
      <div class="placeholder-text">请选择一个数值列查看分布</div>
    </div>

    <div v-else ref="chartContainer" class="chart-container"></div>

    <!-- 全屏退出提示 -->
    <div class="fullscreen-tip" v-show="isFullscreen">
      <div class="tip-content">
        <span>按 ESC 键或点击工具栏中的全屏按钮退出全屏模式</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-visualization {
  width: 100%;
  height: 100%;
  min-height: 500px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

/* 全屏模式样式 */
.chart-visualization:fullscreen {
  background-color: #ffffff;
  padding: 20px;
}

.chart-visualization.fullscreen-mode {
  background-color: #ffffff;
  padding: 20px;
}

.chart-visualization:fullscreen .chart-container {
  width: 100%;
  height: 100vh;
  min-height: 100vh;
}

.chart-visualization.fullscreen-mode .chart-container {
  width: 100%;
  height: 100vh;
  min-height: 100vh;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
  border-radius: 8px;
  overflow: hidden;
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
}

/* 全屏提示样式 */
.fullscreen-tip {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.chart-visualization:fullscreen .fullscreen-tip {
  opacity: 1;
}

.chart-visualization.fullscreen-mode .fullscreen-tip {
  opacity: 1;
}

.tip-content {
  white-space: nowrap;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 确保全屏时图表能正确响应 */
.chart-visualization:fullscreen .chart-container canvas,
.chart-visualization.fullscreen-mode .chart-container canvas {
  max-width: 100% !important;
  max-height: 100% !important;
}
</style>
