<script setup lang="ts">
import { computed, ref } from "vue";
// 第三步 上传文件
import type { UploadInstance } from "element-plus";
import { ElMessage } from "element-plus";
import { UploadFilled, TrendCharts, Odometer, Sunny, Pouring, Lightning, Document, Plus, Setting } from "@element-plus/icons-vue";
// import type {ElectronWindow} from "@shared/types/window";
import type { TableColumns } from "@pureadmin/table";
import PureTable from "@pureadmin/table";
import { useProjectStore } from "@/stores/useProjectStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
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
const onConfirm = () => {
  if (optionName.value) {
    missingTypesList.value.push({
      label: optionName.value,
      value: optionName.value,
    });
    missingValueTypes.value.push(optionName.value);
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
  if (currentStep.value > 0) {
    currentStep.value--;
  }
};
const nextStep = () => {
  if (currentStep.value < stepForm.value.length - 1) {
    currentStep.value++;
  }
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

  try {
    const pureData = {
      projectId: projectStore.currentProject!.id,
      importOption: {
        datasetName: String(datasetName.value),
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
      },
    };
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
  }
};

// 文件选择处理
const handleFileChange = (file: any) => {
  if (file.raw) {
    const fileType = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(fileType || "")) {
      ElMessage.error("只支持CSV,Excel(xlsx/xls)文件");
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
    const reader = new FileReader();
    reader.onload = async e => {
      const fileContent = e.target?.result;
      if (!fileContent) {
        throw new Error("读取文件失败");
      }
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

      fileProcessing.value = false;
    };
    reader.onerror = () => {
      throw new Error("读取文件失败");
    };
    if (fileType === "csv") {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  } catch (err: any) {
    console.log("处理文件时出错:", err);
    ElMessage.error(err.message || "处理文件时出错");
    fileProcessing.value = false;
  }
};

// 超出文件限制处理
const handleExceed = () => {
  ElMessage.warning("只能上传一个文件");
};

// 移除文件处理
const handleRemove = () => {
  selectedFile.value = undefined;
  fileList.value = [];
  columns.value = [];
  tableData.value = [];
};

// 打开对话框
const open = () => {
  dialogVisible.value = true;
};

// 关闭对话框
const close = () => {
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
    title="导入数据"
    width="750px"
    class="fixed-steps-dialog emerald-glassmorphism"
    destroy-on-close
    @closed="handleClosed">
    <el-steps class="dialog-steps" :active="currentStep" finish-status="success" align-center>
      <el-step title="选择数据类型" />
      <el-step title="上传文件" />
      <el-step title="配置参数" />
    </el-steps>

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
              <div
                v-else-if="!fileProcessing"
                class="empty-preview">
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
                  <el-select
                    v-model="missingValueTypes"
                    placeholder="缺失值示例"
                    class="full-width-input"
                    multiple>
                    <el-option
                      v-for="item in missingTypesList"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value" />
                    <template #footer>
                      <el-button
                        v-if="!isAdding"
                        text
                        bg
                        size="small"
                        @click="onAddOption"
                        class="btn-text-primary">
                        <el-icon class="btn-icon">
                          <plus />
                        </el-icon>
                        新增示例
                      </el-button>
                      <div v-else class="add-option-container">
                        <el-input v-model="optionName" class="option-input mb-2" placeholder="输入新示例" size="small" />
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
        <el-button class="btn-secondary" @click="close">取消</el-button>
        <el-button class="btn-secondary" @click="prevStep" :disabled="currentStep === 0">上一步</el-button>
        <el-button class="btn-secondary" @click="nextStep" :disabled="currentStep === 2">下一步</el-button>
        <el-button
          type="primary"
          class="btn-primary"
          :loading="loading"
          :disabled="currentStep !== 2 || loading"
          @click="submitImportOption">
          确认导入
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
/* Global Dialog Overrides - Non-scoped to ensure they apply to teleported dialog */
.fixed-steps-dialog.el-dialog {
  border-radius: 20px !important;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  display: flex !important;
  flex-direction: column !important;
  height: 680px !important; /* Increased from 600px */
  max-height: 90vh !important;
  margin-top: 5vh !important; /* Adjusted */
  --el-dialog-padding-primary: 0;
  --el-dialog-content-font-size: 14px;
}

.fixed-steps-dialog .el-dialog__header {
  margin: 0;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(16, 185, 129, 0.1);
  background: linear-gradient(to right, #f0fdf4, #ffffff);
  margin-right: 0;
  flex-shrink: 0;
}

.fixed-steps-dialog .el-dialog__title {
  color: #047857;
  font-weight: 700;
  font-size: 1.25rem;
}

.fixed-steps-dialog .el-dialog__headerbtn .el-dialog__close {
  font-size: 1.25rem;
  color: #9ca3af;
  transition: all 0.2s;
}

.fixed-steps-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #10b981;
  transform: rotate(90deg);
}

.fixed-steps-dialog .el-dialog__body {
  padding: 0 !important;
  flex: 1 !important;
  height: auto !important; /* Override explicit height from element styling if any */
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.fixed-steps-dialog .el-dialog__footer {
  padding: 16px 30px;
  border-top: 1px solid #f3f4f6;
  flex-shrink: 0;
  background-color: white; /* Ensure background is solid */
}
</style>

<style scoped>
/* Dialog & Layout */
.fixed-steps-dialog {
  --el-color-primary: #10b981;
  --el-color-primary-light-3: #6ee7b7;
  --el-color-primary-light-5: #a7f3d0;
  --el-color-primary-light-7: #d1fae5;
  --el-color-primary-light-8: #ecfdf5;
  --el-color-primary-light-9: #f0fdf4;
  --el-color-primary-dark-2: #059669;
}

.dialog-content-wrapper {
  /* padding moved to overrides */
  display: flex;
  flex-direction: column;
}

/* Animations */
.fade-in {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Stepper Customization */
.dialog-steps {
  width: 100%;
  padding: 10px 30px 0; /* Moved padding here */
  margin-bottom: 5px;
  flex-shrink: 0;
}

:deep(.el-step__head.is-process) {
  color: #10b981;
  border-color: #10b981;
}

:deep(.el-step__head.is-process .el-step__icon) {
  background: #ecfdf5;
  border: 2px solid #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

:deep(.el-step__title.is-process) {
  font-weight: 700;
  color: #10b981;
}

:deep(.el-step__head.is-success) {
  color: #10b981;
  border-color: #10b981;
}

:deep(.el-step__title.is-success) {
  color: #10b981;
  font-weight: 600;
}

/* Step 0: Data Type Cards */
.step-container {
  padding: 8px 4px;
  margin: auto 0;
  width: 100%;
}

.data-type-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 20px;
}

@media (min-width: 640px) {
  .data-type-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.data-type-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  height: 110px;
  overflow: hidden;
}

.data-type-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(to bottom, #10b981, #34d399);
  opacity: 0;
  transition: opacity 0.3s;
}

.data-type-card:hover {
  border-color: #a7f3d0;
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.08);
  transform: translateY(-4px);
}

.data-type-card:hover::before {
  opacity: 1;
}

.data-type-card.is-active {
  background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
  border-color: #10b981;
  box-shadow: 0 0 0 1px #10b981, 0 10px 20px -3px rgba(16, 185, 129, 0.15);
}

.data-type-card.is-active::before {
  opacity: 1;
}

.card-icon {
  margin-right: 20px;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f3f4f6;
  color: #9ca3af;
  transition: all 0.3s ease;
}

.data-type-card:hover .card-icon {
  background-color: #d1fae5;
  color: #059669;
  transform: scale(1.05);
}

.data-type-card.is-active .card-icon {
  background: linear-gradient(135deg, #34d399 0%, #059669 100%);
  color: white;
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
}

.card-content {
  flex: 1;
  min-width: 0;
  padding-right: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.card-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: #374151;
  margin: 0 0 4px 0;
}

.card-desc {
  font-size: 0.8125rem;
  color: #6b7280;
  margin: 0;
}

.card-radio {
  position: absolute;
  top: 50%;
  right: 20px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: white;
  transition: all 0.3s;
}

.data-type-card.is-active .card-radio {
  border-color: #10b981;
  background-color: #10b981;
}

.radio-inner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: white;
}

/* Step 1: Upload & Input */
.input-group {
  margin-bottom: 24px;
}

.input-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.custom-input :deep(.el-input__wrapper) {
  border-radius: 8px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
  padding: 8px 15px;
  transition: all 0.3s;
}

.custom-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #a7f3d0 inset;
}

.custom-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2) inset, 0 0 0 1px #10b981 inset !important;
}

/* Upload Styling */
.custom-upload :deep(.el-upload-dragger) {
  padding: 20px;
  height: auto;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  background-color: #f9fafb;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.custom-upload :deep(.el-upload-dragger:hover) {
  border-color: #10b981;
  background-color: #ecfdf5;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.upload-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: all 0.3s;
}

.custom-upload :deep(.el-upload-dragger:hover) .upload-icon-wrapper {
  background-color: #d1fae5;
  transform: scale(1.1);
}

.custom-upload .el-icon--upload {
  font-size: 24px;
  color: #9ca3af;
  margin: 0;
  transition: color 0.3s;
}

.custom-upload :deep(.el-upload-dragger:hover) .el-icon--upload {
  color: #10b981;
}

.upload-text h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #374151;
  margin: 0 0 4px 0;
}

.upload-text p {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 2px 0;
}

.upload-limit {
  font-size: 0.8rem !important;
  color: #9ca3af !important;
  margin-top: 8px !important;
}

/* Step 2: Info & Config */
.info-card {
  background-color: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  margin-bottom: 8px;
  transition: box-shadow 0.3s;
}

.info-card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* Overview Card Styles matching screenshot */
.overview-card {
  background: #ecfdf5 !important; /* Emerald-50 */
  border: none !important;
  padding: 20px !important;
  display: flex;
  flex-direction: column;
  gap: 16px;
}


/* Original Styles to Keep or Override */
.preview-container {
  padding: 8px;
  background-color: #fff;
}

.data-preview-table {
  border-radius: 8px;
  border: 1px solid #f3f4f6;
}

/* Dialog Footer */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-secondary {
  border-radius: 8px !important;
  padding: 10px 24px !important;
  height: 40px !important;
  font-weight: 500 !important;
}

.btn-secondary:hover {
  background-color: #ecfdf5 !important;
  color: #059669 !important;
  border-color: #a7f3d0 !important;
}

.btn-primary {
  border-radius: 8px !important;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  border: none !important;
  padding: 10px 24px !important;
  height: 40px !important;
  font-weight: 600 !important;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
  transition: all 0.3s !important;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.4) !important;
}

.btn-primary:active {
  transform: translateY(0);
}

/* Global Dialog Overrides REMOVED - Moved to non-scoped style */

.dialog-content-wrapper {
  padding: 0 30px 10px; /* Adjust padding */
  flex: 1;
  overflow-y: auto;
}

.config-item {
  display: flex;
  align-items: center;
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  transition: all 0.3s;
  gap: 16px; /* Added spacing */
}

.config-item:hover {
  border-color: #d1fae5;
  background-color: #f0fdf4;
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
  padding: 20px;
}

.section-header {
  padding: 14px 20px;
  background: linear-gradient(to right, #f0fdf4, #ffffff);
  border-bottom: 1px solid rgba(16, 185, 129, 0.1);
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  color: #10b981;
  font-size: 20px;
  display: flex;
  align-items: center;
}

.header-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #065f46;
  letter-spacing: 0.5px;
}

/* Scrollbar Customization */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
