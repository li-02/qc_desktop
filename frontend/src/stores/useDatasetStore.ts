import {defineStore} from "pinia";
import {ref, computed, watch} from "vue";
import type {DatasetBaseInfo, ImportOption} from "@shared/types/projectInterface";
import {useProjectStore} from "./useProjectStore";
import {ElMessage} from "element-plus";
import {API_ROUTES} from "@shared/constants/apiRoutes";

export const useDatasetStore = defineStore("dataset", () => {
  const projectStore = useProjectStore();

  // 状态
  const datasets = ref<DatasetBaseInfo[]>([]);
  const currentDataset = ref<DatasetBaseInfo | null>(null);
  const loading = ref(false);

  // 计算属性
  const hasDatasets = computed(() => datasets.value.length > 0);
  const datasetsSortedByDate = computed(() => {
    return [...datasets.value].sort((a, b) => a.createdAt - b.createdAt);
  });
  const currentProjectDatasets = computed(() => {
    if (!projectStore.currentProject) return [];
    return datasets.value.filter(d => d.belongTo === projectStore.currentProject?.id);
  });

  // Actions
  const loadDatasets = async (projectId?: string) => {
    const targetProjectId = projectId || projectStore.currentProject?.id;
    if (!targetProjectId) {
      datasets.value = [];
      currentDataset.value = null;
      return;
    }
    try {
      loading.value = true;
      const project = projectStore.projects.find(p => p.id === targetProjectId);
      if (project) {
        datasets.value = project.datasets.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type,
          createdAt: d.createdAt,
          belongTo: targetProjectId,
          dirPath: d.dirPath,
          originalFile: d.originalFile,
        }));
      }
    } catch (error) {
      console.error("Failed to load datasets:", error);
      ElMessage.error("加载数据集失败");
    } finally {
      loading.value = false;
    }
  };

  const setCurrentDataset = (dataset: DatasetBaseInfo | null) => {
    currentDataset.value = dataset;
  };

  const importData = async (importOptions: ImportOption) => {
    if (!window.electronAPI || !projectStore.currentProject) {
      throw new Error("无法导入数据：缺少必要条件");
    }

    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.IMPORT, {
        projectId: projectStore.currentProject.id,
        importOption: importOptions,
      });

      if (result.success) {
        await projectStore.loadProjects();
        await loadDatasets();
        return true;
      } else {
        throw new Error(result.error || "导入数据失败");
      }
    } catch (error: any) {
      console.error("Import data error:", error);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  const deleteDataset = async (datasetId: string) => {
    if (!window.electronAPI || !projectStore.currentProject) {
      throw new Error("无法删除数据集：缺少必要条件");
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.DELETE, {
        projectId: projectStore.currentProject.id,
        datasetId,
      });

      if (result.success) {
        if (currentDataset.value?.id === datasetId) {
          currentDataset.value = null;
        }
        await projectStore.loadProjects();
        await loadDatasets();
        ElMessage.success("数据集删除成功");
        return true;
      } else {
        throw new Error(result.error || "数据集删除失败");
      }
    } catch (err: any) {
      console.error("数据集删除失败", err);
      ElMessage.error(err.message || "数据集删除失败");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 监听当前项目变化，自动加载数据集
  watch(
    () => projectStore.currentProject,
    newProject => {
      if (newProject) {
        loadDatasets(newProject.id);
      } else {
        datasets.value = [];
        currentDataset.value = null;
      }
    },
    {immediate: true}
  );

  return {
    // 状态
    datasets,
    currentDataset,
    loading,
    // 计算属性
    hasDatasets,
    datasetsSortedByDate,
    currentProjectDatasets,
    // Actions
    loadDatasets,
    setCurrentDataset,
    importData,
    deleteDataset,
  };
});
