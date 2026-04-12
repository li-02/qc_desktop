<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Check,
  X,
  Play,
  Trash2,
  Plus,
  ChevronLeft,
  Wand2,
  RotateCcw,
  Download,
  Pencil,
  Link,
  Eye,
  GripVertical,
} from "lucide-vue-next";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type { DatasetInfo } from "@shared/types/projectInterface";
import type {
  ColumnSetting,
  OutlierResult,
  OutlierDetail,
  DetectionMethod,
  ThresholdTemplateEntry,
} from "@shared/types/database";
import OutlierChart from "../charts/OutlierChart.vue";
import VersionManager from "../VersionManager.vue";
import TemplateManager from "./TemplateManager.vue";
import SaveTemplateDialog from "./SaveTemplateDialog.vue";

const datasetStore = useDatasetStore();
const outlierStore = useOutlierDetectionStore();

interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
  initialResultId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const datasetInfo = computed(() => props.datasetInfo ?? datasetStore.currentDataset);

const panelLoading = computed(() => props.loading || outlierStore.loading);

// View State
const activeView = ref<"config" | "result">("config");
const showVersionDrawer = ref(false);
const showTemplateManager = ref(false);
const showSaveTemplateDialog = ref(false);
const currentVersion = computed(() => datasetStore.currentVersion);

const handleVersionSwitch = async (versionId: number) => {
  await datasetStore.setCurrentVersion(versionId);
  showVersionDrawer.value = false;
};

// 检测结果状态
const detectionResults = ref<OutlierResult[]>([]);
const currentResult = ref<OutlierResult | null>(null);
const lastDetectionSummary = ref<{
  totalRows: number;
  columnsChecked: number;
  outlierCount: number;
  outlierRate: number;
  columnResults: Array<{
    columnName: string;
    outlierCount: number;
    missingCount?: number;
    minThreshold: number | null;
    maxThreshold: number | null;
  }>;
} | null>(null);

// 详情展示状态
const currentResultId = ref<number | null>(null);
const resultDetails = ref<OutlierDetail[]>([]);
const detailLoading = ref(false);
const detailPage = ref(1);
const detailPageSize = ref(100);
void detailPageSize;

const executing = ref(false);
const applying = ref(false); // 应用过滤中
const currentSelectedColumn = ref("");

// 重命名状态
const editingResultId = ref<number | null>(null);
const editingName = ref("");
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

// 检测方法选择状态
const selectedMethodId = ref<string>("THRESHOLD_STATIC");
const methodParamsForm = ref<Record<string, any>>({});

const selectedMethod = computed(() => {
  return outlierStore.availableMethods.find(m => m.id === selectedMethodId.value) || null;
});

const isThresholdMethod = computed(() => selectedMethodId.value === "THRESHOLD_STATIC");

const selectMethod = (method: DetectionMethod) => {
  if (!method.isAvailable) return;
  selectedMethodId.value = method.id;
  // 初始化参数默认值
  const defaults: Record<string, any> = {};
  for (const p of method.params) {
    defaults[p.key] = p.default;
  }
  methodParamsForm.value = defaults;
};

// 列配置折叠状态（默认展开）
const columnConfigCollapse = ref<string[]>(["column-config"]);

// 本地状态
const searchText = ref("");
const selectedColumns = ref<number[]>([]);
const editingColumn = ref<number | null>(null);
const editForm = ref<{
  min_threshold: number | undefined;
  max_threshold: number | undefined;
  physical_min: number | undefined;
  physical_max: number | undefined;
  unit: string;
}>({
  min_threshold: undefined,
  max_threshold: undefined,
  physical_min: undefined,
  physical_max: undefined,
  unit: "",
});

// 计算属性
const filteredColumns = computed(() => {
  const timeColumn = datasetInfo.value?.timeColumn;

  if (!searchText.value) {
    // 默认不显示时间列（根据数据集解析时识别的时间列名称）
    if (timeColumn) {
      return outlierStore.columnThresholds.filter(col => col.column_name !== timeColumn);
    }
    return outlierStore.columnThresholds;
  }
  const search = searchText.value.toLowerCase();
  return outlierStore.columnThresholds.filter(col => col.column_name.toLowerCase().includes(search));
});

const templateOptions = computed(() => {
  return Object.keys(outlierStore.thresholdTemplates).map(key => ({
    label: key === "standard" ? "标准模板" : key,
    value: key,
  }));
});

const configuredColumnCount = computed(() => {
  return outlierStore.columnThresholds.filter(c => c.min_threshold !== null || c.max_threshold !== null).length;
});

// 方法
const loadData = async () => {
  if (!datasetInfo.value?.id) return;

  await Promise.all([
    outlierStore.loadColumnThresholds(datasetInfo.value.id),
    outlierStore.loadDetectionMethods(),
    outlierStore.loadThresholdTemplates(),
    outlierStore.loadUserTemplates(),
    loadDetectionResults(),
  ]);

  // 从工作流等外部传来的初始 ID（如果有）
  if (props.initialResultId && detectionResults.value.length > 0) {
    const targetId = Number(props.initialResultId);
    const targetResult = detectionResults.value.find(r => r.id === targetId);
    if (targetResult) {
      await viewResult(targetResult);
    }
  }
};

const loadDetectionResults = async () => {
  if (!datasetInfo.value?.id) return;
  const results = await outlierStore.getDetectionResults(String(datasetInfo.value.id));
  detectionResults.value = results || [];
};

const switchToConfig = () => {
  activeView.value = "config";
  currentResultId.value = null;
  currentResult.value = null;
  lastDetectionSummary.value = null;
};

const executeDetection = async () => {
  if (!datasetInfo.value?.id) return;

  const method = selectedMethodId.value;

  // 确定要检测的列
  let targetColumnNames: string[] | undefined = undefined;

  if (selectedColumns.value.length > 0) {
    const selectedCols = outlierStore.columnThresholds.filter(c => selectedColumns.value.includes(c.id));
    targetColumnNames = selectedCols.map(c => c.column_name);

    // 静态阈值方法需要检查阈值配置
    if (method === "THRESHOLD_STATIC") {
      const hasConfigured = selectedCols.some(c => c.min_threshold !== null || c.max_threshold !== null);
      if (!hasConfigured) {
        ElMessage.warning("选中的列未配置阈值");
        return;
      }
    }
  } else if (method === "THRESHOLD_STATIC") {
    const configuredColumns = outlierStore.columnThresholds.filter(
      c => c.min_threshold !== null || c.max_threshold !== null
    );
    if (configuredColumns.length === 0) {
      ElMessage.warning("请先为至少一个列配置阈值");
      return;
    }
  }

  try {
    executing.value = true;
    const versionId = currentVersion.value?.id;
    if (!versionId) {
      ElMessage.warning("未能获取当前数据版本");
      executing.value = false;
      return;
    }

    let result: any;
    if (method === "THRESHOLD_STATIC") {
      result = await outlierStore.executeThresholdDetection(
        String(datasetInfo.value.id),
        String(versionId),
        targetColumnNames
      );
    } else {
      result = await outlierStore.executeDetection(
        String(datasetInfo.value.id),
        String(versionId),
        method,
        { ...methodParamsForm.value },
        targetColumnNames
      );
    }

    if (result) {
      await loadDetectionResults();
      if (detectionResults.value.length > 0) {
        await viewResult(detectionResults.value[0]);
      }
    }
  } finally {
    executing.value = false;
  }
};

const loadResultDetails = async () => {
  if (!currentResultId.value) return;

  detailLoading.value = true;
  try {
    // 加载所有异常值详情用于图表展示（不分页）
    const totalCount = currentResult.value?.outlier_count ?? 10000;
    const res = await outlierStore.getDetectionResultDetails(
      String(currentResultId.value),
      undefined,
      Math.max(totalCount, 10000),
      0
    );
    resultDetails.value = res.details;
  } catch (error) {
    console.error("加载详情失败:", error);
    ElMessage.error("加载详情失败");
  } finally {
    detailLoading.value = false;
  }
};

const viewResult = async (result: OutlierResult) => {
  currentResultId.value = result.id;
  currentResult.value = result;
  activeView.value = "result";
  currentSelectedColumn.value = "";

  // 重构 summary 对象以适配显示
  let summary = null;
  if (result.outlier_count !== undefined) {
    // 尝试解析 detection_params 来获取列信息
    let columnsChecked = 0;
    let columnResults: any[] = [];
    try {
      if (result.detection_params) {
        const params = JSON.parse(result.detection_params);
        if (params.columns && Array.isArray(params.columns)) {
          columnsChecked = params.columns.length;

          if (params.columnResults) {
            columnResults = params.columnResults;
          }
        }
      }
    } catch (e) {
      console.error("解析参数失败", e);
    }

    // 关键修正：如果 columnResults 为空但有异常值，或者我们要确保数据准确性，尝试从后端获取实时统计
    if (columnResults.length === 0 && (result.outlier_count > 0 || columnsChecked > 0)) {
      const stats = await outlierStore.getOutlierResultStats(String(result.id));
      if (stats && stats.length > 0) {
        columnResults = stats;
        // 如果之前没解析出列数，现在可以用统计到的列数修正
        if (columnsChecked === 0) {
          columnsChecked = stats.length;
        }
      } else if (columnResults.length === 0 && columnsChecked > 0) {
        // 如果统计返回也没数据，且明确有检查列，可能是真的没有异常值
        try {
          const params = JSON.parse(result.detection_params || "{}");
          if (params.columns) {
            columnResults = params.columns.map((c: string) => ({
              columnName: c,
              outlierCount: 0,
              missingCount: 0,
            }));
          }
        } catch (e) {}
      }
    }

    summary = {
      totalRows: result.total_rows ?? 0,
      columnsChecked: columnsChecked,
      outlierCount: result.outlier_count,
      outlierRate: result.outlier_rate ?? 0,
      columnResults: columnResults,
    };

    lastDetectionSummary.value = summary;
  }

  detailPage.value = 1;
  await loadResultDetails();
};

const deleteResult = async (resultId: number, event?: Event) => {
  if (event) {
    event.stopPropagation();
  }

  try {
    await ElMessageBox.confirm("确定要删除这条检测结果吗？", "删除确认", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      customClass: "qc-message-box",
    });

    const success = await outlierStore.deleteDetectionResult(String(resultId));
    if (success) {
      await loadDetectionResults();
      if (currentResultId.value === resultId) {
        switchToConfig();
      }
    }
  } catch {
    // 用户取消
  }
};

const getResultDisplayName = (result: OutlierResult) => {
  if (result.name) {
    return result.name;
  }
  const methodName = getMethodDisplayName(result.detection_method);
  return result.column_name ? `${methodName} - ${result.column_name}` : methodName;
};

const getMethodDisplayName = (method: string) => {
  const methodMap: Record<string, string> = {
    THRESHOLD_STATIC: "静态阈值",
    ZSCORE: "Z-Score",
    MODIFIED_ZSCORE: "MAD Z-Score",
    IQR: "IQR",
    DESPIKING_MAD: "MAD Despiking",
  };
  return methodMap[method] || method;
};

const startRenaming = (result: OutlierResult, event: Event) => {
  event.stopPropagation();
  editingResultId.value = result.id;
  editingName.value = result.name || getResultDisplayName(result);
};

const cancelRenaming = (event?: Event) => {
  if (event) {
    event.stopPropagation();
  }
  editingResultId.value = null;
  editingName.value = "";
};

const saveRenaming = async (event?: Event) => {
  if (event) {
    event.stopPropagation();
  }
  if (!editingResultId.value || !editingName.value.trim()) {
    cancelRenaming();
    return;
  }

  const success = await outlierStore.renameDetectionResult(String(editingResultId.value), editingName.value.trim());

  if (success) {
    // 更新本地状态
    const result = detectionResults.value.find(r => r.id === editingResultId.value);
    if (result) {
      result.name = editingName.value.trim();
    }
  }

  cancelRenaming();
};

const onDragStart = (index: number) => {
  dragIndex.value = index;
};

const onDragOver = (index: number, event: DragEvent) => {
  event.preventDefault();
  dragOverIndex.value = index;
};

const onDrop = async (index: number) => {
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null;
    dragOverIndex.value = null;
    return;
  }
  const list = [...detectionResults.value];
  const [moved] = list.splice(dragIndex.value, 1);
  list.splice(index, 0, moved);
  detectionResults.value = list;
  dragIndex.value = null;
  dragOverIndex.value = null;
  const orders = list.map((r, i) => ({ id: r.id, sortOrder: i }));
  try {
    await window.electronAPI.invoke(API_ROUTES.OUTLIER.REORDER_RESULTS, { orders });
  } catch (error: any) {
    ElMessage.error(error.message || "排序失败");
  }
};

const onDragEnd = () => {
  dragIndex.value = null;
  dragOverIndex.value = null;
};

const applyFiltering = async () => {
  if (!currentResultId.value) return;

  try {
    await ElMessageBox.confirm(
      "此操作将创建一个新版本的数据文件，并将检测到的所有异常值置为空（删除）。确定要继续吗？",
      "过滤异常值",
      {
        confirmButtonText: "确定过滤",
        cancelButtonText: "取消",
        type: "warning",
        customClass: "qc-message-box qc-message-box--outlier-filter",
      }
    );

    applying.value = true;
    const result = await outlierStore.applyOutlierFiltering(String(currentResultId.value));

    if (result) {
      // 重新加载结果列表以更新状态
      await loadDetectionResults();
      // 更新当前结果的状态显示
      if (currentResult.value) {
        currentResult.value.status = "APPLIED";
        currentResult.value.generated_version_id = result.versionId;
      }

      // 可以选择是否通知 DatasetStore 刷新版本列表
      if (datasetInfo.value?.id) {
        datasetStore.loadVersions(datasetInfo.value.id);
      }
    }
  } catch (e) {
    // Cancelled
  } finally {
    applying.value = false;
  }
};

const revertFiltering = async () => {
  if (!currentResultId.value) return;

  try {
    await ElMessageBox.confirm(
      "确定要撤销过滤操作吗？这将恢复检测结果的状态，但已生成的版本文件将保留（作为历史记录）。",
      "撤销过滤",
      { confirmButtonText: "确定撤销", cancelButtonText: "取消", type: "info", customClass: "qc-message-box" }
    );

    applying.value = true;
    const success = await outlierStore.revertOutlierFiltering(String(currentResultId.value));

    if (success) {
      await loadDetectionResults();
      if (currentResult.value) {
        currentResult.value.status = "COMPLETED";
      }
    }
  } catch (e) {
    // Cancelled
  } finally {
    applying.value = false;
  }
};

const exportCleanedData = async () => {
  if (!currentResult.value?.generated_version_id) return;

  const versionId = currentResult.value.generated_version_id;
  const fileName = `cleaned_data_v${versionId}.csv`;

  await datasetStore.exportVersion(Number(versionId), fileName);
};

const getStatusType = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "RUNNING":
      return "warning";
    case "FAILED":
      return "danger";
    case "APPLIED":
      return "success"; // 已应用也用绿色，或者深绿色
    case "REVERTED":
      return "info";
    default:
      return "info";
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return "已完成";
    case "RUNNING":
      return "运行中";
    case "FAILED":
      return "失败";
    case "PENDING":
      return "待执行";
    case "APPLIED":
      return "已过滤";
    case "REVERTED":
      return "已撤销";
    default:
      return status;
  }
};

const startEditing = (column: ColumnSetting) => {
  editingColumn.value = column.id;
  editForm.value = {
    min_threshold: column.min_threshold ?? undefined,
    max_threshold: column.max_threshold ?? undefined,
    physical_min: column.physical_min ?? undefined,
    physical_max: column.physical_max ?? undefined,
    unit: column.unit || "",
  };
};

const cancelEditing = () => {
  editingColumn.value = null;
  editForm.value = {
    min_threshold: undefined,
    max_threshold: undefined,
    physical_min: undefined,
    physical_max: undefined,
    unit: "",
  };
};

const saveColumnThreshold = async () => {
  if (!editingColumn.value) return;

  const success = await outlierStore.updateColumnThreshold(editingColumn.value, {
    min_threshold: editForm.value.min_threshold,
    max_threshold: editForm.value.max_threshold,
    physical_min: editForm.value.physical_min,
    physical_max: editForm.value.physical_max,
    unit: editForm.value.unit || undefined,
  });

  if (success) {
    cancelEditing();
  }
};

const applyTemplate = async (templateName: string) => {
  if (!datasetInfo.value?.id) return;

  try {
    await ElMessageBox.confirm(
      `确定要应用“${templateName === "standard" ? "标准" : "严格"}”模板吗？这将覆盖匹配列的现有阈值配置。`,
      "应用模板",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning", customClass: "qc-message-box" }
    );

    await outlierStore.applyThresholdTemplate(datasetInfo.value.id, templateName);
  } catch {
    // 用户取消
  }
};

const handleTemplateCommand = async (command: string) => {
  if (command === "__save__") {
    await handleSaveAsTemplate();
  } else if (command === "__manage__") {
    showTemplateManager.value = true;
  } else if (command.startsWith("user:")) {
    const templateId = parseInt(command.replace("user:", ""));
    await handleApplyUserTemplate(templateId);
  } else {
    await applyTemplate(command);
  }
};

const handleSaveAsTemplate = () => {
  if (!datasetInfo.value?.id) return;

  if (configuredColumnCount.value === 0) {
    ElMessage.warning("当前没有已配置阈值的列，无法保存为模板");
    return;
  }

  showSaveTemplateDialog.value = true;
};

const handleSaveTemplateConfirm = async (payload: {
  mode: string;
  name?: string;
  description?: string;
  templateId?: number;
  mergedData?: Record<string, { min: number; max: number; unit?: string }>;
}) => {
  if (!datasetInfo.value?.id) return;
  let success = false;
  if (payload.mode === "new") {
    success = await outlierStore.saveAsTemplate(datasetInfo.value.id, payload.name!, payload.description || undefined);
  } else if (payload.mode === "existing" && payload.templateId && payload.mergedData) {
    success = await outlierStore.updateUserTemplate(payload.templateId, { templateData: payload.mergedData });
  }
  if (success) {
    showSaveTemplateDialog.value = false;
  }
};

const handleApplyUserTemplate = async (templateId: number) => {
  if (!datasetInfo.value?.id) return;

  const template = outlierStore.userTemplates.find(t => t.id === templateId);
  if (!template) return;

  try {
    await ElMessageBox.confirm(
      `确定要应用"${template.name}"模板吗？这将覆盖匹配列的现有阈值配置。\n模板包含 ${template.columnCount} 列配置。`,
      "应用模板",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning", customClass: "qc-message-box" }
    );

    await outlierStore.applyUserTemplate(datasetInfo.value.id, templateId);
  } catch {
    // 用户取消
  }
};

// ==================== 模板预览 ====================
const showTemplatePreview = ref(false);
const previewTemplateName = ref("");
const previewTemplateData = ref<Record<string, ThresholdTemplateEntry>>({});

const handlePreviewBuiltinTemplate = (templateKey: string, event: Event) => {
  event.stopPropagation();
  const templates = outlierStore.thresholdTemplates;
  const data = templates[templateKey];
  if (!data) return;
  previewTemplateName.value = templateKey === "standard" ? "标准模板" : templateKey;
  previewTemplateData.value = data as Record<string, ThresholdTemplateEntry>;
  showTemplatePreview.value = true;
};

const handlePreviewUserTemplate = (templateId: number, event: Event) => {
  event.stopPropagation();
  const template = outlierStore.userTemplates.find(t => t.id === templateId);
  if (!template) return;
  previewTemplateName.value = template.name;
  previewTemplateData.value = template.thresholds;
  showTemplatePreview.value = true;
};

const previewTemplateEntries = computed(() => {
  return Object.entries(previewTemplateData.value).map(([name, entry]) => ({
    name,
    min: entry.min,
    max: entry.max,
    unit: entry.unit || "-",
  }));
});

const handleDeleteUserTemplate = async (templateId: number, event: Event) => {
  event.stopPropagation();

  try {
    await ElMessageBox.confirm("确定要删除这个模板吗？", "删除模板", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      customClass: "qc-message-box",
    });

    await outlierStore.deleteUserTemplate(templateId);
  } catch {
    // 用户取消
  }
};

const batchClearThresholds = async () => {
  if (selectedColumns.value.length === 0) {
    ElMessage.warning("请先选择要清除的列");
    return;
  }

  try {
    await ElMessageBox.confirm(`确定要清除选中的 ${selectedColumns.value.length} 列的阈值配置吗？`, "清除阈值", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      customClass: "qc-message-box",
    });

    const updates = selectedColumns.value.map(id => ({
      id,
      min_threshold: undefined,
      max_threshold: undefined,
    }));

    await outlierStore.batchUpdateThresholds(updates as any);
    selectedColumns.value = [];
  } catch {
    // 用户取消
  }
};

const toggleSelectAll = () => {
  if (selectedColumns.value.length === filteredColumns.value.length) {
    selectedColumns.value = [];
  } else {
    selectedColumns.value = filteredColumns.value.map(c => c.id);
  }
};

const getMissingCount = (columnName: string) => {
  const stats = datasetStore.currentVersionStats?.columnStats;
  if (!stats) return null;

  if (stats.columnMissingStatus && stats.columnMissingStatus[columnName] !== undefined) {
    return stats.columnMissingStatus[columnName];
  }

  // Fallback for flat structure
  if (typeof stats[columnName] === "number") {
    return stats[columnName];
  }

  return null;
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return typeof value === "number" ? value.toFixed(2) : value;
};

// 监听数据集变化
watch(
  () => datasetInfo.value?.id,
  newId => {
    if (newId) {
      loadData();
    } else {
      outlierStore.reset();
    }
  },
  { immediate: true }
);

// 列阈值加载完成后，默认全选所有列
watch(
  () => outlierStore.columnThresholds,
  thresholds => {
    if (thresholds.length > 0 && selectedColumns.value.length === 0) {
      const timeColumn = datasetInfo.value?.timeColumn;
      selectedColumns.value = thresholds.filter(col => !timeColumn || col.column_name !== timeColumn).map(c => c.id);
    }
  }
);

onMounted(() => {
  if (datasetInfo.value?.id) {
    loadData();
  }
});
</script>

<template>
  <div class="outlier-panel">
    <!-- 生态背景装饰层 -->
    <div class="eco-backdrop" aria-hidden="true">
      <!-- 大叶片 — 右上角 -->
      <svg class="eco-leaf eco-leaf--1" viewBox="0 0 200 200" fill="currentColor">
        <path
          d="M100 10C100 10 30 50 20 110C14 148 40 175 80 180C60 160 55 130 70 108C85 86 100 75 100 75C100 75 115 86 130 108C145 130 140 160 120 180C160 175 186 148 180 110C170 50 100 10 100 10Z" />
        <line
          x1="100"
          y1="185"
          x2="100"
          y2="90"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          opacity="0.5" />
      </svg>
      <!-- 小叶片 — 左下 -->
      <svg class="eco-leaf eco-leaf--2" viewBox="0 0 130 130" fill="currentColor">
        <path
          d="M65 8C65 8 20 35 15 72C11 97 28 114 52 117C39 104 37 85 46 70C55 56 65 49 65 49C65 49 75 56 84 70C93 85 91 104 78 117C102 114 119 97 115 72C110 35 65 8 65 8Z" />
      </svg>
      <!-- 微叶 — 中左 -->
      <svg class="eco-leaf eco-leaf--3" viewBox="0 0 90 90" fill="currentColor">
        <path
          d="M45 5C45 5 14 24 10 50C7 67 19 79 36 81C27 72 26 59 32 48C38 38 45 34 45 34C45 34 52 38 58 48C64 59 63 72 54 81C71 79 83 67 80 50C76 24 45 5 45 5Z" />
      </svg>
      <!-- 监测站网络图 -->
      <svg class="eco-network-graph" viewBox="0 0 520 260" fill="none">
        <circle cx="80" cy="60" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="200" cy="30" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="340" cy="70" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="460" cy="40" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="140" cy="140" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="280" cy="160" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="400" cy="130" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="60" cy="200" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="480" cy="190" r="5" fill="currentColor" opacity="0.7" />
        <line x1="80" y1="60" x2="200" y2="30" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="200" y1="30" x2="340" y2="70" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="340" y1="70" x2="460" y2="40" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="80" y1="60" x2="140" y2="140" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="200" y1="30" x2="280" y2="160" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="340" y1="70" x2="400" y2="130" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="140" y1="140" x2="280" y2="160" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="280" y1="160" x2="400" y2="130" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="60" y1="200" x2="140" y2="140" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="400" y1="130" x2="480" y2="190" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <line x1="460" y1="40" x2="400" y2="130" stroke="currentColor" stroke-width="1" opacity="0.35" />
      </svg>
    </div>

    <!-- 加载状态 -->
    <div v-if="panelLoading && !datasetInfo" class="loading-overlay">
      <div class="loading-content">
        <Loader2 :size="18" class="loading-spinner" />
        <span class="loading-text">加载中...</span>
      </div>
    </div>

    <template v-else-if="datasetInfo">
      <!-- 侧边栏：历史记录 -->
      <div class="panel-sidebar glass-panel">
        <div class="sidebar-header">
          <button class="new-detection-btn" @click="switchToConfig">
            <Plus :size="16" />
            <span>新建检测</span>
          </button>
        </div>

        <div class="history-list-container">
          <div class="sidebar-subtitle">检测历史</div>
          <el-scrollbar>
            <div class="history-list">
              <div
                v-for="(result, index) in detectionResults"
                :key="result.id"
                class="history-item"
                :class="{
                  active: currentResultId === result.id,
                  'history-item--drag-over': dragOverIndex === index,
                }"
                draggable="true"
                @dragstart="onDragStart(index)"
                @dragover="onDragOver(index, $event)"
                @drop="onDrop(index)"
                @dragend="onDragEnd"
                @click="viewResult(result)">
                <div class="history-item-header">
                  <GripVertical :size="14" class="drag-handle" />
                  <!-- 名称显示/编辑区域 -->
                  <div class="history-name-wrapper" v-if="editingResultId !== result.id">
                    <span class="history-name" :title="getResultDisplayName(result)">{{
                      getResultDisplayName(result)
                    }}</span>
                    <el-button size="small" text class="rename-btn" @click="startRenaming(result, $event)">
                      <Pencil :size="14" />
                    </el-button>
                  </div>
                  <!-- 编辑模式 -->
                  <div class="history-name-edit" v-else @click.stop>
                    <el-input
                      v-model="editingName"
                      size="small"
                      placeholder="输入名称"
                      @keyup.enter="saveRenaming($event)"
                      @keyup.escape="cancelRenaming($event)"
                      autofocus />
                    <el-button size="small" type="primary" text @click="saveRenaming($event)">
                      <Check :size="14" />
                    </el-button>
                    <el-button size="small" text @click="cancelRenaming($event)">
                      <X :size="14" />
                    </el-button>
                  </div>
                  <el-button
                    size="small"
                    text
                    type="danger"
                    class="delete-btn"
                    @click="deleteResult(result.id, $event)">
                    <Trash2 :size="14" />
                  </el-button>
                </div>
                <div class="history-item-content">
                  <el-tag size="small" :type="getStatusType(result.status)" effect="light" round>{{
                    getStatusText(result.status)
                  }}</el-tag>
                  <span class="history-count" v-if="result.status === 'COMPLETED'">
                    {{ result.outlier_count }} 个异常
                  </span>
                </div>
              </div>

              <div v-if="detectionResults.length === 0" class="no-history">暂无检测记录</div>
            </div>
          </el-scrollbar>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="panel-main">
        <!-- 配置模式 -->
        <div v-if="activeView === 'config'" class="view-container config-view">
          <!-- 上半部分：配置卡片 -->
          <div class="main-card glass-panel">
            <div class="view-header">
              <div class="header-title">
                <h2>阈值配置与检测</h2>
                <span class="header-desc">
                  {{
                    isThresholdMethod
                      ? "为每个变量设置有效数据范围，超出范围的值将被标记为异常"
                      : `使用 ${selectedMethod?.name || ""} 对选中列进行统计异常检测`
                  }}
                </span>
              </div>
              <div class="header-actions">
                <el-button class="action-btn" plain @click="showVersionDrawer = true">
                  <Link :size="16" /> 版本谱系
                </el-button>
              </div>
            </div>

            <!-- 阈值配置表格与方法说明 -->
            <div class="threshold-table-container">
              <el-scrollbar>
                <!-- ① 检测方法选择 (始终在最上方) -->
                <div class="methods-section">
                  <div class="section-header-small">
                    <div class="section-title">选择检测方法</div>
                    <span v-if="selectedMethod" class="selected-method-hint">
                      当前: <strong>{{ selectedMethod.name }}</strong>
                    </span>
                  </div>
                  <div class="methods-grid">
                    <div
                      v-for="method in outlierStore.availableMethods"
                      :key="method.id"
                      class="method-card"
                      :class="{
                        'method-unavailable': !method.isAvailable,
                        'method-selected': selectedMethodId === method.id,
                      }"
                      @click="selectMethod(method)">
                      <div class="method-header">
                        <span class="method-name">{{ method.name }}</span>
                        <span class="method-category" :class="method.category">
                          {{
                            method.category === "threshold"
                              ? "阈值"
                              : method.category === "statistical"
                                ? "统计"
                                : method.category === "ml"
                                  ? "机器学习"
                                  : method.category
                          }}
                        </span>
                      </div>
                      <div class="method-description">{{ method.description }}</div>
                      <div class="method-footer">
                        <div v-if="method.requiresPython" class="method-badge python">Python</div>
                        <div v-if="selectedMethodId === method.id" class="method-check-icon">✓</div>
                      </div>
                    </div>
                  </div>

                  <!-- ② 参数配置面板 (非静态阈值方法时显示) -->
                  <transition name="fade">
                    <div v-if="!isThresholdMethod && selectedMethod" class="method-params-panel">
                      <div class="params-title">{{ selectedMethod.name }} 参数配置</div>
                      <div class="params-grid">
                        <div v-for="param in selectedMethod.params" :key="param.key" class="param-item">
                          <label class="param-label">
                            {{ param.label }}
                            <el-tooltip v-if="param.tooltip" :content="param.tooltip" placement="top">
                              <span class="param-tip">?</span>
                            </el-tooltip>
                          </label>
                          <el-input-number
                            v-if="param.type === 'number'"
                            v-model="methodParamsForm[param.key]"
                            size="small"
                            :min="param.min"
                            :max="param.max"
                            :step="param.step || 1"
                            :controls="true"
                            class="param-input" />
                          <el-switch
                            v-else-if="param.type === 'boolean'"
                            v-model="methodParamsForm[param.key]"
                            size="small" />
                        </div>
                      </div>
                      <div class="params-hint">勾选下方列表中要检测的列，然后点击底部「开始检测」</div>
                    </div>
                  </transition>
                </div>

                <!-- ② 模板工具栏 (仅静态阈值方法时显示) -->
                <transition name="fade">
                  <div v-if="isThresholdMethod" class="template-toolbar">
                    <div class="template-toolbar-left">
                      <Settings :size="14" class="template-toolbar-icon" />
                      <span class="template-toolbar-label">阈值模板</span>
                    </div>
                    <div class="template-toolbar-right">
                      <el-dropdown @command="handleTemplateCommand" :disabled="outlierStore.saving">
                        <el-button class="template-action-btn" size="small">
                          <Settings :size="14" /> 应用模板
                          <ChevronLeft :size="14" style="transform: rotate(-90deg)" />
                        </el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item
                              disabled
                              style="font-size: var(--text-sm); color: #909399; font-weight: 500"
                              >内置模板</el-dropdown-item
                            >
                            <el-dropdown-item v-for="opt in templateOptions" :key="opt.value" :command="opt.value">
                              <div class="template-dropdown-item">
                                <span>{{ opt.label }}</span>
                                <Eye
                                  :size="14"
                                  class="template-preview-icon"
                                  @click="handlePreviewBuiltinTemplate(opt.value, $event)" />
                              </div>
                            </el-dropdown-item>
                            <template v-if="outlierStore.userTemplates.length > 0">
                              <el-dropdown-item
                                divided
                                disabled
                                style="font-size: var(--text-sm); color: #909399; font-weight: 500"
                                >我的模板</el-dropdown-item
                              >
                              <el-dropdown-item
                                v-for="tpl in outlierStore.userTemplates"
                                :key="'user:' + tpl.id"
                                :command="'user:' + tpl.id">
                                <div
                                  style="
                                    display: flex;
                                    align-items: center;
                                    justify-content: space-between;
                                    width: 100%;
                                    min-width: 160px;
                                  ">
                                  <span
                                    >{{ tpl.name }}
                                    <span style="color: #909399; font-size: var(--text-xs)"
                                      >({{ tpl.columnCount }}列)</span
                                    ></span
                                  >
                                  <span
                                    style="
                                      display: flex;
                                      align-items: center;
                                      gap: 4px;
                                      flex-shrink: 0;
                                      margin-left: 12px;
                                    ">
                                    <Eye
                                      :size="14"
                                      class="template-preview-icon"
                                      @click="handlePreviewUserTemplate(tpl.id, $event)" />
                                    <X
                                      :size="14"
                                      style="color: #f56c6c; cursor: pointer"
                                      @click="handleDeleteUserTemplate(tpl.id, $event)" />
                                  </span>
                                </div>
                              </el-dropdown-item>
                            </template>
                            <el-dropdown-item divided command="__save__">
                              <Plus :size="14" style="margin-right: 4px" /> 保存当前为模板
                            </el-dropdown-item>
                            <el-dropdown-item command="__manage__">
                              <Settings :size="14" style="margin-right: 4px" /> 管理模板
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </div>
                </transition>

                <!-- ③ 列配置（可折叠，默认折叠） -->
                <el-collapse v-model="columnConfigCollapse" class="column-config-collapse">
                  <el-collapse-item name="column-config" class="column-config-collapse-item">
                    <template #title>
                      <div class="collapse-title-row">
                        <span class="collapse-title-text">列配置</span>
                        <span class="collapse-title-badge">
                          {{ filteredColumns.length }} 列，已选 {{ selectedColumns.length }} 列
                        </span>
                      </div>
                    </template>

                    <!-- 筛选区域 -->
                    <div class="filter-section">
                      <div class="filter-left">
                        <el-input v-model="searchText" placeholder="搜索列名..." class="search-input" clearable>
                          <template #prefix>
                            <Search :size="14" />
                          </template>
                        </el-input>
                        <el-checkbox
                          :model-value="selectedColumns.length === filteredColumns.length && filteredColumns.length > 0"
                          :indeterminate="selectedColumns.length > 0 && selectedColumns.length < filteredColumns.length"
                          @change="toggleSelectAll">
                          全选
                        </el-checkbox>
                      </div>
                      <div class="filter-right">
                        <span v-if="!isThresholdMethod && selectedColumns.length > 0" class="selected-cols-tag">
                          已选 {{ selectedColumns.length }} 列
                        </span>
                        <transition name="fade">
                          <el-button
                            v-if="selectedColumns.length > 0 && isThresholdMethod"
                            size="small"
                            type="danger"
                            plain
                            round
                            @click="batchClearThresholds">
                            清除选中 ({{ selectedColumns.length }})
                          </el-button>
                        </transition>
                      </div>
                    </div>

                    <!-- ④ 列表格 -->
                    <div class="table-wrapper">
                      <table class="threshold-table">
                        <thead>
                          <tr>
                            <th class="col-checkbox"></th>
                            <th class="col-name">列名</th>
                            <th v-if="isThresholdMethod" class="col-threshold">最小阈值</th>
                            <th v-if="isThresholdMethod" class="col-threshold">最大阈值</th>
                            <th v-if="isThresholdMethod" class="col-unit">单位</th>
                            <th v-if="isThresholdMethod" class="col-actions">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="column in filteredColumns"
                            :key="column.id"
                            :class="{ 'row-editing': editingColumn === column.id }">
                            <td class="col-checkbox">
                              <el-checkbox v-model="selectedColumns" :value="column.id" size="small" />
                            </td>
                            <td class="col-name">
                              <div class="column-name-cell">
                                <span class="column-name">{{ column.column_name }}</span>
                                <span v-if="column.variable_type" class="variable-type">{{
                                  column.variable_type
                                }}</span>
                              </div>
                            </td>
                            <!-- 阈值列: 仅静态阈值方法时显示 -->
                            <template v-if="isThresholdMethod">
                              <!-- 编辑模式 -->
                              <template v-if="editingColumn === column.id">
                                <td class="col-threshold">
                                  <el-input-number
                                    v-model="editForm.min_threshold"
                                    size="small"
                                    :controls="false"
                                    placeholder="最小值"
                                    class="edit-input" />
                                </td>
                                <td class="col-threshold">
                                  <el-input-number
                                    v-model="editForm.max_threshold"
                                    size="small"
                                    :controls="false"
                                    placeholder="最大值"
                                    class="edit-input" />
                                </td>
                                <td class="col-unit">
                                  <el-input
                                    v-model="editForm.unit"
                                    size="small"
                                    placeholder="单位"
                                    class="edit-input" />
                                </td>
                                <td class="col-actions">
                                  <div class="action-buttons">
                                    <el-button
                                      size="small"
                                      type="success"
                                      circle
                                      :loading="outlierStore.saving"
                                      @click="saveColumnThreshold">
                                      <Check :size="14" />
                                    </el-button>
                                    <el-button size="small" circle @click="cancelEditing">
                                      <X :size="14" />
                                    </el-button>
                                  </div>
                                </td>
                              </template>
                              <!-- 显示模式 -->
                              <template v-else>
                                <td class="col-threshold">
                                  <span :class="{ 'value-set': column.min_threshold !== null }">
                                    {{ formatNumber(column.min_threshold) }}
                                  </span>
                                </td>
                                <td class="col-threshold">
                                  <span :class="{ 'value-set': column.max_threshold !== null }">
                                    {{ formatNumber(column.max_threshold) }}
                                  </span>
                                </td>
                                <td class="col-unit">
                                  <span class="unit-text">{{ column.unit || "-" }}</span>
                                </td>
                                <td class="col-actions">
                                  <el-button
                                    size="small"
                                    type="primary"
                                    link
                                    class="edit-btn"
                                    @click="startEditing(column)">
                                    编辑
                                  </el-button>
                                </td>
                              </template>
                            </template>
                          </tr>
                        </tbody>
                      </table>

                      <div v-if="filteredColumns.length === 0" class="empty-table">
                        <div class="empty-icon">🔍</div>
                        <div class="empty-text">未找到匹配的列</div>
                      </div>
                    </div>
                  </el-collapse-item>
                </el-collapse>

                <!-- 底部操作按钮 -->
                <div class="bottom-action-buttons">
                  <button class="refresh-btn" :disabled="outlierStore.loading" @click="loadData">
                    <RefreshCw :size="16" :class="{ 'spin-animation': outlierStore.loading }" />
                    <span>刷新</span>
                  </button>
                  <button
                    class="execute-btn"
                    :class="{ 'execute-btn--loading': executing }"
                    :disabled="executing"
                    @click="executeDetection">
                    <Play v-if="!executing" :size="16" />
                    <div v-else class="btn-loading-spinner"></div>
                    <span>{{ executing ? "检测中..." : "开始检测" }}</span>
                  </button>
                </div>
              </el-scrollbar>
            </div>
          </div>
        </div>

        <!-- 结果展示模式 -->
        <div v-else-if="activeView === 'result'" class="view-container result-view">
          <div class="glass-panel result-panel">
            <div class="view-header">
              <div class="header-title">
                <el-button link @click="switchToConfig" class="back-btn">
                  <ChevronLeft :size="16" />
                </el-button>
                <h2>检测结果详情</h2>
                <el-tag v-if="currentResult" :type="getStatusType(currentResult.status)" effect="plain" round>
                  {{ getStatusText(currentResult.status) }}
                </el-tag>
              </div>
              <div class="header-actions">
                <!-- 过滤按钮 (仅在COMPLETED状态且有异常值时显示) -->
                <el-button
                  v-if="currentResult?.status === 'COMPLETED' && (lastDetectionSummary?.outlierCount || 0) > 0"
                  type="primary"
                  class="primary-gradient-btn"
                  :loading="applying"
                  @click="applyFiltering">
                  <Wand2 :size="16" /> 过滤异常值
                </el-button>

                <!-- 撤销按钮 (仅在APPLIED状态显示) -->
                <el-button
                  v-if="currentResult?.status === 'APPLIED'"
                  type="warning"
                  plain
                  :loading="applying"
                  @click="revertFiltering">
                  <RotateCcw :size="16" /> 撤销过滤
                </el-button>

                <!-- 导出按钮 (仅在APPLIED状态且有生成版本ID时显示) -->
                <el-button
                  v-if="currentResult?.status === 'APPLIED' && currentResult?.generated_version_id"
                  type="success"
                  plain
                  @click="exportCleanedData">
                  <Download :size="16" /> 导出数据
                </el-button>

                <el-button type="danger" plain text @click="deleteResult(currentResultId!)">
                  <Trash2 :size="16" /> 删除结果
                </el-button>
              </div>
            </div>

            <div class="result-content" v-if="lastDetectionSummary">
              <!-- 摘要卡片 -->
              <div class="summary-cards">
                <div class="summary-card glass-effect">
                  <div class="card-label">检测行数</div>
                  <div class="card-value">{{ lastDetectionSummary.totalRows.toLocaleString() }}</div>
                </div>
                <div class="summary-card glass-effect">
                  <div class="card-label">检测列数</div>
                  <div class="card-value">{{ lastDetectionSummary.columnsChecked }}</div>
                </div>
                <div class="summary-card highlight">
                  <div class="card-label">异常值总数</div>
                  <div class="card-value">{{ lastDetectionSummary.outlierCount.toLocaleString() }}</div>
                </div>
                <div class="summary-card glass-effect">
                  <div class="card-label">异常率</div>
                  <div class="card-value">{{ lastDetectionSummary.outlierRate.toFixed(2) }}%</div>
                </div>
              </div>

              <!-- 各列异常统计横向列表 -->
              <div class="column-stats-row glass-effect" v-if="lastDetectionSummary.columnResults.length > 0">
                <div class="stats-row-header">
                  <span class="stats-title">各列异常分布</span>
                  <span class="stats-subtitle">点击查看详情</span>
                </div>
                <el-scrollbar>
                  <div class="column-stats-list">
                    <div
                      v-for="col in lastDetectionSummary.columnResults"
                      :key="col.columnName"
                      class="stat-item"
                      :class="{
                        active: currentSelectedColumn === col.columnName,
                        'has-outliers': col.outlierCount > 0,
                      }"
                      @click="currentSelectedColumn = col.columnName">
                      <div class="stat-item-header">
                        <span class="col-name" :title="col.columnName">{{ col.columnName }}</span>
                      </div>
                      <div class="stat-metrics">
                        <div class="stat-metric">
                          <span class="count">{{ col.outlierCount }}</span>
                          <span class="label">异常</span>
                        </div>
                        <div class="stat-divider"></div>
                        <div class="stat-metric">
                          <span class="count missing">{{
                            col.missingCount ?? getMissingCount(col.columnName) ?? "-"
                          }}</span>
                          <span class="label">缺失</span>
                        </div>
                      </div>
                      <div class="stat-bar-bg">
                        <div
                          class="stat-bar-fill"
                          :style="{
                            width:
                              Math.min((col.outlierCount / (lastDetectionSummary.totalRows || 1)) * 100, 100) + '%',
                          }"></div>
                      </div>
                    </div>
                  </div>
                </el-scrollbar>
              </div>

              <!-- 异常分析视图 -->
              <div class="chart-section glass-effect">
                <OutlierChart
                  :summary="lastDetectionSummary"
                  :details="resultDetails"
                  :loading="detailLoading"
                  :file-path="datasetInfo?.originalFile?.filePath"
                  :show-summary-chart="false"
                  :show-detail-chart="true"
                  v-model:modelValue="currentSelectedColumn" />
              </div>
            </div>

            <div v-else class="loading-result">
              <Loader2 :size="18" class="loading-spinner" />
              加载结果中...
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 无数据状态 -->
    <div v-else class="no-data-container">
      <div class="no-data-content">
        <div class="no-data-icon">📂</div>
        <div class="no-data-text">未选择数据集</div>
        <div class="no-data-subtitle">请从左侧选择一个数据集</div>
      </div>
    </div>
    <!-- 模板预览对话框 -->
    <el-dialog
      v-model="showTemplatePreview"
      :title="`模板预览 — ${previewTemplateName}`"
      width="520px"
      destroy-on-close
      append-to-body
      class="template-preview-dialog">
      <div class="template-preview-content">
        <div class="template-preview-summary">
          共 <strong>{{ previewTemplateEntries.length }}</strong> 列配置
        </div>
        <el-scrollbar max-height="400px">
          <table class="template-preview-table">
            <thead>
              <tr>
                <th>列名</th>
                <th>最小值</th>
                <th>最大值</th>
                <th>单位</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in previewTemplateEntries" :key="entry.name">
                <td class="preview-col-name">{{ entry.name }}</td>
                <td class="preview-value">{{ entry.min }}</td>
                <td class="preview-value">{{ entry.max }}</td>
                <td class="preview-unit">{{ entry.unit }}</td>
              </tr>
            </tbody>
          </table>
        </el-scrollbar>
      </div>
    </el-dialog>

    <!-- Template Manager Drawer -->
    <TemplateManager
      :visible="showTemplateManager"
      :dataset-id="datasetInfo?.id"
      @update:visible="showTemplateManager = $event"
      @template-applied="loadData" />

    <!-- Save Template Dialog -->
    <SaveTemplateDialog
      v-model:visible="showSaveTemplateDialog"
      :column-count="configuredColumnCount"
      :saving="outlierStore.saving"
      :current-thresholds="outlierStore.columnThresholds"
      @confirm="handleSaveTemplateConfirm" />

    <!-- Version Manager Drawer -->
    <el-drawer v-model="showVersionDrawer" title="数据版本管理" size="450px" destroy-on-close append-to-body>
      <VersionManager
        v-if="datasetInfo"
        :dataset-id="datasetInfo.id"
        @switch-version="handleVersionSwitch"
        @close="showVersionDrawer = false" />
    </el-drawer>
  </div>
</template>

<style scoped>
/* 核心布局与背景 */
.outlier-panel {
  /* === eco 色彩令牌 → 设计系统变量映射 === */
  --eco-forest: var(--c-text-primary);
  --eco-forest-mid: var(--c-text-primary);
  --eco-pine: var(--c-text-base);
  --eco-moss: var(--c-brand);
  --eco-fern: var(--c-brand-active);
  --eco-spring: var(--c-brand);
  --eco-leaf: var(--c-brand-border);
  --eco-mint: var(--c-border);
  --eco-mist: var(--c-brand-soft);
  --eco-ice: var(--c-bg-muted);
  --eco-surface: var(--c-bg-muted);
  --eco-white: var(--c-bg-surface);
  --eco-border: var(--c-brand-border);
  --eco-border-light: var(--c-border);
  --eco-text-dark: var(--c-text-primary);
  --eco-text-mid: var(--c-text-base);
  --eco-text-muted: var(--c-text-secondary);

  display: flex;
  height: 100%;
  width: 100%;
  background: var(--eco-surface);
  background-image:
    radial-gradient(ellipse at 15% 45%, rgba(64, 145, 108, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at 88% 12%, rgba(116, 198, 157, 0.12) 0%, transparent 45%),
    radial-gradient(ellipse at 55% 88%, rgba(27, 67, 50, 0.07) 0%, transparent 40%);
  overflow: hidden;
  padding: 8px;
  gap: 8px;
  box-sizing: border-box;
  position: relative;
}

/* Panel 通用样式 */
.glass-panel {
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  overflow: hidden;
  box-shadow:
    0 2px 16px rgba(13, 43, 26, 0.08),
    0 1px 4px rgba(64, 145, 108, 0.06);
}

.glass-effect {
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  box-shadow: 0 1px 6px rgba(13, 43, 26, 0.06);
}

/* 侧边栏 */
.panel-sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--eco-border-light);
}

.new-detection-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 36px;
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--c-text-inverse);
  background: linear-gradient(135deg, var(--eco-moss) 0%, var(--eco-forest-mid) 100%);
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(45, 106, 79, 0.35);
  transition: all 0.25s ease;
}

.new-detection-btn:hover {
  background: linear-gradient(135deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  box-shadow: 0 4px 14px rgba(45, 106, 79, 0.45);
  transform: translateY(-1px);
}

.history-list-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-subtitle {
  padding: 16px 20px 8px;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--eco-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.history-list {
  padding: 8px 16px;
}

.history-item {
  padding: 14px;
  border-radius: var(--radius-panel);
  cursor: pointer;
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  background: var(--eco-ice);
}

.history-item:hover {
  background: var(--eco-white);
  border-color: var(--eco-border-light);
  box-shadow: 0 2px 8px rgba(13, 43, 26, 0.08);
}

.history-item.active {
  background: var(--eco-mist);
  border-color: var(--eco-border);
  box-shadow: 0 0 0 1px var(--eco-spring);
}

.history-item-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.drag-handle {
  cursor: grab;
  color: var(--eco-spring);
  font-size: var(--text-md);
  flex-shrink: 0;
}

.drag-handle:active {
  cursor: grabbing;
}

.history-item--drag-over {
  border-top: 2px solid var(--eco-moss) !important;
}

.history-name-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: var(--text-base);
  color: var(--eco-text-dark);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 2px;
  height: auto;
  flex-shrink: 0;
}

.history-item:hover .rename-btn {
  opacity: 0.6;
}

.history-item:hover .rename-btn:hover {
  opacity: 1;
  color: var(--eco-moss);
}

.history-name-edit {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.history-name-edit .el-input {
  flex: 1;
}

.history-name-edit .el-input :deep(.el-input__inner) {
  font-size: var(--text-sm);
  height: 26px;
}

.history-time {
  font-size: var(--text-base);
  color: var(--eco-text-dark);
  font-weight: 600;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 4px;
  height: auto;
  flex-shrink: 0;
}

.history-item:hover .delete-btn {
  opacity: 1;
}

.history-item-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-count {
  font-size: var(--text-sm);
  color: var(--eco-text-muted);
  font-weight: 500;
}

.no-history {
  text-align: center;
  padding: 40px 16px;
  color: var(--eco-text-muted);
  font-size: var(--text-md);
}

/* 主内容区域 */
.panel-main {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.view-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 16px;
}

.config-view {
  width: 100%;
}

.main-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 允许 flex 子项收缩 */
}

.view-header {
  padding: 16px 24px;
  border-bottom: 1.5px solid var(--eco-border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  background: linear-gradient(90deg, rgba(116, 198, 157, 0.06) 0%, rgba(248, 255, 254, 0.95) 100%);
}

.header-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.result-view .header-title {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.back-btn {
  margin-right: 4px;
  padding: 4px;
  height: auto;
  color: var(--eco-text-mid);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.back-btn:hover {
  color: var(--eco-moss);
  background: var(--eco-mist);
  border-radius: var(--radius-sm);
}

.back-btn :deep(.el-icon) {
  font-size: var(--text-3xl);
}

.header-title h2 {
  margin: 0;
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--eco-forest-mid);
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-desc {
  font-size: var(--text-base);
  color: var(--eco-text-mid);
  margin-top: 6px;
  display: block;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  border-radius: var(--radius-panel);
  height: 36px;
  font-weight: 600;
}

.primary-gradient-btn {
  background: linear-gradient(135deg, var(--eco-moss) 0%, var(--eco-forest-mid) 100%);
  border: none;
  box-shadow: 0 2px 10px rgba(45, 106, 79, 0.35);
  transition: all 0.25s ease;
  height: 36px;
  min-width: 110px;
  font-weight: 600;
}

.primary-gradient-btn:hover {
  background: linear-gradient(135deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  box-shadow: 0 4px 14px rgba(45, 106, 79, 0.45);
  transform: translateY(-1px);
}

.primary-gradient-btn:disabled {
  background: var(--eco-mint);
  cursor: not-allowed;
}

/* 模板工具栏 */
.template-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 24px;
  background: linear-gradient(90deg, rgba(64, 145, 108, 0.06) 0%, rgba(64, 145, 108, 0.02) 100%);
  border-top: 1px solid var(--eco-border-light);
  border-bottom: 1px solid var(--eco-border-light);
}

.template-toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.template-toolbar-icon {
  color: var(--eco-moss);
  font-size: var(--text-md);
}

.template-toolbar-label {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--eco-pine);
}

.template-action-btn {
  border-radius: var(--radius-control);
  border: 1px solid rgba(64, 145, 108, 0.4);
  color: var(--eco-pine);
  background: rgba(64, 145, 108, 0.06);
  font-weight: 500;
  transition: all 0.2s ease;
}

.template-action-btn:hover {
  border-color: var(--eco-moss);
  background: var(--eco-mist);
  color: var(--eco-forest-mid);
}

/* 筛选区域 */
.filter-section {
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--eco-white);
  border-bottom: 1px solid var(--eco-border-light);
}

/* 底部操作按钮 */
.bottom-action-buttons {
  display: flex;
  gap: 10px;
  padding: 16px 24px;
  margin-top: auto;
  flex-shrink: 0;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 20px;
  height: 36px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--eco-pine);
  background: var(--eco-white);
  border: 1px solid var(--eco-border);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.refresh-btn:hover:not(:disabled) {
  border-color: var(--eco-moss);
  background: var(--eco-mist);
  color: var(--eco-forest-mid);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin-animation {
  animation: spin 1s linear infinite;
}

.execute-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 20px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--c-text-inverse);
  background: linear-gradient(135deg, var(--eco-moss), var(--eco-forest-mid));
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
  min-width: 110px;
  box-shadow: 0 2px 10px rgba(45, 106, 79, 0.35);
}

.execute-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--eco-pine), var(--eco-forest));
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(45, 106, 79, 0.45);
}

.execute-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}

/* 列配置折叠面板 */
.column-config-collapse {
  border: none;
}

.column-config-collapse :deep(.el-collapse-item__header) {
  padding: 10px 24px;
  background: linear-gradient(90deg, rgba(64, 145, 108, 0.06) 0%, rgba(64, 145, 108, 0.02) 100%);
  border-top: 1px solid var(--eco-border-light);
  border-bottom: 1px solid var(--eco-border-light);
  font-size: var(--text-base);
  height: auto;
  line-height: 1.5;
}

.column-config-collapse :deep(.el-collapse-item__header.is-active) {
  border-bottom: 1px solid var(--eco-border-light);
}

.column-config-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

.column-config-collapse :deep(.el-collapse-item__content) {
  padding: 0;
}

.collapse-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.collapse-title-text {
  font-weight: 600;
  color: var(--eco-pine);
  font-size: var(--text-base);
}

.collapse-title-badge {
  font-size: var(--text-sm);
  color: var(--eco-text-muted);
  padding: 2px 8px;
  background: rgba(64, 145, 108, 0.08);
  border-radius: var(--radius-control);
  font-weight: 500;
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-input {
  width: 260px;
}

:deep(.el-input__wrapper) {
  border-radius: var(--radius-panel);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* 表格区域 */
.threshold-table-container {
  flex: 1;
  overflow: hidden;
  padding: 0;
  min-height: 200px; /* 防止在极小屏幕下表格完全消失 */
  display: flex;
  flex-direction: column;
}

.table-wrapper {
  padding: 0 24px 16px;
  overflow-x: auto;
}

/* 强制滚动条充满容器 */
.threshold-table-container :deep(.el-scrollbar) {
  height: 100%;
  width: 100%;
}

.threshold-table-container :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.threshold-table-container :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.threshold-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-base);
  margin-top: 8px;
}

.threshold-table th {
  background: #c9edda;
  padding: 14px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--eco-forest-mid);
  border-bottom: 1px solid var(--eco-border);
  position: sticky;
  top: 0;
  z-index: 10;
  white-space: nowrap;
}

.threshold-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--eco-border-light);
  background: var(--eco-white);
  transition: background 0.2s;
  white-space: nowrap;
}

.threshold-table tr:hover td {
  background: var(--eco-mist);
}

.threshold-table tr.row-editing td {
  background: var(--eco-ice);
}

.threshold-table tr:last-child td {
  border-bottom: none;
}

/* 表格列宽与样式 */
.col-checkbox {
  width: 40px;
  min-width: 40px;
  text-align: center;
}
.col-name {
  width: auto;
  min-width: 120px;
  max-width: 300px;
}
.col-missing {
  width: 80px;
  min-width: 80px;
  text-align: center;
}
.col-threshold {
  width: 90px;
  min-width: 90px;
}

.col-unit {
  width: 160px;
  min-width: 160px;
}
.col-unit .edit-input {
  width: 100%;
}
.col-actions {
  width: 100px;
  min-width: 100px;
  text-align: center;
}

.column-name-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.column-name {
  font-weight: 600;
  color: var(--eco-text-dark);
}
.variable-type {
  font-size: var(--text-2xs);
  color: var(--eco-pine);
  background: var(--eco-ice);
  border: 1px solid var(--eco-border-light);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  align-self: flex-start;
}

.status-badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: var(--radius-3xl);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.status-badge.configured {
  background: var(--eco-mist);
  color: var(--eco-pine);
}
.status-badge.not-configured {
  background: var(--eco-ice);
  color: var(--eco-text-muted);
}

.missing-count {
  color: var(--eco-text-mid);
  font-family: var(--font-mono);
}
.missing-count.has-missing {
  color: #e07a5f;
  font-weight: 600;
}

.value-set {
  color: var(--c-text-primary);
  font-weight: 600;
  font-family: var(--font-mono);
}

.unit-text {
  color: var(--eco-text-muted);
  font-style: italic;
}

.action-buttons {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.edit-btn {
  font-weight: 500;
  opacity: 0.7;
}
.edit-btn:hover {
  opacity: 1;
}

.empty-table {
  padding: 64px;
  text-align: center;
  border-radius: var(--radius-panel);
  margin-top: 16px;
}
.empty-icon {
  font-size: var(--text-display-2xl);
  margin-bottom: 16px;
  opacity: 0.5;
}
.empty-text {
  color: var(--eco-text-mid);
  font-size: var(--text-xl);
}

/* 方法区域容器 - 内部样式 */
.methods-section {
  padding: 12px 16px;
  flex-shrink: 0;
  background: var(--eco-white);
}

.section-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--eco-forest-mid);
  display: flex;
  align-items: center;
}
.section-title::before {
  content: "";
  display: block;
  width: 4px;
  height: 16px;
  background: var(--eco-moss);
  border-radius: var(--radius-xs);
  margin-right: 8px;
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.method-card {
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  padding: 12px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.method-card:hover {
  border-color: var(--eco-border);
  background: var(--eco-ice);
  box-shadow: 0 2px 8px rgba(13, 43, 26, 0.08);
}

.method-card.method-selected {
  border-color: var(--eco-moss);
  background: var(--eco-mist);
  box-shadow: 0 0 0 1px var(--eco-moss);
}

.method-card.method-unavailable {
  opacity: 0.5;
  cursor: not-allowed;
}

.method-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.method-name {
  font-weight: 600;
  color: var(--eco-forest-mid);
  font-size: var(--text-base);
}

.method-category {
  font-size: var(--text-2xs);
  padding: 2px 8px;
  border-radius: var(--radius-control);
  font-weight: 600;
  text-transform: uppercase;
}
.method-category.threshold {
  background: rgba(64, 145, 108, 0.12);
  color: var(--eco-pine);
}
.method-category.statistical {
  background: rgba(27, 67, 50, 0.1);
  color: var(--eco-forest-mid);
}
.method-category.ml {
  background: rgba(45, 106, 79, 0.15);
  color: var(--eco-moss);
}

.method-description {
  font-size: var(--text-sm);
  color: var(--eco-text-mid);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
}

.method-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.method-badge {
  font-size: var(--text-2xs);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  display: inline-block;
  background: var(--eco-ice);
  color: var(--eco-text-mid);
  border: 1px solid var(--eco-border-light);
}

.method-check-icon {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  background: var(--eco-moss);
  color: var(--c-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xs);
  margin-left: auto;
}

.selected-method-hint {
  font-size: var(--text-sm);
  color: var(--eco-text-mid);
}

.selected-method-hint strong {
  color: var(--eco-moss);
  font-weight: 600;
}

.section-header-small {
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.method-params-panel {
  margin-top: 16px;
  padding: 16px;
  background: var(--eco-ice);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
}

.params-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--eco-forest-mid);
  margin-bottom: 12px;
}

.params-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}

.param-label {
  font-size: var(--text-sm);
  color: var(--eco-text-mid);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.param-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: var(--eco-mist);
  color: var(--eco-pine);
  font-size: var(--text-2xs);
  cursor: help;
}

.param-input {
  width: 160px;
}

.params-hint {
  margin-top: 12px;
  font-size: var(--text-sm);
  color: var(--eco-pine);
  font-weight: 500;
  padding: 8px 12px;
  background: rgba(64, 145, 108, 0.06);
  border-radius: var(--radius-control);
  border-left: 3px solid var(--eco-moss);
}

.selected-cols-tag {
  font-size: var(--text-sm);
  color: var(--eco-pine);
  font-weight: 600;
  padding: 4px 10px;
  background: rgba(64, 145, 108, 0.1);
  border: 1px solid rgba(64, 145, 108, 0.25);
  border-radius: var(--radius-control);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 结果详情视图 */
.result-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.summary-card {
  padding: 12px 14px;
  transition: all 0.2s ease;
}
.summary-card:hover {
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.summary-card.highlight {
  background: linear-gradient(135deg, var(--eco-moss) 0%, var(--eco-forest-mid) 100%);
  border: none;
  color: var(--c-text-inverse);
  border-radius: var(--radius-control);
  box-shadow: 0 4px 14px rgba(45, 106, 79, 0.4);
}

.summary-card.highlight .card-label,
.summary-card.highlight .card-value {
  color: var(--c-text-inverse);
}

.summary-card.highlight .card-label,
.summary-card.highlight .card-value {
  color: #fff;
}

.card-label {
  font-size: var(--text-sm);
  color: var(--eco-text-mid);
  margin-bottom: 4px;
  font-weight: 500;
}

.card-value {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--eco-forest);
  letter-spacing: -0.02em;
}

.column-breakdown {
  padding: 24px;
  margin-bottom: 24px;
}

.breakdown-title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--eco-forest-mid);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}
.breakdown-title::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 18px;
  background: var(--eco-moss);
  margin-right: 8px;
  border-radius: var(--radius-xs);
}

.breakdown-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.column-tag {
  display: flex;
  align-items: center;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-control);
  overflow: hidden;
  font-size: var(--text-sm);
  box-shadow: 0 1px 2px rgba(13, 43, 26, 0.06);
}

.tag-name {
  padding: 6px 12px;
  color: var(--eco-forest-mid);
  font-weight: 500;
}

.tag-count {
  padding: 6px 10px;
  background: var(--eco-ice);
  color: var(--eco-pine);
  font-weight: 600;
  border-left: 1px solid var(--eco-border-light);
}

.tag-count.has-outliers {
  background: #fef2f2;
  color: var(--c-danger);
  background: rgba(239, 68, 68, 0.1);
}

.chart-section {
  padding: 24px;
  min-height: 400px;
}

.loading-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--eco-text-muted);
  gap: 16px;
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-spinner {
  font-size: var(--text-display-sm);
  color: var(--eco-moss);
  animation: spin 1s linear infinite;
}

.loading-text {
  color: var(--c-text-base);
  font-size: var(--text-lg);
  font-weight: 500;
}

/* No Data */
.no-data-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.no-data-content {
  text-align: center;
  background: var(--eco-white);
  padding: 48px;
  border-radius: var(--radius-panel);
  border: 1px solid var(--eco-border-light);
  box-shadow: 0 2px 16px rgba(13, 43, 26, 0.08);
}

.no-data-icon {
  font-size: var(--text-display-2xl);
  margin-bottom: 24px;
}

.no-data-text {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--eco-forest-mid);
  margin-bottom: 8px;
}

.no-data-subtitle {
  color: var(--eco-text-mid);
  font-size: var(--text-lg);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Scrollbar beautification */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(64, 145, 108, 0.25);
  border-radius: var(--radius-xs);
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(64, 145, 108, 0.45);
}

/* Column Statistics Row */
.column-stats-row {
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.stats-row-header {
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stats-title {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--eco-forest-mid);
}

.stats-subtitle {
  font-size: var(--text-xs);
  color: var(--eco-text-muted);
}

.column-stats-list {
  display: flex;
  gap: 10px;
  padding: 4px 4px 8px; /* 增加顶部和底部内边距，为 hover 动效留出空间 */
}

.stat-item {
  flex: 0 0 110px;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.stat-item:hover {
  border-color: var(--eco-border);
  box-shadow: 0 2px 8px rgba(13, 43, 26, 0.08);
}

.stat-item.active {
  background: var(--eco-mist);
  border-color: var(--eco-moss);
}

.stat-item.has-outliers .count {
  color: var(--c-danger);
}

.stat-item-header {
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.col-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.stat-item.active .col-name {
  color: var(--eco-pine);
}

.stat-metrics {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 0 2px;
}

.stat-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.stat-divider {
  width: 1px;
  height: 16px;
  background: var(--eco-border-light);
}

.count {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--eco-forest-mid);
  line-height: 1;
}

.count.missing {
  color: var(--c-warning);
}

.label {
  font-size: var(--text-3xs);
  color: var(--eco-text-muted);
  transform: scale(0.9);
}

.stat-bar-bg {
  height: 3px;
  background: var(--eco-ice);
  border-radius: var(--radius-xs);
  overflow: hidden;
  width: 100%;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--eco-fern), var(--eco-moss));
  border-radius: var(--radius-xs);
  transition: width 0.5s ease;
}

.stat-item.has-outliers .stat-bar-fill {
  background: linear-gradient(90deg, #f87171, var(--c-danger));
}

/* 模板下拉项 */
.template-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 140px;
}

.template-preview-icon {
  color: var(--eco-spring);
  cursor: pointer;
  font-size: var(--text-md);
  transition: color 0.2s ease;
}

.template-preview-icon:hover {
  color: var(--eco-moss);
}

/* eco-backdrop 装饰层 */
.eco-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}
.eco-leaf {
  position: absolute;
  color: var(--eco-moss);
}
.eco-leaf--1 {
  width: 200px;
  height: 200px;
  top: -50px;
  right: 310px;
  transform: rotate(-18deg);
  opacity: 0.07;
}
.eco-leaf--2 {
  width: 130px;
  height: 130px;
  bottom: 30px;
  left: 10px;
  transform: rotate(35deg);
  opacity: 0.05;
}
.eco-leaf--3 {
  width: 90px;
  height: 90px;
  top: 140px;
  left: 310px;
  transform: rotate(-8deg);
  opacity: 0.04;
}
.eco-network-graph {
  position: absolute;
  width: 520px;
  height: 260px;
  top: -10px;
  right: -20px;
  color: var(--eco-moss);
  opacity: 0.45;
}

/* El-Plus 覆盖：表头 */
:deep(.el-table th.el-table__cell) {
  background-color: var(--c-bg-muted) !important;
  color: var(--eco-forest-mid);
  font-weight: 600;
  font-size: var(--text-sm);
}

/* El-Plus 覆盖：Tag */
:deep(.el-tag--success) {
  background-color: rgba(64, 145, 108, 0.12);
  color: var(--eco-pine);
  border-color: rgba(64, 145, 108, 0.28);
}
:deep(.el-tag--primary) {
  background-color: rgba(116, 198, 157, 0.16);
  color: var(--eco-forest-mid);
  border-color: rgba(116, 198, 157, 0.35);
}

/* El-Plus 覆盖：Link Button */
:deep(.el-button.is-link.el-button--primary) {
  color: var(--eco-forest-mid);
}
:deep(.el-button.is-link.el-button--primary:hover) {
  color: var(--eco-forest);
}
:deep(.el-button.is-link.el-button--danger) {
  color: #b44b38;
}
:deep(.el-button.is-link.el-button--danger:hover) {
  color: #902f20;
}

/* El-Plus 覆盖：Input */
:deep(.el-input__wrapper) {
  border-radius: var(--radius-panel);
  box-shadow: 0 0 0 1px var(--eco-border-light);
}
:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--eco-border);
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--eco-moss) !important;
}

/* El-Plus 覆盖：Checkbox */
:deep(.el-checkbox__inner) {
  border-color: var(--eco-border);
}
:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--eco-moss);
  border-color: var(--eco-moss);
}

/* 模板预览对话框 (append-to-body, 需要 :deep 或 :global) */
</style>

<style>
.template-preview-dialog .template-preview-content {
  padding: 0 4px;
}

.template-preview-dialog .template-preview-summary {
  font-size: var(--text-sm);
  color: var(--c-text-base);
  margin-bottom: 12px;
}

.template-preview-dialog .template-preview-summary strong {
  color: var(--c-brand);
}

.template-preview-dialog .template-preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.template-preview-dialog .template-preview-table thead th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 600;
  color: var(--c-text-primary);
  font-size: var(--text-sm);
  border-bottom: 2px solid var(--c-brand-border);
  background: #c9edda;
  position: sticky;
  top: 0;
  z-index: 1;
}

.template-preview-dialog .template-preview-table tbody tr {
  transition: background 0.15s ease;
}

.template-preview-dialog .template-preview-table tbody tr:hover {
  background: var(--c-brand-soft);
}

.template-preview-dialog .template-preview-table td {
  padding: 7px 12px;
  border-bottom: 1px solid var(--c-border);
}

.template-preview-dialog .preview-col-name {
  font-weight: 600;
  color: var(--c-text-primary);
  font-family: var(--font-mono);
}

.template-preview-dialog .preview-value {
  color: var(--c-text-primary);
  font-family: var(--font-mono);
}

.template-preview-dialog .preview-unit {
  color: var(--c-text-secondary);
  font-size: var(--text-sm);
}

/* 模板预览对话框头部绿色渐变 */
.template-preview-dialog .el-dialog__header {
  background: linear-gradient(135deg, var(--c-brand-soft) 0%, var(--c-brand-border) 100%);
  border-bottom: 1px solid var(--c-brand-border);
  padding: 16px 20px;
  border-radius: var(--radius-overlay) var(--radius-overlay) 0 0;
}
.template-preview-dialog .el-dialog__title {
  color: var(--c-text-primary);
  font-weight: 600;
  font-size: var(--text-lg);
}
</style>
