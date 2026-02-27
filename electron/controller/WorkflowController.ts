import { BrowserWindow } from "electron";
import { BaseController } from "./BaseController";
import { WorkflowService } from "../service/WorkflowService";
import type {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecuteWorkflowRequest,
  AddNodeRequest,
  UpdateNodeRequest,
  ReorderNodesRequest,
} from "@shared/types/workflow";

export class WorkflowController extends BaseController {
  constructor(
    private workflowService: WorkflowService,
    private mainWindow: BrowserWindow | null
  ) {
    super();
  }

  getRoutes(): Record<string, (args: any, event: Electron.IpcMainInvokeEvent) => Promise<any>> {
    return {
      // 工作流管理
      "workflow:create": this.create.bind(this),
      "workflow:update": this.update.bind(this),
      "workflow:delete": this.remove.bind(this),
      "workflow:getAll": this.getAll.bind(this),
      "workflow:getById": this.getById.bind(this),
      "workflow:clone": this.clone.bind(this),
      // 节点管理
      "workflow:addNode": this.addNode.bind(this),
      "workflow:updateNode": this.updateNode.bind(this),
      "workflow:deleteNode": this.deleteNode.bind(this),
      "workflow:reorderNodes": this.reorderNodes.bind(this),
      "workflow:getNodes": this.getNodes.bind(this),
      // 执行管理
      "workflow:execute": this.execute.bind(this),
      "workflow:cancel": this.cancel.bind(this),
      "workflow:getExecutions": this.getExecutions.bind(this),
      "workflow:getExecutionDetail": this.getExecutionDetail.bind(this),
    };
  }

  // ==================== 工作流管理 ====================

  private async create(args: CreateWorkflowRequest) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.createWorkflow(args)));
  }

  private async update(args: UpdateWorkflowRequest) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.updateWorkflow(args)));
  }

  private async remove(args: { workflowId: number }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.deleteWorkflow(args.workflowId)));
  }

  private async getAll() {
    return this.handleAsync(() => Promise.resolve(this.workflowService.getAllWorkflows()));
  }

  private async getById(args: { workflowId: number }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.getWorkflowById(args.workflowId)));
  }

  private async clone(args: { workflowId: number; newName: string }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.cloneWorkflow(args.workflowId, args.newName)));
  }

  // ==================== 节点管理 ====================

  private async addNode(args: AddNodeRequest) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.addNode(args)));
  }

  private async updateNode(args: UpdateNodeRequest) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.updateNode(args)));
  }

  private async deleteNode(args: { nodeId: number }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.deleteNode(args.nodeId)));
  }

  private async reorderNodes(args: ReorderNodesRequest) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.reorderNodes(args.workflowId, args.nodeIds)));
  }

  private async getNodes(args: { workflowId: number }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.getNodes(args.workflowId)));
  }

  // ==================== 执行管理 ====================

  private async execute(args: ExecuteWorkflowRequest) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.executeWorkflow(args, this.mainWindow)));
  }

  private async cancel(args: { executionId: number }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.cancelExecution(args.executionId)));
  }

  private async getExecutions(args: { workflowId: number }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.getExecutions(args.workflowId)));
  }

  private async getExecutionDetail(args: { executionId: number }) {
    return this.handleAsync(() => Promise.resolve(this.workflowService.getExecutionDetail(args.executionId)));
  }
}
