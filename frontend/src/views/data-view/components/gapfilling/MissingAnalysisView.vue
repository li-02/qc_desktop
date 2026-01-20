<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { 
  DataAnalysis, 
  Histogram, 
  Grid
} from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { useGapFillingStore } from '@/stores/useGapFillingStore';

const store = useGapFillingStore();
const activeTab = ref('matrix');

// Chart refs
const matrixChartRef = ref<HTMLElement | null>(null);
const durationChartRef = ref<HTMLElement | null>(null);
const correlationChartRef = ref<HTMLElement | null>(null);

// Chart instances
let matrixChart: echarts.ECharts | null = null;
let durationChart: echarts.ECharts | null = null;
let correlationChart: echarts.ECharts | null = null;

// Mock data generators (since backend support might be limited for now)
const generateMatrixData = () => {
  const columns = store.missingStats?.columnStats?.map(c => c.columnName) || [];
  // Generate a compressed view (e.g., 50 time bins x N columns)
  const timeBins = 50;
  const data = [];
  
  for (let i = 0; i < columns.length; i++) {
    for (let j = 0; j < timeBins; j++) {
      // Simulate missing patterns: some columns have more missing
      const missingRate = store.missingStats?.columnStats?.[i]?.missingRate || 0;
      const isMissing = Math.random() * 100 < missingRate ? 1 : 0;
      data.push([j, i, isMissing]);
    }
  }
  return { columns, data, timeBins };
};

const generateDurationData = () => {
  // Simulate gap duration frequencies (1h, 2-5h, 6-24h, >24h)
  return [
    { name: '1小时', value: Math.floor(Math.random() * 500) + 100 },
    { name: '2-6小时', value: Math.floor(Math.random() * 300) + 50 },
    { name: '6-24小时', value: Math.floor(Math.random() * 100) + 20 },
    { name: '>24小时', value: Math.floor(Math.random() * 50) + 5 },
  ];
};

const generateCorrelationData = () => {
  const columns = store.missingStats?.columnStats
    ?.filter(c => c.missingRate > 0)
    .map(c => c.columnName)
    .slice(0, 10) || []; // Top 10 columns with missing
    
  const data = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = 0; j < columns.length; j++) {
      // Mock correlation
      let value = 0;
      if (i === j) value = 1;
      else value = Math.random() * 0.8; // Random positive correlation
      data.push([i, j, value.toFixed(2)]);
    }
  }
  return { columns, data };
};

const initCharts = async () => {
  await nextTick();
  
  // 1. Matrix Chart
  if (activeTab.value === 'matrix' && matrixChartRef.value) {
    if (!matrixChart) matrixChart = echarts.init(matrixChartRef.value);
    const { columns, data, timeBins } = generateMatrixData();
    
    matrixChart.setOption({
      tooltip: { position: 'top' },
      grid: { top: 60, bottom: 20, left: 100, right: 20 },
      xAxis: { 
        type: 'category', 
        data: Array.from({length: timeBins}, (_, i) => i + 1),
        name: '时间片段',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false }
      },
      yAxis: { 
        type: 'category', 
        data: columns,
        axisLabel: {
          width: 90,
          overflow: 'truncate'
        }
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        top: 0,
        inRange: { color: ['#f3f4f6', '#ef4444'] }, // Gray to Red
        show: false
      },
      series: [{
        name: 'Missing Status',
        type: 'heatmap',
        data: data,
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1
        }
      }]
    });
  }

  // 2. Duration Chart
  if (activeTab.value === 'duration' && durationChartRef.value) {
    if (!durationChart) durationChart = echarts.init(durationChartRef.value);
    const data = generateDurationData();
    
    durationChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { top: '5%', left: 'center' },
      series: [
        {
          name: '缺失时长分布',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 20,
              fontWeight: 'bold'
            }
          },
          labelLine: { show: false },
          data: data
        }
      ]
    });
  }
  
  // 3. Correlation Chart
  if (activeTab.value === 'correlation' && correlationChartRef.value) {
    if (!correlationChart) correlationChart = echarts.init(correlationChartRef.value);
    const { columns, data } = generateCorrelationData();
    
    correlationChart.setOption({
      tooltip: { position: 'top' },
      grid: { top: 60, right: 20, bottom: 60, left: 60 },
      xAxis: { 
        type: 'category', 
        data: columns,
        axisLabel: { rotate: 45 }
      },
      yAxis: { 
        type: 'category', 
        data: columns 
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        top: 0,
        inRange: { color: ['#fff', '#3b82f6'] } // White to Blue
      },
      series: [{
        name: 'Correlation',
        type: 'heatmap',
        data: data,
        label: { show: true },
        itemStyle: {
          emphasis: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
        }
      }]
    });
  }
};

watch(activeTab, () => {
  setTimeout(initCharts, 100);
});

const handleResize = () => {
  matrixChart?.resize();
  durationChart?.resize();
  correlationChart?.resize();
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
  initCharts();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  matrixChart?.dispose();
  durationChart?.dispose();
  correlationChart?.dispose();
});
</script>

<template>
  <div class="analysis-view-container">
    <div class="analysis-header">
      <div class="stat-box">
        <div class="stat-label">总缺失率</div>
        <div class="stat-value text-red-500">{{ store.overallMissingRate.toFixed(2) }}%</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">受影响列</div>
        <div class="stat-value">{{ store.missingStats?.columnStats?.filter(c => c.missingRate > 0).length || 0 }}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">最大连续缺失</div>
        <div class="stat-value">--</div> <!-- Placeholder for now -->
      </div>
    </div>

    <el-tabs v-model="activeTab" class="analysis-tabs">
      <el-tab-pane name="matrix">
        <template #label>
          <span class="custom-tab-label">
            <el-icon><Grid /></el-icon>
            <span>缺失矩阵</span>
          </span>
        </template>
        <div class="chart-wrapper">
          <div class="chart-desc">
            可视化全局缺失模式。红色表示缺失，灰色表示存在。
            <br/>有助于发现系统性缺失（如设备故障导致多变量同时缺失）。
          </div>
          <div ref="matrixChartRef" class="chart-container"></div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="duration">
        <template #label>
          <span class="custom-tab-label">
            <el-icon><Histogram /></el-icon>
            <span>缺失时长</span>
          </span>
        </template>
        <div class="chart-wrapper">
          <div class="chart-desc">
            缺失片段持续时间的分布情况。
            <br/>短时缺失适合线性插值，长时缺失可能需要统计模型。
          </div>
          <div ref="durationChartRef" class="chart-container"></div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="correlation">
        <template #label>
          <span class="custom-tab-label">
            <el-icon><DataAnalysis /></el-icon>
            <span>缺失相关性</span>
          </span>
        </template>
        <div class="chart-wrapper">
          <div class="chart-desc">
            不同变量间缺失发生的相关性。
            <br/>高相关性意味着变量可能因同一原因（如传感器断电）丢失。
          </div>
          <div ref="correlationChartRef" class="chart-container"></div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.analysis-view-container {
  padding: 20px;
  background: white;
  border-radius: 8px;
  min-height: 100%;
}

.analysis-header {
  display: flex;
  justify-content: space-around;
  margin-bottom: 24px;
  padding: 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
}

.stat-box {
  text-align: center;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
}

.text-red-500 {
  color: #ef4444;
}

.chart-wrapper {
  padding: 16px 0;
}

.chart-desc {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 16px;
  line-height: 1.5;
  background: #f8fafc;
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid #3b82f6;
}

.chart-container {
  height: 400px;
  width: 100%;
}

.custom-tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
