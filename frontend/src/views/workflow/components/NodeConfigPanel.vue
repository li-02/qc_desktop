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

      <!-- ====== 缺失值插补节点：结构化配置 ====== -->
      <template v-else-if="node.nodeType === 'IMPUTATION'">
        <!-- 插补方法选择 -->
        <div class="config-section">
          <label class="config-label">插补方法</label>
          <el-select
            v-model="imputationMethod"
            size="small"
            placeholder="请选择插补方法"
            style="width: 100%"
            @change="onImputationMethodChange">
            <el-option
              v-for="m in availableImputationMethods"
              :key="m.methodId"
              :label="m.methodName"
              :value="m.methodId"
              :disabled="!m.isAvailable">
              <div class="method-option">
                <span>{{ m.methodName }}</span>
                <span class="method-category">{{ imputationCategoryLabel(m.category) }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="selectedImputationMethodInfo" class="method-desc">
            {{ selectedImputationMethodInfo.description }}
          </div>
        </div>

        <!-- 模型类方法配置：与普通缺失值插补模块保持一致 -->
        <template v-if="imputationIsModelBased">
          <div class="config-section">
            <label class="config-label">插补模型</label>
            <el-input
              v-model="imputationModelSearch"
              size="small"
              clearable
              placeholder="搜索模型名称、目标指标或特征列"
              class="model-search-input" />
            <el-select
              v-model="imputationSelectedModelId"
              size="small"
              clearable
              placeholder="请选择插补模型"
              style="width: 100%"
              @change="onImputationModelChange">
              <el-option
                v-for="model in filteredImputationModels"
                :key="model.id"
                :label="getImputationModelLabel(model)"
                :value="model.id">
                <div class="method-option">
                  <span>{{ getImputationModelLabel(model) }}</span>
                  <span class="method-category">{{ model.targetColumn || "通用" }}</span>
                </div>
              </el-option>
            </el-select>
            <div v-if="imputationModels.length === 0" class="param-tooltip">
              未找到此方法的可用模型，请先在缺失值插补模块中注册或训练模型
            </div>
            <div v-else class="param-tooltip">此处展示该方法下的全部模型；列名映射使用当前配置数据集的列</div>
          </div>

          <div v-if="selectedImputationModel?.featureColumns?.length" class="config-section">
            <label class="config-label">列名映射</label>
            <div class="column-mapping-list">
              <div v-for="modelCol in selectedImputationModel.featureColumns" :key="modelCol" class="column-mapping-row">
                <span class="mapping-model-col">{{ modelCol }}</span>
                <el-select
                  v-model="imputationColumnMapping[modelCol]"
                  size="small"
                  clearable
                  filterable
                  placeholder="请选择数据列"
                  style="flex: 1"
                  @change="onImputationConfigChange">
                  <el-option v-for="col in datasetColumns" :key="col" :label="col" :value="col" />
                </el-select>
              </div>
            </div>
            <div class="param-tooltip">将模型训练时的特征列映射到当前数据集中的实际列名</div>
          </div>
        </template>

        <!-- 方法参数（动态加载） -->
        <template v-if="imputationMethod && imputationMethodParams.length > 0">
          <div v-for="param in imputationMethodParams" :key="param.paramKey" class="config-section">
            <label class="config-label">{{ param.paramName }}</label>
            <el-input-number
              v-if="param.paramType === 'number'"
              v-model="imputationParams[param.paramKey]"
              :min="param.minValue"
              :max="param.maxValue"
              :step="param.stepValue || 1"
              size="small"
              style="width: 100%"
              @change="onImputationConfigChange" />
            <el-switch
              v-else-if="param.paramType === 'boolean'"
              v-model="imputationParams[param.paramKey]"
              size="small"
              @change="onImputationConfigChange" />
            <el-select
              v-else-if="param.paramType === 'select'"
              v-model="imputationParams[param.paramKey]"
              size="small"
              style="width: 100%"
              @change="onImputationConfigChange">
              <el-option
                v-for="opt in getImputationParamOptions(param)"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value" />
            </el-select>
            <el-slider
              v-else-if="param.paramType === 'range'"
              v-model="imputationParams[param.paramKey]"
              :min="param.minValue"
              :max="param.maxValue"
              :step="param.stepValue || 1"
              show-input
              size="small"
              @change="onImputationConfigChange" />
            <el-input
              v-else-if="param.paramType === 'string'"
              v-model="imputationParams[param.paramKey]"
              size="small"
              :placeholder="param.tooltip || '请输入'"
              @blur="onImputationConfigChange"
              @keyup.enter="onImputationConfigChange" />
            <div v-if="param.tooltip" class="param-tooltip">{{ param.tooltip }}</div>
          </div>
        </template>

        <!-- 插补列（可选） -->
        <div class="config-section">
          <label class="config-label">插补列 (可选)</label>
          <el-select
            v-model="imputationTargetColumns"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            size="small"
            placeholder="留空插补所有缺失列"
            style="width: 100%"
            @change="onImputationConfigChange">
            <el-option v-for="col in datasetColumns" :key="col" :label="col" :value="col" />
          </el-select>
          <div class="param-tooltip">留空表示插补所有列，可多选指定列</div>
        </div>

      </template>

      <!-- ====== 数据导出节点：结构化配置 ====== -->
      <template v-else-if="node.nodeType === 'EXPORT'">
        <!-- 导出格式 -->
        <div class="config-section">
          <label class="config-label">导出格式</label>
          <el-select v-model="exportFormat" size="small" style="width: 100%" @change="onExportConfigChange">
            <el-option label="CSV (UTF-8)" value="csv" />
            <el-option label="CSV (带 BOM，Excel 兼容)" value="csv_bom" />
            <el-option label="Excel (.xlsx)" value="xlsx" />
          </el-select>
        </div>

        <!-- 分隔符（仅 CSV 格式显示） -->
        <div v-if="exportFormat !== 'xlsx'" class="config-section">
          <label class="config-label">CSV 分隔符</label>
          <el-select v-model="exportDelimiter" size="small" style="width: 100%" @change="onExportConfigChange">
            <el-option label="逗号 (,)" value="," />
            <el-option label="分号 (;)" value=";" />
            <el-option label="制表符 (Tab)" value="\t" />
          </el-select>
        </div>

        <!-- 导出列（可选） -->
        <div class="config-section">
          <label class="config-label">导出列 (可选)</label>
          <el-select
            v-model="exportSelectedColumns"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            size="small"
            placeholder="留空导出所有列"
            style="width: 100%"
            @change="onExportConfigChange">
            <el-option v-for="col in datasetColumns" :key="col" :label="col" :value="col" />
          </el-select>
          <div class="param-tooltip">留空表示导出所有列，可多选指定列</div>
        </div>

        <!-- 缺失值表示 -->
        <div class="config-section">
          <label class="config-label">缺失值输出表示</label>
          <el-input
            v-model="exportMissingValueOutput"
            size="small"
            placeholder="留空则输出为空字符串"
            @blur="onExportConfigChange" />
          <div class="param-tooltip">例如填写 NaN、NA、-9999 等</div>
        </div>

        <!-- 包含表头 -->
        <div class="config-section">
          <label class="config-label">包含表头</label>
          <el-switch v-model="exportIncludeHeader" size="small" @change="onExportConfigChange" />
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
            <template v-if="node.nodeType === 'FLUX_PARTITIONING'">
              <p><b>methodId</b>: NIGHTTIME_REICHSTEIN / DAYTIME_LASSLOP</p>
              <p><b>columnMapping</b>: {neeCol, rgCol, tairCol, vpdCol, rhCol?, ustarCol?}</p>
              <p><b>siteInfo</b>: {latDeg, longDeg, timezoneHour}</p>
              <p><b>options</b>: {ustarFiltering?: boolean}(可选)</p>
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
import type { ImputationMethod, ImputationMethodParam, ImputationMethodId, ImputationModel } from "@shared/types/imputation";

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

const availableDetectionMethods = computed(() => outlierStore.availableMethods);

const selectedMethodInfo = computed<DetectionMethod | undefined>(() =>
  outlierStore.detectionMethods.find(m => m.id === outlierMethod.value)
);

const builtinTemplateOptions = computed(() => {
  return Object.entries(outlierStore.thresholdTemplates).map(([key]) => ({
    value: `builtin:${key}`,
    label: key === "standard" ? "标准模板" : key,
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

// ==================== 缺失值插补专用状态 ====================
const imputationMethod = ref<ImputationMethodId | "">("");
const imputationParams = ref<Record<string, any>>({});
const imputationTargetColumns = ref<string[]>([]);
const imputationMethods = ref<ImputationMethod[]>([]);
const imputationMethodParams = ref<ImputationMethodParam[]>([]);
const imputationMethodParamsCache = ref<Record<string, ImputationMethodParam[]>>({});
const imputationModels = ref<ImputationModel[]>([]);
const imputationSelectedModelId = ref<number | null>(null);
const imputationColumnMapping = ref<Record<string, string>>({});
const imputationModelSearch = ref("");

const availableImputationMethods = computed(() => imputationMethods.value);

const selectedImputationMethodInfo = computed<ImputationMethod | undefined>(() =>
  imputationMethods.value.find(m => m.methodId === imputationMethod.value)
);

const imputationIsModelBased = computed(() => {
  const method = selectedImputationMethodInfo.value;
  return !!method && ["ml", "dl", "custom"].includes(method.category);
});

const selectedImputationModel = computed<ImputationModel | null>(() => {
  if (!imputationSelectedModelId.value) return null;
  return imputationModels.value.find(m => m.id === imputationSelectedModelId.value) || null;
});

const filteredImputationModels = computed(() => {
  const keyword = imputationModelSearch.value.trim().toLowerCase();
  if (!keyword) return imputationModels.value;
  return imputationModels.value.filter(model =>
    [
      model.modelName,
      model.targetColumn,
      model.modelPath,
      model.featureColumns?.join(" "),
      model.trainingColumns?.join(" "),
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(keyword))
  );
});

const imputationCategoryLabel = (cat: string) => {
  const map: Record<string, string> = {
    basic: "基础",
    statistical: "统计",
    ml: "机器学习",
    dl: "深度学习",
  };
  return map[cat] || cat;
};

const getImputationParamOptions = (param: ImputationMethodParam): { label: string; value: any }[] => {
  if (!param.options) return [];
  try {
    const opts = JSON.parse(param.options);
    return opts.map((o: any) => ({ label: o.label, value: o.value }));
  } catch {
    return [];
  }
};

const getImputationModelLabel = (model: ImputationModel) => model.modelName || model.targetColumn || `模型 #${model.id}`;

const convertImputationParamDefault = (param: ImputationMethodParam) => {
  if (param.defaultValue === null) return undefined;
  switch (param.paramType) {
    case "number":
    case "range":
      return Number(param.defaultValue);
    case "boolean":
      return param.defaultValue === "true";
    default:
      return param.defaultValue;
  }
};

// 加载插补方法列表
const loadImputationMethods = async () => {
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_AVAILABLE_METHODS);
    if (result.success) {
      imputationMethods.value = result.data;
    }
  } catch (e) {
    console.warn("加载插补方法失败:", e);
  }
};

// 加载选中方法的参数定义
const loadImputationMethodParams = async (methodId: string) => {
  if (!methodId) {
    imputationMethodParams.value = [];
    return;
  }
  if (imputationMethodParamsCache.value[methodId]) {
    imputationMethodParams.value = imputationMethodParamsCache.value[methodId];
    return;
  }
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_METHOD_PARAMS, methodId);
    if (result.success) {
      imputationMethodParamsCache.value[methodId] = result.data;
      imputationMethodParams.value = result.data;
    }
  } catch (e) {
    console.warn("加载插补方法参数失败:", e);
    imputationMethodParams.value = [];
  }
};

const initImputationColumnMapping = () => {
  const model = selectedImputationModel.value;
  if (!model?.featureColumns?.length) {
    imputationColumnMapping.value = {};
    return;
  }

  const nextMapping: Record<string, string> = {};
  const cols = datasetColumns.value;
  const lowerCols = cols.map(col => col.toLowerCase());

  for (const modelCol of model.featureColumns) {
    if (model.columnMapping?.[modelCol]) {
      nextMapping[modelCol] = model.columnMapping[modelCol];
      continue;
    }
    if (imputationColumnMapping.value[modelCol]) {
      nextMapping[modelCol] = imputationColumnMapping.value[modelCol];
      continue;
    }
    if (cols.includes(modelCol)) {
      nextMapping[modelCol] = modelCol;
      continue;
    }

    const modelColLower = modelCol.toLowerCase();
    const exactIndex = lowerCols.indexOf(modelColLower);
    if (exactIndex >= 0) {
      nextMapping[modelCol] = cols[exactIndex];
      continue;
    }

    const fuzzyIndex = lowerCols.findIndex(col => col.includes(modelColLower));
    nextMapping[modelCol] = fuzzyIndex >= 0 ? cols[fuzzyIndex] : "";
  }

  imputationColumnMapping.value = nextMapping;
};

const applySelectedImputationModelParams = () => {
  const model = selectedImputationModel.value;
  if (!model?.modelParams) return;
  imputationParams.value = {
    ...imputationParams.value,
    ...Object.fromEntries(Object.entries(model.modelParams).filter(([, value]) => value !== null && value !== undefined)),
  };
};

const loadImputationModelsForMethod = async () => {
  imputationModels.value = [];
  imputationSelectedModelId.value = null;
  imputationColumnMapping.value = {};
  imputationModelSearch.value = "";

  if (!imputationMethod.value || !imputationIsModelBased.value) return;

  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.GET_MODELS_BY_METHOD, {
      methodId: imputationMethod.value,
    });
    if (result.success && Array.isArray(result.data)) {
      imputationModels.value = result.data;
    }
  } catch (e) {
    console.warn("加载插补模型失败:", e);
  }
};

const onImputationModelChange = () => {
  initImputationColumnMapping();
  applySelectedImputationModelParams();
  onImputationConfigChange();
};

// 从 configJson 解析插补配置
const parseImputationConfig = async (configStr: string) => {
  try {
    const cfg = JSON.parse(configStr);
    imputationMethod.value = cfg.methodId || "";
    imputationParams.value = cfg.params || {};
    imputationTargetColumns.value = cfg.targetColumns || [];
    imputationSelectedModelId.value = cfg.modelId || null;
    imputationColumnMapping.value = cfg.columnMapping || {};

    if (imputationMethod.value) {
      await loadImputationMethodParams(imputationMethod.value);
      // 填充缺省参数值
      for (const p of imputationMethodParams.value) {
        if (imputationParams.value[p.paramKey] === undefined && p.defaultValue !== null) {
          const val = convertImputationParamDefault(p);
          imputationParams.value[p.paramKey] = val;
        }
      }
      await loadImputationModelsForMethod();
      if (cfg.modelId) {
        imputationSelectedModelId.value = cfg.modelId;
        initImputationColumnMapping();
      }
    }
  } catch {
    imputationMethod.value = "";
    imputationParams.value = {};
    imputationTargetColumns.value = [];
    imputationMethodParams.value = [];
    imputationModels.value = [];
    imputationSelectedModelId.value = null;
    imputationColumnMapping.value = {};
    imputationModelSearch.value = "";
  }
};

// 切换方法时重置参数
const onImputationMethodChange = async () => {
  imputationParams.value = {};
  imputationModels.value = [];
  imputationSelectedModelId.value = null;
  imputationColumnMapping.value = {};
  await loadImputationMethodParams(imputationMethod.value as string);
  // 填充默认值
  for (const p of imputationMethodParams.value) {
    if (p.defaultValue !== null) {
      const val = convertImputationParamDefault(p);
      imputationParams.value[p.paramKey] = val;
    }
  }
  await loadImputationModelsForMethod();
  onImputationConfigChange();
};

// 配置变更 → 序列化
const onImputationConfigChange = () => {
  const cfg: Record<string, any> = { methodId: imputationMethod.value };
  if (Object.keys(imputationParams.value).length > 0) {
    cfg.params = { ...imputationParams.value };
  }
  if (imputationTargetColumns.value.length > 0) {
    cfg.targetColumns = imputationTargetColumns.value;
  } else {
    cfg.targetColumns = null;
  }
  if (imputationIsModelBased.value) {
    if (imputationSelectedModelId.value) {
      cfg.modelId = imputationSelectedModelId.value;
    }
    if (Object.keys(imputationColumnMapping.value).length > 0) {
      cfg.columnMapping = { ...imputationColumnMapping.value };
    }
  }
  const json = JSON.stringify(cfg, null, 2);
  localConfig.value = json;
  emit("update", props.node.id, { configJson: json });
};

// ==================== 数据导出专用状态 ====================
const exportFormat = ref<"csv" | "csv_bom" | "xlsx">("csv");
const exportDelimiter = ref<"," | ";" | "\t">(",");
const exportSelectedColumns = ref<string[]>([]);
const exportMissingValueOutput = ref("");
const exportIncludeHeader = ref(true);

const parseExportConfig = (configStr: string) => {
  try {
    const cfg = JSON.parse(configStr);
    exportFormat.value = cfg.format || "csv";
    exportDelimiter.value = cfg.delimiter || ",";
    exportSelectedColumns.value = cfg.selectedColumns || [];
    exportMissingValueOutput.value = cfg.missingValueOutput ?? "";
    exportIncludeHeader.value = cfg.includeHeader !== false;
  } catch {
    exportFormat.value = "csv";
    exportDelimiter.value = ",";
    exportSelectedColumns.value = [];
    exportMissingValueOutput.value = "";
    exportIncludeHeader.value = true;
  }
};

const onExportConfigChange = () => {
  const cfg: Record<string, any> = {
    format: exportFormat.value,
    selectedColumns: exportSelectedColumns.value,
    includeHeader: exportIncludeHeader.value,
  };
  if (exportFormat.value !== "xlsx") {
    cfg.delimiter = exportDelimiter.value;
  }
  if (exportMissingValueOutput.value !== "") {
    cfg.missingValueOutput = exportMissingValueOutput.value;
  }
  const json = JSON.stringify(cfg, null, 2);
  localConfig.value = json;
  emit("update", props.node.id, { configJson: json });
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
    } else if (n.nodeType === "IMPUTATION") {
      parseImputationConfig(n.configJson || "{}");
    } else if (n.nodeType === "EXPORT") {
      parseExportConfig(n.configJson || "{}");
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

const reloadDatasetColumnsForCurrentNode = async (datasetId?: number) => {
  if (!["OUTLIER_DETECTION", "IMPUTATION", "EXPORT"].includes(props.node.nodeType)) return;
  if (!datasetId) {
    datasetColumns.value = [];
    return;
  }

  await loadDatasetColumns(datasetId);
  if (props.node.nodeType === "IMPUTATION") {
    const prevMapping = JSON.stringify(imputationColumnMapping.value);
    initImputationColumnMapping();
    if (selectedImputationModel.value && JSON.stringify(imputationColumnMapping.value) !== prevMapping) {
      onImputationConfigChange();
    }
  }
};

watch(
  () => props.datasetId,
  async datasetId => {
    await reloadDatasetColumnsForCurrentNode(datasetId);
  }
);

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
  } else if (props.node.nodeType === "IMPUTATION") {
    await loadImputationMethods();
    // 加载数据集列（复用同一份列表）
    if (props.datasetId) {
      await loadDatasetColumns(props.datasetId);
    }
    // 重新解析（方法列表已加载完）
    await parseImputationConfig(props.node.configJson || "{}");
  } else if (props.node.nodeType === "EXPORT") {
    if (props.datasetId) {
      await loadDatasetColumns(props.datasetId);
    }
    parseExportConfig(props.node.configJson || "{}");
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
  border-bottom: 1px solid var(--c-border);
}

.panel-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--c-text-primary);
  margin: 0;
}

.btn-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--text-xl);
  color: var(--c-text-muted);
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
}

.btn-close:hover {
  color: var(--c-text-primary);
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
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.type-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-control);
  background: rgba(16, 185, 129, 0.08);
  color: var(--c-brand-active);
  font-size: var(--text-sm);
  font-weight: 500;
}

.type-icon {
  font-size: var(--text-xl);
}

.config-divider {
  height: 1px;
  background: var(--c-border);
  margin: 16px 0;
}

.config-textarea :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.6;
  background: var(--c-bg-muted);
  border-radius: var(--radius-control);
}

.config-error {
  margin-top: 6px;
  font-size: var(--text-sm);
  color: var(--c-danger);
}

.config-help {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  line-height: 1.8;
  background: var(--c-bg-muted);
  padding: 10px 12px;
  border-radius: var(--radius-panel);
}

.config-help p {
  margin: 2px 0;
}

.config-help b {
  font-family: var(--font-mono);
  color: var(--c-text-base);
}

.method-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.method-category {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  background: var(--c-bg-muted);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

.method-desc {
  margin-top: 6px;
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  line-height: 1.5;
}

.template-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.template-col-count {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.param-tooltip {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  line-height: 1.4;
}

.column-mapping-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-search-input {
  width: 100%;
  margin-bottom: 8px;
}

.column-mapping-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mapping-model-col {
  flex: 0 0 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  background: var(--c-bg-muted);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
}
</style>
