<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Search, View, Edit, Download, Delete, Close, Check } from "@element-plus/icons-vue";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import type { UserTemplateListItem, ThresholdTemplateEntry } from "@shared/types/database";

const outlierStore = useOutlierDetectionStore();

interface Props {
  visible: boolean;
  datasetId?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  "template-applied": [];
}>();

const drawerVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit("update:visible", val),
});

// 搜索
const searchText = ref("");

// 展开的模板 ID
const expandedTemplateId = ref<number | null>(null);

// 编辑态
const editingTemplateId = ref<number | null>(null);
const editForm = ref<{
  name: string;
  description: string;
  thresholds: Record<string, { min: number; max: number; unit?: string }>;
}>({ name: "", description: "", thresholds: {} });

// 内置模板展开
const builtinExpanded = ref<string | null>(null);

// ==================== 计算属性 ====================

const filteredUserTemplates = computed(() => {
  const search = searchText.value.toLowerCase().trim();
  if (!search) return outlierStore.userTemplates;
  return outlierStore.userTemplates.filter(
    t => t.name.toLowerCase().includes(search) || t.columnNames.some(c => c.toLowerCase().includes(search))
  );
});

const builtinTemplateList = computed(() => {
  return Object.entries(outlierStore.thresholdTemplates).map(([key, data]) => ({
    key,
    label: key === "standard" ? "标准模板" : key === "strict" ? "严格模板" : key,
    columnCount: Object.keys(data).length,
    data: data as Record<string, ThresholdTemplateEntry>,
  }));
});

const filteredBuiltinTemplates = computed(() => {
  const search = searchText.value.toLowerCase().trim();
  if (!search) return builtinTemplateList.value;
  return builtinTemplateList.value.filter(
    t => t.label.toLowerCase().includes(search) || Object.keys(t.data).some(c => c.toLowerCase().includes(search))
  );
});

// ==================== 操作方法 ====================

const toggleExpand = (templateId: number) => {
  expandedTemplateId.value = expandedTemplateId.value === templateId ? null : templateId;
};

const toggleBuiltinExpand = (key: string) => {
  builtinExpanded.value = builtinExpanded.value === key ? null : key;
};

const startEdit = (template: UserTemplateListItem) => {
  editingTemplateId.value = template.id;
  editForm.value = {
    name: template.name,
    description: template.description || "",
    thresholds: JSON.parse(JSON.stringify(template.thresholds)),
  };
  expandedTemplateId.value = template.id;
};

const cancelEdit = () => {
  editingTemplateId.value = null;
  editForm.value = { name: "", description: "", thresholds: {} };
};

const saveEdit = async () => {
  if (!editingTemplateId.value) return;
  if (!editForm.value.name.trim()) {
    ElMessage.warning("模板名称不能为空");
    return;
  }

  const template = outlierStore.userTemplates.find(t => t.id === editingTemplateId.value);
  if (!template) return;

  const updates: { name?: string; description?: string; templateData?: Record<string, { min: number; max: number; unit?: string }> } = {};

  if (editForm.value.name.trim() !== template.name) {
    updates.name = editForm.value.name.trim();
  }
  if (editForm.value.description !== (template.description || "")) {
    updates.description = editForm.value.description;
  }
  if (JSON.stringify(editForm.value.thresholds) !== JSON.stringify(template.thresholds)) {
    updates.templateData = editForm.value.thresholds;
  }

  if (Object.keys(updates).length === 0) {
    cancelEdit();
    return;
  }

  const success = await outlierStore.updateUserTemplate(editingTemplateId.value, updates);
  if (success) {
    cancelEdit();
  }
};

const handleApply = async (templateId: number, templateName: string) => {
  if (!props.datasetId) {
    ElMessage.warning("未选择数据集，无法应用模板");
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确定要应用"${templateName}"模板吗？这将覆盖匹配列的现有阈值配置。`,
      "应用模板",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning", customClass: "qc-message-box" }
    );
    await outlierStore.applyUserTemplate(props.datasetId, templateId);
    emit("template-applied");
  } catch {
    // 用户取消
  }
};

const handleApplyBuiltin = async (templateKey: string, templateLabel: string) => {
  if (!props.datasetId) {
    ElMessage.warning("未选择数据集，无法应用模板");
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确定要应用"${templateLabel}"模板吗？这将覆盖匹配列的现有阈值配置。`,
      "应用模板",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning", customClass: "qc-message-box" }
    );
    await outlierStore.applyThresholdTemplate(props.datasetId, templateKey);
    emit("template-applied");
  } catch {
    // 用户取消
  }
};

const handleExport = (template: UserTemplateListItem) => {
  outlierStore.exportTemplateAsJson(template);
};

const handleDelete = async (template: UserTemplateListItem) => {
  try {
    await ElMessageBox.confirm(`确定要删除"${template.name}"模板吗？此操作不可恢复。`, "删除模板", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      customClass: "qc-message-box",
    });
    await outlierStore.deleteUserTemplate(template.id);
    if (expandedTemplateId.value === template.id) expandedTemplateId.value = null;
    if (editingTemplateId.value === template.id) cancelEdit();
  } catch {
    // 用户取消
  }
};

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return dateStr;
  }
};

// 打开 drawer 时刷新数据
watch(
  () => props.visible,
  val => {
    if (val) {
      outlierStore.loadUserTemplates();
      outlierStore.loadThresholdTemplates();
      cancelEdit();
      expandedTemplateId.value = null;
      builtinExpanded.value = null;
      searchText.value = "";
    }
  }
);
</script>

<template>
  <el-drawer
    v-model="drawerVisible"
    title="模板管理"
    size="560px"
    destroy-on-close
    append-to-body
    class="template-manager-drawer">
    <div class="template-manager">
      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input v-model="searchText" placeholder="搜索模板..." clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <el-scrollbar class="template-scroll">
        <!-- 内置模板区 -->
        <div class="section" v-if="filteredBuiltinTemplates.length > 0">
          <div class="section-title">内置模板 ({{ filteredBuiltinTemplates.length }})</div>
          <div class="template-list">
            <div
              v-for="bt in filteredBuiltinTemplates"
              :key="bt.key"
              class="template-card builtin"
              :class="{ expanded: builtinExpanded === bt.key }">
              <div class="card-header" @click="toggleBuiltinExpand(bt.key)">
                <div class="card-info">
                  <div class="card-name">
                    <span class="builtin-badge">内置</span>
                    {{ bt.label }}
                  </div>
                  <div class="card-meta">{{ bt.columnCount }} 列配置</div>
                </div>
                <div class="card-actions">
                  <el-button
                    size="small"
                    type="primary"
                    text
                    @click.stop="handleApplyBuiltin(bt.key, bt.label)"
                    :disabled="!datasetId">
                    应用
                  </el-button>
                  <el-icon class="expand-icon" :class="{ rotated: builtinExpanded === bt.key }">
                    <View />
                  </el-icon>
                </div>
              </div>
              <transition name="expand">
                <div v-if="builtinExpanded === bt.key" class="card-detail">
                  <table class="detail-table">
                    <thead>
                      <tr>
                        <th>列名</th>
                        <th>最小值</th>
                        <th>最大值</th>
                        <th>单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(entry, colName) in bt.data" :key="colName">
                        <td class="col-name-cell">{{ colName }}</td>
                        <td class="value-cell">{{ entry.min }}</td>
                        <td class="value-cell">{{ entry.max }}</td>
                        <td class="unit-cell">{{ entry.unit || "-" }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </transition>
            </div>
          </div>
        </div>

        <!-- 用户模板区 -->
        <div class="section">
          <div class="section-title">我的模板 ({{ filteredUserTemplates.length }})</div>
          <div v-if="filteredUserTemplates.length === 0" class="empty-state">
            <div class="empty-icon">📋</div>
            <div class="empty-text">{{ searchText ? "没有找到匹配的模板" : "暂无自定义模板" }}</div>
            <div class="empty-hint">在异常检测面板中保存当前阈值配置即可创建模板</div>
          </div>
          <div class="template-list" v-else>
            <div
              v-for="tpl in filteredUserTemplates"
              :key="tpl.id"
              class="template-card user"
              :class="{ expanded: expandedTemplateId === tpl.id, editing: editingTemplateId === tpl.id }">
              <div class="card-header" @click="toggleExpand(tpl.id)">
                <div class="card-info">
                  <!-- 编辑态：名称输入 -->
                  <template v-if="editingTemplateId === tpl.id">
                    <el-input
                      v-model="editForm.name"
                      size="small"
                      placeholder="模板名称"
                      @click.stop
                      class="edit-name-input" />
                  </template>
                  <template v-else>
                    <div class="card-name">{{ tpl.name }}</div>
                  </template>
                  <div class="card-meta">
                    <span>{{ tpl.columnCount }} 列</span>
                    <span class="meta-sep">·</span>
                    <span>{{ formatDate(tpl.createdAt) }}</span>
                  </div>
                </div>
                <div class="card-actions" @click.stop>
                  <template v-if="editingTemplateId === tpl.id">
                    <el-button size="small" type="success" text :icon="Check" @click="saveEdit" :loading="outlierStore.saving">
                      保存
                    </el-button>
                    <el-button size="small" text :icon="Close" @click="cancelEdit">取消</el-button>
                  </template>
                  <template v-else>
                    <el-button
                      size="small"
                      type="primary"
                      text
                      @click="handleApply(tpl.id, tpl.name)"
                      :disabled="!datasetId">
                      应用
                    </el-button>
                    <el-button size="small" text :icon="Edit" @click="startEdit(tpl)"></el-button>
                    <el-button size="small" text :icon="Download" @click="handleExport(tpl)"></el-button>
                    <el-button size="small" type="danger" text :icon="Delete" @click="handleDelete(tpl)"></el-button>
                  </template>
                </div>
              </div>

              <!-- 描述（编辑态） -->
              <div v-if="editingTemplateId === tpl.id" class="edit-description" @click.stop>
                <el-input
                  v-model="editForm.description"
                  type="textarea"
                  :rows="2"
                  placeholder="模板描述（可选）"
                  resize="none" />
              </div>
              <!-- 描述（展示态） -->
              <div v-else-if="tpl.description && expandedTemplateId === tpl.id" class="card-description">
                {{ tpl.description }}
              </div>

              <!-- 列阈值详情 -->
              <transition name="expand">
                <div v-if="expandedTemplateId === tpl.id" class="card-detail">
                  <table class="detail-table">
                    <thead>
                      <tr>
                        <th>列名</th>
                        <th>最小值</th>
                        <th>最大值</th>
                        <th>单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      <!-- 编辑态：可编辑输入框 -->
                      <template v-if="editingTemplateId === tpl.id">
                        <tr v-for="(entry, colName) in editForm.thresholds" :key="colName">
                          <td class="col-name-cell">{{ colName }}</td>
                          <td class="value-cell">
                            <el-input-number
                              v-model="entry.min"
                              size="small"
                              :controls="false"
                              class="threshold-input" />
                          </td>
                          <td class="value-cell">
                            <el-input-number
                              v-model="entry.max"
                              size="small"
                              :controls="false"
                              class="threshold-input" />
                          </td>
                          <td class="unit-cell">{{ entry.unit || "-" }}</td>
                        </tr>
                      </template>
                      <!-- 展示态：只读 -->
                      <template v-else>
                        <tr v-for="(entry, colName) in tpl.thresholds" :key="colName">
                          <td class="col-name-cell">{{ colName }}</td>
                          <td class="value-cell">{{ entry.min }}</td>
                          <td class="value-cell">{{ entry.max }}</td>
                          <td class="unit-cell">{{ entry.unit || "-" }}</td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<style scoped>
.template-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.search-bar {
  flex-shrink: 0;
}

.search-bar :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.template-scroll {
  flex: 1;
  overflow: hidden;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  padding-left: 2px;
}

/* ====== 模板卡片 ====== */
.template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.template-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.template-card.expanded {
  border-color: #86efac;
}

.template-card.editing {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  gap: 12px;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.builtin-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.card-meta {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-sep {
  color: #d1d5db;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.card-actions .el-button {
  padding: 4px 8px;
}

.expand-icon {
  font-size: 14px;
  color: #9ca3af;
  transition: transform 0.2s ease;
  margin-left: 4px;
}

.expand-icon.rotated {
  transform: rotate(90deg);
  color: #10b981;
}

/* 编辑态 */
.edit-name-input {
  width: 100%;
}

.edit-name-input :deep(.el-input__wrapper) {
  border-radius: 6px;
}

.edit-description {
  padding: 0 16px 8px;
}

.edit-description :deep(.el-textarea__inner) {
  border-radius: 6px;
  font-size: 13px;
}

.card-description {
  padding: 0 16px 8px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

/* ====== 详情表格 ====== */
.card-detail {
  border-top: 1px solid #f1f5f9;
  padding: 12px 16px 16px;
  background: #fafbfc;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.detail-table thead th {
  text-align: left;
  font-weight: 600;
  color: #6b7280;
  font-size: 12px;
  padding: 6px 8px;
  border-bottom: 1px solid #e2e8f0;
}

.detail-table tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid #f1f5f9;
  color: #374151;
}

.col-name-cell {
  font-weight: 500;
  color: #1e293b;
  font-family: "Courier New", monospace;
}

.value-cell {
  font-family: "Courier New", monospace;
  color: #059669;
}

.unit-cell {
  color: #9ca3af;
}

.threshold-input {
  width: 90px;
}

.threshold-input :deep(.el-input__wrapper) {
  border-radius: 4px;
  padding: 0 6px;
}

.threshold-input :deep(.el-input__inner) {
  font-family: "Courier New", monospace;
  font-size: 12px;
  text-align: right;
}

/* ====== 空状态 ====== */
.empty-state {
  text-align: center;
  padding: 40px 16px;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: #9ca3af;
}

/* ====== 展开动画 ====== */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
