<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import GlobalDialogs from "./components/dialogs/index.vue";
// import emitter from "./utils/eventBus";
import { useProjectStore } from "./stores/useProjectStore";
// import {cleanupProjectStore, setupProjectStore} from "./stores/projectStore";
const projectStore = useProjectStore();
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
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
  color: #1f2937;
}

/* 标题规范 */
h1, h2, h3, h4, h5, h6 {
  margin: 0;
  font-family: inherit;
  font-weight: 600;
  line-height: 1.3;
  color: #111827;
}

h1 { font-size: 24px; }
h2 { font-size: 20px; }
h3 { font-size: 18px; }
h4 { font-size: 16px; }

/* 基础表单组件字体统一 */
button, input, select, textarea {
  font-family: inherit;
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

.el-dialog__title,
.el-message-box__title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.el-message-box__header {
  padding: 16px 20px;
  background-color: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.el-message-box__content {
  padding: 24px 20px;
  font-size: 14px;
  color: #374151;
}

.el-message-box__btns {
  padding: 12px 20px 16px;
  background-color: #f9fafb;
  border-top: 1px solid #e5e7eb;
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

/* ----------------------------------------------------------------------
   Custom Message Box Styles (Glassmorphism) - Global Override
   ---------------------------------------------------------------------- */
.qc-message-box.el-message-box {
  /* 重置变量 */
  --el-messagebox-title-color: #1f2937;
  --el-messagebox-content-color: #4b5563;
  --el-messagebox-border-radius: 20px;
  
  /* 核心样式覆盖 */
  width: 480px !important;
  max-width: 90vw !important;
  padding-bottom: 24px !important;
  border: 1px solid rgba(255, 255, 255, 0.8) !important;
  background: rgba(255, 255, 255, 0.9) !important;
  backdrop-filter: blur(24px) !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important;
  overflow: visible !important;
}

/* 头部：移除默认灰色背景和边框 */
.qc-message-box.el-message-box .el-message-box__header {
  padding: 24px 24px 12px !important;
  background: transparent !important;
  border-bottom: none !important;
}

.qc-message-box.el-message-box .el-message-box__title {
  font-size: 20px !important;
  font-weight: 700 !important;
}

.qc-message-box.el-message-box .el-message-box__headerbtn {
  top: 24px !important;
  right: 24px !important;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: background 0.2s;
}

.qc-message-box.el-message-box .el-message-box__headerbtn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.qc-message-box.el-message-box .el-message-box__headerbtn .el-message-box__close {
  color: #9ca3af !important;
}

.qc-message-box.el-message-box .el-message-box__headerbtn:hover .el-message-box__close {
  color: #1f2937 !important;
}

/* 内容区域 */
.qc-message-box.el-message-box .el-message-box__content {
  padding: 0 24px 24px !important;
  background: transparent !important;
  font-size: 15px !important;
}

/* 状态图标调整 */
.qc-message-box.el-message-box .el-message-box__status {
  top: -2px !important; /* 微调对齐 */
}

/* 底部按钮区：移除灰色背景和边框 */
.qc-message-box.el-message-box .el-message-box__btns {
  padding: 0 24px 0 !important;
  background: transparent !important;
  border-top: none !important;
  display: flex;
  justify-content: flex-end;
  gap: 12px; 
}

/* 按钮通用样式 */
.qc-message-box.el-message-box .el-button {
  margin-left: 0 !important; /* 覆盖默认 margin */
  height: 38px !important;
  padding: 0 20px !important;
  border-radius: 10px !important;
  font-weight: 600 !important;
}

/* 取消按钮 */
.qc-message-box.el-message-box .el-button:not(.el-button--primary) {
  background: transparent !important;
  border: 1px solid rgba(156, 163, 175, 0.3) !important;
  color: #4b5563 !important;
}

.qc-message-box.el-message-box .el-button:not(.el-button--primary):hover {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(156, 163, 175, 0.5) !important;
  color: #1f2937 !important;
}

/* 确认按钮 */
.qc-message-box.el-message-box .el-button--primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25) !important;
}

.qc-message-box.el-message-box .el-button--primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35) !important;
  opacity: 0.95;
}

.qc-message-box--outlier-filter.el-message-box {
  max-width: 600px !important;
}
</style>
