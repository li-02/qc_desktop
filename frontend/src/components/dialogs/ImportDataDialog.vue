<!-- 导入数据对话框 -->
<script setup lang="ts">
import { ref, watch } from 'vue';

const dialogVisible = ref(false);
const form = ref({
    name: '',
});

const open = () => {
    console.log('open 方法被调用');
    dialogVisible.value = true;
};

const close = () => {
    dialogVisible.value = false;
};

const confirm = () => {
    console.log(form.value.name);
    close();
};

const handleClosed = () => {
    form.value = {
        name: '',
    };
};

watch(dialogVisible, (newVal) => {
    console.log("dialogVisible", newVal);
});

// 暴露方法给父组件
defineExpose({
    open,
    close
});
</script>

<template>
    <el-dialog 
        v-model="dialogVisible" 
        title="导入数据" 
        width="50%" 
        :append-to-body="true"
        :modal="true"
        @closed="handleClosed"
    >
        <div class="p-4">
            <h3 class="text-lg font-medium mb-4">请选择要导入的数据文件</h3>
            <el-form :model="form">
                <el-form-item label="文件名称">
                    <el-input v-model="form.name" placeholder="请输入文件名称"></el-input>
                </el-form-item>
            </el-form>
        </div>
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