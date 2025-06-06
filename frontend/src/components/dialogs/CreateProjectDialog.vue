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
      placeholder: "",
    },
  },
  {
    label: "经度",
    width: 120,
    prop: "longitude",
    valueType: "copy",
    colProps: {
      span: 8,
    },
    fieldSlots: {
      append: () => "°",
    },
    fieldProps: {
      placeholder: "",
    },
  },
  {
    label: "纬度",
    width: 120,
    prop: "latitude",
    valueType: "copy",
    colProps: {
      span: 8,
    },
    fieldSlots: {
      append: () => "°",
    },
    fieldProps: {
      placeholder: "",
    },
  },
  {
    label: "高度",
    width: 120,
    prop: "altitude",
    valueType: "copy",
    colProps: {
      span: 8,
    },
    fieldSlots: {
      append: () => "m",
    },
    fieldProps: {
      placeholder: "",
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
      ElMessage.success("项目创建成功");
      // emitter.emit("refresh-projects");
      close();
    } else {
      ElMessage.error(`项目创建失败: ${error}`);
    }
  } catch (e) {
    console.error("create project failed", e);
    ElMessage.error("项目创建失败，请稍后重试");
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
    <el-dialog v-model="dialogVisible" title="新建项目" width="50%" @closed="handleClosed">
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
        :has-footer="false" />

      <template #footer>
        <span>
          <el-button @click="close">取消</el-button>
          <el-button @click="handleReset" type="warning">重置</el-button>
          <el-button
            type="primary"
            @click="handleSubmit(projectInfo)"
            :loading="projectStore.loading"
            :disabled="nameCheckStatus.checking || !nameCheckStatus.valid">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped></style>
