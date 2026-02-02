<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { 
  DataAnalysis, 
  Calendar,
} from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { useGapFillingStore } from '@/stores/useGapFillingStore';

const store = useGapFillingStore();
const activeTab = ref('temporal');
const heatmapViewMode = ref<'weekly' | 'calendar'>('weekly');

// ==================== Chart Refs ====================
// Temporal Charts (Real Data)
const heatmapChartRef = ref<HTMLElement | null>(null);
const calendarChartRef = ref<HTMLElement | null>(null);
const monthlyChartRef = ref<HTMLElement | null>(null);
const hourlyChartRef = ref<HTMLElement | null>(null);

// Pattern Charts (Mock/Future Data)
const matrixChartRef = ref<HTMLElement | null>(null);
const durationChartRef = ref<HTMLElement | null>(null);
const correlationChartRef = ref<HTMLElement | null>(null);

// Chart Instances
let heatmapInstance: echarts.ECharts | null = null;
let calendarInstance: echarts.ECharts | null = null;
let monthlyInstance: echarts.ECharts | null = null;
let hourlyInstance: echarts.ECharts | null = null;
let matrixChart: echarts.ECharts | null = null;
let durationChart: echarts.ECharts | null = null;
let correlationChart: echarts.ECharts | null = null;

// ==================== Temporal Analysis (Real Data) ====================
const updateTemporalCharts = async () => {
    if (!store.missingStats?.timeDistribution) return;

    await nextTick();
    const { monthly, hourly, heatmap } = store.missingStats.timeDistribution;

    // --- Monthly Chart ---
    if (monthlyChartRef.value) {
        if (!monthlyInstance) monthlyInstance = echarts.init(monthlyChartRef.value);
        const months = Object.keys(monthly).sort();
        const monthlyCounts = months.map(m => monthly[m]);

        monthlyInstance.setOption({
            title: { 
                text: '月度缺失分布', 
                left: 'center', 
                textStyle: { fontSize: 14, fontWeight: 'normal' } 
            },
            tooltip: { 
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#e5e7eb',
                textStyle: { color: '#374151' },
                formatter: (params: any) => {
                    const data = params[0];
                    return `<b>${data.name}</b><br/>缺失数: <b>${data.value}</b>`;
                }
            },
            grid: { top: 50, bottom: 40, left: 60, right: 30 },
            xAxis: { 
                type: 'category', 
                data: months,
                axisLine: { lineStyle: { color: '#d1d5db' } },
                axisTick: { lineStyle: { color: '#d1d5db' } },
                axisLabel: { color: '#6b7280' }
            },
            yAxis: { 
                type: 'value', 
                name: '缺失数',
                nameTextStyle: { color: '#6b7280' },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#6b7280' },
                splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
            },
            series: [{ 
                data: monthlyCounts, 
                type: 'bar', 
                color: '#ef4444',
                itemStyle: {
                    borderRadius: [4, 4, 0, 0]
                },
                emphasis: {
                    itemStyle: {
                        color: '#dc2626'
                    }
                }
            }]
        });
    }

    // --- Hourly Chart ---
    if (hourlyChartRef.value) {
        if (!hourlyInstance) hourlyInstance = echarts.init(hourlyChartRef.value);
        const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
        const hourlyCounts = hours.map(h => hourly[h] || 0);

        hourlyInstance.setOption({
            title: { 
                text: '每小时缺失分布 (昼夜模式)', 
                left: 'center', 
                textStyle: { fontSize: 14, fontWeight: 'normal' } 
            },
            tooltip: { 
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#e5e7eb',
                textStyle: { color: '#374151' },
                formatter: (params: any) => {
                    const data = params[0];
                    return `<b>${data.name}:00</b><br/>缺失数: <b>${data.value}</b>`;
                }
            },
            grid: { top: 50, bottom: 40, left: 60, right: 30 },
            xAxis: { 
                type: 'category', 
                data: hours,
                axisLine: { lineStyle: { color: '#d1d5db' } },
                axisTick: { lineStyle: { color: '#d1d5db' } },
                axisLabel: { color: '#6b7280' }
            },
            yAxis: { 
                type: 'value', 
                name: '缺失数',
                nameTextStyle: { color: '#6b7280' },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#6b7280' },
                splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
            },
            series: [{ 
                data: hourlyCounts, 
                type: 'line', 
                smooth: true, 
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
                            { offset: 1, color: 'rgba(239, 68, 68, 0.05)' }
                        ]
                    }
                },
                lineStyle: { width: 2, color: '#ef4444' },
                itemStyle: { color: '#ef4444' },
                emphasis: {
                    itemStyle: { color: '#dc2626', borderColor: '#fff', borderWidth: 2 }
                }
            }]
        });
    }

    // --- Weekly Heatmap (Week × Hour) ---
    if (heatmapViewMode.value === 'weekly' && heatmapChartRef.value) {
        if (!heatmapInstance) heatmapInstance = echarts.init(heatmapChartRef.value);
        
        const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
        
        // 分析数据时间跨度
        const dates = Object.keys(heatmap).map(key => new Date(key.split(' ')[0]));
        const validDates = dates.filter(d => !isNaN(d.getTime()));
        
        if (validDates.length === 0) return;
        
        const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
        const daySpan = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // 按周聚合：计算总周数
        const totalWeeks = Math.ceil(daySpan / 7) + 1;
        const yAxisData = Array.from({ length: totalWeeks }, (_, i) => (i + 1).toString());
        const grid: number[][] = Array.from({ length: totalWeeks }, () => Array(24).fill(0));
        
        // 填充网格数据（按周聚合）
        Object.entries(heatmap).forEach(([key, count]) => {
            const [dateStr, hourStr] = key.split(' ');
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                const weekIndex = Math.floor((date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
                const hourIndex = parseInt(hourStr);
                if (weekIndex >= 0 && weekIndex < totalWeeks && hourIndex >= 0 && hourIndex < 24) {
                    grid[weekIndex][hourIndex] += count;
                }
            }
        });

        // 转换为 ECharts 数据格式
        const heatmapData = [];
        for (let y = 0; y < grid.length; y++) {
            for (let h = 0; h < 24; h++) {
                heatmapData.push([h, y, grid[y][h]]);
            }
        }

        // 动态调整高度：每周至少8px，最大600px
        const requiredHeight = Math.min(600, Math.max(400, totalWeeks * 8 + 80));
        if (heatmapChartRef.value) {
            heatmapChartRef.value.style.height = `${requiredHeight}px`;
            if (heatmapInstance) heatmapInstance.resize();
        }

        heatmapInstance.setOption({
            title: { 
                text: '缺失值热力图 (周 × 小时)', 
                left: 'center', 
                textStyle: { fontSize: 14, fontWeight: 'normal' } 
            },
            tooltip: { 
                position: 'top',
                formatter: (params: any) => {
                    const hour = hours[params.data[0]];
                    const weekNum = yAxisData[params.data[1]];
                    const count = params.data[2];
                    return `<b>第 ${weekNum} 周</b><br/>${hour}:00 时段<br/>缺失数: <b>${count}</b>`;
                }
            },
            grid: { top: 50, bottom: 60, left: 60, right: 80 },
            xAxis: { 
                type: 'category', 
                data: hours, 
                name: '小时',
                nameLocation: 'middle',
                nameGap: 30,
                nameTextStyle: {
                    color: '#374151',
                    fontSize: 14,
                    fontWeight: 'bold'
                },
                axisLine: { lineStyle: { color: '#d1d5db' } },
                axisTick: { show: true, lineStyle: { color: '#d1d5db' } },
                axisLabel: { color: '#6b7280' }
            },
            yAxis: { 
                type: 'category', 
                data: yAxisData, 
                name: '周',
                nameLocation: 'middle',
                nameGap: 40,
                nameRotate: 0,
                nameTextStyle: { 
                    color: '#374151', 
                    fontSize: 13,
                    fontWeight: 500
                },
                inverse: false,
                axisLine: { lineStyle: { color: '#d1d5db' } },
                axisTick: { show: true, lineStyle: { color: '#d1d5db' } },
                axisLabel: { 
                    color: '#6b7280',
                    interval: (index: number) => {
                        // 每5周显示一次标签，或者是第1周和最后一周
                        return index === 0 || index === totalWeeks - 1 || (index + 1) % 5 === 0;
                    }
                }
            },
            visualMap: {
                min: 0,
                max: Math.max(...heatmapData.map(d => d[2])) || 1,
                calculable: true,
                orient: 'vertical',
                right: 10,
                top: 'center',
                show: true,
                text: ['高', '低'],
                textStyle: { color: '#6b7280', fontSize: 11 },
                inRange: {
                    color: ['#f9fafb', '#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c']
                }
            },
            series: [{
                name: 'Missing Counts',
                type: 'heatmap',
                data: heatmapData,
                label: { show: false },
                itemStyle: {
                    borderWidth: 1,
                    borderColor: '#fff',
                    emphasis: { 
                        shadowBlur: 10, 
                        shadowColor: 'rgba(0, 0, 0, 0.3)',
                        borderColor: '#374151',
                        borderWidth: 2
                    }
                }
            }]
        });
    }
    
    // --- Calendar Heatmap (GitHub Style) ---
    if (heatmapViewMode.value === 'calendar' && calendarChartRef.value) {
        if (!calendarInstance) calendarInstance = echarts.init(calendarChartRef.value);
        
        // 计算每天的总缺失数
        const dailyMissing: Record<string, number> = {};
        Object.entries(heatmap).forEach(([key, count]) => {
            const dateStr = key.split(' ')[0];
            dailyMissing[dateStr] = (dailyMissing[dateStr] || 0) + count;
        });
        
        // 转换为日历数据格式
        const calendarData = Object.entries(dailyMissing).map(([date, count]) => [date, count]);
        
        if (calendarData.length === 0) return;
        
        // 获取日期范围
        const dates = calendarData.map(d => new Date(d[0]));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        // 动态调整高度
        const yearSpan = maxDate.getFullYear() - minDate.getFullYear() + 1;
        const requiredHeight = Math.max(200, yearSpan * 180);
        if (calendarChartRef.value) {
            calendarChartRef.value.style.height = `${requiredHeight}px`;
            if (calendarInstance) calendarInstance.resize();
        }
        
        calendarInstance.setOption({
            title: {
                text: '日历热力图 (每日总缺失数)',
                left: 'center',
                textStyle: { fontSize: 14, fontWeight: 'normal' }
            },
            tooltip: {
                formatter: (params: any) => {
                    const date = params.data[0];
                    const count = params.data[1];
                    return `<b>${date}</b><br/>缺失数: <b>${count}</b>`;
                }
            },
            visualMap: {
                min: 0,
                max: Math.max(...calendarData.map(d => d[1] as number)) || 1,
                calculable: true,
                orient: 'vertical',
                right: 10,
                top: 'center',
                show: true,
                text: ['高', '低'],
                textStyle: { color: '#6b7280', fontSize: 11 },
                inRange: {
                    color: ['#f9fafb', '#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c']
                }
            },
            calendar: Array.from({ length: yearSpan }, (_, i) => ({
                top: 60 + i * 180,
                range: minDate.getFullYear() + i,
                cellSize: ['auto', 13],
                yearLabel: { show: true, fontSize: 16, color: '#374151' },
                monthLabel: { fontSize: 11, color: '#6b7280' },
                dayLabel: { fontSize: 11, color: '#6b7280', firstDay: 1 },
                splitLine: { show: true, lineStyle: { color: '#e5e7eb', width: 1 } },
                itemStyle: {
                    borderWidth: 2,
                    borderColor: '#fff'
                }
            })),
            series: {
                type: 'heatmap',
                coordinateSystem: 'calendar',
                data: calendarData
            }
        });
    }
};

// ==================== Structural Analysis (Mock/Future Data) ====================
// Mock data generators
const generateMatrixData = () => {
  const columns = store.missingStats?.columnStats?.map(c => c.columnName) || [];
  const timeBins = 50;
  const data = [];
  
  for (let i = 0; i < columns.length; i++) {
    for (let j = 0; j < timeBins; j++) {
      const missingRate = store.missingStats?.columnStats?.[i]?.missingRate || 0;
      const isMissing = Math.random() * 100 < missingRate ? 1 : 0;
      data.push([j, i, isMissing]);
    }
  }
  return { columns, data, timeBins };
};

const generateDurationData = () => {
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
    .slice(0, 10) || [];
    
  const data = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = 0; j < columns.length; j++) {
      let value = 0;
      if (i === j) value = 1;
      else value = Math.random() * 0.8;
      data.push([i, j, value.toFixed(2)]);
    }
  }
  return { columns, data };
};

const updateStructuralCharts = async () => {
  await nextTick();
  
  // 1. Matrix Chart
  if (matrixChartRef.value) {
    if (!matrixChart) matrixChart = echarts.init(matrixChartRef.value);
    const { columns, data, timeBins } = generateMatrixData();
    
    matrixChart.setOption({
      title: { text: '缺失矩阵 (Global Pattern)', left: 'center', textStyle: { fontSize: 14 } },
      tooltip: { position: 'top' },
      grid: { top: 40, bottom: 20, left: 100, right: 20 },
      xAxis: { 
        type: 'category', 
        data: Array.from({length: timeBins}, (_, i) => i + 1),
        name: 'Time',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false }
      },
      yAxis: { 
        type: 'category', 
        data: columns,
        axisLabel: { width: 90, overflow: 'truncate' }
      },
      visualMap: {
        min: 0, max: 1, show: false,
        inRange: { color: ['#f3f4f6', '#ef4444'] }
      },
      series: [{
        name: 'Missing Status',
        type: 'heatmap',
        data: data,
        itemStyle: { borderColor: '#fff', borderWidth: 1 }
      }]
    });
  }

  // 2. Duration Chart
  if (durationChartRef.value) {
    if (!durationChart) durationChart = echarts.init(durationChartRef.value);
    const data = generateDurationData();
    
    durationChart.setOption({
      title: { text: '缺失时长分布', left: 'center', textStyle: { fontSize: 14 } },
      tooltip: { trigger: 'item' },
      legend: { bottom: '5%', left: 'center' },
      series: [{
        name: '缺失时长',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        data: data
      }]
    });
  }
  
  // 3. Correlation Chart
  if (correlationChartRef.value) {
    if (!correlationChart) correlationChart = echarts.init(correlationChartRef.value);
    const { columns, data } = generateCorrelationData();
    
    correlationChart.setOption({
      title: { text: '缺失相关性', left: 'center', textStyle: { fontSize: 14 } },
      tooltip: { position: 'top' },
      grid: { top: 40, right: 20, bottom: 60, left: 60 },
      xAxis: { type: 'category', data: columns, axisLabel: { rotate: 45 } },
      yAxis: { type: 'category', data: columns },
      visualMap: {
        min: 0, max: 1, show: false,
        inRange: { color: ['#fff', '#3b82f6'] }
      },
      series: [{
        name: 'Correlation',
        type: 'heatmap',
        data: data,
        itemStyle: { emphasis: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
      }]
    });
  }
};

// ==================== Lifecycle & Watchers ====================
const initCharts = () => {
    if (activeTab.value === 'temporal') {
        updateTemporalCharts();
    } else {
        updateStructuralCharts();
    }
};

watch(() => store.missingStats, () => {
    initCharts();
}, { deep: true });

watch(activeTab, () => {
    setTimeout(initCharts, 100);
});

watch(heatmapViewMode, () => {
    setTimeout(initCharts, 100);
});

const handleResize = () => {
    heatmapInstance?.resize();
    calendarInstance?.resize();
    monthlyInstance?.resize();
    hourlyInstance?.resize();
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
    heatmapInstance?.dispose();
    calendarInstance?.dispose();
    monthlyInstance?.dispose();
    hourlyInstance?.dispose();
    matrixChart?.dispose();
    durationChart?.dispose();
    correlationChart?.dispose();
});
</script>

<template>
  <div class="analysis-view-container">
    <el-tabs v-model="activeTab" class="analysis-tabs">
      <!-- Tab 1: Temporal Distribution -->
      <el-tab-pane name="temporal">
        <template #label>
          <span class="custom-tab-label">
            <el-icon><Calendar /></el-icon>
            <span>时序分布</span>
          </span>
        </template>
        
        <div class="temporal-charts-grid">
          <!-- Row 1: Heatmap (Full Width) -->
          <div class="chart-wrapper full-width-chart">
             <div class="heatmap-controls">
               <el-radio-group v-model="heatmapViewMode" size="small">
                 <el-radio-button value="weekly">周 × 小时</el-radio-button>
                 <el-radio-button value="calendar">日历视图</el-radio-button>
               </el-radio-group>
             </div>
             <div v-show="heatmapViewMode === 'weekly'" ref="heatmapChartRef" class="chart-div"></div>
             <div v-show="heatmapViewMode === 'calendar'" ref="calendarChartRef" class="chart-div"></div>
          </div>
          
          <!-- Row 2: Monthly & Hourly -->
          <div class="split-charts-row">
            <div class="chart-wrapper half-width">
               <div ref="monthlyChartRef" class="chart-div"></div>
            </div>
            <div class="chart-wrapper half-width">
               <div ref="hourlyChartRef" class="chart-div"></div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 2: Multidimensional Patterns -->
      <el-tab-pane name="patterns">
        <template #label>
          <span class="custom-tab-label">
            <el-icon><DataAnalysis /></el-icon>
            <span>多维特征</span>
          </span>
        </template>
        
        <div class="patterns-grid">
           <!-- Row 1: Matrix (Full Width) -->
           <div class="chart-wrapper full-width-chart matrix-chart">
             <div class="chart-desc-floating">
               缺失矩阵：可视化全局缺失模式，识别系统性缺失。
             </div>
             <div ref="matrixChartRef" class="chart-div"></div>
           </div>

           <!-- Row 2: Duration & Correlation -->
           <div class="split-charts-row">
             <div class="chart-wrapper half-width">
               <div class="chart-desc-floating">
                 缺失时长：分析缺失片段的持续时间分布。
               </div>
               <div ref="durationChartRef" class="chart-div"></div>
             </div>
             <div class="chart-wrapper half-width">
               <div class="chart-desc-floating">
                 缺失相关性：不同变量间缺失发生的相关性。
               </div>
               <div ref="correlationChartRef" class="chart-div"></div>
             </div>
           </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.analysis-view-container {
  padding: 10px;
  background: var(--bg-color-overlay);
  border-radius: 8px;
}

.custom-tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.chart-wrapper {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  position: relative;
  transition: all 0.3s ease;
  margin-bottom: 16px;
}

.chart-wrapper:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.chart-div {
  width: 100%;
  height: 300px;
}

.full-width-chart .chart-div {
  height: 350px;
}

.matrix-chart .chart-div {
    height: 400px;
}

.split-charts-row {
  display: flex;
  gap: 16px;
}

.half-width {
  flex: 1;
  min-width: 0; /* Prevent overflow in flex */
}

.chart-desc-floating {
  position: absolute;
  top: 16px;
  left: 16px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #6b7280;
  z-index: 10;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0,0,0,0.05);
  pointer-events: none;
}

.heatmap-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  gap: 8px;
  align-items: center;
}

.heatmap-controls :deep(.el-radio-button__inner) {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
}

.heatmap-controls :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: 4px 0 0 4px;
}

.heatmap-controls :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 4px 4px 0;
}

.heatmap-controls :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #10b981;
  border-color: #10b981;
  box-shadow: none;
}

.heatmap-controls :deep(.el-radio-button__inner:hover) {
  color: #10b981;
}
</style>
