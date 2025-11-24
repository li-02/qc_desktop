<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessage, ElNotification } from "element-plus";
import { Download, Refresh, InfoFilled, Setting } from "@element-plus/icons-vue";
import type { DatasetInfo } from "@shared/types/projectInterface";
import CorrelationAnalysisChart from "../charts/CorrelationAnalysisChart.vue";
import { API_ROUTES } from "@shared/constants/apiRoutes";

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

// 响应式状态
const analysisLoading = ref(false);
const csvData = ref<any>(null);
const selectedColumns = ref<string[]>([]);
const analysisType = ref<"heatmap" | "scatter-matrix" | "network" | "time-lag">("heatmap");
const correlationMethod = ref<"pearson" | "spearman" | "kendall">("pearson");
const minCorrelation = ref(0.3);
const showAdvancedSettings = ref(false);

// 计算属性
const datasetColumns = computed(() => {
  if (!props.datasetInfo?.originalFile?.columns) return [];

  // 过滤出数值列（排除时间戳）
  const numericColumns = [
    "RH",
    "NEE_VUT_REF",
    "TS_F_MDS_1",
    "SWC_F_MDS_1",
    "VPD_F_MDS",
    "TA_F_MDS",
    "NETRAD",
    "SW_IN_F",
  ];

  return props.datasetInfo.originalFile.columns
    .filter(col => numericColumns.includes(col))
    .map(col => ({
      value: col,
      label: getColumnLabel(col),
    }));
});

const analysisTypeOptions = computed(() => [
  { value: "heatmap", label: "相关性热力图", description: "以颜色深浅显示变量间相关性强度", icon: "🔥" },
  { value: "scatter-matrix", label: "散点图矩阵", description: "展示变量间的散点分布关系", icon: "📊" },
  { value: "network", label: "关系网络图", description: "以网络形式展示强相关变量关系", icon: "🕸️" },
  { value: "time-lag", label: "时间延迟分析", description: "分析变量间的时间延迟相关性", icon: "⏱️" },
]);

const correlationMethodOptions = computed(() => [
  { value: "pearson", label: "皮尔逊相关系数", description: "衡量线性相关性" },
  { value: "spearman", label: "斯皮尔曼等级相关", description: "衡量单调性相关" },
  { value: "kendall", label: "肯德尔等级相关", description: "衡量序列相关性" },
]);

// 获取列的中文标签
const getColumnLabel = (columnName: string) => {
  const labelMap: Record<string, string> = {
    RH: "相对湿度(%)",
    NEE_VUT_REF: "净生态系统交换",
    TS_F_MDS_1: "土壤温度(°C)",
    SWC_F_MDS_1: "土壤含水量",
    VPD_F_MDS: "水汽压差(Pa)",
    TA_F_MDS: "空气温度(°C)",
    NETRAD: "净辐射(W/m²)",
    SW_IN_F: "短波入射辐射(W/m²)",
  };
  return labelMap[columnName] || columnName;
};

// 读取CSV数据
const loadCsvData = async () => {
  if (!props.datasetInfo?.originalFile?.filePath) {
    ElMessage.warning("数据集文件路径不存在");
    return;
  }

  try {
    analysisLoading.value = true;
    console.log("正在读取CSV数据...");

    // 模拟API调用 - 实际项目中应该调用真实的IPC接口
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 模拟CSV数据
    const mockData = generateMockCsvData();
    csvData.value = mockData;

    console.log("CSV数据加载成功:", csvData.value);
    ElMessage.success("数据加载成功");
  } catch (error) {
    console.error("读取CSV数据失败:", error);
    ElMessage.error("数据加载失败");
  } finally {
    analysisLoading.value = false;
  }
};

// 生成模拟CSV数据
const generateMockCsvData = () => {
  const columns = [
    "TIMESTAMP",
    "RH",
    "NEE_VUT_REF",
    "TS_F_MDS_1",
    "SWC_F_MDS_1",
    "VPD_F_MDS",
    "TA_F_MDS",
    "NETRAD",
    "SW_IN_F",
  ];
  const tableData = [];

  const baseData = {
    RH: [43.9214, 50.9205, 52.0586, 53.5052, 51.3854, 54.3842, 56.4379],
    NEE_VUT_REF: [-6.5715, -2.14313, -0.450498, -1.62386, -1.91802, -0.163534, 0.235391],
    TS_F_MDS_1: [3.8, 3.8, 3.8, 3.8, 3.8, 3.8, 3.8],
    SWC_F_MDS_1: [0.18261, 0.182608, 0.182915, 0.183072, 0.182841, 0.182852, 0.1832],
    VPD_F_MDS: [294.658, 234.387, 222.963, 209.767, 224.594, 204.151, 188.354],
    TA_F_MDS: [-0.947, -2.557, -2.764, -3.243, -2.847, -3.3, -3.736],
    NETRAD: [-70.2052, -68.7972, -68.8334, -67.8122, -68.0891, -67.074, -67.1258],
    SW_IN_F: [0.937008, 0.94609, 0.929527, 0.927886, 0.937879, 0.927147, 0.931464],
  };

  // 生成200个数据点
  for (let i = 0; i < 200; i++) {
    const row: any = {
      TIMESTAMP: new Date(Date.now() - (200 - i) * 30 * 60 * 1000).toISOString(),
    };

    // 为每个数值列生成数据
    Object.keys(baseData).forEach(col => {
      const base = baseData[col as keyof typeof baseData];
      const mean = base.reduce((a, b) => a + b, 0) / base.length;
      const std = Math.sqrt(base.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / base.length);

      // 添加一些随机性
      const randomFactor = (Math.random() - 0.5) * 0.2;
      row[col] = mean + std * randomFactor;
    });

    tableData.push(row);
  }

  return {
    tableData,
    targetColumn: "",
  };
};

// 开始相关性分析
const startAnalysis = async () => {
  if (selectedColumns.value.length < 2) {
    ElMessage.warning("请至少选择两个变量进行分析");
    return;
  }

  if (!csvData.value) {
    await loadCsvData();
  }

  ElNotification({
    title: "相关性分析",
    message: `正在分析 ${selectedColumns.value.length} 个变量的相关性...`,
    type: "info",
    duration: 2000,
  });
};

// 快速选择预设变量组合
const quickSelectVariables = (preset: string) => {
  switch (preset) {
    case "climate":
      selectedColumns.value = ["TA_F_MDS", "RH", "VPD_F_MDS"];
      break;
    case "soil":
      selectedColumns.value = ["TS_F_MDS_1", "SWC_F_MDS_1"];
      break;
    case "radiation":
      selectedColumns.value = ["SW_IN_F", "NETRAD"];
      break;
    case "ecosystem":
      selectedColumns.value = ["NEE_VUT_REF", "TA_F_MDS", "SW_IN_F", "VPD_F_MDS"];
      break;
    case "all":
      selectedColumns.value = datasetColumns.value.map(col => col.value);
      break;
    default:
      selectedColumns.value = [];
  }

  // 只选择变量，不自动启动分析
  if (selectedColumns.value.length > 0) {
    ElMessage.success(`已选择 ${selectedColumns.value.length} 个变量，点击"开始分析"进行分析`);
  }
};

// 导出分析结果
const exportResults = () => {
  ElMessage.info("导出功能开发中...");
};

// 重置分析参数
const resetSettings = () => {
  selectedColumns.value = [];
  analysisType.value = "heatmap";
  correlationMethod.value = "pearson";
  minCorrelation.value = 0.3;
  csvData.value = null;
  ElMessage.success("设置已重置");
};

// 监听数据集变化
watch(
  () => props.datasetInfo,
  () => {
    selectedColumns.value = [];
    csvData.value = null;
  }
);

// 组件挂载时不自动进行分析，保持空状态
onMounted(() => {
  // 组件启动时保持空状态，等待用户手动操作
});
</script>

<template>
  <div class="correlation-panel">
    <!-- 控制面板 -->
    <div class="control-section">
      <div class="section-header">
        <div class="section-title">🔗 变量相关性分析</div>
        <div class="header-actions">
          <el-button
            size="small"
            :icon="Setting"
            @click="showAdvancedSettings = !showAdvancedSettings"
            :type="showAdvancedSettings ? 'primary' : 'default'">
            高级设置
          </el-button>
          <el-button size="small" :icon="Refresh" @click="resetSettings"> 重置 </el-button>
          <el-button size="small" :icon="Download" @click="exportResults" type="primary"> 导出 </el-button>
        </div>
      </div>

      <!-- 基本设置 -->
      <div class="basic-settings">
        <div class="setting-row">
          <div class="setting-label">
            <el-icon><InfoFilled /></el-icon>
            选择变量
          </div>
          <div class="setting-content">
            <el-select
              v-model="selectedColumns"
              multiple
              placeholder="选择要分析的变量"
              style="width: 300px"
              :max-collapse-tags="3"
              collapse-tags
              collapse-tags-tooltip>
              <el-option
                v-for="column in datasetColumns"
                :key="column.value"
                :value="column.value"
                :label="column.label">
                <span style="float: left">{{ column.label }}</span>
                <span style="float: right; color: #8492a6; font-size: 12px">{{ column.value }}</span>
              </el-option>
            </el-select>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">快速选择</div>
          <div class="setting-content">
            <div class="quick-select-buttons">
              <el-button size="small" @click="quickSelectVariables('climate')">气候变量</el-button>
              <el-button size="small" @click="quickSelectVariables('soil')">土壤变量</el-button>
              <el-button size="small" @click="quickSelectVariables('radiation')">辐射变量</el-button>
              <el-button size="small" @click="quickSelectVariables('ecosystem')">生态系统</el-button>
              <el-button size="small" @click="quickSelectVariables('all')">全部变量</el-button>
            </div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">分析方法</div>
          <div class="setting-content">
            <el-select v-model="correlationMethod" style="width: 200px">
              <el-option
                v-for="method in correlationMethodOptions"
                :key="method.value"
                :value="method.value"
                :label="method.label">
                <div>
                  <div>{{ method.label }}</div>
                  <div style="font-size: 12px; color: #8492a6">{{ method.description }}</div>
                </div>
              </el-option>
            </el-select>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">图表类型</div>
          <div class="setting-content">
            <el-radio-group v-model="analysisType" style="width: 100%">
              <div class="chart-type-grid">
                <el-radio-button
                  v-for="type in analysisTypeOptions"
                  :key="type.value"
                  :value="type.value"
                  class="chart-type-option">
                  <div class="chart-type-content">
                    <span class="chart-type-icon">{{ type.icon }}</span>
                    <span class="chart-type-label">{{ type.label }}</span>
                  </div>
                </el-radio-button>
              </div>
            </el-radio-group>
          </div>
        </div>
      </div>

      <!-- 高级设置 -->
      <div v-if="showAdvancedSettings" class="advanced-settings">
        <div class="settings-divider">
          <span>高级参数</span>
        </div>

        <div class="setting-row">
          <div class="setting-label">最小相关性阈值</div>
          <div class="setting-content">
            <el-slider
              v-model="minCorrelation"
              :min="0"
              :max="1"
              :step="0.1"
              :format-tooltip="(val: number) => val.toFixed(1)"
              style="width: 200px"
              show-input
              input-size="small" />
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">统计显著性</div>
          <div class="setting-content">
            <el-checkbox disabled>显示 p 值 (开发中)</el-checkbox>
          </div>
        </div>
      </div>

      <!-- 开始分析按钮 -->
      <div class="analysis-actions">
        <el-button
          type="primary"
          size="large"
          :loading="analysisLoading"
          @click="startAnalysis"
          :disabled="selectedColumns.length < 2">
          <template #loading>
            <el-icon><Refresh /></el-icon>
          </template>
          {{ analysisLoading ? "分析中..." : "开始分析" }}
        </el-button>

        <div class="analysis-info">
          <span v-if="selectedColumns.length >= 2">
            已选择 {{ selectedColumns.length }} 个变量，将生成
            {{ (selectedColumns.length * (selectedColumns.length - 1)) / 2 }} 个相关性对
          </span>
          <span v-else style="color: #f56c6c"> 请至少选择2个变量 </span>
        </div>
      </div>
    </div>

    <!-- 图表展示区域 -->
    <div class="chart-section">
      <CorrelationAnalysisChart
        :csv-data="csvData"
        :selected-columns="selectedColumns"
        :analysis-type="analysisType"
        :correlation-method="correlationMethod"
        :min-correlation="minCorrelation"
        :loading="analysisLoading" />
    </div>
  </div>
</template>

<style scoped>
.correlation-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  background: #f8fafc;
  min-height: 100vh;
}

/* 控制面板样式 */
.control-section {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.3);
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 设置行样式 */
.basic-settings,
.advanced-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.setting-label {
  min-width: 120px;
  font-weight: 500;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 6px;
}

.setting-content {
  flex: 1;
}

.quick-select-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chart-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
}

.chart-type-option {
  height: auto !important;
  padding: 0 !important;
}

.chart-type-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
}

.chart-type-icon {
  font-size: 16px;
}

.chart-type-label {
  font-size: 13px;
  white-space: nowrap;
}

.settings-divider {
  display: flex;
  align-items: center;
  margin: 20px 0 16px 0;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
}

.settings-divider::before,
.settings-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(229, 231, 235, 0.5);
}

.settings-divider::before {
  margin-right: 12px;
}

.settings-divider::after {
  margin-left: 12px;
}

/* 分析操作区域 */
.analysis-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(229, 231, 235, 0.3);
}

.analysis-info {
  font-size: 13px;
  color: #6b7280;
  text-align: center;
}

/* 图表区域样式 */
.chart-section {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.4);
  border-radius: 16px;
  min-height: 600px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .correlation-panel {
    padding: 12px;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .setting-label {
    min-width: auto;
  }

  .chart-type-grid {
    grid-template-columns: 1fr;
  }
}
</style>
