<template>
  <div class="history-panel">
    <div class="panel-header">
      <div class="panel-title-row">
        <span class="panel-icon">🕐</span>
        <h3 class="panel-title">运行历史</h3>
        <span class="history-count" v-if="executions.length > 0">{{ executions.length }} 次</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="executions.length === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <p class="empty-text">暂无运行记录</p>
      <p class="empty-hint">应用到数据集后将在此显示历史记录</p>
    </div>

    <div v-else class="panel-body">
      <!-- 左侧：执行列表 -->
      <div class="exec-list">
        <div
          v-for="exec in executions"
          :key="exec.id"
          class="exec-item"
          :class="{ active: selectedExecId === exec.id }"
          @click="selectExecution(exec)"
          @mouseenter="hoveredExecId = exec.id"
          @mouseleave="hoveredExecId = null">
          <div class="exec-status-dot" :class="'dot-' + exec.status.toLowerCase()"></div>
          <div class="exec-info">
            <div class="exec-meta-row">
              <span class="exec-status-label" :class="'label-' + exec.status.toLowerCase()">
                {{ statusLabel(exec.status) }}
              </span>
              <span class="exec-time">{{ formatTime(exec.createdAt) }}</span>
            </div>
            <!-- 数据集名称（可内联重命名） -->
            <div class="exec-detail-row" v-if="renamingExecId !== exec.id">
              <span class="exec-dataset">{{ exec.label || exec.datasetName || "数据集 #" + exec.datasetId }}</span>
              <span class="exec-progress">{{ exec.completedNodes }}/{{ exec.totalNodes }} 节点</span>
            </div>
            <div class="exec-rename-row" v-else @click.stop>
              <input
                ref="renameInputRef"
                v-model="renameValue"
                class="exec-rename-input"
                placeholder="输入名称..."
                @keyup.enter="confirmRename(exec)"
                @keyup.escape="cancelRename"
                @blur="confirmRename(exec)" />
            </div>
            <div class="exec-duration" v-if="exec.startedAt && exec.finishedAt">
              ⏱ {{ calcDuration(exec.startedAt, exec.finishedAt) }}
            </div>
            <div class="exec-error" v-if="exec.errorMessage">
              {{ exec.errorMessage }}
            </div>
          </div>
          <!-- 悬浮操作按钮 -->
          <div v-if="hoveredExecId === exec.id && renamingExecId !== exec.id" class="exec-actions" @click.stop>
            <button class="exec-action-btn" title="重命名" @click.stop="startRename(exec)">✏️</button>
            <button class="exec-action-btn exec-action-delete" title="删除" @click.stop="confirmDelete(exec)">
              🗑️
            </button>
          </div>
        </div>
      </div>

      <!-- 右侧：节点详情 -->
      <div class="exec-detail" v-if="selectedDetail">
        <div class="detail-header">
          <span class="detail-title">节点执行详情</span>
          <span class="detail-exec-id">#{{ selectedDetail.execution.id }}</span>
        </div>

        <div class="exec-summary-cards">
          <div class="summary-card">
            <div class="summary-value">{{ selectedDetail.execution.completedNodes }}</div>
            <div class="summary-label">完成节点</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">{{ selectedDetail.execution.totalNodes }}</div>
            <div class="summary-label">总节点数</div>
          </div>
          <div class="summary-card" v-if="selectedDetail.execution.startedAt && selectedDetail.execution.finishedAt">
            <div class="summary-value">
              {{ calcDuration(selectedDetail.execution.startedAt, selectedDetail.execution.finishedAt) }}
            </div>
            <div class="summary-label">耗时</div>
          </div>
        </div>

        <div class="node-exec-list">
          <div
            v-for="ne in selectedDetail.nodeExecutions"
            :key="ne.id"
            class="node-exec-item"
            :class="'node-' + ne.status.toLowerCase()">
            <div class="node-exec-left">
              <span class="node-order">{{ ne.nodeOrder }}</span>
              <div class="node-exec-info">
                <span class="node-name">{{ ne.nodeName }}</span>
                <span class="node-type-tag">{{ nodeTypeLabel(ne.nodeType) }}</span>
              </div>
            </div>
            <div class="node-exec-right">
              <span class="node-status-badge" :class="'badge-' + ne.status.toLowerCase()">
                {{ nodeStatusLabel(ne.status) }}
              </span>
              <span class="node-duration" v-if="ne.startedAt && ne.finishedAt">
                {{ calcDuration(ne.startedAt, ne.finishedAt) }}
              </span>
            </div>
            <!-- 错误信息 -->
            <div class="node-error" v-if="ne.errorMessage">
              <span class="node-error-icon">🔴</span>
              {{ ne.errorMessage }}
            </div>
            <!-- 结果数据 -->
            <div class="node-result" v-if="canViewResult(ne)">
              <button class="btn-view-result" @click="$emit('view-result', ne)">查看结果 →</button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="exec-detail exec-detail-empty">
        <div class="empty-icon">👈</div>
        <p class="empty-text">选择一条记录查看详情</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type {
  WorkflowExecution,
  WorkflowExecutionDetail,
  WorkflowNodeExecution,
  WorkflowNodeType,
} from "@shared/types/workflow";
import { NODE_TYPE_META } from "@shared/types/workflow";

const props = defineProps<{
  executions: WorkflowExecution[];
  loadingDetail: boolean;
  selectedDetail: WorkflowExecutionDetail | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select-execution", executionId: number): void;
  (
    e: "view-result",
    nodeExec: WorkflowNodeExecution & { nodeName: string; nodeType: WorkflowNodeType; nodeOrder: number }
  ): void;
  (e: "delete-execution", executionId: number): void;
  (e: "rename-execution", executionId: number, label: string): void;
}>();

const selectedExecId = ref<number | null>(null);
const hoveredExecId = ref<number | null>(null);
const renamingExecId = ref<number | null>(null);
const renameValue = ref("");
const renameInputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.selectedDetail,
  detail => {
    if (detail) {
      selectedExecId.value = detail.execution.id;
    }
  },
  { immediate: true }
);

const selectExecution = (exec: WorkflowExecution) => {
  selectedExecId.value = exec.id;
  emit("select-execution", exec.id);
};

const startRename = (exec: WorkflowExecution) => {
  renamingExecId.value = exec.id;
  renameValue.value = exec.label || exec.datasetName || "";
  nextTick(() => renameInputRef.value?.focus());
};

const confirmRename = (exec: WorkflowExecution) => {
  if (renamingExecId.value !== exec.id) return;
  const trimmed = renameValue.value.trim();
  if (trimmed) {
    emit("rename-execution", exec.id, trimmed);
  }
  renamingExecId.value = null;
};

const cancelRename = () => {
  renamingExecId.value = null;
};

const confirmDelete = (exec: WorkflowExecution) => {
  emit("delete-execution", exec.id);
};

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    PENDING: "等待中",
    RUNNING: "执行中",
    COMPLETED: "已完成",
    FAILED: "失败",
    CANCELLED: "已取消",
  };
  return map[s] || s;
};

const nodeStatusLabel = (s: string) => {
  const map: Record<string, string> = {
    PENDING: "等待",
    RUNNING: "执行中",
    COMPLETED: "成功",
    FAILED: "失败",
    SKIPPED: "跳过",
  };
  return map[s] || s;
};

const nodeTypeLabel = (t: WorkflowNodeType) => NODE_TYPE_META[t]?.label || t;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const calcDuration = (start: string, end: string) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

const canViewResult = (ne: WorkflowNodeExecution & { nodeType: WorkflowNodeType }) => {
  return ne.status === "COMPLETED" && ["OUTLIER_DETECTION", "IMPUTATION", "FLUX_PARTITIONING"].includes(ne.nodeType);
};
</script>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-bg-surface);
  backdrop-filter: blur(20px);
}

/* ===== Header ===== */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.panel-icon {
  font-size: var(--text-xl);
}

.panel-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--c-text-base);
  margin: 0;
}

.history-count {
  font-size: var(--text-xs);
  padding: 2px 7px;
  border-radius: var(--radius-control);
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-weight: 500;
}

.btn-close {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--c-text-disabled);
  font-size: var(--text-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.btn-close:hover {
  background: var(--c-danger-bg);
  color: var(--c-danger);
}

/* ===== Empty ===== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 40px 20px;
}

.empty-icon {
  font-size: var(--text-display-md);
  opacity: 0.4;
}

.empty-text {
  font-size: var(--text-base);
  color: var(--c-text-muted);
  margin: 0;
}

.empty-hint {
  font-size: var(--text-sm);
  color: var(--c-text-disabled);
  margin: 0;
  text-align: center;
}

/* ===== Body ===== */
.panel-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ===== Exec List (左) ===== */
.exec-list {
  width: 220px;
  min-width: 220px;
  border-right: 1px solid var(--c-border);
  overflow-y: auto;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exec-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 10px 10px;
  border-radius: var(--radius-panel);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  position: relative;
}

.exec-item:hover {
  background: var(--c-bg-surface);
  border-color: var(--c-border);
}

.exec-item.active {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
}

.exec-status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  margin-top: 4px;
}

.dot-completed {
  background: var(--c-brand);
}
.dot-running {
  background: var(--c-warning);
  animation: pulse 1.2s infinite;
}
.dot-failed {
  background: var(--c-danger);
}
.dot-cancelled {
  background: var(--c-text-disabled);
}
.dot-pending {
  background: var(--c-text-muted);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.exec-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.exec-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.exec-status-label {
  font-size: var(--text-xs);
  font-weight: 600;
}

.label-completed {
  color: var(--c-brand);
}
.label-running {
  color: var(--c-warning);
}
.label-failed {
  color: var(--c-danger);
}
.label-cancelled {
  color: var(--c-text-disabled);
}
.label-pending {
  color: var(--c-text-muted);
}

.exec-time {
  font-size: var(--text-2xs);
  color: var(--c-text-disabled);
  flex-shrink: 0;
}

.exec-detail-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.exec-dataset {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.exec-progress {
  font-size: var(--text-xs);
  color: var(--c-text-disabled);
}

.exec-duration {
  font-size: var(--text-2xs);
  color: var(--c-text-disabled);
}

.exec-error {
  font-size: var(--text-2xs);
  color: var(--c-danger);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== Exec Item Actions ===== */
.exec-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 4px;
}

.exec-action-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  font-size: var(--text-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  padding: 0;
  line-height: 1;
}

.exec-action-btn:hover {
  background: var(--c-bg-subtle);
}

.exec-action-delete:hover {
  background: var(--c-danger-bg);
}

/* ===== Inline Rename ===== */
.exec-rename-row {
  padding: 2px 0;
}

.exec-rename-input {
  width: 100%;
  font-size: var(--text-xs);
  padding: 3px 6px;
  border: 1px solid var(--c-brand-border);
  border-radius: var(--radius-sm);
  outline: none;
  background: var(--c-bg-surface);
  color: var(--c-text-base);
  box-sizing: border-box;
}

.exec-rename-input:focus {
  border-color: var(--c-brand);
  box-shadow: 0 0 0 2px var(--c-brand-soft);
}

/* ===== Exec Detail (右) ===== */
.exec-detail {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.exec-detail-empty {
  align-items: center;
  justify-content: center;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.detail-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
}

.detail-exec-id {
  font-size: var(--text-xs);
  color: var(--c-text-disabled);
  font-family: var(--font-mono);
}

/* ===== Summary Cards ===== */
.exec-summary-cards {
  display: flex;
  gap: var(--space-2);
}

.summary-card {
  flex: 1;
  padding: 8px 10px;
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  text-align: center;
}

.summary-value {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--c-brand);
}

.summary-label {
  font-size: var(--text-2xs);
  color: var(--c-text-disabled);
  margin-top: 2px;
}

/* ===== Node Exec List ===== */
.node-exec-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.node-exec-item {
  padding: 10px 12px;
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.node-completed {
  border-left: 3px solid var(--c-brand);
}
.node-failed {
  border-left: 3px solid var(--c-danger);
  background: var(--c-danger-bg);
}
.node-skipped {
  border-left: 3px solid var(--c-border-strong);
  opacity: 0.65;
}
.node-running {
  border-left: 3px solid var(--c-warning);
}
.node-pending {
  border-left: 3px solid var(--c-border);
}

.node-exec-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

.node-order {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--c-bg-subtle);
  color: var(--c-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-exec-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.node-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--c-text-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-type-tag {
  font-size: var(--text-2xs);
  color: var(--c-text-disabled);
}

.node-exec-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.node-status-badge {
  font-size: var(--text-2xs);
  font-weight: 600;
  padding: 2px 7px;
  border-radius: var(--radius-control);
}

.badge-completed {
  background: var(--c-brand-soft);
  color: var(--c-brand);
}
.badge-failed {
  background: var(--c-danger-bg);
  color: var(--c-danger);
}
.badge-skipped {
  background: var(--c-bg-subtle);
  color: var(--c-text-disabled);
}
.badge-running {
  background: var(--c-warning-bg);
  color: var(--c-warning);
}
.badge-pending {
  background: var(--c-bg-subtle);
  color: var(--c-text-muted);
}

.node-duration {
  font-size: var(--text-2xs);
  color: var(--c-text-disabled);
  font-family: var(--font-mono);
}

.node-error {
  width: 100%;
  font-size: var(--text-xs);
  color: var(--c-danger);
  background: var(--c-danger-bg);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.node-error-icon {
  flex-shrink: 0;
}

.node-result {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  background: var(--c-brand-soft);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.result-icon {
  flex-shrink: 0;
}

.result-text {
  flex: 1;
}

.btn-view-result {
  border: none;
  background: transparent;
  color: var(--c-brand);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.btn-view-result:hover {
  color: var(--c-brand-hover);
  text-decoration: underline;
}
</style>
