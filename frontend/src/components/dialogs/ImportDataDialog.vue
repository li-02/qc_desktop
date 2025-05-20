<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {ElMessage} from "element-plus";
import {UploadFilled} from "@element-plus/icons-vue";
import type {ProjectInfo} from "@/types/electron";
import emitter from "@/utils/eventBus";
import {PlusStepsForm} from "plus-pro-components";
import PureTable from "@pureadmin/table";
import {processCSV, processExcel} from "@/utils/fileProcessors";

// 对话框状态
const dialogVisible = ref(false);
const loading = ref(false);
const uploadRef = ref(null);
// 文件处理状态
const fileProcessing = ref(false);

const selectedDataType = ref("flux");
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
    value: "mecrometelogy",
    label: "微气象数据",
    description: "微气象数据",
  },
];

// 表格相关数据
const tableData = ref([]);
const columns = ref([]);
const totalRowCount = ref(0);

const missingValues = ref("");
// 选择的项目和文件
const selectedProject = ref<ProjectInfo | null>(null);
const selectedFile = ref<File | null>(null);
const fileList = ref<any[]>([]); //用于控制上传组件显示的文件列表
const fileSelected = computed(() => selectedFile.value !== null);
const active = ref(1);
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

const isAdding = ref(false);
const missingTypes = ref([]);
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
const optionName = ref("");
const onAddOption = () => {
  isAdding.value = true;
};
const onConfirm = () => {
  if (optionName.value) {
    missingTypesList.value.push({
      label: optionName.value,
      value: optionName.value,
    });
    clearInputOption();
  }
};
const clearInputOption = () => {
  optionName.value = "";
  isAdding.value = false;
};
const next = (actives: number, values: any) => {
  active.value = actives;
  console.log(actives, values, stepForm.value);
};
// 格式化日期
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// 文件选择处理
const handleFileChange = (file: any) => {
  console.log("handleFileChange-file-upload", file);
  if (file.raw) {
    const fileType = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(fileType || "")) {
      ElMessage.error("只支持CSV,Excel(xlsx/xls)文件");
      return;
    }
    selectedFile.value = file.raw;
    // 更新文件列表
    fileList.value = [
      {
        name: file.name,
        size: file.size,
        raw: file.raw,
        uid: file.uid,
      },
    ];
    processFile(file.raw, fileType || "");
  }
};
/**
 * 文件处理方法
 * @param file
 * @param fileType
 */
const processFile = async (file: File, fileType: string) => {
  console.log("processFile-file-upload", file, fileType);
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
      if (!window.electronAPI) {
        throw new Error("Electron API不可用");
      }
      const type = fileType === "csv" ? "csv" : "excel";
      console.log("ready in parseFilePreview");
      const result = await window.electronAPI.parseFilePreview(type, fileContent, 20);
      console.log("parseFilePreview-result", result);
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
  } catch (err) {
    console.error("处理文件时出错:", err);
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
  selectedFile.value = null;
  fileList.value = [];
  columns.value = [];
  tableData.value = [];
};

// 手动移除文件
const handleRemoveFile = () => {
  handleRemove();
};

// 确认导入
const confirmImport = async () => {
  if (!selectedProject.value) {
    ElMessage.warning("请先选择项目");
    return;
  }

  if (!selectedFile.value) {
    ElMessage.warning("请选择要导入的文件");
    return;
  }

  try {
    loading.value = true;

    // 这里添加实际导入数据的代码
    // 目前只是模拟导入过程
    await new Promise(resolve => setTimeout(resolve, 1500));

    ElMessage.success(`成功导入数据到项目: ${selectedProject.value.name}`);
    close();
  } catch (error: any) {
    console.error("导入数据失败:", error);
    ElMessage.error(error.message || "导入数据失败");
  } finally {
    loading.value = false;
  }
};

// 打开对话框
const open = () => {
  // 获取当前选中的项目
  const handleProjectSelected = (project: ProjectInfo) => {
    selectedProject.value = project;
    // 移除监听器，避免重复监听
    emitter.off("project-selected", handleProjectSelected);
  };

  // 先监听一下项目选择事件
  emitter.on("project-selected", handleProjectSelected);

  dialogVisible.value = true;
};

// 关闭对话框
const close = () => {
  dialogVisible.value = false;
};

// 关闭时重置状态
const handleClosed = () => {
  selectedFile.value = null;
  loading.value = false;
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
};

// 监听事件总线，获取当前选中的项目
onMounted(() => {
  // 检查是否已有选中的项目
  emitter.on("current-project", (project: ProjectInfo) => {
    selectedProject.value = project;
  });

  // 请求当前项目信息
  emitter.emit("get-current-project");
});

onUnmounted(() => {
  emitter.off("current-project");
});

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
    width="600px"
    class="fixed-steps-dialog"
    destroy-on-close
    @closed="handleClosed">
    <PlusStepsForm v-model="active" :data="stepForm" @next="next">
      <template #step-1>
        <div class="step-content">
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
      </template>
      <template #step-2>
        <div class="step-content">
          <el-upload
            ref="uploadRef"
            class="h-70"
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
      </template>
      <template #step-3>
        <div class="step-content flex flex-col">
          <div class="bg-blue-500 text-white px-4 py-2">
            <span>当前文件：{{ fileList[0]?.name }}</span>
            <span v-if="totalRowCount > 0" class="text-sm">
              总行数: {{ totalRowCount }} (显示前 {{ tableData.length }} 行)
            </span>
          </div>
          <div class="bg-blue-500 text-white px-4 py-1 border-t border-blue-600">
            <span>文件预览</span>
          </div>
          <!--表格预览部分-->
          <div class="p-4 bg-gray-50 relative">
            <div
              v-if="fileProcessing"
              class="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
              <el-progress type="circle" :precentage="100" status="warning" indeterminate />
              <span class="ml-2 text-gray-700">解析文件中,请稍候</span>
            </div>
            <div v-if="columns.length > 0" class="overflow-x-auto">
              <pure-table :data="tableData" :columns="columns" height="300" />
            </div>
            <!-- 无数据时显示的提示 -->
            <div v-else-if="!fileProcessing" class="h-48 flex items-center justify-center text-gray-500">
              请上传文件以预览数据
            </div>
          </div>
          <div class="p-4">
            <h2 class="text-base font-semibold text-gray-800 mb-2">配置参数</h2>
            <div class="flex items-center border border-gray-300 rounded p-2">
              <label class="text-sm text-gray-700">缺失值表示:</label>
              <div class="relative flex-1 ml-2">
                <el-select v-model="missingTypes" placeholder="缺失值示例" class="w-full" multiple>
                  <el-option
                    v-for="item in missingTypesList"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value" />
                  <template #footer>
                    <el-button v-if="!isAdding" text bg size="small" @click="onAddOption"> 新增示例</el-button>
                    <el-button v-else>
                      <el-input v-model="optionName" class="option-input" placeholder="输入新示例" size="small" />
                      <el-button type="primary" size="small" @click="onConfirm">确认</el-button>
                      <el-button size="small" @click="clearInputOption">取消</el-button>
                    </el-button>
                  </template>
                </el-select>
              </div>
            </div>
          </div>
        </div>
      </template>
    </PlusStepsForm>
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

:deep(.el-upload-dragger) {
  height: 280px;
}

:deep(.el-upload-dragger .el-icon--upload) {
  margin-top: 35px;
}

:deep(.el-divider__text) {
  font-size: 14px;
  color: #909399;
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
