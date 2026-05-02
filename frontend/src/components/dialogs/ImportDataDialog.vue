<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Upload, Plus, Trash2, CheckCircle, XCircle, Loader2, Link, FilePlus } from "lucide-vue-next";
import { useCategoryStore } from "@/stores/useCategoryStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type { ImportTaskProgress } from "@shared/types/projectInterface";
import type { MySQLTableInfo, MySQLTablePreview } from "@shared/types/mysqlInterface";

// 对话框状态
const dialogVisible = ref(false);
const currentStep = ref(0); // 0: 文件, 1: 缺失值
const isImporting = ref(false);
const importFinished = ref(false);
const progressItems = ref<ImportTaskProgress[]>([]);

// ── 导入来源 ──
const importSource = ref<"file" | "mysql" | "datasource">("file");

const categoryStore = useCategoryStore();
const datasetStore = useDatasetStore();
const settingsStore = useSettingsStore();

// ── 缺失值配置 ──
const missingTypesList = ref([
  { value: "nan", label: "nan" },
  { value: "NAN", label: "NAN" },
  { value: "NaN", label: "NaN" },
  { value: "null", label: "null" },
  { value: "NULL", label: "NULL" },
  { value: "NA", label: "NA" },
  { value: "na", label: "na" },
  { value: "undefined", label: "undefined" },
  { value: "-9999", label: "-9999" },
  { value: "", label: "空值" },
]);

// ── 选择数据类型 ──
const selectedDataType = ref("flux");

// ── 选中的缺失值类型 ──
const missingValueTypes = ref(missingTypesList.value.map(t => t.value));
const isAdding = ref(false);
const optionName = ref("");

// ── 文件列表 ──
interface FileEntry {
  uid: string;
  file: File;
  name: string;
  path: string;
  sizeText: string;
}
const fileEntries = ref<FileEntry[]>([]);

// ── MySQL 状态 ──
const dbConfig = ref({ host: "127.0.0.1", port: 3306, user: "", password: "", database: "" });
const dbConnStatus = ref<"idle" | "testing" | "success" | "failed">("idle");
const dbConnMessage = ref("");
const dbTables = ref<MySQLTableInfo[]>([]);
const dbTableSearch = ref("");
const dbSelectedTable = ref("");
const dbPreview = ref<MySQLTablePreview | null>(null);
const dbPreviewLoading = ref(false);
const dbCurrentStep = ref(0); // 0: 连接, 1: 选表, 2: 配置
const dbDatasetName = ref("");
const dbImporting = ref(false);
const dbImportFinished = ref(false);
const dbImportStatus = ref<"connecting" | "fetching" | "processing" | "completed" | "failed" | "">("");
const dbImportMessage = ref("");

// ── 已接入数据源 ──
const dsChannelTreeData = ref([
  {
    id: "ch_miyun_flux",
    label: "密云站 通量 (FTP)",
    children: [
      { id: "ch_miyun_flux.NEE", label: "净生态系统碳交换量 (NEE)" },
      { id: "ch_miyun_flux.Ta", label: "气温 (Ta)" },
      { id: "ch_miyun_flux.VPD", label: "水汽压差 (VPD)" },
      { id: "ch_miyun_flux.Ustar", label: "摩擦风速 (Ustar)" },
      { id: "ch_miyun_flux.LE", label: "潜热通量 (LE)" },
      { id: "ch_miyun_flux.H", label: "感热通量 (H)" },
    ],
  },
  {
    id: "ch_miyun_met",
    label: "密云站 微气象 (TCP/IP)",
    children: [
      { id: "ch_miyun_met.RH", label: "相对湿度 (RH)" },
      { id: "ch_miyun_met.PAR", label: "光合有效辐射 (PAR)" },
      { id: "ch_miyun_met.Ts", label: "土壤温度 (Ts)" },
      { id: "ch_miyun_met.SWC", label: "土壤水分 (SWC)" },
    ],
  },
  {
    id: "ch_labagou_air",
    label: "喇叭沟门站 空气质量 (MQTT)",
    children: [
      { id: "ch_labagou_air.PM25", label: "PM2.5" },
      { id: "ch_labagou_air.O3", label: "臭氧 (O3)" },
      { id: "ch_labagou_air.NO2", label: "二氧化氮 (NO2)" },
    ],
  },
]);

const dsTreeRef = ref<any>(null);
const dsSelectedColumns = ref<any[]>([]);

const handleDsTreeCheck = () => {
  if (dsTreeRef.value) {
    // 过滤出叶子节点（即具体的列）
    dsSelectedColumns.value = dsTreeRef.value.getCheckedNodes(true);
  }
};

const dsTimeRange = ref<[Date, Date] | null>(null);
const dsDatasetName = ref("");
const dsImporting = ref(false);

// ── 文件计算属性 ──
const canClose = computed(() => !isImporting.value && !dbImporting.value);
const canGoPrev = computed(() => currentStep.value > 0 && !isImporting.value);
const canGoNext = computed(
  () =>
    currentStep.value === 0 &&
    !isImporting.value &&
    fileEntries.value.length > 0 &&
    fileEntries.value.every(e => e.name.trim().length > 0)
);
const canImport = computed(() => {
  return (
    currentStep.value === 1 &&
    !isImporting.value &&
    Boolean(categoryStore.currentCategory) &&
    fileEntries.value.length > 0 &&
    fileEntries.value.every(e => e.name.trim().length > 0)
  );
});
const completedCount = computed(() => progressItems.value.filter(p => p.status === "completed").length);
const failedCount = computed(() => progressItems.value.filter(p => p.status === "failed").length);
const isExcelFile = (fileName: string): boolean => /\.(xlsx|xls)$/i.test(fileName);
const hasExcelFile = computed(() => fileEntries.value.some(entry => isExcelFile(entry.file.name)));

// ── MySQL 计算属性 ──
const dbFilteredTables = computed(() => {
  if (!dbTableSearch.value) return dbTables.value;
  return dbTables.value.filter(t => t.name.toLowerCase().includes(dbTableSearch.value.toLowerCase()));
});
const dbCanGoNext = computed(() => {
  if (dbCurrentStep.value === 0) return dbConnStatus.value === "success";
  if (dbCurrentStep.value === 1) return !!dbSelectedTable.value;
  return false;
});
const dbCanImport = computed(
  () =>
    dbCurrentStep.value === 2 &&
    !dbImporting.value &&
    !!categoryStore.currentCategory &&
    !!dbDatasetName.value.trim() &&
    dbConnStatus.value === "success" &&
    !!dbSelectedTable.value
);
const dbCanTestConn = computed(
  () => !!dbConfig.value.host.trim() && !!dbConfig.value.user.trim() && !!dbConfig.value.database.trim()
);

const statusLabel = (status: string): string => {
  const map: Record<string, string> = { pending: "等待中", processing: "处理中...", completed: "完成", failed: "失败" };
  return map[status] || status;
};

// ── 来源切换 ──
const switchSource = (src: "file" | "mysql" | "datasource") => {
  importSource.value = src;
};

// ── 缺失值管理 ──
const onAddOption = () => {
  isAdding.value = true;
};
const onConfirm = async () => {
  if (optionName.value) {
    if (!missingTypesList.value.some(item => item.value === optionName.value)) {
      missingTypesList.value.push({ label: optionName.value, value: optionName.value });
      await settingsStore.addCustomMissingType(optionName.value);
    }
    if (!missingValueTypes.value.includes(optionName.value)) {
      missingValueTypes.value.push(optionName.value);
    }
    clearInputOption();
  }
};
const clearInputOption = () => {
  optionName.value = "";
  isAdding.value = false;
};
const toggleMissingType = (value: string) => {
  const idx = missingValueTypes.value.indexOf(value);
  if (idx >= 0) {
    missingValueTypes.value.splice(idx, 1);
  } else {
    missingValueTypes.value.push(value);
  }
};

// ── 文件步骤导航 ──
const prevStep = () => {
  if (canGoPrev.value) currentStep.value--;
};
const nextStep = () => {
  if (canGoNext.value) currentStep.value++;
};

// ── 文件处理 ──
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const handleFilesAdded = (file: any) => {
  const ext = (file.name as string).split(".").pop()?.toLowerCase();
  if (!["csv", "xlsx", "xls"].includes(ext || "")) {
    ElMessage.error("只支持 CSV、Excel (xlsx/xls) 文件");
    return;
  }
  if (ext === "xlsx" || ext === "xls") {
    ElMessage.warning("当前 Excel 导入仅解析第一个工作表，请将需要导入的数据放在第一个 sheet。");
  }
  // @ts-ignore
  const path = window.electronAPI.getFilePath(file.raw || file);
  fileEntries.value.push({
    uid: `${Date.now()}-${Math.random()}`,
    file: file.raw || file,
    name: (file.name as string).replace(/\.[^/.]+$/, ""),
    path,
    sizeText: formatSize((file.raw?.size ?? file.size ?? 0) as number),
  });
};
const removeFileEntry = (uid: string) => {
  fileEntries.value = fileEntries.value.filter(e => e.uid !== uid);
};

// ── 文件 IPC 进度监听 ──
const progressListener = ((_event: any, progress: ImportTaskProgress) => {
  const idx = progressItems.value.findIndex(p => p.taskIndex === progress.taskIndex && p.batchId === progress.batchId);
  if (idx >= 0) {
    progressItems.value[idx] = { ...progress };
  } else {
    progressItems.value.push({ ...progress });
  }
  const batchItems = progressItems.value.filter(p => p.batchId === progress.batchId);
  if (
    progress.total > 0 &&
    batchItems.length >= progress.total &&
    batchItems.every(p => p.status === "completed" || p.status === "failed")
  ) {
    importFinished.value = true;
    isImporting.value = false;
    categoryStore.loadCategories();
  }
}) as (...args: any[]) => void;

// ── 文件批量导入 ──
const submitImport = async () => {
  if (!canImport.value || !categoryStore.currentCategory) return;
  isImporting.value = true;
  importFinished.value = false;
  progressItems.value = [];
  window.electronAPI.on(API_ROUTES.DATASETS.IMPORT_PROGRESS, progressListener);
  try {
    await datasetStore.batchImportData({
      categoryId: categoryStore.currentCategory.id,
      dataType: selectedDataType.value,
      missingValueTypes: missingValueTypes.value.map(v => String(v)),
      files: fileEntries.value.map(e => ({
        datasetName: e.name.trim(),
        file: { name: e.file.name, size: String(e.file.size), path: e.path },
      })),
    });
  } catch (err: any) {
    ElMessage.error(err.message || "批量导入启动失败");
    isImporting.value = false;
    importFinished.value = false;
    window.electronAPI.removeListener(API_ROUTES.DATASETS.IMPORT_PROGRESS, progressListener);
  }
};

// ── MySQL 方法 ──
const testDbConnection = async () => {
  dbConnStatus.value = "testing";
  dbConnMessage.value = "正在连接...";
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.MYSQL.TEST_CONNECTION, {
      connection: { ...dbConfig.value },
    });
    if (result.success) {
      dbConnStatus.value = "success";
      dbConnMessage.value = `连接成功 (${result.data?.serverVersion || "MySQL"})`;
    } else {
      dbConnStatus.value = "failed";
      dbConnMessage.value = result.error || "连接失败";
    }
  } catch (err: any) {
    dbConnStatus.value = "failed";
    dbConnMessage.value = err.message || "连接失败";
  }
};

const loadDbTables = async () => {
  const result = await window.electronAPI.invoke(API_ROUTES.MYSQL.GET_TABLES, {
    connection: { ...dbConfig.value },
  });
  if (result.success) {
    dbTables.value = result.data?.tables || [];
  } else {
    ElMessage.error(result.error || "获取表列表失败");
  }
};

const selectDbTable = async (tableName: string) => {
  dbSelectedTable.value = tableName;
  dbPreview.value = null;
  dbPreviewLoading.value = true;
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.MYSQL.GET_TABLE_PREVIEW, {
      connection: { ...dbConfig.value },
      table: tableName,
      limit: 20,
    });
    if (result.success) {
      dbPreview.value = result.data;
    } else {
      ElMessage.error(result.error || "获取预览失败");
    }
  } finally {
    dbPreviewLoading.value = false;
  }
};

const goDbNext = async () => {
  if (dbCurrentStep.value === 0 && dbCanGoNext.value) {
    await loadDbTables();
    dbCurrentStep.value = 1;
  } else if (dbCurrentStep.value === 1 && dbCanGoNext.value) {
    dbCurrentStep.value = 2;
  }
};

const goDbPrev = () => {
  if (dbCurrentStep.value > 0) dbCurrentStep.value--;
};

// ── MySQL IPC 进度监听 ──
const dbProgressListener = ((_event: any, progress: any) => {
  dbImportStatus.value = progress.status;
  dbImportMessage.value = progress.message || "";
  if (progress.status === "completed") {
    dbImportFinished.value = true;
    dbImporting.value = false;
    categoryStore.loadCategories();
  } else if (progress.status === "failed") {
    dbImportFinished.value = true;
    dbImporting.value = false;
  }
}) as (...args: any[]) => void;

// ── MySQL 导入 ──
const submitMysqlImport = async () => {
  if (!dbCanImport.value || !categoryStore.currentCategory) return;
  dbImporting.value = true;
  dbImportFinished.value = false;
  dbImportStatus.value = "";
  dbImportMessage.value = "";
  window.electronAPI.on(API_ROUTES.MYSQL.IMPORT_PROGRESS, dbProgressListener);
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.MYSQL.IMPORT, {
      categoryId: categoryStore.currentCategory.id,
      datasetName: dbDatasetName.value.trim(),
      dataType: selectedDataType.value,
      connection: { ...dbConfig.value },
      table: dbSelectedTable.value,
      missingValueTypes: missingValueTypes.value.map(v => String(v)),
    });
    if (!result.success) {
      throw new Error(result.error || "MySQL 导入失败");
    }
  } catch (err: any) {
    ElMessage.error(err.message || "MySQL 导入失败");
    dbImporting.value = false;
    dbImportFinished.value = false;
    window.electronAPI.removeListener(API_ROUTES.MYSQL.IMPORT_PROGRESS, dbProgressListener);
  }
};

// ── 对话框控制 ──
const open = async () => {
  dialogVisible.value = true;
  const customTypes = await settingsStore.getCustomMissingTypes();
  if (customTypes?.length) {
    customTypes.forEach((type: string) => {
      if (!missingTypesList.value.some(i => i.value === type)) {
        missingTypesList.value.push({ label: type, value: type });
      }
      if (!missingValueTypes.value.includes(type)) {
        missingValueTypes.value.push(type);
      }
    });
  }
};
const close = () => {
  if (!canClose.value) return;
  dialogVisible.value = false;
};
const handleClosed = () => {
  window.electronAPI.removeListener(API_ROUTES.DATASETS.IMPORT_PROGRESS, progressListener);
  window.electronAPI.removeListener(API_ROUTES.MYSQL.IMPORT_PROGRESS, dbProgressListener);
  // 文件来源重置
  currentStep.value = 0;
  selectedDataType.value = "flux";
  fileEntries.value = [];
  progressItems.value = [];
  isImporting.value = false;
  importFinished.value = false;
  missingValueTypes.value = missingTypesList.value.map(t => t.value);
  // MySQL 来源重置
  importSource.value = "file";
  dbConfig.value = { host: "127.0.0.1", port: 3306, user: "", password: "", database: "" };
  dbConnStatus.value = "idle";
  dbConnMessage.value = "";
  dbTables.value = [];
  dbTableSearch.value = "";
  dbSelectedTable.value = "";
  dbPreview.value = null;
  dbPreviewLoading.value = false;
  dbCurrentStep.value = 0;
  dbDatasetName.value = "";
  dbImporting.value = false;
  dbImportFinished.value = false;
  dbImportStatus.value = "";
  dbImportMessage.value = "";
};

onUnmounted(() => {
  window.electronAPI.removeListener(API_ROUTES.DATASETS.IMPORT_PROGRESS, progressListener);
  window.electronAPI.removeListener(API_ROUTES.MYSQL.IMPORT_PROGRESS, dbProgressListener);
});

defineExpose({ open, close });
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :width="importSource === 'mysql' && !dbImporting && !dbImportFinished && dbCurrentStep === 1 ? '860px' : '680px'"
    class="batch-import-dialog"
    destroy-on-close
    :close-on-click-modal="canClose"
    :close-on-press-escape="canClose"
    :show-close="canClose"
    @closed="handleClosed">
    <template #header>
      <div class="dialog-header">
        <div class="dialog-header-icon">
          <FilePlus :size="16" />
        </div>
        <div class="dialog-header-text">
          <div class="dialog-title">数据导入终端</div>
          <div class="dialog-subtitle">
            {{
              importSource === "mysql"
                ? "从关系型数据库直连拉取监测数据"
                : importSource === "file"
                  ? "上传结构化报表并配置异常标识"
                  : "从接入缓存池自动抽取数据片段"
            }}
          </div>
        </div>
      </div>
    </template>

    <!-- ── 来源选择 tabs ── -->
    <div v-if="!isImporting && !importFinished && !dbImporting && !dbImportFinished" class="source-tabs">
      <button class="source-tab" :class="{ 'is-active': importSource === 'file' }" @click="switchSource('file')">
        <span class="source-tab-icon">📁</span>
        本地文件
      </button>
      <button class="source-tab" :class="{ 'is-active': importSource === 'mysql' }" @click="switchSource('mysql')">
        <span class="source-tab-icon">🗄</span>
        MySQL 数据库
      </button>
      <button
        class="source-tab"
        :class="{ 'is-active': importSource === 'datasource' }"
        @click="switchSource('datasource')">
        <span class="source-tab-icon">📡</span>
        已接入数据源
      </button>
    </div>

    <!-- ── 文件导入：步骤指示 ── -->
    <el-steps
      v-if="importSource === 'file' && !isImporting && !importFinished"
      class="dialog-steps"
      :active="currentStep"
      finish-status="success"
      align-center>
      <el-step title="文件" />
      <el-step title="缺失值" />
    </el-steps>

    <!-- ── MySQL 导入：步骤指示 ── -->
    <el-steps
      v-if="importSource === 'mysql' && !dbImporting && !dbImportFinished"
      class="dialog-steps"
      :active="dbCurrentStep"
      finish-status="success"
      align-center>
      <el-step title="连接" />
      <el-step title="选表" />
      <el-step title="配置" />
    </el-steps>

    <div class="dialog-content-wrapper">
      <!-- ════════════════════════════════════════
           文件导入视图
           ════════════════════════════════════════ -->
      <template v-if="importSource === 'file'">
        <!-- Step 0: 多文件上传 -->
        <div v-if="!isImporting && !importFinished && currentStep === 0" class="step-container fade-in">
          <el-upload
            class="multi-upload"
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            multiple
            :on-change="handleFilesAdded"
            drag>
            <div class="upload-content">
              <div class="upload-icon-wrapper">
                <Upload :size="24" />
              </div>
              <div class="upload-text">
                <h3>点击或拖拽结构化数据表至此处</h3>
                <p>支持多选，兼容标准 CSV 及 Excel (xlsx/xls) 格式</p>
              </div>
            </div>
          </el-upload>
          <div v-if="hasExcelFile" class="excel-sheet-notice">
            当前 Excel 导入仅解析第一个工作表，请确认需要导入的数据位于第一个 sheet。
          </div>
          <div v-if="fileEntries.length > 0" class="file-list">
            <div v-for="entry in fileEntries" :key="entry.uid" class="file-row">
              <div class="file-row-info">
                <span class="file-row-filename">{{ entry.file.name }}</span>
                <span class="file-row-size">{{ entry.sizeText }}</span>
              </div>
              <el-input
                v-model="entry.name"
                placeholder="数据集名称"
                size="large"
                class="file-row-name-input"
                :maxlength="50" />
              <el-button circle size="large" class="file-row-remove" @click="removeFileEntry(entry.uid)">
                <Trash2 :size="16" />
              </el-button>
            </div>
          </div>
          <div v-else class="empty-file-hint">尚未添加文件，请拖拽或点击上传</div>
        </div>

        <!-- Step 1: 缺失值配置 -->
        <div v-if="!isImporting && !importFinished && currentStep === 1" class="step-container fade-in">
          <div class="section-label">缺失值标识</div>
          <p class="missing-hint">点击标签切换选中状态，选中的标识将在导入时被识别为缺失值</p>
          <div class="missing-chips">
            <span
              v-for="item in missingTypesList"
              :key="item.value"
              class="missing-chip"
              :class="{ 'is-active': missingValueTypes.includes(item.value) }"
              @click="toggleMissingType(item.value)">
              {{ item.label || "空值" }}
            </span>
            <span v-if="!isAdding" class="missing-chip is-add" @click="onAddOption">
              <Plus :size="10" style="vertical-align: -1px" />&nbsp;新增
            </span>
          </div>
          <div v-if="isAdding" class="add-option-inline">
            <el-input
              v-model="optionName"
              placeholder="输入新的缺失值标识"
              size="large"
              class="option-input-inline"
              @keyup.enter="onConfirm" />
            <el-button type="primary" size="large" @click="onConfirm">确认</el-button>
            <el-button size="large" @click="clearInputOption">取消</el-button>
          </div>
        </div>

        <!-- 文件导入进度 -->
        <div v-if="isImporting || importFinished" class="progress-container fade-in">
          <div class="progress-header">
            <span class="progress-title">导入进度</span>
            <span class="progress-summary">
              <span class="progress-done">{{ completedCount }} 成功</span>
              <span v-if="failedCount > 0" class="progress-fail"> · {{ failedCount }} 失败</span>
              <span class="progress-total"> / {{ fileEntries.length }} 个文件</span>
            </span>
          </div>
          <div class="progress-list">
            <div
              v-for="(item, idx) in progressItems.length
                ? progressItems
                : fileEntries.map((e, i) => ({
                    taskIndex: i,
                    batchId: '',
                    datasetName: e.name,
                    status: 'pending' as const,
                    error: undefined,
                    total: fileEntries.length,
                  }))"
              :key="idx"
              class="progress-row"
              :class="`is-${item.status}`">
              <span class="progress-row-icon">
                <CheckCircle v-if="item.status === 'completed'" :size="16" />
                <XCircle v-else-if="item.status === 'failed'" :size="16" />
                <Loader2 v-else-if="item.status === 'processing'" :size="16" class="is-spinning" />
                <span v-else class="pending-dot">·</span>
              </span>
              <span class="progress-row-name">{{ item.datasetName }}</span>
              <span class="progress-row-msg">{{ item.error || statusLabel(item.status) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ================= 3. 已接入数据源 ================= -->
      <div v-else-if="importSource === 'datasource'" class="datasource-import-container fade-in">
        <div class="db-setup-step">
          <div class="db-step-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px">
            <div
              class="db-step-icon"
              style="
                width: 32px;
                height: 32px;
                border-radius: var(--radius-panel);
                background: #ecfdf5;
                color: var(--c-brand);
                display: flex;
                align-items: center;
                justify-content: center;
              ">
              <Link :size="18" />
            </div>
            <div class="db-step-title" style="font-size: var(--text-lg); font-weight: 600; color: #1e293b">
              从接入缓存池抽取数据片段
            </div>
          </div>
          <div
            class="db-form-container"
            style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: var(--radius-panel);
              padding: 20px;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
            ">
            <el-form label-position="top" size="large" class="custom-large-form">
              <el-form-item label="跨通道按需抽取指标">
                <div
                  style="
                    border: 1px solid #dcdfe6;
                    border-radius: var(--radius-sm);
                    padding: 10px;
                    width: 100%;
                    max-height: 200px;
                    overflow-y: auto;
                    background-color: #fafafa;
                  ">
                  <el-tree
                    ref="dsTreeRef"
                    :data="dsChannelTreeData"
                    show-checkbox
                    node-key="id"
                    default-expand-all
                    @check="handleDsTreeCheck"
                    style="background: transparent" />
                </div>
                <div style="font-size: var(--text-sm); color: #909399; margin-top: 4px">
                  已选中 {{ dsSelectedColumns.length }} 个指标，系统将按时间戳对齐合并
                </div>
              </el-form-item>
              <el-form-item label="抽取时间范围">
                <el-date-picker
                  v-model="dsTimeRange"
                  type="datetimerange"
                  range-separator="至"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  style="width: 100%" />
              </el-form-item>
              <el-form-item label="新数据集名称">
                <el-input v-model="dsDatasetName" placeholder="例如：密云站2026年3月异常降水事件截取" />
              </el-form-item>
            </el-form>
          </div>
          <div style="text-align: right; margin-top: 20px">
            <el-button
              type="primary"
              size="large"
              :loading="dsImporting"
              :disabled="dsSelectedColumns.length === 0 || !dsTimeRange || !dsDatasetName">
              开始抽取并生成数据集
            </el-button>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════
           MySQL 导入视图
           ════════════════════════════════════════ -->
      <template v-if="importSource === 'mysql'">
        <!-- DB Step 0: 连接配置 -->
        <div v-if="!dbImporting && !dbImportFinished && dbCurrentStep === 0" class="step-container fade-in">
          <div class="section-label" style="margin-bottom: 14px">数据库连接配置</div>
          <div class="db-form-grid">
            <div class="db-form-group db-form-span-3">
              <label class="db-form-label">主机地址</label>
              <el-input v-model="dbConfig.host" placeholder="127.0.0.1 或远程地址" size="large" />
            </div>
            <div class="db-form-group db-form-span-1">
              <label class="db-form-label">端口</label>
              <el-input-number
                v-model="dbConfig.port"
                :min="1"
                :max="65535"
                :controls="false"
                size="large"
                style="width: 100%" />
            </div>
            <div class="db-form-group db-form-span-2">
              <label class="db-form-label">用户名</label>
              <el-input v-model="dbConfig.user" placeholder="root" size="large" />
            </div>
            <div class="db-form-group db-form-span-2">
              <label class="db-form-label">密码</label>
              <el-input
                v-model="dbConfig.password"
                type="password"
                placeholder="（可为空）"
                size="large"
                show-password />
            </div>
            <div class="db-form-group db-form-span-4">
              <label class="db-form-label">数据库名</label>
              <el-input v-model="dbConfig.database" placeholder="请输入要连接的数据库名称" size="large" />
            </div>
          </div>
          <div class="db-conn-footer">
            <el-button
              size="large"
              class="btn-secondary"
              :loading="dbConnStatus === 'testing'"
              :disabled="!dbCanTestConn"
              @click="testDbConnection">
              测试连接
            </el-button>
            <span v-if="dbConnStatus !== 'idle'" class="db-conn-msg" :class="`is-${dbConnStatus}`">
              <span v-if="dbConnStatus === 'success'">✓</span>
              <span v-else-if="dbConnStatus === 'failed'">✗</span>
              {{ dbConnMessage }}
            </span>
          </div>
        </div>

        <!-- DB Step 1: 选择数据表 -->
        <div
          v-if="!dbImporting && !dbImportFinished && dbCurrentStep === 1"
          class="step-container fade-in db-step1-layout">
          <!-- 左侧：表列表 -->
          <div class="db-table-panel">
            <div class="section-label" style="margin-bottom: 8px">数据表 / 视图</div>
            <el-input
              v-model="dbTableSearch"
              placeholder="搜索表名..."
              size="large"
              clearable
              style="margin-bottom: 8px" />
            <div class="db-table-list">
              <div
                v-for="table in dbFilteredTables"
                :key="table.name"
                class="db-table-item"
                :class="{ 'is-active': dbSelectedTable === table.name }"
                @click="selectDbTable(table.name)">
                <span class="db-table-badge" :class="table.type === 'VIEW' ? 'is-view' : 'is-table'">
                  {{ table.type === "VIEW" ? "V" : "T" }}
                </span>
                <span class="db-table-name">{{ table.name }}</span>
              </div>
              <div v-if="dbFilteredTables.length === 0" class="db-table-empty">
                {{ dbTableSearch ? "无匹配表" : "暂无数据表" }}
              </div>
            </div>
          </div>
          <!-- 右侧：数据预览 -->
          <div class="db-preview-panel">
            <div class="section-label" style="margin-bottom: 8px">数据预览</div>
            <div v-if="!dbSelectedTable" class="db-preview-placeholder">请在左侧选择数据表</div>
            <div v-else-if="dbPreviewLoading" class="db-preview-placeholder">加载预览中...</div>
            <template v-else-if="dbPreview">
              <div class="db-preview-meta">
                共 <strong>{{ dbPreview.totalCount.toLocaleString() }}</strong> 行 ·
                <strong>{{ dbPreview.columns.length }}</strong> 列（预览前 20 行）
              </div>
              <div class="db-preview-table-wrap">
                <table class="db-preview-table">
                  <thead>
                    <tr>
                      <th v-for="col in dbPreview.columns" :key="col">{{ col }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, ri) in dbPreview.rows" :key="ri">
                      <td v-for="(cell, ci) in row" :key="ci">{{ cell ?? "" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>

        <!-- DB Step 2: 数据集配置 -->
        <div v-if="!dbImporting && !dbImportFinished && dbCurrentStep === 2" class="step-container fade-in">
          <div class="db-config-info">
            <span class="db-config-info-label">数据来源</span>
            <span class="db-config-info-value">{{ dbConfig.database }} / {{ dbSelectedTable }}</span>
          </div>
          <div class="db-form-group" style="margin-bottom: 16px">
            <label class="db-form-label section-label">数据集名称</label>
            <el-input
              v-model="dbDatasetName"
              placeholder="输入数据集名称"
              size="large"
              :maxlength="50"
              show-word-limit />
          </div>
          <div class="section-label">缺失值标识</div>
          <p class="missing-hint">点击标签切换选中状态，选中的标识将在导入时被识别为缺失值</p>
          <div class="missing-chips">
            <span
              v-for="item in missingTypesList"
              :key="item.value"
              class="missing-chip"
              :class="{ 'is-active': missingValueTypes.includes(item.value) }"
              @click="toggleMissingType(item.value)">
              {{ item.label || "空值" }}
            </span>
            <span v-if="!isAdding" class="missing-chip is-add" @click="onAddOption">
              <Plus :size="10" style="vertical-align: -1px" />&nbsp;新增
            </span>
          </div>
          <div v-if="isAdding" class="add-option-inline">
            <el-input
              v-model="optionName"
              placeholder="输入新的缺失值标识"
              size="large"
              class="option-input-inline"
              @keyup.enter="onConfirm" />
            <el-button type="primary" size="large" @click="onConfirm">确认</el-button>
            <el-button size="large" @click="clearInputOption">取消</el-button>
          </div>
        </div>

        <!-- MySQL 导入进度 -->
        <div v-if="dbImporting || dbImportFinished" class="progress-container fade-in">
          <div class="progress-header">
            <span class="progress-title">导入进度</span>
          </div>
          <div class="progress-list">
            <div
              class="progress-row"
              :class="`is-${dbImportStatus === 'completed' ? 'completed' : dbImportStatus === 'failed' ? 'failed' : 'processing'}`">
              <span class="progress-row-icon">
                <CheckCircle v-if="dbImportStatus === 'completed'" :size="16" />
                <XCircle v-else-if="dbImportStatus === 'failed'" :size="16" />
                <Loader2 v-else :size="16" class="is-spinning" />
              </span>
              <span class="progress-row-name">{{ dbDatasetName }}</span>
              <span class="progress-row-msg">{{ dbImportMessage || "连接中..." }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <!-- 关闭 / 取消按钮 -->
        <el-button class="btn-secondary" size="large" :disabled="!canClose" @click="close">
          {{ importFinished || dbImportFinished ? "关闭" : "取消" }}
        </el-button>

        <!-- 文件导入导航按钮 -->
        <template v-if="importSource === 'file' && !isImporting && !importFinished">
          <el-button class="btn-secondary" size="large" :disabled="!canGoPrev" @click="prevStep">上一步</el-button>
          <el-button class="btn-secondary" size="large" :disabled="!canGoNext" @click="nextStep">下一步</el-button>
          <el-button type="primary" class="btn-primary" size="large" :disabled="!canImport" @click="submitImport">
            开始导入
          </el-button>
        </template>

        <!-- MySQL 导入导航按钮 -->
        <template v-if="importSource === 'mysql' && !dbImporting && !dbImportFinished">
          <el-button v-if="dbCurrentStep > 0" class="btn-secondary" size="large" @click="goDbPrev">上一步</el-button>
          <el-button
            v-if="dbCurrentStep < 2"
            class="btn-secondary"
            size="large"
            :disabled="!dbCanGoNext"
            @click="goDbNext">
            下一步
          </el-button>
          <el-button
            v-if="dbCurrentStep === 2"
            type="primary"
            class="btn-primary"
            size="large"
            :disabled="!dbCanImport"
            @click="submitMysqlImport">
            开始导入
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<style>
.batch-import-dialog.el-dialog {
  --dlg-surface: #f8fafc;
  --dlg-surface-elevated: #ffffff;
  --dlg-border: #e2e8f0;
  --dlg-text: #1e293b;
  --dlg-muted: #64748b;
  --dlg-accent: var(--c-brand);
  border-radius: var(--radius-overlay) !important;
  border: 1px solid var(--dlg-border);
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  background: var(--dlg-surface-elevated);
  display: flex !important;
  flex-direction: column !important;
  height: auto !important;
  max-height: 85vh !important;
  margin-top: 5vh !important;
  --el-dialog-padding-primary: 0;
}

.batch-import-dialog .el-dialog__header {
  margin: 0;
  padding: 0;
  border-bottom: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
  flex-shrink: 0;
  margin-right: 0;
}
.batch-import-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}
.batch-import-dialog .el-dialog__body {
  padding: 0 !important;
  overflow-y: auto !important;
}
.batch-import-dialog .el-dialog__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
  flex-shrink: 0;
}
</style>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
}
.dialog-header-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-panel);
  border: 1px solid #6ee7b7;
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #047857;
  font-size: var(--text-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.1);
}
.dialog-title {
  color: #1e293b;
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.3;
}
.dialog-subtitle {
  margin-top: 2px;
  color: #64748b;
  font-size: var(--text-sm);
}

.dialog-steps {
  width: 100%;
  padding: 16px 24px 8px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}
.dialog-content-wrapper {
  padding: 16px 24px 20px;
  background: #ffffff;
}

.fade-in {
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

:deep(.el-step__head.is-process) {
  color: var(--c-brand-hover);
  border-color: var(--c-brand-hover);
}
:deep(.el-step__head.is-process .el-step__icon) {
  background: #ecfdf5;
  border: 2px solid var(--c-brand);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}
:deep(.el-step__title.is-process) {
  color: #047857;
  font-weight: 600;
}
:deep(.el-step__head.is-success) {
  color: var(--c-brand-hover);
  border-color: var(--c-brand-hover);
}
:deep(.el-step__title.is-success) {
  color: var(--c-brand-hover);
  font-weight: 600;
}

.step-container {
  padding: 2px 0;
  width: 100%;
}
.section-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.data-type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 4px;
}
@media (max-width: 640px) {
  .data-type-grid {
    grid-template-columns: 1fr;
  }
}
.data-type-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-panel);
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 72px;
}
.data-type-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
}
.data-type-card.is-active {
  background: #f8fffb;
  border-color: #86efac;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.1);
}
.card-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-panel);
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  color: #64748b;
  transition: all 0.2s;
}
.data-type-card:hover .card-icon {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #059669;
}
.data-type-card.is-active .card-icon {
  background: #d1fae5;
  border-color: #86efac;
  color: #047857;
}
.card-content {
  flex: 1;
  min-width: 0;
}
.card-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 2px 0;
}
.card-desc {
  font-size: var(--text-xs);
  color: #64748b;
  margin: 0;
}
.card-radio {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  border: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  flex-shrink: 0;
  transition: all 0.2s;
}
.data-type-card.is-active .card-radio {
  border-color: var(--c-brand);
  background: var(--c-brand);
}
.radio-inner {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: #fff;
}

.missing-hint {
  font-size: var(--text-sm);
  color: #94a3b8;
  margin: 0 0 10px 0;
  line-height: 1.5;
}
.missing-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: var(--radius-panel);
}
.missing-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  border: 1px solid #e2e8f0;
  background: #ffffff;
  font-size: var(--text-base);
  color: #64748b;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: var(--font-mono);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}
.missing-chip:hover {
  border-color: #6ee7b7;
  color: #059669;
  background: #f0fdf4;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.1);
}
.missing-chip.is-active {
  background: linear-gradient(135deg, var(--c-brand) 0%, var(--c-brand-hover) 100%);
  border-color: transparent;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 3px 6px rgba(16, 185, 129, 0.2);
}
.missing-chip.is-add {
  border-style: dashed;
  color: #94a3b8;
  font-family: inherit;
}
.missing-chip.is-add:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
  background: #f0fdf4;
  border-style: solid;
}
.add-option-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.option-input-inline {
  flex: 1;
}

/* ── 文件列表 ── */
.multi-upload :deep(.el-upload-dragger) {
  padding: 24px 16px;
  height: auto;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #cbd5e1;
  border-radius: var(--radius-panel);
  background: #f8fafc;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.multi-upload :deep(.el-upload-dragger:hover) {
  border-color: #34d399; /* soft green */
  background: #f0fdf4;
  box-shadow: inset 0 0 0 1px #ecfdf5; /* inner glow */
}
.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.upload-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-panel);
  background: #ffffff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: all 0.3s;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
}
.multi-upload :deep(.el-upload-dragger:hover) .upload-icon-wrapper {
  background: #d1fae5;
  border-color: #6ee7b7;
  transform: translateY(-2px);
  box-shadow: 0 6px 8px -2px rgba(16, 185, 129, 0.1);
}
.multi-upload .el-icon--upload {
  font-size: var(--text-3xl);
  color: #94a3b8;
  margin: 0;
  transition: color 0.3s;
}
.multi-upload :deep(.el-upload-dragger:hover) .el-icon--upload {
  color: #059669; /* deeper green */
}
.upload-text h3 {
  font-size: var(--text-md);
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 6px 0;
}
.upload-text p {
  font-size: var(--text-sm);
  color: #64748b;
  margin: 0;
}

.file-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 2px;
}
.file-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 52px;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 8px 12px;
  border-radius: var(--radius-panel);
  border: 1px solid #e2e8f0;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}
.file-row:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}
.file-row-info {
  width: 180px;
  height: 56px;
  min-width: 0;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.file-row-filename {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-row-size {
  display: block;
  font-size: var(--text-xs);
  color: #94a3b8;
  line-height: 1.4;
}
.file-row-name-input {
  width: 100%;
}
.file-row-name-input :deep(.el-input__wrapper) {
  min-height: 56px;
  box-sizing: border-box;
}
.file-row-name-input :deep(.el-input__inner) {
  height: 56px;
  line-height: 56px;
}
.file-row-remove {
  width: 44px;
  height: 44px;
  color: #94a3b8;
  border-color: #e2e8f0 !important;
}
.file-row-remove:hover {
  color: #ef4444 !important;
  border-color: #fca5a5 !important;
}

@media (max-width: 640px) {
  .file-row {
    grid-template-columns: minmax(0, 1fr) 44px;
  }

  .file-row-info,
  .file-row-name-input {
    grid-column: 1 / -1;
    width: 100%;
  }

  .file-row-remove {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }
}

.empty-file-hint {
  margin-top: 10px;
  text-align: center;
  color: #94a3b8;
  font-size: var(--text-base);
  padding: 16px;
}
.excel-sheet-notice {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-panel);
  background: #f0fdf4;
  color: #047857;
  font-size: var(--text-sm);
  line-height: 1.5;
}

/* ── 进度视图 ── */
.progress-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.progress-title {
  font-size: var(--text-md);
  font-weight: 600;
  color: #1e293b;
}
.progress-summary {
  font-size: var(--text-sm);
  color: #64748b;
}
.progress-done {
  color: #059669;
  font-weight: 600;
}
.progress-fail {
  color: #ef4444;
  font-weight: 600;
}
.progress-total {
  color: #94a3b8;
}

.progress-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
}
.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-panel);
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  transition: all 0.2s;
}
.progress-row.is-completed {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.progress-row.is-failed {
  border-color: #fecaca;
  background: #fff7f7;
}
.progress-row.is-processing {
  border-color: #bfdbfe;
  background: #f0f9ff;
}
.progress-row-icon {
  font-size: var(--text-xl);
  flex-shrink: 0;
}
.is-completed .progress-row-icon {
  color: #059669;
}
.is-failed .progress-row-icon {
  color: #ef4444;
}
.is-processing .progress-row-icon {
  color: #3b82f6;
}
.pending-dot {
  color: #94a3b8;
  font-size: var(--text-2xl);
  line-height: 1;
}
.is-spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.progress-row-name {
  flex: 1;
  font-size: var(--text-base);
  font-weight: 500;
  color: #334155;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-row-msg {
  font-size: var(--text-xs);
  color: #64748b;
  flex-shrink: 0;
}
.is-completed .progress-row-msg {
  color: #059669;
}
.is-failed .progress-row-msg {
  color: #ef4444;
}

/* ── 底部按钮 ── */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.dialog-footer .el-button {
  height: 40px;
  min-width: 110px;
  padding: 0 20px;
  border-radius: var(--radius-control);
  font-weight: 600;
  transition: all 0.2s;
  font-size: var(--text-md);
}
.btn-secondary {
  border: 1px solid #cbd5e1 !important;
  background: #fff !important;
  color: #334155 !important;
}
.btn-secondary:hover {
  border-color: #a7f3d0 !important;
  color: #059669 !important;
  background: #ecfdf5 !important;
}
.btn-secondary.is-disabled,
.btn-secondary.is-disabled:hover {
  border-color: #e2e8f0 !important;
  color: #cbd5e1 !important;
  background: #f8fafc !important;
  cursor: not-allowed !important;
}
.btn-primary {
  background: var(--c-brand) !important;
  border: 1px solid var(--c-brand) !important;
  color: #fff !important;
}
.btn-primary:hover {
  background: var(--c-brand-hover) !important;
  border-color: var(--c-brand-hover) !important;
}
.btn-primary.is-disabled {
  background: #9ca3af !important;
  border-color: #9ca3af !important;
}

/* ── 来源选择 tabs ── */
.source-tabs {
  display: flex;
  gap: 6px;
  padding: 6px;
  background: #f1f5f9; /* Soft background */
  border-radius: var(--radius-panel);
  margin: 10px 20px;
}
.source-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  background: transparent;
  font-size: var(--text-base);
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: var(--radius-panel);
  outline: none;
}
.source-tab:hover {
  color: #1e293b;
  background: rgba(255, 255, 255, 0.4);
}
.source-tab.is-active {
  background: #ffffff;
  color: #047857; /* Deep ecological green */
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}
.source-tab-icon {
  font-size: var(--text-lg);
}

/* ── MySQL 连接表单 ── */
.db-form-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 14px;
  margin-bottom: 14px;
}
.db-form-span-1 {
  grid-column: span 1;
}
.db-form-span-2 {
  grid-column: span 2;
}
.db-form-span-3 {
  grid-column: span 3;
}
.db-form-span-4 {
  grid-column: span 4;
}
.db-form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.db-form-label {
  font-size: var(--text-base);
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.03em;
  margin-bottom: 4px;
}
.db-conn-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
  margin-top: 8px;
  border-top: 1px dashed #e2e8f0;
}
.db-conn-msg {
  font-size: var(--text-sm);
  font-weight: 500;
}
.db-conn-msg.is-testing {
  color: #f59e0b;
}
.db-conn-msg.is-success {
  color: #059669;
}
.db-conn-msg.is-failed {
  color: #ef4444;
}

/* ── MySQL 选表步骤 ── */
.db-step1-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  min-height: 380px;
}
.db-table-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.db-table-list {
  flex: 1;
  overflow-y: auto;
  max-height: 290px;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-panel);
  background: #f8fafc;
}
.db-table-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: all 0.2s;
}
.db-table-item:last-child {
  border-bottom: none;
}
.db-table-item:hover {
  background: #f0fdf4;
  padding-left: 16px;
}
.db-table-item.is-active {
  background: #ecfdf5;
  border-left: 3px solid var(--c-brand);
  padding-left: 14px;
}
.db-table-badge {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.db-table-badge.is-table {
  background: #dbeafe;
  color: #1d4ed8;
}
.db-table-badge.is-view {
  background: #ede9fe;
  color: #7c3aed;
}
.db-table-name {
  font-size: var(--text-sm);
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.db-table-empty {
  padding: 20px;
  text-align: center;
  font-size: var(--text-sm);
  color: #94a3b8;
}
.db-preview-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.db-preview-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #e2e8f0;
  border-radius: var(--radius-panel);
  font-size: var(--text-base);
  color: #94a3b8;
  min-height: 200px;
}
.db-preview-meta {
  font-size: var(--text-sm);
  color: #64748b;
  margin-bottom: 8px;
}
.db-preview-table-wrap {
  flex: 1;
  overflow: auto;
  max-height: 270px;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-panel);
}
.db-preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}
.db-preview-table th {
  position: sticky;
  top: 0;
  background: #f1f5f9;
  padding: 6px 10px;
  text-align: left;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}
.db-preview-table td {
  padding: 5px 10px;
  color: #334155;
  border-bottom: 1px solid #f1f5f9;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.db-preview-table tr:last-child td {
  border-bottom: none;
}
.db-preview-table tr:hover td {
  background: #f8fafc;
}

/* ── MySQL 配置步骤 ── */
.db-config-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-panel);
  margin-bottom: 16px;
}
.db-config-info-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: #059669;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.db-config-info-value {
  font-size: var(--text-sm);
  color: #047857;
  font-family: var(--font-mono);
}

/* ── 剪贴板粘贴 ── */
.clipboard-textarea :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.5;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}
.clipboard-textarea :deep(.el-textarea__inner:focus) {
  border-color: var(--c-brand);
  border-style: solid;
}
.clipboard-options {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 12px;
}
.custom-large-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
  padding-bottom: 8px;
}
.custom-large-form :deep(.el-input__wrapper),
.custom-large-form :deep(.el-select__wrapper) {
  height: 40px;
}
</style>
