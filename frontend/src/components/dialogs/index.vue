<!-- 全局对话框管理器 -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import CreateProjectDialog from './CreateProjectDialog.vue';
import ImportDataDialog from './ImportDataDialog.vue';
import emitter from '../../utils/eventBus'
// 创建对话框的引用
const createProjectDialog=ref(null);
const importDataDialog=ref(null);

const handleOpenCreateProjectDialog=()=>{
    createProjectDialog.value?.open();
};

const handleOpenImportDataDialog=()=>{
    console.log('对话框管理器 收到事件进程的open-import-data-dialog事件');

    if(importDataDialog.value){
        console.log("准备调用importDataDialog的open方法");
        importDataDialog.value?.open();
        console.log("调用importDataDialog的open方法成功");
    }else{
        console.log("importDataDialog.value为空");
    }
};

onMounted(()=>{
    console.log("对话框管理器 mounted");
    emitter.on('open-create-project-dialog', handleOpenCreateProjectDialog);
    emitter.on('open-import-data-dialog', handleOpenImportDataDialog);
    console.log("对话框管理器 注册importDataDialog事件监听器成功");
});
onUnmounted(()=>{
    emitter.off('open-create-project-dialog', handleOpenCreateProjectDialog);
    emitter.off('open-import-data-dialog', handleOpenImportDataDialog);
    console.log("对话框管理器 卸载importDataDialog事件监听器成功");
});
</script>

<template>
    <div class="global-dialogs">
        <CreateProjectDialog ref="createProjectDialog" />
        <ImportDataDialog ref="importDataDialog" />
    </div>
</template>

<style scoped>
.global-dialogs{
    display: none;
}
</style>