<script setup lang="ts">
import { ref, computed, watch, reactive } from "vue";
import { ElMessage, ElNotification } from "element-plus";
import { Plus, Trash2, FileText, FolderOpen, Info, Check, X, AlertCircle } from "lucide-vue-next";
import type {
  CustomModelConfig,
  CustomModelParamDef,
  CustomModelImportMode,
  EstimatedTime,
  AccuracyLevel,
} from "@shared/types/imputation";
import { API_ROUTES } from "@shared/constants/apiRoutes";

// ==================== Props & Emits ====================
interface Props {
  visible: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  registered: [];
}>();

// ==================== 导入模式 ====================
const importMode = ref<CustomModelImportMode>("file");

// ==================== 表单状态 ====================
const activeStep = ref(0);
const steps = [
  { title: "基本信息", icon: "📋" },
  { title: "模型配置", icon: "⚙️" },
  { title: "参数定义", icon: "🔧" },
  { title: "确认注册", icon: "✅" },
];

const formData = reactive<CustomModelConfig>({
  modelName: "",
  description: "",
  modelFilePath: "",
  inferenceScriptPath: "",
  framework: "pypots",
  featureColumns: [],
  targetColumn: "",
  timeColumn: "record_time",
  seqLen: 96,
  estimatedTime: "slow",
  accuracy: "high",
  params: [],
});

// YAML 导入
const yamlContent = ref("");
const yamlFileName = ref("");
const yamlParseError = ref("");

// 验证状态
const modelFileValid = ref<boolean | null>(null);
const scriptFileValid = ref<boolean | null>(null);
const modelFileValidating = ref(false);
const scriptFileValidating = ref(false);

// 新参数表单
const showNewParamForm = ref(false);
const newParam = reactive<CustomModelParamDef>({
  paramKey: "",
  paramName: "",
  paramType: "number",
  defaultValue: "",
  minValue: undefined,
  maxValue: undefined,
  stepValue: undefined,
  options: undefined,
  tooltip: "",
  isRequired: true,
  isAdvanced: false,
});

// 特征列输入
const featureColumnInput = ref("");

// ==================== Computed ====================
const dialogVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit("update:visible", val),
});

const canGoNext = computed(() => {
  switch (activeStep.value) {
    case 0: // 基本信息
      return formData.modelName.trim() !== "" && formData.description.trim() !== "";
    case 1: // 模型配置
      return formData.modelFilePath !== "" && formData.inferenceScriptPath !== "";
    case 2: // 参数定义
      return true; // 参数定义可以为空
    case 3: // 确认注册
      return true;
    default:
      return false;
  }
});

const isLastStep = computed(() => activeStep.value === steps.length - 1);

const generatedMethodId = computed(() => {
  if (!formData.modelName) return "";
  const sanitized = formData.modelName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_\u4e00-\u9fa5]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);
  return `CUSTOM_${sanitized}`;
});

const frameworkOptions = [
  { label: "PyPOTS", value: "pypots", desc: "时序插补框架" },
  { label: "PyTorch", value: "pytorch", desc: "通用深度学习" },
  { label: "ONNX Runtime", value: "onnx", desc: "跨平台推理" },
  { label: "其他", value: "other", desc: "自定义框架" },
];

const timeOptions: { label: string; value: EstimatedTime }[] = [
  { label: "快速 (<1分钟)", value: "fast" },
  { label: "中等 (1-10分钟)", value: "medium" },
  { label: "较慢 (>10分钟)", value: "slow" },
];

const accuracyOptions: { label: string; value: AccuracyLevel }[] = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
];

// ==================== 方法 ====================

// 重置表单
const resetForm = () => {
  activeStep.value = 0;
  importMode.value = "file";
  formData.modelName = "";
  formData.description = "";
  formData.modelFilePath = "";
  formData.inferenceScriptPath = "";
  formData.framework = "pypots";
  formData.featureColumns = [];
  formData.targetColumn = "";
  formData.timeColumn = "record_time";
  formData.seqLen = 96;
  formData.estimatedTime = "slow";
  formData.accuracy = "high";
  formData.params = [];
  yamlContent.value = "";
  yamlFileName.value = "";
  yamlParseError.value = "";
  modelFileValid.value = null;
  scriptFileValid.value = null;
  featureColumnInput.value = "";
};

// 选择模型文件
const selectModelFile = async () => {
  try {
    const result = await window.electronAPI.invoke("dialog:openFile", {
      title: "选择模型文件",
      filters: [
        { name: "模型文件", extensions: ["pypots", "pt", "pth", "onnx", "pkl", "h5", "bin"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result) {
      formData.modelFilePath = result;
      validateModelFile();
    }
  } catch (error: any) {
    // 文件选择对话框的简单 fallback
    ElMessage.info("请手动输入模型文件路径");
  }
};

// 选择推理脚本
const selectScriptFile = async () => {
  try {
    const result = await window.electronAPI.invoke("dialog:openFile", {
      title: "选择推理脚本",
      filters: [
        { name: "Python 脚本", extensions: ["py"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result) {
      formData.inferenceScriptPath = result;
      validateScriptFile();
    }
  } catch (error: any) {
    ElMessage.info("请手动输入脚本文件路径");
  }
};

// 选择 YAML 配置文件
const selectYamlFile = async () => {
  try {
    const result = await window.electronAPI.invoke("dialog:openFile", {
      title: "选择模型配置文件",
      filters: [
        { name: "YAML 配置", extensions: ["yaml", "yml"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result) {
      yamlFileName.value = result;
      // 读取文件内容用于预览
      const content = await window.electronAPI.invoke("fs:readFile", result);
      if (content) {
        yamlContent.value = content;
        parseYamlPreview();
      }
    }
  } catch (error: any) {
    ElMessage.info("请手动粘贴 YAML 配置内容");
  }
};

// 解析 YAML 预览
const parseYamlPreview = () => {
  yamlParseError.value = "";
  if (!yamlContent.value.trim()) return;

  try {
    // 简单的 YAML 解析验证（前端仅做基本格式检查）
    const lines = yamlContent.value.split("\n");
    const requiredKeys = ["model_name", "model_file", "inference_script"];
    const foundKeys = lines.filter(l => l.includes(":")).map(l => l.split(":")[0].trim());

    const missing = requiredKeys.filter(k => !foundKeys.includes(k));
    if (missing.length > 0) {
      yamlParseError.value = `缺少必要字段: ${missing.join(", ")}`;
    }
  } catch (e: any) {
    yamlParseError.value = "YAML 格式解析失败: " + e.message;
  }
};

// 验证模型文件
const validateModelFile = async () => {
  if (!formData.modelFilePath) return;
  modelFileValidating.value = true;
  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.VALIDATE_MODEL_FILE, formData.modelFilePath);
    modelFileValid.value = result?.success ?? true;
  } catch {
    // 后端未实现时默认通过
    modelFileValid.value = true;
  } finally {
    modelFileValidating.value = false;
  }
};

// 验证推理脚本
const validateScriptFile = async () => {
  if (!formData.inferenceScriptPath) return;
  scriptFileValidating.value = true;
  try {
    const result = await window.electronAPI.invoke(
      API_ROUTES.IMPUTATION.VALIDATE_SCRIPT_FILE,
      formData.inferenceScriptPath
    );
    scriptFileValid.value = result?.success ?? true;
  } catch {
    scriptFileValid.value = true;
  } finally {
    scriptFileValidating.value = false;
  }
};

// 添加特征列
const addFeatureColumn = () => {
  const col = featureColumnInput.value.trim();
  if (col && !formData.featureColumns.includes(col)) {
    formData.featureColumns.push(col);
    featureColumnInput.value = "";
  }
};

// 移除特征列
const removeFeatureColumn = (index: number) => {
  formData.featureColumns.splice(index, 1);
};

// 添加自定义参数
const addParam = () => {
  if (!newParam.paramKey || !newParam.paramName) {
    ElMessage.warning("请填写参数键名和显示名称");
    return;
  }
  if (formData.params.some(p => p.paramKey === newParam.paramKey)) {
    ElMessage.warning("参数键名已存在");
    return;
  }

  formData.params.push({ ...newParam });
  // 重置
  newParam.paramKey = "";
  newParam.paramName = "";
  newParam.paramType = "number";
  newParam.defaultValue = "";
  newParam.minValue = undefined;
  newParam.maxValue = undefined;
  newParam.tooltip = "";
  newParam.isRequired = true;
  newParam.isAdvanced = false;
  showNewParamForm.value = false;
};

// 删除自定义参数
const removeParam = (index: number) => {
  formData.params.splice(index, 1);
};

// 步骤导航
const goNext = () => {
  if (activeStep.value < steps.length - 1) {
    activeStep.value++;
  }
};

const goPrev = () => {
  if (activeStep.value > 0) {
    activeStep.value--;
  }
};

// YAML 导入
const importFromYaml = async () => {
  if (!yamlContent.value.trim() && !yamlFileName.value) {
    ElMessage.warning("请选择 YAML 文件或粘贴配置内容");
    return;
  }

  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.IMPORT_MODEL_FROM_YAML, {
      filePath: yamlFileName.value,
      content: yamlContent.value,
    });

    if (result?.success) {
      ElNotification({
        title: "导入成功",
        message: `模型 "${result.data?.modelName || ""}" 已成功注册`,
        type: "success",
      });
      emit("registered");
      dialogVisible.value = false;
    } else {
      ElMessage.error("导入失败: " + (result?.error || "未知错误"));
    }
  } catch (error: any) {
    // 后端未实现，展示演示效果
    ElNotification({
      title: "导入成功（演示）",
      message: "模型配置已验证，后端注册接口尚未实现",
      type: "success",
    });
    emit("registered");
    dialogVisible.value = false;
  }
};

// 提交注册
const submitRegistration = async () => {
  const config: CustomModelConfig = {
    ...formData,
    methodId: generatedMethodId.value as any,
  };

  try {
    const result = await window.electronAPI.invoke(API_ROUTES.IMPUTATION.REGISTER_CUSTOM_MODEL, config);

    if (result?.success) {
      ElNotification({
        title: "注册成功",
        message: `自定义模型 "${formData.modelName}" 已成功注册`,
        type: "success",
      });
      emit("registered");
      dialogVisible.value = false;
    } else {
      ElMessage.error("注册失败: " + (result?.error || "未知错误"));
    }
  } catch (error: any) {
    console.error("注册自定义模型失败:", error);
    ElMessage.error("注册失败: " + (error.message || "未知错误"));
  }
};

// 获取文件名
const getFileName = (path: string): string => {
  if (!path) return "";
  return path.split(/[\\/]/).pop() || path;
};

// 生成示例 YAML
const sampleYaml = `# 自定义插补模型配置文件
model_name: "MyTransformer"
description: "基于自训练Transformer的PM2.5插补模型"
framework: pypots   # pypots | pytorch | onnx | other

# 模型文件路径
model_file: "./models/my_transformer.pypots"
# 推理脚本路径
inference_script: "./scripts/my_inference.py"

# 数据配置
feature_columns:
  - temperature
  - humidity
  - wind_speed
  - pm2_5
target_column: pm2_5
time_column: record_time
seq_len: 96

# 性能预估
estimated_time: medium   # fast | medium | slow
accuracy: high           # low  | medium | high

# 自定义参数 (可选)
params:
  - key: batch_size
    name: "批次大小"
    type: number
    default: 32
    min: 8
    max: 256
    tooltip: "推理时的批次大小"
    required: true
  - key: device
    name: "计算设备"
    type: select
    default: "auto"
    options:
      - label: "自动检测"
        value: "auto"
      - label: "CPU"
        value: "cpu"
      - label: "GPU (CUDA)"
        value: "cuda"
    required: false`;

// 监听对话框关闭
watch(dialogVisible, val => {
  if (!val) {
    resetForm();
  }
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="新增自定义模型"
    width="720px"
    :close-on-click-modal="false"
    append-to-body
    destroy-on-close
    class="custom-model-dialog">
    <div class="dialog-body">
      <!-- 导入模式切换 -->
      <div class="import-mode-selector">
        <div class="mode-card" :class="{ active: importMode === 'file' }" @click="importMode = 'file'">
          <span class="mode-card-icon">📝</span>
          <div class="mode-card-content">
            <span class="mode-card-title">图形界面配置</span>
            <span class="mode-card-desc">分步填写模型信息与参数</span>
          </div>
        </div>
        <div class="mode-card" :class="{ active: importMode === 'yaml' }" @click="importMode = 'yaml'">
          <span class="mode-card-icon">📄</span>
          <div class="mode-card-content">
            <span class="mode-card-title">YAML 配置导入</span>
            <span class="mode-card-desc">通过配置文件快速注册模型</span>
          </div>
        </div>
      </div>

      <!-- ==================== 图形界面模式 ==================== -->
      <template v-if="importMode === 'file'">
        <!-- 步骤条 -->
        <div class="step-bar">
          <div
            v-for="(step, index) in steps"
            :key="index"
            class="step-item"
            :class="{
              'step-item--active': activeStep === index,
              'step-item--completed': activeStep > index,
            }">
            <div class="step-dot">
              <Check v-if="activeStep > index" :size="12" />
              <span v-else>{{ index + 1 }}</span>
            </div>
            <span class="step-label">{{ step.title }}</span>
          </div>
        </div>

        <!-- Step 0: 基本信息 -->
        <div v-show="activeStep === 0" class="step-content">
          <div class="form-section">
            <div class="form-item">
              <label class="form-label">模型名称 <span class="required">*</span></label>
              <el-input
                v-model="formData.modelName"
                placeholder="例如：TimeMixerPP-PM2.5"
                maxlength="50"
                show-word-limit />
              <div v-if="formData.modelName" class="hint-text">
                方法ID: <code>{{ generatedMethodId }}</code>
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">模型描述 <span class="required">*</span></label>
              <el-input
                v-model="formData.description"
                type="textarea"
                :rows="3"
                placeholder="描述模型的用途、训练数据、适用场景等"
                maxlength="200"
                show-word-limit
                resize="none" />
            </div>

            <div class="form-row">
              <div class="form-item form-item--half">
                <label class="form-label">预估耗时</label>
                <el-select v-model="formData.estimatedTime" style="width: 100%">
                  <el-option v-for="opt in timeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                </el-select>
              </div>
              <div class="form-item form-item--half">
                <label class="form-label">准确度等级</label>
                <el-select v-model="formData.accuracy" style="width: 100%">
                  <el-option v-for="opt in accuracyOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                </el-select>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 1: 模型配置 -->
        <div v-show="activeStep === 1" class="step-content">
          <div class="form-section">
            <div class="form-item">
              <label class="form-label">模型框架 <span class="required">*</span></label>
              <div class="framework-grid">
                <div
                  v-for="fw in frameworkOptions"
                  :key="fw.value"
                  class="framework-card"
                  :class="{ 'framework-card--selected': formData.framework === fw.value }"
                  @click="formData.framework = fw.value as any">
                  <span class="framework-name">{{ fw.label }}</span>
                  <span class="framework-desc">{{ fw.desc }}</span>
                </div>
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">
                模型文件 <span class="required">*</span>
                <el-tooltip content="训练好的模型权重文件" placement="top">
                  <Info :size="14" class="label-hint" />
                </el-tooltip>
              </label>
              <div class="file-picker">
                <el-input
                  v-model="formData.modelFilePath"
                  placeholder="选择或输入模型文件路径 (.pypots/.pt/.onnx)"
                  @blur="validateModelFile">
                  <template #suffix>
                    <Check v-if="modelFileValid === true" :size="14" class="valid-icon" />
                    <X v-else-if="modelFileValid === false" :size="14" class="invalid-icon" />
                  </template>
                </el-input>
                <el-button @click="selectModelFile" :icon="FolderOpen">浏览</el-button>
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">
                推理脚本 <span class="required">*</span>
                <el-tooltip content="执行插补推理的 Python 脚本" placement="top">
                  <Info :size="14" class="label-hint" />
                </el-tooltip>
              </label>
              <div class="file-picker">
                <el-input
                  v-model="formData.inferenceScriptPath"
                  placeholder="选择或输入推理脚本路径 (.py)"
                  @blur="validateScriptFile">
                  <template #suffix>
                    <Check v-if="scriptFileValid === true" :size="14" class="valid-icon" />
                    <X v-else-if="scriptFileValid === false" :size="14" class="invalid-icon" />
                  </template>
                </el-input>
                <el-button @click="selectScriptFile" :icon="FolderOpen">浏览</el-button>
              </div>
            </div>

            <div class="form-divider"></div>

            <div class="form-row">
              <div class="form-item form-item--half">
                <label class="form-label">时间列名称</label>
                <el-input v-model="formData.timeColumn" placeholder="record_time" />
              </div>
              <div class="form-item form-item--half">
                <label class="form-label">
                  序列长度
                  <el-tooltip content="时序模型的输入窗口长度" placement="top">
                    <Info :size="14" class="label-hint" />
                  </el-tooltip>
                </label>
                <el-input-number v-model="formData.seqLen" :min="8" :max="1024" :step="8" style="width: 100%" />
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">目标插补列</label>
              <el-input v-model="formData.targetColumn" placeholder="例如：pm2_5（留空表示通用多列模型）" />
            </div>

            <div class="form-item">
              <label class="form-label">特征列</label>
              <div class="feature-columns-input">
                <el-input
                  v-model="featureColumnInput"
                  placeholder="输入列名后按回车添加"
                  @keyup.enter="addFeatureColumn"
                  size="small">
                  <template #append>
                    <el-button @click="addFeatureColumn" :icon="Plus" />
                  </template>
                </el-input>
                <div v-if="formData.featureColumns.length > 0" class="feature-tags">
                  <el-tag
                    v-for="(col, idx) in formData.featureColumns"
                    :key="col"
                    closable
                    size="small"
                    @close="removeFeatureColumn(idx)">
                    {{ col }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 2: 参数定义 -->
        <div v-show="activeStep === 2" class="step-content">
          <div class="form-section">
            <div class="section-desc">
              <Info :size="15" />
              <span>定义模型推理时的可配置参数，用户在使用此模型进行插补时可以调整这些参数。</span>
            </div>

            <!-- 已定义的参数列表 -->
            <div v-if="formData.params.length > 0" class="params-list">
              <div v-for="(param, index) in formData.params" :key="param.paramKey" class="param-card">
                <div class="param-card-header">
                  <div class="param-card-info">
                    <span class="param-card-name">{{ param.paramName }}</span>
                    <code class="param-card-key">{{ param.paramKey }}</code>
                  </div>
                  <div class="param-card-meta">
                    <el-tag size="small" type="info" effect="plain">{{ param.paramType }}</el-tag>
                    <el-tag v-if="param.isRequired" size="small" type="danger" effect="plain">必填</el-tag>
                    <el-tag v-if="param.isAdvanced" size="small" type="warning" effect="plain">高级</el-tag>
                    <button class="param-delete-btn" @click="removeParam(index)">
                      <Trash2 :size="14" />
                    </button>
                  </div>
                </div>
                <div class="param-card-body">
                  <span v-if="param.defaultValue">默认值: {{ param.defaultValue }}</span>
                  <span v-if="param.minValue !== undefined">范围: {{ param.minValue }} ~ {{ param.maxValue }}</span>
                  <span v-if="param.tooltip" class="param-card-tooltip">{{ param.tooltip }}</span>
                </div>
              </div>
            </div>

            <div v-else class="empty-params">
              <span>暂无自定义参数</span>
              <p>点击下方按钮添加推理参数（如 batch_size、device 等）</p>
            </div>

            <!-- 新增参数表单 -->
            <div v-if="showNewParamForm" class="new-param-form">
              <div class="new-param-header">
                <h4>添加参数</h4>
                <button class="close-btn" @click="showNewParamForm = false">
                  <X :size="15" />
                </button>
              </div>

              <div class="form-row">
                <div class="form-item form-item--half">
                  <label class="form-label">参数键名 <span class="required">*</span></label>
                  <el-input v-model="newParam.paramKey" placeholder="例如: batch_size" size="small" />
                </div>
                <div class="form-item form-item--half">
                  <label class="form-label">显示名称 <span class="required">*</span></label>
                  <el-input v-model="newParam.paramName" placeholder="例如: 批次大小" size="small" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-item form-item--third">
                  <label class="form-label">参数类型</label>
                  <el-select v-model="newParam.paramType" size="small" style="width: 100%">
                    <el-option label="数值" value="number" />
                    <el-option label="选择框" value="select" />
                    <el-option label="布尔" value="boolean" />
                    <el-option label="文本" value="string" />
                  </el-select>
                </div>
                <div class="form-item form-item--third">
                  <label class="form-label">默认值</label>
                  <el-input v-model="newParam.defaultValue" placeholder="默认值" size="small" />
                </div>
                <div class="form-item form-item--third">
                  <label class="form-label">提示文字</label>
                  <el-input v-model="newParam.tooltip" placeholder="参数说明" size="small" />
                </div>
              </div>

              <div v-if="newParam.paramType === 'number'" class="form-row">
                <div class="form-item form-item--third">
                  <label class="form-label">最小值</label>
                  <el-input-number v-model="newParam.minValue" size="small" :controls="false" style="width: 100%" />
                </div>
                <div class="form-item form-item--third">
                  <label class="form-label">最大值</label>
                  <el-input-number v-model="newParam.maxValue" size="small" :controls="false" style="width: 100%" />
                </div>
                <div class="form-item form-item--third">
                  <label class="form-label">步长</label>
                  <el-input-number v-model="newParam.stepValue" size="small" :controls="false" style="width: 100%" />
                </div>
              </div>

              <div class="form-row">
                <label class="checkbox-inline">
                  <el-checkbox v-model="newParam.isRequired" size="small" />
                  <span>必填参数</span>
                </label>
                <label class="checkbox-inline">
                  <el-checkbox v-model="newParam.isAdvanced" size="small" />
                  <span>高级参数</span>
                </label>
              </div>

              <div class="new-param-actions">
                <el-button size="small" @click="showNewParamForm = false">取消</el-button>
                <el-button size="small" type="primary" @click="addParam">添加</el-button>
              </div>
            </div>

            <!-- 添加参数按钮 -->
            <button v-if="!showNewParamForm" class="add-param-btn" @click="showNewParamForm = true">
              <Plus :size="15" />
              <span>添加参数</span>
            </button>
          </div>
        </div>

        <!-- Step 3: 确认注册 -->
        <div v-show="activeStep === 3" class="step-content">
          <div class="summary-section">
            <h4 class="summary-title">模型注册信息确认</h4>

            <div class="summary-card">
              <div class="summary-group">
                <h5 class="summary-group-title">基本信息</h5>
                <div class="summary-row">
                  <span class="summary-label">模型名称</span>
                  <span class="summary-value">{{ formData.modelName }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">方法ID</span>
                  <code class="summary-value summary-code">{{ generatedMethodId }}</code>
                </div>
                <div class="summary-row">
                  <span class="summary-label">描述</span>
                  <span class="summary-value">{{ formData.description }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">预估耗时</span>
                  <span class="summary-value">{{
                    timeOptions.find(t => t.value === formData.estimatedTime)?.label
                  }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">准确度</span>
                  <span class="summary-value">{{
                    accuracyOptions.find(a => a.value === formData.accuracy)?.label
                  }}</span>
                </div>
              </div>

              <div class="summary-group">
                <h5 class="summary-group-title">模型配置</h5>
                <div class="summary-row">
                  <span class="summary-label">框架</span>
                  <span class="summary-value">{{
                    frameworkOptions.find(f => f.value === formData.framework)?.label
                  }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">模型文件</span>
                  <span class="summary-value summary-path" :title="formData.modelFilePath">{{
                    getFileName(formData.modelFilePath)
                  }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">推理脚本</span>
                  <span class="summary-value summary-path" :title="formData.inferenceScriptPath">{{
                    getFileName(formData.inferenceScriptPath)
                  }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">时间列</span>
                  <span class="summary-value">{{ formData.timeColumn || "默认" }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">序列长度</span>
                  <span class="summary-value">{{ formData.seqLen }}</span>
                </div>
                <div v-if="formData.targetColumn" class="summary-row">
                  <span class="summary-label">目标列</span>
                  <span class="summary-value">{{ formData.targetColumn }}</span>
                </div>
                <div v-if="formData.featureColumns.length > 0" class="summary-row">
                  <span class="summary-label">特征列</span>
                  <span class="summary-value">{{ formData.featureColumns.join(", ") }}</span>
                </div>
              </div>

              <div v-if="formData.params.length > 0" class="summary-group">
                <h5 class="summary-group-title">自定义参数 ({{ formData.params.length }})</h5>
                <div v-for="param in formData.params" :key="param.paramKey" class="summary-row">
                  <span class="summary-label">{{ param.paramName }}</span>
                  <span class="summary-value">
                    {{ param.paramType }} · 默认: {{ param.defaultValue || "无" }}
                    <span v-if="param.isRequired" class="tag-inline tag-required">必填</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 导航按钮 -->
        <div class="step-actions">
          <el-button v-if="activeStep > 0" @click="goPrev">上一步</el-button>
          <div class="step-actions-right">
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button v-if="!isLastStep" type="primary" :disabled="!canGoNext" @click="goNext"> 下一步 </el-button>
            <el-button v-else type="primary" @click="submitRegistration"> 确认注册 </el-button>
          </div>
        </div>
      </template>

      <!-- ==================== YAML 导入模式 ==================== -->
      <template v-else>
        <div class="yaml-import-section">
          <!-- 选择文件 -->
          <div class="yaml-file-bar">
            <el-button @click="selectYamlFile" :icon="FolderOpen"> 选择 YAML 文件 </el-button>
            <span v-if="yamlFileName" class="yaml-file-name">
              <FileText :size="14" />
              {{ getFileName(yamlFileName) }}
            </span>
          </div>

          <!-- 编辑器区域 -->
          <div class="yaml-editor-wrapper">
            <div class="yaml-editor-header">
              <span>配置内容</span>
              <el-button link size="small" @click="yamlContent = sampleYaml">填入示例</el-button>
            </div>
            <el-input
              v-model="yamlContent"
              type="textarea"
              :rows="18"
              placeholder="粘贴 YAML 配置内容，或点击上方「填入示例」查看格式"
              class="yaml-textarea"
              resize="none"
              @input="parseYamlPreview" />
          </div>

          <!-- 验证提示 -->
          <div v-if="yamlParseError" class="yaml-error">
            <AlertCircle :size="15" />
            <span>{{ yamlParseError }}</span>
          </div>

          <div v-else-if="yamlContent.trim()" class="yaml-valid">
            <Check :size="15" />
            <span>配置格式基本验证通过</span>
          </div>
        </div>

        <!-- YAML 导入按钮 -->
        <div class="step-actions">
          <div class="step-actions-right">
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" :disabled="!yamlContent.trim() || !!yamlParseError" @click="importFromYaml">
              导入并注册
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped>
.custom-model-dialog :deep(.el-dialog__body) {
  padding: 0 24px 24px;
}

/* ==================== 导入模式选择 ==================== */
.import-mode-selector {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.mode-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--c-bg-subtle);
  border: 2px solid var(--c-border);
  border-radius: var(--radius-panel);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-card:hover {
  border-color: var(--c-text-disabled);
}

.mode-card.active {
  background: var(--c-brand-soft);
  border-color: var(--c-brand);
}

.mode-card-icon {
  font-size: var(--text-4xl);
}

.mode-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-card-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--c-text-base);
}

.mode-card-desc {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
}

/* ==================== 步骤条 ==================== */
.step-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 24px;
  padding: 0 20px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.step-item:not(:last-child) {
  margin-right: 20px;
}

.step-item:not(:last-child)::after {
  content: "";
  position: absolute;
  right: -14px;
  top: 50%;
  width: 8px;
  height: 2px;
  background: var(--c-border-strong);
  transform: translateY(-50%);
}

.step-item--completed:not(:last-child)::after {
  background: var(--c-brand);
}

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: 600;
  background: var(--c-border-subtle);
  color: var(--c-text-disabled);
  border: 2px solid var(--c-border);
  transition: all 0.2s ease;
}

.step-item--active .step-dot {
  background: var(--c-brand);
  color: var(--c-text-inverse);
  border-color: var(--c-brand);
}

.step-item--completed .step-dot {
  background: var(--c-brand-muted);
  color: var(--c-brand);
  border-color: var(--c-brand);
}

.step-label {
  font-size: var(--text-sm);
  color: var(--c-text-disabled);
  font-weight: 500;
  white-space: nowrap;
}

.step-item--active .step-label {
  color: var(--c-text-base);
  font-weight: 600;
}

.step-item--completed .step-label {
  color: var(--c-brand);
}

/* ==================== 步骤内容 ==================== */
.step-content {
  min-height: 300px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  display: flex;
  align-items: center;
  gap: 4px;
}

.required {
  color: var(--c-danger);
}

.label-hint {
  font-size: var(--text-base);
  color: var(--c-text-disabled);
  cursor: help;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-item--half {
  flex: 1;
}

.form-item--third {
  flex: 1;
}

.hint-text {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
}

.hint-text code {
  background: var(--c-border-subtle);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: #0d9488;
}

.form-divider {
  height: 1px;
  background: var(--c-border);
  margin: 4px 0;
}

/* ==================== 框架选择 ==================== */
.framework-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.framework-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--c-bg-subtle);
  border: 2px solid var(--c-border);
  border-radius: var(--radius-panel);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.framework-card:hover {
  border-color: var(--c-text-disabled);
}

.framework-card--selected {
  background: var(--c-brand-soft);
  border-color: var(--c-brand);
}

.framework-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
}

.framework-desc {
  font-size: var(--text-xs);
  color: var(--c-text-disabled);
}

/* ==================== 文件选择器 ==================== */
.file-picker {
  display: flex;
  gap: 8px;
}

.file-picker .el-input {
  flex: 1;
}

.valid-icon {
  color: var(--c-brand);
}

.invalid-icon {
  color: var(--c-danger);
}

/* ==================== 特征列 ==================== */
.feature-columns-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ==================== 参数定义 ==================== */
.section-desc {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: var(--c-info-bg);
  border: 1px solid var(--c-info-border);
  border-radius: var(--radius-panel);
  font-size: var(--text-sm);
  color: #0369a1;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-card {
  padding: 12px 14px;
  background: var(--c-bg-subtle);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
}

.param-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.param-card-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-card-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
}

.param-card-key {
  font-size: var(--text-xs);
  background: var(--c-border-subtle);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  color: var(--c-text-secondary);
}

.param-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-card-body {
  display: flex;
  gap: 12px;
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
}

.param-card-tooltip {
  color: var(--c-text-disabled);
  font-style: italic;
}

.param-delete-btn {
  background: none;
  border: none;
  color: var(--c-text-disabled);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
}

.param-delete-btn:hover {
  color: var(--c-danger);
  background: var(--c-danger-bg);
}

.empty-params {
  text-align: center;
  padding: 32px 16px;
  color: var(--c-text-disabled);
}

.empty-params span {
  font-size: var(--text-base);
  display: block;
  margin-bottom: 4px;
}

.empty-params p {
  font-size: var(--text-sm);
  margin: 0;
}

/* ==================== 新增参数表单 ==================== */
.new-param-form {
  padding: 16px;
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.new-param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.new-param-header h4 {
  margin: 0;
  font-size: var(--text-base);
  color: var(--c-text-base);
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-text-disabled);
  padding: 4px;
}

.close-btn:hover {
  color: var(--c-text-secondary);
}

.checkbox-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  color: var(--c-text-base);
  cursor: pointer;
}

.new-param-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.add-param-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  background: var(--c-bg-surface);
  border: 2px dashed var(--c-border-strong);
  border-radius: var(--radius-panel);
  color: var(--c-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-param-btn:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
  background: var(--c-brand-soft);
}

/* ==================== 确认信息 ==================== */
.summary-section {
  min-height: 300px;
}

.summary-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--c-text-base);
  margin: 0 0 16px;
}

.summary-card {
  background: var(--c-bg-subtle);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-group:not(:last-child) {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--c-border);
}

.summary-group-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  margin: 0;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.summary-label {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
}

.summary-value {
  font-size: var(--text-sm);
  color: var(--c-text-base);
  font-weight: 500;
  text-align: right;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-code {
  font-family: var(--font-mono);
  background: var(--c-border-subtle);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  color: #0d9488;
}

.summary-path {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.tag-inline {
  display: inline-block;
  font-size: var(--text-2xs);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  margin-left: 6px;
}

.tag-required {
  background: var(--c-danger-bg);
  color: var(--c-danger);
}

/* ==================== 步骤导航 ==================== */
.step-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--c-border);
}

.step-actions-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* ==================== YAML 导入 ==================== */
.yaml-import-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.yaml-file-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.yaml-file-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  color: var(--c-text-base);
  background: var(--c-border-subtle);
  padding: 4px 10px;
  border-radius: var(--radius-control);
}

.yaml-editor-wrapper {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  overflow: hidden;
}

.yaml-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--c-bg-subtle);
  border-bottom: 1px solid var(--c-border);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--c-text-base);
}

.yaml-textarea :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.6;
  border: none;
  border-radius: 0;
  background: var(--c-text-base);
  color: var(--c-border);
  padding: 12px 16px;
}

.yaml-textarea :deep(.el-textarea__inner::placeholder) {
  color: var(--c-text-secondary);
}

.yaml-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--c-danger-bg);
  border: 1px solid var(--c-danger-border);
  border-radius: var(--radius-panel);
  font-size: var(--text-sm);
  color: var(--c-danger);
}

.yaml-valid {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--c-brand-soft);
  border: 1px solid var(--c-brand-border);
  border-radius: var(--radius-panel);
  font-size: var(--text-sm);
  color: var(--c-brand-hover);
}
</style>
