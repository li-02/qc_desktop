<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {ElMessage} from "element-plus";
import {Delete, Document, Upload} from "@element-plus/icons-vue";
import type {ProjectInfo} from "@/types/electron";
import emitter from "@/utils/eventBus";

// 对话框状态
const dialogVisible = ref(false);
const loading = ref(false);
const uploadRef = ref(null);

// 选择的项目和文件
const selectedProject = ref<ProjectInfo | null>(null);
const selectedFile = ref<File | null>(null);
const fileSelected = computed(() => selectedFile.value !== null);

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
  selectedFile.value = file.raw;
};

// 超出文件限制处理
const handleExceed = () => {
  ElMessage.warning("只能上传一个文件");
};

// 移除文件处理
const handleRemove = () => {
  selectedFile.value = null;
};

// 手动移除文件
const handleRemoveFile = () => {
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
  selectedFile.value = null;
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
  <el-dialog v-model="dialogVisible" title="导入数据" width="480px" destroy-on-close @closed="handleClosed">
    <div class="import-data-form">
      <div class="selected-project-info" v-if="selectedProject">
        <div class="info-label">当前选中项目:</div>
        <div class="project-badge">
          <span class="project-name">{{ selectedProject.name }}</span>
          <span class="project-date">{{ formatDate(selectedProject.createdAt) }}</span>
        </div>
      </div>

      <el-divider content-position="left">选择数据文件</el-divider>

      <el-upload
        ref="uploadRef"
        action="#"
        :auto-upload="false"
        :limit="1"
        :on-change="handleFileChange"
        :on-exceed="handleExceed"
        :on-remove="handleRemove">
        <template #trigger>
          <el-button type="primary" :icon="Upload">选择文件</el-button>
        </template>
        <template #tip>
          <div class="upload-tip">支持 CSV, Excel(xlsx/xls), JSON 格式文件，单次最大 50MB</div>
        </template>
      </el-upload>

      <div v-if="fileSelected" class="file-preview">
        <div class="file-info">
          <el-icon class="file-icon">
            <Document />
          </el-icon>
          <div class="file-details">
            <div class="file-name">{{ selectedFile.name }}</div>
            <div class="file-size">{{ formatFileSize(selectedFile.size) }}</div>
          </div>
        </div>
        <el-button type="danger" :icon="Delete" circle plain size="small" @click="handleRemoveFile"></el-button>
      </div>

      <el-alert
        v-if="!selectedProject"
        title="请先选择项目"
        type="warning"
        description="导入数据需要先选择一个项目作为数据目标"
        show-icon
        :closable="false"
        class="project-warning" />
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="close">取消</el-button>
        <el-button
          type="primary"
          @click="confirmImport"
          :loading="loading"
          :disabled="!fileSelected || !selectedProject">
          导入数据
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-data-form {
  padding: 0 20px;
}

.selected-project-info {
  margin-bottom: 16px;
}

.info-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}

.project-badge {
  display: inline-flex;
  flex-direction: column;
  padding: 6px 12px;
  background-color: #ebf5ff;
  border-radius: 4px;
  border-left: 3px solid #409eff;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.project-date {
  font-size: 12px;
  color: #909399;
}

.upload-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

.file-preview {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  background-color: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-info {
  display: flex;
  align-items: center;
}

.file-icon {
  font-size: 24px;
  color: #909399;
  margin-right: 12px;
}

.file-details {
  display: flex;
  flex-direction: column;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.file-size {
  font-size: 12px;
  color: #909399;
}

.project-warning {
  margin-top: 16px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.el-divider__text) {
  font-size: 14px;
  color: #909399;
}
</style>