<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { Setting, Clock } from "@element-plus/icons-vue";
import { useSettingsStore, TIMEZONE_OPTIONS } from "@/stores/useSettingsStore";

const settingsStore = useSettingsStore();

// 对话框状态
const dialogVisible = ref(false);
const saving = ref(false);

// 表单数据（本地副本，保存时才提交）
const formData = ref({
  timezone: "UTC+8",
});

// 当前时区的显示标签
const currentTimezoneLabel = computed(() => {
  return settingsStore.getTimezoneLabel(formData.value.timezone);
});

// 是否有未保存的变更
const hasChanges = computed(() => {
  return formData.value.timezone !== settingsStore.timezone;
});

// 提交前置条件
const canSave = computed(() => {
  return !saving.value && hasChanges.value;
});

// 打开对话框
const open = async () => {
  // 加载当前设置
  await settingsStore.initSettings();
  formData.value.timezone = settingsStore.timezone;
  dialogVisible.value = true;
};

// 关闭对话框
const close = () => {
  if (saving.value) return;
  dialogVisible.value = false;
};

// 保存设置
const handleSave = async () => {
  if (!canSave.value) return;
  try {
    saving.value = true;

    const success = await settingsStore.setTimezone(formData.value.timezone);

    if (success) {
      ElMessage.success("设置保存成功");
      close();
    } else {
      ElMessage.error("设置保存失败");
    }
  } catch (error) {
    console.error("保存设置失败:", error);
    ElMessage.error("设置保存失败");
  } finally {
    saving.value = false;
  }
};

// 重置为默认值
const handleReset = () => {
  formData.value.timezone = "UTC+8";
};

// 导出方法给父组件
defineExpose({
  open,
  close,
});
</script>

<template>
  <div>
    <el-dialog
      v-model="dialogVisible"
      width="500px"
      class="settings-dialog"
      :close-on-click-modal="!saving"
      :close-on-press-escape="!saving"
      align-center>
      <template #header>
        <div class="dialog-header">
          <div class="dialog-header-icon">
            <el-icon><Setting /></el-icon>
          </div>
          <div class="dialog-header-text">
            <div class="dialog-title">系统设置</div>
            <div class="dialog-subtitle">配置应用全局参数</div>
          </div>
        </div>
      </template>

      <div class="settings-body">
        <!-- 时区设置卡片 -->
        <div class="settings-card">
          <div class="card-header">
            <div class="card-icon">
              <el-icon><Clock /></el-icon>
            </div>
            <div class="card-title">
              <span class="card-label">时区设置</span>
              <span class="card-desc">设置数据时间的解析时区，影响时间序列图表的显示</span>
            </div>
          </div>

          <div class="card-body">
            <el-form-item label="数据时区">
              <el-select v-model="formData.timezone" placeholder="选择时区" style="width: 100%" filterable>
                <el-option
                  v-for="option in TIMEZONE_OPTIONS"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" />
              </el-select>
            </el-form-item>

            <div class="timezone-hint">
              <el-icon><Clock /></el-icon>
              <span>当前选择: {{ currentTimezoneLabel }}</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="handleReset" :disabled="saving" class="reset-btn">恢复默认</el-button>
          <el-button @click="close" :disabled="saving" class="cancel-btn">取消</el-button>
          <el-button @click="handleSave" :loading="saving" :disabled="!canSave" class="submit-btn">保存设置</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style>
.settings-dialog {
  --dlg-surface: #f8fafc;
  --dlg-surface-elevated: #ffffff;
  --dlg-border: #e2e8f0;
  --dlg-text: #1e293b;
  --dlg-muted: #64748b;
  --dlg-accent: #10b981;
  border-radius: 12px !important;
  overflow: hidden;
  border: 1px solid var(--dlg-border);
  background: var(--dlg-surface-elevated) !important;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18) !important;
  padding: 0 !important;
}

.settings-dialog .el-dialog__header {
  margin-right: 0;
  padding: 0;
  border-bottom: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
}

.settings-dialog .dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
}

.settings-dialog .dialog-header-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #a7f3d0;
  background: #d1fae5;
  color: #047857;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-dialog .dialog-header-text {
  min-width: 0;
}

.settings-dialog .dialog-title {
  color: var(--dlg-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.settings-dialog .dialog-subtitle {
  margin-top: 2px;
  color: var(--dlg-muted);
  font-size: 12px;
}

.settings-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}

.settings-dialog .el-dialog__body {
  padding: 14px 20px 8px !important;
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 设置卡片 */
.settings-dialog .settings-card {
  border: 1px solid var(--dlg-border);
  border-radius: 10px;
  background: var(--dlg-surface-elevated);
  padding: 16px;
}

.settings-dialog .card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.settings-dialog .card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #a7f3d0;
  background: #d1fae5;
  color: #047857;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-dialog .card-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.settings-dialog .card-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--dlg-text);
  line-height: 1.3;
}

.settings-dialog .card-desc {
  font-size: 12px;
  color: var(--dlg-muted);
  line-height: 1.4;
}

.settings-dialog .card-body {
  padding-left: 42px;
}

/* 表单项 */
.settings-dialog .el-form-item {
  margin-bottom: 12px;
}

.settings-dialog .el-form-item__label {
  color: #334155;
  font-weight: 600;
  font-size: 13px;
}

/* Select 输入框 */
.settings-dialog .el-select .el-input__wrapper {
  box-shadow: 0 0 0 1px #e2e8f0 inset !important;
  background: #ffffff !important;
  border-radius: 8px;
}

.settings-dialog .el-select .el-input__wrapper:hover {
  box-shadow: 0 0 0 1px #cbd5e1 inset !important;
}

.settings-dialog .el-select .el-input.is-focus .el-input__wrapper {
  box-shadow: 0 0 0 1px var(--dlg-accent) inset !important;
}

/* 时区提示 */
.settings-dialog .timezone-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
  border-radius: 8px;
  font-size: 12px;
  color: var(--dlg-muted);
  line-height: 1.4;
}

.settings-dialog .timezone-hint .el-icon {
  font-size: 13px;
  color: var(--dlg-accent);
}

/* Footer */
.settings-dialog .el-dialog__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--dlg-border);
  background-color: var(--dlg-surface);
}

.settings-dialog .dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.settings-dialog .dialog-footer .el-button {
  height: 36px;
  min-width: 110px;
  padding: 0 20px;
  border-radius: 8px;
  font-weight: 600;
}

.settings-dialog .cancel-btn,
.settings-dialog .reset-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
}

.settings-dialog .cancel-btn:hover,
.settings-dialog .reset-btn:hover {
  border-color: #a7f3d0;
  color: #059669;
  background: #ecfdf5;
}

.settings-dialog .submit-btn {
  background: #10b981 !important;
  border: 1px solid #10b981 !important;
  color: #ffffff !important;
  transition: all 0.2s;
}

.settings-dialog .submit-btn:hover {
  background: #059669 !important;
  border-color: #059669 !important;
}

.settings-dialog .el-button.is-disabled.submit-btn {
  background: #9ca3af !important;
  border-color: #9ca3af !important;
  color: #ffffff !important;
}
</style>
