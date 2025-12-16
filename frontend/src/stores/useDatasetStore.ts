import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { DatasetBaseInfo, DatasetInfo, ImportOption, DatasetVersionInfo, VersionStatsInfo } from "@shared/types/projectInterface";
import { useProjectStore } from "./useProjectStore";
import { ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";

export const useDatasetStore = defineStore("dataset", () => {
  const projectStore = useProjectStore();

  // 状态
  const datasets = ref<DatasetBaseInfo[]>([]);
  const currentDataset = ref<DatasetInfo | null>(null);
  const versions = ref<DatasetVersionInfo[]>([]);
  const currentVersion = ref<DatasetVersionInfo | null>(null);
  const currentVersionStats = ref<VersionStatsInfo | null>(null);
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
        datasets.value = project.datasets.map((d: any) => ({
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

  const setCurrentDataset = async (datasetId: string) => {
    if (projectStore.currentProject && datasetId) {
      currentDataset.value = await getCurrentDatasetInfo(projectStore.currentProject.id, datasetId);
      if (currentDataset.value) {
        await loadVersions(datasetId);
        if (versions.value.length > 0) {
          // Default to latest version
          await setCurrentVersion(versions.value[0].id);
        }
      }
    } else {
      currentDataset.value = null;
      versions.value = [];
      currentVersion.value = null;
      currentVersionStats.value = null;
    }
  };

  const loadVersions = async (datasetId: string) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSIONS, { datasetId });
      if (result.success) {
        // 显式按创建时间倒序排序，确保最新的在第一个
        versions.value = result.data.sort((a: DatasetVersionInfo, b: DatasetVersionInfo) => b.createdAt - a.createdAt);
      } else {
        ElMessage.error(result.error || "获取版本列表失败");
      }
    } catch (error) {
      console.error("Failed to load versions:", error);
    }
  };

  const setCurrentVersion = async (versionId: number) => {
    const version = versions.value.find(v => v.id === versionId);
    if (version) {
      currentVersion.value = version;
      await loadVersionStats(versionId);
    }
  };

  const loadVersionStats = async (versionId: number) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSION_STATS, { versionId: String(versionId) });
      if (result.success) {
        currentVersionStats.value = result.data;
      } else {
        // It's possible that stats are not calculated yet or failed
        currentVersionStats.value = null;
        console.warn(result.error || "获取版本统计信息失败");
      }
    } catch (error) {
      console.error("Failed to load version stats:", error);
      currentVersionStats.value = null;
    }
  };

  const getCurrentDatasetInfo = async (projectId: string, datasetId: string): Promise<DatasetInfo | null> => {
    const pureData = {
      projectId: String(projectId),
      datasetId: String(datasetId),
    };
    const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_INFO, pureData);
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error || "获取数据集信息失败");
    }
  };

  const importData = async (importOptions: ImportOption) => {
    if (!window.electronAPI || !projectStore.currentProject) {
      throw new Error("无法导入数据：缺少必要条件");
    }

    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.IMPORT, {
        projectId: projectStore.currentProject.id,
        importOption: {
          datasetName: importOptions.datasetName,
          type: importOptions.type,
          file: importOptions.file,
          missingValueTypes: importOptions.missingValueTypes,
          rows: importOptions.rows,
          columns: importOptions.columns,
        },
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

  const deleteDataset = async (projectId: string, datasetId: string) => {
    if (!window.electronAPI || !projectStore.currentProject) {
      throw new Error("无法删除数据集：缺少必要条件");
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.DELETE, {
        projectId,
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
        // 切换项目时，清除当前选中的数据集
        currentDataset.value = null;
        versions.value = [];
        currentVersion.value = null;
        currentVersionStats.value = null;
        loadDatasets(newProject.id);
      } else {
        datasets.value = [];
        currentDataset.value = null;
      }
    },
    { immediate: true }
  );

  return {
    // 状态
    datasets,
    currentDataset,
    versions,
    currentVersion,
    currentVersionStats,
    loading,
    // 计算属性
    hasDatasets,
    datasetsSortedByDate,
    currentProjectDatasets,
    // Actions
    loadDatasets,
    setCurrentDataset,
    setCurrentVersion,
    importData,
    deleteDataset,
  };
});
