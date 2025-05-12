<script setup lang="ts">
import HomePage from './views/home-page/index.vue'
import GlobalDialogs from './components/dialogs/index.vue'
import emitter from './utils/eventBus'
import { onMounted } from 'vue'

onMounted(()=>{
  if(window.electronAPI){
    window.electronAPI.onOpenCreateProjectDialog(()=>{
      emitter.emit('open-create-project-dialog');
    });
    window.electronAPI.onOpenImportDataDialog(()=>{
      console.log('App.vue 收到主进程的open-import-data-dialog事件,转发到事件总线');
      emitter.emit('open-import-data-dialog');
    });
  }
})
</script>

<template>
  <HomePage />
  <!-- 引入全局对话框管理器 -->
  <GlobalDialogs />
</template>

<style>
/* 这里的样式被 style.css 的全局样式覆盖 */
</style>
