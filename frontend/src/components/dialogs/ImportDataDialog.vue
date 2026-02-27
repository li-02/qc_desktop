<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { UploadFilled, Plus, Delete, CircleCheck, CircleClose, Loading } from "@element-plus/icons-vue";
import { useCategoryStore } from "@/stores/useCategoryStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type { ImportTaskProgress } from "@shared/types/projectInterface";

// 对话框状态
const dialogVisible = ref(false);
const currentStep = ref(0); // 0: 配置, 1: 文件
const isImporting = ref(false);
const importFinished = ref(false);
const progressItems = ref<ImportTaskProgress[]>([]);

const categoryStore = useCategoryStore();
const datasetStore = useDatasetStore();
const settingsStore = useSettingsStore();
// ── 缺失值配置 ──
const missingTypesList = ref([
  {
    value: "nan",
    label: "nan",
  },
  {
    value: "NAN",
    label: "NAN",
  },
  {
    value: "NaN",
    label: "NaN",
  },
  {
    value: "null",
    label: "null",
  },
  {
    value: "NULL",
    label: "NULL",
  },
  {
    value: "NA",
    label: "NA",
  },
  {
    value: "na",
    label: "na",
  },
  {
    value: "undefined",
    label: "undefined",
  },
  {
    value: "",
    label: "空值",
  },
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

// ── 计算属性 ──
const canClose = computed(() => !isImporting.value);
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

const statusLabel = (status: string): string => {
  const map: Record<string, string> = { pending: "等待中", processing: "处理中...", completed: "完成", failed: "失败" };
  return map[status] || status;
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

// ── 步骤导航 ──
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

// ── IPC 进度监听 ──
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

// ── 批量导入 ──
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
  currentStep.value = 0;
  selectedDataType.value = "flux";
  fileEntries.value = [];
  progressItems.value = [];
  isImporting.value = false;
  importFinished.value = false;
  missingValueTypes.value = missingTypesList.value.map(t => t.value);
};

onUnmounted(() => {
  window.electronAPI.removeListener(API_ROUTES.DATASETS.IMPORT_PROGRESS, progressListener);
});

defineExpose({ open, close });
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="680px"
    class="batch-import-dialog"
    destroy-on-close
    :close-on-click-modal="canClose"
    :close-on-press-escape="canClose"
    :show-close="canClose"
    @closed="handleClosed">
    <template #header>
      <div class="dialog-header">
        <div class="dialog-header-icon">入</div>
        <div class="dialog-header-text">
          <div class="dialog-title">批量导入数据</div>
          <div class="dialog-subtitle">上传多个文件并配置缺失值，一次批量导入</div>
        </div>
      </div>
    </template>

    <el-steps
      v-if="!isImporting && !importFinished"
      class="dialog-steps"
      :active="currentStep"
      finish-status="success"
      align-center>
      <el-step title="文件" />
      <el-step title="缺失值" />
    </el-steps>

    <div class="dialog-content-wrapper">
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
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            </div>
            <div class="upload-text">
              <h3>点击或拖拽文件到此处</h3>
              <p>支持多选，支持 CSV、Excel (xlsx/xls)</p>
            </div>
          </div>
        </el-upload>
        <div v-if="fileEntries.length > 0" class="file-list">
          <div v-for="entry in fileEntries" :key="entry.uid" class="file-row">
            <div class="file-row-info">
              <span class="file-row-filename">{{ entry.file.name }}</span>
              <span class="file-row-size">{{ entry.sizeText }}</span>
            </div>
            <el-input
              v-model="entry.name"
              placeholder="数据集名称"
              size="small"
              class="file-row-name-input"
              :maxlength="50" />
            <el-button circle size="small" class="file-row-remove" @click="removeFileEntry(entry.uid)">
              <el-icon><Delete /></el-icon>
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
            <el-icon style="font-size: 10px; vertical-align: -1px"><Plus /></el-icon>&nbsp;新增
          </span>
        </div>
        <div v-if="isAdding" class="add-option-inline">
          <el-input
            v-model="optionName"
            placeholder="输入新的缺失值标识"
            size="small"
            class="option-input-inline"
            @keyup.enter="onConfirm" />
          <el-button type="primary" size="small" color="#10b981" @click="onConfirm">确认</el-button>
          <el-button size="small" @click="clearInputOption">取消</el-button>
        </div>
      </div>

      <!-- 导入进度 -->
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
            <el-icon class="progress-row-icon">
              <CircleCheck v-if="item.status === 'completed'" />
              <CircleClose v-else-if="item.status === 'failed'" />
              <Loading v-else-if="item.status === 'processing'" class="is-spinning" />
              <span v-else class="pending-dot">·</span>
            </el-icon>
            <span class="progress-row-name">{{ item.datasetName }}</span>
            <span class="progress-row-msg">{{ item.error || statusLabel(item.status) }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button class="btn-secondary" :disabled="!canClose" @click="close">
          {{ importFinished ? "关闭" : "取消" }}
        </el-button>
        <template v-if="!isImporting && !importFinished">
          <el-button class="btn-secondary" :disabled="!canGoPrev" @click="prevStep">上一步</el-button>
          <el-button class="btn-secondary" :disabled="!canGoNext" @click="nextStep">下一步</el-button>
          <el-button type="primary" class="btn-primary" :disabled="!canImport" @click="submitImport"
            >开始导入</el-button
          >
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
  --dlg-accent: #10b981;
  border-radius: 12px !important;
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
  gap: 10px;
  padding: 16px 20px;
}
.dialog-header-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #a7f3d0;
  background: #d1fae5;
  color: #047857;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dialog-title {
  color: #1e293b;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}
.dialog-subtitle {
  margin-top: 2px;
  color: #64748b;
  font-size: 12px;
}

.dialog-steps {
  width: 100%;
  padding: 12px 20px 4px;
  flex-shrink: 0;
}
.dialog-content-wrapper {
  padding: 10px 20px 16px;
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
  color: #059669;
  border-color: #059669;
}
:deep(.el-step__head.is-process .el-step__icon) {
  background: #f0fdf4;
  border: 1px solid #10b981;
  box-shadow: none;
}
:deep(.el-step__title.is-process) {
  color: #047857;
  font-weight: 600;
}
:deep(.el-step__head.is-success) {
  color: #059669;
  border-color: #059669;
}
:deep(.el-step__title.is-success) {
  color: #059669;
  font-weight: 600;
}

.step-container {
  padding: 2px 0;
  width: 100%;
}
.section-label {
  font-size: 12px;
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
  border-radius: 10px;
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
  border-radius: 8px;
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
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 2px 0;
}
.card-desc {
  font-size: 11px;
  color: #64748b;
  margin: 0;
}
.card-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  flex-shrink: 0;
  transition: all 0.2s;
}
.data-type-card.is-active .card-radio {
  border-color: #10b981;
  background: #10b981;
}
.radio-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}

.missing-hint {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 10px 0;
  line-height: 1.5;
}
.missing-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.missing-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  font-family: "Courier New", monospace;
}
.missing-chip:hover {
  border-color: #a7f3d0;
  color: #059669;
  background: #f0fdf4;
}
.missing-chip.is-active {
  background: #d1fae5;
  border-color: #6ee7b7;
  color: #047857;
  font-weight: 600;
}
.missing-chip.is-add {
  border-style: dashed;
  color: #94a3b8;
  font-family: inherit;
}
.missing-chip.is-add:hover {
  border-color: #10b981;
  color: #10b981;
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
  padding: 16px;
  height: auto;
  min-height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  transition: all 0.2s;
}
.multi-upload :deep(.el-upload-dragger:hover) {
  border-color: #86efac;
  background: #f0fdf4;
}
.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.upload-icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  transition: all 0.2s;
}
.multi-upload :deep(.el-upload-dragger:hover) .upload-icon-wrapper {
  background: #d1fae5;
  border-color: #86efac;
}
.multi-upload .el-icon--upload {
  font-size: 18px;
  color: #94a3b8;
  margin: 0;
  transition: color 0.2s;
}
.multi-upload :deep(.el-upload-dragger:hover) .el-icon--upload {
  color: #10b981;
}
.upload-text h3 {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin: 0 0 3px 0;
}
.upload-text p {
  font-size: 11px;
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}
.file-row-info {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 160px;
}
.file-row-filename {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-row-size {
  display: block;
  font-size: 11px;
  color: #94a3b8;
}
.file-row-name-input {
  flex: 1;
}
.file-row-remove {
  flex-shrink: 0;
  color: #94a3b8;
  border-color: #e2e8f0 !important;
}
.file-row-remove:hover {
  color: #ef4444 !important;
  border-color: #fca5a5 !important;
}

.empty-file-hint {
  margin-top: 10px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  padding: 16px;
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
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}
.progress-summary {
  font-size: 12px;
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
  border-radius: 8px;
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
  font-size: 16px;
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
  font-size: 18px;
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
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-row-msg {
  font-size: 11px;
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
  gap: 8px;
}
.dialog-footer .el-button {
  height: 34px;
  min-width: 88px;
  padding: 0 16px;
  border-radius: 8px;
  font-weight: 600;
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
.btn-primary {
  background: #10b981 !important;
  border: 1px solid #10b981 !important;
  color: #fff !important;
}
.btn-primary:hover {
  background: #059669 !important;
  border-color: #059669 !important;
}
.btn-primary.is-disabled {
  background: #9ca3af !important;
  border-color: #9ca3af !important;
}
</style>
