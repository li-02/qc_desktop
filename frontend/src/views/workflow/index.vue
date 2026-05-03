<template>
  <div class="workflow-page">
    <!-- 左侧：工作流列表 -->
    <div class="workflow-sidebar">
      <div class="sidebar-header">
        <h3 class="sidebar-title">自动化工作流</h3>
        <button class="btn-create" @click="showCreateDialog = true"><span class="btn-icon">+</span> 新建</button>
      </div>
      <WorkflowList
        :workflows="workflowStore.workflows"
        :loading="workflowStore.loading"
        :active-id="workflowStore.currentWorkflow?.workflow.id"
        @select="handleSelectWorkflow"
        @delete="handleDeleteWorkflow"
        @clone="handleCloneWorkflow" />
    </div>

    <!-- 历史面板（紧挨工作流列表右边） -->
    <div class="workflow-history-col" v-if="workflowStore.executions.length > 0 && !historyCollapsed">
      <WorkflowHistoryPanel
        :executions="workflowStore.executions"
        :loading-detail="workflowStore.loading"
        :selected-detail="historyDetail"
        @close="() => {}"
        @select-execution="handleSelectHistoryExecution"
        @view-result="handleHistoryViewResult"
        @delete-execution="handleDeleteHistoryExecution"
        @rename-execution="handleRenameHistoryExecution" />
    </div>

    <!-- 中间：流水线编辑器 -->
    <div class="workflow-main">
      <template v-if="workflowStore.currentWorkflow">
        <div class="main-header">
          <div class="workflow-info">
            <h2 class="workflow-name" @dblclick="startRename">
              <template v-if="!isRenaming">{{ workflowStore.currentWorkflow.workflow.name }}</template>
              <input
                v-else
                ref="renameInput"
                v-model="renameName"
                class="rename-input"
                @blur="finishRename"
                @keyup.enter="finishRename"
                @keyup.escape="cancelRename" />
            </h2>
            <span
              class="workflow-status"
              :class="'status-' + workflowStore.currentWorkflow.workflow.status.toLowerCase()">
              {{ statusLabel(workflowStore.currentWorkflow.workflow.status) }}
            </span>
          </div>
          <div class="header-actions">
            <button class="btn-config-dataset" @click="openConfigDatasetDialog">
              <span class="btn-icon">▣</span>
              <span class="config-dataset-text">{{ configDatasetButtonText }}</span>
            </button>
            <button
              class="btn-execute"
              :disabled="workflowStore.executing || workflowStore.enabledNodes.length === 0 || !configDatasetId"
              @click="handleExecute">
              <template v-if="workflowStore.executing">⏳ 执行中...</template>
              <template v-else>▶ 应用到数据集</template>
            </button>
          </div>
        </div>

        <WorkflowEditor
          :nodes="workflowStore.currentNodes"
          :executing="workflowStore.executing"
          :execution-progress="workflowStore.executionProgress"
          @add-node="showNodeSelector = true"
          @select-node="handleSelectNode"
          @delete-node="handleDeleteNode"
          @toggle-node="handleToggleNode"
          @reorder="handleReorder"
          @view-result="handleViewResult" />

        <!-- 执行进度 -->
        <WorkflowExecutionView
          v-if="workflowStore.executing || workflowStore.executionProgress"
          :progress="workflowStore.executionProgress"
          :overall-progress="workflowStore.overallProgress"
          :executing="workflowStore.executing"
          @cancel="handleCancelExecution" />
      </template>

      <div v-else class="empty-state">
        <div class="empty-icon">🔄</div>
        <p class="empty-text">选择一个工作流或创建新的工作流</p>
        <button class="btn-create-large" @click="showCreateDialog = true">+ 创建工作流</button>
      </div>
    </div>

    <!-- 右侧：节点配置面板 -->
    <div class="workflow-config" v-if="selectedNode">
      <NodeConfigPanel
        :node="selectedNode"
        :dataset-id="configDatasetId ?? undefined"
        @update="handleUpdateNode"
        @close="selectedNode = null" />
    </div>

    <!-- 节点类型选择器弹窗 -->
    <NodeTypeSelector v-if="showNodeSelector" @select="handleAddNode" @close="showNodeSelector = false" />

    <!-- 创建工作流弹窗 -->
    <el-dialog v-model="showCreateDialog" title="创建工作流" width="480px" :close-on-click-modal="false">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="输入工作流名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="可选描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :disabled="!canCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 配置数据集弹窗 -->
    <el-dialog v-model="showConfigDatasetDialog" title="选择配置数据集" width="480px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="数据集" required>
          <el-select
            v-model="configDatasetDraftId"
            filterable
            placeholder="选择用于节点配置的数据集"
            style="width: 100%">
            <el-option v-for="ds in datasets" :key="ds.id" :label="ds.name" :value="Number(ds.id)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showConfigDatasetDialog = false">取消</el-button>
        <el-button type="primary" @click="handleConfirmConfigDataset" :disabled="!configDatasetDraftId">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useWorkflowStore } from "@/stores/useWorkflowStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { ElMessage, ElMessageBox } from "element-plus";
import WorkflowList from "./components/WorkflowList.vue";
import WorkflowEditor from "./components/WorkflowEditor.vue";
import NodeConfigPanel from "./components/NodeConfigPanel.vue";
import NodeTypeSelector from "./components/NodeTypeSelector.vue";
import WorkflowExecutionView from "./components/WorkflowExecutionView.vue";
import WorkflowHistoryPanel from "./components/WorkflowHistoryPanel.vue";
import type {
  WorkflowNode,
  WorkflowNodeType,
  WorkflowExecutionDetail,
  WorkflowNodeExecution,
} from "@shared/types/workflow";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import { useRouter } from "vue-router";

const workflowStore = useWorkflowStore();
const datasetStore = useDatasetStore();
const router = useRouter();

// ==================== 创建表单 ====================
const showCreateDialog = ref(false);
const createForm = ref({
  name: "",
  description: "",
});

const canCreate = computed(() => createForm.value.name.trim().length > 0);

const handleCreate = async () => {
  if (!canCreate.value) return;
  const wf = await workflowStore.createWorkflow({
    name: createForm.value.name.trim(),
    description: createForm.value.description || undefined,
  });
  if (wf) {
    showCreateDialog.value = false;
    createForm.value = { name: "", description: "" };
    await workflowStore.loadWorkflowDetail(wf.id);
  }
};

const datasets = computed(() => datasetStore.datasets || []);
const showConfigDatasetDialog = ref(false);
const configDatasetId = ref<number | null>(null);
const configDatasetDraftId = ref<number | null>(null);
const configDataset = computed(() => datasets.value.find(ds => Number(ds.id) === configDatasetId.value));
const configDatasetButtonText = computed(() =>
  configDataset.value ? `配置数据集：${configDataset.value.name}` : "配置数据集"
);

const openConfigDatasetDialog = () => {
  configDatasetDraftId.value = configDatasetId.value;
  showConfigDatasetDialog.value = true;
};

const handleConfirmConfigDataset = () => {
  if (!configDatasetDraftId.value) return;
  configDatasetId.value = configDatasetDraftId.value;
  showConfigDatasetDialog.value = false;
};

// ==================== 工作流选择 ====================
const handleSelectWorkflow = async (workflowId: number) => {
  const isSame = workflowStore.currentWorkflow?.workflow.id === workflowId;
  if (isSame) {
    historyCollapsed.value = !historyCollapsed.value;
    return;
  }
  selectedNode.value = null;
  configDatasetId.value = null;
  configDatasetDraftId.value = null;
  historyDetail.value = null;
  historyCollapsed.value = false;
  await workflowStore.loadWorkflowDetail(workflowId);
};

const handleDeleteWorkflow = async (workflowId: number) => {
  try {
    await ElMessageBox.confirm("确定删除此工作流？此操作不可恢复。", "确认删除", { type: "warning" });
    await workflowStore.deleteWorkflow(workflowId);
  } catch {}
};

const handleCloneWorkflow = async (workflowId: number) => {
  const wf = workflowStore.workflows.find(w => w.id === workflowId);
  if (!wf) return;
  await workflowStore.cloneWorkflow(workflowId, `${wf.name} - 副本`);
};

// ==================== 重命名 ====================
const isRenaming = ref(false);
const renameName = ref("");
const renameInput = ref<HTMLInputElement | null>(null);

const startRename = () => {
  if (!workflowStore.currentWorkflow) return;
  renameName.value = workflowStore.currentWorkflow.workflow.name;
  isRenaming.value = true;
  nextTick(() => renameInput.value?.focus());
};

const finishRename = async () => {
  if (!isRenaming.value || !workflowStore.currentWorkflow) return;
  isRenaming.value = false;
  if (renameName.value.trim() && renameName.value !== workflowStore.currentWorkflow.workflow.name) {
    await workflowStore.updateWorkflow({
      workflowId: workflowStore.currentWorkflow.workflow.id,
      name: renameName.value.trim(),
    });
  }
};

const cancelRename = () => {
  isRenaming.value = false;
};

// ==================== 节点管理 ====================
const showNodeSelector = ref(false);
const selectedNode = ref<WorkflowNode | null>(null);

const handleAddNode = async (nodeType: WorkflowNodeType, nodeName: string) => {
  if (!workflowStore.currentWorkflow) return;
  showNodeSelector.value = false;
  await workflowStore.addNode({
    workflowId: workflowStore.currentWorkflow.workflow.id,
    nodeType,
    nodeName,
  });
};

const handleSelectNode = (node: WorkflowNode) => {
  selectedNode.value = node;
};

const handleDeleteNode = async (nodeId: number) => {
  try {
    await ElMessageBox.confirm("确定删除此节点？", "确认", { type: "warning" });
    await workflowStore.deleteNode(nodeId);
    if (selectedNode.value?.id === nodeId) selectedNode.value = null;
  } catch {}
};

const handleToggleNode = async (nodeId: number, enabled: boolean) => {
  await workflowStore.updateNode({ nodeId, isEnabled: enabled });
};

const handleUpdateNode = async (nodeId: number, updates: { nodeName?: string; configJson?: string }) => {
  await workflowStore.updateNode({ nodeId, ...updates });
  // 刷新选中节点
  if (workflowStore.currentWorkflow) {
    const updated = workflowStore.currentWorkflow.nodes.find(n => n.id === nodeId);
    if (updated) selectedNode.value = updated;
  }
};

const handleReorder = async (nodeIds: number[]) => {
  if (!workflowStore.currentWorkflow) return;
  await workflowStore.reorderNodes(workflowStore.currentWorkflow.workflow.id, nodeIds);
};

// ==================== 历史面板 ====================
const historyDetail = ref<WorkflowExecutionDetail | null>(null);
const historyCollapsed = ref(false);
// 恢复状态期间抑制 watcher 自动选第一条执行记录
const isRestoringState = ref(workflowStore.workflowReturnState.active);

// 选中工作流后自动加载最新执行记录详情
watch(
  () => workflowStore.executions,
  list => {
    if (isRestoringState.value) return;
    if (list.length > 0) {
      handleSelectHistoryExecution(list[0].id);
    } else {
      historyDetail.value = null;
    }
  },
  { immediate: true }
);

const handleSelectHistoryExecution = async (executionId: number) => {
  historyDetail.value = null;
  const result = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.GET_EXECUTION_DETAIL, { executionId });
  if (result.success && result.data) {
    historyDetail.value = result.data;
  }
};

const handleDeleteHistoryExecution = async (executionId: number) => {
  await workflowStore.deleteExecution(executionId);
  if (historyDetail.value?.execution.id === executionId) {
    historyDetail.value = null;
  }
};

const handleRenameHistoryExecution = async (executionId: number, label: string) => {
  await workflowStore.renameExecution(executionId, label);
};

const handleHistoryViewResult = async (
  ne: WorkflowNodeExecution & { nodeName: string; nodeType: WorkflowNodeType; nodeOrder: number }
) => {
  if (!historyDetail.value) return;
  const exec = historyDetail.value.execution;
  const targetTab = getTabForNodeType(ne.nodeType);
  if (!targetTab) return;

  let businessResultId = "";
  let outputVersionId = "";
  if (ne.resultJson) {
    try {
      const parsed = JSON.parse(ne.resultJson);
      if (parsed.businessResultId) businessResultId = String(parsed.businessResultId);
    } catch {}
  }
  if (ne.outputVersionId) outputVersionId = String(ne.outputVersionId);

  const query: any = { datasetId: exec.datasetId, tab: targetTab };
  if (businessResultId) query.businessResultId = businessResultId;
  if (outputVersionId) query.versionId = outputVersionId;

  workflowStore.workflowReturnState = {
    workflowId: workflowStore.currentWorkflow?.workflow.id,
    active: true,
    selectedNodeId: selectedNode.value?.id,
    selectedExecutionId: historyDetail.value?.execution.id,
  };
  await router.push({ name: "DataView", query });
};

// ==================== 结果查看跳转 ====================
const handleViewResult = async (node: WorkflowNode) => {
  const execDetail = workflowStore.getNodeExecution(node.id);
  if (!execDetail || execDetail.status !== "COMPLETED") return;
  if (!workflowStore.currentExecution) return;

  // Extract the target dataset, and any results
  const datasetId = workflowStore.currentExecution.datasetId;
  const targetTab = getTabForNodeType(node.nodeType);

  if (!datasetId || !targetTab) {
    ElMessageBox.alert("无法定位结果所在的数据集或功能模块", "提示");
    return;
  }

  let businessResultId = "";
  let outputVersionId = "";

  if (execDetail.resultJson) {
    try {
      const parsed = JSON.parse(execDetail.resultJson);
      if (parsed.businessResultId) businessResultId = String(parsed.businessResultId);
      if (execDetail.outputVersionId) outputVersionId = String(execDetail.outputVersionId);
    } catch (e) {}
  } else if (execDetail.outputVersionId) {
    outputVersionId = String(execDetail.outputVersionId);
  }

  const query: any = {
    datasetId,
    tab: targetTab,
    workflowId: workflowStore.currentWorkflow?.workflow.id,
  };

  if (businessResultId) query.businessResultId = businessResultId;
  if (outputVersionId) query.versionId = outputVersionId;

  // 设置 App 级返回工作流的状态
  workflowStore.workflowReturnState = {
    workflowId: workflowStore.currentWorkflow?.workflow.id,
    active: true,
    selectedNodeId: node.id,
    selectedExecutionId: historyDetail.value?.execution.id,
  };

  await router.push({ name: "DataView", query });
};

const getTabForNodeType = (nodeType: WorkflowNodeType): string | null => {
  const map: Record<string, string> = {
    OUTLIER_DETECTION: "outlier",
    IMPUTATION: "missing",
    FLUX_PARTITIONING: "flux-partitioning",
    EXPORT: "export",
  };
  return map[nodeType] || null;
};

// ==================== 执行管理 ====================
const getDefaultExecutionVersionId = async (datasetId: number) => {
  const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSIONS, { datasetId });
  if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
    throw new Error(result.error || "未找到可执行的数据版本");
  }

  const versions = [...result.data].sort((a: any, b: any) => {
    return (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id;
  });
  return (versions.find((v: any) => v.stageType === "RAW" && !v.parentVersionId) || versions[0]).id;
};

const handleExecute = async () => {
  if (!workflowStore.currentWorkflow || !configDatasetId.value || workflowStore.executing) return;
  try {
    const initialVersionId = await getDefaultExecutionVersionId(configDatasetId.value);
    await workflowStore.executeWorkflow({
      workflowId: workflowStore.currentWorkflow.workflow.id,
      datasetId: configDatasetId.value,
      initialVersionId,
    });
  } catch (error: any) {
    ElMessage.error(error?.message || "启动工作流失败");
  }
};

const handleCancelExecution = async () => {
  if (!workflowStore.currentExecution) return;
  await workflowStore.cancelExecution(workflowStore.currentExecution.id);
};

// ==================== 辅助 ====================
const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    DRAFT: "草稿",
    READY: "就绪",
    RUNNING: "运行中",
    COMPLETED: "已完成",
    FAILED: "失败",
  };
  return map[s] || s;
};

// ==================== 生命周期 ====================
onMounted(async () => {
  workflowStore.startProgressListener();

  if (workflowStore.workflowReturnState.active) {
    // 从查看结果页返回：恢复跳转前的 UI 状态
    const { selectedNodeId, selectedExecutionId } = workflowStore.workflowReturnState;

    // 恢复右侧节点配置面板
    if (selectedNodeId) {
      const node = workflowStore.currentNodes.find(n => n.id === selectedNodeId);
      if (node) selectedNode.value = node;
    }

    // 恢复历史面板选中的执行记录
    if (selectedExecutionId) {
      await handleSelectHistoryExecution(selectedExecutionId);
    } else if (workflowStore.executions.length > 0) {
      await handleSelectHistoryExecution(workflowStore.executions[0].id);
    }

    // 清除返回状态标记
    workflowStore.workflowReturnState = { active: false };
    isRestoringState.value = false;

    // 刷新工作流列表（不重置当前选中状态）
    await workflowStore.loadWorkflows();
  } else {
    await workflowStore.loadWorkflows();
  }
});

onUnmounted(() => {
  workflowStore.stopProgressListener();
  // 若是跳转到结果查看页，保留 store 状态以便返回时恢复
  if (!workflowStore.workflowReturnState.active) {
    workflowStore.resetState();
  }
});
</script>

<style scoped>
.workflow-page {
  display: flex;
  height: 100%;
  gap: 0;
  background: var(--c-bg-page);
}

/* 左侧列表 */
.workflow-sidebar {
  width: 280px;
  min-width: 280px;
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
  background: var(--c-bg-surface);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--c-border);
}

.sidebar-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--c-text-base);
  margin: 0;
}

.btn-create {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-btn);
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-create:hover {
  background: var(--c-brand-muted);
}

.btn-icon {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  line-height: 1;
}

/* 中间编辑器 */
.workflow-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg-surface);
}

.workflow-info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.workflow-name {
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  color: var(--c-text-base);
  margin: 0;
  cursor: pointer;
}

.rename-input {
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  border: 1px solid var(--c-brand);
  border-radius: var(--radius-input);
  padding: 2px var(--space-2);
  outline: none;
  background: var(--c-bg-surface);
}

.workflow-status {
  padding: 3px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}

.status-draft {
  background: var(--color-neutral-100);
  color: var(--c-text-muted);
}
.status-ready {
  background: var(--c-info-bg);
  color: var(--c-info);
}
.status-running {
  background: var(--c-warning-bg);
  color: var(--c-warning);
}
.status-completed {
  background: var(--c-brand-soft);
  color: var(--c-brand);
}
.status-failed {
  background: var(--c-danger-bg);
  color: var(--c-danger);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.btn-config-dataset {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 260px;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--c-brand-border);
  border-radius: var(--radius-btn);
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-size: var(--text-md);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-config-dataset:hover {
  background: var(--c-brand-muted);
  border-color: var(--c-brand);
}

.config-dataset-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-execute {
  padding: var(--space-2) var(--space-5);
  border: none;
  border-radius: var(--radius-btn);
  background: linear-gradient(135deg, var(--c-brand), var(--c-brand-hover));
  color: var(--c-text-inverse);
  font-size: var(--text-md);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-execute:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-brand);
}

.btn-execute:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 历史面板列（工作流列表右侧） */
.workflow-history-col {
  width: 480px;
  min-width: 480px;
  border-right: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 右侧配置面板 */
.workflow-config {
  width: 340px;
  min-width: 340px;
  border-left: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  overflow-y: auto;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

.empty-icon {
  font-size: var(--text-display-lg);
}

.empty-text {
  color: var(--c-text-disabled);
  font-size: var(--text-lg);
}

.btn-create-large {
  padding: var(--space-2) var(--space-7);
  border: 2px dashed var(--c-brand-border);
  border-radius: var(--radius-control);
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-size: var(--text-md);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-create-large:hover {
  background: var(--c-brand-muted);
  border-color: var(--c-brand);
}
</style>
