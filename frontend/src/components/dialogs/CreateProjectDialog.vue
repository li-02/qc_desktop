<!-- 新建项目 -->
<script setup lang="ts">
import { ref } from 'vue';

const dialogVisible = ref(false);
const form=ref({
    name: '',
});
const open=()=>{
    dialogVisible.value=true;
}
const close=()=>{
    dialogVisible.value=false;
}
const confirm=()=>{
    console.log(form.value.name);
    close();
}
const handleClosed=()=>{
    form.value={
        name: '',
    }
}
// 暴露方法给父组件
defineExpose({
  open,
  close
});
</script>

<template>
<div>
    <el-dialog v-model="dialogVisible" title="新建项目" width="50%" @closed="handleClosed">
        <el-form :model="form">
            <el-form-item label="1">
                <el-input v-model="form.name" placeholder="请输入项目名称"></el-input>
            </el-form-item>
        </el-form>
        <template #footer>
            <span>
                <el-button @click="close">取消</el-button>
                <el-button type="primary" @click="confirm">确定</el-button>
            </span>
        </template>
    </el-dialog>
</div>
</template>

<style scoped>
</style>