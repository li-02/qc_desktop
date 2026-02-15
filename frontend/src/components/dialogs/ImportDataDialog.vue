<script setup lang="ts">
import { computed, ref } from "vue";
// 第三步 上传文件
import type { UploadInstance } from "element-plus";
import { ElMessage } from "element-plus";
import {
  UploadFilled,
  TrendCharts,
  Odometer,
  Sunny,
  Pouring,
  Lightning,
  Document,
  Plus,
  Setting,
  Refresh,
} from "@element-plus/icons-vue";
// import type {ElectronWindow} from "@shared/types/window";
import type { TableColumns } from "@pureadmin/table";
import PureTable from "@pureadmin/table";
import { useProjectStore } from "@/stores/useProjectStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";

// 对话框状态
const dialogVisible = ref(false);
const loading = ref(false);
const currentStep = ref(0);
const stepForm = ref([
  {
    title: "选择数据类型",
  },
  {
    title: "上传文件",
  },
  {
    title: "配置参数",
  },
]);
const projectStore = useProjectStore();
const datasetStore = useDatasetStore();
const settingsStore = useSettingsStore();
// 第四步 确定缺失值类型
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

// 表单需要的所有数据
const datasetName = ref("");
const selectedDataType = ref("flux"); // 默认选中第一个数据类型
const selectedFile = ref<File>();
const missingValueTypes = ref(missingTypesList.value.map(t => t.value)); // 选中的缺失值类型
// 文件处理状态
const fileProcessing = ref(false);

const canCloseDialog = computed(() => !loading.value && !fileProcessing.value);
const canGoPrev = computed(() => currentStep.value > 0 && canCloseDialog.value);
const canGoNext = computed(() => {
  if (!canCloseDialog.value || currentStep.value >= stepForm.value.length - 1) return false;
  if (currentStep.value === 1) {
    return Boolean(datasetName.value.trim()) && Boolean(selectedFile.value);
  }
  return true;
});
const canImport = computed(() => {
  return (
    currentStep.value === stepForm.value.length - 1 &&
    canCloseDialog.value &&
    Boolean(projectStore.currentProject) &&
    Boolean(datasetName.value.trim()) &&
    Boolean(selectedDataType.value) &&
    Boolean(selectedFile.value) &&
    columns.value.length > 0 &&
    missingValueTypes.value.length > 0
  );
});
const currentStepDesc = computed(() => {
  if (currentStep.value === 0) return "先选择数据类型，后续将按类型组织导入和分析流程。";
  if (currentStep.value === 1) return "填写数据集名称并上传文件，系统会自动解析预览。";
  return "确认数据预览与缺失值配置，然后执行导入。";
});
const selectedFileSizeText = computed(() => {
  if (!selectedFile.value) return "0 B";
  const size = selectedFile.value.size;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
});

// 获取用户系统时区
const getSystemTimezone = (): string => {
  try {
    // 获取用户系统时区
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log("检测到用户系统时区:", userTimezone);

    // 转换为我们支持的格式
    const timezoneMap: Record<string, string> = {
      "Asia/Shanghai": "UTC+8",
      "Asia/Hong_Kong": "UTC+8",
      "Asia/Taipei": "UTC+8",
      "Asia/Seoul": "UTC+9",
      "Asia/Tokyo": "UTC+9",
      "Asia/Singapore": "UTC+8",
      "Asia/Kuala_Lumpur": "UTC+8",
      "Asia/Bangkok": "UTC+7",
      "Asia/Jakarta": "UTC+7",
      "Asia/Manila": "UTC+8",
      "Australia/Sydney": "UTC+10",
      "Australia/Melbourne": "UTC+10",
      "Australia/Perth": "UTC+8",
      "Pacific/Auckland": "UTC+12",
      "America/New_York": "UTC-5",
      "America/Chicago": "UTC-6",
      "America/Denver": "UTC-7",
      "America/Los_Angeles": "UTC-8",
      "Europe/London": "UTC+0",
      "Europe/Paris": "UTC+1",
      "Europe/Berlin": "UTC+1",
      "Europe/Moscow": "UTC+3",
    };

    const detectedTimezone = timezoneMap[userTimezone] || "UTC+8"; // 默认北京时间
    console.log("转换为应用程序时区格式:", detectedTimezone);
    return detectedTimezone;
  } catch (error) {
    console.warn("无法获取系统时区，使用默认时区:", error);
    return "UTC+8"; // 默认北京时间
  }
};

// 第二步 选择数据类型
const dataOptions = [
  {
    value: "flux",
    label: "通量数据",
    description: "碳/水等通量观测数据",
    icon: TrendCharts,
  },
  {
    value: "aqi",
    label: "空气质量数据",
    description: "大气污染物数据",
    icon: Odometer,
  },
  {
    value: "nai",
    label: "负氧离子数据",
    description: "负氧离子浓度监测数据",
    icon: Lightning,
  },
  {
    value: "sapflow",
    label: "茎流数据",
    description: "茎流量",
    icon: Pouring,
  },
  {
    value: "micrometeorology",
    label: "微气象数据",
    description: "微气象数据",
    icon: Sunny,
  },
];

// 表格相关数据
const tableData = ref([]);
const columns = ref<TableColumns[]>([]);
const totalRowCount = ref<number>(0);

const uploadRef = ref<UploadInstance | null>(null);
const fileList = ref<any[]>([]); //用于控制上传组件显示的文件列表

// 第四步 确定缺失值类型
const isAdding = ref(false);
const optionName = ref("");
// 优化列定义，确保每列有合理宽度
const optimizedColumns = computed(() => {
  return columns.value.map(column => {
    // 原始列定义复制
    const optimizedColumn = { ...column };

    // 如果是对象，添加width和minWidth属性
    if (typeof optimizedColumn === "object") {
      // 根据列标题长度动态设置最小宽度
      const titleLength = optimizedColumn.label?.toString().length || 0;
      const minColWidth = Math.max(100, titleLength * 12); // 最小100px

      // 设置列宽属性 - 移除固定width以允许自适应
      // optimizedColumn.width = minColWidth;
      optimizedColumn.minWidth = minColWidth;

      // @ts-ignore
      optimizedColumn.cellStyle = {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      };

      // 添加tooltip，当文本被截断时显示完整内容
      optimizedColumn.showOverflowTooltip = true;
    }

    return optimizedColumn;
  });
});

/**
 * 点击增加缺失值类型
 */
const onAddOption = () => {
  isAdding.value = true;
};
/**
 * 确认添加缺失值类型
 */
const onConfirm = async () => {
  if (optionName.value) {
    // Check if it already exists
    const exists = missingTypesList.value.some(item => item.value === optionName.value);

    if (!exists) {
      missingTypesList.value.push({
        label: optionName.value,
        value: optionName.value,
      });
      // Save to settings
      await settingsStore.addCustomMissingType(optionName.value);
    }

    // Select it if not already selected
    if (!missingValueTypes.value.includes(optionName.value)) {
      missingValueTypes.value.push(optionName.value);
    }

    clearInputOption();
  }
};
/**
 * 清空添加的缺失值类型
 */
const clearInputOption = () => {
  optionName.value = "";
  isAdding.value = false;
};
const prevStep = () => {
  if (canGoPrev.value) {
    currentStep.value--;
  }
};
const nextStep = () => {
  if (!canGoNext.value) {
    if (currentStep.value === 1) {
      if (!datasetName.value.trim()) {
        ElMessage.warning("请先填写数据集名称");
        return;
      }
      if (!selectedFile.value) {
        ElMessage.warning("请先上传数据文件");
        return;
      }
    }
    return;
  }
  currentStep.value++;
};
/**
 * 提交导入选项
 */
const submitImportOption = async () => {
  console.log("submitImportOption");
  const missingFields: string[] = [];

  if (!projectStore.currentProject) {
    missingFields.push("项目");
  }

  if (!datasetName.value.trim()) {
    missingFields.push("数据集名称");
  }

  if (!selectedDataType.value) {
    missingFields.push("数据类型");
  }

  if (!selectedFile.value) {
    missingFields.push("上传文件");
  }

  // 可根据需要判断 missingValueTypes 是否必须
  if (missingValueTypes.value.length === 0) {
    missingFields.push("缺失值类型");
  }

  if (missingFields.length > 0) {
    ElMessage.error(`请填写以下必填项：${missingFields.join("、")}`);
    return;
  }

  // 设置 loading 状态，防止重复提交
  loading.value = true;

  try {
    const pureData = {
      projectId: projectStore.currentProject!.id,
      importOption: {
        datasetName: String(datasetName.value).trim(),
        type: String(selectedDataType.value),
        file: {
          name: String(selectedFile.value!.name),
          size: String(selectedFile.value!.size),
          // @ts-ignore
          path: window.electronAPI.getFilePath(selectedFile.value!),
        },
        missingValueTypes: missingValueTypes.value.map(v => String(v)),
        rows: Number(totalRowCount.value),
        columns: columns.value
          .map(col => col.label)
          .filter((label): label is string => typeof label === "string")
          .map(str => String(str)),
        sourceTimezone: getSystemTimezone(),
      },
    };

    // 让 UI 更新 loading 状态后再执行导入
    await new Promise(resolve => setTimeout(resolve, 0));

    const result = await datasetStore.importData(pureData.importOption);
    if (result) {
      ElMessage.success("数据导入成功");
      close(); // 关闭对话框
    } else {
      ElMessage.error("数据导入失败，请稍后重试");
    }
  } catch (error) {
    console.error("数据导入失败:", error);
    ElMessage.error("数据导入失败，请稍后重试");
  } finally {
    loading.value = false;
  }
};

// 文件选择处理
const handleFileChange = (file: any) => {
  if (file.raw) {
    const fileType = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(fileType || "")) {
      ElMessage.error("只支持CSV,Excel(xlsx/xls)文件");
      handleRemove();
      return;
    }
    selectedFile.value = file.raw;
    // @ts-ignore
    const filePath = window.electronAPI.getFilePath(file.raw);
    // 更新文件列表
    fileList.value = [
      {
        name: file.name,
        size: file.size,
        raw: file.raw,
        uid: file.uid,
        path: filePath,
      },
    ];
    if (!datasetName.value.trim()) {
      datasetName.value = file.name.replace(/\.[^/.]+$/, "");
    }
    processFile(file.raw, fileType || "");
  }
};
/**
 * 处理上传的文件
 * @param file 文件本体
 * @param fileType 文件类型（csv或excel）
 */
const processFile = async (file: File, fileType: string) => {
  fileProcessing.value = true;
  tableData.value = [];
  columns.value = [];
  totalRowCount.value = 0;

  try {
    // 使用 Promise 包装 FileReader，避免回调嵌套
    const fileContent = await new Promise<string | ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        if (e.target?.result) {
          resolve(e.target.result);
        } else {
          reject(new Error("读取文件失败"));
        }
      };
      reader.onerror = () => reject(new Error("读取文件失败"));

      if (fileType === "csv") {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });

    // 使用 nextTick 让 UI 更新后再调用 IPC
    await new Promise(resolve => setTimeout(resolve, 0));

    const type = fileType === "csv" ? "csv" : "excel";
    const result = await window.electronAPI.invoke(API_ROUTES.FILES.PARSE_PREVIEW, {
      fileType: type,
      fileContent: fileContent,
      maxRows: 20,
    });

    if (!result.success) {
      throw new Error(result.error || "解析文件失败");
    }

    columns.value = result.data.columns;
    tableData.value = result.data.tableData;
    totalRowCount.value = result.data.totalRows;
  } catch (err: any) {
    console.log("处理文件时出错:", err);
    ElMessage.error(err.message || "处理文件时出错");
  } finally {
    fileProcessing.value = false;
  }
};

// 超出文件限制处理
const handleExceed = () => {
  ElMessage.warning("只能上传一个文件");
};

// 打开对话框
const open = async () => {
  dialogVisible.value = true;

  // Load custom missing types
  const customTypes = await settingsStore.getCustomMissingTypes();
  if (customTypes && customTypes.length > 0) {
    // Add only new ones
    customTypes.forEach(type => {
      // Add to list if not exists
      if (!missingTypesList.value.some(item => item.value === type)) {
        missingTypesList.value.push({
          label: type,
          value: type,
        });
      }

      // Select it if not already selected (ensure it's default selected)
      if (!missingValueTypes.value.includes(type)) {
        missingValueTypes.value.push(type);
      }
    });
  }
};

// 移除文件处理
const handleRemove = () => {
  selectedFile.value = undefined;
  fileList.value = [];
  columns.value = [];
  tableData.value = [];
  totalRowCount.value = 0;
};

// 关闭对话框
const close = () => {
  if (!canCloseDialog.value) return;
  dialogVisible.value = false;
  // 清除导入选项
  datasetName.value = "";
  selectedDataType.value = "flux";
  selectedFile.value = undefined;
  missingValueTypes.value = missingTypesList.value.map(t => t.value);
  fileList.value = [];
  columns.value = [];
  tableData.value = [];
  totalRowCount.value = 0;
  fileProcessing.value = false;
  loading.value = false;
  currentStep.value = 0;
};

// 关闭时重置状态
const handleClosed = () => {
  selectedFile.value = undefined;
  loading.value = false;
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
};

// 导出方法给父组件
defineExpose({
  open,
  close,
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="750px"
    class="fixed-steps-dialog"
    destroy-on-close
    :close-on-click-modal="canCloseDialog"
    :close-on-press-escape="canCloseDialog"
    :show-close="canCloseDialog"
    @closed="handleClosed">
    <template #header>
      <div class="dialog-header">
        <div class="dialog-header-icon">入</div>
        <div class="dialog-header-text">
          <div class="dialog-title">导入数据</div>
          <div class="dialog-subtitle">按步骤完成类型选择、文件上传和参数配置</div>
        </div>
      </div>
    </template>

    <el-steps class="dialog-steps" :active="currentStep" finish-status="success" align-center>
      <el-step title="选择数据类型" />
      <el-step title="上传文件" />
      <el-step title="配置参数" />
    </el-steps>
    <div class="step-desc">{{ currentStepDesc }}</div>

    <div class="dialog-content-wrapper">
      <div v-if="currentStep === 0" class="step-container fade-in">
        <div class="data-type-grid">
          <div
            v-for="(option, index) in dataOptions"
            :key="index"
            class="data-type-card"
            :class="{ 'is-active': selectedDataType === option.value }"
            @click="selectedDataType = option.value">
            <div class="card-icon">
              <el-icon><component :is="option.icon" /></el-icon>
            </div>

            <div class="card-content">
              <h3 class="card-title">{{ option.label }}</h3>
              <p class="card-desc">{{ option.description }}</p>
            </div>

            <div class="card-radio">
              <div v-if="selectedDataType === option.value" class="radio-inner"></div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentStep === 1" class="step-container fade-in">
        <div class="input-group">
          <div class="input-label">数据集名称</div>
          <el-input
            v-model="datasetName"
            placeholder="请输入数据集名称"
            clearable
            size="large"
            class="custom-input"
            :maxlength="50"
            show-word-limit />
        </div>
        <el-upload
          ref="uploadRef"
          class="upload-demo custom-upload"
          action="#"
          :auto-upload="false"
          :limit="1"
          drag
          :file-list="fileList"
          :on-change="handleFileChange"
          :on-exceed="handleExceed"
          :on-remove="handleRemove">
          <div class="upload-content">
            <div class="upload-icon-wrapper">
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            </div>
            <div class="upload-text">
              <h3>点击或拖拽文件到此处上传</h3>
              <p>支持 CSV, Excel (xlsx/xls) 格式文件</p>
              <p class="upload-limit">单次最大 50MB</p>
            </div>
          </div>
        </el-upload>
        <div v-if="selectedFile" class="selected-file-tip">
          <span>{{ selectedFile.name }}</span>
          <span>{{ selectedFileSizeText }}</span>
        </div>
        <!-- 文件处理中的加载提示 -->
        <div v-if="fileProcessing" class="file-processing-overlay">
          <div class="processing-content">
            <el-icon class="processing-icon is-loading"><Refresh /></el-icon>
            <span>正在解析文件...</span>
          </div>
        </div>
      </div>

      <div v-if="currentStep === 2" class="fade-in">
        <div class="step-content flex-column">
          <div class="info-card overview-card">
            <!-- 表格预览部分 -->
            <div class="preview-container">
              <div v-if="columns.length > 0" class="table-container">
                <!-- 表格样式优化 -->
                <pure-table
                  :data="tableData"
                  :columns="optimizedColumns"
                  height="240"
                  stripe
                  class="data-preview-table"
                  :header-cell-style="{
                    backgroundColor: '#f8fafc',
                    color: '#4b5563',
                    fontWeight: '600',
                  }" />
              </div>

              <!-- 无数据时显示的提示 -->
              <div v-else-if="!fileProcessing" class="empty-preview">
                <el-icon class="preview-icon">
                  <document />
                </el-icon>
                <span>请上传文件以预览数据</span>
              </div>
            </div>
          </div>
          <!-- 参数配置区域 -->
          <div class="info-card">
            <div class="section-header">
              <el-icon class="header-icon"><Setting /></el-icon>
              <span class="header-title">配置参数</span>
            </div>
            <div class="config-body">
              <div class="config-item">
                <label class="config-label">缺失值表示:</label>
                <div class="config-content">
                  <el-select v-model="missingValueTypes" placeholder="缺失值示例" class="full-width-input" multiple>
                    <el-option
                      v-for="item in missingTypesList"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value" />
                    <template #footer>
                      <el-button v-if="!isAdding" text bg size="small" @click="onAddOption" class="btn-text-primary">
                        <el-icon class="btn-icon">
                          <plus />
                        </el-icon>
                        新增示例
                      </el-button>
                      <div v-else class="add-option-container">
                        <el-input
                          v-model="optionName"
                          class="option-input mb-2"
                          placeholder="输入新示例"
                          size="small" />
                        <div class="button-group">
                          <el-button type="primary" size="small" color="#10b981" @click="onConfirm">确认</el-button>
                          <el-button size="small" @click="clearInputOption">取消</el-button>
                        </div>
                      </div>
                    </template>
                  </el-select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button class="btn-secondary" :disabled="!canCloseDialog" @click="close">取消</el-button>
        <el-button class="btn-secondary" :disabled="!canGoPrev" @click="prevStep">上一步</el-button>
        <el-button class="btn-secondary" :disabled="!canGoNext" @click="nextStep">下一步</el-button>
        <el-button
          type="primary"
          class="btn-primary"
          :loading="loading"
          :disabled="!canImport"
          @click="submitImportOption">
          确认导入
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
.fixed-steps-dialog.el-dialog {
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
  height: 700px !important;
  max-height: 90vh !important;
  margin-top: 5vh !important;
  --el-dialog-padding-primary: 0;
}

.fixed-steps-dialog .el-dialog__header {
  margin: 0;
  padding: 0;
  border-bottom: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
  flex-shrink: 0;
  margin-right: 0;
}

.fixed-steps-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}

.fixed-steps-dialog .el-dialog__headerbtn .el-dialog__close {
  font-size: 18px;
  color: #9ca3af;
  transition: all 0.2s;
}

.fixed-steps-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: var(--dlg-accent);
}

.fixed-steps-dialog .el-dialog__body {
  padding: 0 !important;
  flex: 1 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.fixed-steps-dialog .el-dialog__footer {
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
  margin-bottom: 0;
  flex-shrink: 0;
}

.step-desc {
  margin: 0 20px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
}

.dialog-content-wrapper {
  padding: 10px 20px;
  flex: 1;
  overflow-y: auto;
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
  position: relative;
}

.data-type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 740px) {
  .data-type-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}

.data-type-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 82px;
}

.data-type-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.data-type-card.is-active {
  background: #f8fffb;
  border-color: #86efac;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
}

.card-icon {
  width: 36px;
  height: 36px;
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
  padding-right: 8px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 4px 0;
}

.card-desc {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

.card-radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  flex-shrink: 0;
  transition: all 0.2s;
}

.data-type-card.is-active .card-radio {
  border-color: #10b981;
  background-color: #10b981;
}

.radio-inner {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffffff;
}

.input-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.input-group {
  margin-bottom: 14px;
}

.custom-upload {
  margin-top: 6px;
}

.custom-input :deep(.el-input__wrapper) {
  border-radius: 8px;
  box-shadow: 0 0 0 1px #e2e8f0 inset;
  transition: all 0.2s;
}

.custom-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #cbd5e1 inset;
}

.custom-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #10b981 inset !important;
}

.custom-upload :deep(.el-upload-dragger) {
  padding: 16px;
  height: auto;
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  transition: all 0.2s ease;
}

.custom-upload :deep(.el-upload-dragger:hover) {
  border-color: #86efac;
  background: #f0fdf4;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.upload-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  transition: all 0.2s;
}

.custom-upload :deep(.el-upload-dragger:hover) .upload-icon-wrapper {
  background: #d1fae5;
  border-color: #86efac;
}

.custom-upload .el-icon--upload {
  font-size: 20px;
  color: #94a3b8;
  margin: 0;
  transition: color 0.2s;
}

.custom-upload :deep(.el-upload-dragger:hover) .el-icon--upload {
  color: #10b981;
}

.upload-text h3 {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  margin: 0 0 4px 0;
}

.upload-text p {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 2px 0;
}

.upload-limit {
  font-size: 11px !important;
  color: #94a3b8 !important;
  margin-top: 6px !important;
}

.selected-file-tip {
  margin-top: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.info-card {
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  margin-bottom: 10px;
}

.overview-card {
  background: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  padding: 8px !important;
}

.preview-container {
  padding: 0;
  background: #fff;
}

.data-preview-table {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.config-item {
  display: flex;
  align-items: center;
  background-color: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  transition: all 0.2s;
  gap: 12px;
}

.config-item:hover {
  border-color: #cbd5e1;
}

.config-label {
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}

.config-content {
  flex: 1;
  min-width: 0;
}

.full-width-input {
  width: 100%;
}

.config-body {
  padding: 10px;
}

.section-header {
  padding: 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #10b981;
  font-size: 16px;
  display: flex;
  align-items: center;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.file-processing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 10px;
}

.processing-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #10b981;
}

.processing-icon {
  font-size: 24px;
}

.processing-icon.is-loading {
  animation: spin 1s linear infinite;
}

:deep(::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

:deep(::-webkit-scrollbar-track) {
  background: #f1f1f1;
  border-radius: 4px;
}

:deep(::-webkit-scrollbar-thumb) {
  background: #d1d5db;
  border-radius: 4px;
}

:deep(::-webkit-scrollbar-thumb:hover) {
  background: #9ca3af;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-footer .el-button {
  height: 36px;
  min-width: 110px;
  padding: 0 18px;
  border-radius: 8px;
  font-weight: 600;
}

.btn-secondary {
  border: 1px solid #cbd5e1 !important;
  background: #ffffff !important;
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
  color: #ffffff !important;
}

.btn-primary:hover {
  background: #059669 !important;
  border-color: #059669 !important;
}

.btn-primary.is-disabled {
  background: #9ca3af !important;
  border-color: #9ca3af !important;
  color: #ffffff !important;
}
</style>
