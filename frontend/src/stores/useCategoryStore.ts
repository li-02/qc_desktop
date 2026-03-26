import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { type CategoryInfo } from "@shared/types/projectInterface.ts";
import { ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";

type Result<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export const useCategoryStore = defineStore("category", () => {
  // state
  const categories = ref<CategoryInfo[]>([]);
  const currentCategory = ref<CategoryInfo | null>(null);
  const loading = ref(false);

  const hasCategories = computed(() => categories.value.length > 0);
  const categoriesSortedByDate = computed(() => {
    return [...categories.value].sort((a, b) => b.createdAt - a.createdAt);
  });

  // actions
  const loadCategories = async (): Promise<CategoryInfo[]> => {
    if (!window.electronAPI) {
      console.error("electron API not available");
      return [];
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.CATEGORIES.GET_ALL);

      if (result.success) {
        categories.value = result.data.sort(
          (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt
        );

        if (currentCategory.value) {
          const updated = categories.value.find(c => c.id === currentCategory.value?.id);
          if (updated) {
            currentCategory.value = updated;
          } else {
            currentCategory.value = null;
          }
        }

        return categories.value;
      } else {
        throw new Error(result.error || "获取分类列表失败");
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
      return [];
    } finally {
      loading.value = false;
    }
  };

  const findCategoryByDatasetId = (datasetId: string): CategoryInfo | undefined => {
    return categories.value.find(category => category.datasets.some(dataset => dataset.id === datasetId));
  };

  const setCurrentCategory = (categoryId: string) => {
    currentCategory.value = categories.value.find(c => c.id === categoryId) || null;
  };

  const createCategory = async (info: { name: string }): Promise<Result> => {
    if (!window.electronAPI) {
      return { success: false, error: "electron API not available" };
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.CATEGORIES.CREATE, info);

      if (result.success) {
        await loadCategories();
        return { success: true };
      } else {
        return { success: false, error: result.error || "分类创建失败" };
      }
    } catch (err) {
      return { success: false, error: "分类创建失败" };
    } finally {
      loading.value = false;
    }
  };

  const updateCategory = async (categoryId: string, updates: { name?: string }): Promise<Result> => {
    if (!window.electronAPI) {
      return { success: false, error: "electron API not available" };
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.CATEGORIES.UPDATE, { categoryId, updates });

      if (result.success) {
        if (currentCategory.value?.id === categoryId) {
          Object.assign(currentCategory.value, updates);
        }
        await loadCategories();
        ElMessage.success("分类更新成功");
        return { success: true };
      } else {
        return { success: false, error: result.error || "分类更新失败" };
      }
    } catch (err: any) {
      ElMessage.error(err.message || "分类更新失败");
      return { success: false, error: "分类更新失败" };
    } finally {
      loading.value = false;
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!window.electronAPI) {
      throw new Error("electron API not available");
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.CATEGORIES.DELETE, { categoryId });

      if (result.success) {
        if (currentCategory.value?.id === categoryId) {
          currentCategory.value = null;
        }
        await loadCategories();
        ElMessage.success("分类删除成功");
        return true;
      } else {
        throw new Error(result.error || "分类删除失败");
      }
    } catch (err: any) {
      console.error("分类删除失败", err);
      ElMessage.error(err.message || "分类删除失败");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const batchDeleteCategories = async (categoryIds: string[]) => {
    if (!window.electronAPI) {
      throw new Error("electron API not available");
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.CATEGORIES.BATCH_DELETE, { categoryIds });

      if (result.success) {
        if (categoryIds.includes(currentCategory.value?.id || "")) {
          currentCategory.value = null;
        }
        await loadCategories();
        ElMessage.success(`成功删除 ${categoryIds.length} 个分类`);
        return true;
      } else {
        throw new Error(result.error || "批量删除分类失败");
      }
    } catch (err: any) {
      console.error("批量删除分类失败", err);
      ElMessage.error(err.message || "批量删除分类失败");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const checkCategoryName = async (name: string): Promise<Result<boolean>> => {
    if (!window.electronAPI) {
      throw new Error("electron API not available");
    }
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.CATEGORIES.CHECK_NAME, { name });

      if (result.success) {
        return { success: true, data: result.data.isAvailable };
      } else {
        return { success: false, error: result.error || "分类名称检查失败" };
      }
    } catch (err) {
      console.error("Check category name error", err);
      return { success: false, error: "分类名称检查失败" };
    }
  };

  return {
    // state
    categories,
    currentCategory,
    loading,
    hasCategories,
    categoriesSortedByDate,
    // actions
    loadCategories,
    setCurrentCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    batchDeleteCategories,
    checkCategoryName,
    findCategoryByDatasetId,
  };
});
