<script setup lang="ts">
import {onMounted, onUnmounted} from "vue";
import GlobalDialogs from "./components/dialogs/index.vue";
// import emitter from "./utils/eventBus";
import {useProjectStore} from "./stores/useProjectStore";
import {useDatasetStore} from "./stores/useDatasetStore";
// import {cleanupProjectStore, setupProjectStore} from "./stores/projectStore";
const projectStore = useProjectStore();
const datasetStore = useDatasetStore();
onMounted(() => {
  projectStore.loadProjects();
  // 设置项目状态管理
  // setupProjectStore();

  // if (window.electronAPI) {
  //   // 事件转发到Vue事件总线
  //   window.electronAPI.onOpenCreateProjectDialog(() => {
  //     emitter.emit("open-create-project-dialog");
  //   });

  //   window.electronAPI.onOpenImportDataDialog(() => {
  //     console.log("App.vue 收到主进程的open-import-data-dialog事件，转发到事件总线");
  //     emitter.emit("open-import-data-dialog");
  //   });
  // }
});

onUnmounted(() => {
  // 清理项目状态管理
  // cleanupProjectStore();
});
</script>

<template>
  <router-view />
  <!-- 引入全局对话框管理器 -->
  <GlobalDialogs />
</template>

<style>
/* 全局样式（作为补充，不覆盖 assets/style.css 中的主要样式）*/
body {
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue",
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
}

/* 设置一些全局有用的辅助类 */
.text-danger {
  color: #f56c6c !important;
}

.text-success {
  color: #67c23a !important;
}

.text-warning {
  color: #e6a23c !important;
}

.text-info {
  color: #909399 !important;
}

/* 为Element Plus组件添加一些全局样式覆盖 */
:root {
  --el-color-primary: #3b82f6;
  --el-color-primary-light-3: #60a5fa;
  --el-color-primary-light-5: #93c5fd;
  --el-color-primary-light-7: #bfdbfe;
  --el-color-primary-light-9: #ebf5ff;
  --el-color-primary-dark-2: #2563eb;
}

/* 定制对话框样式 */
.el-dialog {
  border-radius: 8px;
  overflow: hidden;
}

.el-dialog__header {
  margin: 0;
  padding: 16px 20px;
  background-color: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.el-dialog__title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.el-dialog__headerbtn {
  top: 16px;
  right: 20px;
}

.el-dialog__body {
  padding: 24px 0;
}

.el-dialog__footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  background-color: #f9fafb;
}

/* 定制表单样式 */
.el-form-item__label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.el-input__inner {
  height: 36px;
  line-height: 36px;
}

.el-input__wrapper {
  border-radius: 4px;
}

.el-button {
  font-weight: 500;
  border-radius: 4px;
}

.el-button--primary {
  background-color: var(--el-color-primary);
}

.el-button--primary:hover {
  background-color: var(--el-color-primary-dark-2);
}

/* 定制菜单样式 */
.el-menu-item {
  font-size: 14px;
}

.el-breadcrumb__item {
  font-size: 14px;
}

.el-dropdown-menu__item {
  font-size: 14px;
  padding: 8px 12px;
}

.el-dropdown-menu__item i {
  margin-right: 6px;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 3px;
}

::-webkit-scrollbar-track {
  background-color: #f3f4f6;
  border-radius: 3px;
}
</style>
