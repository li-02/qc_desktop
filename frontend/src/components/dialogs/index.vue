<!-- dialog管理器 -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import CreateCategoryDialog from "./CreateCategoryDialog.vue";
import ImportDataDialog from "./ImportDataDialog.vue";
import emitter from "../../utils/eventBus";

const createCategoryDialog = ref<InstanceType<typeof CreateCategoryDialog> | null>(null);
const importDataDialog = ref<InstanceType<typeof ImportDataDialog> | null>(null);

const handleOpenCreateCategoryDialog = () => {
  createCategoryDialog.value?.open();
};

const handleOpenImportDataDialog = () => {
  importDataDialog.value?.open();
};

onMounted(() => {
  emitter.on("open-create-category-dialog", handleOpenCreateCategoryDialog);
  emitter.on("open-import-data-dialog", handleOpenImportDataDialog);
});

onUnmounted(() => {
  emitter.off("open-create-category-dialog", handleOpenCreateCategoryDialog);
  emitter.off("open-import-data-dialog", handleOpenImportDataDialog);
});
</script>

<template>
  <div class="global-dialogs">
    <CreateCategoryDialog ref="createCategoryDialog" />
    <ImportDataDialog ref="importDataDialog" />
  </div>
</template>

<style scoped>
.global-dialogs {
  position: relative;
  z-index: 2000;
}
</style>
