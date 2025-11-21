<script setup lang="ts">
import { computed, ref } from "vue";
// 第三步 上传文件
import type { UploadInstance } from "element-plus";
import { ElMessage } from "element-plus";
import { UploadFilled } from "@element-plus/icons-vue";
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
// 表单需要的所有数据
const datasetName = ref("");
const selectedDataType = ref("flux"); // 默认选中第一个数据类型
const selectedFile = ref<File>();
const missingValueTypes = ref([]); // 选中的缺失值类型
// 文件处理状态
const fileProcessing = ref(false);

// 第二步 选择数据类型
const dataOptions = [
  {
    value: "flux",
    label: "通量数据",
    description: "碳/水等通量观测数据",
  },
  {
    value: "aqi",
    label: "空气质量数据",
    description: "大气污染物数据",
  },
  {
    value: "nai",
    label: "负氧离子数据",
    description: "负氧离子浓度监测数据",
  },
  {
    value: "sapflow",
    label: "茎流数据",
    description: "茎流量",
  },
  {
    value: "micrometeorology",
    label: "微气象数据",
    description: "微气象数据",
  },
];

// 表格相关数据
const tableData = ref([]);
const columns = ref<TableColumns[]>([]);
const totalRowCount = ref<number>(0);

const uploadRef = ref<UploadInstance | null>(null);
const fileList = ref<any[]>([]); //用于控制上传组件显示的文件列表

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
      const minColWidth = Math.max(150, titleLength * 10); // 最小150px，或者按标题字符数*10的宽度

      // 设置列宽属性
      optimizedColumn.width = minColWidth;
      optimizedColumn.minWidth = minColWidth;

      // 添加单元格样式，确保内容不溢出
      optimizedColumn.cellStyle = {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: `${minColWidth}px`,
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
  missingValueTypes.value = [];
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
    width="700px"
    class="fixed-steps-dialog"
    destroy-on-close
    @closed="handleClosed">
    <el-steps class="w-full" :space="200" :active="currentStep" finish-status="success">
      <el-step title="选择数据型" />
      <el-step title="上传文件" />
      <el-step title="配置参数" />
    </el-steps>

    <div v-if="currentStep === 0">
      <el-radio-group v-model="selectedDataType" class="space-y-2.5 w-full flex flex-col">
        <div
          v-for="(option, index) in dataOptions"
          :key="index"
          class="flex w-full h-[60px] cursor-pointer rounded transition-all duration-200 !my-1"
          :class="[
            selectedDataType === option.value
              ? 'border-2 border-blue-500'
              : 'border border-gray-300 hover:border-blue-400 hover:shadow-md',
          ]"
          @click="selectedDataType = option.value">
          <el-radio :value="option.value" class="flex w-full">
            <div class="flex justify-between items-center w-full">
              <span class="text-base font-medium text-gray-800">{{ option.label }}</span>
              <span class="text-sm text-gray-500 !mr-2.5">{{ option.description }}</span>
            </div>
          </el-radio>
        </div>
      </el-radio-group>
    </div>

    <div v-if="currentStep === 1">
      <div class="mb-4">
        <el-input
          v-model="datasetName"
          placeholder="请输入数据集名称"
          clearable
          class="w-full"
          :maxlength="50"
          show-word-limit />
      </div>
      <el-upload
        ref="uploadRef"
        class="upload-demo"
        action="#"
        :auto-upload="false"
        :limit="1"
        drag
        :file-list="fileList"
        :on-change="handleFileChange"
        :on-exceed="handleExceed"
        :on-remove="handleRemove">
        <el-icon class="el-icon--upload">
          <upload-filled />
        </el-icon>
        <div class="el-upload__text">托拽文件至此处或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 CSV, Excel(xlsx/xls), JSON 格式文件，单次最大 50MB</div>
        </template>
      </el-upload>
    </div>

    <div v-if="currentStep === 2">
      <div class="step-content flex flex-col">
        <div class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-4">
          <!-- 文件信息区域-->
          <div class="bg-blue-500 text-white px-4 py-3 flex justify-between items-center">
            <span class="font-medium">当前文件：{{ fileList[0]?.name }}</span>
            <span v-if="totalRowCount > 0" class="text-sm bg-blue-600 px-2 py-0.5 rounded">
              总行数: {{ totalRowCount }} (显示前 {{ tableData.length }} 行)
            </span>
          </div>

          <!-- 表格预览部分，保持内容但使用卡片内部样式 -->
          <div class="p-4 bg-gray-50 relative">
            <div v-if="columns.length > 0" class="table-container overflow-auto">
              <!-- 表格样式优化：添加圆角和边框 -->
              <pure-table
                :data="tableData"
                :columns="optimizedColumns"
                height="300"
                stripe
                class="border border-gray-200 rounded-md data-preview-table"
                :header-cell-style="{
                  backgroundColor: '#f8fafc',
                  color: '#4b5563',
                  fontWeight: '600',
                }" />
            </div>

            <!-- 无数据时显示的提示，使用更统一的空状态样式 -->
            <div
              v-else-if="!fileProcessing"
              class="h-48 flex flex-col items-center justify-center text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-md">
              <el-icon class="text-3xl mb-2">
                <document />
              </el-icon>
              <span>请上传文件以预览数据</span>
            </div>
          </div>
        </div>

        <!-- 参数配置区域，使用相同的卡片风格 -->
        <div class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div class="bg-blue-500 text-white px-4 py-2">
            <span class="font-medium">配置参数</span>
          </div>
          <div class="p-4">
            <div class="flex items-center bg-gray-50 border border-gray-300 rounded p-3">
              <label class="text-sm text-gray-700 font-medium min-w-24">缺失值表示:</label>
              <div class="relative flex-1 ml-2">
                <el-select v-model="missingValueTypes" placeholder="缺失值示例" class="w-full" multiple>
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
                      class="text-blue-500 hover:bg-blue-50">
                      <el-icon class="mr-1">
                        <plus />
                      </el-icon>
                      新增示例
                    </el-button>
                    <div v-else class="p-2">
                      <el-input v-model="optionName" class="option-input mb-2" placeholder="输入新示例" size="small" />
                      <div class="flex gap-2">
                        <el-button type="primary" size="small" @click="onConfirm">确认</el-button>
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

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="close">取消</el-button>
        <el-button @click="prevStep" :disabled="currentStep === 0">上一步</el-button>
        <el-button @click="nextStep" :disabled="currentStep === 2">下一步</el-button>
        <el-button
          type="primary"
          :loading="loading"
          :disabled="currentStep !== 2 || loading"
          @click="submitImportOption">
          确认导入
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.fixed-steps-dialog :deep(.el-dialog__body) {
  padding: 20px;
  height: 510px; /* 设置固定高度 */
}

/* 关键样式：调整PlusStepsForm组件内部布局 */
.fixed-steps-dialog :deep(.plus-steps-form) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 内容区域样式，使其可滚动 */
.fixed-steps-dialog :deep(.steps-content) {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 70px; /* 为底部按钮预留空间 */
}

/* 步骤内容区域 */
.step-content {
  min-height: 350px;
  width: 100%;
}

/* 按钮区域固定在底部 */
.fixed-steps-dialog :deep(.steps-action) {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: calc(100% - 40px);
  background-color: white;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: flex-end;
}

/* 表格容器样式，确保水平滚动正常工作 */
.table-container {
  width: 100%;
  overflow-x: auto;
  position: relative;
}

/* 表格样式优化 */
:deep(.data-preview-table) {
  width: 100%;
  table-layout: fixed; /* 固定表格布局，更好地控制列宽 */
  box-shadow: none;
  border-radius: 6px;
}

:deep(.data-preview-table .table-header) {
  background-color: #f8fafc;
  position: sticky;
  top: 0;
  z-index: 10;
}

:deep(.data-preview-table th) {
  font-weight: 600;
  color: #4b5563;
  padding: 10px 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.data-preview-table tr) {
  transition: background-color 0.2s ease;
}

:deep(.data-preview-table tr:hover) {
  background-color: #f1f5f9;
}

:deep(.data-preview-table td) {
  color: #334155;
  padding: 8px 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 确保水平滚动条显示正常 */
:deep(.pure-table .el-scrollbar__wrap) {
  overflow-x: auto !important;
}

:deep(.el-upload-dragger) {
  height: 280px;
}

:deep(.el-upload-dragger .el-icon--upload) {
  margin-top: 35px;
}

:deep(.el-radio) {
  width: 100%;
  height: 100%;
  margin: 0 10px;
  padding: 0;
}

:deep(.el-radio__input) {
  height: 24px;
  width: 24px;
}

:deep(.el-radio__inner) {
  width: 24px;
  height: 24px;
  background-color: #ecf0f1;
}

:deep(.el-radio__input.is-checked .el-radio__inner) {
  background-color: #3498db;
  border-color: #3498db;
}

:deep(.el-radio__input.is-checked .el-radio__inner::after) {
  transform: translate(-50%, -50%) scale(1);
  content: "✓";
  background-color: transparent;
  color: white;
  font-size: 12px;
  width: auto;
  height: auto;
  border-radius: 0;
}

:deep(.el-radio__label) {
  padding-left: 10px;
  width: 100%;
}
</style>
