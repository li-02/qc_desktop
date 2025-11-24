<!-- dialog管理器 -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import CreateProjectDialog from "./CreateProjectDialog.vue";
import ImportDataDialog from "./ImportDataDialog.vue";
import emitter from "../../utils/eventBus";

// 对话框引用
const createProjectDialog = ref(null);
const importDataDialog = ref(null);

// 打开新建项目对话框
const handleOpenCreateProjectDialog = () => {
  createProjectDialog.value?.open();
};

// 打开导入数据对话框
const handleOpenImportDataDialog = () => {
  console.log("对话框管理器接收到打开导入数据对话框事件");
  importDataDialog.value?.open();
};

// 获取当前项目处理函数
const handleGetCurrentProject = () => {
  // 获取当前选中的项目
  emitter.emit("request-current-project");
};

onMounted(() => {
  console.log("对话框管理器初始化");

  // 注册事件监听
  emitter.on("open-create-project-dialog", handleOpenCreateProjectDialog);
  emitter.on("open-import-data-dialog", handleOpenImportDataDialog);
  emitter.on("get-current-project", handleGetCurrentProject);

  // 让主组件共享当前项目
  emitter.on("request-current-project", () => {
    emitter.emit("provide-current-project");
  });
});

onUnmounted(() => {
  // 移除事件监听
  emitter.off("open-create-project-dialog", handleOpenCreateProjectDialog);
  emitter.off("open-import-data-dialog", handleOpenImportDataDialog);
  emitter.off("get-current-project", handleGetCurrentProject);
  emitter.off("request-current-project");
});
</script>

<template>
  <div class="global-dialogs">
    <CreateProjectDialog ref="createProjectDialog" />
    <ImportDataDialog ref="importDataDialog" />
  </div>
</template>

<style scoped>
.global-dialogs {
  position: relative;
  z-index: 2000;
}
</style>
