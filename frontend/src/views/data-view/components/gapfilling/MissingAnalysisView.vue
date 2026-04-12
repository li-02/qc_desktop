<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed, toRaw } from "vue";
import { BarChart2, Calendar } from "lucide-vue-next";
import * as echarts from "echarts";
import { useGapFillingStore } from "@/stores/useGapFillingStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";

const store = useGapFillingStore();
const datasetStore = useDatasetStore();
const activeTab = ref("temporal");
const heatmapViewMode = ref<"weekly" | "calendar">("weekly");

// ==================== Value Heatmap Column Selector ====================
// 所有非时间列（从 columnStats 获取）
const valueColumnOptions = computed(() => {
  return store.missingStats?.columnStats?.map(c => c.columnName) || [];
});

// 当前选中列（默认第一个）
const selectedValueColumn = ref<string>("");

// 已加载的列数据：Record<"YYYY-MM-DD HH", avgValue>
const valueHeatmapRaw = ref<Record<string, number>>({});
const valueHeatmapLoading = ref(false);

// 加载选中列的时序数据并聚合成 "YYYY-MM-DD HH" → avgValue
const loadValueColumnData = async (columnName: string) => {
  if (!columnName) return;
  const filePath = datasetStore.currentVersion?.filePath || datasetStore.currentDataset?.originalFile?.filePath;
  if (!filePath) return;

  valueHeatmapLoading.value = true;
  try {
    const missingValueTypes = toRaw(datasetStore.currentDataset?.missingValueTypes) || [];
    const result = await (window as any).electronAPI.invoke(API_ROUTES.FILES.READ_CSV_DATA, {
      filePath: String(filePath),
      columnName: String(columnName),
      missingValueTypes,
    });
    if (!result?.success || !result?.data?.tableData) return;

    // 聚合：每个 "YYYY-MM-DD HH" 桶内求均值
    const buckets: Record<string, { sum: number; count: number }> = {};
    for (const row of result.data.tableData) {
      const epochMs: number | null = row._epochMs;
      const value = row[columnName];
      if (epochMs === null || value === null || value === undefined || isNaN(Number(value))) continue;
      const d = new Date(epochMs);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hourStr = String(d.getHours()).padStart(2, "0");
      const key = `${dateStr} ${hourStr}`;
      if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
      buckets[key].sum += Number(value);
      buckets[key].count += 1;
    }
    // 转为均值 map
    const avgMap: Record<string, number> = {};
    for (const [key, { sum, count }] of Object.entries(buckets)) {
      avgMap[key] = sum / count;
    }
    valueHeatmapRaw.value = avgMap;
  } finally {
    valueHeatmapLoading.value = false;
  }
};

// 根据数据时间跨度决定 weekly 热力图的 Y 轴模式（月 or 周）
// 优先用已加载的值热力图数据，回退到缺失统计 heatmap
const heatmapWeeklyLabel = computed(() => {
  const src =
    Object.keys(valueHeatmapRaw.value).length > 0
      ? valueHeatmapRaw.value
      : store.missingStats?.timeDistribution?.heatmap || {};
  const dates = Object.keys(src).map(key => new Date(key.split(" ")[0]));
  const validDates = dates.filter(d => !isNaN(d.getTime()));
  if (validDates.length < 2) return "周 × 小时";
  const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
  const daySpan = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
  return daySpan >= 28 ? "月 × 小时" : "周 × 小时";
});

// 热力图顶部标题（DOM 渲染，替代 ECharts title）
const heatmapChartTitle = computed(() => {
  if (heatmapViewMode.value === "calendar") return "日历热力图 (每日总缺失数)";
  const mode = heatmapWeeklyLabel.value; // "月 × 小时" 或 "周 × 小时"
  const col = selectedValueColumn.value ? ` — ${selectedValueColumn.value}` : "";
  return `数据值热力图 (${mode})${col}`;
});

// ==================== Chart Refs ====================
// Temporal Charts (Real Data + Trend/Timeline)
const trendChartRef = ref<HTMLElement | null>(null);
const timelineChartRef = ref<HTMLElement | null>(null);
const heatmapChartRef = ref<HTMLElement | null>(null);
const calendarChartRef = ref<HTMLElement | null>(null);
const monthlyChartRef = ref<HTMLElement | null>(null);
const hourlyChartRef = ref<HTMLElement | null>(null);

// Pattern Charts (Features + Profile)
const matrixChartRef = ref<HTMLElement | null>(null);
const rankingChartRef = ref<HTMLElement | null>(null);
const durationChartRef = ref<HTMLElement | null>(null);
const profileChartRef = ref<HTMLElement | null>(null);

// Chart Instances
let trendChart: echarts.ECharts | null = null;
let timelineChart: echarts.ECharts | null = null;
let heatmapInstance: echarts.ECharts | null = null;
let calendarInstance: echarts.ECharts | null = null;
let monthlyInstance: echarts.ECharts | null = null;
let hourlyInstance: echarts.ECharts | null = null;
let matrixChart: echarts.ECharts | null = null;
let rankingChart: echarts.ECharts | null = null;
let durationChart: echarts.ECharts | null = null;
let profileChart: echarts.ECharts | null = null;

// ==================== Data Generators ====================
// 生成趋势数据
const generateTrendData = () => {
  const heatmap = store.missingStats?.timeDistribution?.heatmap || {};
  const daily: Record<string, number> = {};
  Object.entries(heatmap).forEach(([key, count]) => {
    const date = key.split(" ")[0];
    daily[date] = (daily[date] || 0) + count;
  });
  const sortedDates = Object.keys(daily).sort();

  if (sortedDates.length === 0) {
    const dates = [];
    const data = [];
    let base = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 24 * 3600 * 1000);
      dates.push(d.toISOString().split("T")[0]);
      data.push(Math.floor(Math.random() * 100));
    }
    return { dates, data };
  }
  return { dates: sortedDates, data: sortedDates.map(d => daily[d]) };
};

// 生成严重断流时间线数据
const generateTimelineData = () => {
  const columns = store.missingStats?.columnStats?.map(c => c.columnName).slice(0, 6) || ["Var A", "Var B", "Var C"];
  const data: any[] = [];
  const baseDate = new Date();

  for (let i = 0; i < 10; i++) {
    const colIdx = Math.floor(Math.random() * columns.length);
    const col = columns[colIdx];
    const startOff = Math.floor(Math.random() * 30);
    const duration = Math.floor(Math.random() * 72) + 12;
    const startTime = new Date(baseDate.getTime() - startOff * 24 * 3600 * 1000);
    const endTime = new Date(startTime.getTime() + duration * 3600 * 1000);
    data.push({
      name: col,
      value: [colIdx, startTime.getTime(), endTime.getTime(), duration],
      itemStyle: { color: "#ef4444" },
    });
  }
  return { columns, data };
};

// 生成缺失率排行数据
const generateRankingData = () => {
  const stats = store.missingStats?.columnStats || [];
  // 按缺失率升序（为了水平条形图从上到下是降序）
  const sorted = [...stats].sort((a, b) => a.missingRate - b.missingRate);
  if (sorted.length === 0) return { columns: ["Var 1"], rates: [0] };
  return {
    columns: sorted.map(c => c.columnName),
    rates: sorted.map(c => Number(c.missingRate.toFixed(2))),
  };
};

// 生成缺口类型画像数据
const generateProfileData = () => {
  const columns = store.missingStats?.columnStats?.map(c => c.columnName).slice(0, 10) || ["Var 1"];
  const categories = ["<1小时\n(闪断)", "1-6小时\n(短断流)", "6-24小时\n(日内停机)", ">24小时\n(长宕机)"];
  const data: any[] = [];

  columns.forEach((_col, i) => {
    categories.forEach((_cat, j) => {
      let val = 0;
      if (Math.random() > 0.4) {
        val = Math.floor(Math.random() * (100 / (j + 1)));
      }
      data.push([j, i, val]);
    });
  });
  return { columns, categories, data };
};

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
    { name: "1小时", value: Math.floor(Math.random() * 500) + 100 },
    { name: "2-6小时", value: Math.floor(Math.random() * 300) + 50 },
    { name: "6-24小时", value: Math.floor(Math.random() * 100) + 20 },
    { name: ">24小时", value: Math.floor(Math.random() * 50) + 5 },
  ];
};

// ==================== Temporal Analysis (Real Data) ====================
const updateTemporalCharts = async () => {
  if (!store.missingStats?.timeDistribution) return;

  await nextTick();
  const { monthly, hourly, heatmap } = store.missingStats.timeDistribution;

  // --- 1. Trend Chart (Missingness Trend Over Time) ---
  if (trendChartRef.value) {
    if (!trendChart) trendChart = echarts.init(trendChartRef.value);
    const { dates, data } = generateTrendData();

    trendChart.setOption({
      title: { text: "缺失数量时间演变趋势", left: "center", textStyle: { fontSize: 14, fontWeight: "normal" } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 40, bottom: 30, left: 50, right: 30 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: "#6b7280" },
        axisLine: { lineStyle: { color: "#d1d5db" } },
      },
      yAxis: {
        type: "value",
        name: "每日缺失总数",
        nameTextStyle: { color: "#6b7280" },
        splitLine: { lineStyle: { color: "#f3f4f6", type: "dashed" } },
      },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 5 }],
      series: [
        {
          data: data,
          type: "line",
          smooth: true,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(239, 68, 68, 0.5)" },
              { offset: 1, color: "rgba(239, 68, 68, 0.05)" },
            ]),
          },
          itemStyle: { color: "#ef4444" },
          symbolSize: 6,
        },
      ],
    });
  }

  // --- 2. Timeline Chart (Critical Gap Events) ---
  if (timelineChartRef.value) {
    if (!timelineChart) timelineChart = echarts.init(timelineChartRef.value);
    const { columns, data } = generateTimelineData();

    timelineChart.setOption({
      title: {
        text: "严重断流事件时间线 (Top Events)",
        left: "center",
        textStyle: { fontSize: 14, fontWeight: "normal" },
      },
      tooltip: {
        formatter: function (params: any) {
          const format = echarts.format.formatTime;
          return (
            params.marker +
            params.name +
            "<br/>" +
            "开始: " +
            format("yyyy-MM-dd hh:mm", params.value[1], false) +
            "<br/>" +
            "结束: " +
            format("yyyy-MM-dd hh:mm", params.value[2], false) +
            "<br/>" +
            "时长: " +
            params.value[3] +
            " 小时"
          );
        },
      },
      grid: { top: 40, bottom: 40, left: 100, right: 30 },
      xAxis: {
        type: "time",
        axisLabel: { formatter: (val: any) => echarts.format.formatTime("MM-dd", val, false), color: "#6b7280" },
        splitLine: { lineStyle: { color: "#f3f4f6" } },
      },
      yAxis: {
        type: "category",
        data: columns,
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "custom",
          renderItem: function (params: any, api: any) {
            const categoryIndex = api.value(0);
            const start = api.coord([api.value(1), categoryIndex]);
            const end = api.coord([api.value(2), categoryIndex]);
            const height = api.size([0, 1])[1] * 0.4;
            const rectShape = echarts.graphic.clipRectByRect(
              {
                x: start[0],
                y: start[1] - height / 2,
                width: end[0] - start[0] || 5, // minimum width
                height: height,
              },
              {
                x: params.coordSys.x,
                y: params.coordSys.y,
                width: params.coordSys.width,
                height: params.coordSys.height,
              }
            );
            return (
              rectShape && {
                type: "rect",
                transition: ["shape"],
                shape: rectShape,
                style: api.style(),
              }
            );
          },
          itemStyle: { color: "#ef4444", borderRadius: 2 },
          encode: { x: [1, 2], y: 0 },
          data: data,
        },
      ],
    });
  }

  // --- Monthly Chart ---
  if (monthlyChartRef.value) {
    if (!monthlyInstance) monthlyInstance = echarts.init(monthlyChartRef.value);
    const months = Object.keys(monthly).sort();
    const monthlyCounts = months.map(m => monthly[m]);

    monthlyInstance.setOption({
      title: {
        text: "月度缺失分布",
        left: "center",
        textStyle: { fontSize: 14, fontWeight: "normal" },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#e5e7eb",
        textStyle: { color: "#374151" },
        formatter: (params: any) => {
          const data = params[0];
          return `<b>${data.name}</b><br/>缺失数: <b>${data.value}</b>`;
        },
      },
      grid: { top: 50, bottom: 40, left: 60, right: 30 },
      xAxis: {
        type: "category",
        data: months,
        axisLine: { lineStyle: { color: "#d1d5db" } },
        axisTick: { lineStyle: { color: "#d1d5db" } },
        axisLabel: { color: "#6b7280" },
      },
      yAxis: {
        type: "value",
        name: "缺失数",
        nameTextStyle: { color: "#6b7280" },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#6b7280" },
        splitLine: { lineStyle: { color: "#f3f4f6", type: "dashed" } },
      },
      series: [
        {
          data: monthlyCounts,
          type: "bar",
          color: "#ef4444",
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: {
            itemStyle: {
              color: "#dc2626",
            },
          },
        },
      ],
    });
  }

  // --- Hourly Chart ---
  if (hourlyChartRef.value) {
    if (!hourlyInstance) hourlyInstance = echarts.init(hourlyChartRef.value);
    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
    const hourlyCounts = hours.map(h => hourly[h] || 0);

    hourlyInstance.setOption({
      title: {
        text: "每小时缺失分布 (昼夜模式)",
        left: "center",
        textStyle: { fontSize: 14, fontWeight: "normal" },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#e5e7eb",
        textStyle: { color: "#374151" },
        formatter: (params: any) => {
          const data = params[0];
          return `<b>${data.name}:00</b><br/>缺失数: <b>${data.value}</b>`;
        },
      },
      grid: { top: 50, bottom: 40, left: 60, right: 30 },
      xAxis: {
        type: "category",
        data: hours,
        axisLine: { lineStyle: { color: "#d1d5db" } },
        axisTick: { lineStyle: { color: "#d1d5db" } },
        axisLabel: { color: "#6b7280" },
      },
      yAxis: {
        type: "value",
        name: "缺失数",
        nameTextStyle: { color: "#6b7280" },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#6b7280" },
        splitLine: { lineStyle: { color: "#f3f4f6", type: "dashed" } },
      },
      series: [
        {
          data: hourlyCounts,
          type: "line",
          smooth: true,
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(239, 68, 68, 0.3)" },
                { offset: 1, color: "rgba(239, 68, 68, 0.05)" },
              ],
            },
          },
          lineStyle: { width: 2, color: "#ef4444" },
          itemStyle: { color: "#ef4444" },
          emphasis: {
            itemStyle: { color: "#dc2626", borderColor: "#fff", borderWidth: 2 },
          },
        },
      ],
    });
  }

  // --- Weekly / Monthly Value Heatmap (actual data values, not missing counts) ---
  if (heatmapViewMode.value === "weekly" && heatmapChartRef.value) {
    if (!heatmapInstance) heatmapInstance = echarts.init(heatmapChartRef.value);

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));

    // 使用已加载的实际值数据；若还未加载则回退到缺失计数 heatmap（只做时间范围判断）
    const valueData = valueHeatmapRaw.value;
    const srcForRange = Object.keys(valueData).length > 0 ? valueData : heatmap;

    // 分析数据时间跨度
    const dates = Object.keys(srcForRange).map(key => new Date(key.split(" ")[0]));
    const validDates = dates.filter(d => !isNaN(d.getTime()));

    if (validDates.length === 0) return;

    const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
    const daySpan = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

    // 判断时间跨度模式：< 1个月按周聚合，>= 1个月按天展开
    const isMultiYear = minDate.getFullYear() !== maxDate.getFullYear();
    const useMonthMode = daySpan >= 28;

    let yAxisData: string[];
    let yAxisRowCount: number;
    let tooltipFormatter: (params: any) => string;
    let yAxisName: string;
    let chartTitle: string;
    // 每格存均值（从 valueData 直接取，不再累加）
    const heatmapData: [number, number, number][] = [];

    if (useMonthMode) {
      // 按天展开：每行 = 一天
      const dayBuckets: Array<{ dateStr: string; year: number; month: number; day: number }> = [];
      const cur = new Date(minDate);
      cur.setHours(0, 0, 0, 0);
      const end = new Date(maxDate);
      end.setHours(0, 0, 0, 0);
      while (cur <= end) {
        const y = cur.getFullYear();
        const mo = cur.getMonth();
        const d = cur.getDate();
        const dateStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        dayBuckets.push({ dateStr, year: y, month: mo, day: d });
        cur.setDate(cur.getDate() + 1);
      }

      yAxisRowCount = dayBuckets.length;

      // 建立 dateStr → 行索引的快速查找 Map
      const dateToRowIdx = new Map<string, number>();
      dayBuckets.forEach((b, idx) => dateToRowIdx.set(b.dateStr, idx));

      // 填充热力图数据（直接使用均值，不渲染空格）
      Object.entries(valueData).forEach(([key, avgVal]) => {
        const [dateStr, hourStr] = key.split(" ");
        const rowIdx = dateToRowIdx.get(dateStr);
        const hourIndex = parseInt(hourStr);
        if (rowIdx !== undefined && hourIndex >= 0 && hourIndex < 24) {
          heatmapData.push([hourIndex, rowIdx, avgVal]);
        }
      });

      // 构建 Y 轴标签
      yAxisData = dayBuckets.map((b, idx) => {
        const isFirstDayOfMonth = b.day === 1 || idx === 0;
        if (!isFirstDayOfMonth) return "";
        if (isMultiYear && (b.month === 0 || idx === 0)) {
          return `{year|${b.year}}\n{month|${b.month + 1}月}` as any;
        }
        return `${b.month + 1}月`;
      });

      yAxisName = "月";
      chartTitle = `数据值热力图 (月 × 小时) — ${selectedValueColumn.value || ""}`;
      tooltipFormatter = (params: any) => {
        const hour = hours[params.data[0]];
        const bucket = dayBuckets[params.data[1]];
        const dateLabel = bucket
          ? isMultiYear
            ? `${bucket.year}年${bucket.month + 1}月${bucket.day}日`
            : `${bucket.month + 1}月${bucket.day}日`
          : "";
        const val = typeof params.data[2] === "number" ? params.data[2].toFixed(4) : "-";
        return `<b>${dateLabel}</b><br/>${hour}:00 时段<br/>${selectedValueColumn.value || "值"}: <b>${val}</b>`;
      };
    } else {
      // 按周聚合（weekIndex → 行）
      const totalWeeks = Math.ceil(daySpan / 7) + 1;
      yAxisRowCount = totalWeeks;
      yAxisData = Array.from({ length: totalWeeks }, (_, i) => (i + 1).toString());

      // 周×小时 聚合均值
      const weekBuckets: Record<string, { sum: number; count: number }> = {};
      Object.entries(valueData).forEach(([key, avgVal]) => {
        const [dateStr, hourStr] = key.split(" ");
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const weekIndex = Math.floor((date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
          const hourIndex = parseInt(hourStr);
          if (weekIndex >= 0 && weekIndex < totalWeeks && hourIndex >= 0 && hourIndex < 24) {
            const bk = `${weekIndex}_${hourIndex}`;
            if (!weekBuckets[bk]) weekBuckets[bk] = { sum: 0, count: 0 };
            weekBuckets[bk].sum += avgVal;
            weekBuckets[bk].count += 1;
          }
        }
      });
      Object.entries(weekBuckets).forEach(([bk, { sum, count }]) => {
        const [wi, hi] = bk.split("_").map(Number);
        heatmapData.push([hi, wi, sum / count]);
      });

      yAxisName = "周";
      chartTitle = `数据值热力图 (周 × 小时) — ${selectedValueColumn.value || ""}`;
      tooltipFormatter = (params: any) => {
        const hour = hours[params.data[0]];
        const weekNum = yAxisData[params.data[1]];
        const val = typeof params.data[2] === "number" ? params.data[2].toFixed(4) : "-";
        return `<b>第 ${weekNum} 周</b><br/>${hour}:00 时段<br/>${selectedValueColumn.value || "值"}: <b>${val}</b>`;
      };
    }

    // 全局 min / max（空数据时使用 0/1 占位）
    const allVals = heatmapData.map(d => d[2]);
    const maxVal = allVals.length > 0 ? Math.max(...allVals) : 1;
    const minVal = allVals.length > 0 ? Math.min(...allVals) : 0;

    // 动态调整高度：月模式每天约 8px，最高 1600px；周模式每周 20px，最高 800px
    const rowHeight = useMonthMode ? 8 : 20;
    const minHeight = useMonthMode ? 400 : 400;
    const maxHeight = useMonthMode ? 1600 : 800;
    const requiredHeight = Math.min(maxHeight, Math.max(minHeight, yAxisRowCount * rowHeight + 100));
    if (heatmapChartRef.value) {
      heatmapChartRef.value.style.height = `${requiredHeight}px`;
      if (heatmapInstance) heatmapInstance.resize();
    }

    // Y 轴标签 interval
    const yAxisLabelInterval = useMonthMode
      ? (index: number) => yAxisData[index] !== ""
      : (index: number) => index === 0 || index === yAxisRowCount - 1 || (index + 1) % 5 === 0;

    // 跨年 rich text 样式
    const yAxisRich =
      useMonthMode && isMultiYear
        ? {
            year: { color: "#374151", fontSize: 11, fontWeight: "bold", lineHeight: 16 },
            month: { color: "#6b7280", fontSize: 12, lineHeight: 16 },
          }
        : undefined;

    heatmapInstance.setOption(
      {
        tooltip: {
          position: "top",
          formatter: tooltipFormatter,
        },
        grid: { top: 20, bottom: 60, left: useMonthMode ? 70 : 60, right: 80 },
        xAxis: {
          type: "category",
          data: hours,
          name: "小时",
          nameLocation: "middle",
          nameGap: 30,
          nameTextStyle: { color: "#374151", fontSize: 14, fontWeight: "bold" },
          axisLine: { lineStyle: { color: "#d1d5db" } },
          axisTick: { show: true, lineStyle: { color: "#d1d5db" } },
          axisLabel: { color: "#6b7280" },
        },
        yAxis: {
          type: "category",
          data: yAxisData,
          name: yAxisName,
          nameLocation: "middle",
          nameGap: 40,
          nameRotate: 0,
          nameTextStyle: { color: "#374151", fontSize: 13, fontWeight: 500 },
          inverse: false,
          axisLine: { lineStyle: { color: "#d1d5db" } },
          axisTick: { show: true, lineStyle: { color: "#d1d5db" } },
          axisLabel: {
            color: "#6b7280",
            interval: yAxisLabelInterval,
            ...(yAxisRich ? { rich: yAxisRich } : {}),
          },
        },
        visualMap: {
          min: minVal,
          max: maxVal,
          calculable: true,
          orient: "vertical",
          right: 10,
          top: "center",
          show: true,
          text: ["高", "低"],
          textStyle: { color: "#6b7280", fontSize: 11 },
          inRange: {
            // 彩虹渐变：蓝→青→绿→黄→橙→红
            color: [
              "#313695",
              "#4575b4",
              "#74add1",
              "#abd9e9",
              "#e0f3f8",
              "#ffffbf",
              "#fee090",
              "#fdae61",
              "#f46d43",
              "#d73027",
              "#a50026",
            ],
          },
        },
        series: [
          {
            name: selectedValueColumn.value || "Value",
            type: "heatmap",
            data: heatmapData,
            label: { show: false },
            itemStyle: {
              borderWidth: 0,
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 6,
                shadowColor: "rgba(0, 0, 0, 0.4)",
                borderColor: "#374151",
                borderWidth: 1,
              },
            },
          },
        ],
      },
      { notMerge: true }
    );
  }
  if (heatmapViewMode.value === "calendar" && calendarChartRef.value) {
    if (!calendarInstance) calendarInstance = echarts.init(calendarChartRef.value);

    // 计算每天的总缺失数
    const dailyMissing: Record<string, number> = {};
    Object.entries(heatmap).forEach(([key, count]) => {
      const dateStr = key.split(" ")[0];
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
      tooltip: {
        formatter: (params: any) => {
          const date = params.data[0];
          const count = params.data[1];
          return `<b>${date}</b><br/>缺失数: <b>${count}</b>`;
        },
      },
      visualMap: {
        min: 0,
        max: Math.max(...calendarData.map(d => d[1] as number)) || 1,
        calculable: true,
        orient: "vertical",
        right: 10,
        top: "center",
        show: true,
        text: ["高", "低"],
        textStyle: { color: "#6b7280", fontSize: 11 },
        inRange: {
          color: ["#f9fafb", "#fee2e2", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c"],
        },
      },
      calendar: Array.from({ length: yearSpan }, (_, i) => ({
        top: 60 + i * 180,
        range: minDate.getFullYear() + i,
        cellSize: ["auto", 13],
        yearLabel: { show: true, fontSize: 16, color: "#374151" },
        monthLabel: { fontSize: 11, color: "#6b7280" },
        dayLabel: { fontSize: 11, color: "#6b7280", firstDay: 1 },
        splitLine: { show: true, lineStyle: { color: "#e5e7eb", width: 1 } },
        itemStyle: {
          borderWidth: 2,
          borderColor: "#fff",
        },
      })),
      series: {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: calendarData,
      },
    });
  }
};

// ==================== Structural Analysis (Mock/Future Data) ====================
const updateStructuralCharts = async () => {
  await nextTick();

  // 1. Matrix Chart
  if (matrixChartRef.value) {
    if (!matrixChart) matrixChart = echarts.init(matrixChartRef.value);
    const { columns, data, timeBins } = generateMatrixData();

    matrixChart.setOption({
      title: { text: "缺失矩阵 (Global Pattern)", left: "center", textStyle: { fontSize: 14 } },
      tooltip: { position: "top" },
      grid: { top: 40, bottom: 20, left: 100, right: 20 },
      xAxis: {
        type: "category",
        data: Array.from({ length: timeBins }, (_, i) => i + 1),
        name: "Time",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
      },
      yAxis: {
        type: "category",
        data: columns,
        axisLabel: { width: 90, overflow: "truncate" },
      },
      visualMap: {
        min: 0,
        max: 1,
        show: false,
        inRange: { color: ["#f3f4f6", "#ef4444"] },
      },
      series: [
        {
          name: "Missing Status",
          type: "heatmap",
          data: data,
          itemStyle: { borderColor: "#fff", borderWidth: 1 },
        },
      ],
    });
  }

  // 2. Ranking Chart (Missing Rate Ranking)
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

  // 3. Duration Chart
  if (durationChartRef.value) {
    if (!durationChart) durationChart = echarts.init(durationChartRef.value);
    const data = generateDurationData();

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
          data: data,
        },
      ],
    });
  }

  // 4. Profile Chart (Gap Size Profile)
  if (profileChartRef.value) {
    if (!profileChart) profileChart = echarts.init(profileChartRef.value);
    const { columns, categories, data } = generateProfileData();

    profileChart.setOption({
      title: { text: "各变量缺失缺口特征画像", left: "center", textStyle: { fontSize: 14, fontWeight: "normal" } },
      tooltip: {
        position: "top",
        formatter: (params: any) =>
          `${columns[params.value[1]]}<br/>${categories[params.value[0]].replace("\n", "")}: ${params.value[2]} 次`,
      },
      grid: { top: 50, bottom: 40, left: 100, right: 30 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { color: "#6b7280" },
        splitArea: { show: true },
      },
      yAxis: {
        type: "category",
        data: columns,
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max: Math.max(...data.map(d => d[2])) || 1,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemWidth: 10,
        itemHeight: 80,
        text: ["高频", "低频"],
        inRange: { color: ["#fef2f2", "#fca5a5", "#ef4444", "#b91c1c"] },
        show: false,
      },
      series: [
        {
          type: "heatmap",
          data: data,
          label: {
            show: true,
            color: "#fff",
            formatter: (params: any) => (params.value[2] > 0 ? params.value[2] : ""),
          },
          itemStyle: { borderColor: "#fff", borderWidth: 2 },
        },
      ],
    });
  }
};

// ==================== Lifecycle & Watchers ====================
const initCharts = () => {
  if (activeTab.value === "temporal") {
    updateTemporalCharts();
  } else {
    updateStructuralCharts();
  }
};

watch(
  () => store.missingStats,
  () => {
    initCharts();
  },
  { deep: true }
);

watch(activeTab, () => {
  setTimeout(initCharts, 100);
});

watch(heatmapViewMode, () => {
  setTimeout(initCharts, 100);
});

// 当列列表可用时，自动选中第一列并加载数据
watch(
  valueColumnOptions,
  async cols => {
    if (cols.length > 0 && !selectedValueColumn.value) {
      selectedValueColumn.value = cols[0];
      await loadValueColumnData(cols[0]);
      updateTemporalCharts();
    }
  },
  { immediate: true }
);

// 当选中列改变时，重新加载数据并刷新图表
watch(selectedValueColumn, async col => {
  if (col) {
    await loadValueColumnData(col);
    updateTemporalCharts();
  }
});

const handleResize = () => {
  trendChart?.resize();
  timelineChart?.resize();
  heatmapInstance?.resize();
  calendarInstance?.resize();
  monthlyInstance?.resize();
  hourlyInstance?.resize();
  matrixChart?.resize();
  rankingChart?.resize();
  durationChart?.resize();
  profileChart?.resize();
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
  initCharts();
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  trendChart?.dispose();
  timelineChart?.dispose();
  heatmapInstance?.dispose();
  calendarInstance?.dispose();
  monthlyInstance?.dispose();
  hourlyInstance?.dispose();
  matrixChart?.dispose();
  rankingChart?.dispose();
  durationChart?.dispose();
  profileChart?.dispose();
});
</script>

<template>
  <div class="analysis-view-container">
    <el-tabs v-model="activeTab" class="analysis-tabs">
      <!-- Tab 1: Temporal Distribution -->
      <el-tab-pane name="temporal">
        <template #label>
          <span class="custom-tab-label">
            <Calendar :size="14" />
            <span>时序演变 (Temporal)</span>
          </span>
        </template>

        <div class="temporal-charts-grid">
          <!-- Row 1: Heatmap -->
          <div class="chart-wrapper full-width-chart heatmap-container">
            <div class="heatmap-controls">
              <span class="heatmap-title">{{ heatmapChartTitle }}</span>
              <div class="heatmap-controls-right">
                <el-select
                  v-if="heatmapViewMode === 'weekly' && valueColumnOptions.length > 0"
                  v-model="selectedValueColumn"
                  size="small"
                  placeholder="选择列"
                  style="width: 160px"
                  :loading="valueHeatmapLoading">
                  <el-option v-for="col in valueColumnOptions" :key="col" :label="col" :value="col" />
                </el-select>
                <el-radio-group v-model="heatmapViewMode" size="small">
                  <el-radio-button value="weekly">{{ heatmapWeeklyLabel }}</el-radio-button>
                  <el-radio-button value="calendar">日历视图</el-radio-button>
                </el-radio-group>
              </div>
            </div>
            <div v-show="heatmapViewMode === 'weekly'" ref="heatmapChartRef" class="chart-div heatmap-chart-div"></div>
            <div
              v-show="heatmapViewMode === 'calendar'"
              ref="calendarChartRef"
              class="chart-div heatmap-chart-div"></div>
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

          <!-- Row 3: Trend Over Time (bottom) -->
          <div class="chart-wrapper full-width-chart">
            <div class="chart-desc-floating">缺失趋势：观察数据质量随时间的动态演变，识别季节性或突发性劣化。</div>
            <div ref="trendChartRef" class="chart-div"></div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 2: Multidimensional Patterns -->
      <el-tab-pane name="patterns">
        <template #label>
          <span class="custom-tab-label">
            <BarChart2 :size="14" />
            <span>特征与模式 (Profiles)</span>
          </span>
        </template>

        <div class="patterns-grid">
          <!-- Row 1: Matrix (Full Width) -->
          <div class="chart-wrapper full-width-chart matrix-chart">
            <div class="chart-desc-inline">缺失矩阵：可视化全局缺失模式，直观识别多传感器同时失效的系统性问题。</div>
            <div ref="matrixChartRef" class="chart-div"></div>
          </div>

          <!-- Row 2: Ranking & Duration -->
          <div class="split-charts-row">
            <div class="chart-wrapper half-width">
              <div class="chart-desc-inline">缺失排行：量化对比，精准定位数据质量最差的变量。</div>
              <div ref="rankingChartRef" class="chart-div"></div>
            </div>
            <div class="chart-wrapper half-width">
              <div class="chart-desc-inline">总体时长分布：评估整体数据集的缺口连续性特征。</div>
              <div ref="durationChartRef" class="chart-div"></div>
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
  border-radius: var(--radius-panel);
}

.custom-tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-md);
}

.chart-wrapper {
  background: var(--c-bg-surface);
  border-radius: var(--radius-panel);
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
  height: 300px;
}

.heatmap-chart-div {
  height: 400px !important;
}

.matrix-chart .chart-div {
  height: 350px;
}

.profile-chart .chart-div {
  height: 350px;
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
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  z-index: 10;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  pointer-events: none;
}

.chart-desc-inline {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  padding: 0 2px 8px;
  line-height: 1.4;
}

.chart-desc-inline {
  font-size: var(--text-sm);
  color: #9ca3af;
  padding: 0 2px 8px;
  line-height: 1.4;
}

.heatmap-controls {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
}

.heatmap-title {
  flex: 1;
  text-align: center;
  font-size: 14px;
  color: var(--c-text-secondary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.heatmap-controls-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.heatmap-controls :deep(.el-radio-button__inner) {
  padding: 6px 12px;
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
}

.heatmap-controls :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.heatmap-controls :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.heatmap-controls :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--c-brand);
  border-color: var(--c-brand);
  box-shadow: none;
}

.heatmap-controls :deep(.el-radio-button__inner:hover) {
  color: var(--c-brand);
}
</style>
