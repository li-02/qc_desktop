import { BrowserWindow } from "electron";
import { WorkflowRepository } from "../repository/WorkflowRepository";
import type {
  Workflow,
  WorkflowNode,
  WorkflowWithNodes,
  WorkflowExecution,
  WorkflowExecutionDetail,
  WorkflowProgressEvent,
  WorkflowRow,
  WorkflowNodeRow,
  WorkflowExecutionRow,
  WorkflowStatus,
  WorkflowNodeType,
  NodeExecutionContext,
  NodeExecutionResult,
} from "@shared/types/workflow";
import { NODE_TYPE_META } from "@shared/types/workflow";

// ==================== 节点执行器接口 ====================

export interface INodeExecutor {
  readonly nodeType: WorkflowNodeType;
  execute(context: NodeExecutionContext): Promise<NodeExecutionResult>;
}

// ==================== 辅助映射函数 ====================

function mapWorkflowRow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    datasetId: row.dataset_id,
    initialVersionId: row.initial_version_id,
    status: row.status as WorkflowStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNodeRow(row: WorkflowNodeRow): WorkflowNode {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    nodeOrder: row.node_order,
    nodeType: row.node_type as WorkflowNodeType,
    nodeName: row.node_name,
    configJson: row.config_json,
    isEnabled: row.is_enabled === 1,
    positionX: row.position_x,
    positionY: row.position_y,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExecutionRow(row: WorkflowExecutionRow): WorkflowExecution {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    datasetId: row.dataset_id,
    initialVersionId: row.initial_version_id,
    status: row.status as any,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalNodes: row.total_nodes,
    completedNodes: row.completed_nodes,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

// ==================== WorkflowService ====================

export class WorkflowService {
  private nodeExecutors: Map<WorkflowNodeType, INodeExecutor> = new Map();
  private cancelFlags: Map<number, boolean> = new Map();

  constructor(private workflowRepo: WorkflowRepository) {}

  /**
   * 注册节点执行器
   */
  registerExecutor(executor: INodeExecutor): void {
    this.nodeExecutors.set(executor.nodeType, executor);
  }

  // ==================== 工作流管理 ====================

  createWorkflow(params: { name: string; description?: string }): Workflow {
    const id = this.workflowRepo.createWorkflow(params);
    const row = this.workflowRepo.getWorkflowById(id);
    if (!row) throw new Error("WORKFLOW_NOT_FOUND");
    return mapWorkflowRow(row);
  }

  updateWorkflow(params: {
    workflowId: number;
    name?: string;
    description?: string;
    status?: WorkflowStatus;
  }): Workflow {
    const existing = this.workflowRepo.getWorkflowById(params.workflowId);
    if (!existing) throw new Error("WORKFLOW_NOT_FOUND");
    if (existing.status === "RUNNING") throw new Error("WORKFLOW_ALREADY_RUNNING");

    this.workflowRepo.updateWorkflow(params.workflowId, {
      name: params.name,
      description: params.description,
      status: params.status,
    });

    const row = this.workflowRepo.getWorkflowById(params.workflowId);
    if (!row) throw new Error("WORKFLOW_NOT_FOUND");
    return mapWorkflowRow(row);
  }

  deleteWorkflow(workflowId: number): boolean {
    const existing = this.workflowRepo.getWorkflowById(workflowId);
    if (!existing) throw new Error("WORKFLOW_NOT_FOUND");
    if (existing.status === "RUNNING") throw new Error("WORKFLOW_ALREADY_RUNNING");

    this.workflowRepo.deleteWorkflow(workflowId);
    return true;
  }

  getAllWorkflows(): Workflow[] {
    return this.workflowRepo.getAllWorkflows().map(mapWorkflowRow);
  }

  getWorkflowById(workflowId: number): WorkflowWithNodes {
    const row = this.workflowRepo.getWorkflowById(workflowId);
    if (!row) throw new Error("WORKFLOW_NOT_FOUND");

    const nodeRows = this.workflowRepo.getNodesByWorkflowId(workflowId);
    const lastExecRow = this.workflowRepo.getLatestExecution(workflowId);

    return {
      workflow: mapWorkflowRow(row),
      nodes: nodeRows.map(mapNodeRow),
      lastExecution: lastExecRow ? mapExecutionRow(lastExecRow) : undefined,
    };
  }

  cloneWorkflow(workflowId: number, newName: string): Workflow {
    const newId = this.workflowRepo.cloneWorkflow(workflowId, newName);
    const row = this.workflowRepo.getWorkflowById(newId);
    if (!row) throw new Error("WORKFLOW_NOT_FOUND");
    return mapWorkflowRow(row);
  }

  // ==================== 节点管理 ====================

  addNode(params: {
    workflowId: number;
    nodeType: WorkflowNodeType;
    nodeName: string;
    configJson?: string;
    nodeOrder?: number;
  }): WorkflowNode {
    const workflow = this.workflowRepo.getWorkflowById(params.workflowId);
    if (!workflow) throw new Error("WORKFLOW_NOT_FOUND");
    if (workflow.status === "RUNNING") throw new Error("WORKFLOW_ALREADY_RUNNING");

    let nodeOrder: number;
    if (params.nodeOrder !== undefined) {
      // 插入到指定位置，后续节点后移
      this.workflowRepo.shiftNodesAfter(params.workflowId, params.nodeOrder);
      nodeOrder = params.nodeOrder;
    } else {
      // 追加到末尾
      nodeOrder = this.workflowRepo.getMaxNodeOrder(params.workflowId) + 1;
    }

    // 验证 configJson 合法性
    if (params.configJson) {
      try {
        JSON.parse(params.configJson);
      } catch {
        throw new Error("NODE_CONFIG_INVALID");
      }
    }

    const nodeId = this.workflowRepo.addNode({
      workflowId: params.workflowId,
      nodeOrder,
      nodeType: params.nodeType,
      nodeName: params.nodeName,
      configJson: params.configJson,
    });

    // 重置工作流状态为 DRAFT
    this.workflowRepo.updateWorkflowStatus(params.workflowId, "DRAFT");

    const nodeRow = this.workflowRepo.getNodeById(nodeId);
    if (!nodeRow) throw new Error("NODE_NOT_FOUND");
    return mapNodeRow(nodeRow);
  }

  updateNode(params: { nodeId: number; nodeName?: string; configJson?: string; isEnabled?: boolean }): WorkflowNode {
    const node = this.workflowRepo.getNodeById(params.nodeId);
    if (!node) throw new Error("NODE_NOT_FOUND");

    const workflow = this.workflowRepo.getWorkflowById(node.workflow_id);
    if (workflow?.status === "RUNNING") throw new Error("WORKFLOW_ALREADY_RUNNING");

    // 验证 configJson 合法性
    if (params.configJson) {
      try {
        JSON.parse(params.configJson);
      } catch {
        throw new Error("NODE_CONFIG_INVALID");
      }
    }

    this.workflowRepo.updateNode(params.nodeId, {
      nodeName: params.nodeName,
      configJson: params.configJson,
      isEnabled: params.isEnabled,
    });

    // 重置工作流状态为 DRAFT
    if (workflow) {
      this.workflowRepo.updateWorkflowStatus(workflow.id, "DRAFT");
    }

    const updatedRow = this.workflowRepo.getNodeById(params.nodeId);
    if (!updatedRow) throw new Error("NODE_NOT_FOUND");
    return mapNodeRow(updatedRow);
  }

  deleteNode(nodeId: number): boolean {
    const node = this.workflowRepo.getNodeById(nodeId);
    if (!node) throw new Error("NODE_NOT_FOUND");

    const workflow = this.workflowRepo.getWorkflowById(node.workflow_id);
    if (workflow?.status === "RUNNING") throw new Error("WORKFLOW_ALREADY_RUNNING");

    this.workflowRepo.deleteNode(nodeId);

    // 重排剩余节点顺序
    const remainingNodes = this.workflowRepo.getNodesByWorkflowId(node.workflow_id);
    const reorders = remainingNodes.map((n, index) => ({
      nodeId: n.id,
      nodeOrder: index + 1,
    }));
    if (reorders.length > 0) {
      this.workflowRepo.reorderNodes(reorders);
    }

    // 重置工作流状态为 DRAFT
    if (workflow) {
      this.workflowRepo.updateWorkflowStatus(workflow.id, "DRAFT");
    }

    return true;
  }

  reorderNodes(workflowId: number, nodeIds: number[]): boolean {
    const workflow = this.workflowRepo.getWorkflowById(workflowId);
    if (!workflow) throw new Error("WORKFLOW_NOT_FOUND");
    if (workflow.status === "RUNNING") throw new Error("WORKFLOW_ALREADY_RUNNING");

    const reorders = nodeIds.map((id, index) => ({
      nodeId: id,
      nodeOrder: index + 1,
    }));
    this.workflowRepo.reorderNodes(reorders);

    // 重置工作流状态为 DRAFT
    this.workflowRepo.updateWorkflowStatus(workflowId, "DRAFT");

    return true;
  }

  getNodes(workflowId: number): WorkflowNode[] {
    return this.workflowRepo.getNodesByWorkflowId(workflowId).map(mapNodeRow);
  }

  // ==================== 执行管理 ====================

  /**
   * 执行工作流（同步创建记录，异步执行流水线）
   */
  executeWorkflow(
    params: {
      workflowId: number;
      datasetId: number;
      initialVersionId: number;
    },
    mainWindow: BrowserWindow | null
  ): WorkflowExecution {
    const workflowRow = this.workflowRepo.getWorkflowById(params.workflowId);
    if (!workflowRow) throw new Error("WORKFLOW_NOT_FOUND");
    if (workflowRow.status === "RUNNING") throw new Error("WORKFLOW_ALREADY_RUNNING");

    // 获取启用的节点
    const allNodeRows = this.workflowRepo.getNodesByWorkflowId(params.workflowId);
    const enabledNodes = allNodeRows.filter(n => n.is_enabled === 1);
    if (enabledNodes.length === 0) throw new Error("WORKFLOW_NO_NODES");

    // 创建执行记录（含目标数据集信息）
    const executionId = this.workflowRepo.createExecution({
      workflowId: params.workflowId,
      datasetId: params.datasetId,
      initialVersionId: params.initialVersionId,
      totalNodes: enabledNodes.length,
    });

    // 为每个启用节点创建节点执行记录
    const nodeExecIds: number[] = [];
    for (const node of enabledNodes) {
      const neId = this.workflowRepo.createNodeExecution({
        executionId,
        nodeId: node.id,
      });
      nodeExecIds.push(neId);
    }

    // 更新工作流状态
    this.workflowRepo.updateWorkflowStatus(params.workflowId, "RUNNING");

    // 获取执行记录对象返回
    const execRow = this.workflowRepo.getExecutionById(executionId);
    if (!execRow) throw new Error("EXECUTION_NOT_FOUND");
    const execution = mapExecutionRow(execRow);

    // 异步执行流水线
    this.cancelFlags.set(executionId, false);
    const workflow = mapWorkflowRow(workflowRow);
    const nodes = enabledNodes.map(mapNodeRow);

    setImmediate(() => {
      this.runPipeline(
        workflow,
        nodes,
        executionId,
        nodeExecIds,
        execution.datasetId,
        execution.initialVersionId,
        mainWindow
      ).catch(err => {
        console.error("[WorkflowService] Pipeline unexpected error:", err);
      });
    });

    return execution;
  }

  /**
   * 取消执行
   */
  cancelExecution(executionId: number): boolean {
    const exec = this.workflowRepo.getExecutionById(executionId);
    if (!exec) throw new Error("EXECUTION_NOT_FOUND");
    if (exec.status !== "RUNNING") throw new Error("EXECUTION_NOT_RUNNING");

    this.cancelFlags.set(executionId, true);
    return true;
  }

  /**
   * 获取执行历史
   */
  getExecutions(workflowId: number): WorkflowExecution[] {
    return this.workflowRepo.getExecutionsByWorkflow(workflowId).map(mapExecutionRow);
  }

  /**
   * 获取执行详情
   */
  getExecutionDetail(executionId: number): WorkflowExecutionDetail {
    const execRow = this.workflowRepo.getExecutionById(executionId);
    if (!execRow) throw new Error("EXECUTION_NOT_FOUND");

    const nodeExecRows = this.workflowRepo.getNodeExecutionsByExecutionId(executionId);

    return {
      execution: mapExecutionRow(execRow),
      nodeExecutions: nodeExecRows.map(row => ({
        id: row.id,
        executionId: row.execution_id,
        nodeId: row.node_id,
        inputVersionId: row.input_version_id,
        outputVersionId: row.output_version_id,
        status: row.status as any,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        resultJson: row.result_json,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        nodeName: row.node_name,
        nodeType: row.node_type as WorkflowNodeType,
        nodeOrder: row.node_order,
      })),
    };
  }

  // ==================== 核心流水线 ====================

  private async runPipeline(
    workflow: Workflow,
    enabledNodes: WorkflowNode[],
    executionId: number,
    nodeExecIds: number[],
    datasetId: number,
    initialVersionId: number,
    mainWindow: BrowserWindow | null
  ): Promise<void> {
    // 更新执行状态为 RUNNING
    this.workflowRepo.updateExecution(executionId, {
      status: "RUNNING",
      startedAt: new Date().toISOString(),
    });

    let currentVersionId = initialVersionId;
    let completedCount = 0;
    let failed = false;

    for (let i = 0; i < enabledNodes.length; i++) {
      const node = enabledNodes[i];
      const nodeExecId = nodeExecIds[i];

      // 检查是否被取消
      if (this.cancelFlags.get(executionId)) {
        for (let j = i; j < enabledNodes.length; j++) {
          this.workflowRepo.updateNodeExecution(nodeExecIds[j], { status: "SKIPPED" });
        }
        this.workflowRepo.updateExecution(executionId, {
          status: "CANCELLED",
          finishedAt: new Date().toISOString(),
        });
        this.workflowRepo.updateWorkflowStatus(workflow.id, "FAILED");
        this.pushProgress(mainWindow, {
          executionId,
          currentNodeIndex: i,
          totalNodes: enabledNodes.length,
          nodeStatus: "SKIPPED",
          message: "执行已取消",
        });
        this.cancelFlags.delete(executionId);
        return;
      }

      // 更新节点执行状态为 RUNNING
      this.workflowRepo.updateNodeExecution(nodeExecId, {
        status: "RUNNING",
        inputVersionId: currentVersionId,
        startedAt: new Date().toISOString(),
      });

      this.pushProgress(mainWindow, {
        executionId,
        currentNodeIndex: i,
        totalNodes: enabledNodes.length,
        nodeStatus: "RUNNING",
        message: `正在执行: ${node.nodeName}`,
      });

      try {
        const executor = this.nodeExecutors.get(node.nodeType);
        if (!executor) {
          throw new Error(`未知的节点类型: ${node.nodeType}`);
        }

        const config = node.configJson ? JSON.parse(node.configJson) : {};

        const result = await executor.execute({
          datasetId: datasetId,
          inputVersionId: currentVersionId,
          config,
          onProgress: (progress: number, message: string) => {
            this.pushProgress(mainWindow, {
              executionId,
              currentNodeIndex: i,
              totalNodes: enabledNodes.length,
              nodeStatus: "RUNNING",
              nodeProgress: progress,
              message,
            });
          },
        });

        // 节点成功
        this.workflowRepo.updateNodeExecution(nodeExecId, {
          status: "COMPLETED",
          outputVersionId: result.outputVersionId,
          finishedAt: new Date().toISOString(),
          resultJson: result.resultData ? JSON.stringify(result.resultData) : null,
        });

        if (result.outputVersionId) {
          currentVersionId = result.outputVersionId;
        }

        completedCount++;
        this.workflowRepo.updateExecution(executionId, {
          completedNodes: completedCount,
        });

        this.pushProgress(mainWindow, {
          executionId,
          currentNodeIndex: i,
          totalNodes: enabledNodes.length,
          nodeStatus: "COMPLETED",
          message: `完成: ${node.nodeName}`,
        });
      } catch (error: any) {
        // 节点失败
        this.workflowRepo.updateNodeExecution(nodeExecId, {
          status: "FAILED",
          finishedAt: new Date().toISOString(),
          errorMessage: error.message || "未知错误",
        });

        this.pushProgress(mainWindow, {
          executionId,
          currentNodeIndex: i,
          totalNodes: enabledNodes.length,
          nodeStatus: "FAILED",
          message: `失败: ${node.nodeName} - ${error.message}`,
        });

        // 标记后续节点为 SKIPPED
        for (let j = i + 1; j < enabledNodes.length; j++) {
          this.workflowRepo.updateNodeExecution(nodeExecIds[j], { status: "SKIPPED" });
        }

        this.workflowRepo.updateExecution(executionId, {
          status: "FAILED",
          finishedAt: new Date().toISOString(),
          errorMessage: `节点 "${node.nodeName}" 执行失败: ${error.message}`,
        });
        this.workflowRepo.updateWorkflowStatus(workflow.id, "FAILED");

        failed = true;
        break;
      }
    }

    // 全部成功
    if (!failed) {
      this.workflowRepo.updateExecution(executionId, {
        status: "COMPLETED",
        finishedAt: new Date().toISOString(),
      });
      this.workflowRepo.updateWorkflowStatus(workflow.id, "COMPLETED");

      this.pushProgress(mainWindow, {
        executionId,
        currentNodeIndex: enabledNodes.length - 1,
        totalNodes: enabledNodes.length,
        nodeStatus: "COMPLETED",
        message: "工作流执行完成",
      });
    }

    this.cancelFlags.delete(executionId);
  }

  private pushProgress(mainWindow: BrowserWindow | null, event: WorkflowProgressEvent): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:progress", event);
    }
  }
}
