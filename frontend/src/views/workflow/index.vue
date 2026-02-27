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
            <button
              class="btn-execute"
              :disabled="workflowStore.executing || workflowStore.enabledNodes.length === 0"
              @click="showExecuteDialog = true">
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
          @reorder="handleReorder" />

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
        :dataset-id="executeForm.datasetId ?? undefined"
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

    <!-- 应用到数据集弹窗 -->
    <el-dialog v-model="showExecuteDialog" title="应用到数据集" width="480px" :close-on-click-modal="false">
      <el-form :model="executeForm" label-width="80px">
        <el-form-item label="数据集" required>
          <el-select v-model="executeForm.datasetId" placeholder="选择目标数据集" style="width: 100%">
            <el-option v-for="ds in datasets" :key="ds.id" :label="ds.name" :value="ds.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据版本" required v-if="executeForm.datasetId">
          <el-select v-model="executeForm.initialVersionId" placeholder="选择初始版本" style="width: 100%">
            <el-option v-for="v in execVersions" :key="v.id" :label="v.name || `版本 ${v.id}`" :value="v.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExecuteDialog = false">取消</el-button>
        <el-button type="primary" @click="handleExecute" :disabled="!canExecute">执行</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useWorkflowStore } from "@/stores/useWorkflowStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { ElMessageBox } from "element-plus";
import WorkflowList from "./components/WorkflowList.vue";
import WorkflowEditor from "./components/WorkflowEditor.vue";
import NodeConfigPanel from "./components/NodeConfigPanel.vue";
import NodeTypeSelector from "./components/NodeTypeSelector.vue";
import WorkflowExecutionView from "./components/WorkflowExecutionView.vue";
import type { WorkflowNode, WorkflowNodeType } from "@shared/types/workflow";
import { API_ROUTES } from "@shared/constants/apiRoutes";

const workflowStore = useWorkflowStore();
const datasetStore = useDatasetStore();

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

// ==================== 执行表单（应用到数据集） ====================
const showExecuteDialog = ref(false);
const executeForm = ref({
  datasetId: null as number | null,
  initialVersionId: null as number | null,
});

const datasets = computed(() => datasetStore.datasets || []);
const execVersions = ref<any[]>([]);

watch(
  () => executeForm.value.datasetId,
  async dsId => {
    if (!dsId) {
      execVersions.value = [];
      return;
    }
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.DATASETS.GET_VERSIONS, { datasetId: dsId });
      if (result.success) execVersions.value = result.data || [];
      else execVersions.value = [];
    } catch {
      execVersions.value = [];
    }
    executeForm.value.initialVersionId = null;
  }
);

const canExecute = computed(() => executeForm.value.datasetId && executeForm.value.initialVersionId);

// ==================== 工作流选择 ====================
const handleSelectWorkflow = async (workflowId: number) => {
  selectedNode.value = null;
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

// ==================== 执行管理 ====================
const handleExecute = async () => {
  if (!workflowStore.currentWorkflow || !canExecute.value) return;
  showExecuteDialog.value = false;
  await workflowStore.executeWorkflow({
    workflowId: workflowStore.currentWorkflow.workflow.id,
    datasetId: executeForm.value.datasetId!,
    initialVersionId: executeForm.value.initialVersionId!,
  });
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
  await workflowStore.loadWorkflows();
});

onUnmounted(() => {
  workflowStore.stopProgressListener();
  workflowStore.resetState();
});
</script>

<style scoped>
.workflow-page {
  display: flex;
  height: 100%;
  gap: 0;
  background: linear-gradient(135deg, rgba(250, 250, 249, 0.8) 0%, rgba(236, 253, 245, 0.3) 100%);
}

/* 左侧列表 */
.workflow-sidebar {
  width: 280px;
  min-width: 280px;
  border-right: 1px solid rgba(229, 231, 235, 0.5);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(12px);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
}

.sidebar-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.btn-create {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-create:hover {
  background: rgba(16, 185, 129, 0.2);
}

.btn-icon {
  font-size: 16px;
  font-weight: 700;
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
  padding: 16px 20px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.4);
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px);
}

.workflow-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workflow-name {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  cursor: pointer;
}

.rename-input {
  font-size: 18px;
  font-weight: 600;
  border: 1px solid #10b981;
  border-radius: 6px;
  padding: 2px 8px;
  outline: none;
  background: rgba(255, 255, 255, 0.9);
}

.workflow-status {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-draft {
  background: rgba(156, 163, 175, 0.15);
  color: #6b7280;
}
.status-ready {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
.status-running {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}
.status-completed {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
.status-failed {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.btn-execute {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-execute:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-execute:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 右侧配置面板 */
.workflow-config {
  width: 340px;
  min-width: 340px;
  border-left: 1px solid rgba(229, 231, 235, 0.5);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(12px);
  overflow-y: auto;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.empty-icon {
  font-size: 48px;
}

.empty-text {
  color: #9ca3af;
  font-size: 15px;
}

.btn-create-large {
  padding: 10px 28px;
  border: 2px dashed rgba(16, 185, 129, 0.4);
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.05);
  color: #10b981;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-create-large:hover {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
}
</style>
