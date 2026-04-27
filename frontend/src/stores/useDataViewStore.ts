import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  getCsvColumnCacheKey,
  peekCsvColumnData,
  readCsvColumnData,
  type CsvColumnRequest,
} from "@/utils/csvColumnDataCache";

type LoadStatus = "idle" | "loading" | "ready" | "empty" | "error";

type DataViewContext = {
  datasetId: string | number | null;
  versionId: string | number | null;
  filePath: string;
  missingValueTypes: string[];
};

const emptyContext = (): DataViewContext => ({
  datasetId: null,
  versionId: null,
  filePath: "",
  missingValueTypes: [],
});

const normalizeContext = (next: Partial<DataViewContext>): DataViewContext => ({
  datasetId: next.datasetId ?? null,
  versionId: next.versionId ?? null,
  filePath: next.filePath || "",
  missingValueTypes: [...(next.missingValueTypes || [])],
});

const buildContextSignature = (ctx: DataViewContext) =>
  [
    ctx.datasetId ?? "",
    ctx.versionId ?? "",
    ctx.filePath,
    [...ctx.missingValueTypes]
      .map(value => String(value))
      .sort()
      .join("\u001f"),
  ].join("\u001e");

const hasValidColumnData = (data: any, columnName: string) => {
  const rows = data?.tableData;
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((row: any) => {
    const value = row?.[columnName];
    return value !== null && value !== undefined && !Number.isNaN(Number(value));
  });
};

const buildValueHeatmapMap = (tableData: any[], columnName: string) => {
  const buckets: Record<string, { sum: number; count: number }> = {};
  for (const row of tableData) {
    const epochMs: number | null = row._epochMs;
    const value = row[columnName];
    if (
      epochMs === null ||
      epochMs === undefined ||
      value === null ||
      value === undefined ||
      Number.isNaN(Number(value))
    ) {
      continue;
    }
    const d = new Date(epochMs);
    if (Number.isNaN(d.getTime())) continue;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hourStr = String(d.getHours()).padStart(2, "0");
    const key = `${dateStr} ${hourStr}`;
    if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
    buckets[key].sum += Number(value);
    buckets[key].count += 1;
  }

  const avgMap: Record<string, number> = {};
  for (const [key, { sum, count }] of Object.entries(buckets)) {
    avgMap[key] = sum / count;
  }
  return avgMap;
};

export const useDataViewStore = defineStore("dataView", () => {
  const context = ref<DataViewContext>(emptyContext());
  const contextSignature = computed(() => buildContextSignature(context.value));

  const timeSeries = ref({
    column: "",
    status: "idle" as LoadStatus,
    data: null as any,
    statistics: null as any,
    error: "",
    key: "",
  });

  const valueHeatmap = ref({
    column: "",
    status: "idle" as LoadStatus,
    data: {} as Record<string, number>,
    error: "",
    key: "",
  });

  const buildColumnRequest = (columnName: string): CsvColumnRequest => ({
    datasetId: context.value.datasetId,
    versionId: context.value.versionId,
    filePath: context.value.filePath,
    columnName,
    missingValueTypes: context.value.missingValueTypes,
  });

  const buildColumnKey = (columnName: string) => getCsvColumnCacheKey(buildColumnRequest(columnName));

  const resetTimeSeries = (status: LoadStatus = "idle") => {
    timeSeries.value = {
      column: "",
      status,
      data: null,
      statistics: null,
      error: "",
      key: "",
    };
  };

  const resetValueHeatmap = (status: LoadStatus = "idle") => {
    valueHeatmap.value = {
      column: "",
      status,
      data: {},
      error: "",
      key: "",
    };
  };

  const resetDerivedState = () => {
    resetTimeSeries();
    resetValueHeatmap();
  };

  const setContext = (nextContext: Partial<DataViewContext>) => {
    const next = normalizeContext(nextContext);
    if (buildContextSignature(next) === contextSignature.value) return;
    context.value = next;
    resetDerivedState();
  };

  const loadTimeSeries = async (columnName = timeSeries.value.column) => {
    if (!columnName) {
      resetTimeSeries("idle");
      return;
    }
    if (!context.value.filePath) {
      timeSeries.value = {
        column: columnName,
        status: "error",
        data: null,
        statistics: null,
        error: "未找到数据文件路径",
        key: "",
      };
      return;
    }

    const request = buildColumnRequest(columnName);
    const key = getCsvColumnCacheKey(request);
    timeSeries.value = { column: columnName, status: "loading", data: null, statistics: null, error: "", key };

    const cachedData = peekCsvColumnData(request);
    if (cachedData && timeSeries.value.key === key) {
      timeSeries.value = {
        column: columnName,
        status: hasValidColumnData(cachedData, columnName) ? "ready" : "empty",
        data: hasValidColumnData(cachedData, columnName) ? cachedData : null,
        statistics: cachedData.statistics || null,
        error: "",
        key,
      };
    }

    try {
      const result = await readCsvColumnData(request);
      if (timeSeries.value.key !== key) return;
      if (!result?.success) throw new Error(result?.error || "读取数据失败");

      const data = result.data;
      timeSeries.value = {
        column: columnName,
        status: hasValidColumnData(data, columnName) ? "ready" : "empty",
        data: hasValidColumnData(data, columnName) ? data : null,
        statistics: data?.statistics || null,
        error: "",
        key,
      };
    } catch (error: any) {
      if (timeSeries.value.key !== key) return;
      timeSeries.value = {
        column: columnName,
        status: "error",
        data: null,
        statistics: null,
        error: error?.message || "读取数据失败",
        key,
      };
    }
  };

  const setTimeSeriesColumn = async (columnName: string) => {
    if (!columnName) {
      resetTimeSeries("idle");
      return;
    }
    await loadTimeSeries(columnName);
  };

  const ensureTimeSeriesColumn = async (columns: string[]) => {
    const current = timeSeries.value.column;
    const next = current && columns.includes(current) ? current : columns[0] || "";
    if (!next) {
      resetTimeSeries("idle");
      return;
    }
    if (next !== current || timeSeries.value.key !== buildColumnKey(next)) {
      await setTimeSeriesColumn(next);
    }
  };

  const loadValueHeatmap = async (columnName = valueHeatmap.value.column) => {
    if (!columnName) {
      resetValueHeatmap("idle");
      return;
    }
    if (!context.value.filePath) {
      valueHeatmap.value = { column: columnName, status: "error", data: {}, error: "未找到数据文件路径", key: "" };
      return;
    }

    const request = buildColumnRequest(columnName);
    const key = getCsvColumnCacheKey(request);
    valueHeatmap.value = { column: columnName, status: "loading", data: {}, error: "", key };

    const cachedData = peekCsvColumnData(request);
    if (cachedData?.tableData && valueHeatmap.value.key === key) {
      const data = buildValueHeatmapMap(cachedData.tableData, columnName);
      valueHeatmap.value = {
        column: columnName,
        status: Object.keys(data).length > 0 ? "ready" : "empty",
        data,
        error: "",
        key,
      };
    }

    try {
      const result = await readCsvColumnData(request);
      if (valueHeatmap.value.key !== key) return;
      if (!result?.success || !result?.data?.tableData) {
        valueHeatmap.value = { column: columnName, status: "empty", data: {}, error: "", key };
        return;
      }

      const data = buildValueHeatmapMap(result.data.tableData, columnName);
      valueHeatmap.value = {
        column: columnName,
        status: Object.keys(data).length > 0 ? "ready" : "empty",
        data,
        error: "",
        key,
      };
    } catch (error: any) {
      if (valueHeatmap.value.key !== key) return;
      valueHeatmap.value = {
        column: columnName,
        status: "error",
        data: {},
        error: error?.message || "数值时序数据加载失败",
        key,
      };
    }
  };

  const setValueHeatmapColumn = async (columnName: string) => {
    if (!columnName) {
      resetValueHeatmap("idle");
      return;
    }
    await loadValueHeatmap(columnName);
  };

  const ensureValueHeatmapColumn = async (columns: string[]) => {
    const current = valueHeatmap.value.column;
    const next = current && columns.includes(current) ? current : columns[0] || "";
    if (!next) {
      resetValueHeatmap("idle");
      return;
    }
    if (next !== current || valueHeatmap.value.key !== buildColumnKey(next)) {
      await setValueHeatmapColumn(next);
    }
  };

  return {
    context,
    timeSeries,
    valueHeatmap,
    contextSignature,
    buildColumnKey,
    setContext,
    resetDerivedState,
    setTimeSeriesColumn,
    ensureTimeSeriesColumn,
    loadTimeSeries,
    setValueHeatmapColumn,
    ensureValueHeatmapColumn,
    loadValueHeatmap,
  };
});
