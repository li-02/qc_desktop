import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type {
  ColumnSetting,
  DetectionMethod,
  OutlierDetectionConfig,
  OutlierDetectionScopeType,
  DetectionMethodId,
  ResolvedThresholdConfig,
  UserTemplateListItem,
} from "@shared/types/database";

/**
 * 阈值模板类型
 */
interface ThresholdTemplate {
  [variableName: string]: {
    min: number;
    max: number;
    unit: string;
  };
}

/**
 * 异常检测 Store
 * 管理阈值配置、检测方法、检测配置
 */
export const useOutlierDetectionStore = defineStore("outlierDetection", () => {
  // ==================== 状态 ====================

  // 检测方法
  const detectionMethods = ref<DetectionMethod[]>([]);

  // 列阈值配置
  const columnThresholds = ref<ColumnSetting[]>([]);

  // 阈值模板
  const thresholdTemplates = ref<Record<string, ThresholdTemplate>>({});

  // 用户自定义模板
  const userTemplates = ref<UserTemplateListItem[]>([]);

  // 检测配置 (三级作用域)
  const detectionConfigs = ref<OutlierDetectionConfig[]>([]);

  // 加载状态
  const loading = ref(false);
  const saving = ref(false);

  // ==================== 计算属性 ====================

  const availableMethods = computed(() => detectionMethods.value.filter(m => m.isAvailable));

  const thresholdMethods = computed(() => detectionMethods.value.filter(m => m.category === "threshold"));

  const statisticalMethods = computed(() => detectionMethods.value.filter(m => m.category === "statistical"));

  const mlMethods = computed(() => detectionMethods.value.filter(m => m.category === "ml" || m.category === "dl"));

  // ==================== Actions ====================

  /**
   * 加载可用的检测方法
   */
  const loadDetectionMethods = async () => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_METHODS, {});
      if (result.success) {
        detectionMethods.value = result.data.methods;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("加载检测方法失败:", error);
      ElMessage.error("加载检测方法失败");
    }
  };

  /**
   * 加载数据集的列阈值配置
   */
  const loadColumnThresholds = async (datasetId: string) => {
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_COLUMN_THRESHOLDS, { datasetId });
      if (result.success) {
        columnThresholds.value = result.data.columns;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("加载列阈值配置失败:", error);
      ElMessage.error("加载列阈值配置失败");
    } finally {
      loading.value = false;
    }
  };

  /**
   * 更新单列阈值配置
   */
  const updateColumnThreshold = async (
    columnId: number,
    thresholds: {
      min_threshold?: number;
      max_threshold?: number;
      physical_min?: number;
      physical_max?: number;
      warning_min?: number;
      warning_max?: number;
      unit?: string;
      variable_type?: string;
    }
  ) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.UPDATE_COLUMN_THRESHOLD, {
        columnId: String(columnId),
        thresholds,
      });
      if (result.success) {
        // 更新本地状态
        const index = columnThresholds.value.findIndex(c => c.id === columnId);
        if (index !== -1) {
          columnThresholds.value[index] = {
            ...columnThresholds.value[index],
            ...thresholds,
          };
        }
        ElMessage.success("阈值配置已更新");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("更新阈值失败:", error);
      ElMessage.error(error.message || "更新阈值失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 批量更新列阈值
   */
  const batchUpdateThresholds = async (
    updates: Array<{
      id: number;
      min_threshold?: number;
      max_threshold?: number;
      physical_min?: number;
      physical_max?: number;
    }>
  ) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.BATCH_UPDATE_THRESHOLDS, {
        updates: updates.map(u => ({ ...u, id: String(u.id) })),
      });
      if (result.success) {
        // 更新本地状态
        for (const update of updates) {
          const index = columnThresholds.value.findIndex(c => c.id === update.id);
          if (index !== -1) {
            columnThresholds.value[index] = {
              ...columnThresholds.value[index],
              ...update,
            };
          }
        }
        ElMessage.success(`已更新 ${result.data.updatedCount} 列的阈值配置`);
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("批量更新阈值失败:", error);
      ElMessage.error(error.message || "批量更新阈值失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 加载阈值模板
   */
  const loadThresholdTemplates = async () => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_TEMPLATES, {});
      if (result.success) {
        thresholdTemplates.value = result.data.templates;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("加载阈值模板失败:", error);
    }
  };

  /**
   * 应用阈值模板
   */
  const applyThresholdTemplate = async (datasetId: string, templateName: string) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.APPLY_TEMPLATE, { datasetId, templateName });
      if (result.success) {
        ElMessage.success(`已应用模板，更新了 ${result.data.appliedCount} 列`);
        // 重新加载阈值配置
        await loadColumnThresholds(datasetId);
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("应用模板失败:", error);
      ElMessage.error(error.message || "应用模板失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 加载检测配置
   */
  const loadDetectionConfigs = async (scopeType: OutlierDetectionScopeType, scopeId?: string) => {
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_DETECTION_CONFIGS, { scopeType, scopeId });
      if (result.success) {
        detectionConfigs.value = result.data.configs;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("加载检测配置失败:", error);
      ElMessage.error("加载检测配置失败");
    } finally {
      loading.value = false;
    }
  };

  /**
   * 创建检测配置
   */
  const createDetectionConfig = async (config: {
    scopeType: OutlierDetectionScopeType;
    scopeId?: string;
    columnName?: string;
    detectionMethod: DetectionMethodId;
    methodParams?: Record<string, any>;
    priority?: number;
  }) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.CREATE_DETECTION_CONFIG, config);
      if (result.success) {
        ElMessage.success("检测配置已创建");
        return result.data.id;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("创建检测配置失败:", error);
      ElMessage.error(error.message || "创建检测配置失败");
      return null;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 更新检测配置
   */
  const updateDetectionConfig = async (
    id: number,
    updates: {
      detectionMethod?: DetectionMethodId;
      methodParams?: Record<string, any>;
      priority?: number;
      isActive?: boolean;
    }
  ) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.UPDATE_DETECTION_CONFIG, {
        id: String(id),
        updates,
      });
      if (result.success) {
        ElMessage.success("检测配置已更新");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("更新检测配置失败:", error);
      ElMessage.error(error.message || "更新检测配置失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 删除检测配置
   */
  const deleteDetectionConfig = async (id: number) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.DELETE_DETECTION_CONFIG, { id: String(id) });
      if (result.success) {
        detectionConfigs.value = detectionConfigs.value.filter(c => c.id !== id);
        ElMessage.success("检测配置已删除");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("删除检测配置失败:", error);
      ElMessage.error(error.message || "删除检测配置失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 解析列的有效阈值 (考虑继承)
   */
  const resolveColumnThreshold = async (
    columnName: string,
    datasetId: string,
    siteId: string
  ): Promise<ResolvedThresholdConfig | null> => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.RESOLVE_THRESHOLD, {
        columnName,
        datasetId,
        siteId,
      });
      if (result.success) {
        return result.data.threshold;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("解析阈值失败:", error);
      return null;
    }
  };

  // ==================== 检测执行 ====================

  /**
   * 执行阈值检测
   */
  const executeThresholdDetection = async (datasetId: string, versionId: string, columnNames?: string[]) => {
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.EXECUTE_THRESHOLD_DETECTION, {
        datasetId,
        versionId,
        columnNames,
      });
      if (result.success) {
        ElMessage.success(`检测完成，发现 ${result.data.summary.outlierCount} 个异常值`);
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("执行检测失败:", error);
      ElMessage.error(error.message || "执行检测失败");
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 通用检测执行 (支持所有检测方法)
   */
  const executeDetection = async (
    datasetId: string,
    versionId: string,
    method: string,
    methodParams: Record<string, any>,
    columnNames?: string[]
  ) => {
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.EXECUTE_DETECTION, {
        datasetId,
        versionId,
        method,
        methodParams,
        columnNames,
      });
      if (result.success) {
        ElMessage.success(`检测完成，发现 ${result.data.summary.outlierCount} 个异常值`);
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("执行检测失败:", error);
      ElMessage.error(error.message || "执行检测失败");
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 获取检测结果列表
   */
  const getDetectionResults = async (datasetId: string) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_DETECTION_RESULTS, { datasetId });
      if (result.success) {
        return result.data.results;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("获取检测结果失败:", error);
      return [];
    }
  };

  /**
   * 获取检测结果详情
   */
  const getDetectionResultDetails = async (
    resultId: string,
    columnName?: string,
    limit: number = 100,
    offset: number = 0
  ) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_RESULT_DETAILS, {
        resultId,
        columnName,
        limit,
        offset,
      });
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("获取检测详情失败:", error);
      return { details: [], total: 0 };
    }
  };

  /**
   * 获取检测结果统计信息 (用于补全)
   */
  const getOutlierResultStats = async (resultId: string) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_RESULT_STATS, { resultId });
      if (result.success) {
        return result.data.stats;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("获取检测统计失败:", error);
      return [];
    }
  };

  /**
   * 删除检测结果
   */
  const deleteDetectionResult = async (resultId: string) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.DELETE_DETECTION_RESULT, { resultId });
      if (result.success) {
        ElMessage.success("检测结果已删除");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("删除检测结果失败:", error);
      ElMessage.error(error.message || "删除检测结果失败");
      return false;
    }
  };

  /**
   * 重命名检测结果
   */
  const renameDetectionResult = async (resultId: string, name: string) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.RENAME_DETECTION_RESULT, { resultId, name });
      if (result.success) {
        ElMessage.success("已重命名");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("重命名失败:", error);
      ElMessage.error(error.message || "重命名失败");
      return false;
    }
  };

  /**
   * 应用异常值过滤
   */
  const applyOutlierFiltering = async (resultId: string) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.APPLY_FILTERING, { resultId });
      if (result.success) {
        ElMessage.success("已生成过滤后的新版本数据");
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("应用过滤失败:", error);
      ElMessage.error(error.message || "应用过滤失败");
      return null;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 撤销异常值过滤
   */
  const revertOutlierFiltering = async (resultId: string) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.REVERT_FILTERING, { resultId });
      if (result.success) {
        ElMessage.success("已撤销过滤操作");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("撤销过滤失败:", error);
      ElMessage.error(error.message || "撤销过滤失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  // ==================== 用户自定义阈值模板 ====================

  /**
   * 加载用户自定义模板列表
   */
  const loadUserTemplates = async () => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_USER_TEMPLATES, {});
      if (result.success) {
        userTemplates.value = result.data.templates;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("加载用户模板失败:", error);
    }
  };

  /**
   * 保存当前阈值配置为模板
   */
  const saveAsTemplate = async (datasetId: string, name: string, description?: string) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.SAVE_AS_TEMPLATE, {
        datasetId,
        name,
        description,
      });
      if (result.success) {
        ElMessage.success(`模板已保存，包含 ${result.data.columnCount} 列的阈值配置`);
        await loadUserTemplates();
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("保存模板失败:", error);
      ElMessage.error(error.message || "保存模板失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 更新用户自定义模板
   */
  const updateUserTemplate = async (
    templateId: number,
    updates: {
      name?: string;
      description?: string;
      templateData?: Record<string, { min: number; max: number; unit?: string }>;
    }
  ) => {
    try {
      saving.value = true;
      const args: any = { templateId: String(templateId) };
      if (updates.name !== undefined) args.name = updates.name;
      if (updates.description !== undefined) args.description = updates.description;
      if (updates.templateData !== undefined) args.templateData = JSON.stringify(updates.templateData);

      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.UPDATE_USER_TEMPLATE, args);
      if (result.success) {
        ElMessage.success("模板已更新");
        await loadUserTemplates();
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("更新模板失败:", error);
      ElMessage.error(error.message || "更新模板失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 导出模板为 JSON 文件（纯前端）
   */
  const exportTemplateAsJson = (template: UserTemplateListItem) => {
    const exportData = {
      name: template.name,
      description: template.description,
      columns: template.thresholds,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${template.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success("模板已导出");
  };

  /**
   * 删除用户自定义模板
   */
  const deleteUserTemplate = async (templateId: number) => {
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.DELETE_USER_TEMPLATE, {
        templateId: String(templateId),
      });
      if (result.success) {
        userTemplates.value = userTemplates.value.filter(t => t.id !== templateId);
        ElMessage.success("模板已删除");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("删除模板失败:", error);
      ElMessage.error(error.message || "删除模板失败");
      return false;
    }
  };

  /**
   * 应用用户自定义模板
   */
  const applyUserTemplate = async (datasetId: string, templateId: number) => {
    try {
      saving.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.APPLY_USER_TEMPLATE, {
        datasetId,
        templateId: String(templateId),
      });
      if (result.success) {
        const { appliedCount, skippedCount, totalInTemplate } = result.data;
        ElMessage.success(
          `已应用模板：匹配 ${appliedCount} 列，跳过 ${skippedCount} 列（模板共 ${totalInTemplate} 列）`
        );
        await loadColumnThresholds(datasetId);
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("应用模板失败:", error);
      ElMessage.error(error.message || "应用模板失败");
      return false;
    } finally {
      saving.value = false;
    }
  };

  /**
   * 重置状态
   */
  const reset = () => {
    columnThresholds.value = [];
    detectionConfigs.value = [];
  };

  return {
    // 状态
    detectionMethods,
    columnThresholds,
    thresholdTemplates,
    userTemplates,
    detectionConfigs,
    loading,
    saving,

    // 计算属性
    availableMethods,
    thresholdMethods,
    statisticalMethods,
    mlMethods,

    // Actions
    loadDetectionMethods,
    loadColumnThresholds,
    updateColumnThreshold,
    batchUpdateThresholds,
    loadThresholdTemplates,
    applyThresholdTemplate,
    loadUserTemplates,
    saveAsTemplate,
    updateUserTemplate,
    deleteUserTemplate,
    applyUserTemplate,
    exportTemplateAsJson,
    loadDetectionConfigs,
    createDetectionConfig,
    updateDetectionConfig,
    deleteDetectionConfig,
    resolveColumnThreshold,

    // 检测执行
    executeThresholdDetection,
    executeDetection,
    getDetectionResults,
    getDetectionResultDetails,
    getOutlierResultStats,
    deleteDetectionResult,
    renameDetectionResult,
    applyOutlierFiltering,
    revertOutlierFiltering,

    reset,
  };
});
