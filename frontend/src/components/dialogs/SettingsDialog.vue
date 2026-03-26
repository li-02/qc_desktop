<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Setting, Document, Search, View, Edit, Download, Delete, Close, Check, Plus } from "@element-plus/icons-vue";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import type { UserTemplateListItem, ThresholdTemplateEntry } from "@shared/types/database";

const outlierStore = useOutlierDetectionStore();

// 对话框状态
const dialogVisible = ref(false);
const saving = ref(false);

// 左侧导航当前选中分类
const activeCategory = ref<"templates">("templates");

const navCategories = [
  { key: "templates", label: "模板管理", icon: Document },
];

// ==================== 模板管理 - 阈值行数组类型 ====================

interface ThresholdRow {
  columnName: string;
  min: number;
  max: number;
  unit: string;
}

// 将 thresholds 对象转换为可编辑行数组
const thresholdsToRows = (thresholds: Record<string, { min: number; max: number; unit?: string }>): ThresholdRow[] => {
  return Object.entries(thresholds).map(([columnName, val]) => ({
    columnName,
    min: val.min ?? 0,
    max: val.max ?? 0,
    unit: val.unit ?? "",
  }));
};

// 将行数组转换回 thresholds 对象
const rowsToThresholds = (rows: ThresholdRow[]): Record<string, { min: number; max: number; unit?: string }> => {
  const result: Record<string, { min: number; max: number; unit?: string }> = {};
  for (const row of rows) {
    const key = row.columnName.trim();
    if (key) {
      result[key] = { min: row.min, max: row.max, unit: row.unit || undefined };
    }
  }
  return result;
};

// ==================== 模板管理 - 列表与展开 ====================

const tmplSearchText = ref("");
const tmplExpandedId = ref<number | null>(null);
const builtinExpanded = ref<string | null>(null);

const filteredUserTemplates = computed(() => {
  const search = tmplSearchText.value.toLowerCase().trim();
  if (!search) return outlierStore.userTemplates;
  return outlierStore.userTemplates.filter(
    t => t.name.toLowerCase().includes(search) || t.columnNames.some((c: string) => c.toLowerCase().includes(search))
  );
});

const builtinTemplateList = computed(() =>
  Object.entries(outlierStore.thresholdTemplates).map(([key, data]) => ({
    key,
    label: key === "standard" ? "标准模板" : key,
    columnCount: Object.keys(data).length,
    data: data as Record<string, ThresholdTemplateEntry>,
  }))
);

const filteredBuiltinTemplates = computed(() => {
  const search = tmplSearchText.value.toLowerCase().trim();
  if (!search) return builtinTemplateList.value;
  return builtinTemplateList.value.filter(
    t => t.label.toLowerCase().includes(search) || Object.keys(t.data).some(c => c.toLowerCase().includes(search))
  );
});

const toggleExpand = (id: number) => {
  if (tmplEditingId.value === id) return;
  tmplExpandedId.value = tmplExpandedId.value === id ? null : id;
};

const toggleBuiltinExpand = (key: string) => {
  if (builtinEditingKey.value === key) return;
  builtinExpanded.value = builtinExpanded.value === key ? null : key;
};

// ==================== 模板管理 - 内置模板编辑 ====================

const builtinEditingKey = ref<string | null>(null);
const builtinEditForm = ref<{ name: string; description: string }>({ name: "", description: "" });
const builtinEditRows = ref<ThresholdRow[]>([]);

const startBuiltinEdit = (bt: { key: string; label: string; data: Record<string, ThresholdTemplateEntry> }) => {
  cancelEdit();
  cancelCreate();
  builtinEditingKey.value = bt.key;
  builtinEditForm.value = { name: bt.label, description: "" };
  builtinEditRows.value = Object.entries(bt.data).map(([columnName, val]) => ({
    columnName,
    min: val.min,
    max: val.max,
    unit: val.unit ?? "",
  }));
  builtinExpanded.value = bt.key;
};

const cancelBuiltinEdit = () => {
  builtinEditingKey.value = null;
  builtinEditForm.value = { name: "", description: "" };
  builtinEditRows.value = [];
};

const addBuiltinEditRow = () => {
  builtinEditRows.value.push({ columnName: "", min: 0, max: 100, unit: "" });
};

const removeBuiltinEditRow = (index: number) => {
  builtinEditRows.value.splice(index, 1);
};

const saveBuiltinEdit = async () => {
  if (!builtinEditForm.value.name.trim()) {
    ElMessage.warning("模板名称不能为空");
    return;
  }
  if (builtinEditRows.value.some(r => !r.columnName.trim())) {
    ElMessage.warning("列名不能为空");
    return;
  }
  const names = builtinEditRows.value.map(r => r.columnName.trim());
  if (new Set(names).size !== names.length) {
    ElMessage.warning("存在重复的列名");
    return;
  }
  const templateData = rowsToThresholds(builtinEditRows.value);
  const result = await outlierStore.createUserTemplate(
    builtinEditForm.value.name.trim(),
    templateData,
    builtinEditForm.value.description.trim() || undefined
  );
  if (result) cancelBuiltinEdit();
};

// ==================== 模板管理 - 编辑 ====================

const tmplEditingId = ref<number | null>(null);
const tmplEditForm = ref<{ name: string; description: string }>({ name: "", description: "" });
const tmplEditRows = ref<ThresholdRow[]>([]);

const startEdit = (tpl: UserTemplateListItem) => {
  isCreating.value = false;
  tmplEditingId.value = tpl.id;
  tmplEditForm.value = { name: tpl.name, description: tpl.description || "" };
  tmplEditRows.value = thresholdsToRows(tpl.thresholds);
  tmplExpandedId.value = tpl.id;
};

const cancelEdit = () => {
  tmplEditingId.value = null;
  tmplEditForm.value = { name: "", description: "" };
  tmplEditRows.value = [];
};

const addEditRow = () => {
  tmplEditRows.value.push({ columnName: "", min: 0, max: 100, unit: "" });
};

const removeEditRow = (index: number) => {
  tmplEditRows.value.splice(index, 1);
};

const saveEdit = async () => {
  if (!tmplEditingId.value) return;
  if (!tmplEditForm.value.name.trim()) {
    ElMessage.warning("模板名称不能为空");
    return;
  }
  // 检查列名是否有空值
  if (tmplEditRows.value.some(r => !r.columnName.trim())) {
    ElMessage.warning("列名不能为空");
    return;
  }
  // 检查列名重复
  const names = tmplEditRows.value.map(r => r.columnName.trim());
  if (new Set(names).size !== names.length) {
    ElMessage.warning("存在重复的列名");
    return;
  }

  const tpl = outlierStore.userTemplates.find((t: UserTemplateListItem) => t.id === tmplEditingId.value);
  if (!tpl) return;

  const newThresholds = rowsToThresholds(tmplEditRows.value);
  const updates: { name?: string; description?: string; templateData?: Record<string, { min: number; max: number; unit?: string }> } = {};
  if (tmplEditForm.value.name.trim() !== tpl.name) updates.name = tmplEditForm.value.name.trim();
  if (tmplEditForm.value.description !== (tpl.description || "")) updates.description = tmplEditForm.value.description;
  updates.templateData = newThresholds;

  const success = await outlierStore.updateUserTemplate(tmplEditingId.value, updates);
  if (success) cancelEdit();
};

// ==================== 模板管理 - 新建 ====================

const isCreating = ref(false);
const createForm = ref<{ name: string; description: string }>({ name: "", description: "" });
const createRows = ref<ThresholdRow[]>([]);

const startCreate = () => {
  cancelEdit();
  isCreating.value = true;
  createForm.value = { name: "", description: "" };
  createRows.value = [{ columnName: "", min: 0, max: 100, unit: "" }];
};

const cancelCreate = () => {
  isCreating.value = false;
  createForm.value = { name: "", description: "" };
  createRows.value = [];
};

const addCreateRow = () => {
  createRows.value.push({ columnName: "", min: 0, max: 100, unit: "" });
};

const removeCreateRow = (index: number) => {
  createRows.value.splice(index, 1);
};

const saveCreate = async () => {
  if (!createForm.value.name.trim()) {
    ElMessage.warning("模板名称不能为空");
    return;
  }
  if (createRows.value.some(r => !r.columnName.trim())) {
    ElMessage.warning("列名不能为空");
    return;
  }
  const names = createRows.value.map(r => r.columnName.trim());
  if (new Set(names).size !== names.length) {
    ElMessage.warning("存在重复的列名");
    return;
  }

  const templateData = rowsToThresholds(createRows.value);
  const result = await outlierStore.createUserTemplate(
    createForm.value.name.trim(),
    templateData,
    createForm.value.description.trim() || undefined
  );
  if (result) cancelCreate();
};

// ==================== 模板管理 - 删除 / 导出 ====================

const handleDeleteTemplate = async (tpl: UserTemplateListItem) => {
  try {
    await ElMessageBox.confirm(`确定要删除"${tpl.name}"模板吗？此操作不可恢复。`, "删除模板", {
      confirmButtonText: "确定", cancelButtonText: "取消", type: "warning", customClass: "qc-message-box",
    });
    await outlierStore.deleteUserTemplate(tpl.id);
    if (tmplExpandedId.value === tpl.id) tmplExpandedId.value = null;
    if (tmplEditingId.value === tpl.id) cancelEdit();
  } catch { /* 用户取消 */ }
};

const handleExportTemplate = (tpl: UserTemplateListItem) => {
  outlierStore.exportTemplateAsJson(tpl);
};

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return dateStr; }
};

// ==================== 对话框控制 ====================

const open = async () => {
  outlierStore.loadUserTemplates();
  outlierStore.loadThresholdTemplates();
  cancelEdit();
  cancelCreate();
  cancelBuiltinEdit();
  tmplExpandedId.value = null;
  builtinExpanded.value = null;
  tmplSearchText.value = "";
  dialogVisible.value = true;
};

const close = () => {
  if (saving.value) return;
  dialogVisible.value = false;
};

defineExpose({ open, close });
</script>

<template>
  <div>
    <el-dialog
      v-model="dialogVisible"
      width="860px"
      class="settings-dialog"
      :close-on-click-modal="!saving"
      :close-on-press-escape="!saving"
      align-center>
      <template #header>
        <div class="dialog-header">
          <div class="dialog-header-icon">
            <el-icon><Setting /></el-icon>
          </div>
          <div class="dialog-header-text">
            <div class="dialog-title">系统设置</div>
            <div class="dialog-subtitle">配置应用全局参数</div>
          </div>
        </div>
      </template>

      <div class="settings-layout">
        <!-- 左侧导航 -->
        <div class="settings-nav">
          <div
            v-for="cat in navCategories"
            :key="cat.key"
            class="nav-item"
            :class="{ active: activeCategory === cat.key }"
            @click="activeCategory = cat.key as 'templates'">
            <div class="nav-item-icon">
              <el-icon><component :is="cat.icon" /></el-icon>
            </div>
            <span class="nav-item-label">{{ cat.label }}</span>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="settings-content">

          <!-- 模板管理 -->
          <div v-if="activeCategory === 'templates'" class="content-section tmpl-section">
            <div class="tmpl-topbar">
              <div class="content-section-title" style="margin-bottom:0">模板管理 <span class="section-subtitle">异常值检测阈值模板</span></div>
              <el-button v-if="!isCreating" size="small" type="primary" :icon="Plus" @click="startCreate" class="create-tmpl-btn">新建模板</el-button>
              <el-button v-else size="small" :icon="Close" @click="cancelCreate">取消新建</el-button>
            </div>

            <!-- 新建模板面板 -->
            <div v-if="isCreating" class="create-panel">
              <div class="create-panel-title">新建模板</div>
              <div class="create-fields">
                <div class="edit-field-row">
                  <label class="edit-field-label">名称 <span class="required">*</span></label>
                  <el-input v-model="createForm.name" size="small" placeholder="模板名称" maxlength="50" show-word-limit class="edit-name-input" />
                </div>
                <div class="edit-field-row">
                  <label class="edit-field-label">描述</label>
                  <el-input v-model="createForm.description" type="textarea" :rows="2" placeholder="适用场景或来源说明（可选）" maxlength="200" resize="none" class="edit-desc-input" />
                </div>
              </div>
              <div class="create-rows-section">
                <div class="create-rows-header">
                  <span class="detail-section-label" style="margin-bottom:0">阈值配置</span>
                  <el-button size="small" text :icon="Plus" @click="addCreateRow" class="add-row-btn">添加列</el-button>
                </div>
                <table class="detail-table editable-table">
                  <thead>
                    <tr><th>列名</th><th>最小值</th><th>最大值</th><th>单位</th><th></th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in createRows" :key="idx">
                      <td class="col-name-cell">
                        <el-input v-model="row.columnName" size="small" placeholder="列名" class="col-name-input" />
                      </td>
                      <td class="value-cell">
                        <el-input-number v-model="row.min" size="small" :controls="false" class="threshold-input" />
                      </td>
                      <td class="value-cell">
                        <el-input-number v-model="row.max" size="small" :controls="false" class="threshold-input" />
                      </td>
                      <td class="unit-cell">
                        <el-input v-model="row.unit" size="small" placeholder="单位" class="unit-input" />
                      </td>
                      <td class="action-cell">
                        <el-button size="small" type="danger" text :icon="Delete" @click="removeCreateRow(idx)" :disabled="createRows.length <= 1"></el-button>
                      </td>
                    </tr>
                    <tr v-if="createRows.length === 0">
                      <td colspan="5" class="empty-row-hint">点击「添加列」添加阈值行</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="create-panel-footer">
                <el-button size="small" @click="cancelCreate">取消</el-button>
                <el-button size="small" type="primary" :icon="Check" @click="saveCreate" :loading="outlierStore.saving">创建模板</el-button>
              </div>
            </div>

            <!-- 搜索栏 -->
            <div class="tmpl-search">
              <el-input v-model="tmplSearchText" placeholder="搜索模板..." clearable size="small">
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
            </div>

            <el-scrollbar class="tmpl-scroll">
              <!-- 内置模板 -->
              <div class="tmpl-section-block" v-if="filteredBuiltinTemplates.length > 0">
                <div class="tmpl-section-label">内置模板 ({{ filteredBuiltinTemplates.length }})</div>
                <div class="template-list">
                  <div
                    v-for="bt in filteredBuiltinTemplates"
                    :key="bt.key"
                    class="template-card builtin"
                    :class="{ expanded: builtinExpanded === bt.key, editing: builtinEditingKey === bt.key }">

                    <!-- 内置模板编辑态头部 -->
                    <template v-if="builtinEditingKey === bt.key">
                      <div class="edit-header" @click.stop>
                        <div class="edit-fields">
                          <div class="edit-field-row">
                            <label class="edit-field-label">名称 <span class="required">*</span></label>
                            <el-input v-model="builtinEditForm.name" size="small" placeholder="新模板名称" maxlength="50" show-word-limit class="edit-name-input" />
                          </div>
                          <div class="edit-field-row">
                            <label class="edit-field-label">描述</label>
                            <el-input v-model="builtinEditForm.description" type="textarea" :rows="2" placeholder="适用场景或来源说明（可选）" maxlength="200" resize="none" class="edit-desc-input" />
                          </div>
                        </div>
                        <div class="edit-actions">
                          <el-button size="small" type="primary" :icon="Check" @click="saveBuiltinEdit" :loading="outlierStore.saving">另存为</el-button>
                          <el-button size="small" :icon="Close" @click="cancelBuiltinEdit">取消</el-button>
                        </div>
                      </div>
                    </template>

                    <!-- 内置模板正常态头部 -->
                    <template v-else>
                      <div class="tcard-header" @click="toggleBuiltinExpand(bt.key)">
                        <div class="tcard-info">
                          <div class="tcard-name">
                            <span class="builtin-badge">内置</span>{{ bt.label }}
                          </div>
                          <div class="tcard-meta">{{ bt.columnCount }} 列配置</div>
                        </div>
                        <div class="tcard-actions" @click.stop>
                          <el-button size="small" text :icon="Edit" title="编辑并另存为用户模板" @click="startBuiltinEdit(bt)"></el-button>
                          <el-icon class="expand-icon" :class="{ rotated: builtinExpanded === bt.key }"><View /></el-icon>
                        </div>
                      </div>
                    </template>

                    <!-- 阈值详情 / 编辑行区 -->
                    <transition name="tmpl-expand">
                      <div v-if="builtinExpanded === bt.key || builtinEditingKey === bt.key" class="tcard-detail">
                        <!-- 编辑态：可增删行、列名可编辑 -->
                        <template v-if="builtinEditingKey === bt.key">
                          <div class="create-rows-header">
                            <span class="detail-section-label" style="margin-bottom:0">阈值配置</span>
                            <el-button size="small" text :icon="Plus" @click="addBuiltinEditRow" class="add-row-btn">添加列</el-button>
                          </div>
                          <table class="detail-table editable-table">
                            <thead>
                              <tr><th>列名</th><th>最小值</th><th>最大值</th><th>单位</th><th></th></tr>
                            </thead>
                            <tbody>
                              <tr v-for="(row, idx) in builtinEditRows" :key="idx">
                                <td class="col-name-cell">
                                  <el-input v-model="row.columnName" size="small" placeholder="列名" class="col-name-input" />
                                </td>
                                <td class="value-cell">
                                  <el-input-number v-model="row.min" size="small" :controls="false" class="threshold-input" />
                                </td>
                                <td class="value-cell">
                                  <el-input-number v-model="row.max" size="small" :controls="false" class="threshold-input" />
                                </td>
                                <td class="unit-cell">
                                  <el-input v-model="row.unit" size="small" placeholder="单位" class="unit-input" />
                                </td>
                                <td class="action-cell">
                                  <el-button size="small" type="danger" text :icon="Delete" @click="removeBuiltinEditRow(idx)" :disabled="builtinEditRows.length <= 1"></el-button>
                                </td>
                              </tr>
                              <tr v-if="builtinEditRows.length === 0">
                                <td colspan="5" class="empty-row-hint">点击「添加列」添加阈值行</td>
                              </tr>
                            </tbody>
                          </table>
                        </template>
                        <!-- 只读态 -->
                        <template v-else>
                          <table class="detail-table">
                            <thead><tr><th>列名</th><th>最小值</th><th>最大值</th><th>单位</th></tr></thead>
                            <tbody>
                              <tr v-for="(entry, colName) in bt.data" :key="colName">
                                <td class="col-name-cell">{{ colName }}</td>
                                <td class="value-cell">{{ entry.min }}</td>
                                <td class="value-cell">{{ entry.max }}</td>
                                <td class="unit-cell">{{ entry.unit || "-" }}</td>
                              </tr>
                            </tbody>
                          </table>
                        </template>
                      </div>
                    </transition>
                  </div>
                </div>
              </div>

              <!-- 我的模板 -->
              <div class="tmpl-section-block">
                <div class="tmpl-section-label">我的模板 ({{ filteredUserTemplates.length }})</div>
                <div v-if="filteredUserTemplates.length === 0" class="tmpl-empty">
                  <div class="tmpl-empty-icon">📋</div>
                  <div class="tmpl-empty-text">{{ tmplSearchText ? "没有找到匹配的模板" : "暂无自定义模板" }}</div>
                  <div class="tmpl-empty-hint">点击「新建模板」手动创建，或在异常检测面板中保存配置</div>
                </div>
                <div class="template-list" v-else>
                  <div
                    v-for="tpl in filteredUserTemplates"
                    :key="tpl.id"
                    class="template-card user"
                    :class="{ expanded: tmplExpandedId === tpl.id, editing: tmplEditingId === tpl.id }">

                    <!-- 编辑态头部 -->
                    <template v-if="tmplEditingId === tpl.id">
                      <div class="edit-header" @click.stop>
                        <div class="edit-fields">
                          <div class="edit-field-row">
                            <label class="edit-field-label">名称 <span class="required">*</span></label>
                            <el-input v-model="tmplEditForm.name" size="small" placeholder="模板名称" maxlength="50" show-word-limit class="edit-name-input" />
                          </div>
                          <div class="edit-field-row">
                            <label class="edit-field-label">描述</label>
                            <el-input v-model="tmplEditForm.description" type="textarea" :rows="2" placeholder="适用场景或来源说明（可选）" maxlength="200" resize="none" class="edit-desc-input" />
                          </div>
                        </div>
                        <div class="edit-actions">
                          <el-button size="small" type="primary" :icon="Check" @click="saveEdit" :loading="outlierStore.saving">保存</el-button>
                          <el-button size="small" :icon="Close" @click="cancelEdit">取消</el-button>
                        </div>
                      </div>
                    </template>

                    <!-- 正常态头部 -->
                    <template v-else>
                      <div class="tcard-header" @click="toggleExpand(tpl.id)">
                        <div class="tcard-info">
                          <div class="tcard-name">{{ tpl.name }}</div>
                          <div class="tcard-meta">
                            <span>{{ tpl.columnCount }} 列</span>
                            <span class="meta-sep">·</span>
                            <span>{{ formatDate(tpl.createdAt) }}</span>
                          </div>
                        </div>
                        <div class="tcard-actions" @click.stop>
                          <el-button size="small" text :icon="Edit" title="编辑" @click="startEdit(tpl)"></el-button>
                          <el-button size="small" text :icon="Download" title="导出" @click="handleExportTemplate(tpl)"></el-button>
                          <el-button size="small" type="danger" text :icon="Delete" title="删除" @click="handleDeleteTemplate(tpl)"></el-button>
                          <el-icon class="expand-icon" :class="{ rotated: tmplExpandedId === tpl.id }"><View /></el-icon>
                        </div>
                      </div>
                      <div v-if="tpl.description && tmplExpandedId === tpl.id" class="tcard-description">{{ tpl.description }}</div>
                    </template>

                    <!-- 列阈值详情 / 编辑区 -->
                    <transition name="tmpl-expand">
                      <div v-if="tmplExpandedId === tpl.id || tmplEditingId === tpl.id" class="tcard-detail">
                        <!-- 编辑态：可增删行、列名可编辑 -->
                        <template v-if="tmplEditingId === tpl.id">
                          <div class="create-rows-header">
                            <span class="detail-section-label" style="margin-bottom:0">阈值配置</span>
                            <el-button size="small" text :icon="Plus" @click="addEditRow" class="add-row-btn">添加列</el-button>
                          </div>
                          <table class="detail-table editable-table">
                            <thead>
                              <tr><th>列名</th><th>最小值</th><th>最大值</th><th>单位</th><th></th></tr>
                            </thead>
                            <tbody>
                              <tr v-for="(row, idx) in tmplEditRows" :key="idx">
                                <td class="col-name-cell">
                                  <el-input v-model="row.columnName" size="small" placeholder="列名" class="col-name-input" />
                                </td>
                                <td class="value-cell">
                                  <el-input-number v-model="row.min" size="small" :controls="false" class="threshold-input" />
                                </td>
                                <td class="value-cell">
                                  <el-input-number v-model="row.max" size="small" :controls="false" class="threshold-input" />
                                </td>
                                <td class="unit-cell">
                                  <el-input v-model="row.unit" size="small" placeholder="单位" class="unit-input" />
                                </td>
                                <td class="action-cell">
                                  <el-button size="small" type="danger" text :icon="Delete" @click="removeEditRow(idx)" :disabled="tmplEditRows.length <= 1"></el-button>
                                </td>
                              </tr>
                              <tr v-if="tmplEditRows.length === 0">
                                <td colspan="5" class="empty-row-hint">点击「添加列」添加阈值行</td>
                              </tr>
                            </tbody>
                          </table>
                        </template>
                        <!-- 只读态 -->
                        <template v-else>
                          <table class="detail-table">
                            <thead><tr><th>列名</th><th>最小值</th><th>最大值</th><th>单位</th></tr></thead>
                            <tbody>
                              <tr v-for="(entry, colName) in tpl.thresholds" :key="colName">
                                <td class="col-name-cell">{{ colName }}</td>
                                <td class="value-cell">{{ entry.min }}</td>
                                <td class="value-cell">{{ entry.max }}</td>
                                <td class="unit-cell">{{ entry.unit || "-" }}</td>
                              </tr>
                            </tbody>
                          </table>
                        </template>
                      </div>
                    </transition>
                  </div>
                </div>
              </div>
            </el-scrollbar>
          </div>

        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="close" :disabled="saving" class="cancel-btn">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style>
.settings-dialog {
  --dlg-surface: #f8fafc;
  --dlg-surface-elevated: #ffffff;
  --dlg-border: #e2e8f0;
  --dlg-text: #1e293b;
  --dlg-muted: #64748b;
  --dlg-accent: #10b981;
  border-radius: 12px !important;
  overflow: hidden;
  border: 1px solid var(--dlg-border);
  background: var(--dlg-surface-elevated) !important;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18) !important;
  padding: 0 !important;
}

.settings-dialog .el-dialog__header {
  margin-right: 0;
  padding: 0;
  border-bottom: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
}

.settings-dialog .dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
}

.settings-dialog .dialog-header-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #a7f3d0;
  background: #d1fae5;
  color: #047857;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-dialog .dialog-header-text {
  min-width: 0;
}

.settings-dialog .dialog-title {
  color: var(--dlg-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.settings-dialog .dialog-subtitle {
  margin-top: 2px;
  color: var(--dlg-muted);
  font-size: 12px;
}

.settings-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}

.settings-dialog .el-dialog__body {
  padding: 0 !important;
}

/* ====== 左右布局 ====== */
.settings-dialog .settings-layout {
  display: flex;
  height: 520px;
}

/* 左侧导航 */
.settings-dialog .settings-nav {
  width: 188px;
  flex-shrink: 0;
  background: var(--dlg-surface);
  border-right: 1px solid var(--dlg-border);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-dialog .nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--dlg-muted);
  font-size: 13px;
  font-weight: 500;
}

.settings-dialog .nav-item:hover {
  background: rgba(16, 185, 129, 0.06);
  color: #059669;
}

.settings-dialog .nav-item.active {
  background: rgba(16, 185, 129, 0.1);
  color: #047857;
  font-weight: 600;
}

.settings-dialog .nav-item-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.04);
  transition: all 0.15s ease;
}

.settings-dialog .nav-item.active .nav-item-icon {
  background: #d1fae5;
  color: #047857;
}

.settings-dialog .nav-item-label {
  flex: 1;
}

/* 右侧内容区 */
.settings-dialog .settings-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-dialog .content-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 16px;
  overflow: hidden;
}

.settings-dialog .content-section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--dlg-text);
  margin-bottom: 16px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.settings-dialog .section-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: var(--dlg-muted);
}

/* 通用设置卡片 */
.settings-dialog .settings-card {
  border: 1px solid var(--dlg-border);
  border-radius: 10px;
  background: var(--dlg-surface-elevated);
  padding: 16px;
}

.settings-dialog .card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.settings-dialog .card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #a7f3d0;
  background: #d1fae5;
  color: #047857;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-dialog .card-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.settings-dialog .card-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--dlg-text);
  line-height: 1.3;
}

.settings-dialog .card-desc {
  font-size: 12px;
  color: var(--dlg-muted);
  line-height: 1.4;
}

.settings-dialog .card-body {
  padding-left: 42px;
}

.settings-dialog .el-form-item {
  margin-bottom: 12px;
}

.settings-dialog .el-form-item__label {
  color: #334155;
  font-weight: 600;
  font-size: 13px;
}

.settings-dialog .el-select .el-input__wrapper {
  box-shadow: 0 0 0 1px #e2e8f0 inset !important;
  background: #ffffff !important;
  border-radius: 8px;
}

.settings-dialog .el-select .el-input__wrapper:hover {
  box-shadow: 0 0 0 1px #cbd5e1 inset !important;
}

.settings-dialog .el-select .el-input.is-focus .el-input__wrapper {
  box-shadow: 0 0 0 1px var(--dlg-accent) inset !important;
}

.settings-dialog .timezone-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--dlg-border);
  background: var(--dlg-surface);
  border-radius: 8px;
  font-size: 12px;
  color: var(--dlg-muted);
  line-height: 1.4;
}

.settings-dialog .timezone-hint .el-icon {
  font-size: 13px;
  color: var(--dlg-accent);
}

.settings-dialog .general-footer {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ====== 模板管理区 ====== */
.settings-dialog .tmpl-section {
  padding-bottom: 0;
}

/* 顶部操作栏 */
.settings-dialog .tmpl-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.settings-dialog .create-tmpl-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  border-color: #10b981 !important;
  color: #fff !important;
  border-radius: 7px;
  font-weight: 600;
}

/* 新建模板面板 */
.settings-dialog .create-panel {
  flex-shrink: 0;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.settings-dialog .create-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #047857;
  margin-bottom: 10px;
}

.settings-dialog .create-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.settings-dialog .create-rows-section {
  background: #ffffff;
  border: 1px solid #d1fae5;
  border-radius: 8px;
  padding: 10px 12px;
}

.settings-dialog .create-rows-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.settings-dialog .add-row-btn {
  color: #10b981 !important;
  font-size: 12px;
  padding: 2px 6px !important;
}

.settings-dialog .create-panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

/* 必填标记 */
.settings-dialog .required {
  color: #ef4444;
}

/* 可编辑表格 */
.settings-dialog .editable-table th:last-child,
.settings-dialog .editable-table td:last-child {
  width: 36px;
  text-align: center;
  padding: 3px 4px;
}

.settings-dialog .col-name-input {
  width: 120px;
}

.settings-dialog .col-name-input :deep(.el-input__wrapper) {
  border-radius: 4px;
  padding: 0 6px;
  font-family: "Courier New", monospace;
  font-size: 12px;
}

.settings-dialog .unit-input {
  width: 64px;
}

.settings-dialog .unit-input :deep(.el-input__wrapper) {
  border-radius: 4px;
  padding: 0 6px;
  font-size: 12px;
}

.settings-dialog .action-cell .el-button {
  padding: 2px 4px !important;
}

.settings-dialog .empty-row-hint {
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
  padding: 12px !important;
}

.settings-dialog .tmpl-search {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.settings-dialog .tmpl-search :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.settings-dialog .tmpl-scroll {
  flex: 1;
  overflow: hidden;
}

.settings-dialog .tmpl-section-block {
  margin-bottom: 20px;
}

.settings-dialog .tmpl-section-label {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  padding-left: 2px;
}

.settings-dialog .tmpl-empty {
  text-align: center;
  padding: 32px 16px;
}

.settings-dialog .tmpl-empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.settings-dialog .tmpl-empty-text {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 4px;
}

.settings-dialog .tmpl-empty-hint {
  font-size: 12px;
  color: #9ca3af;
}

/* 模板卡片 */
.settings-dialog .template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-dialog .template-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.settings-dialog .template-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.settings-dialog .template-card.expanded {
  border-color: #86efac;
}

.settings-dialog .template-card.editing {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
}

.settings-dialog .tcard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  gap: 12px;
}

.settings-dialog .tcard-info {
  flex: 1;
  min-width: 0;
}

.settings-dialog .tcard-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-dialog .builtin-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.settings-dialog .tcard-meta {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.settings-dialog .meta-sep {
  color: #d1d5db;
}

.settings-dialog .tcard-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.settings-dialog .tcard-actions .el-button {
  padding: 4px 6px;
}

.settings-dialog .expand-icon {
  font-size: 13px;
  color: #9ca3af;
  transition: transform 0.2s ease;
  margin-left: 4px;
}

.settings-dialog .expand-icon.rotated {
  transform: rotate(90deg);
  color: #10b981;
}

/* 编辑态 */
.settings-dialog .edit-header {
  display: flex;
  gap: 12px;
  padding: 12px 14px 10px;
  align-items: flex-start;
}

.settings-dialog .edit-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.settings-dialog .edit-field-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.settings-dialog .edit-field-label {
  flex-shrink: 0;
  width: 30px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  padding-top: 6px;
}

.settings-dialog .edit-name-input {
  flex: 1;
}

.settings-dialog .edit-name-input :deep(.el-input__wrapper) {
  border-radius: 6px;
}

.settings-dialog .edit-desc-input {
  flex: 1;
}

.settings-dialog .edit-desc-input :deep(.el-textarea__inner) {
  border-radius: 6px;
  font-size: 13px;
}

.settings-dialog .edit-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.settings-dialog .edit-actions .el-button {
  margin: 0;
  width: 64px;
}

.settings-dialog .tcard-description {
  padding: 0 14px 8px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.settings-dialog .detail-section-label {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.settings-dialog .tcard-detail {
  border-top: 1px solid #f1f5f9;
  padding: 10px 14px 14px;
  background: #fafbfc;
}

.settings-dialog .detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.settings-dialog .detail-table thead th {
  text-align: left;
  font-weight: 600;
  color: #6b7280;
  font-size: 11px;
  padding: 5px 8px;
  border-bottom: 1px solid #e2e8f0;
}

.settings-dialog .detail-table tbody td {
  padding: 5px 8px;
  border-bottom: 1px solid #f1f5f9;
  color: #374151;
}

.settings-dialog .col-name-cell {
  font-weight: 500;
  color: #1e293b;
  font-family: "Courier New", monospace;
}

.settings-dialog .value-cell {
  font-family: "Courier New", monospace;
  color: #059669;
}

.settings-dialog .unit-cell {
  color: #9ca3af;
}

.settings-dialog .threshold-input {
  width: 90px;
}

.settings-dialog .threshold-input :deep(.el-input__wrapper) {
  border-radius: 4px;
  padding: 0 6px;
}

.settings-dialog .threshold-input :deep(.el-input__inner) {
  font-family: "Courier New", monospace;
  font-size: 12px;
  text-align: right;
}

/* ====== 展开动画 ====== */
.tmpl-expand-enter-active,
.tmpl-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.tmpl-expand-enter-from,
.tmpl-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.tmpl-expand-enter-to,
.tmpl-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* ====== Footer ====== */
.settings-dialog .el-dialog__footer {
  padding: 10px 20px 14px;
  border-top: 1px solid var(--dlg-border);
  background-color: var(--dlg-surface);
}

.settings-dialog .dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.settings-dialog .dialog-footer .el-button {
  height: 34px;
  min-width: 80px;
  padding: 0 20px;
  border-radius: 8px;
  font-weight: 600;
}

.settings-dialog .cancel-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
}

.settings-dialog .cancel-btn:hover {
  border-color: #a7f3d0;
  color: #059669;
  background: #ecfdf5;
}

.settings-dialog .reset-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
}

.settings-dialog .reset-btn:hover {
  border-color: #a7f3d0;
  color: #059669;
  background: #ecfdf5;
}

.settings-dialog .submit-btn {
  background: #10b981 !important;
  border: 1px solid #10b981 !important;
  color: #ffffff !important;
  transition: all 0.2s;
}

.settings-dialog .submit-btn:hover {
  background: #059669 !important;
  border-color: #059669 !important;
}

.settings-dialog .el-button.is-disabled.submit-btn {
  background: #9ca3af !important;
  border-color: #9ca3af !important;
  color: #ffffff !important;
}
</style>
