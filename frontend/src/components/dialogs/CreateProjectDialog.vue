<!-- 新建项目 -->
<script setup lang="ts">
import {ref} from "vue";
import "plus-pro-components/es/components/form/style/css";
import {type FieldValues, type PlusColumn, PlusForm} from "plus-pro-components";

const dialogVisible = ref(false);
const projectInfo = ref<FieldValues>({
  siteName: "",
  longitude: "",
  latitude: "",
  altitude: "",
});
const rules = {
  siteName: [
    {
      required: true,
      message: "请输入站点名称",
    },
  ],
};
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
};
const handleChange = (values: FieldValues, prop: PlusColumn) => {
  console.log(values, prop, "change");
};
const handleSubmit = (values: FieldValues) => {
  console.log(values, "submit");
};
const handleSubmitError = (err: any) => {
  console.log(err, "err");
};
const handleReset = () => {
  console.log("handleReset");
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
    </el-dialog>
  </div>
</template>

<style scoped></style>