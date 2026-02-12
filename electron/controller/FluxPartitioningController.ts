import { BaseController } from './BaseController';
import { FluxPartitioningService } from '../service/FluxPartitioningService';
import type {
  ExecuteFluxPartitioningRequest,
  ExecuteFluxPartitioningResponse,
  FluxPartitioningResult,
  FluxPartitioningProgressEvent,
} from '@shared/types/fluxPartitioning';

export class FluxPartitioningController extends BaseController {
  private service: FluxPartitioningService;

  constructor() {
    super();
    this.service = new FluxPartitioningService();
  }

  getRoutes(): Record<string, (args: any, event: Electron.IpcMainInvokeEvent) => Promise<any>> {
    return {
      'fluxPartitioning:execute': this.execute.bind(this),
      'fluxPartitioning:getResultsByDataset': this.getResultsByDataset.bind(this),
      'fluxPartitioning:getResult': this.getResult.bind(this),
      'fluxPartitioning:deleteResult': this.deleteResult.bind(this),
    };
  }

  /**
   * 执行通量分割
   */
  private async execute(
    request: ExecuteFluxPartitioningRequest,
    event: Electron.IpcMainInvokeEvent
  ): Promise<ExecuteFluxPartitioningResponse> {
    try {
      const progressCallback = (progressEvent: FluxPartitioningProgressEvent) => {
        try {
          const serializableEvent = JSON.parse(JSON.stringify(progressEvent));
          event.sender.send('fluxPartitioning:progress', serializableEvent);
        } catch (err) {
          console.error('发送通量分割进度事件失败:', err);
        }
      };

      const result = await this.service.executePartitioning(request, progressCallback);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取数据集的分割结果列表
   */
  private async getResultsByDataset(
    args: { datasetId: number; limit?: number; offset?: number },
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: FluxPartitioningResult[]; error?: string }> {
    try {
      const results = this.service.getResultsByDataset(
        args.datasetId,
        args.limit,
        args.offset
      );
      return { success: true, data: results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取分割结果详情
   */
  private async getResult(
    resultId: number,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: FluxPartitioningResult | null; error?: string }> {
    try {
      const result = this.service.getResult(resultId);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除分割结果
   */
  private async deleteResult(
    resultId: number,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.service.deleteResult(resultId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
