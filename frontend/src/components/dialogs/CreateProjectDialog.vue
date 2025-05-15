<!-- 新建项目 -->
<script setup lang="ts">
import {ref, watch} from "vue";
import "plus-pro-components/es/components/form/style/css";
import {type FieldValues, type PlusColumn, PlusForm} from "plus-pro-components";
import {ElMessage} from "element-plus";
import emitter from "@/utils/eventBus.ts";

const dialogVisible = ref(false);
const projectInfo = ref<FieldValues>({
  siteName: "",
  longitude: "",
  latitude: "",
  altitude: "",
});
const nameCheckStatus = ref({
  checking: false,
  valid: true,
  message: "",
});
const loading = ref(false);
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
  nameCheckStatus.value = {checking: false, valid: true, message: ""};
  loading.value = false;
};
const handleChange = (values: FieldValues, prop: PlusColumn) => {
  console.log(values, prop, "change");
};
const handleSubmit = async (values: FieldValues) => {
  console.log(values, "submit");
  if (nameCheckStatus.value.checking || !nameCheckStatus.value.valid) {
    ElMessage.error(nameCheckStatus.value.checking ? "正在检查站点名称，请稍后" : nameCheckStatus.value.message);
  }
  try {
    loading.value = true;
    if (!window.electronAPI) {
      throw new Error("Electron API not available");
    }
    const result = await window.electronAPI.createProject({
      name: values.siteName,
      siteInfo: {
        longitude: values.longitude,
        latitude: values.latitude,
        altitude: values.altitude,
      },
    });
    if (result.success) {
      ElMessage.success("项目创建成功");
      emitter.emit("refresh-projects");
      close();
    } else {
      throw new Error(result.error || "project create failed");
    }
  } catch (e) {
    console.error("create project failed", e);
  } finally {
    loading.value = false;
  }
};
const handleSubmitError = (err: any) => {
  console.log(err, "err");
  loading.value = false;
};
const handleReset = () => {
  console.log("handleReset");
};
// 监听siteName
watch(
  () => projectInfo.value.siteName,
  async newName => {
    if (!newName) {
      nameCheckStatus.value = {checking: false, valid: false, message: ""};
      return;
    }
    nameCheckStatus.value.checking = true;
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.checkProjectName(newName);
        if (result.success) {
          nameCheckStatus.value.valid = result.isAvailable;
          nameCheckStatus.value.message = result.isAvailable ? "" : "站点名称已存在";
        } else {
          nameCheckStatus.value.valid = false;
          nameCheckStatus.value.message = "检查站点名称失败";
        }
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
const rules = {
  siteName: [
    {
      required: true,
      validator: validateSiteName,
      trigger: "blur",
    },
  ],
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
        :row-props="{gutter: 5}"
        label-width="100px"
        label-position="right"
        @change="handleChange"
        @submit="handleSubmit"
        @submit-error="handleSubmitError"
        @reset="handleReset" />
      <!-- 站点名称检查状态提示 -->
      <div v-if="projectInfo.siteName && nameCheckStatus.checking" class="mt-2 ml-24 text-blue-500 text-sm">
        正在检查站点名称...
      </div>
      <div v-else-if="projectInfo.siteName && !nameCheckStatus.valid" class="mt-2 ml-24 text-red-500 text-sm">
        {{ nameCheckStatus.message }}
      </div>
      <div v-else-if="projectInfo.siteName && nameCheckStatus.valid" class="mt-2 ml-24 text-green-500 text-sm">
        站点名称可用
      </div>

      <template #footer>
        <span>
          <el-button @click="close">取消</el-button>
          <el-button
            type="primary"
            @click="handleSubmit(projectInfo)"
            :loading="loading"
            :disabled="nameCheckStatus.checking || !nameCheckStatus.valid"
            >确定</el-button
          >
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped></style>