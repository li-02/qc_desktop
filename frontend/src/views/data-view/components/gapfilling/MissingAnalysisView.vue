<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed, toRaw } from "vue";
import * as echarts from "echarts";
import { useGapFillingStore } from "@/stores/useGapFillingStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useDataViewStore } from "@/stores/useDataViewStore";
import MissingOverviewCharts from "./MissingOverviewCharts.vue";
import { readCsvColumnData } from "@/utils/csvColumnDataCache";

const store = useGapFillingStore();
const datasetStore = useDatasetStore();
const dataViewStore = useDataViewStore();
const heatmapViewMode = ref<"weekly" | "calendar">("weekly");

// ==================== Value Heatmap Column Selector ====================
// 所有非时间列（从 columnStats 获取）
const valueColumnOptions = computed(() => {
  return store.missingStats?.columnStats?.map(c => c.columnName) || [];
});

// 当前数值热力图列和数据由 data view store 统一管理
const selectedValueColumn = computed({
  get: () => dataViewStore.valueHeatmap.column,
  set: value => {
    dataViewStore.setValueHeatmapColumn(value);
  },
});
const valueHeatmapRaw = computed(() => dataViewStore.valueHeatmap.data);
const valueHeatmapLoading = computed(() => dataViewStore.valueHeatmap.status === "loading");
const valueHeatmapStatus = computed(() => dataViewStore.valueHeatmap.status);
const valueHeatmapError = computed(() => dataViewStore.valueHeatmap.error);

type MissingTemporalDistribution = {
  monthly: Record<string, number>;
  hourly: Record<string, number>;
  heatmap: Record<string, number>;
};

const selectedMissingColumn = ref<string>("");
const missingTemporalLoading = ref(false);
const missingTemporalDistribution = ref<MissingTemporalDistribution | null>(null);
let missingTemporalRequestId = 0;

const selectedMissingColumnLabel = computed(() => selectedMissingColumn.value || "未选择列");
const statsTargetKey = computed(() =>
  store.missingStats ? `${store.missingStats.datasetId}:${store.missingStats.versionId}` : ""
);
const currentFilePath = computed(
  () => datasetStore.currentVersion?.filePath || datasetStore.currentDataset?.originalFile?.filePath || ""
);
const currentMissingValueTypes = computed(() => toRaw(datasetStore.currentDataset?.missingValueTypes) || []);
const valueHeatmapReady = computed(
  () =>
    valueHeatmapStatus.value === "ready" &&
    !!selectedValueColumn.value &&
    dataViewStore.valueHeatmap.key === dataViewStore.buildColumnKey(selectedValueColumn.value)
);
const showValueHeatmapLoading = computed(
  () =>
    heatmapViewMode.value === "weekly" &&
    !!selectedValueColumn.value &&
    !valueHeatmapReady.value &&
    valueHeatmapStatus.value !== "empty" &&
    valueHeatmapStatus.value !== "error"
);
const showValueHeatmapEmpty = computed(
  () => heatmapViewMode.value === "weekly" && valueHeatmapStatus.value === "empty"
);
const showValueHeatmapError = computed(
  () => heatmapViewMode.value === "weekly" && valueHeatmapStatus.value === "error"
);

const isMissingValue = (value: unknown, markers: string[]) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value !== "string") return false;

  const raw = value;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  return markers.includes(raw) || markers.includes(trimmed) || lower === "nan" || lower === "na";
};

const createEmptyDistribution = (): MissingTemporalDistribution => ({
  monthly: {},
  hourly: {},
  heatmap: {},
});

const getMissingAxisMax = (values: number[]) => (values.some(value => value > 0) ? undefined : 1);

const buildCsvColumnRequest = (columnName: string) => ({
  datasetId: datasetStore.currentDataset?.id,
  versionId: datasetStore.currentVersion?.id,
  filePath: currentFilePath.value,
  columnName,
  missingValueTypes: currentMissingValueTypes.value,
});

const loadMissingColumnDistribution = async (columnName: string) => {
  const requestId = ++missingTemporalRequestId;
  const datasetId = datasetStore.currentDataset?.id;
  const versionId = datasetStore.currentVersion?.id;
  if (!columnName) {
    missingTemporalDistribution.value = null;
    return;
  }
  const filePath = currentFilePath.value;
  if (!filePath) return;

  missingTemporalLoading.value = true;
  try {
    const missingValueTypes = currentMissingValueTypes.value;
    const markers = Array.from(new Set([...(store.missingStats?.missingMarkers || []), ...missingValueTypes]));
    const result = await readCsvColumnData(buildCsvColumnRequest(columnName));
    const isCurrentRequest =
      requestId === missingTemporalRequestId &&
      datasetStore.currentDataset?.id === datasetId &&
      datasetStore.currentVersion?.id === versionId &&
      selectedMissingColumn.value === columnName;
    if (!isCurrentRequest) return;
    if (!result?.success || !result?.data?.tableData) {
      missingTemporalDistribution.value = createEmptyDistribution();
      return;
    }

    const distribution = createEmptyDistribution();
    for (const row of result.data.tableData) {
      const epochMs: number | null = row._epochMs;
      if (epochMs === null || epochMs === undefined) continue;

      const d = new Date(epochMs);
      if (Number.isNaN(d.getTime())) continue;

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const dateKey = `${monthKey}-${String(d.getDate()).padStart(2, "0")}`;
      const hourKey = String(d.getHours()).padStart(2, "0");
      const heatmapKey = `${dateKey} ${hourKey}`;

      distribution.monthly[monthKey] = distribution.monthly[monthKey] || 0;
      distribution.hourly[hourKey] = distribution.hourly[hourKey] || 0;
      distribution.heatmap[heatmapKey] = distribution.heatmap[heatmapKey] || 0;

      if (isMissingValue(row[columnName], markers)) {
        distribution.monthly[monthKey] += 1;
        distribution.hourly[hourKey] += 1;
        distribution.heatmap[heatmapKey] += 1;
      }
    }

    missingTemporalDistribution.value = distribution;
  } finally {
    if (requestId === missingTemporalRequestId) {
      missingTemporalLoading.value = false;
    }
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

// Chart Instances
let trendChart: echarts.ECharts | null = null;
let timelineChart: echarts.ECharts | null = null;
let heatmapInstance: echarts.ECharts | null = null;
let calendarInstance: echarts.ECharts | null = null;
let monthlyInstance: echarts.ECharts | null = null;
let hourlyInstance: echarts.ECharts | null = null;

// ==================== Data Generators ====================
// 生成趋势数据
const generateTrendData = () => {
  const heatmap = missingTemporalDistribution.value?.heatmap || store.missingStats?.timeDistribution?.heatmap || {};
  const daily: Record<string, number> = {};
  Object.entries(heatmap).forEach(([key, count]) => {
    const date = key.split(" ")[0];
    daily[date] = (daily[date] || 0) + count;
  });
  const sortedDates = Object.keys(daily).sort();

  if (sortedDates.length === 0) {
    return { dates: [], data: [] };
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

// ==================== Temporal Analysis (Real Data) ====================
const updateTemporalCharts = async () => {
  if (!store.missingStats?.timeDistribution) {
    trendChart?.clear();
    timelineChart?.clear();
    heatmapInstance?.clear();
    calendarInstance?.clear();
    monthlyInstance?.clear();
    hourlyInstance?.clear();
    return;
  }

  await nextTick();
  const temporalDistribution = missingTemporalDistribution.value || store.missingStats.timeDistribution;
  const { monthly, hourly, heatmap } = temporalDistribution;

  // --- 1. Trend Chart (Missingness Trend Over Time) ---
  if (trendChartRef.value) {
    if (!trendChart) trendChart = echarts.init(trendChartRef.value);
    const { dates, data } = generateTrendData();
    const trendAxisMax = getMissingAxisMax(data);

    trendChart.setOption({
      title: {
        text: `缺失数量时间演变趋势 — ${selectedMissingColumnLabel.value}`,
        left: "center",
        textStyle: { fontSize: 14, fontWeight: "normal" },
      },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 40, bottom: 82, left: 50, right: 30 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: "#6b7280", margin: 12 },
        axisLine: { lineStyle: { color: "#d1d5db" } },
      },
      yAxis: {
        type: "value",
        name: "每日缺失总数",
        max: trendAxisMax,
        nameTextStyle: { color: "#6b7280" },
        splitLine: { lineStyle: { color: "#f3f4f6", type: "dashed" } },
      },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 22, bottom: 8 }],
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
    const monthlyAxisMax = getMissingAxisMax(monthlyCounts);

    monthlyInstance.setOption({
      title: {
        text: `月度缺失分布 — ${selectedMissingColumnLabel.value}`,
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
        max: monthlyAxisMax,
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
    const hourlyAxisMax = getMissingAxisMax(hourlyCounts);

    hourlyInstance.setOption({
      title: {
        text: `每小时缺失分布 — ${selectedMissingColumnLabel.value}`,
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
        max: hourlyAxisMax,
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

    if (!valueHeatmapReady.value) {
      heatmapInstance.clear();
      return;
    }

    // 使用已加载的实际值数据。数值数据未就绪时不再回退画空坐标轴。
    const valueData = valueHeatmapRaw.value;
    if (Object.keys(valueData).length === 0) {
      heatmapInstance.clear();
      return;
    }
    const srcForRange = valueData;

    // 分析数据时间跨度
    const dates = Object.keys(srcForRange).map(key => new Date(key.split(" ")[0]));
    const validDates = dates.filter(d => !isNaN(d.getTime()));

    if (validDates.length === 0) {
      heatmapInstance.clear();
      return;
    }

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

    if (calendarData.length === 0) {
      calendarInstance.clear();
      return;
    }

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

// ==================== Lifecycle & Watchers ====================
const initCharts = () => {
  updateTemporalCharts();
};

watch(
  () => store.missingStats,
  () => {
    initCharts();
  },
  { deep: true }
);

watch(statsTargetKey, async () => {
  missingTemporalRequestId++;
  missingTemporalDistribution.value = null;
  selectedMissingColumn.value = "";
  missingTemporalLoading.value = false;
  heatmapInstance?.clear();
  calendarInstance?.clear();
  monthlyInstance?.clear();
  hourlyInstance?.clear();
  trendChart?.clear();
  timelineChart?.clear();

  await nextTick();
  const firstColumn = valueColumnOptions.value[0];
  if (firstColumn) {
    await dataViewStore.ensureValueHeatmapColumn(valueColumnOptions.value);
    selectedMissingColumn.value = firstColumn;
    await loadMissingColumnDistribution(firstColumn);
    updateTemporalCharts();
  }
});

watch(heatmapViewMode, () => {
  setTimeout(initCharts, 100);
});

// 当列列表可用时，自动选中第一列并加载数据
watch(
  valueColumnOptions,
  async cols => {
    const valueColumnStillExists = cols.includes(selectedValueColumn.value);
    const missingColumnStillExists = cols.includes(selectedMissingColumn.value);

    if (cols.length === 0) {
      selectedMissingColumn.value = "";
      await dataViewStore.ensureValueHeatmapColumn([]);
      missingTemporalDistribution.value = null;
      updateTemporalCharts();
      return;
    }

    if (!selectedValueColumn.value || !valueColumnStillExists) {
      await dataViewStore.ensureValueHeatmapColumn(cols);
      updateTemporalCharts();
    }
    if (!selectedMissingColumn.value || !missingColumnStillExists) {
      selectedMissingColumn.value = cols[0];
      await loadMissingColumnDistribution(cols[0]);
      updateTemporalCharts();
    }
  },
  { immediate: true }
);

// 当选中列改变时，重新加载数据并刷新图表
watch(
  () => [
    dataViewStore.valueHeatmap.status,
    dataViewStore.valueHeatmap.key,
    Object.keys(dataViewStore.valueHeatmap.data).length,
  ],
  () => updateTemporalCharts()
);

watch(selectedMissingColumn, async col => {
  if (col) {
    await loadMissingColumnDistribution(col);
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
});
</script>

<template>
  <div class="analysis-view-container">
    <div class="temporal-charts-grid">
      <div class="temporal-group-title">数值时序模式</div>

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
        <div v-if="showValueHeatmapLoading" class="heatmap-state-overlay">
          <div class="heatmap-state-spinner"></div>
          <span>正在加载数值时序数据...</span>
        </div>
        <div v-else-if="showValueHeatmapEmpty" class="heatmap-state-overlay">
          <span>当前列没有可绘制的数值时序数据</span>
        </div>
        <div v-else-if="showValueHeatmapError" class="heatmap-state-overlay heatmap-state-overlay--error">
          <span>{{ valueHeatmapError || "数值时序数据加载失败" }}</span>
        </div>
        <div v-show="heatmapViewMode === 'calendar'" ref="calendarChartRef" class="chart-div heatmap-chart-div"></div>
      </div>

      <MissingOverviewCharts />

      <div class="temporal-group-toolbar">
        <div class="temporal-group-title">缺失时序模式</div>
        <div class="temporal-column-control">
          <span class="temporal-column-label">分析列</span>
          <el-select
            v-model="selectedMissingColumn"
            size="small"
            placeholder="选择缺失分析列"
            style="width: 180px"
            filterable
            :loading="missingTemporalLoading">
            <el-option v-for="col in valueColumnOptions" :key="col" :label="col" :value="col" />
          </el-select>
        </div>
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
        <div ref="trendChartRef" class="chart-div trend-chart-div"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analysis-view-container {
  padding: 10px;
  background: var(--bg-color-overlay);
  border-radius: var(--radius-panel);
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

.temporal-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 10px;
  color: var(--c-text-primary);
  font-size: var(--text-md);
  font-weight: 700;
}

.temporal-group-title::before {
  content: "";
  width: 4px;
  height: 16px;
  border-radius: var(--radius-sm);
  background: var(--c-brand);
}

.temporal-group-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 4px 0 10px;
}

.temporal-group-toolbar .temporal-group-title {
  margin: 0;
}

.temporal-column-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.temporal-column-label {
  color: var(--c-text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
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

.heatmap-state-overlay {
  position: absolute;
  inset: 56px 16px 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--c-text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
  background: rgba(255, 255, 255, 0.76);
  border-radius: var(--radius-panel);
  pointer-events: none;
}

.heatmap-state-overlay--error {
  color: var(--c-danger);
}

.heatmap-state-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--c-border);
  border-top-color: var(--c-brand);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.trend-chart-div {
  height: 360px !important;
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
