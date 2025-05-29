<template>
  <div class="space-y-6">
    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center h-32">
      <el-icon class="animate-spin text-2xl text-emerald-600">
        <Loading />
      </el-icon>
      <span class="ml-2 text-gray-600">分析数据中...</span>
    </div>

    <template v-else-if="datasetInfo">
      <!-- 统计摘要和列信息 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 数据统计摘要 -->
        <div class="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-800">📊 数据统计摘要</h3>
            <el-button text size="small" @click="$emit('refresh')" :loading="refreshing">
              <el-icon>
                <Refresh />
              </el-icon>
            </el-button>
          </div>

          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-gray-600">📊 数值列:</span>
              <span class="font-medium text-gray-800">{{ columnStats.numeric }} 个</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">📝 文本列:</span>
              <span class="font-medium text-gray-800">{{ columnStats.text }} 个</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">📅 时间列:</span>
              <span class="font-medium text-gray-800">{{ columnStats.datetime }} 个</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">⚠️ 缺失值:</span>
              <span class="font-medium text-orange-600">{{ totalMissingValues }} 个</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">📈 数据质量:</span>
              <span :class="dataQualityClass" class="font-medium"> {{ dataQualityPercentage.toFixed(1) }}% </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">🎯 完整记录:</span>
              <span class="font-medium text-gray-800">{{ completeRecords.toLocaleString() }} 行</span>
            </div>
          </div>
        </div>

        <!-- 列信息预览 -->
        <div class="bg-gray-50 rounded-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-800">📋 列信息预览</h3>
            <el-input v-model="columnSearchText" placeholder="搜索列名..." size="small" style="width: 150px" clearable>
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>

          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              v-for="(col, index) in filteredColumns"
              :key="index"
              class="flex items-center justify-between p-2 bg-white rounded-md hover:bg-gray-50 transition-colors">
              <div class="flex items-center gap-3">
                <span :class="['w-2 h-2 rounded-full', getColumnStatusColor(col)]"></span>
                <span class="font-medium text-gray-700">{{ col.name }}</span>
                <el-tag :type="getColumnTypeTag(col.type)" size="small" effect="light">
                  {{ getColumnTypeLabel(col.type) }}
                </el-tag>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="col.missingCount > 0" class="text-sm text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  {{ col.missingCount }}个缺失
                </span>
                <el-tooltip :content="getColumnTooltip(col)" placement="top">
                  <el-icon class="text-gray-400 cursor-help">
                    <InfoFilled />
                  </el-icon>
                </el-tooltip>
              </div>
            </div>
          </div>

          <div v-if="filteredColumns.length === 0" class="text-center text-gray-500 py-8">
            <el-icon class="text-2xl mb-2"><Search /></el-icon>
            <p>未找到匹配的列</p>
          </div>
        </div>
      </div>

      <!-- 数据分布可视化 -->
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">📊 数据分布可视化</h3>
          <div class="flex items-center gap-4">
            <el-select
              v-model="selectedColumn"
              placeholder="选择列"
              size="small"
              style="width: 150px"
              @change="updateVisualization">
              <el-option v-for="col in numericColumns" :key="col.name" :label="col.name" :value="col.name" />
            </el-select>
            <el-select
              v-model="chartType"
              placeholder="图表类型"
              size="small"
              style="width: 120px"
              @change="updateVisualization">
              <el-option label="直方图" value="histogram" />
              <el-option label="箱线图" value="boxplot" />
              <el-option label="散点图" value="scatter" />
            </el-select>
          </div>
        </div>

        <!-- 图表容器 -->
        <div class="h-64 w-full bg-gray-50 rounded-lg flex items-center justify-center">
          <div v-if="!selectedColumn" class="text-center text-gray-500">
            <el-icon class="text-3xl mb-2"><TrendCharts /></el-icon>
            <p>请选择一个数值列查看分布</p>
          </div>
          <div v-else-if="chartLoading" class="text-center">
            <el-icon class="animate-spin text-2xl text-emerald-600 mb-2">
              <Loading />
            </el-icon>
            <p class="text-gray-600">生成图表中...</p>
          </div>
          <div v-else class="w-full h-full p-4">
            <!-- 这里应该集成实际的图表库，如 ECharts -->
            <div
              class="w-full h-full bg-white rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <div class="text-center">
                <div class="text-4xl mb-2">📈</div>
                <p class="text-gray-600">{{ selectedColumn }} - {{ chartType }}</p>
                <p class="text-sm text-gray-500 mt-2">图表组件开发中...</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 统计信息 -->
        <div v-if="selectedColumn" class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
          <div class="bg-blue-50 p-3 rounded">
            <div class="font-medium text-blue-600">均值</div>
            <div class="text-gray-700">{{ getColumnStats(selectedColumn).mean }}</div>
          </div>
          <div class="bg-green-50 p-3 rounded">
            <div class="font-medium text-green-600">标准差</div>
            <div class="text-gray-700">{{ getColumnStats(selectedColumn).std }}</div>
          </div>
          <div class="bg-purple-50 p-3 rounded">
            <div class="font-medium text-purple-600">最小值</div>
            <div class="text-gray-700">{{ getColumnStats(selectedColumn).min }}</div>
          </div>
          <div class="bg-orange-50 p-3 rounded">
            <div class="font-medium text-orange-600">最大值</div>
            <div class="text-gray-700">{{ getColumnStats(selectedColumn).max }}</div>
          </div>
        </div>
      </div>

      <!-- 相关性分析 -->
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">🔗 变量相关性分析</h3>
          <el-button size="small" @click="calculateCorrelation" :loading="correlationLoading"> 重新计算 </el-button>
        </div>

        <div v-if="correlationLoading" class="flex items-center justify-center h-32">
          <el-icon class="animate-spin text-2xl text-emerald-600">
            <Loading />
          </el-icon>
          <span class="ml-2 text-gray-600">计算相关性中...</span>
        </div>

        <div v-else-if="correlationMatrix.length > 0" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr>
                <th class="text-left p-2 font-medium text-gray-600"></th>
                <th
                  v-for="header in correlationHeaders"
                  :key="header"
                  class="text-center p-2 font-medium text-gray-600 min-w-16">
                  {{ header }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in correlationMatrix" :key="rowIndex">
                <td class="p-2 font-medium text-gray-600">{{ row.name }}</td>
                <td v-for="(value, colIndex) in row.values" :key="colIndex" class="p-1">
                  <div :class="['text-xs font-medium text-center py-2 px-1 rounded-md', getCorrelationColor(value)]">
                    {{ value.toFixed(2) }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="text-center text-gray-500 py-8">
          <el-icon class="text-3xl mb-2"><Connection /></el-icon>
          <p>暂无相关性数据</p>
          <el-button text @click="calculateCorrelation">点击计算</el-button>
        </div>
      </div>
    </template>

    <!-- 无数据状态 -->
    <div v-else class="flex flex-col items-center justify-center h-32 text-gray-500">
      <el-icon class="text-4xl mb-2">
        <DocumentDelete />
      </el-icon>
      <span>未选择数据集</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from "vue";
import {ElMessage} from "element-plus";
import {Loading, Refresh, Search, InfoFilled, TrendCharts, DocumentDelete, Connection} from "@element-plus/icons-vue";
import type {DatasetInfo} from "@shared/types/projectInterface.ts";

// Props
interface Props {
  datasetInfo?: DatasetInfo | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

// Emits
const emit = defineEmits<{
  refresh: [];
}>();

// Reactive state
const refreshing = ref(false);
const columnSearchText = ref("");
const selectedColumn = ref("");
const chartType = ref("histogram");
const chartLoading = ref(false);
const correlationLoading = ref(false);
const correlationMatrix = ref<Array<{name: string; values: number[]}>>([]);
const correlationHeaders = ref<string[]>([]);

// Mock column data - 实际应该从API获取
const mockColumns = computed(() => {
  if (!props.datasetInfo) return [];

  return props.datasetInfo.originalFile.columns.map((colName, index) => ({
    name: colName,
    type: index % 3 === 0 ? "numeric" : index % 3 === 1 ? "text" : "datetime",
    missingCount: Math.floor(Math.random() * 20),
    nullCount: Math.floor(Math.random() * 5),
    uniqueCount: Math.floor(Math.random() * 1000) + 100,
  }));
});

// Computed properties
const columnStats = computed(() => {
  const columns = mockColumns.value;
  return {
    numeric: columns.filter(c => c.type === "numeric").length,
    text: columns.filter(c => c.type === "text").length,
    datetime: columns.filter(c => c.type === "datetime").length,
  };
});

const totalMissingValues = computed(() => {
  return mockColumns.value.reduce((sum, col) => sum + col.missingCount, 0);
});

const dataQualityPercentage = computed(() => {
  if (!props.datasetInfo) return 0;
  const totalCells = props.datasetInfo.originalFile.rows * props.datasetInfo.originalFile.columns.length;
  const missingCells = totalMissingValues.value;
  return ((totalCells - missingCells) / totalCells) * 100;
});

const dataQualityClass = computed(() => {
  const percentage = dataQualityPercentage.value;
  if (percentage >= 95) return "text-emerald-600";
  if (percentage >= 85) return "text-yellow-600";
  return "text-red-600";
});

const completeRecords = computed(() => {
  if (!props.datasetInfo) return 0;
  // 简化计算，实际应该基于实际的完整记录统计
  return props.datasetInfo.originalFile.rows - Math.floor(totalMissingValues.value / mockColumns.value.length);
});

const filteredColumns = computed(() => {
  const searchText = columnSearchText.value.toLowerCase();
  return mockColumns.value.filter(col => col.name.toLowerCase().includes(searchText));
});

const numericColumns = computed(() => {
  return mockColumns.value.filter(col => col.type === "numeric");
});

// Methods
const getColumnStatusColor = (col: any) => {
  if (col.missingCount > 10) return "bg-red-400";
  if (col.missingCount > 0) return "bg-orange-400";
  return "bg-emerald-400";
};

const getColumnTypeTag = (type: string) => {
  const typeMap: Record<string, string> = {
    numeric: "success",
    text: "info",
    datetime: "warning",
  };
  return typeMap[type] || "default";
};

const getColumnTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    numeric: "数值",
    text: "文本",
    datetime: "时间",
  };
  return typeMap[type] || type;
};

const getColumnTooltip = (col: any) => {
  return `类型: ${getColumnTypeLabel(col.type)}\n缺失值: ${col.missingCount}\n唯一值: ${col.uniqueCount}`;
};

const getColumnStats = (columnName: string) => {
  // Mock 统计数据 - 实际应该从API获取
  return {
    mean: (Math.random() * 100).toFixed(2),
    std: (Math.random() * 20).toFixed(2),
    min: (Math.random() * 10).toFixed(2),
    max: (Math.random() * 200 + 100).toFixed(2),
  };
};

const getCorrelationColor = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 0.7) return "bg-emerald-600 text-white";
  if (abs >= 0.4) return "bg-emerald-400 text-white";
  if (abs >= 0.2) return "bg-emerald-200 text-emerald-800";
  return "bg-gray-100 text-gray-600";
};

const updateVisualization = async () => {
  if (!selectedColumn.value) return;

  chartLoading.value = true;
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000));
    ElMessage.success(`已更新 ${selectedColumn.value} 的${chartType.value}图表`);
  } catch (error) {
    ElMessage.error("更新图表失败");
  } finally {
    chartLoading.value = false;
  }
};

const calculateCorrelation = async () => {
  correlationLoading.value = true;
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock correlation data
    const numericCols = numericColumns.value.slice(0, 5);
    correlationHeaders.value = numericCols.map(col => col.name);
    correlationMatrix.value = numericCols.map(row => ({
      name: row.name,
      values: numericCols.map(() => (Math.random() - 0.5) * 2), // -1 to 1
    }));

    ElMessage.success("相关性分析完成");
  } catch (error) {
    ElMessage.error("计算相关性失败");
  } finally {
    correlationLoading.value = false;
  }
};

// Watchers
watch(
  () => props.datasetInfo,
  newDataset => {
    if (newDataset && numericColumns.value.length > 0) {
      selectedColumn.value = numericColumns.value[0].name;
    }
  },
  {immediate: true}
);

// Lifecycle
onMounted(() => {
  if (props.datasetInfo && numericColumns.value.length > 0) {
    calculateCorrelation();
  }
});
</script>

<style scoped>
/* 滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* 表格样式 */
table {
  border-collapse: separate;
  border-spacing: 2px;
}

/* 相关性矩阵动画 */
tbody tr:hover {
  background-color: #f9fafb;
}
</style>
