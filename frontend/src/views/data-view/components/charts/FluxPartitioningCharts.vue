<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from "vue";
import * as echarts from "echarts";
import { API_ROUTES } from "@shared/constants/apiRoutes";

interface Props {
  /** CSV 文件路径，组件自行加载 */
  filePath?: string;
  /** 或者直接传入 CSV 行数据 [{record_time, gpp, reco, nee, ...}] */
  csvData?: Record<string, any>[];
}

const props = withDefaults(defineProps<Props>(), {});

// ==================== 内部数据状态 ====================
const internalData = ref<Record<string, any>[]>([]);
const loading = ref(false);
const errorMsg = ref("");

// 自动检测列名
const columnNames = computed(() => {
  const data = effectiveData.value;
  if (!data.length) return { time: "record_time", gpp: "gpp", reco: "reco", nee: "nee" };
  const keys = Object.keys(data[0]);
  // 精确匹配（大小写不敏感）
  const exact = (names: string[]) => keys.find(k => names.some(n => k.toLowerCase() === n.toLowerCase()));
  // 前缀匹配（大小写不敏感），用于 REddyProc 输出列名如 GPP_f, Reco_DT 等
  const prefix = (prefixes: string[]) =>
    keys.find(k => prefixes.some(p => k.toLowerCase().startsWith(p.toLowerCase())));
  return {
    time: exact(["record_time", "datetime", "timestamp", "date", "time"]) || keys[0],
    gpp: exact(["gpp", "gpp_nt_vut_ref", "gpp_dt_vut_ref", "gpp_f", "gpp_dt_f"]) || prefix(["GPP_"]) || "gpp",
    reco: exact(["reco", "reco_nt_vut_ref", "reco_dt_vut_ref", "reco_dt", "reco_f"]) || prefix(["Reco"]) || "reco",
    nee: exact(["nee", "nee_vut_ref", "co2_flux", "nee_f"]) || prefix(["NEE"]) || "nee",
    rg: exact(["rg", "rg_1_1_2", "sw_in", "ppfd", "rg_f"]),
    tair: exact(["tair", "ta", "ta_1_2_1", "tair_f"]),
  };
});

// 优先使用外部传入的 csvData, 否则用内部加载的
const effectiveData = computed(() => {
  if (props.csvData && props.csvData.length > 0) return props.csvData;
  return internalData.value;
});

// 通过 filePath 加载 CSV 数据
const loadDataFromFile = async (filePath: string) => {
  loading.value = true;
  errorMsg.value = "";
  noValidData.value = false;
  console.log("[FluxCharts] 开始加载文件:", filePath);
  try {
    const resp = await window.electronAPI.invoke(API_ROUTES.FILES.READ_CSV_DATA, { filePath });
    if (!resp?.success) throw new Error(resp?.error || "读取失败");
    internalData.value = resp.data?.tableData || [];
    console.log(`[FluxCharts] 加载完成, ${internalData.value.length} 行数据`);
    if (internalData.value.length === 0) {
      errorMsg.value = "文件为空或格式错误";
    }
  } catch (e: any) {
    console.error("FluxPartitioningCharts: 加载数据失败", e);
    errorMsg.value = e.message || "加载失败";
    internalData.value = [];
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.filePath,
  fp => {
    if (fp) loadDataFromFile(fp);
  },
  { immediate: true }
);

// ==================== 图表 tab 切换 ====================
type ChartTab = "timeseries" | "monthly" | "cumulative" | "light" | "temperature";
const activeTab = ref<ChartTab>("timeseries");

// ==================== 时间粒度切换 ====================
type TimeGranularity = "daily" | "monthly";
const timeGranularity = ref<TimeGranularity>("daily");

// ==================== 图表容器 ====================
const timeseriesRef = ref<HTMLDivElement>();
const monthlyRef = ref<HTMLDivElement>();
const cumulativeRef = ref<HTMLDivElement>();
const lightRef = ref<HTMLDivElement>();
const temperatureRef = ref<HTMLDivElement>();

let timeseriesChart: echarts.ECharts | null = null;
let monthlyChart: echarts.ECharts | null = null;
let cumulativeChart: echarts.ECharts | null = null;
let lightChart: echarts.ECharts | null = null;
let temperatureChart: echarts.ECharts | null = null;

// ==================== 碳平衡统计 ====================
const carbonBalance = computed(() => {
  if (!effectiveData.value?.length) return null;
  const { gpp: gppCol, reco: recoCol, nee: neeCol } = columnNames.value;
  let gppSum = 0,
    recoSum = 0,
    neeSum = 0;
  let count = 0;

  for (const row of effectiveData.value) {
    const g = parseFloat(row[gppCol]);
    const r = parseFloat(row[recoCol]);
    const n = parseFloat(row[neeCol]);
    if (!isNaN(g) && !isNaN(r) && !isNaN(n)) {
      gppSum += g;
      recoSum += r;
      neeSum += n;
      count++;
    }
  }

  if (count === 0) return null;

  // 简化单位转换: μmol CO₂ m⁻² s⁻¹ (日均) → g C m⁻² day⁻¹
  // 1 μmol CO₂ = 12 μg C, 1天=86400s → 因子 = 12e-6 * 86400 ≈ 1.0368
  // 但此处数据已经是日均值, 直接累加作为相对量
  const gppTotal = gppSum;
  const recoTotal = recoSum;
  const neeTotal = neeSum;
  const cue = gppTotal > 0 ? 1 - recoTotal / gppTotal : 0;
  const gppRecoRatio = recoTotal !== 0 ? gppTotal / recoTotal : 0;

  return {
    gppTotal: gppTotal.toFixed(2),
    recoTotal: recoTotal.toFixed(2),
    neeTotal: neeTotal.toFixed(2),
    cue: cue.toFixed(4),
    gppRecoRatio: gppRecoRatio.toFixed(4),
    dataPoints: count,
    isSink: neeTotal < 0,
  };
});

// 数据解析是否为空
const noValidData = ref(false);

// ==================== 数据处理辅助函数 ====================
const parseData = () => {
  const { time: timeCol, gpp: gppCol, reco: recoCol, nee: neeCol, rg: rgCol, tair: tairCol } = columnNames.value;
  const times: string[] = [];
  const gpps: number[] = [];
  const recos: number[] = [];
  const nees: number[] = [];
  const rgs: number[] = [];
  const tairs: number[] = [];

  const data = effectiveData.value;
  if (data.length > 0) {
    const sampleKeys = Object.keys(data[0]);
    console.log("[FluxCharts] 数据列:", sampleKeys.join(", "));
    console.log("[FluxCharts] 检测到列映射:", { time: timeCol, gpp: gppCol, reco: recoCol, nee: neeCol });
  }

  for (const row of data) {
    const t = row[timeCol];
    const g = parseFloat(row[gppCol]);
    const r = parseFloat(row[recoCol]);
    const n = parseFloat(row[neeCol]);
    if (!t || isNaN(g) || isNaN(r) || isNaN(n)) continue;
    times.push(String(t));
    gpps.push(g);
    recos.push(r);
    nees.push(n);

    if (rgCol && row[rgCol] !== undefined) {
      const rgVal = parseFloat(row[rgCol]);
      rgs.push(isNaN(rgVal) ? NaN : rgVal);
    }
    if (tairCol && row[tairCol] !== undefined) {
      const tairVal = parseFloat(row[tairCol]);
      tairs.push(isNaN(tairVal) ? NaN : tairVal);
    }
  }

  noValidData.value = data.length > 0 && times.length === 0;
  if (noValidData.value) {
    const sampleKeys = data[0] ? Object.keys(data[0]).join(", ") : "N/A";
    console.warn(
      `[FluxCharts] 数据有 ${data.length} 行但无有效解析行。列名: ${sampleKeys}，期望: time=${timeCol}, gpp=${gppCol}, reco=${recoCol}, nee=${neeCol}`
    );
  }

  return { times, gpps, recos, nees, rgs, tairs };
};

const groupByMonth = (times: string[], values: number[]) => {
  const monthMap: Record<string, number[]> = {};
  for (let i = 0; i < times.length; i++) {
    const d = new Date(times[i]);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(values[i]);
  }
  return monthMap;
};

// ==================== 图表1: 时间序列叠加图 ====================
const renderTimeseries = () => {
  if (!timeseriesRef.value || !effectiveData.value?.length) return;

  const { times, gpps, recos, nees } = parseData();
  if (times.length === 0) return;

  if (!timeseriesChart) {
    timeseriesChart = echarts.init(timeseriesRef.value);
  }

  let xData: string[];
  let gppData: number[];
  let recoData: number[];
  let neeData: number[];

  if (timeGranularity.value === "monthly") {
    const gppMap = groupByMonth(times, gpps);
    const recoMap = groupByMonth(times, recos);
    const neeMap = groupByMonth(times, nees);
    const months = Object.keys(gppMap).sort();
    xData = months;
    gppData = months.map(m => gppMap[m].reduce((a, b) => a + b, 0) / gppMap[m].length);
    recoData = months.map(m => recoMap[m].reduce((a, b) => a + b, 0) / recoMap[m].length);
    neeData = months.map(m => neeMap[m].reduce((a, b) => a + b, 0) / neeMap[m].length);
  } else {
    xData = times;
    gppData = gpps;
    recoData = recos;
    neeData = nees;
  }

  // NEE 正负区分填充色
  const neePositive = neeData.map(v => (v >= 0 ? v : 0));
  const neeNegative = neeData.map(v => (v < 0 ? v : 0));

  const option: echarts.EChartsOption = {
    title: {
      text: "GPP / Reco / NEE 时间序列叠加图",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: 600, color: "#1e293b" },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255,255,255,0.95)",
      borderColor: "#e2e8f0",
      textStyle: { color: "#1e293b", fontSize: 12 },
      axisPointer: { type: "cross" },
    },
    legend: {
      data: ["GPP", "Reco", "NEE (碳汇)", "NEE (碳源)"],
      top: 30,
      textStyle: { fontSize: 12, color: "#64748b" },
    },
    grid: { left: 60, right: 30, top: 70, bottom: 60 },
    xAxis: {
      type: "category",
      data: xData,
      axisLabel: {
        fontSize: 11,
        color: "#64748b",
        formatter: (val: string) => {
          if (timeGranularity.value === "monthly") return val;
          const d = new Date(val);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        },
      },
      axisLine: { lineStyle: { color: "#e2e8f0" } },
    },
    yAxis: {
      type: "value",
      name: "μmol CO₂ m⁻² s⁻¹",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      axisLine: { lineStyle: { color: "#e2e8f0" } },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", start: 0, end: 100, height: 20, bottom: 10 },
    ],
    series: [
      {
        name: "GPP",
        type: "line",
        data: gppData,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#22c55e" },
        itemStyle: { color: "#22c55e" },
      },
      {
        name: "Reco",
        type: "line",
        data: recoData,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#ef4444" },
        itemStyle: { color: "#ef4444" },
      },
      {
        name: "NEE (碳汇)",
        type: "bar",
        data: neeNegative,
        stack: "nee",
        barMaxWidth: 6,
        itemStyle: { color: "rgba(59, 130, 246, 0.7)" },
      },
      {
        name: "NEE (碳源)",
        type: "bar",
        data: neePositive,
        stack: "nee",
        barMaxWidth: 6,
        itemStyle: { color: "rgba(249, 115, 22, 0.7)" },
      },
    ],
  };

  timeseriesChart.setOption(option, true);
};

// ==================== 图表2: 月累积碳通量柱状图 ====================
const renderMonthlyBar = () => {
  if (!monthlyRef.value || !effectiveData.value?.length) return;

  const { times, gpps, recos, nees } = parseData();
  if (times.length === 0) return;

  if (!monthlyChart) {
    monthlyChart = echarts.init(monthlyRef.value);
  }

  const gppMap = groupByMonth(times, gpps);
  const recoMap = groupByMonth(times, recos);
  const neeMap = groupByMonth(times, nees);
  const months = Object.keys(gppMap).sort();

  const gppMonthly = months.map(m => gppMap[m].reduce((a, b) => a + b, 0));
  const recoMonthly = months.map(m => recoMap[m].reduce((a, b) => a + b, 0));
  const neeMonthly = months.map(m => neeMap[m].reduce((a, b) => a + b, 0));

  const option: echarts.EChartsOption = {
    title: {
      text: "月累积碳通量柱状图",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: 600, color: "#1e293b" },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255,255,255,0.95)",
      borderColor: "#e2e8f0",
      textStyle: { color: "#1e293b", fontSize: 12 },
    },
    legend: {
      data: ["GPP", "Reco", "NEE"],
      top: 30,
      textStyle: { fontSize: 12, color: "#64748b" },
    },
    grid: { left: 60, right: 30, top: 70, bottom: 40 },
    xAxis: {
      type: "category",
      data: months.map(m => {
        const [, mon] = m.split("-");
        return `${parseInt(mon)}月`;
      }),
      axisLabel: { fontSize: 11, color: "#64748b" },
      axisLine: { lineStyle: { color: "#e2e8f0" } },
    },
    yAxis: {
      type: "value",
      name: "累积量",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    series: [
      {
        name: "GPP",
        type: "bar",
        data: gppMonthly,
        barGap: "10%",
        itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] },
      },
      {
        name: "Reco",
        type: "bar",
        data: recoMonthly,
        barGap: "10%",
        itemStyle: { color: "#ef4444", borderRadius: [4, 4, 0, 0] },
      },
      {
        name: "NEE",
        type: "bar",
        data: neeMonthly.map(v => ({
          value: v,
          itemStyle: {
            color: v >= 0 ? "rgba(249, 115, 22, 0.85)" : "rgba(59, 130, 246, 0.85)",
            borderRadius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
          },
        })),
        barGap: "10%",
      },
    ],
  };

  monthlyChart.setOption(option, true);
};

// ==================== 图表3: 年累积 NEE 曲线 ====================
const renderCumulative = () => {
  if (!cumulativeRef.value || !effectiveData.value?.length) return;

  const { times, nees } = parseData();
  if (times.length === 0) return;

  if (!cumulativeChart) {
    cumulativeChart = echarts.init(cumulativeRef.value);
  }

  // 计算 DOY 和累积 NEE
  const doyData: number[] = [];
  const cumNee: number[] = [];
  let cumSum = 0;

  for (let i = 0; i < times.length; i++) {
    const d = new Date(times[i]);
    const startOfYear = new Date(d.getFullYear(), 0, 0);
    const doy = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
    doyData.push(doy);
    cumSum += nees[i];
    cumNee.push(cumSum);
  }

  // 找到碳汇转折点（累积NEE从正变负）
  let turningPoint: { doy: number; value: number } | null = null;
  for (let i = 1; i < cumNee.length; i++) {
    if (cumNee[i - 1] >= 0 && cumNee[i] < 0) {
      turningPoint = { doy: doyData[i], value: cumNee[i] };
      break;
    }
  }

  const option: echarts.EChartsOption = {
    title: {
      text: "年累积 NEE 曲线",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: 600, color: "#1e293b" },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255,255,255,0.95)",
      borderColor: "#e2e8f0",
      textStyle: { color: "#1e293b", fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `DOY ${p.axisValue}<br/>累积 NEE: <b>${parseFloat(p.value).toFixed(2)}</b>`;
      },
    },
    grid: { left: 70, right: 30, top: 60, bottom: 40 },
    xAxis: {
      type: "category",
      data: doyData,
      name: "DOY",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      axisLine: { lineStyle: { color: "#e2e8f0" } },
    },
    yAxis: {
      type: "value",
      name: "累积 NEE",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    visualMap: {
      show: false,
      pieces: [
        { lt: 0, color: "rgba(59, 130, 246, 0.8)" },
        { gte: 0, color: "rgba(249, 115, 22, 0.8)" },
      ],
    },
    series: [
      {
        name: "累积NEE",
        type: "line",
        data: cumNee,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(59, 130, 246, 0.15)" },
            { offset: 0.5, color: "rgba(255, 255, 255, 0)" },
            { offset: 1, color: "rgba(249, 115, 22, 0.15)" },
          ]),
        },
        markLine: turningPoint
          ? {
              silent: true,
              data: [
                {
                  xAxis: turningPoint.doy,
                  label: {
                    formatter: `碳汇转折点\nDOY ${turningPoint.doy}`,
                    color: "#2d6a4f",
                    fontSize: 11,
                  },
                  lineStyle: { color: "#2d6a4f", type: "dashed", width: 1.5 },
                },
              ],
            }
          : undefined,
        markPoint: {
          data: [
            {
              type: "min",
              name: "最低碳汇",
              itemStyle: { color: "#3b82f6" },
              label: { fontSize: 11 },
            },
          ],
        },
      },
    ],
  };

  cumulativeChart.setOption(option, true);
};

// ==================== 图表4: 光响应散点图 ====================
const renderLightResponse = () => {
  if (!lightRef.value || !effectiveData.value?.length) return;

  const { rg: rgCol, gpp: gppCol } = columnNames.value;
  if (!rgCol) return;

  if (!lightChart) {
    lightChart = echarts.init(lightRef.value);
  }

  const scatterData: [number, number][] = [];
  for (const row of effectiveData.value) {
    const rg = parseFloat(row[rgCol]);
    const gpp = parseFloat(row[gppCol]);
    if (!isNaN(rg) && !isNaN(gpp) && rg >= 0 && gpp >= 0) {
      scatterData.push([rg, gpp]);
    }
  }

  // 简单的 Michaelis-Menten 拟合: GPP = (alpha * PAR * GPmax) / (alpha * PAR + GPmax)
  // 用最小二乘近似估计参数
  const fitCurve = fitMichaelisMenten(scatterData);

  const option: echarts.EChartsOption = {
    title: {
      text: "光响应散点图 (PAR/Rg vs GPP)",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: 600, color: "#1e293b" },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(255,255,255,0.95)",
      borderColor: "#e2e8f0",
      textStyle: { color: "#1e293b", fontSize: 12 },
      formatter: (params: any) => {
        if (params.seriesName === "观测值") {
          return `Rg: ${params.value[0].toFixed(1)} W m⁻²<br/>GPP: ${params.value[1].toFixed(2)} μmol m⁻² s⁻¹`;
        }
        return params.seriesName;
      },
    },
    grid: { left: 60, right: 30, top: 60, bottom: 50 },
    xAxis: {
      type: "value",
      name: "Rg (W m⁻²)",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    yAxis: {
      type: "value",
      name: "GPP (μmol CO₂ m⁻² s⁻¹)",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    series: [
      {
        name: "观测值",
        type: "scatter",
        data: scatterData,
        symbolSize: 4,
        itemStyle: { color: "rgba(34, 197, 94, 0.3)", borderColor: "rgba(34, 197, 94, 0.6)", borderWidth: 0.5 },
      },
      ...(fitCurve.length > 0
        ? [
            {
              name: "Michaelis-Menten 拟合",
              type: "line" as const,
              data: fitCurve,
              smooth: true,
              symbol: "none" as const,
              lineStyle: { width: 2.5, color: "#f59e0b", type: "solid" as const },
              itemStyle: { color: "#f59e0b" },
            },
          ]
        : []),
    ],
  };

  lightChart.setOption(option, true);
};

// Michaelis-Menten 简易拟合
const fitMichaelisMenten = (data: [number, number][]): [number, number][] => {
  if (data.length < 10) return [];

  // 粗略参数估计
  const maxGPP = Math.max(...data.map(d => d[1]));
  const maxRg = Math.max(...data.map(d => d[0]));
  if (maxRg === 0 || maxGPP === 0) return [];

  // 初始猜测: GPmax ≈ 90% max GPP, alpha ≈ GPmax / (maxRg * 0.3)
  let gpMax = maxGPP * 0.9;
  let alpha = gpMax / (maxRg * 0.3);

  // 简单梯度下降
  const lr = 0.00001;
  for (let iter = 0; iter < 200; iter++) {
    let dGpMax = 0,
      dAlpha = 0;
    for (const [par, gppObs] of data) {
      const denom = alpha * par + gpMax;
      if (denom === 0) continue;
      const gppPred = (alpha * par * gpMax) / denom;
      const err = gppPred - gppObs;
      // 偏导
      dGpMax += (err * (alpha * par * alpha * par)) / (denom * denom);
      dAlpha += (err * (par * gpMax * gpMax)) / (denom * denom);
    }
    gpMax -= lr * dGpMax;
    alpha -= lr * dAlpha;
    if (gpMax <= 0) gpMax = maxGPP * 0.5;
    if (alpha <= 0) alpha = 0.01;
  }

  // 生成拟合曲线
  const curve: [number, number][] = [];
  for (let par = 0; par <= maxRg; par += maxRg / 100) {
    const denom = alpha * par + gpMax;
    const gpp = denom > 0 ? (alpha * par * gpMax) / denom : 0;
    curve.push([par, gpp]);
  }
  return curve;
};

// ==================== 图表5: Reco 温度响应散点图 ====================
const renderTemperatureResponse = () => {
  if (!temperatureRef.value || !effectiveData.value?.length) return;

  const { tair: tairCol, reco: recoCol } = columnNames.value;
  if (!tairCol) return;

  if (!temperatureChart) {
    temperatureChart = echarts.init(temperatureRef.value);
  }

  const scatterData: [number, number][] = [];
  for (const row of effectiveData.value) {
    const tair = parseFloat(row[tairCol]);
    const reco = parseFloat(row[recoCol]);
    if (!isNaN(tair) && !isNaN(reco)) {
      scatterData.push([tair, reco]);
    }
  }

  // Lloyd-Taylor 拟合曲线
  const fitCurve = fitLloydTaylor(scatterData);

  const option: echarts.EChartsOption = {
    title: {
      text: "Reco 温度响应散点图 (Tair vs Reco)",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: 600, color: "#1e293b" },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(255,255,255,0.95)",
      borderColor: "#e2e8f0",
      textStyle: { color: "#1e293b", fontSize: 12 },
      formatter: (params: any) => {
        if (params.seriesName === "观测值") {
          return `Tair: ${params.value[0].toFixed(1)} °C<br/>Reco: ${params.value[1].toFixed(2)} μmol m⁻² s⁻¹`;
        }
        return params.seriesName;
      },
    },
    grid: { left: 60, right: 30, top: 60, bottom: 50 },
    xAxis: {
      type: "value",
      name: "Tair (°C)",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    yAxis: {
      type: "value",
      name: "Reco (μmol CO₂ m⁻² s⁻¹)",
      nameTextStyle: { fontSize: 11, color: "#64748b" },
      axisLabel: { fontSize: 11, color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    series: [
      {
        name: "观测值",
        type: "scatter",
        data: scatterData,
        symbolSize: 4,
        itemStyle: { color: "rgba(239, 68, 68, 0.3)", borderColor: "rgba(239, 68, 68, 0.6)", borderWidth: 0.5 },
      },
      ...(fitCurve.length > 0
        ? [
            {
              name: "Lloyd-Taylor 拟合",
              type: "line" as const,
              data: fitCurve,
              smooth: true,
              symbol: "none" as const,
              lineStyle: { width: 2.5, color: "#8b5cf6", type: "solid" as const },
              itemStyle: { color: "#8b5cf6" },
            },
          ]
        : []),
    ],
  };

  temperatureChart.setOption(option, true);
};

// Lloyd-Taylor 拟合: Reco = Rref * exp(E0 * (1/Tref - 1/T))
// 其中 Tref = 283.15K (10°C), T0 = 227.13K
const fitLloydTaylor = (data: [number, number][]): [number, number][] => {
  if (data.length < 10) return [];

  const T0 = 227.13; // K
  const Tref = 283.15; // K (10°C)

  // 过滤有效数据
  const validData = data.filter(([t, r]) => t + 273.15 > T0 + 1 && r > 0);
  if (validData.length < 5) return [];

  // 网格搜索参数
  let bestRref = 1,
    bestE0 = 100,
    bestErr = Infinity;
  for (let rref = 0.5; rref <= 30; rref += 0.5) {
    for (let e0 = 50; e0 <= 400; e0 += 10) {
      let err = 0;
      for (const [tC, rObs] of validData) {
        const tK = tC + 273.15;
        const rPred = rref * Math.exp(e0 * (1 / (Tref - T0) - 1 / (tK - T0)));
        err += (rPred - rObs) ** 2;
      }
      if (err < bestErr) {
        bestErr = err;
        bestRref = rref;
        bestE0 = e0;
      }
    }
  }

  // 生成拟合曲线
  const minT = Math.min(...data.map(d => d[0]));
  const maxT = Math.max(...data.map(d => d[0]));
  const curve: [number, number][] = [];
  for (let t = minT; t <= maxT; t += (maxT - minT) / 100) {
    const tK = t + 273.15;
    if (tK <= T0 + 1) continue;
    const reco = bestRref * Math.exp(bestE0 * (1 / (Tref - T0) - 1 / (tK - T0)));
    curve.push([t, reco]);
  }
  return curve;
};

// ==================== 渲染当前 tab 的图表 ====================
const renderCurrentChart = async () => {
  await nextTick();
  switch (activeTab.value) {
    case "timeseries":
      renderTimeseries();
      break;
    case "monthly":
      renderMonthlyBar();
      break;
    case "cumulative":
      renderCumulative();
      break;
    case "light":
      renderLightResponse();
      break;
    case "temperature":
      renderTemperatureResponse();
      break;
  }
};

// ==================== resize 处理 ====================
const handleResize = () => {
  timeseriesChart?.resize();
  monthlyChart?.resize();
  cumulativeChart?.resize();
  lightChart?.resize();
  temperatureChart?.resize();
};

const resizeObserver = ref<ResizeObserver | null>(null);
const containerRef = ref<HTMLDivElement>();

watch(activeTab, () => {
  renderCurrentChart();
});

watch(timeGranularity, () => {
  if (activeTab.value === "timeseries") {
    renderTimeseries();
  }
});

watch(
  effectiveData,
  () => {
    renderCurrentChart();
  },
  { deep: false }
);

onMounted(() => {
  renderCurrentChart();
  if (containerRef.value) {
    resizeObserver.value = new ResizeObserver(() => handleResize());
    resizeObserver.value.observe(containerRef.value);
  }
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  resizeObserver.value?.disconnect();
  timeseriesChart?.dispose();
  monthlyChart?.dispose();
  cumulativeChart?.dispose();
  lightChart?.dispose();
  temperatureChart?.dispose();
});
</script>

<template>
  <div ref="containerRef" class="flux-charts-container">
    <!-- 碳平衡汇总卡片 -->
    <div v-if="carbonBalance" class="carbon-balance-card">
      <div class="balance-header">
        <h3>碳平衡汇总</h3>
        <el-tag :type="carbonBalance.isSink ? 'success' : 'warning'" effect="light" round size="small">
          {{ carbonBalance.isSink ? "碳汇" : "碳源" }}
        </el-tag>
      </div>
      <div class="balance-grid">
        <div class="balance-item">
          <span class="balance-label">年 GPP 总量</span>
          <span class="balance-value" style="color: var(--c-success)">{{ carbonBalance.gppTotal }}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">年 Reco 总量</span>
          <span class="balance-value" style="color: var(--c-danger)">{{ carbonBalance.recoTotal }}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">年 NEE 总量</span>
          <span class="balance-value" :style="{ color: carbonBalance.isSink ? 'var(--c-info)' : 'var(--c-warning)' }">
            {{ carbonBalance.neeTotal }}
          </span>
        </div>
        <div class="balance-item">
          <span class="balance-label">CUE (1-Reco/GPP)</span>
          <span class="balance-value">{{ carbonBalance.cue }}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">GPP/Reco 比值</span>
          <span class="balance-value">{{ carbonBalance.gppRecoRatio }}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">数据点数</span>
          <span class="balance-value" style="color: var(--c-text-muted)">{{ carbonBalance.dataPoints }}</span>
        </div>
      </div>
    </div>

    <!-- 图表 Tab 切换 -->
    <div class="chart-tabs">
      <button
        class="chart-tab"
        :class="{ 'chart-tab--active': activeTab === 'timeseries' }"
        @click="activeTab = 'timeseries'">
        📈 时间序列图
      </button>
      <button
        class="chart-tab"
        :class="{ 'chart-tab--active': activeTab === 'monthly' }"
        @click="activeTab = 'monthly'">
        📊 月累积柱状图
      </button>
      <button
        class="chart-tab"
        :class="{ 'chart-tab--active': activeTab === 'cumulative' }"
        @click="activeTab = 'cumulative'">
        📉 年累积 NEE
      </button>
      <button
        class="chart-tab"
        :class="{ 'chart-tab--active': activeTab === 'light' }"
        :disabled="!columnNames.rg"
        @click="activeTab = 'light'">
        ☀️ 光响应
      </button>
      <button
        class="chart-tab"
        :class="{ 'chart-tab--active': activeTab === 'temperature' }"
        :disabled="!columnNames.tair"
        @click="activeTab = 'temperature'">
        🌡️ 温度响应
      </button>
    </div>

    <!-- 时间粒度切换（仅时间序列图） -->
    <div v-if="activeTab === 'timeseries'" class="granularity-switch">
      <span class="granularity-label">时间粒度：</span>
      <button
        class="granularity-btn"
        :class="{ 'granularity-btn--active': timeGranularity === 'daily' }"
        @click="timeGranularity = 'daily'">
        按日
      </button>
      <button
        class="granularity-btn"
        :class="{ 'granularity-btn--active': timeGranularity === 'monthly' }"
        @click="timeGranularity = 'monthly'">
        按月
      </button>
    </div>

    <!-- 图表容器 -->
    <div class="chart-wrapper">
      <div v-if="loading" class="chart-loading">
        <span>加载数据中...</span>
      </div>
      <div v-else-if="errorMsg" class="chart-loading chart-loading--error">
        <span>{{ errorMsg }}</span>
      </div>
      <!-- 列名不匹配提示 -->
      <div v-if="noValidData" class="chart-placeholder">
        <div class="no-data-hint">
          <p class="no-data-title">⚠️ 未找到匹配的 GPP / Reco / NEE 列</p>
          <p class="no-data-detail">
            数据列: {{ effectiveData.length ? Object.keys(effectiveData[0]).join(", ") : "-" }}
          </p>
          <p class="no-data-detail">期望列名: gpp / GPP_f / GPP_NT_VUT_REF, reco / Reco / Reco_DT, nee / co2_flux</p>
        </div>
      </div>
      <!-- 列名不匹配提示 -->
      <div v-if="noValidData" class="chart-placeholder">
        <div style="text-align: center; padding: 40px; color: #94a3b8">
          <p style="font-size: var(--text-md); margin-bottom: 8px">⚠️ 未找到匹配的 GPP / Reco / NEE 列</p>
          <p style="font-size: var(--text-sm); color: #94a3b8">
            数据列: {{ effectiveData.length ? Object.keys(effectiveData[0]).join(", ") : "-" }}
          </p>
          <p style="font-size: var(--text-sm); color: #94a3b8">
            期望列名: gpp / GPP_f / GPP_NT_VUT_REF, reco / Reco / Reco_DT, nee / co2_flux
          </p>
        </div>
      </div>
      <div v-show="activeTab === 'timeseries' && !noValidData" ref="timeseriesRef" class="chart-canvas"></div>
      <div v-show="activeTab === 'monthly' && !noValidData" ref="monthlyRef" class="chart-canvas"></div>
      <div v-show="activeTab === 'cumulative' && !noValidData" ref="cumulativeRef" class="chart-canvas"></div>
      <div v-show="activeTab === 'light'" ref="lightRef" class="chart-canvas">
        <div v-if="!columnNames.rg" class="chart-placeholder">
          <span>需要辐射 (Rg/PAR) 列数据来生成光响应图</span>
        </div>
      </div>
      <div v-show="activeTab === 'temperature'" ref="temperatureRef" class="chart-canvas">
        <div v-if="!columnNames.tair" class="chart-placeholder">
          <span>需要温度 (Tair) 列数据来生成温度响应图</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flux-charts-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

/* ==================== 碳平衡汇总卡片 ==================== */
.carbon-balance-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  padding: 16px 20px;
}

.balance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.balance-header h3 {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--c-text-base);
  margin: 0;
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-3);
}

.balance-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--c-bg-muted);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border-subtle);
}

.balance-label {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  font-weight: 500;
}

.balance-value {
  font-size: var(--text-2xl);
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--c-text-base);
}

/* ==================== 图表 Tab ==================== */
.chart-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--c-bg-subtle);
  border-radius: var(--radius-panel);
  flex-wrap: wrap;
}

.chart-tab {
  flex: 1;
  min-width: 100px;
  padding: 8px 12px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--c-text-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.chart-tab:hover:not(:disabled) {
  color: var(--c-text-base);
  background: var(--c-bg-surface);
}

.chart-tab--active {
  color: var(--c-text-base);
  background: var(--c-bg-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.chart-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ==================== 时间粒度切换 ==================== */
.granularity-switch {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.granularity-label {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
}

.granularity-btn {
  padding: 4px 12px;
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  background: var(--c-bg-subtle);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
}

.granularity-btn:hover {
  color: var(--c-text-base);
  border-color: var(--c-border-strong);
}

.granularity-btn--active {
  color: var(--c-brand);
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
}

/* ==================== 图表容器 ==================== */
.chart-wrapper {
  position: relative;
  width: 100%;
  min-height: 420px;
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  overflow: hidden;
}

.chart-canvas {
  width: 100%;
  height: 420px;
}

.chart-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg-surface);
  z-index: 10;
  color: var(--c-text-muted);
  font-size: var(--text-base);
}

.chart-loading--error {
  color: var(--c-danger);
}

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--c-text-disabled);
  font-size: var(--text-base);
}

.no-data-hint {
  text-align: center;
  padding: 40px;
}

.no-data-title {
  font-size: var(--text-base);
  margin-bottom: var(--space-2);
  color: var(--c-text-disabled);
}

.no-data-detail {
  font-size: var(--text-sm);
  color: var(--c-text-disabled);
}
</style>
