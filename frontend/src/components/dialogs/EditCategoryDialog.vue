<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useCategoryStore } from "@/stores/useCategoryStore";

const categoryStore = useCategoryStore();
const dialogVisible = ref(false);
const categoryId = ref("");
const categoryName = ref("");
const initialCategoryName = ref("");
const nameCheckStatus = ref({ checking: false, valid: true, message: "" });
let nameCheckTimer: ReturnType<typeof setTimeout> | null = null;
let nameCheckReqId = 0;

const isNameChanged = computed(() => categoryName.value.trim() !== initialCategoryName.value);

const showNameStatus = computed(() => 
  (Boolean(categoryName.value?.trim()) && isNameChanged.value) || nameCheckStatus.value.checking
);

const nameStatusType = computed(() => {
  if (nameCheckStatus.value.checking) return "checking";
  return nameCheckStatus.value.valid ? "success" : "error";
});

const nameStatusText = computed(() => {
  if (nameCheckStatus.value.checking) return "正在检查名称可用性...";
  return nameCheckStatus.value.valid ? "名称可用" : nameCheckStatus.value.message || "名称不可用";
});

const canSubmit = computed(() => {
  return !categoryStore.loading && 
         !nameCheckStatus.value.checking && 
         (nameCheckStatus.value.valid || !isNameChanged.value) && 
         Boolean(categoryName.value.trim()) &&
         isNameChanged.value;
});

const open = (id: string, name: string) => { 
  categoryId.value = id;
  categoryName.value = name;
  initialCategoryName.value = name;
  dialogVisible.value = true; 
};
const close = () => { dialogVisible.value = false; };

const handleClosed = () => {
  if (nameCheckTimer) { clearTimeout(nameCheckTimer); nameCheckTimer = null; }
  nameCheckReqId += 1;
  categoryId.value = "";
  categoryName.value = "";
  initialCategoryName.value = "";
  nameCheckStatus.value = { checking: false, valid: true, message: "" };
  categoryStore.loading = false;
};

const handleSubmit = async () => {
  if (!canSubmit.value) return;
  try {
    const { success, error } = await categoryStore.updateCategory(categoryId.value, { name: categoryName.value.trim() });
    if (success) {
      ElMessage.success("分类名称更新成功");
      close();
    } else {
      ElMessage.error(`分类更新失败: ${error}`);
    }
  } catch (e) {
    console.error("update category failed", e);
    ElMessage.error("分类更新失败，请稍后重试");
  }
};

watch(
  () => categoryName.value,
  newName => {
    const name = newName?.trim() || "";
    if (nameCheckTimer) { clearTimeout(nameCheckTimer); nameCheckTimer = null; }
    
    // 如果名称没有真正的改变（如恢复初始值或者为空），则无需额外检查重名
    if (!name || name === initialCategoryName.value) {
      nameCheckStatus.value = { checking: false, valid: true, message: "" };
      return;
    }

    const reqId = ++nameCheckReqId;
    nameCheckStatus.value = { checking: true, valid: false, message: "" };
    nameCheckTimer = setTimeout(async () => {
      try {
        const result = await categoryStore.checkCategoryName(name);
        if (reqId !== nameCheckReqId) return;
        if (result.success) {
          nameCheckStatus.value.valid = !!result.data;
          nameCheckStatus.value.message = result.data ? "" : "分类名称已存在";
        } else {
          nameCheckStatus.value.valid = false;
          nameCheckStatus.value.message = "检查名称失败";
        }
      } catch {
        if (reqId !== nameCheckReqId) return;
        nameCheckStatus.value.valid = false;
        nameCheckStatus.value.message = "检查名称时出错";
      } finally {
        if (reqId === nameCheckReqId) nameCheckStatus.value.checking = false;
      }
    }, 280);
  }
);

onUnmounted(() => {
  if (nameCheckTimer) clearTimeout(nameCheckTimer);
  nameCheckReqId += 1;
});

defineExpose({ open, close });
</script>

<template>
  <div>
    <el-dialog v-model="dialogVisible" width="420px" class="create-category-dialog" @closed="handleClosed" align-center>
      <template #header>
        <div class="dialog-header">
          <div class="dialog-header-icon edit-icon">编</div>
          <div class="dialog-header-text">
            <div class="dialog-title">编辑分类</div>
            <div class="dialog-subtitle">修改分类的名称</div>
          </div>
        </div>
      </template>

      <div class="dialog-body">
        <div class="input-label">分类名称</div>
        <el-input
          v-model="categoryName"
          placeholder="请输入各类名称"
          clearable
          size="large"
          class="name-input"
          :maxlength="50"
          show-word-limit
          @keyup.enter="handleSubmit" />

        <div v-if="showNameStatus" class="name-status" :class="[`is-${nameStatusType}`]">
          {{ nameStatusText }}
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="close" class="cancel-btn">取消</el-button>
          <el-button
            @click="handleSubmit"
            :loading="categoryStore.loading"
            :disabled="!canSubmit"
            class="submit-btn">
            确定
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style>
/* 重用 CreateCategoryDialog 中的全局样式 */
.create-category-dialog {
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

.create-category-dialog .el-dialog__header {
  margin-right: 0;
  padding: 0;
  border-bottom: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
}

.create-category-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}

.create-category-dialog .el-dialog__body {
  padding: 18px 20px 8px !important;
}

.create-category-dialog .el-dialog__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--dlg-border);
  background-color: var(--dlg-surface);
}
</style>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
}

.dialog-header-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-header-text { min-width: 0; }

.dialog-title {
  color: var(--dlg-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.dialog-subtitle {
  margin-top: 2px;
  color: var(--dlg-muted);
  font-size: 12px;
}

.dialog-body { display: flex; flex-direction: column; }

.input-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.name-input :deep(.el-input__wrapper) {
  border-radius: 8px;
  box-shadow: 0 0 0 1px #e2e8f0 inset;
}
.name-input :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px #cbd5e1 inset; }
.name-input :deep(.el-input.is-focus .el-input__wrapper) { box-shadow: 0 0 0 1px #10b981 inset !important; }

.name-status {
  margin-top: 10px;
  border-radius: 8px;
  border: 1px solid var(--dlg-border);
  background: #ffffff;
  padding: 7px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--dlg-muted);
}
.name-status.is-success { border-color: #bbf7d0; background: #f8fffb; color: #047857; }
.name-status.is-error { border-color: #fecaca; background: #fff7f7; color: #b91c1c; }
.name-status.is-checking { border-color: #bfdbfe; background: #f8fbff; color: #1d4ed8; }

.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; }

.dialog-footer .el-button {
  height: 36px;
  min-width: 100px;
  padding: 0 20px;
  border-radius: 8px;
  font-weight: 600;
}

.cancel-btn { border: 1px solid #cbd5e1; background: #ffffff; color: #334155; }
.cancel-btn:hover { border-color: #a7f3d0; color: #059669; background: #ecfdf5; }

.submit-btn {
  background: #10b981 !important;
  border: 1px solid #10b981 !important;
  color: #ffffff !important;
  transition: all 0.2s;
}
.submit-btn:hover { background: #059669 !important; border-color: #059669 !important; }
.submit-btn.is-disabled { background: #9ca3af !important; border-color: #9ca3af !important; }
</style>
