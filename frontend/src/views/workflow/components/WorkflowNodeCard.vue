<template>
  <div
    class="node-card"
    :class="{
      disabled: !node.isEnabled,
      running: isRunning,
      completed: isCompleted,
      failed: isFailed,
    }"
    @click="$emit('click')">
    <div class="node-header">
      <span class="node-icon">{{ meta.icon }}</span>
      <div class="node-info">
        <span class="node-name">{{ node.nodeName }}</span>
        <span class="node-type-label">{{ meta.label }}</span>
      </div>
      <div class="node-right">
        <!-- 运行状态指示器 -->
        <span v-if="isRunning" class="status-indicator running-indicator">⏳</span>
        <span v-else-if="isCompleted" class="status-indicator completed-indicator">✅</span>
        <span v-else-if="isFailed" class="status-indicator failed-indicator">❌</span>

        <!-- 查看结果按钮 -->
        <el-button
          v-if="hasResultData"
          size="small"
          type="primary"
          link
          class="btn-view-result"
          title="查看结果"
          @click.stop="$emit('view-result')">
          <Eye :size="14" />
        </el-button>

        <!-- 启用开关 -->
        <el-switch
          :model-value="node.isEnabled"
          size="small"
          @click.stop
          @change="(val: boolean) => $emit('toggle', val)" />
        <!-- 删除 -->
        <button class="btn-delete" @click.stop="$emit('delete')" title="删除节点">🗑️</button>
      </div>
    </div>
    <div class="node-body" v-if="configSummary">
      <span class="config-summary">{{ configSummary }}</span>
    </div>
    <!-- 版本标记 -->
    <div class="node-footer" v-if="meta.producesVersion">
      <span class="version-badge">产生新版本</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WorkflowNode, WorkflowNodeType, WorkflowNodeExecution } from "@shared/types/workflow";
import { NODE_TYPE_META } from "@shared/types/workflow";
import { Eye } from "@/components/icons/iconoir";

const props = defineProps<{
  node: WorkflowNode;
  index: number;
  nodeExecution?: WorkflowNodeExecution | null;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
}>();

defineEmits<{
  (e: "click"): void;
  (e: "delete"): void;
  (e: "toggle", enabled: boolean): void;
  (e: "view-result"): void;
}>();

const meta = computed(() => NODE_TYPE_META[props.node.nodeType as WorkflowNodeType]);

const hasResultData = computed(() => {
  if (!props.nodeExecution) return false;
  return props.nodeExecution.status === "COMPLETED";
});

const configSummary = computed(() => {
  if (!props.node.configJson) return "";
  try {
    const cfg = JSON.parse(props.node.configJson);
    switch (props.node.nodeType) {
      case "OUTLIER_DETECTION": {
        const parts: string[] = [];
        if (cfg.method) {
          const methodNames: Record<string, string> = {
            THRESHOLD_STATIC: "阈值过滤",
            ZSCORE: "Z-Score",
            MODIFIED_ZSCORE: "MAD",
            IQR: "IQR",
            DESPIKING_MAD: "MAD Despiking",
          };
          parts.push(methodNames[cfg.method] || cfg.method);
        }
        if (cfg.templateKey) {
          const tpl = cfg.templateKey.startsWith("builtin:")
            ? cfg.templateKey.replace("builtin:", "") === "standard"
              ? "标准模板"
              : "严格模板"
            : "用户模板";
          parts.push(tpl);
        }
        if (cfg.columnNames?.length) parts.push(`${cfg.columnNames.length}列`);
        return parts.join(" · ") || "未配置";
      }
      case "IMPUTATION":
        return cfg.methodId ? `方法: ${cfg.methodId}` : "";
      case "FLUX_PARTITIONING":
        return cfg.methodId ? `方法: ${cfg.methodId}` : "";
      case "EXPORT":
        return cfg.format ? `格式: ${cfg.format}` : "";
      default:
        return "";
    }
  } catch {
    return "";
  }
});
</script>

<style scoped>
.node-card {
  width: 100%;
  background: var(--c-bg-surface);
  border: 1px solid rgba(229, 231, 235, 0.5);
  border-radius: var(--radius-panel);
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.node-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: var(--c-brand-border);
}

.node-card.disabled {
  opacity: 0.5;
}

.node-card.running {
  border-color: var(--c-warning);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}

.node-card.completed {
  border-color: var(--c-brand);
  box-shadow: 0 0 0 2px var(--c-brand-soft);
}

.node-card.failed {
  border-color: var(--c-danger);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.1);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-icon {
  font-size: var(--text-3xl);
  flex-shrink: 0;
}

.node-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-name {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--c-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-type-label {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.node-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-indicator {
  font-size: var(--text-xl);
}

.btn-delete {
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--text-md);
  padding: 2px;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity 0.15s;
}

.node-card:hover .btn-delete {
  opacity: 0.6;
}

.btn-delete:hover {
  opacity: 1 !important;
  background: rgba(239, 68, 68, 0.1);
}

.btn-view-result {
  opacity: 0.8;
  transition: opacity 0.15s;
  font-size: var(--text-xl);
  padding: 4px;
}

.btn-view-result:hover {
  opacity: 1;
}

.node-body {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(229, 231, 235, 0.3);
}

.config-summary {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  font-family: var(--font-mono);
}

.node-footer {
  margin-top: 6px;
}

.version-badge {
  font-size: var(--text-2xs);
  padding: 2px 8px;
  border-radius: var(--radius-control);
  background: rgba(16, 185, 129, 0.08);
  color: var(--c-brand);
  font-weight: 500;
}
</style>
