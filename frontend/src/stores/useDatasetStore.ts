import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type {
  DatasetBaseInfo,
  DatasetInfo,
  ImportOption,
  BatchImportRequest,
  DatasetVersionInfo,
  VersionStatsInfo,
} from "@shared/types/projectInterface";
import { useCategoryStore } from "./useCategoryStore";
import { ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";

export const useDatasetStore = defineStore("dataset", () => {
  const categoryStore = useCategoryStore();

  // 状态
  const datasets = ref<DatasetBaseInfo[]>([]);
  const currentDataset = ref<DatasetInfo | null>(null);
  const versions = ref<DatasetVersionInfo[]>([]);
  const currentVersion = ref<DatasetVersionInfo | null>(null);
  const currentVersionStats = ref<VersionStatsInfo | null>(null);
  const loading = ref(false);
  let datasetSelectionRequestId = 0;
  let versionStatsRequestId = 0;

  // 计算属性
  const hasDatasets = computed(() => datasets.value.length > 0);
  const datasetsSortedByDate = computed(() => {
    return [...datasets.value].sort((a, b) => a.createdAt - b.createdAt);
  });
  const currentCategoryDatasets = computed(() => {
    if (!categoryStore.currentCategory) return [];
    return datasets.value.filter(d => d.belongTo === categoryStore.currentCategory?.id);
  });
  const currentDatasetMissingMarkers = computed(() => {
    return currentDataset.value?.missingValueTypes || [];
  });

  // Actions
  const loadDatasets = async (categoryId?: string) => {
    const targetCategoryId = categoryId || categoryStore.currentCategory?.id;
    if (!targetCategoryId) {
      datasets.value = [];
      currentDataset.value = null;
      return;
    }
    try {
      loading.value = true;
      const category = categoryStore.categories.find(c => c.id === targetCategoryId);
      if (category) {
        datasets.value = category.datasets.map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          createdAt: d.createdAt,
          belongTo: targetCategoryId,
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

  const loadDatasetVersions = async (datasetId: string) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSIONS, { datasetId });
      if (result.success) {
        if (currentDataset.value && currentDataset.value.id !== String(datasetId)) return;
        // 显式按创建时间倒序排序，确保最新的在第一个
        versions.value = result.data.sort((a: DatasetVersionInfo, b: DatasetVersionInfo) => b.createdAt - a.createdAt);
      } else {
        ElMessage.error(result.error || "获取版本列表失败");
      }
    } catch (error) {
      console.error("Failed to load versions:", error);
    }
  };

  const getDefaultVersion = () => {
    const sortedOldestFirst = [...versions.value].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
    return sortedOldestFirst.find(v => v.stageType === "RAW" && !v.parentVersionId) || sortedOldestFirst[0] || null;
  };

  const setCurrentDataset = async (datasetId: string) => {
    const requestId = ++datasetSelectionRequestId;
    versionStatsRequestId++;
    versions.value = [];
    currentVersion.value = null;
    currentVersionStats.value = null;

    if (categoryStore.currentCategory && datasetId) {
      try {
        loading.value = true;
        const nextDataset = await getCurrentDatasetInfo(categoryStore.currentCategory.id, datasetId);
        if (requestId !== datasetSelectionRequestId) return;

        currentDataset.value = nextDataset;
        // [DEBUG] 诊断缺失值标记问题
        console.log(
          "[setCurrentDataset] missingValueTypes=",
          JSON.stringify(currentDataset.value?.missingValueTypes),
          "datasetId=",
          datasetId
        );
        if (currentDataset.value) {
          await loadDatasetVersions(datasetId);
          if (requestId !== datasetSelectionRequestId || currentDataset.value.id !== String(datasetId)) return;
          const defaultVersion = getDefaultVersion();
          if (defaultVersion) await setCurrentVersion(defaultVersion.id);
        }
      } finally {
        if (requestId === datasetSelectionRequestId) {
          loading.value = false;
        }
      }
    } else {
      currentDataset.value = null;
      versions.value = [];
      currentVersion.value = null;
      currentVersionStats.value = null;
    }
  };

  const setCurrentVersion = async (versionId: number) => {
    const version = versions.value.find(v => v.id === versionId);
    if (!version) return;
    if (currentDataset.value && String(version.datasetId) !== String(currentDataset.value.id)) return;

    const requestId = ++versionStatsRequestId;
    currentVersion.value = version;
    currentVersionStats.value = null;
    await loadVersionStats(versionId, requestId);
  };

  const loadVersionStats = async (versionId: number, requestId = ++versionStatsRequestId) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSION_STATS, {
        versionId: String(versionId),
      });
      if (requestId !== versionStatsRequestId || currentVersion.value?.id !== versionId) return;
      if (result.success) {
        currentVersionStats.value = result.data;
      } else {
        // It's possible that stats are not calculated yet or failed
        currentVersionStats.value = null;
        console.warn(result.error || "获取版本统计信息失败");
      }
    } catch (error) {
      if (requestId !== versionStatsRequestId || currentVersion.value?.id !== versionId) return;
      console.error("Failed to load version stats:", error);
      currentVersionStats.value = null;
    }
  };

  const getCurrentDatasetInfo = async (categoryId: string, datasetId: string): Promise<DatasetInfo | null> => {
    const pureData = {
      categoryId: String(categoryId),
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
    if (!window.electronAPI || !categoryStore.currentCategory) {
      throw new Error("无法导入数据：缺少必要条件");
    }

    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.IMPORT, {
        categoryId: categoryStore.currentCategory.id,
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
        await categoryStore.loadCategories();
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

  const batchImportData = async (request: BatchImportRequest): Promise<{ batchId: string }> => {
    if (!window.electronAPI) {
      throw new Error("无法批量导入数据：electron API 不可用");
    }
    const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.BATCH_IMPORT, request);
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error || "批量导入失败");
    }
  };

  const updateMissingMarkers = async (markers: string[]) => {
    if (!categoryStore.currentCategory || !currentDataset.value) {
      throw new Error("无法更新缺失值标记：缺少必要条件");
    }
    const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.UPDATE, {
      categoryId: categoryStore.currentCategory.id,
      datasetId: currentDataset.value.id,
      updates: { missingValueTypes: markers },
    });
    if (result.success) {
      // 更新本地状态
      currentDataset.value = await getCurrentDatasetInfo(categoryStore.currentCategory.id, currentDataset.value.id);
    } else {
      throw new Error(result.error || "更新缺失值标记失败");
    }
  };

  const deleteDataset = async (categoryId: string, datasetId: string) => {
    if (!window.electronAPI || !categoryStore.currentCategory) {
      throw new Error("无法删除数据集：缺少必要条件");
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.DELETE, {
        categoryId,
        datasetId,
      });

      if (result.success) {
        if (currentDataset.value?.id === datasetId) {
          currentDataset.value = null;
        }
        await categoryStore.loadCategories();
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

  const deleteVersion = async (versionId: number) => {
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.DELETE_VERSION, {
        versionId: String(versionId),
      });
      if (result.success) {
        if (currentVersion.value?.id === versionId) {
          currentVersion.value = null;
          currentVersionStats.value = null;
        }
        if (currentDataset.value) {
          await loadDatasetVersions(currentDataset.value.id);
          if (versions.value.length > 0 && !currentVersion.value) {
            const defaultVersion = getDefaultVersion();
            if (defaultVersion) await setCurrentVersion(defaultVersion.id);
          }
        }
        ElMessage.success("版本删除成功");
        return true;
      } else {
        throw new Error(result.error || "版本删除失败");
      }
    } catch (err: any) {
      ElMessage.error(err.message || "版本删除失败");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const updateVersionRemark = async (versionId: number, remark: string) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.UPDATE_VERSION, {
        versionId: String(versionId),
        updates: { remark },
      });
      if (result.success) {
        const v = versions.value.find(v => v.id === versionId);
        if (v) v.remark = remark;
        if (currentVersion.value?.id === versionId) currentVersion.value.remark = remark;
        ElMessage.success("备注更新成功");
        return true;
      } else {
        throw new Error(result.error || "更新备注失败");
      }
    } catch (err: any) {
      ElMessage.error(err.message || "更新备注失败");
      throw err;
    }
  };

  const exportVersion = async (versionId: number, fileName?: string) => {
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.EXPORT, {
        versionId: String(versionId),
        defaultName: fileName,
      });

      if (result.success) {
        ElMessage.success("导出成功");
        return true;
      } else if (result.canceled) {
        // User cancelled, do nothing
        return false;
      } else {
        throw new Error(result.error || "导出失败");
      }
    } catch (error: any) {
      console.error("Export error:", error);
      ElMessage.error(error.message || "导出失败");
      return false;
    } finally {
      loading.value = false;
    }
  };

  // 监听当前分类变化，自动加载数据集
  watch(
    () => categoryStore.currentCategory,
    newCategory => {
      datasetSelectionRequestId++;
      versionStatsRequestId++;
      if (newCategory) {
        // 切换分类时，清除当前选中的数据集
        currentDataset.value = null;
        versions.value = [];
        currentVersion.value = null;
        currentVersionStats.value = null;
        loadDatasets(newCategory.id);
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
    currentCategoryDatasets,
    currentDatasetMissingMarkers,
    // Actions
    loadDatasets,
    setCurrentDataset,
    setCurrentVersion,
    loadVersions: loadDatasetVersions,
    importData,
    batchImportData,
    updateMissingMarkers,
    deleteDataset,
    deleteVersion,
    updateVersionRemark,
    exportVersion,
  };
});
