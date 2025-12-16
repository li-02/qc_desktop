<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Setting, Clock } from '@element-plus/icons-vue';
import { useSettingsStore, TIMEZONE_OPTIONS } from '@/stores/useSettingsStore';

const settingsStore = useSettingsStore();

// 对话框状态
const dialogVisible = ref(false);
const saving = ref(false);

// 表单数据（本地副本，保存时才提交）
const formData = ref({
  timezone: 'UTC+8',
});

// 当前时区的显示标签
const currentTimezoneLabel = computed(() => {
  return settingsStore.getTimezoneLabel(formData.value.timezone);
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
  dialogVisible.value = false;
};

// 保存设置
const handleSave = async () => {
  try {
    saving.value = true;
    
    const success = await settingsStore.setTimezone(formData.value.timezone);
    
    if (success) {
      ElMessage.success('设置保存成功');
      close();
    } else {
      ElMessage.error('设置保存失败');
    }
  } catch (error) {
    console.error('保存设置失败:', error);
    ElMessage.error('设置保存失败');
  } finally {
    saving.value = false;
  }
};

// 重置为默认值
const handleReset = () => {
  formData.value.timezone = 'UTC+8';
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
    title="系统设置"
    width="500px"
    :close-on-click-modal="false"
    class="settings-dialog"
  >
    <div class="settings-content">
      <!-- 时区设置 -->
      <div class="settings-section">
        <div class="section-header">
          <div class="section-icon">
            <el-icon><Clock /></el-icon>
          </div>
          <div class="section-title">
            <h3>时区设置</h3>
            <p>设置数据时间的解析时区，影响时间序列图表的显示</p>
          </div>
        </div>
        
        <div class="section-body">
          <el-form-item label="数据时区">
            <el-select
              v-model="formData.timezone"
              placeholder="选择时区"
              style="width: 100%"
              filterable
            >
              <el-option
                v-for="option in TIMEZONE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
          
          <div class="timezone-hint">
            <el-icon><Setting /></el-icon>
            <span>当前选择: {{ currentTimezoneLabel }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleReset" :disabled="saving">
          恢复默认
        </el-button>
        <el-button @click="close" :disabled="saving">
          取消
        </el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">
          保存设置
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.settings-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid rgba(229, 231, 235, 0.6);
  padding-bottom: 16px;
}

.settings-dialog :deep(.el-dialog__body) {
  padding: 24px;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-section {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.9) 100%);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-section:hover {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.section-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}

.section-title h3 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.section-title p {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.4;
}

.section-body {
  padding-left: 52px;
}

.section-body :deep(.el-form-item) {
  margin-bottom: 12px;
}

.section-body :deep(.el-form-item__label) {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
}

.timezone-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(16, 185, 129, 0.08);
  border-radius: 8px;
  font-size: 13px;
  color: #059669;
}

.timezone-hint .el-icon {
  font-size: 14px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.dialog-footer .el-button {
  min-width: 80px;
}

.dialog-footer .el-button--primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
}

.dialog-footer .el-button--primary:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
}
</style>
