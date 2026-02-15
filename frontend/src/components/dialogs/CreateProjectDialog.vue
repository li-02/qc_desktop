<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import "plus-pro-components/es/components/form/style/css";
import { type FieldValues, type PlusColumn, PlusForm, type PlusFormInstance } from "plus-pro-components";
import { ElMessage } from "element-plus";
import { useProjectStore } from "@/stores/useProjectStore";

interface ProjectInfo {
  siteName: string;
  longitude: string;
  latitude: string;
  altitude: string;
}
const projectStore = useProjectStore();
const formRef = ref<PlusFormInstance | null>(null);
const dialogVisible = ref(false); // 是否显示对话框
const projectInfo = ref<ProjectInfo>({
  // 项目信息form
  siteName: "",
  longitude: "",
  latitude: "",
  altitude: "",
});
const nameCheckStatus = ref({
  // 站点名称检查状态
  checking: false,
  valid: true,
  message: "",
});
let nameCheckTimer: ReturnType<typeof setTimeout> | null = null;
let nameCheckReqId = 0;

const parseStrictNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
};

const showNameStatus = computed(() => Boolean(projectInfo.value.siteName?.trim()) || nameCheckStatus.value.checking);
const nameStatusType = computed(() => {
  if (nameCheckStatus.value.checking) return "checking";
  return nameCheckStatus.value.valid ? "success" : "error";
});
const nameStatusText = computed(() => {
  if (nameCheckStatus.value.checking) return "正在检查站点名称可用性...";
  return nameCheckStatus.value.valid ? "站点名称可用" : nameCheckStatus.value.message || "站点名称不可用";
});
const longitudeIsValid = computed(() => {
  const lon = parseStrictNumber(projectInfo.value.longitude);
  return lon !== null && lon >= -180 && lon <= 180;
});
const latitudeIsValid = computed(() => {
  const lat = parseStrictNumber(projectInfo.value.latitude);
  return lat !== null && lat >= -90 && lat <= 90;
});
const altitudeIsValid = computed(() => {
  const altitude = parseStrictNumber(projectInfo.value.altitude);
  return altitude !== null && altitude >= -431 && altitude <= 8848.86;
});

const canSubmit = computed(() => {
  if (projectStore.loading || nameCheckStatus.value.checking || !nameCheckStatus.value.valid) return false;
  const { siteName } = projectInfo.value;
  return Boolean(siteName.trim() && longitudeIsValid.value && latitudeIsValid.value && altitudeIsValid.value);
});
// plusColumns 配置
const columns: PlusColumn[] = [
  {
    label: "站点名称",
    width: 120,
    prop: "siteName",
    valueType: "input",
    fieldProps: {
      placeholder: "请输入站点名称",
    },
  },
  {
    label: "经度",
    width: 120,
    prop: "longitude",
    valueType: "input",
    colProps: {
      span: 24,
    },
    fieldSlots: {
      append: () => "°",
    },
    fieldProps: {
      type: "text",
      inputmode: "decimal",
      placeholder: "请输入经度 (例如: 116.40)",
    },
  },
  {
    label: "纬度",
    width: 120,
    prop: "latitude",
    valueType: "input",
    colProps: {
      span: 24,
    },
    fieldSlots: {
      append: () => "°",
    },
    fieldProps: {
      type: "text",
      inputmode: "decimal",
      placeholder: "请输入纬度 (例如: 39.90)",
    },
  },
  {
    label: "高度",
    width: 120,
    prop: "altitude",
    valueType: "input",
    colProps: {
      span: 24,
    },
    fieldSlots: {
      append: () => "m",
    },
    fieldProps: {
      type: "text",
      inputmode: "decimal",
      placeholder: "请输入海拔高度",
    },
  },
];
// 组件dialog控制方法
const open = () => {
  dialogVisible.value = true;
};
const close = () => {
  dialogVisible.value = false;
};
const handleClosed = () => {
  if (nameCheckTimer) {
    clearTimeout(nameCheckTimer);
    nameCheckTimer = null;
  }
  nameCheckReqId += 1;
  projectInfo.value = {
    siteName: "",
    longitude: "",
    latitude: "",
    altitude: "",
  };
  nameCheckStatus.value = { checking: false, valid: true, message: "" };
  projectStore.loading = false;
};
const handleSubmit = async (values: FieldValues) => {
  const payload = values as unknown as ProjectInfo;

  if (nameCheckStatus.value.checking || !nameCheckStatus.value.valid) {
    ElMessage.error(nameCheckStatus.value.checking ? "正在检查站点名称，请稍后" : nameCheckStatus.value.message);
    return;
  }

  try {
    const { success, error } = await projectStore.createProject({
      name: payload.siteName.trim(),
      siteInfo: {
        longitude: payload.longitude.trim(),
        latitude: payload.latitude.trim(),
        altitude: payload.altitude.trim(),
      },
    });
    if (success) {
      ElMessage.success("站点创建成功");
      // emitter.emit("refresh-projects");
      close();
    } else {
      ElMessage.error(`站点创建失败: ${error}`);
    }
  } catch (e) {
    console.error("create project failed", e);
    ElMessage.error("站点创建失败，请稍后重试");
  }
};
const handleSubmitError = () => {
  projectStore.loading = false;
};
const handleConfirmClick = async () => {
  if (nameCheckStatus.value.checking) {
    ElMessage.warning("正在检查站点名称，请稍后");
    return;
  }
  if (!canSubmit.value) return;
  await formRef.value?.handleSubmit();
};
const handleReset = () => {
  formRef.value?.handleReset();
  projectInfo.value = {
    siteName: "",
    longitude: "",
    latitude: "",
    altitude: "",
  };
  nameCheckStatus.value = { checking: false, valid: true, message: "" };
};
// 监听siteName
watch(
  () => projectInfo.value.siteName,
  newName => {
    const siteName = newName?.trim() || "";

    if (nameCheckTimer) {
      clearTimeout(nameCheckTimer);
      nameCheckTimer = null;
    }

    if (!siteName) {
      nameCheckStatus.value = { checking: false, valid: false, message: "" };
      return;
    }

    const reqId = ++nameCheckReqId;
    nameCheckStatus.value = { checking: true, valid: false, message: "" };

    nameCheckTimer = setTimeout(async () => {
      try {
        const result = await projectStore.checkProjectName(siteName);
        if (reqId !== nameCheckReqId) return;

        if (result.success) {
          nameCheckStatus.value.valid = !!result.data;
          nameCheckStatus.value.message = result.data ? "" : "站点名称已存在";
        } else {
          nameCheckStatus.value.valid = false;
          nameCheckStatus.value.message = "检查站点名称失败";
        }
      } catch (err) {
        if (reqId !== nameCheckReqId) return;
        console.error("Check project name error:", err);
        nameCheckStatus.value.valid = false;
        nameCheckStatus.value.message = "检查站点名称时出错";
      } finally {
        if (reqId === nameCheckReqId) {
          nameCheckStatus.value.checking = false;
        }
      }
    }, 280);
  }
);

// 自定义验证器
const validateSiteName = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  void _rule;
  if (!value) {
    callback(new Error("请输入站点名称"));
    return;
  }
  if (nameCheckStatus.value.checking) {
    callback(new Error("正在检查站点名称"));
    return;
  }
  if (!nameCheckStatus.value.valid) {
    callback(new Error(nameCheckStatus.value.message));
    return;
  }
  callback();
};
// 验证经度
const validateLongitude = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  void _rule;
  if (!value || !value.trim()) {
    callback(new Error("请输入经度"));
    return;
  }
  const lon = parseStrictNumber(value || "");
  if (lon === null) {
    callback(new Error("经度必须是合法数字"));
    return;
  }

  if (lon < -180 || lon > 180) {
    callback(new Error("经度范围应在 -180 到 180 之间"));
    return;
  }

  callback();
};

// 验证纬度
const validateLatitude = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  void _rule;
  if (!value || !value.trim()) {
    callback(new Error("请输入纬度"));
    return;
  }
  const lat = parseStrictNumber(value || "");
  if (lat === null) {
    callback(new Error("纬度必须是合法数字"));
    return;
  }

  if (lat < -90 || lat > 90) {
    callback(new Error("纬度范围应在 -90 到 90 之间"));
    return;
  }
  callback();
};
const validateHeight = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  void _rule;
  if (!value || !value.trim()) {
    callback(new Error("请输入高度"));
    return;
  }
  const height = parseStrictNumber(value || "");
  if (height === null) {
    callback(new Error("请输入有效的数字"));
    return;
  }

  // 全球真实海拔范围
  const minHeight = -431; // 死海
  const maxHeight = 8848.86; // 珠穆朗玛峰

  if (height < minHeight || height > maxHeight) {
    callback(new Error(`高度应在 ${minHeight} 米 到 ${maxHeight} 米 之间（全球真实海拔范围）`));
    return;
  }

  // 校验通过
  callback();
};
const rules = {
  siteName: [
    {
      required: true,
      validator: validateSiteName,
      trigger: "blur",
    },
  ],
  longitude: [{ required: true, trigger: ["change", "blur"], validator: validateLongitude }],
  latitude: [{ required: true, trigger: ["change", "blur"], validator: validateLatitude }],
  altitude: [{ required: true, trigger: ["change", "blur"], validator: validateHeight }],
};

onUnmounted(() => {
  if (nameCheckTimer) {
    clearTimeout(nameCheckTimer);
  }
  nameCheckReqId += 1;
});

// 暴露方法给父组件
defineExpose({
  open,
  close,
});
</script>

<template>
  <div>
    <el-dialog v-model="dialogVisible" width="500px" class="site-creation-dialog" @closed="handleClosed" align-center>
      <template #header>
        <div class="dialog-header">
          <div class="dialog-header-icon">站</div>
          <div class="dialog-header-text">
            <div class="dialog-title">新建站点</div>
            <div class="dialog-subtitle">填写站点名称与地理信息</div>
          </div>
        </div>
      </template>

      <div class="dialog-body">
        <div class="field-tips">
          <span class="tip-chip">经度 -180 ~ 180</span>
          <span class="tip-chip">纬度 -90 ~ 90</span>
          <span class="tip-chip">海拔 -431 ~ 8848.86 m</span>
        </div>

        <PlusForm
          ref="formRef"
          v-model="projectInfo"
          class="create-project-form"
          :columns="columns"
          :rules="rules"
          :row-props="{ gutter: 8 }"
          label-width="90px"
          label-position="right"
          @submit="handleSubmit"
          @submit-error="handleSubmitError"
          :has-footer="false" />

        <div v-if="showNameStatus" class="name-status" :class="[`is-${nameStatusType}`]">
          {{ nameStatusText }}
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="close" class="cancel-btn">取消</el-button>
          <el-button @click="handleReset" class="reset-btn">重置</el-button>
          <el-button
            @click="handleConfirmClick"
            :loading="projectStore.loading"
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
.site-creation-dialog {
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

.site-creation-dialog .el-dialog__header {
  margin-right: 0;
  padding: 0;
  border-bottom: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
}

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
  border: 1px solid #a7f3d0;
  background: #d1fae5;
  color: #047857;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-header-text {
  min-width: 0;
}

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

.site-creation-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}

.site-creation-dialog .el-dialog__body {
  padding: 14px 20px 8px !important;
}

.dialog-body {
  display: flex;
  flex-direction: column;
}

.field-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.tip-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #dbeafe;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
}

.name-status {
  margin-top: 2px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid var(--dlg-border);
  background: #ffffff;
  padding: 7px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--dlg-muted);
}

.name-status.is-success {
  border-color: #bbf7d0;
  background: #f8fffb;
  color: #047857;
}

.name-status.is-error {
  border-color: #fecaca;
  background: #fff7f7;
  color: #b91c1c;
}

.name-status.is-checking {
  border-color: #bfdbfe;
  background: #f8fbff;
  color: #1d4ed8;
}

.site-creation-dialog .el-form-item {
  margin-bottom: 16px;
}

.site-creation-dialog .el-form-item__label {
  color: #334155;
  font-weight: 600;
}

.site-creation-dialog .el-input__wrapper {
  box-shadow: 0 0 0 1px #e2e8f0 inset !important;
  background: #ffffff !important;
  border-radius: 8px;
}

.site-creation-dialog .el-input__wrapper:hover {
  box-shadow: 0 0 0 1px #cbd5e1 inset !important;
}

.site-creation-dialog .el-input.is-focus .el-input__wrapper {
  box-shadow: 0 0 0 1px #10b981 inset !important;
}

.site-creation-dialog .el-input-group__append {
  background: #f8fafc;
  color: #64748b;
  border-left: 1px solid #e2e8f0;
}

/* Hide native number steppers in case upstream renders numeric inputs */
.site-creation-dialog input[type="number"]::-webkit-outer-spin-button,
.site-creation-dialog input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.site-creation-dialog input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.site-creation-dialog .el-dialog__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--dlg-border);
  background-color: var(--dlg-surface);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-footer .el-button {
  height: 36px;
  min-width: 120px;
  padding: 0 20px;
  border-radius: 8px;
  font-weight: 600;
}

.site-creation-dialog .cancel-btn,
.site-creation-dialog .reset-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
}

.site-creation-dialog .submit-btn {
  background: #10b981 !important;
  border: 1px solid #10b981 !important;
  color: #ffffff !important;
  transition: all 0.2s;
}

.site-creation-dialog .submit-btn:hover {
  background: #059669 !important;
  border-color: #059669 !important;
}

.site-creation-dialog .cancel-btn:hover,
.site-creation-dialog .reset-btn:hover {
  border-color: #a7f3d0;
  color: #059669;
  background: #ecfdf5;
}

.site-creation-dialog .el-button.is-disabled.submit-btn {
  background: #9ca3af !important;
  border-color: #9ca3af !important;
  color: #ffffff !important;
}
</style>
