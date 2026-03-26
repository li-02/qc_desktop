import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import type {
  Workflow,
  WorkflowNode,
  WorkflowWithNodes,
  WorkflowExecution,
  WorkflowExecutionDetail,
  WorkflowProgressEvent,
  CreateWorkflowRequest,
  ExecuteWorkflowRequest,
  AddNodeRequest,
  UpdateNodeRequest,
} from "@shared/types/workflow";

type Result<T> = { success: boolean; data?: T; error?: string };

export const useWorkflowStore = defineStore("workflow", () => {
  // ==================== State ====================

  const workflows = ref<Workflow[]>([]);
  const currentWorkflow = ref<WorkflowWithNodes | null>(null);
  const currentExecution = ref<WorkflowExecution | null>(null);
  const executionProgress = ref<WorkflowProgressEvent | null>(null);  // 记录工作流结果查看的全局状态
  const workflowReturnState = ref<{
    active: boolean;
    workflowId?: number;
    selectedNodeId?: number;
    selectedExecutionId?: number;
  }>({ active: false });

  // 执行细节管理
  const executionDetail = ref<WorkflowExecutionDetail | null>(null);
  const executions = ref<WorkflowExecution[]>([]);
  const loading = ref(false);
  const executing = ref(false);

  // ==================== Computed ====================

  const hasWorkflows = computed(() => workflows.value.length > 0);
  const currentNodes = computed(() => currentWorkflow.value?.nodes ?? []);
  const enabledNodes = computed(() => currentNodes.value.filter(n => n.isEnabled));

  const overallProgress = computed(() => {
    if (!executionProgress.value) return 0;
    const { currentNodeIndex, totalNodes, nodeProgress } = executionProgress.value;
    const completedRatio = currentNodeIndex / totalNodes;
    const currentRatio = (nodeProgress || 0) / 100 / totalNodes;
    return Math.round((completedRatio + currentRatio) * 100);
  });

  const getNodeExecution = (nodeId: number) => {
    if (!executionDetail.value) return null;
    return executionDetail.value.nodeExecutions.find(ne => ne.nodeId === nodeId) || null;
  };

  // ==================== 工作流管理 ====================

  const loadWorkflows = async () => {
    loading.value = true;
    try {
      const result: Result<Workflow[]> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.GET_ALL);
      if (result.success && result.data) {
        workflows.value = result.data;
      }
    } catch (error: any) {
      ElMessage.error("加载工作流列表失败");
    } finally {
      loading.value = false;
    }
  };

  const loadWorkflowDetail = async (workflowId: number) => {
    loading.value = true;
    try {
      const result: Result<WorkflowWithNodes> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.GET_BY_ID, {
        workflowId,
      });
      if (result.success && result.data) {
        currentWorkflow.value = result.data;
        // 自动加载最近一次执行的详情
        if (result.data.lastExecution) {
          currentExecution.value = result.data.lastExecution;
          await loadExecutionDetail(result.data.lastExecution.id);
        } else {
          currentExecution.value = null;
          executionDetail.value = null;
        }
        await loadExecutions(result.data.workflow.id);
      }
    } catch (error: any) {
      ElMessage.error("加载工作流详情失败");
    } finally {
      loading.value = false;
    }
  };

  const createWorkflow = async (request: CreateWorkflowRequest): Promise<Workflow | null> => {
    try {
      const result: Result<Workflow> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.CREATE, request);
      if (result.success && result.data) {
        workflows.value.unshift(result.data);
        ElMessage.success("工作流创建成功");
        return result.data;
      } else {
        ElMessage.error(result.error || "创建工作流失败");
        return null;
      }
    } catch (error: any) {
      ElMessage.error("创建工作流失败");
      return null;
    }
  };

  const updateWorkflow = async (params: { workflowId: number; name?: string; description?: string }) => {
    try {
      const result: Result<Workflow> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.UPDATE, params);
      if (result.success && result.data) {
        const idx = workflows.value.findIndex(w => w.id === params.workflowId);
        if (idx !== -1) workflows.value[idx] = result.data;
        if (currentWorkflow.value?.workflow.id === params.workflowId) {
          currentWorkflow.value.workflow = result.data;
        }
        return true;
      }
      return false;
    } catch {
      ElMessage.error("更新工作流失败");
      return false;
    }
  };

  const deleteWorkflow = async (workflowId: number) => {
    try {
      const result: Result<boolean> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.DELETE, { workflowId });
      if (result.success) {
        workflows.value = workflows.value.filter(w => w.id !== workflowId);
        if (currentWorkflow.value?.workflow.id === workflowId) {
          currentWorkflow.value = null;
        }
        ElMessage.success("工作流已删除");
        return true;
      }
      return false;
    } catch {
      ElMessage.error("删除工作流失败");
      return false;
    }
  };

  const cloneWorkflow = async (workflowId: number, newName: string) => {
    try {
      const result: Result<Workflow> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.CLONE, {
        workflowId,
        newName,
      });
      if (result.success && result.data) {
        workflows.value.unshift(result.data);
        ElMessage.success("工作流克隆成功");
        return result.data;
      }
      return null;
    } catch {
      ElMessage.error("克隆工作流失败");
      return null;
    }
  };

  // ==================== 节点管理 ====================

  const addNode = async (params: AddNodeRequest): Promise<WorkflowNode | null> => {
    try {
      const result: Result<WorkflowNode> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.ADD_NODE, params);
      if (result.success && result.data) {
        if (currentWorkflow.value) {
          currentWorkflow.value.nodes.push(result.data);
          currentWorkflow.value.nodes.sort((a, b) => a.nodeOrder - b.nodeOrder);
        }
        return result.data;
      } else {
        ElMessage.error(result.error || "添加节点失败");
        return null;
      }
    } catch {
      ElMessage.error("添加节点失败");
      return null;
    }
  };

  const updateNode = async (params: UpdateNodeRequest): Promise<boolean> => {
    try {
      const result: Result<WorkflowNode> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.UPDATE_NODE, params);
      if (result.success && result.data && currentWorkflow.value) {
        const idx = currentWorkflow.value.nodes.findIndex(n => n.id === params.nodeId);
        if (idx !== -1) {
          currentWorkflow.value.nodes[idx] = result.data;
        }
        return true;
      }
      return false;
    } catch {
      ElMessage.error("更新节点失败");
      return false;
    }
  };

  const deleteNode = async (nodeId: number): Promise<boolean> => {
    try {
      const result: Result<boolean> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.DELETE_NODE, { nodeId });
      if (result.success && currentWorkflow.value) {
        currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter(n => n.id !== nodeId);
        // 重新加载详情以获取更新后的 nodeOrder
        await loadWorkflowDetail(currentWorkflow.value.workflow.id);
        return true;
      }
      return false;
    } catch {
      ElMessage.error("删除节点失败");
      return false;
    }
  };

  const reorderNodes = async (workflowId: number, nodeIds: number[]): Promise<boolean> => {
    try {
      const result: Result<boolean> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.REORDER_NODES, {
        workflowId,
        nodeIds,
      });
      if (result.success) {
        await loadWorkflowDetail(workflowId);
        return true;
      }
      return false;
    } catch {
      ElMessage.error("重排节点失败");
      return false;
    }
  };

  // ==================== 执行管理 ====================

  const executeWorkflow = async (params: ExecuteWorkflowRequest) => {
    executing.value = true;
    executionProgress.value = null;
    try {
      const result: Result<WorkflowExecution> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.EXECUTE, params);
      if (result.success && result.data) {
        currentExecution.value = result.data;
        ElMessage.info("工作流开始执行");
        return result.data;
      } else {
        ElMessage.error(result.error || "启动执行失败");
        executing.value = false;
        return null;
      }
    } catch {
      ElMessage.error("启动执行失败");
      executing.value = false;
      return null;
    }
  };

  const cancelExecution = async (executionId: number) => {
    try {
      const result: Result<boolean> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.CANCEL, { executionId });
      if (result.success) {
        ElMessage.warning("正在取消执行...");
      }
    } catch {
      ElMessage.error("取消执行失败");
    }
  };

  const loadExecutionDetail = async (executionId: number) => {
    try {
      const result: Result<WorkflowExecutionDetail> = await window.electronAPI.invoke(
        API_ROUTES.WORKFLOW.GET_EXECUTION_DETAIL,
        { executionId }
      );
      if (result.success && result.data) {
        executionDetail.value = result.data;
      }
    } catch {
      ElMessage.error("加载执行详情失败");
    }
  };

  const loadExecutions = async (workflowId: number) => {
    try {
      const result: Result<WorkflowExecution[]> = await window.electronAPI.invoke(
        API_ROUTES.WORKFLOW.GET_EXECUTIONS,
        { workflowId }
      );
      if (result.success && result.data) {
        executions.value = result.data;
      } else {
        executions.value = [];
      }
    } catch {
      executions.value = [];
    }
  };

  const deleteExecution = async (executionId: number): Promise<boolean> => {
    try {
      const result: Result<boolean> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.DELETE_EXECUTION, { executionId });
      if (result.success) {
        executions.value = executions.value.filter(e => e.id !== executionId);
        if (executionDetail.value?.execution.id === executionId) {
          executionDetail.value = null;
        }
        ElMessage.success("历史记录已删除");
        return true;
      }
      return false;
    } catch {
      ElMessage.error("删除历史记录失败");
      return false;
    }
  };

  const renameExecution = async (executionId: number, label: string): Promise<boolean> => {
    try {
      const result: Result<boolean> = await window.electronAPI.invoke(API_ROUTES.WORKFLOW.RENAME_EXECUTION, { executionId, label });
      if (result.success) {
        const idx = executions.value.findIndex(e => e.id === executionId);
        if (idx !== -1) executions.value[idx] = { ...executions.value[idx], label };
        if (executionDetail.value?.execution.id === executionId) {
          executionDetail.value = {
            ...executionDetail.value,
            execution: { ...executionDetail.value.execution, label },
          };
        }
        ElMessage.success("重命名成功");
        return true;
      }
      return false;
    } catch {
      ElMessage.error("重命名失败");
      return false;
    }
  };

  // ==================== 进度监听 ====================

  const updateProgress = (event: WorkflowProgressEvent) => {
    executionProgress.value = event;

    // 执行结束时更新状态
    if (
      (event.nodeStatus === "COMPLETED" && event.message === "工作流执行完成") ||
      event.nodeStatus === "FAILED" ||
      (event.nodeStatus === "SKIPPED" && event.message === "执行已取消")
    ) {
      executing.value = false;
      // 重新加载工作流详情
      if (currentWorkflow.value) {
        loadWorkflowDetail(currentWorkflow.value.workflow.id);
      }
    }
  };

  const startProgressListener = () => {
    window.electronAPI.on("workflow:progress", (_event: any, data: WorkflowProgressEvent) => {
      updateProgress(data);
    });
  };

  const stopProgressListener = () => {
    window.electronAPI.removeListener("workflow:progress", () => { });
  };

  // ==================== 清理 ====================

  const resetState = () => {
    currentWorkflow.value = null;
    currentExecution.value = null;
    executionProgress.value = null;
    executionDetail.value = null;
    executions.value = [];
    executing.value = false;
  };

  return {
    // state
    workflows,
    currentWorkflow,
    currentExecution,
    executionDetail,
    executionProgress,
    workflowReturnState,
    loading,
    executing,
    // computed
    hasWorkflows,
    currentNodes,
    enabledNodes,
    overallProgress,
    getNodeExecution,
    // 工作流管理
    loadWorkflows,
    loadWorkflowDetail,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    cloneWorkflow,
    // 节点管理
    addNode,
    updateNode,
    deleteNode,
    reorderNodes,
    // 执行管理
    executeWorkflow,
    cancelExecution,
    loadExecutionDetail,
    loadExecutions,
    deleteExecution,
    renameExecution,
    executions,
    // 进度监听
    updateProgress,
    startProgressListener,
    stopProgressListener,
    // 清理
    resetState,
  };
});
