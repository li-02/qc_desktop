import { BaseController } from './BaseController';
import { CorrelationAnalysisService } from '../service/CorrelationAnalysisService';
import { IpcMainInvokeEvent } from 'electron';

export class CorrelationAnalysisController extends BaseController {
  private service: CorrelationAnalysisService;

  constructor() {
    super();
    this.service = new CorrelationAnalysisService();
  }

  /**
   * 获取历史记录
   */
  async getHistory(args: { datasetId: number }, event: IpcMainInvokeEvent) {
    return this.handleAsync(() => this.service.getHistory(args.datasetId));
  }

  /**
   * 运行分析
   */
  async analyze(args: any, event: IpcMainInvokeEvent) {
    return this.handleAsync(() => this.service.calculateCorrelationMatrix(args));
  }

  /**
   * 删除单条记录
   */
  async deleteResult(args: { id: number }, event: IpcMainInvokeEvent) {
    return this.handleAsync(() => this.service.deleteResult(args.id));
  }

  /**
   * 批量删除记录
   */
  async batchDeleteResults(args: { ids: number[] }, event: IpcMainInvokeEvent) {
    return this.handleAsync(() => this.service.batchDeleteResults(args.ids));
  }

  /**
   * 重命名分析结果
   */
  async renameResult(args: { id: number; name: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(() => this.service.renameResult(args.id, args.name));
  }

  /**
   * 批量更新排序顺序
   */
  async reorderResults(args: { orders: { id: number; sortOrder: number }[] }, event: IpcMainInvokeEvent) {
    return this.handleAsync(() => this.service.reorderResults(args.orders));
  }
}
