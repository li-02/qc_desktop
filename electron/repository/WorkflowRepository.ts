import { DatabaseManager } from "../core/DatabaseManager";
import type {
  WorkflowRow,
  WorkflowNodeRow,
  WorkflowExecutionRow,
  WorkflowNodeExecutionRow,
  WorkflowStatus,
  ExecutionStatus,
  NodeExecutionStatus,
} from "@shared/types/workflow";

export class WorkflowRepository {
  private db = DatabaseManager.getInstance().getDatabase();

  // ==================== 工作流 CRUD ====================

  /**
   * 创建工作流
   */
  createWorkflow(params: { name: string; description?: string }): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO biz_workflow (name, description, status)
        VALUES (?, ?, 'DRAFT')
      `
      )
      .run(params.name, params.description || null);
    return result.lastInsertRowid as number;
  }

  /**
   * 更新工作流
   */
  updateWorkflow(
    workflowId: number,
    params: {
      name?: string;
      description?: string;
      status?: WorkflowStatus;
    }
  ): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (params.name !== undefined) {
      sets.push("name = ?");
      values.push(params.name);
    }
    if (params.description !== undefined) {
      sets.push("description = ?");
      values.push(params.description);
    }
    if (params.status !== undefined) {
      sets.push("status = ?");
      values.push(params.status);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = CURRENT_TIMESTAMP");
    values.push(workflowId);

    this.db.prepare(`UPDATE biz_workflow SET ${sets.join(", ")} WHERE id = ? AND is_del = 0`).run(...values);
  }

  /**
   * 更新工作流状态
   */
  updateWorkflowStatus(workflowId: number, status: WorkflowStatus): void {
    this.db
      .prepare(
        `
        UPDATE biz_workflow SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_del = 0
      `
      )
      .run(status, workflowId);
  }

  /**
   * 软删除工作流
   */
  deleteWorkflow(workflowId: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE biz_workflow SET is_del = 1, deleted_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(now, workflowId);

    // 同时软删除关联节点
    this.db
      .prepare(
        `
        UPDATE biz_workflow_node SET is_del = 1, deleted_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE workflow_id = ?
      `
      )
      .run(now, workflowId);
  }

  /**
   * 获取所有工作流
   */
  getAllWorkflows(): WorkflowRow[] {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_workflow WHERE is_del = 0
        ORDER BY updated_at DESC
      `
      )
      .all() as WorkflowRow[];
  }

  /**
   * 根据 ID 获取工作流
   */
  getWorkflowById(workflowId: number): WorkflowRow | undefined {
    return this.db.prepare(`SELECT * FROM biz_workflow WHERE id = ? AND is_del = 0`).get(workflowId) as
      | WorkflowRow
      | undefined;
  }

  /**
   * 克隆工作流（含节点）
   */
  cloneWorkflow(workflowId: number, newName: string): number {
    const original = this.getWorkflowById(workflowId);
    if (!original) throw new Error("WORKFLOW_NOT_FOUND");

    // 创建新工作流
    const newId = this.createWorkflow({
      name: newName,
      description: original.description || undefined,
    });

    // 复制节点
    const nodes = this.getNodesByWorkflowId(workflowId);
    for (const node of nodes) {
      this.addNode({
        workflowId: newId,
        nodeOrder: node.node_order,
        nodeType: node.node_type,
        nodeName: node.node_name,
        configJson: node.config_json || undefined,
        isEnabled: node.is_enabled === 1,
      });
    }

    return newId;
  }

  // ==================== 节点 CRUD ====================

  /**
   * 添加节点
   */
  addNode(params: {
    workflowId: number;
    nodeOrder: number;
    nodeType: string;
    nodeName: string;
    configJson?: string;
    isEnabled?: boolean;
  }): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO biz_workflow_node
          (workflow_id, node_order, node_type, node_name, config_json, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        params.workflowId,
        params.nodeOrder,
        params.nodeType,
        params.nodeName,
        params.configJson || null,
        params.isEnabled !== false ? 1 : 0
      );
    return result.lastInsertRowid as number;
  }

  /**
   * 更新节点
   */
  updateNode(
    nodeId: number,
    params: {
      nodeName?: string;
      configJson?: string;
      isEnabled?: boolean;
    }
  ): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (params.nodeName !== undefined) {
      sets.push("node_name = ?");
      values.push(params.nodeName);
    }
    if (params.configJson !== undefined) {
      sets.push("config_json = ?");
      values.push(params.configJson);
    }
    if (params.isEnabled !== undefined) {
      sets.push("is_enabled = ?");
      values.push(params.isEnabled ? 1 : 0);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = CURRENT_TIMESTAMP");
    values.push(nodeId);

    this.db.prepare(`UPDATE biz_workflow_node SET ${sets.join(", ")} WHERE id = ? AND is_del = 0`).run(...values);
  }

  /**
   * 软删除节点
   */
  deleteNode(nodeId: number): void {
    this.db
      .prepare(
        `
        UPDATE biz_workflow_node
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(nodeId);
  }

  /**
   * 获取节点
   */
  getNodeById(nodeId: number): WorkflowNodeRow | undefined {
    return this.db.prepare(`SELECT * FROM biz_workflow_node WHERE id = ? AND is_del = 0`).get(nodeId) as
      | WorkflowNodeRow
      | undefined;
  }

  /**
   * 获取工作流下的所有节点（按 node_order 排序）
   */
  getNodesByWorkflowId(workflowId: number): WorkflowNodeRow[] {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_workflow_node
        WHERE workflow_id = ? AND is_del = 0
        ORDER BY node_order ASC
      `
      )
      .all(workflowId) as WorkflowNodeRow[];
  }

  /**
   * 获取工作流的最大 node_order
   */
  getMaxNodeOrder(workflowId: number): number {
    const row = this.db
      .prepare(
        `
        SELECT MAX(node_order) as max_order FROM biz_workflow_node
        WHERE workflow_id = ? AND is_del = 0
      `
      )
      .get(workflowId) as { max_order: number | null } | undefined;
    return row?.max_order ?? 0;
  }

  /**
   * 批量更新节点顺序
   */
  reorderNodes(nodeOrders: { nodeId: number; nodeOrder: number }[]): void {
    const stmt = this.db.prepare(`
      UPDATE biz_workflow_node SET node_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_del = 0
    `);
    const transaction = this.db.transaction(() => {
      for (const item of nodeOrders) {
        stmt.run(item.nodeOrder, item.nodeId);
      }
    });
    transaction();
  }

  /**
   * 将指定位置之后的节点 order 后移一位
   */
  shiftNodesAfter(workflowId: number, afterOrder: number): void {
    this.db
      .prepare(
        `
        UPDATE biz_workflow_node
        SET node_order = node_order + 1, updated_at = CURRENT_TIMESTAMP
        WHERE workflow_id = ? AND node_order >= ? AND is_del = 0
      `
      )
      .run(workflowId, afterOrder);
  }

  // ==================== 执行记录 ====================

  /**
   * 创建执行记录
   */
  createExecution(params: {
    workflowId: number;
    datasetId: number;
    initialVersionId: number;
    totalNodes: number;
  }): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO biz_workflow_execution (workflow_id, dataset_id, initial_version_id, status, total_nodes, completed_nodes)
        VALUES (?, ?, ?, 'PENDING', ?, 0)
      `
      )
      .run(params.workflowId, params.datasetId, params.initialVersionId, params.totalNodes);
    return result.lastInsertRowid as number;
  }

  /**
   * 更新执行记录
   */
  updateExecution(
    executionId: number,
    params: {
      status?: ExecutionStatus;
      startedAt?: string;
      finishedAt?: string;
      completedNodes?: number;
      errorMessage?: string;
    }
  ): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (params.status !== undefined) {
      sets.push("status = ?");
      values.push(params.status);
    }
    if (params.startedAt !== undefined) {
      sets.push("started_at = ?");
      values.push(params.startedAt);
    }
    if (params.finishedAt !== undefined) {
      sets.push("finished_at = ?");
      values.push(params.finishedAt);
    }
    if (params.completedNodes !== undefined) {
      sets.push("completed_nodes = ?");
      values.push(params.completedNodes);
    }
    if (params.errorMessage !== undefined) {
      sets.push("error_message = ?");
      values.push(params.errorMessage);
    }

    if (sets.length === 0) return;
    values.push(executionId);

    this.db.prepare(`UPDATE biz_workflow_execution SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  /**
   * 获取执行记录
   */
  getExecutionById(executionId: number): WorkflowExecutionRow | undefined {
    return this.db.prepare(`SELECT * FROM biz_workflow_execution WHERE id = ?`).get(executionId) as
      | WorkflowExecutionRow
      | undefined;
  }

  /**
   * 获取工作流的执行历史
   */
  getExecutionsByWorkflow(workflowId: number): WorkflowExecutionRow[] {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_workflow_execution
        WHERE workflow_id = ?
        ORDER BY created_at DESC
      `
      )
      .all(workflowId) as WorkflowExecutionRow[];
  }

  /**
   * 获取工作流的最新执行记录
   */
  getLatestExecution(workflowId: number): WorkflowExecutionRow | undefined {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_workflow_execution
        WHERE workflow_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(workflowId) as WorkflowExecutionRow | undefined;
  }

  // ==================== 节点执行详情 ====================

  /**
   * 创建节点执行记录
   */
  createNodeExecution(params: { executionId: number; nodeId: number }): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO biz_workflow_node_execution (execution_id, node_id, status)
        VALUES (?, ?, 'PENDING')
      `
      )
      .run(params.executionId, params.nodeId);
    return result.lastInsertRowid as number;
  }

  /**
   * 更新节点执行记录
   */
  updateNodeExecution(
    nodeExecId: number,
    params: {
      status?: NodeExecutionStatus;
      inputVersionId?: number;
      outputVersionId?: number | null;
      startedAt?: string;
      finishedAt?: string;
      resultJson?: string | null;
      errorMessage?: string;
    }
  ): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (params.status !== undefined) {
      sets.push("status = ?");
      values.push(params.status);
    }
    if (params.inputVersionId !== undefined) {
      sets.push("input_version_id = ?");
      values.push(params.inputVersionId);
    }
    if (params.outputVersionId !== undefined) {
      sets.push("output_version_id = ?");
      values.push(params.outputVersionId);
    }
    if (params.startedAt !== undefined) {
      sets.push("started_at = ?");
      values.push(params.startedAt);
    }
    if (params.finishedAt !== undefined) {
      sets.push("finished_at = ?");
      values.push(params.finishedAt);
    }
    if (params.resultJson !== undefined) {
      sets.push("result_json = ?");
      values.push(params.resultJson);
    }
    if (params.errorMessage !== undefined) {
      sets.push("error_message = ?");
      values.push(params.errorMessage);
    }

    if (sets.length === 0) return;
    values.push(nodeExecId);

    this.db.prepare(`UPDATE biz_workflow_node_execution SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  /**
   * 获取某次执行的所有节点执行详情（含节点信息）
   */
  getNodeExecutionsByExecutionId(executionId: number): (WorkflowNodeExecutionRow & {
    node_name: string;
    node_type: string;
    node_order: number;
  })[] {
    return this.db
      .prepare(
        `
        SELECT ne.*, n.node_name, n.node_type, n.node_order
        FROM biz_workflow_node_execution ne
        JOIN biz_workflow_node n ON ne.node_id = n.id
        WHERE ne.execution_id = ?
        ORDER BY n.node_order ASC
      `
      )
      .all(executionId) as any[];
  }
}
