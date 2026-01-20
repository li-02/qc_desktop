import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import { useDatasetStore } from "./useDatasetStore";

export interface ColumnMissingStats {
  columnName: string;
  missingCount: number;
  totalCount: number;
  missingRate: number;
  sampleRows?: any[];
}

export interface VersionMissingStats {
  datasetId: number;
  versionId: number;
  totalRows: number;
  totalColumns: number;
  totalMissingValues: number;
  overallMissingRate: number;
  columnStats: ColumnMissingStats[];
  lastUpdated: number;
  missingMarkers: string[];
  timeDistribution?: {
    monthly: Record<string, number>;
    hourly: Record<string, number>;
    heatmap: Record<string, number>;
  };
}

export const useGapFillingStore = defineStore("gapFilling", () => {
  // 状态
  const selectedDatasetId = ref<number | null>(null);
  const selectedVersionId = ref<number | null>(null);
  const missingStats = ref<VersionMissingStats | null>(null);
  const loading = ref(false);
  const detectionHistory = ref<VersionMissingStats[]>([]);

  // 计算属性
  const hasStats = computed(() => missingStats.value !== null);
  const totalMissingCount = computed(() => missingStats.value?.totalMissingValues || 0);
  const overallMissingRate = computed(() => missingStats.value?.overallMissingRate || 0);

  // 获取当前数据集的缺失值标记
  const getMissingMarkers = (_datasetId: string): string[] => {
    const datasetStore = useDatasetStore();

    // 使用新的计算属性
    return datasetStore.currentDatasetMissingMarkers;
  };

  // 设置目标版本
  const setTargetVersion = (datasetId: number, versionId: number) => {
    selectedDatasetId.value = datasetId;
    selectedVersionId.value = versionId;
  };

  // 前端本地检测缺失值（用于小样本数据）
  const detectMissingInMemory = (rows: any[], missingMarkers: string[]): ColumnMissingStats[] => {
    if (!rows.length) return [];

    const columns = Object.keys(rows[0]);
    const totalRows = rows.length;

    return columns.map(columnName => {
      let missingCount = 0;
      const sampleRows: any[] = [];

      rows.forEach((row, index) => {
        const value = row[columnName];
        let isMissing = false;

        // 检查是否为 null 或 undefined
        if (value === null || value === undefined) {
          isMissing = true;
        }
        // 检查是否匹配缺失标记
        else if (typeof value === 'string') {
          // 精确匹配缺失标记
          isMissing = missingMarkers.includes(value);
        }
        // 检查是否为字符串形式的 NaN
        else if (typeof value === 'string' && (value.toLowerCase() === 'nan' || value.toLowerCase() === 'na')) {
          isMissing = true;
        }

        if (isMissing) {
          missingCount++;
          // 收集少量样本行用于显示
          if (sampleRows.length < 5) {
            sampleRows.push({
              rowIndex: index,
              value: value,
              isMissing: true
            });
          }
        }
      });

      return {
        columnName,
        missingCount,
        totalCount: totalRows,
        missingRate: (missingCount / totalRows) * 100,
        sampleRows
      };
    });
  };

  // 加载版本缺失统计信息
  const loadVersionMissingStats = async (
    datasetId: number,
    versionId: number,
    customMissingMarkers?: string[]
  ): Promise<VersionMissingStats | null> => {
    try {
      loading.value = true;

      // 获取缺失值标记
      const missingMarkers = customMissingMarkers || getMissingMarkers(String(datasetId));

      // 调用后端获取统计信息
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSION_MISSING_STATS, {
        datasetId: String(datasetId),
        versionId: String(versionId),
        missingMarkers: [...missingMarkers]
      });

      if (result.success) {
        const stats = result.data;
        missingStats.value = {
          datasetId,
          versionId,
          totalRows: stats.totalRows,
          totalColumns: stats.columnStats.length,
          totalMissingValues: stats.totalMissingValues,
          overallMissingRate: stats.overallMissingRate,
          columnStats: stats.columnStats,
          lastUpdated: Date.now(),
          missingMarkers,
          timeDistribution: stats.timeDistribution
        };

        // 添加到历史记录
        addToHistory(missingStats.value);

        return missingStats.value;
      } else {
        throw new Error(result.error || '获取缺失值统计失败');
      }

    } catch (error: any) {
      console.error('加载缺失统计失败:', error);
      ElMessage.error('加载缺失统计失败: ' + error.message);
      return null;
    } finally {
      loading.value = false;
    }
  };

  // 获取版本样本数据（辅助方法）
  const getVersionSampleData = async (versionId: number, limit: number = 100): Promise<any[]> => {
    try {
      // 这里需要根据实际的API接口来获取样本数据
      // 暂时使用一个通用的获取方法
      const result = await window.electronAPI.invoke('datasets:getVersionSample', {
        versionId: String(versionId),
        limit
      });

      if (result.success) {
        return result.data.rows || [];
      } else {
        console.warn('获取样本数据失败:', result.error);
        return [];
      }
    } catch (error) {
      console.error('获取版本样本数据失败:', error);
      return [];
    }
  };

  // 添加到历史记录
  const addToHistory = (stats: VersionMissingStats) => {
    // 检查是否已存在相同的记录
    const existingIndex = detectionHistory.value.findIndex(
      h => h.datasetId === stats.datasetId && h.versionId === stats.versionId
    );

    if (existingIndex >= 0) {
      // 更新现有记录
      detectionHistory.value[existingIndex] = stats;
    } else {
      // 添加新记录
      detectionHistory.value.unshift(stats);
      // 保持历史记录不超过10个
      if (detectionHistory.value.length > 10) {
        detectionHistory.value = detectionHistory.value.slice(0, 10);
      }
    }
  };

  // 清除统计信息
  const clearStats = () => {
    missingStats.value = null;
    selectedDatasetId.value = null;
    selectedVersionId.value = null;
  };

  // 获取历史记录中的统计信息
  const getHistoryStats = (datasetId: number, versionId: number): VersionMissingStats | null => {
    return detectionHistory.value.find(
      h => h.datasetId === datasetId && h.versionId === versionId
    ) || null;
  };

  return {
    // 状态
    selectedDatasetId,
    selectedVersionId,
    missingStats,
    loading,
    detectionHistory,

    // 计算属性
    hasStats,
    totalMissingCount,
    overallMissingRate,

    // 方法
    setTargetVersion,
    detectMissingInMemory,
    loadVersionMissingStats,
    getHistoryStats,
    clearStats,
    getVersionSampleData
  };
});