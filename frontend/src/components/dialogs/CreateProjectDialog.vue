<script setup lang="ts">
import { ref, watch } from "vue";
import "plus-pro-components/es/components/form/style/css";
import { type FieldValues, type PlusColumn, PlusForm } from "plus-pro-components";
import { ElMessage } from "element-plus";
import { useProjectStore } from "@/stores/useProjectStore";

interface ProjectInfo {
  siteName: string;
  longitude: string;
  latitude: string;
  altitude: string;
}
const projectStore = useProjectStore();
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
  projectInfo.value = {
    siteName: "",
    longitude: "",
    latitude: "",
    altitude: "",
  };
  nameCheckStatus.value = { checking: false, valid: true, message: "" };
  projectStore.loading = false;
};
const handleChange = (values: FieldValues, prop: PlusColumn) => {
  console.log(values, prop, "change");
};
const handleSubmit = async (values: ProjectInfo) => {
  console.log(values, "submit");
  if (nameCheckStatus.value.checking || !nameCheckStatus.value.valid) {
    ElMessage.error(nameCheckStatus.value.checking ? "正在检查站点名称，请稍后" : nameCheckStatus.value.message);
  }
  try {
    const { success, error } = await projectStore.createProject({
      name: values.siteName,
      siteInfo: {
        longitude: values.longitude,
        latitude: values.latitude,
        altitude: values.altitude,
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
const handleSubmitError = (err: any) => {
  projectStore.loading = false;
};
const handleReset = () => {
  projectInfo.value = {
    siteName: "",
    longitude: "",
    latitude: "",
    altitude: "",
  };
};
// 监听siteName
watch(
  () => projectInfo.value.siteName,
  async newName => {
    if (!newName) {
      nameCheckStatus.value = { checking: false, valid: false, message: "" };
      return;
    }
    nameCheckStatus.value.checking = true;
    try {
      const result = await projectStore.checkProjectName(newName);
      if (result.success) {
        nameCheckStatus.value.valid = !!result.data;
        nameCheckStatus.value.message = result.data ? "" : "站点名称已存在";
      } else {
        nameCheckStatus.value.valid = false;
        nameCheckStatus.value.message = "检查站点名称失败";
      }
    } catch (err) {
      console.error("Check project name error:", err);
      nameCheckStatus.value.valid = false;
      nameCheckStatus.value.message = "检查站点名称时出错";
    } finally {
      nameCheckStatus.value.checking = false;
    }
  }
);

// 自定义验证器
const validateSiteName = (rule: any, value: string, callback: any) => {
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
const validateLongitude = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error("请输入经度"));
    return;
  }

  const lon = parseFloat(value);

  if (isNaN(lon)) {
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
const validateLatitude = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error("请输入纬度"));
    return;
  }

  const lat = parseFloat(value);

  if (isNaN(lat)) {
    callback(new Error("纬度必须是合法数字"));
    return;
  }

  if (lat < -90 || lat > 90) {
    callback(new Error("纬度范围应在 -90 到 90 之间"));
    return;
  }
  callback();
};
const validateHeight = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error("请输入高度"));
    return;
  }

  const height = parseFloat(value);

  if (isNaN(height)) {
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
  longitude: [{ required: true, trigger: "blur", validator: validateLongitude }],
  latitude: [{ required: true, trigger: "blur", validator: validateLatitude }],
  altitude: [{ required: true, trigger: "blur", validator: validateHeight }],
};

// 暴露方法给父组件
defineExpose({
  open,
  close,
});
</script>

<template>
  <div>
    <el-dialog
      v-model="dialogVisible"
      title="新建站点"
      width="500px"
      class="site-creation-dialog"
      @closed="handleClosed"
      align-center
    >
      <PlusForm
        v-model="projectInfo"
        class="m-auto"
        :columns="columns"
        :rules="rules"
        :row-props="{ gutter: 5 }"
        label-width="90px"
        label-position="right"
        @change="handleChange"
        @submit-error="handleSubmitError"
        :has-footer="false"
      />

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="close" class="cancel-btn">取消</el-button>
          <el-button @click="handleReset" type="warning" plain>重置</el-button>
          <el-button
            type="primary"
            @click="handleSubmit(projectInfo)"
            :loading="projectStore.loading"
            :disabled="nameCheckStatus.checking || !nameCheckStatus.valid"
            class="submit-btn"
          >
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style>
.site-creation-dialog {
  border-radius: 16px !important;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98) !important;
  backdrop-filter: blur(20px);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
  padding: 0 !important;
}

.site-creation-dialog .el-dialog__header {
  margin-right: 0;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.5);
  background: linear-gradient(
    to right,
    rgba(240, 253, 244, 0.8),
    rgba(255, 255, 255, 0)
  );
}

.site-creation-dialog .el-dialog__title {
  font-weight: 600;
  color: #059669; /* Emerald 600 */
  font-size: 18px;
}

.site-creation-dialog .el-dialog__headerbtn {
  top: 20px;
}

.site-creation-dialog .el-dialog__body {
  padding: 32px 24px !important;
}

.site-creation-dialog .el-dialog__footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(229, 231, 235, 0.5);
  background-color: rgba(249, 250, 251, 0.6);
}

.site-creation-dialog .submit-btn {
  background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
  border: none !important;
  padding: 8px 24px;
  height: 36px;
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.2s;
}

.site-creation-dialog .submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
}

.site-creation-dialog .cancel-btn:hover {
  color: #059669;
  border-color: #a7f3d0;
  background-color: #ecfdf5;
}
</style>

<style scoped></style>

<style scoped></style>
