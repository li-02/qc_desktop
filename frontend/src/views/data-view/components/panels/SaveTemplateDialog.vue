<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useOutlierDetectionStore } from "@/stores/useOutlierDetectionStore";
import type { ColumnSetting } from "@shared/types/database";

interface Props {
  visible: boolean;
  columnCount: number;
  saving?: boolean;
  currentThresholds?: ColumnSetting[];
}

const props = withDefaults(defineProps<Props>(), { saving: false, currentThresholds: () => [] });

interface ConflictItem {
  columnName: string;
  existing: { min: number; max: number; unit?: string };
  incoming: { min: number; max: number; unit?: string };
}

export type ConfirmPayload =
  | { mode: "new"; name: string; description: string }
  | { mode: "existing"; templateId: number; mergedData: Record<string, { min: number; max: number; unit?: string }> };

const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [payload: ConfirmPayload];
}>();

const outlierStore = useOutlierDetectionStore();

// ==================== 模式选择 ====================
const saveMode = ref<"new" | "existing">("new");

// ==================== 新建模板表单 ====================
const name = ref("");
const description = ref("");
const nameError = ref("");

// ==================== 合并到已有模板 ====================
const selectedTemplateId = ref<number | null>(null);

const currentTemplateData = computed(() => {
  const result: Record<string, { min: number; max: number; unit?: string }> = {};
  for (const col of props.currentThresholds) {
    if (col.min_threshold != null && col.max_threshold != null) {
      result[col.column_name] = {
        min: col.min_threshold,
        max: col.max_threshold,
        unit: col.unit,
      };
    }
  }
  return result;
});

const selectedTemplate = computed(() =>
  outlierStore.userTemplates.find(t => t.id === selectedTemplateId.value) ?? null
);

const conflictList = computed<ConflictItem[]>(() => {
  if (!selectedTemplate.value) return [];
  const tmpl = selectedTemplate.value.thresholds;
  const items: ConflictItem[] = [];
  for (const [colName, cur] of Object.entries(currentTemplateData.value)) {
    if (colName in tmpl) {
      const existing = tmpl[colName];
      if (existing.min !== cur.min || existing.max !== cur.max) {
        items.push({
          columnName: colName,
          existing: { min: existing.min, max: existing.max, unit: existing.unit },
          incoming: { min: cur.min, max: cur.max, unit: cur.unit },
        });
      }
    }
  }
  return items;
});

const conflictChoices = ref<Record<string, "overwrite" | "keep">>({});

watch(
  conflictList,
  items => {
    const choices: Record<string, "overwrite" | "keep"> = {};
    for (const item of items) {
      choices[item.columnName] = conflictChoices.value[item.columnName] ?? "overwrite";
    }
    conflictChoices.value = choices;
  },
  { immediate: true }
);

const newColumnCount = computed(() => {
  if (!selectedTemplate.value) return 0;
  const tmplKeys = Object.keys(selectedTemplate.value.thresholds);
  return Object.keys(currentTemplateData.value).filter(k => !tmplKeys.includes(k)).length;
});

const sameColumnCount = computed(() => {
  if (!selectedTemplate.value) return 0;
  const tmpl = selectedTemplate.value.thresholds;
  let count = 0;
  for (const [colName, cur] of Object.entries(currentTemplateData.value)) {
    if (colName in tmpl) {
      const existing = tmpl[colName];
      if (existing.min === cur.min && existing.max === cur.max) count++;
    }
  }
  return count;
});

const mergedData = computed<Record<string, { min: number; max: number; unit?: string }>>(() => {
  if (!selectedTemplate.value) return {};
  const result: Record<string, { min: number; max: number; unit?: string }> = {
    ...selectedTemplate.value.thresholds,
  };
  const conflictCols = new Set(conflictList.value.map(c => c.columnName));
  for (const [colName, val] of Object.entries(currentTemplateData.value)) {
    if (!conflictCols.has(colName)) {
      result[colName] = val;
    }
  }
  for (const conflict of conflictList.value) {
    const choice = conflictChoices.value[conflict.columnName] ?? "overwrite";
    result[conflict.columnName] = choice === "overwrite" ? conflict.incoming : conflict.existing;
  }
  return result;
});

watch(
  () => props.visible,
  val => {
    if (val) {
      saveMode.value = "new";
      name.value = "";
      description.value = "";
      nameError.value = "";
      selectedTemplateId.value = null;
      conflictChoices.value = {};
      outlierStore.loadUserTemplates();
    }
  }
);

const setChoice = (columnName: string, choice: "overwrite" | "keep") => {
  conflictChoices.value = { ...conflictChoices.value, [columnName]: choice };
};

const setAllChoices = (choice: "overwrite" | "keep") => {
  const choices: Record<string, "overwrite" | "keep"> = {};
  for (const item of conflictList.value) {
    choices[item.columnName] = choice;
  }
  conflictChoices.value = choices;
};

const handleConfirm = () => {
  if (saveMode.value === "new") {
    const trimmedName = name.value.trim();
    if (!trimmedName) {
      nameError.value = "模板名称不能为空";
      return;
    }
    emit("confirm", { mode: "new", name: trimmedName, description: description.value.trim() });
  } else {
    if (!selectedTemplateId.value) return;
    emit("confirm", {
      mode: "existing",
      templateId: selectedTemplateId.value,
      mergedData: mergedData.value,
    });
  }
};

const handleClose = () => {
  emit("update:visible", false);
};
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    title="保存为模板"
    width="520px"
    :close-on-click-modal="false"
    append-to-body
    class="save-template-dialog">
    <div class="dialog-body">

      <!-- 模式选择器 -->
      <div class="mode-selector">
        <div
          class="mode-btn"
          :class="{ active: saveMode === 'new' }"
          @click="saveMode = 'new'">
          <span class="mode-icon">✨</span>
          <span class="mode-label">保存为新模板</span>
        </div>
        <div
          class="mode-btn"
          :class="{ active: saveMode === 'existing' }"
          @click="saveMode = 'existing'">
          <span class="mode-icon">📋</span>
          <span class="mode-label">合并到已有模板</span>
        </div>
      </div>

      <!-- 新建模板 -->
      <template v-if="saveMode === 'new'">
        <div class="info-banner">
          <span class="info-icon">📋</span>
          <span>将当前 <strong>{{ columnCount }}</strong> 列的阈值配置保存为可复用模板</span>
        </div>

        <div class="form-item" :class="{ error: nameError }">
          <label class="form-label">模板名称 <span class="required">*</span></label>
          <el-input
            v-model="name"
            placeholder="输入模板名称，例如：碳通量站点标准配置"
            maxlength="50"
            show-word-limit
            @input="nameError = ''"
            @keyup.enter="handleConfirm"
            autofocus />
          <div v-if="nameError" class="error-msg">{{ nameError }}</div>
        </div>

        <div class="form-item">
          <label class="form-label">描述 <span class="optional">（可选）</span></label>
          <el-input
            v-model="description"
            type="textarea"
            :rows="3"
            placeholder="说明此模板的适用场景或来源数据集..."
            maxlength="200"
            show-word-limit
            resize="none" />
        </div>
      </template>

      <!-- 合并到已有模板 -->
      <template v-else>
        <!-- 无用户模板时的提示 -->
        <div v-if="outlierStore.userTemplates.length === 0" class="no-templates-hint">
          <span class="hint-icon">💡</span>
          暂无自定义模板，请先在「设置 → 模板管理」中创建，或选择「保存为新模板」
        </div>

        <template v-else>
          <div class="form-item">
            <label class="form-label">目标模板 <span class="required">*</span></label>
            <el-select
              v-model="selectedTemplateId"
              placeholder="请选择要合并到的模板"
              style="width: 100%"
              :no-data-text="'暂无模板'">
              <el-option
                v-for="tpl in outlierStore.userTemplates"
                :key="tpl.id"
                :label="tpl.name"
                :value="tpl.id">
                <div class="template-option">
                  <span class="tpl-opt-name">{{ tpl.name }}</span>
                  <span class="tpl-opt-meta">{{ tpl.columnCount }} 列</span>
                </div>
              </el-option>
            </el-select>
          </div>

          <!-- 模板已选：合并预览 -->
          <template v-if="selectedTemplate">
            <!-- 无冲突 -->
            <div v-if="conflictList.length === 0" class="merge-summary no-conflict">
              <span class="summary-icon">✅</span>
              <div class="summary-text">
                <div class="summary-title">无冲突，可直接合并</div>
                <div class="summary-detail">
                  <template v-if="newColumnCount > 0">将新增 <strong>{{ newColumnCount }}</strong> 列到模板</template>
                  <template v-if="newColumnCount > 0 && sameColumnCount > 0">，</template>
                  <template v-if="sameColumnCount > 0"><strong>{{ sameColumnCount }}</strong> 列值相同无需变更</template>
                  <template v-if="newColumnCount === 0 && sameColumnCount === 0">所有列已是最新状态</template>
                </div>
              </div>
            </div>

            <!-- 有冲突 -->
            <div v-else class="conflict-section">
              <div class="conflict-header">
                <div class="conflict-title-row">
                  <span class="conflict-badge">{{ conflictList.length }} 处冲突</span>
                  <span class="conflict-desc">以下指标在当前数据集与模板中设置不同，请选择要保留的值</span>
                </div>
                <div class="conflict-batch">
                  <span class="batch-label">批量：</span>
                  <span class="batch-link" @click="setAllChoices('overwrite')">全用当前值</span>
                  <span class="batch-sep">·</span>
                  <span class="batch-link" @click="setAllChoices('keep')">全保留原值</span>
                </div>
              </div>

              <div class="conflict-table-wrap">
                <table class="conflict-table">
                  <thead>
                    <tr>
                      <th class="ct-col-name">指标</th>
                      <th class="ct-col-val">当前数据集</th>
                      <th class="ct-col-val">模板原值</th>
                      <th class="ct-col-choice">保留</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="conflict in conflictList"
                      :key="conflict.columnName"
                      class="conflict-row">
                      <td class="ct-col-name">{{ conflict.columnName }}</td>
                      <td
                        class="ct-col-val value-cell"
                        :class="{ chosen: conflictChoices[conflict.columnName] === 'overwrite' }"
                        @click="setChoice(conflict.columnName, 'overwrite')">
                        <span class="val-range">{{ conflict.incoming.min }} ~ {{ conflict.incoming.max }}</span>
                        <span v-if="conflict.incoming.unit" class="val-unit">{{ conflict.incoming.unit }}</span>
                      </td>
                      <td
                        class="ct-col-val value-cell alt"
                        :class="{ chosen: conflictChoices[conflict.columnName] === 'keep' }"
                        @click="setChoice(conflict.columnName, 'keep')">
                        <span class="val-range">{{ conflict.existing.min }} ~ {{ conflict.existing.max }}</span>
                        <span v-if="conflict.existing.unit" class="val-unit">{{ conflict.existing.unit }}</span>
                      </td>
                      <td class="ct-col-choice">
                        <span
                          class="choice-tag"
                          :class="conflictChoices[conflict.columnName] === 'overwrite' ? 'tag-new' : 'tag-old'">
                          {{ conflictChoices[conflict.columnName] === 'overwrite' ? '当前值' : '原值' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="newColumnCount > 0" class="new-cols-hint">
                另有 <strong>{{ newColumnCount }}</strong> 列将被新增到模板
              </div>
            </div>
          </template>
        </template>
      </template>

    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="saveMode === 'existing' && !selectedTemplateId"
          @click="handleConfirm">
          {{ saveMode === 'new' ? '创建并保存' : '合并保存' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0;
}

/* ====== 模式选择 ====== */
.mode-selector {
  display: flex;
  gap: 8px;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  transition: all 0.15s ease;
}

.mode-btn:hover {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.04);
  color: #059669;
}

.mode-btn.active {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.08);
  color: #047857;
  font-weight: 600;
}

.mode-icon {
  font-size: 15px;
  flex-shrink: 0;
}

/* ====== Info Banner ====== */
.info-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(16, 185, 129, 0.07);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}

.info-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* ====== 表单 ====== */
.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.required {
  color: #ef4444;
  margin-left: 2px;
}

.optional {
  font-weight: 400;
  color: #9ca3af;
  font-size: 12px;
}

.error-msg {
  font-size: 12px;
  color: #ef4444;
}

.form-item.error :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #ef4444 inset;
}

/* ====== 无模板提示 ====== */
.no-templates-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 13px;
  color: #92400e;
  line-height: 1.5;
}

.hint-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* ====== 模板下拉选项 ====== */
.template-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.tpl-opt-name {
  font-size: 13px;
  color: #1e293b;
}

.tpl-opt-meta {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

/* ====== 无冲突摘要 ====== */
.merge-summary {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
}

.merge-summary.no-conflict {
  background: rgba(16, 185, 129, 0.07);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.summary-icon {
  font-size: 16px;
  flex-shrink: 0;
  line-height: 1.4;
}

.summary-title {
  font-size: 13px;
  font-weight: 600;
  color: #047857;
  margin-bottom: 3px;
}

.summary-detail {
  font-size: 12px;
  color: #374151;
}

/* ====== 冲突区域 ====== */
.conflict-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.conflict-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}

.conflict-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conflict-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.conflict-desc {
  font-size: 12px;
  color: #64748b;
}

.conflict-batch {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  flex-shrink: 0;
}

.batch-label {
  color: #94a3b8;
}

.batch-link {
  color: #059669;
  cursor: pointer;
  font-weight: 500;
}

.batch-link:hover {
  text-decoration: underline;
}

.batch-sep {
  color: #cbd5e1;
}

/* ====== 冲突表格 ====== */
.conflict-table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  max-height: 220px;
  overflow-y: auto;
}

.conflict-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.conflict-table thead th {
  padding: 7px 10px;
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.conflict-table tbody tr:not(:last-child) {
  border-bottom: 1px solid #f1f5f9;
}

.conflict-row td {
  padding: 7px 10px;
  vertical-align: middle;
}

.ct-col-name {
  width: 110px;
  font-weight: 500;
  color: #334155;
  font-size: 12px;
}

.ct-col-val {
  width: auto;
}

.ct-col-choice {
  width: 54px;
  text-align: center;
}

/* 可点击选择的值单元格 */
.value-cell {
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.12s ease;
  position: relative;
}

.value-cell:hover {
  background: rgba(16, 185, 129, 0.06);
}

.value-cell.chosen {
  background: rgba(16, 185, 129, 0.1);
}

.value-cell.alt:hover {
  background: rgba(99, 102, 241, 0.06);
}

.value-cell.alt.chosen {
  background: rgba(99, 102, 241, 0.1);
}

.val-range {
  color: #1e293b;
  font-weight: 500;
}

.val-unit {
  margin-left: 4px;
  color: #94a3b8;
  font-size: 11px;
}

.choice-tag {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.tag-new {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.tag-old {
  background: rgba(99, 102, 241, 0.12);
  color: #4338ca;
}

/* ====== 新增列提示 ====== */
.new-cols-hint {
  font-size: 12px;
  color: #64748b;
  padding: 4px 2px;
}

/* ====== 底部按钮 ====== */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
