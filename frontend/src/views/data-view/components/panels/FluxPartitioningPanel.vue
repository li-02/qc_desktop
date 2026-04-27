<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Settings,
  Play,
  RefreshCw,
  Info,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  Leaf,
  Droplets,
  Moon,
  Sun,
  List,
  CheckCircle,
  MapPin,
} from "lucide-vue-next";
import type { DatasetInfo } from "@shared/types/projectInterface";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import FluxPartitioningCharts from "../charts/FluxPartitioningCharts.vue";

// ==================== Props & Emits ====================
interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  refresh: [];
}>();

// ==================== Store ====================
const datasetStore = useDatasetStore();
const datasetInfo = computed(() => props.datasetInfo ?? datasetStore.currentDataset);
const currentVersion = computed(() => datasetStore.currentVersion);

// ==================== 分割类型 ====================
type PartitionType = "carbon" | "et";
const partitionType = ref<PartitionType>("carbon");

// ==================== 视图模式 ====================
type ViewMode = "config" | "result";
const currentView = ref<ViewMode>("config");
const showDetails = ref(false);

// ==================== 操作历史 ====================
interface PartitioningResult {
  id: number;
  methodId: string;
  methodName: string;
  status: "COMPLETED" | "RUNNING" | "FAILED" | "PENDING" | "APPLIED";
  executedAt: string;
  outputColumns?: string[];
  gppStats?: { column: string; mean?: number; std?: number; min?: number; max?: number };
  recoStats?: { column: string; mean?: number; std?: number; min?: number; max?: number };
  errorMessage?: string;
  name?: string;
  newVersionId?: number;
  columnMapping?: Record<string, string>;
}

const partitioningResults = ref<PartitioningResult[]>([]);
const currentResultId = ref<number | null>(null);

const currentResult = computed(() => {
  if (!currentResultId.value) return null;
  return partitioningResults.value.find(r => r.id === currentResultId.value) || null;
});

const switchToConfig = () => {
  currentView.value = "config";
  currentResultId.value = null;
};

const viewResult = (result: PartitioningResult) => {
  currentResultId.value = result.id;
  currentView.value = "result";
};

const loadResults = async () => {
  if (!datasetInfo.value?.id) return;
  try {
    const resp = await window.electronAPI.invoke(API_ROUTES.FLUX_PARTITIONING.GET_RESULTS_BY_DATASET, {
      datasetId: datasetInfo.value.id,
    });
    if (resp?.success && resp.data) {
      partitioningResults.value = resp.data;
    }
  } catch (e) {
    console.error("加载分割结果失败:", e);
  }
};

const deleteResult = async (resultId: number, event?: Event) => {
  if (event) event.stopPropagation();

  try {
    await ElMessageBox.confirm("确定要删除这条分割结果吗？", "删除确认", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      customClass: "qc-message-box",
    });

    const resp = await window.electronAPI.invoke(API_ROUTES.FLUX_PARTITIONING.DELETE_RESULT, resultId);
    if (resp?.success) {
      partitioningResults.value = partitioningResults.value.filter(r => r.id !== resultId);
      if (currentResultId.value === resultId) {
        switchToConfig();
      }
      ElMessage.success("已删除");
    } else {
      ElMessage.error(resp?.error || "删除失败");
    }
  } catch {
    // 用户取消
  }
};

// === 重命名相关 ===
const editingResultId = ref<number | null>(null);
const editingName = ref("");

// === 拖拽排序相关 ===
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

const getResultDisplayName = (result: PartitioningResult) => {
  if (result.name) return result.name;
  return result.methodName;
};

const startRenaming = (result: PartitioningResult) => {
  editingResultId.value = result.id;
  editingName.value = getResultDisplayName(result);
};

const saveRenaming = async () => {
  if (!editingResultId.value) return;
  const name = editingName.value.trim();
  if (!name) {
    cancelRenaming();
    return;
  }
  try {
    await window.electronAPI.invoke(API_ROUTES.FLUX_PARTITIONING.RENAME_RESULT, {
      id: editingResultId.value,
      name,
    });
    const target = partitioningResults.value.find(r => r.id === editingResultId.value);
    if (target) target.name = name;
  } catch (error: any) {
    ElMessage.error(error.message || "重命名失败");
  }
  cancelRenaming();
};

const cancelRenaming = () => {
  editingResultId.value = null;
  editingName.value = "";
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
  const list = [...partitioningResults.value];
  const [moved] = list.splice(dragIndex.value, 1);
  list.splice(index, 0, moved);
  partitioningResults.value = list;
  dragIndex.value = null;
  dragOverIndex.value = null;
  const orders = list.map((r, i) => ({ id: r.id, sortOrder: i }));
  try {
    await window.electronAPI.invoke(API_ROUTES.FLUX_PARTITIONING.REORDER_RESULTS, { orders });
  } catch (error: any) {
    ElMessage.error(error.message || "排序失败");
  }
};

const onDragEnd = () => {
  dragIndex.value = null;
  dragOverIndex.value = null;
};

const getStatusType = (status: string) => {
  switch (status) {
    case "COMPLETED":
    case "APPLIED":
      return "success";
    case "RUNNING":
      return "warning";
    case "FAILED":
      return "danger";
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
      return "已应用";
    default:
      return status;
  }
};

const formatDateTime = (dateValue: string | number) => {
  if (!dateValue) return "-";
  try {
    return new Date(dateValue).toLocaleString();
  } catch {
    return String(dateValue);
  }
};

// ==================== REddyProc 碳通量分割方法 ====================
interface PartitioningMethod {
  id: string;
  name: string;
  description: string;
  category: "nighttime" | "daytime";
  complexity: "medium" | "advanced";
  isAvailable: boolean;
  requiredColumns: string[];
  /** 软件来源 */
  softwareSource: {
    package: string;
    function: string;
    url: string;
  };
  /** 理论文献 */
  references: {
    label: string;
    authors: string;
    year: number;
    title: string;
    journal: string;
    doi: string;
  }[];
}

const carbonMethods: PartitioningMethod[] = [
  {
    id: "NIGHTTIME_REICHSTEIN",
    name: "夜间法 (Reichstein et al. 2005)",
    description:
      "利用夜间 NEE 数据（GPP=0）拟合 Lloyd-Taylor 呼吸模型 (Reco ~ Tair)，外推到白天得到全天候 Reco，再由 GPP = Reco - NEE 得到 GPP。分割前自动对 NEE/Rg/Tair/VPD 执行 MDS Gap-filling。",
    category: "nighttime",
    complexity: "medium",
    isAvailable: true,
    requiredColumns: ["NEE", "Rg", "Tair", "VPD"],
    softwareSource: {
      package: "REddyProc (R)",
      function: "sEddyProc$sMRFluxPartition()",
      url: "https://github.com/EarthyScience/REddyProc",
    },
    references: [
      {
        label: "方法原理",
        authors: "Reichstein, M., Falge, E., Baldocchi, D., et al.",
        year: 2005,
        title:
          "On the separation of net ecosystem exchange into assimilation and ecosystem respiration: review and improved algorithm",
        journal: "Global Change Biology, 11(9), 1424-1439",
        doi: "10.1111/j.1365-2486.2005.001002.x",
      },
      {
        label: "呼吸模型",
        authors: "Lloyd, J. & Taylor, J.A.",
        year: 1994,
        title: "On the temperature dependence of soil respiration",
        journal: "Functional Ecology, 8(3), 315-323",
        doi: "10.2307/2389824",
      },
    ],
  },
  {
    id: "DAYTIME_LASSLOP",
    name: "白天法 (Lasslop et al. 2010)",
    description:
      "利用白天 NEE 数据拟合包含 VPD 限制的 Michaelis-Menten 光响应曲线模型，在模型层面同时估算 GPP 和 Reco。在干旱/半干旱区域表现更优。分割前自动执行 MDS Gap-filling。",
    category: "daytime",
    complexity: "advanced",
    isAvailable: true,
    requiredColumns: ["NEE", "Rg", "Tair", "VPD"],
    softwareSource: {
      package: "REddyProc (R)",
      function: "sEddyProc$sGLFluxPartition()",
      url: "https://github.com/EarthyScience/REddyProc",
    },
    references: [
      {
        label: "方法原理",
        authors: "Lasslop, G., Reichstein, M., Papale, D., et al.",
        year: 2010,
        title:
          "Separation of net ecosystem exchange into assimilation and respiration using a light response curve approach: critical issues and global evaluation",
        journal: "Global Change Biology, 16(1), 187-208",
        doi: "10.1111/j.1365-2486.2009.02041.x",
      },
      {
        label: "软件实现",
        authors: "Wutzler, T., Lucas-Moffat, A., Migliavacca, M., et al.",
        year: 2018,
        title: "Basic and extensible post-processing of eddy covariance flux data with REddyProc",
        journal: "Biogeosciences, 15(16), 5015-5030",
        doi: "10.5194/bg-15-5015-2018",
      },
    ],
  },
];

const methodCategories = [
  { value: "nighttime", label: "夜间法", icon: "🌙" },
  { value: "daytime", label: "白天法", icon: "☀️" },
];

const activeCategory = ref<string>("nighttime");

const filteredMethods = computed(() => {
  return carbonMethods.filter(m => m.category === activeCategory.value);
});

// ==================== 参数初始化 ====================
const paramValues = ref<Record<string, any>>({});

const initMethodParams = (_method: PartitioningMethod) => {
  paramValues.value = {};
};

// ==================== 方法选择 ====================
const selectedMethodId = ref<string | null>(null);

const selectedMethod = computed(() => {
  return carbonMethods.find(m => m.id === selectedMethodId.value) || null;
});

const selectMethod = (method: PartitioningMethod) => {
  if (!method.isAvailable) return;
  selectedMethodId.value = method.id;
  initMethodParams(method);
};

const handleMethodChange = (val: any) => {
  const method = carbonMethods.find(m => m.id === val);
  if (method) {
    initMethodParams(method);
  }
};

// 自动选择当前分类下的第一个可用方法
watch(
  activeCategory,
  newCategory => {
    const methods = carbonMethods.filter(m => m.category === newCategory);
    if (methods.length > 0) {
      selectMethod(methods[0]);
    } else {
      selectedMethodId.value = null;
    }
  },
  { immediate: true }
);

// ==================== 站点位置参数 ====================
const siteInfo = ref({
  latDeg: 39.0,
  longDeg: 116.0,
  timezoneHour: 8,
});

// ==================== 高级选项 ====================
const advancedOptions = ref({
  ustarFiltering: false,
});

// u* 列相关：检测数据集中是否有可用的 u* 列
const ustarAliases = ["ustar", "USTAR", "u_star", "UST", "USTAR_F", "Ustar"];

const possibleUstarColumns = computed(() => {
  if (!availableColumns.value.length) return [];
  return availableColumns.value.filter(
    c => ustarAliases.some(alias => c.toUpperCase() === alias.toUpperCase()) || c.toUpperCase().includes("USTAR")
  );
});

const hasUstarColumn = computed(() => possibleUstarColumns.value.length > 0);

// 当关闭 u* 过滤时，清空 u* 列映射
watch(
  () => advancedOptions.value.ustarFiltering,
  enabled => {
    if (!enabled) {
      columnMapping.value["ustar"] = "";
    } else if (hasUstarColumn.value && !columnMapping.value["ustar"]) {
      // 自动匹配第一个可用的 u* 列
      columnMapping.value["ustar"] = possibleUstarColumns.value[0];
    }
  }
);

// ==================== 列映射 ====================
const columnMapping = ref<Record<string, string>>({});

const requiredColumns = computed(() => {
  if (!selectedMethod.value) return [];
  return selectedMethod.value.requiredColumns;
});

const availableColumns = computed(() => {
  if (!datasetInfo.value?.originalFile?.columns) return [];
  return datasetInfo.value.originalFile.columns;
});

const requiredColumnCount = computed(() => requiredColumns.value.length);
const matchedRequiredCount = computed(() => requiredColumns.value.filter(col => columnMapping.value[col]).length);
const canShowSiteInfo = computed(
  () =>
    siteInfo.value.latDeg !== null &&
    siteInfo.value.latDeg !== undefined &&
    siteInfo.value.longDeg !== null &&
    siteInfo.value.longDeg !== undefined
);

// 自动匹配列名
const autoMatchColumns = () => {
  if (!selectedMethod.value) return;

  const mapping: Record<string, string> = {};
  const cols = availableColumns.value;

  for (const required of requiredColumns.value) {
    // 精确匹配
    const exact = cols.find(c => c.toUpperCase() === required.toUpperCase());
    if (exact) {
      mapping[required] = exact;
      continue;
    }

    // 包含匹配
    const partial = cols.find(c => c.toUpperCase().includes(required.toUpperCase()));
    if (partial) {
      mapping[required] = partial;
      continue;
    }

    // 常用别名映射
    const aliases: Record<string, string[]> = {
      NEE: ["FC", "NEE_f", "NEE_uStar_f", "co2_flux", "NEE_VUT_REF"],
      Tair: ["TA", "Ta", "T_air", "air_temperature", "TA_F", "TA_F_MDS"],
      Rg: ["SW_IN", "PPFD", "Rg_f", "SW_IN_F", "SW_IN_F_MDS", "shortwave_radiation"],
      VPD: ["VPD_f", "VPD_F", "VPD_F_MDS", "vapor_pressure_deficit"],
      ustar: ["USTAR", "u_star", "UST", "USTAR_F"],
      rH: ["RH", "relative_humidity", "RH_F"],
    };

    const aliasList = aliases[required] || [];
    for (const alias of aliasList) {
      const match = cols.find(c => c.toUpperCase() === alias.toUpperCase());
      if (match) {
        mapping[required] = match;
        break;
      }
    }
  }

  columnMapping.value = mapping;
};

watch(
  [selectedMethod, availableColumns],
  () => {
    if (selectedMethod.value && availableColumns.value.length) {
      autoMatchColumns();
    }
  },
  { immediate: true }
);

// ==================== 执行状态 ====================
const isExecuting = ref(false);
const executionProgress = ref(0);
const executionMessage = ref("");

const canExecute = computed(() => {
  if (!selectedMethodId.value) return false;
  if (!datasetInfo.value) return false;
  if (!currentVersion.value) return false;

  // 检查所有必需列是否已映射
  for (const col of requiredColumns.value) {
    if (!columnMapping.value[col]) return false;
  }

  // 如果启用了 u* 过滤，必须映射 u* 列
  if (advancedOptions.value.ustarFiltering && !columnMapping.value["ustar"]) return false;

  // 检查站点信息
  if (!siteInfo.value.latDeg && siteInfo.value.latDeg !== 0) return false;
  if (!siteInfo.value.longDeg && siteInfo.value.longDeg !== 0) return false;

  return true;
});

// 监听进度事件
const onProgress = (_event: any, data: any) => {
  if (data && isExecuting.value) {
    executionProgress.value = data.progress || 0;
    executionMessage.value = data.message || "";
  }
};

const executePartitioning = async () => {
  if (!canExecute.value || !datasetInfo.value?.id || !currentVersion.value) return;

  try {
    isExecuting.value = true;
    executionProgress.value = 0;
    executionMessage.value = "准备数据...";

    // 注册进度监听
    window.electronAPI.on("fluxPartitioning:progress", onProgress);

    const request = {
      datasetId: datasetInfo.value.id,
      versionId: currentVersion.value.id,
      methodId: selectedMethodId.value,
      columnMapping: {
        neeCol: columnMapping.value["NEE"] || "",
        rgCol: columnMapping.value["Rg"] || "",
        tairCol: columnMapping.value["Tair"] || "",
        vpdCol: columnMapping.value["VPD"] || "",
        ustarCol: columnMapping.value["ustar"] || "",
      },
      siteInfo: {
        latDeg: siteInfo.value.latDeg,
        longDeg: siteInfo.value.longDeg,
        timezoneHour: siteInfo.value.timezoneHour,
      },
      options: {
        ustarFiltering: advancedOptions.value.ustarFiltering,
      },
    };

    const resp = await window.electronAPI.invoke(API_ROUTES.FLUX_PARTITIONING.EXECUTE, request);

    if (resp?.success) {
      ElMessage.success(resp.message || "通量分割完成");
      await loadResults();
      emit("refresh");
    } else {
      ElMessage.error(resp?.error || "通量分割失败，请重试");
    }
  } catch (error: any) {
    console.error("通量分割失败:", error);
    ElMessage.error(error.message || "通量分割失败，请重试");
  } finally {
    isExecuting.value = false;
    executionProgress.value = 0;
    executionMessage.value = "";
    window.electronAPI.removeListener("fluxPartitioning:progress", onProgress);
  }
};

// ==================== 辅助函数 ====================
const formatStat = (val?: number) => {
  if (val === undefined || val === null) return "-";
  return val.toFixed(4);
};

// ==================== 图表数据：传递文件路径给图表组件自行加载 ====================
const chartFilePath = ref<string>("");

const loadChartFilePath = async (result: PartitioningResult) => {
  if (result.status !== "COMPLETED") {
    chartFilePath.value = "";
    return;
  }

  try {
    const versionsResp = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSIONS, {
      datasetId: datasetInfo.value?.id,
    });
    if (!versionsResp?.success) {
      console.warn("[FluxPanel] 获取版本列表失败:", versionsResp?.error);
      return;
    }

    let targetVersion = result.newVersionId ? versionsResp.data.find((v: any) => v.id === result.newVersionId) : null;
    if (!targetVersion) {
      console.warn(`[FluxPanel] 未找到 newVersionId=${result.newVersionId} 对应版本，尝试查找 QC 版本`);
      targetVersion = [...versionsResp.data].reverse().find((v: any) => v.stageType === "QC" && v.filePath);
    }
    chartFilePath.value = targetVersion?.filePath || "";
    console.log("[FluxPanel] 图表文件路径:", chartFilePath.value || "(空)");
  } catch (e: any) {
    console.error("获取图表文件路径失败:", e);
    chartFilePath.value = "";
  }
};

watch(currentResult, newResult => {
  if (newResult && newResult.status === "COMPLETED") {
    loadChartFilePath(newResult);
  } else {
    chartFilePath.value = "";
  }
});

// ==================== 生命周期 ====================
onMounted(() => {
  if (datasetInfo.value) {
    loadResults();
  }
});

onBeforeUnmount(() => {
  window.electronAPI.removeListener("fluxPartitioning:progress", onProgress);
});
</script>

<template>
  <div class="flux-partitioning-panel">
    <div class="eco-backdrop" aria-hidden="true">
      <svg class="eco-leaf eco-leaf-1" viewBox="0 0 80 80" fill="none">
        <path d="M10 70 C30 50, 70 10, 10 10 C10 10, 10 50, 50 70 Z" fill="rgba(64,145,108,0.07)" />
      </svg>
      <svg class="eco-leaf eco-leaf-2" viewBox="0 0 60 60" fill="none">
        <path d="M5 55 C25 35, 55 5, 5 5 C5 5, 5 35, 45 55 Z" fill="rgba(82,183,136,0.05)" />
      </svg>
      <svg class="eco-net" viewBox="0 0 200 200" fill="none">
        <circle cx="40" cy="40" r="3" fill="rgba(64,145,108,0.15)" />
        <circle cx="120" cy="36" r="2" fill="rgba(64,145,108,0.12)" />
        <circle cx="160" cy="82" r="3" fill="rgba(64,145,108,0.15)" />
        <circle cx="70" cy="118" r="2" fill="rgba(64,145,108,0.12)" />
        <circle cx="142" cy="146" r="3" fill="rgba(64,145,108,0.15)" />
        <line x1="40" y1="40" x2="120" y2="36" stroke="rgba(64,145,108,0.08)" />
        <line x1="120" y1="36" x2="160" y2="82" stroke="rgba(64,145,108,0.08)" />
        <line x1="40" y1="40" x2="70" y2="118" stroke="rgba(64,145,108,0.08)" />
        <line x1="70" y1="118" x2="142" y2="146" stroke="rgba(64,145,108,0.08)" />
        <line x1="160" y1="82" x2="142" y2="146" stroke="rgba(64,145,108,0.08)" />
      </svg>
    </div>

    <div v-if="!datasetInfo" class="empty-state">
      <Leaf :size="48" class="empty-icon" />
      <h3 class="empty-title">未选择数据集</h3>
      <p class="empty-description">请先选择一个数据集以配置通量分割。</p>
    </div>

    <div v-else class="panel-layout">
      <!-- 中间：操作历史侧边栏（与 GapFillingPanel 风格一致） -->
      <div class="panel-sidebar">
        <!-- 新建按钮 -->
        <div class="sidebar-header">
          <button class="new-partition-btn" @click="switchToConfig">
            <Plus :size="16" />
            <span>新建分割</span>
          </button>
        </div>

        <div class="history-section">
          <div class="sidebar-subtitle"><span>操作历史</span></div>
          <div class="history-list">
            <div v-if="partitioningResults.length === 0" class="history-empty">
              <span>暂无分割记录</span>
            </div>
            <div
              v-for="(result, index) in partitioningResults"
              :key="result.id"
              class="history-item"
              :class="{
                'history-item--active': currentResultId === result.id,
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
                <div v-if="editingResultId === result.id" class="history-name-edit" @click.stop>
                  <input
                    v-model="editingName"
                    class="history-name-input"
                    @keyup.enter="saveRenaming"
                    @keyup.escape="cancelRenaming"
                    @blur="saveRenaming"
                    autofocus />
                </div>
                <span v-else class="history-method" :title="getResultDisplayName(result)">{{
                  getResultDisplayName(result)
                }}</span>
                <div class="history-item-actions">
                  <button class="history-action-btn" @click.stop="startRenaming(result)" title="重命名">
                    <Pencil :size="14" />
                  </button>
                  <button
                    class="history-action-btn history-delete-btn"
                    @click.stop="deleteResult(result.id)"
                    title="删除">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
              <div class="history-item-content">
                <el-tag size="small" :type="getStatusType(result.status)" effect="light" round>
                  {{ getStatusText(result.status) }}
                </el-tag>
              </div>
              <div class="history-item-stats">
                <span class="stat-item">碳通量分割</span>
                <span class="stat-item">{{ result.methodName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="panel-main">
        <!-- 分割类型切换 -->
        <div class="partition-type-tabs">
          <button
            class="partition-type-tab"
            :class="{ 'partition-type-tab--active': partitionType === 'carbon' }"
            @click="partitionType = 'carbon'">
            <Leaf :size="16" class="tab-icon" />
            <span>碳通量分割</span>
          </button>
          <button
            class="partition-type-tab"
            :class="{ 'partition-type-tab--active': partitionType === 'et' }"
            @click="partitionType = 'et'">
            <Droplets :size="16" class="tab-icon" />
            <span>蒸散发分割</span>
          </button>
        </div>

        <!-- ==================== 碳通量分割 ==================== -->
        <template v-if="partitionType === 'carbon'">
          <!-- 配置模式 -->
          <div v-if="currentView === 'config'" class="config-view">
            <div class="top-info-area">
              <div class="version-bar">
                <div class="version-bar-left">
                  <Info :size="16" class="version-icon" />
                  <span class="version-bar-label">数据版本</span>
                  <span class="version-chip">#{{ currentVersion?.id ?? "-" }}</span>
                  <span class="version-meta-text">{{
                    currentVersion?.createdAt ? formatDateTime(currentVersion.createdAt) : "未加载版本"
                  }}</span>
                </div>
                <el-button link type="primary" size="small" @click="emit('refresh')">
                  <RefreshCw :size="14" />
                  刷新数据
                </el-button>
              </div>

              <div class="stats-strip">
                <div class="stat-chip">
                  <div class="stat-chip-icon icon-blue">
                    <List :size="16" />
                  </div>
                  <div class="stat-chip-info">
                    <span class="stat-chip-value">{{ availableColumns.length }}</span>
                    <span class="stat-chip-label">可用列</span>
                  </div>
                </div>
                <div class="stat-strip-divider"></div>
                <div class="stat-chip">
                  <div class="stat-chip-icon icon-purple">
                    <CheckCircle :size="16" />
                  </div>
                  <div class="stat-chip-info">
                    <span class="stat-chip-value">{{ matchedRequiredCount }}/{{ requiredColumnCount }}</span>
                    <span class="stat-chip-label">变量映射</span>
                  </div>
                </div>
                <div class="stat-strip-divider"></div>
                <div class="stat-chip" :class="{ 'stat-chip--alert': !canShowSiteInfo }">
                  <div class="stat-chip-icon icon-green">
                    <MapPin :size="16" />
                  </div>
                  <div class="stat-chip-info">
                    <span class="stat-chip-value">{{
                      canShowSiteInfo ? `${siteInfo.latDeg.toFixed(2)}, ${siteInfo.longDeg.toFixed(2)}` : "-"
                    }}</span>
                    <span class="stat-chip-label">站点坐标</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 头部操作栏 -->
            <div class="view-header">
              <div class="header-title">
                <h2>碳通量分割 (REddyProc)</h2>
                <span class="header-desc">基于 REddyProc 包的 NEE 分割方法，将 NEE 分割为 GPP 和 Reco</span>
              </div>
              <div class="header-actions">
                <el-button
                  class="action-btn primary-gradient-btn"
                  type="primary"
                  :loading="isExecuting"
                  :disabled="!canExecute"
                  @click="executePartitioning">
                  <Play :size="16" /> 开始分割
                </el-button>
              </div>
            </div>

            <!-- 顶部选择区域 -->
            <div class="top-selection-panel">
              <div class="section-header">
                <h3 class="section-title">
                  <Settings :size="15" />
                  选择分割方法
                </h3>
              </div>
              <div class="category-row">
                <div class="category-tabs-compact">
                  <button
                    v-for="cat in methodCategories"
                    :key="cat.value"
                    class="category-tab-compact"
                    :class="{ 'category-tab-compact--active': activeCategory === cat.value }"
                    @click="activeCategory = cat.value">
                    <Moon v-if="cat.value === 'nighttime'" :size="14" class="category-icon" />
                    <Sun v-else :size="14" class="category-icon" />
                    <span class="category-label">{{ cat.label }}</span>
                  </button>
                </div>
                <div class="divider-vertical"></div>
                <div class="method-radio-group" v-if="filteredMethods.length">
                  <span class="method-select-label">选择算法：</span>
                  <el-radio-group v-model="selectedMethodId" @change="handleMethodChange">
                    <el-radio-button
                      v-for="method in filteredMethods"
                      :key="method.id"
                      :value="method.id"
                      :disabled="!method.isAvailable">
                      {{ method.name }}
                    </el-radio-button>
                  </el-radio-group>
                </div>
              </div>

              <!-- 方法详情折叠面板 -->
              <div class="method-details-compact" v-if="selectedMethod">
                <div class="details-collapse-header" @click="showDetails = !showDetails">
                  <ChevronRight :size="14" class="collapse-arrow" :class="{ 'is-active': showDetails }" />
                  <Info :size="14" class="info-icon" />
                  <span class="info-title">算法说明与参考文献</span>
                </div>

                <div class="details-content" v-show="showDetails">
                  <p class="method-desc-text">{{ selectedMethod.description }}</p>

                  <div class="method-meta-grid">
                    <div class="meta-item">
                      <span class="meta-label">软件来源:</span>
                      <span class="source-package">{{ selectedMethod.softwareSource.package }}</span>
                      <code class="source-function">{{ selectedMethod.softwareSource.function }}</code>
                    </div>
                  </div>

                  <div class="ref-list-compact">
                    <div v-for="(ref, idx) in selectedMethod.references" :key="idx" class="ref-item">
                      <span class="ref-tag">{{ ref.label }}</span>
                      <span class="ref-text">
                        {{ ref.authors }} ({{ ref.year }}). <em>{{ ref.title }}</em
                        >.
                        <a v-if="ref.doi" :href="`https://doi.org/${ref.doi}`" target="_blank" class="ref-doi">DOI</a>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 可滚动内容区域 -->
            <div class="scrollable-content">
              <el-scrollbar>
                <!-- 选中方法后的配置区域 -->
                <div v-if="selectedMethod" class="config-section">
                  <!-- 列映射 -->
                  <div class="config-block">
                    <div class="config-block-header">
                      <h3>变量映射</h3>
                      <el-button size="small" text type="primary" @click="autoMatchColumns">
                        <RefreshCw :size="14" /> 自动匹配
                      </el-button>
                    </div>
                    <div class="column-mapping-grid">
                      <div v-for="col in requiredColumns" :key="col" class="mapping-row">
                        <div class="mapping-label">
                          <span class="mapping-var">{{ col }}</span>
                          <ChevronRight :size="14" class="mapping-arrow" />
                        </div>
                        <el-select
                          v-model="columnMapping[col]"
                          placeholder="选择对应列"
                          filterable
                          clearable
                          size="default"
                          class="mapping-select">
                          <el-option v-for="c in availableColumns" :key="c" :label="c" :value="c" />
                        </el-select>
                        <el-tag
                          v-if="columnMapping[col]"
                          type="success"
                          size="small"
                          effect="light"
                          round
                          class="mapping-status">
                          已匹配
                        </el-tag>
                        <el-tag v-else type="danger" size="small" effect="light" round class="mapping-status">
                          未匹配
                        </el-tag>
                      </div>
                    </div>
                  </div>

                  <div class="two-column-layout">
                    <!-- 站点位置参数 -->
                    <div class="config-block">
                      <div class="config-block-header">
                        <h3>站点位置信息</h3>
                        <Settings :size="14" class="config-icon" />
                      </div>
                      <div class="params-grid">
                        <div class="param-item">
                          <label class="param-label">纬度 (°)</label>
                          <el-input-number
                            v-model="siteInfo.latDeg"
                            :min="-90"
                            :max="90"
                            :step="0.1"
                            :precision="2"
                            controls-position="right"
                            class="param-input" />
                        </div>
                        <div class="param-item">
                          <label class="param-label">经度 (°)</label>
                          <el-input-number
                            v-model="siteInfo.longDeg"
                            :min="-180"
                            :max="180"
                            :step="0.1"
                            :precision="2"
                            controls-position="right"
                            class="param-input" />
                        </div>
                        <div class="param-item">
                          <label class="param-label">时区 (UTC+)</label>
                          <el-input-number
                            v-model="siteInfo.timezoneHour"
                            :min="-12"
                            :max="14"
                            :step="1"
                            controls-position="right"
                            class="param-input" />
                        </div>
                      </div>
                    </div>

                    <!-- 高级选项: u* 过滤 -->
                    <div class="config-block">
                      <div class="config-block-header">
                        <h3>高级选项</h3>
                        <Settings :size="14" class="config-icon" />
                      </div>

                      <div class="ustar-option">
                        <div class="ustar-switch-row">
                          <div class="ustar-switch-info">
                            <label class="param-label">启用 u* 过滤</label>
                            <span class="ustar-hint"> 过滤弱湍流条件下不可靠的夜间 NEE 数据。 </span>
                          </div>
                          <el-switch v-model="advancedOptions.ustarFiltering" :disabled="!hasUstarColumn" />
                        </div>

                        <!-- 没有 u* 列时的警告 -->
                        <div v-if="!hasUstarColumn" class="ustar-warning">
                          <Info :size="14" style="color: var(--c-warning); margin-right: 6px" />
                          <span>未检测到 u* 列</span>
                        </div>

                        <!-- 启用 u* 过滤后显示列映射 -->
                        <div v-if="advancedOptions.ustarFiltering" class="ustar-column-mapping">
                          <div class="mapping-row">
                            <div class="mapping-label">
                              <span class="mapping-var">u*</span>
                              <ChevronRight :size="14" class="mapping-arrow" />
                            </div>
                            <el-select
                              v-model="columnMapping['ustar']"
                              placeholder="选择 u* 对应列"
                              filterable
                              clearable
                              size="small"
                              class="mapping-select">
                              <el-option v-for="c in availableColumns" :key="c" :label="c" :value="c" />
                            </el-select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 执行进度 -->
                <div v-if="isExecuting" class="execution-section">
                  <div class="execution-card">
                    <div class="execution-header">
                      <span class="execution-title">正在执行通量分割...</span>
                      <span class="execution-percent">{{ Math.round(executionProgress) }}%</span>
                    </div>
                    <el-progress
                      :percentage="executionProgress"
                      :stroke-width="8"
                      :show-text="false"
                      color="#22c55e"
                      class="execution-progress" />
                    <p class="execution-message">{{ executionMessage }}</p>
                  </div>
                </div>
              </el-scrollbar>
            </div>
          </div>

          <!-- 结果模式 -->
          <div v-else-if="currentView === 'result'" class="config-view">
            <div class="view-header">
              <div class="header-title">
                <h2>分割结果</h2>
                <span class="header-desc" v-if="currentResult">{{ getResultDisplayName(currentResult) }}</span>
              </div>
              <div class="header-actions">
                <el-button class="action-btn" plain @click="switchToConfig"> <Plus :size="16" /> 新建分割 </el-button>
              </div>
            </div>

            <div class="scrollable-content">
              <el-scrollbar>
                <div v-if="currentResult" class="result-detail">
                  <!-- 状态信息 -->
                  <div class="config-block">
                    <div class="config-block-header">
                      <h3>分割概览</h3>
                      <el-tag :type="getStatusType(currentResult.status)" effect="light" round>
                        {{ getStatusText(currentResult.status) }}
                      </el-tag>
                    </div>
                    <div class="result-info-grid">
                      <div class="result-info-item">
                        <span class="result-info-label">方法</span>
                        <span class="result-info-value">{{ currentResult.methodName }}</span>
                      </div>
                      <div class="result-info-item">
                        <span class="result-info-label">执行时间</span>
                        <span class="result-info-value">{{ formatDateTime(currentResult.executedAt) }}</span>
                      </div>
                      <div class="result-info-item" v-if="currentResult.outputColumns?.length">
                        <span class="result-info-label">输出列</span>
                        <span class="result-info-value">
                          <el-tag
                            v-for="col in currentResult.outputColumns"
                            :key="col"
                            size="small"
                            effect="plain"
                            round
                            style="margin: 2px">
                            {{ col }}
                          </el-tag>
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- GPP 统计 -->
                  <div v-if="currentResult.gppStats" class="config-block">
                    <div class="config-block-header">
                      <h3>GPP 统计 ({{ currentResult.gppStats.column }})</h3>
                    </div>
                    <div class="result-stats-grid">
                      <div class="stat-card">
                        <span class="stat-label">均值</span>
                        <span class="stat-value">{{ formatStat(currentResult.gppStats.mean) }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">标准差</span>
                        <span class="stat-value">{{ formatStat(currentResult.gppStats.std) }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">最小值</span>
                        <span class="stat-value">{{ formatStat(currentResult.gppStats.min) }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">最大值</span>
                        <span class="stat-value">{{ formatStat(currentResult.gppStats.max) }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Reco 统计 -->
                  <div v-if="currentResult.recoStats" class="config-block">
                    <div class="config-block-header">
                      <h3>Reco 统计 ({{ currentResult.recoStats.column }})</h3>
                    </div>
                    <div class="result-stats-grid">
                      <div class="stat-card">
                        <span class="stat-label">均值</span>
                        <span class="stat-value">{{ formatStat(currentResult.recoStats.mean) }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">标准差</span>
                        <span class="stat-value">{{ formatStat(currentResult.recoStats.std) }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">最小值</span>
                        <span class="stat-value">{{ formatStat(currentResult.recoStats.min) }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">最大值</span>
                        <span class="stat-value">{{ formatStat(currentResult.recoStats.max) }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- 可视化图表 -->
                  <div
                    v-if="currentResult.status === 'COMPLETED' && chartFilePath"
                    class="config-block"
                    style="border: none; padding: 0; background: transparent">
                    <FluxPartitioningCharts :file-path="chartFilePath" />
                  </div>
                  <div v-else-if="currentResult.status === 'COMPLETED' && !chartFilePath" class="config-block">
                    <div style="text-align: center; padding: 40px; color: var(--c-text-secondary)">
                      <p>正在加载图表数据...</p>
                    </div>
                  </div>

                  <!-- 错误信息 -->
                  <div
                    v-if="currentResult.errorMessage"
                    class="config-block"
                    style="border-color: rgba(239, 68, 68, 0.3)">
                    <div class="config-block-header">
                      <h3 style="color: var(--c-danger)">错误信息</h3>
                    </div>
                    <p
                      style="
                        color: var(--c-text-secondary);
                        font-size: var(--text-sm);
                        margin: 0;
                        white-space: pre-wrap;
                      ">
                      {{ currentResult.errorMessage }}
                    </p>
                  </div>
                </div>

                <div v-else class="result-placeholder">
                  <div class="placeholder-emoji">📊</div>
                  <h3>分割结果查看</h3>
                  <p>选择左侧的历史记录查看分割结果详情。</p>
                </div>
              </el-scrollbar>
            </div>
          </div>
        </template>

        <!-- ==================== 蒸散发分割 ==================== -->
        <div v-if="partitionType === 'et'" class="config-view">
          <div class="view-header">
            <div class="header-title">
              <h2>蒸散发分割 (ET Partitioning)</h2>
              <span class="header-desc">将蒸散发 (ET) 分割为蒸腾 (T) 和蒸发 (E) 组分</span>
            </div>
          </div>

          <div class="et-placeholder">
            <div class="placeholder-emoji">💧</div>
            <h3>蒸散发分割</h3>
            <p>蒸散发 (ET) 分割功能开发中，敬请期待...</p>
            <div class="et-feature-preview">
              <div class="feature-item">
                <span class="feature-icon">🔬</span>
                <span class="feature-text">基于多种方法将 ET 分割为蒸腾 (T) 和蒸发 (E)</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">📊</span>
                <span class="feature-text">支持 T/ET 比值分析与可视化</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">⚙️</span>
                <span class="feature-text">可配置的参数与高级选项</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 主布局 ==================== */
.flux-partitioning-panel {
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

.eco-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.eco-leaf {
  position: absolute;
}

.eco-leaf-1 {
  top: -20px;
  right: -10px;
  width: 180px;
  height: 180px;
  transform: rotate(15deg);
}

.eco-leaf-2 {
  bottom: 60px;
  left: -20px;
  width: 120px;
  height: 120px;
  transform: rotate(-30deg);
}

.eco-net {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 220px;
  height: 220px;
  opacity: 0.8;
}

.empty-state {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
}

.empty-icon {
  color: var(--eco-moss);
  margin-bottom: 16px;
}

.empty-title {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--eco-text-dark);
  margin: 0 0 8px;
}

.empty-description {
  color: var(--eco-text-muted);
  font-size: var(--text-lg);
  margin: 0;
}

.panel-layout {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  gap: 8px;
}

/* ==================== 中间：操作历史侧边栏 ==================== */
.panel-sidebar {
  width: 280px;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--eco-border-light);
}

.new-partition-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--c-text-inverse);
  background: linear-gradient(135deg, var(--eco-moss), var(--eco-forest-mid));
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(45, 106, 79, 0.3);
}

.new-partition-btn:hover {
  background: linear-gradient(135deg, var(--eco-fern), var(--eco-moss));
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(45, 106, 79, 0.4);
}

.sidebar-subtitle {
  padding: 16px 20px 8px;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--c-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.history-empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--c-text-muted);
  font-size: var(--text-md);
}

.history-item {
  padding: 14px;
  border-radius: var(--radius-panel);
  cursor: pointer;
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  background: var(--eco-surface);
}

.history-item:hover {
  background: var(--eco-ice);
  border-color: var(--eco-border-light);
  box-shadow: 0 2px 8px rgba(45, 106, 79, 0.06);
}

.history-item--active,
.history-item.active {
  background: var(--eco-mist);
  border-color: var(--eco-border);
}

.history-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.drag-handle {
  cursor: grab;
  color: var(--c-text-muted);
  font-size: var(--text-md);
  flex-shrink: 0;
}

.drag-handle:active {
  cursor: grabbing;
}

.history-item--drag-over {
  border-top: 2px solid var(--c-info) !important;
}

.history-name-edit {
  flex: 1;
  min-width: 0;
}

.history-name-input {
  width: 100%;
  padding: 2px 6px;
  border: 1px solid var(--eco-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  outline: none;
  background: var(--eco-white);
}

.history-item-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
}

.history-action-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--c-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
}

.history-action-btn:hover {
  background: rgba(59, 130, 246, 0.1);
  color: var(--c-info);
}

.history-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  color: var(--c-danger) !important;
}

.history-method {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--eco-text-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.history-item-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.history-item-stats {
  display: flex;
  gap: 12px;
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(156, 163, 175, 0.3);
  border-radius: var(--radius-xs);
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.5);
}

/* ==================== 主内容区 ==================== */
.panel-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
}

/* ==================== 分割类型切换 ==================== */
.partition-type-tabs {
  display: flex;
  gap: 8px;
  padding: 24px 24px 0;
  flex-shrink: 0;
}

.partition-type-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border: 1px solid var(--eco-border-light);
  background: var(--eco-white);
  cursor: pointer;
  font-size: var(--text-md);
  font-weight: 500;
  color: var(--c-text-secondary);
  transition: all 0.2s ease;
}

.partition-type-tab:hover {
  border-color: var(--eco-border);
  color: var(--eco-text-dark);
}

.partition-type-tab--active {
  background: var(--eco-mist);
  border-color: var(--eco-border);
  color: var(--eco-moss);
  font-weight: 600;
}

.tab-icon {
  color: currentColor;
  flex-shrink: 0;
}

.config-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 20px 24px 24px;
}

.top-info-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  padding: 16px 20px;
  flex-shrink: 0;
}

.version-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.version-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.version-icon {
  color: var(--eco-moss);
  flex-shrink: 0;
}

.version-bar-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--eco-text-dark);
  white-space: nowrap;
}

.version-chip {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: rgba(64, 145, 108, 0.08);
  color: var(--eco-moss);
  font-size: var(--text-sm);
  font-weight: 700;
}

.version-meta-text {
  color: var(--c-text-muted);
  font-size: var(--text-sm);
  white-space: nowrap;
}

.stats-strip {
  display: flex;
  align-items: stretch;
  padding-top: 12px;
  border-top: 1px solid var(--eco-border-light);
}

.stat-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
}

.stat-chip-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control);
}

.stat-chip-icon.icon-blue {
  background: rgba(59, 130, 246, 0.1);
  color: var(--c-info);
}

.stat-chip-icon.icon-purple {
  background: rgba(139, 92, 246, 0.1);
  color: var(--color-purple-600);
}

.stat-chip-icon.icon-green {
  background: rgba(64, 145, 108, 0.1);
  color: var(--eco-moss);
}

.stat-chip-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-chip-value {
  color: var(--c-text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-chip-label {
  color: var(--c-text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.stat-chip--alert .stat-chip-value {
  color: var(--c-danger);
}

.stat-strip-divider {
  flex-shrink: 0;
  width: 1px;
  height: 32px;
  align-self: center;
  background: var(--c-border);
}

/* ==================== 头部 ==================== */
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.header-title h2 {
  font-size: var(--text-3xl);
  font-weight: 600;
  color: var(--c-text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-desc {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin-top: 6px;
  display: block;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-btn {
  border-radius: var(--radius-control);
  font-size: var(--text-sm);
}

.primary-gradient-btn {
  background: var(--c-brand) !important;
  border: none !important;
  height: 36px;
  min-width: 110px;
  font-weight: 600;
}

.primary-gradient-btn:hover {
  background: var(--c-brand-active) !important;
}

.primary-gradient-btn:disabled {
  background: var(--c-text-muted) !important;
  color: var(--c-text-inverse) !important;
  cursor: not-allowed;
}

/* ==================== 顶部选择区域 ==================== */
.top-selection-panel {
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  padding: 20px;
  flex-shrink: 0;
}

.section-header {
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  margin: 0;
  color: var(--eco-text-dark);
  font-size: var(--text-lg);
  font-weight: 700;
}

.section-title::before {
  content: "";
  display: block;
  width: 4px;
  height: 16px;
  margin-right: 8px;
  border-radius: var(--radius-xs);
  background: var(--eco-moss);
}

.category-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.category-tabs-compact {
  display: flex;
  gap: 8px;
  background: transparent;
  padding: 0;
  border-radius: var(--radius-panel);
}

.category-tab-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-control);
  border: 1px solid var(--eco-border-light);
  background: var(--eco-white);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  font-weight: 500;
}

.category-tab-compact:hover {
  border-color: var(--eco-border);
  color: var(--eco-text-dark);
}

.category-tab-compact--active {
  background: linear-gradient(135deg, var(--eco-moss), var(--eco-forest-mid));
  color: var(--c-text-inverse);
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(45, 106, 79, 0.25);
  font-weight: 600;
}

.divider-vertical {
  width: 1px;
  height: 32px;
  background: var(--eco-border-light);
}

.method-radio-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-select-label {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  font-weight: 500;
}

.method-radio-group :deep(.el-radio-button__inner) {
  border-color: var(--eco-border-light);
  color: var(--eco-text-mid);
  font-weight: 600;
}

.method-radio-group :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--eco-moss);
  border-color: var(--eco-moss);
  box-shadow: -1px 0 0 0 var(--eco-moss);
  color: var(--c-text-inverse);
}

/* ==================== 方法详情折叠面板 ==================== */
.method-details-compact {
  margin-top: 12px;
  border-top: 1px solid var(--c-border);
  padding-top: 4px;
}

.collapse-arrow {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  transition: transform 0.2s;
  cursor: pointer;
  margin-right: 2px;
}

.collapse-arrow.is-active {
  transform: rotate(90deg);
}

.details-collapse-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 0;
  transition: opacity 0.2s;
}

.details-collapse-header:hover {
  opacity: 0.8;
}

.info-icon {
  color: var(--c-brand);
}

.info-title {
  margin-right: 8px;
}

.details-content {
  padding: 8px 4px;
  font-size: var(--text-sm);
  color: #4b5563;
}

.method-desc-text {
  line-height: 1.6;
  margin: 0 0 12px;
}

.method-meta-grid {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-label {
  font-weight: 600;
  color: var(--c-text-muted);
  font-size: var(--text-xs);
}

.ref-list-compact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--c-bg-muted);
  padding: 8px;
  border-radius: var(--radius-panel);
}

/* ==================== 两列布局 ==================== */
.two-column-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .two-column-layout {
    grid-template-columns: 1fr;
  }
}

/* ==================== 复杂度标签 ==================== */
.complexity-tag {
  margin-left: auto;
  border-width: 1px;
}

.complexity--simple {
  background: rgba(209, 250, 229, 0.6);
  color: #065f46;
  border-color: rgba(16, 185, 129, 0.2);
}

.complexity--medium {
  background: rgba(254, 243, 199, 0.6);
  color: #92400e;
  border-color: rgba(245, 158, 11, 0.2);
}

.complexity--advanced {
  background: rgba(224, 231, 255, 0.6);
  color: #3730a3;
  border-color: rgba(99, 102, 241, 0.2);
}

/* ==================== 复用样式: 来源与文献 ==================== */
.source-package {
  font-size: var(--text-sm);
  color: #4b5563;
  font-weight: 500;
  background: rgba(99, 102, 241, 0.08);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.source-function {
  font-size: var(--text-xs);
  color: var(--color-purple-600);
  background: rgba(124, 58, 237, 0.06);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.ref-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.5;
}

.ref-tag {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--c-text-secondary);
  background: rgba(107, 114, 128, 0.08);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  margin-top: 2px;
  white-space: nowrap;
}

.ref-text {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  line-height: 1.5;
}

.ref-text em {
  color: #4b5563;
  font-style: italic;
}

.ref-doi {
  display: inline-block;
  font-size: var(--text-2xs);
  font-weight: 600;
  color: #2563eb;
  background: rgba(37, 99, 235, 0.06);
  padding: 0 5px;
  border-radius: var(--radius-xs);
  text-decoration: none;
  margin-left: 2px;
  transition: all 0.15s;
}

.ref-doi:hover {
  background: rgba(37, 99, 235, 0.15);
  color: #1d4ed8;
}

/* ==================== 可滚动内容区域 ==================== */
.scrollable-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ==================== 配置区域 ==================== */
.config-section {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-block {
  background: var(--eco-white);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  padding: 20px;
}

.config-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.config-block-header h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--eco-text-dark);
  margin: 0;
}

.config-icon {
  color: var(--c-text-muted);
}

.config-hint {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin: 0 0 12px;
}

/* ==================== 列映射 ==================== */
.column-mapping-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mapping-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 100px;
}

.mapping-var {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-primary);
  font-family: var(--font-mono);
  background: rgba(64, 145, 108, 0.08);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.mapping-arrow {
  color: var(--c-text-muted);
  font-size: var(--text-md);
}

.mapping-select {
  flex: 1;
  max-width: 280px;
}

.mapping-status {
  flex-shrink: 0;
}

/* ==================== 参数配置 ==================== */
.params-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--c-text-base);
}

.param-input {
  width: 100%;
}

/* ==================== u* 过滤选项 ==================== */
.ustar-option {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ustar-switch-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ustar-switch-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.ustar-hint {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
  line-height: 1.5;
}

.ustar-hint strong {
  color: var(--c-text-secondary);
}

.ustar-warning {
  display: flex;
  align-items: flex-start;
  padding: 10px 14px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--radius-panel);
  font-size: var(--text-sm);
  color: #92400e;
  line-height: 1.5;
}

.ustar-column-mapping {
  padding-top: 4px;
}

/* ==================== 执行进度 ==================== */
.execution-section {
  padding: 16px 0 0;
}

.execution-card {
  background: var(--eco-mist);
  border: 1px solid var(--eco-border);
  border-radius: var(--radius-panel);
  padding: 20px;
}

.execution-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.execution-title {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--eco-moss);
}

.execution-percent {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--c-brand-active);
}

.execution-progress {
  margin-bottom: 8px;
}

.execution-message {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin: 0;
}

/* ==================== 结果占位 ==================== */
.result-placeholder {
  text-align: center;
  padding: 60px 40px;
}

.result-placeholder .placeholder-emoji {
  font-size: var(--text-display-xl);
  margin-bottom: 16px;
}

.result-placeholder h3 {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--c-text-primary);
  margin: 0 0 8px;
}

.result-placeholder p {
  font-size: var(--text-lg);
  color: var(--c-text-secondary);
  line-height: 1.6;
  max-width: 400px;
  margin: 0 auto;
}

/* ==================== 结果详情 ==================== */
.result-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0;
}

.result-info-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-info-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.result-info-label {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  min-width: 80px;
  flex-shrink: 0;
}

.result-info-value {
  font-size: var(--text-sm);
  color: var(--c-text-primary);
  font-weight: 500;
}

.result-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--eco-surface);
  border: 1px solid var(--eco-border-light);
  border-radius: var(--radius-panel);
  padding: 12px;
  text-align: center;
}

.stat-label {
  display: block;
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--c-text-primary);
  letter-spacing: -0.02em;
  font-family: var(--font-mono);
}

/* ==================== 蒸散发占位 ==================== */
.et-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 40px;
}

.et-placeholder .placeholder-emoji {
  font-size: var(--text-display-xl);
  margin-bottom: 16px;
}

.et-placeholder h3 {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--c-text-primary);
  margin: 0 0 8px;
}

.et-placeholder p {
  font-size: var(--text-lg);
  color: var(--c-text-secondary);
  margin: 0 0 24px;
}

.et-feature-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--c-bg-muted);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  text-align: left;
}

.feature-icon {
  font-size: var(--text-2xl);
  flex-shrink: 0;
}

.feature-text {
  font-size: var(--text-sm);
  color: #4b5563;
  line-height: 1.5;
}

/* ==================== 响应式 ==================== */
@media (max-width: 1200px) {
  .panel-sidebar {
    width: 240px;
  }
}

@media (max-width: 768px) {
  .panel-layout {
    flex-direction: column;
  }

  .panel-sidebar {
    width: 100%;
    min-width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid var(--eco-border-light);
  }

  .partition-type-tabs,
  .config-view {
    padding-left: 16px;
    padding-right: 16px;
  }

  .version-bar,
  .category-row,
  .stats-strip,
  .mapping-row,
  .ustar-switch-row {
    align-items: stretch;
    flex-direction: column;
  }

  .stat-strip-divider,
  .divider-vertical {
    width: 100%;
    height: 1px;
  }

  .mapping-select {
    max-width: none;
    width: 100%;
  }
}
</style>
