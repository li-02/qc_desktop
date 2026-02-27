<template>
  <div class="config-panel">
    <div class="panel-header">
      <h3 class="panel-title">节点配置</h3>
      <button class="btn-close" @click="$emit('close')">✕</button>
    </div>

    <div class="panel-body">
      <!-- 基本信息 -->
      <div class="config-section">
        <label class="config-label">节点名称</label>
        <el-input v-model="localName" size="small" @blur="saveName" @keyup.enter="saveName" />
      </div>

      <div class="config-section">
        <label class="config-label">节点类型</label>
        <div class="type-tag">
          <span class="type-icon">{{ meta.icon }}</span>
          <span>{{ meta.label }}</span>
        </div>
      </div>

      <div class="config-divider"></div>

      <!-- ====== 异常检测节点：结构化配置 ====== -->
      <template v-if="node.nodeType === 'OUTLIER_DETECTION'">
        <!-- 检测方法选择 -->
        <div class="config-section">
          <label class="config-label">检测方法</label>
          <el-select
            v-model="outlierMethod"
            size="small"
            placeholder="请选择检测方法"
            style="width: 100%"
            @change="onOutlierMethodChange">
            <el-option
              v-for="m in availableDetectionMethods"
              :key="m.id"
              :label="m.name"
              :value="m.id"
              :disabled="!m.isAvailable">
              <div class="method-option">
                <span>{{ m.name }}</span>
                <span class="method-category">{{ categoryLabel(m.category) }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="selectedMethodInfo" class="method-desc">{{ selectedMethodInfo.description }}</div>
        </div>

        <!-- 阈值过滤 → 模板选择 -->
        <template v-if="outlierMethod === 'THRESHOLD_STATIC'">
          <div class="config-section">
            <label class="config-label">阈值模板</label>
            <el-select
              v-model="outlierTemplateKey"
              size="small"
              placeholder="请选择阈值模板"
              style="width: 100%"
              @change="onOutlierConfigChange">
              <el-option-group label="内置模板">
                <el-option v-for="t in builtinTemplateOptions" :key="t.value" :label="t.label" :value="t.value" />
              </el-option-group>
              <el-option-group v-if="userTemplateOptions.length" label="用户模板">
                <el-option v-for="t in userTemplateOptions" :key="t.value" :label="t.label" :value="t.value">
                  <div class="template-option">
                    <span>{{ t.label }}</span>
                    <span class="template-col-count">{{ t.columnCount }} 列</span>
                  </div>
                </el-option>
              </el-option-group>
            </el-select>
            <div class="config-help" style="margin-top: 8px">
              <p>选择阈值模板后，执行时将基于模板中的阈值配置进行过滤</p>
              <p>不选择模板则使用数据集已有的列阈值配置</p>
            </div>
          </div>
        </template>

        <!-- 非阈值方法 → 参数配置 -->
        <template v-else-if="outlierMethod && selectedMethodInfo">
          <div v-for="param in selectedMethodInfo.params" :key="param.key" class="config-section">
            <label class="config-label">{{ param.label }}</label>
            <el-input-number
              v-if="param.type === 'number'"
              v-model="outlierParams[param.key]"
              :min="param.min"
              :max="param.max"
              :step="param.step || 1"
              size="small"
              style="width: 100%"
              @change="onOutlierConfigChange" />
            <el-switch
              v-else-if="param.type === 'boolean'"
              v-model="outlierParams[param.key]"
              size="small"
              @change="onOutlierConfigChange" />
            <el-select
              v-else-if="param.type === 'select'"
              v-model="outlierParams[param.key]"
              size="small"
              style="width: 100%"
              @change="onOutlierConfigChange">
              <el-option v-for="opt in param.options" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
            <div v-if="param.tooltip" class="param-tooltip">{{ param.tooltip }}</div>
          </div>
        </template>

        <!-- 列过滤(可选) -->
        <div class="config-section">
          <label class="config-label">检测列 (可选)</label>
          <el-select
            v-model="outlierColumnNames"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            size="small"
            placeholder="留空检测所有列"
            style="width: 100%"
            @change="onOutlierConfigChange">
            <el-option v-for="col in datasetColumns" :key="col" :label="col" :value="col" />
          </el-select>
          <div class="param-tooltip">留空表示检测所有列，可多选指定列</div>
        </div>
      </template>

      <!-- ====== 其他节点类型：JSON 编辑 ====== -->
      <template v-else>
        <div class="config-section">
          <label class="config-label">参数配置 (JSON)</label>
          <el-input
            v-model="localConfig"
            type="textarea"
            :rows="12"
            :autosize="{ minRows: 8, maxRows: 20 }"
            class="config-textarea"
            @blur="saveConfig" />
          <div v-if="configError" class="config-error">{{ configError }}</div>
        </div>

        <div class="config-section">
          <label class="config-label">配置说明</label>
          <div class="config-help">
            <template v-if="node.nodeType === 'IMPUTATION'">
              <p><b>methodId</b>: 插补方法 ID (如 LINEAR, SPLINE, KNN 等)</p>
              <p><b>targetColumns</b>: 列名数组 或 null(全部列)</p>
              <p><b>params</b>: 方法参数对象(可选)</p>
              <p><b>validateSplit</b>: 验证集比例 0~0.3(可选)</p>
            </template>
            <template v-else-if="node.nodeType === 'FLUX_PARTITIONING'">
              <p><b>methodId</b>: NIGHTTIME_REICHSTEIN / DAYTIME_LASSLOP</p>
              <p><b>columnMapping</b>: {neeCol, rgCol, tairCol, vpdCol, rhCol?, ustarCol?}</p>
              <p><b>siteInfo</b>: {latDeg, longDeg, timezoneHour}</p>
              <p><b>options</b>: {ustarFiltering?: boolean}(可选)</p>
            </template>
            <template v-else-if="node.nodeType === 'CORRELATION_ANALYSIS'">
              <p><b>columns</b>: 要分析的列名数组</p>
              <p><b>method</b>: pearson / spearman / kendall</p>
              <p><b>significanceLevel</b>: 显著性水平(可选，默认0.05)</p>
            </template>
            <template v-else-if="node.nodeType === 'EXPORT'">
              <p><b>format</b>: csv / csv_bom / xlsx</p>
              <p><b>selectedColumns</b>: 列名数组(空数组=全部)</p>
              <p><b>delimiter</b>: 分隔符 "," / ";" / "\t"</p>
              <p><b>missingValueOutput</b>: 缺失值输出表示</p>
              <p><b>includeHeader</b>: 是否包含表头(默认true)</p>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import type { WorkflowNode, WorkflowNodeType } from "@shared/types/workflow";
import { NODE_TYPE_META } from "@shared/types/workflow";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type { DetectionMethod, DetectionMethodId } from "@shared/types/database";

const props = defineProps<{
  node: WorkflowNode;
  datasetId?: number;
}>();

const emit = defineEmits<{
  (e: "update", nodeId: number, updates: { nodeName?: string; configJson?: string }): void;
  (e: "close"): void;
}>();

const outlierStore = useOutlierDetectionStore();

const meta = computed(() => NODE_TYPE_META[props.node.nodeType as WorkflowNodeType]);

const localName = ref(props.node.nodeName);
const localConfig = ref(props.node.configJson || "{}");
const configError = ref("");

// ==================== 异常检测专用状态 ====================
const outlierMethod = ref<DetectionMethodId | "">("");
const outlierTemplateKey = ref("");
const outlierParams = ref<Record<string, any>>({});
const outlierColumnNames = ref<string[]>([]);
const datasetColumns = ref<string[]>([]);

const availableDetectionMethods = computed(() => outlierStore.detectionMethods);

const selectedMethodInfo = computed<DetectionMethod | undefined>(() =>
  outlierStore.detectionMethods.find(m => m.id === outlierMethod.value)
);

const builtinTemplateOptions = computed(() => {
  return Object.entries(outlierStore.thresholdTemplates).map(([key]) => ({
    value: `builtin:${key}`,
    label: key === "standard" ? "标准模板" : key === "strict" ? "严格模板" : key,
  }));
});

const userTemplateOptions = computed(() => {
  return outlierStore.userTemplates.map(t => ({
    value: `user:${t.id}`,
    label: t.name,
    columnCount: t.columnCount,
  }));
});

const categoryLabel = (cat: string) => {
  const map: Record<string, string> = { threshold: "阈值", statistical: "统计", ml: "机器学习", dl: "深度学习" };
  return map[cat] || cat;
};

// ==================== 初始化：从 configJson 解析异常检测状态 ====================
const parseOutlierConfig = (configStr: string) => {
  try {
    const cfg = JSON.parse(configStr);
    outlierMethod.value = cfg.method || "";
    outlierTemplateKey.value = cfg.templateKey || "";
    outlierParams.value = cfg.params || {};
    outlierColumnNames.value = cfg.columnNames || [];

    // 如果有方法但没有参数，填入默认值
    if (outlierMethod.value && outlierMethod.value !== "THRESHOLD_STATIC") {
      const methodInfo = outlierStore.detectionMethods.find(m => m.id === outlierMethod.value);
      if (methodInfo) {
        for (const p of methodInfo.params) {
          if (outlierParams.value[p.key] === undefined) {
            outlierParams.value[p.key] = p.default;
          }
        }
      }
    }
  } catch {
    outlierMethod.value = "";
    outlierTemplateKey.value = "";
    outlierParams.value = {};
    outlierColumnNames.value = [];
  }
};

// ==================== 异常检测配置变更 → 序列化并保存 ====================
const onOutlierMethodChange = () => {
  // 切换方法时重置参数
  outlierParams.value = {};
  outlierTemplateKey.value = "";
  if (outlierMethod.value && outlierMethod.value !== "THRESHOLD_STATIC") {
    const methodInfo = outlierStore.detectionMethods.find(m => m.id === outlierMethod.value);
    if (methodInfo) {
      for (const p of methodInfo.params) {
        outlierParams.value[p.key] = p.default;
      }
    }
  }
  onOutlierConfigChange();
};

const onOutlierConfigChange = () => {
  const columnNames = outlierColumnNames.value;

  const cfg: Record<string, any> = { method: outlierMethod.value };

  if (outlierMethod.value === "THRESHOLD_STATIC") {
    if (outlierTemplateKey.value) {
      cfg.templateKey = outlierTemplateKey.value;
    }
  } else {
    if (Object.keys(outlierParams.value).length > 0) {
      cfg.params = { ...outlierParams.value };
    }
  }

  if (columnNames.length > 0) {
    cfg.columnNames = columnNames;
  }

  const json = JSON.stringify(cfg, null, 2);
  localConfig.value = json;
  emit("update", props.node.id, { configJson: json });
};

// ==================== 通用 watch & save ====================
watch(
  () => props.node,
  n => {
    localName.value = n.nodeName;
    localConfig.value = n.configJson || "{}";
    configError.value = "";
    if (n.nodeType === "OUTLIER_DETECTION") {
      parseOutlierConfig(n.configJson || "{}");
    }
  },
  { immediate: true }
);

const saveName = () => {
  const trimmed = localName.value.trim();
  if (trimmed && trimmed !== props.node.nodeName) {
    emit("update", props.node.id, { nodeName: trimmed });
  }
};

const saveConfig = () => {
  configError.value = "";
  try {
    JSON.parse(localConfig.value);
    if (localConfig.value !== (props.node.configJson || "{}")) {
      emit("update", props.node.id, { configJson: localConfig.value });
    }
  } catch (e: any) {
    configError.value = "JSON 格式错误: " + e.message;
  }
};

// ==================== 加载数据集列 ====================
const loadDatasetColumns = async (datasetId: number) => {
  try {
    // 获取数据集信息以识别时间列
    let timeColumn = "";
    try {
      const dsResult = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_INFO, { datasetId: String(datasetId) });
      if (dsResult.success && dsResult.data?.time_column) {
        timeColumn = dsResult.data.time_column;
      }
    } catch {
      /* ignore */
    }

    const result = await window.electronAPI.invoke(API_ROUTES.OUTLIER.GET_COLUMN_THRESHOLDS, {
      datasetId: String(datasetId),
    });
    if (result.success && result.data?.columns) {
      datasetColumns.value = result.data.columns
        .map((c: any) => c.column_name)
        .filter((name: string) => name !== timeColumn);
    }
  } catch (e) {
    console.warn("加载数据集列失败:", e);
  }
};

// ==================== 初始化加载 ====================
onMounted(async () => {
  if (props.node.nodeType === "OUTLIER_DETECTION") {
    if (outlierStore.detectionMethods.length === 0) {
      await outlierStore.loadDetectionMethods();
    }
    if (Object.keys(outlierStore.thresholdTemplates).length === 0) {
      await outlierStore.loadThresholdTemplates();
    }
    if (outlierStore.userTemplates.length === 0) {
      await outlierStore.loadUserTemplates();
    }
    // 加载数据集列
    if (props.datasetId) {
      await loadDatasetColumns(props.datasetId);
    }
    // 重新解析，因为 store 数据可能刚加载完
    parseOutlierConfig(props.node.configJson || "{}");
  }
});
</script>

<style scoped>
.config-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.btn-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  color: #9ca3af;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s;
}

.btn-close:hover {
  color: #1f2937;
  background: rgba(0, 0, 0, 0.05);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.config-section {
  margin-bottom: 16px;
}

.config-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.type-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.08);
  color: #059669;
  font-size: 13px;
  font-weight: 500;
}

.type-icon {
  font-size: 16px;
}

.config-divider {
  height: 1px;
  background: rgba(229, 231, 235, 0.4);
  margin: 16px 0;
}

.config-textarea :deep(.el-textarea__inner) {
  font-family: "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
  background: rgba(249, 250, 251, 0.8);
  border-radius: 8px;
}

.config-error {
  margin-top: 6px;
  font-size: 12px;
  color: #ef4444;
}

.config-help {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.8;
  background: rgba(249, 250, 251, 0.6);
  padding: 10px 12px;
  border-radius: 8px;
}

.config-help p {
  margin: 2px 0;
}

.config-help b {
  font-family: "Courier New", monospace;
  color: #374151;
}

.method-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.method-category {
  font-size: 11px;
  color: #9ca3af;
  background: rgba(249, 250, 251, 0.8);
  padding: 1px 6px;
  border-radius: 4px;
}

.method-desc {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.template-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.template-col-count {
  font-size: 11px;
  color: #9ca3af;
}

.param-tooltip {
  margin-top: 4px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}
</style>
