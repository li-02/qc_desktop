<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import GlobalDialogs from "./components/dialogs/index.vue";
import GlobalTooltip from "./components/GlobalTooltip.vue";
import { useCategoryStore } from "./stores/useCategoryStore";
const categoryStore = useCategoryStore();
onMounted(() => {
  categoryStore.loadCategories();
});

onUnmounted(() => {});
</script>

<template>
  <router-view />
  <GlobalDialogs />
  <GlobalTooltip />
</template>

<style>
/* ============================================================
   App.vue — Element Plus 全局组件覆盖
   所有色彩/间距令牌均来自 design-system.css（已在 style.css 中引入）
   ============================================================ */

/* --- 基础 --- */
body {
  margin: 0;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
  color: var(--c-text-base);
  background: var(--c-bg-app);
}

/* --- 语义文字辅助类 --- */
.text-danger {
  color: var(--c-danger-text) !important;
}
.text-success {
  color: var(--c-success-text) !important;
}
.text-warning {
  color: var(--c-warning-text) !important;
}
.text-info {
  color: var(--c-info-text) !important;
}

/* ============================================================
   Element Plus — 对话框 (Dialog)
   ============================================================ */
.el-dialog {
  border-radius: var(--dialog-radius) !important;
  overflow: hidden;
  box-shadow: var(--dialog-shadow) !important;
  border: 1px solid var(--dialog-border) !important;
}

.el-dialog__header {
  margin: 0;
  padding: var(--dialog-header-padding);
  background-color: var(--dialog-header-bg);
  border-bottom: 1px solid var(--dialog-header-border);
}

.el-dialog__title {
  font-size: var(--dialog-header-font);
  font-weight: var(--dialog-header-weight);
  color: var(--c-text-primary);
}

.el-dialog__headerbtn {
  top: 18px;
  right: 20px;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  transition: var(--transition-colors);
}

.el-dialog__headerbtn:hover {
  background: var(--c-bg-subtle);
}

.el-dialog__headerbtn .el-dialog__close {
  color: var(--c-text-muted);
  font-size: var(--text-md);
}

.el-dialog__headerbtn:hover .el-dialog__close {
  color: var(--c-text-base);
}

.el-dialog__body {
  padding: var(--dialog-body-padding);
  color: var(--c-text-base);
}

.el-dialog__footer {
  padding: var(--dialog-footer-padding);
  border-top: 1px solid var(--dialog-footer-border);
  background-color: var(--dialog-footer-bg);
  display: flex;
  justify-content: flex-end;
  gap: var(--dialog-footer-gap);
}

/* ============================================================
   Element Plus — MessageBox
   ============================================================ */
.el-message-box {
  border-radius: var(--radius-overlay) !important;
  border: 1px solid var(--c-border-subtle) !important;
  box-shadow: var(--shadow-2xl) !important;
}

.el-message-box__header {
  padding: var(--space-5) var(--space-6) var(--space-3);
  background-color: var(--c-bg-muted);
  border-bottom: 1px solid var(--c-border-subtle);
}

.el-message-box__title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
}

.el-message-box__content {
  padding: var(--space-5) var(--space-6);
  font-size: var(--text-md);
  color: var(--c-text-secondary);
}

.el-message-box__btns {
  padding: var(--space-3) var(--space-6) var(--space-5);
  background-color: var(--c-bg-muted);
  border-top: 1px solid var(--c-border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

/* ============================================================
   Element Plus — 按钮 (Button)
   ============================================================ */
.el-button {
  font-weight: var(--btn-font-weight);
  border-radius: var(--btn-radius);
  font-size: var(--btn-font-md);
  height: var(--btn-height-md);
  transition:
    var(--transition-colors),
    var(--transition-shadow),
    transform var(--duration-base) var(--ease-inout);
}

.el-button--small {
  height: var(--btn-height-sm);
  font-size: var(--btn-font-sm);
  border-radius: var(--radius-sm);
}

.el-button--large {
  height: var(--btn-height-lg);
  font-size: var(--btn-font-lg);
}

.el-button--primary {
  background-color: var(--c-brand);
  border-color: var(--c-brand);
  box-shadow: var(--shadow-brand-sm);
}

.el-button--primary:hover,
.el-button--primary:focus {
  background-color: var(--c-brand-hover);
  border-color: var(--c-brand-hover);
  box-shadow: var(--shadow-brand-md);
  transform: translateY(-1px);
}

.el-button--primary:active {
  transform: translateY(0);
}

.el-button--danger {
  background-color: var(--c-danger);
  border-color: var(--c-danger);
}

.el-button--danger:hover {
  background-color: var(--c-danger-hover);
  border-color: var(--c-danger-hover);
  transform: translateY(-1px);
}

/* ============================================================
   Element Plus — 输入框 (Input)
   ============================================================ */
.el-input__wrapper {
  border-radius: var(--input-radius);
  box-shadow: 0 0 0 1px var(--input-border) inset;
  transition: var(--transition-colors);
}

.el-input__wrapper:hover {
  box-shadow: 0 0 0 1px var(--color-neutral-400) inset;
}

.el-input__wrapper.is-focus {
  box-shadow:
    0 0 0 1px var(--input-border-focus) inset,
    var(--input-focus-ring);
}

.el-input__inner {
  color: var(--input-text);
  font-size: var(--input-font);
}

.el-input__inner::placeholder {
  color: var(--input-placeholder);
}

/* ============================================================
   Element Plus — 选择器 (Select)
   ============================================================ */
.el-select .el-input__wrapper.is-focus {
  box-shadow:
    0 0 0 1px var(--input-border-focus) inset,
    var(--input-focus-ring);
}

/* ============================================================
   Element Plus — 表单 (Form)
   ============================================================ */
.el-form-item__label {
  font-size: var(--form-label-font);
  font-weight: var(--form-label-weight);
  color: var(--form-label-color);
}

.el-form-item__error {
  font-size: var(--text-xs);
  color: var(--c-danger-text);
}

/* ============================================================
   Element Plus — 表格 (Table)
   ============================================================ */
.el-table {
  border-radius: var(--table-radius);
  border: 1px solid var(--table-border);
  overflow: hidden;
  font-size: var(--table-row-font);
  color: var(--table-row-color);
}

.el-table th.el-table__cell {
  background-color: var(--table-header-bg);
  color: var(--table-header-text);
  font-size: var(--table-header-font);
  font-weight: var(--table-header-weight);
  height: var(--table-header-height);
  border-bottom: 1px solid var(--table-border);
}

.el-table td.el-table__cell {
  height: var(--table-row-height);
  border-bottom: 1px solid var(--c-border-subtle);
  padding: var(--table-cell-padding);
}

.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell {
  background-color: var(--table-row-stripe-bg);
}

.el-table__body tr:hover td.el-table__cell {
  background-color: var(--table-row-hover-bg) !important;
}

/* ============================================================
   Element Plus — 标签 (Tag)
   ============================================================ */
.el-tag {
  height: var(--tag-height-md);
  padding: var(--tag-padding-md);
  font-size: var(--tag-font-md);
  font-weight: var(--tag-font-weight);
  border-radius: var(--tag-radius);
}

.el-tag--small {
  height: var(--tag-height-sm);
  padding: var(--tag-padding-sm);
  font-size: var(--tag-font-sm);
}

.el-tag--large {
  height: var(--tag-height-lg);
  padding: var(--tag-padding-lg);
  font-size: var(--tag-font-lg);
}

/* ============================================================
   Element Plus — 菜单 (Menu / Dropdown)
   ============================================================ */
.el-menu-item {
  font-size: var(--text-base);
  height: var(--sb-item-height);
  line-height: var(--sb-item-height);
}

.el-dropdown-menu__item {
  font-size: var(--text-base);
  padding: var(--space-2) var(--space-3);
  color: var(--c-text-base);
  transition: var(--transition-colors);
}

.el-dropdown-menu__item:hover {
  background-color: var(--c-brand-soft);
  color: var(--c-brand);
}

.el-dropdown-menu__item i {
  margin-right: var(--space-1-5);
}

/* ============================================================
   Element Plus — 面包屑 (Breadcrumb)
   ============================================================ */
.el-breadcrumb__item {
  font-size: var(--text-base);
}

.el-breadcrumb__inner {
  color: var(--c-text-secondary);
}

.el-breadcrumb__inner.is-link:hover {
  color: var(--c-brand);
}

/* ============================================================
   Element Plus — 分页 (Pagination)
   ============================================================ */
.el-pagination {
  font-size: var(--text-base);
  color: var(--c-text-secondary);
}

.el-pagination .el-pager li {
  border-radius: var(--radius-control);
  font-size: var(--text-base);
}

.el-pagination .el-pager li.is-active {
  background-color: var(--c-brand);
}

/* ============================================================
   Element Plus — 步骤条 (Steps)
   ============================================================ */
.el-step__title {
  font-size: var(--text-base);
  font-weight: var(--font-medium);
}

.el-step__description {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
}

/* ============================================================
   Element Plus — 提示 (Tooltip / Popover)
   ============================================================ */
.el-tooltip__popper {
  font-size: var(--text-sm);
  border: 1px solid var(--c-border-strong) !important;
  border-radius: var(--radius-control) !important;
  background: var(--c-bg-elevated) !important;
  box-shadow: var(--shadow-lg) !important;
  color: var(--c-text-base) !important;
}

.el-popper.el-tooltip__popper > .el-popper__arrow {
  display: none !important;
}

.el-popover {
  border-radius: var(--radius-overlay) !important;
  border: 1px solid var(--c-border) !important;
  box-shadow: var(--shadow-lg) !important;
}

/* ============================================================
   Element Plus — 通知 (Message / Notification)
   ============================================================ */
.el-message {
  border-radius: var(--radius-overlay);
  font-size: var(--text-base);
  box-shadow: var(--shadow-lg);
}

.el-notification {
  border-radius: var(--radius-overlay);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--c-border);
}

/* ============================================================
   Glassmorphism MessageBox（qc-message-box 专属）
   ============================================================ */
.qc-message-box.el-message-box {
  --el-messagebox-title-color: var(--c-text-primary);
  --el-messagebox-content-color: var(--c-text-secondary);
  --el-messagebox-border-radius: var(--radius-3xl);

  width: 480px !important;
  max-width: 90vw !important;
  padding-bottom: var(--space-6) !important;
  border: 1px solid rgba(255, 255, 255, 0.8) !important;
  background: rgba(255, 255, 255, 0.92) !important;
  backdrop-filter: blur(24px) !important;
  box-shadow: var(--shadow-2xl) !important;
  overflow: visible !important;
}

.qc-message-box.el-message-box .el-message-box__header {
  padding: var(--space-6) var(--space-6) var(--space-3) !important;
  background: transparent !important;
  border-bottom: none !important;
}

.qc-message-box.el-message-box .el-message-box__title {
  font-size: var(--text-2xl) !important;
  font-weight: var(--font-bold) !important;
}

.qc-message-box.el-message-box .el-message-box__headerbtn {
  top: var(--space-6) !important;
  right: var(--space-6) !important;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  transition: var(--transition-colors);
}

.qc-message-box.el-message-box .el-message-box__headerbtn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.qc-message-box.el-message-box .el-message-box__headerbtn .el-message-box__close {
  color: var(--c-text-muted) !important;
}

.qc-message-box.el-message-box .el-message-box__headerbtn:hover .el-message-box__close {
  color: var(--c-text-base) !important;
}

.qc-message-box.el-message-box .el-message-box__content {
  padding: 0 var(--space-6) var(--space-6) !important;
  background: transparent !important;
  font-size: var(--text-md) !important;
}

.qc-message-box.el-message-box .el-message-box__btns {
  padding: 0 var(--space-6) !important;
  background: transparent !important;
  border-top: none !important;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.qc-message-box.el-message-box .el-button {
  margin-left: 0 !important;
  height: var(--btn-height-lg) !important;
  padding: var(--btn-padding-lg) !important;
  border-radius: var(--radius-control) !important;
  font-weight: var(--font-semibold) !important;
}

.qc-message-box.el-message-box .el-button:not(.el-button--primary) {
  background: transparent !important;
  border: 1px solid var(--c-border-strong) !important;
  color: var(--c-text-secondary) !important;
}

.qc-message-box.el-message-box .el-button:not(.el-button--primary):hover {
  background: var(--c-bg-subtle) !important;
  border-color: var(--c-border-strong) !important;
  color: var(--c-text-base) !important;
}

.qc-message-box.el-message-box .el-button--primary {
  background: linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%) !important;
  border: none !important;
  color: var(--c-text-inverse) !important;
  box-shadow: var(--shadow-brand-sm) !important;
}

.qc-message-box.el-message-box .el-button--primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-brand-md) !important;
}

.qc-message-box--outlier-filter.el-message-box {
  max-width: 600px !important;
}
</style>
