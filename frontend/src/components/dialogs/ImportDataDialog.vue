<!-- 新建项目 -->
<script setup lang="ts">
import { ref,watch } from 'vue';

const dialogVisible = ref(false);
const form=ref({
    name: '',
});
const open=()=>{
    console.log('open 方法被调用');
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
watch(dialogVisible,(newVal)=>{
    console.log("dialogVisible",newVal);
})
// 暴露方法给父组件
defineExpose({
  open,
  close
});
</script>

<template>
    <el-dialog v-model="dialogVisible" title="test" width="50%" @closed="handleClosed">
        <p>test</p>
        <!-- <el-form :model="form">
            <el-form-item label="1">
                <el-input v-model="form.name" placeholder="请输入项目名称"></el-input>
            </el-form-item>
        </el-form> -->
        <template #footer>
            <span>
                <el-button @click="close">取消</el-button>
                <el-button type="primary" @click="confirm">确定</el-button>
            </span>
        </template>
    </el-dialog>
</template>

<style scoped>
</style>