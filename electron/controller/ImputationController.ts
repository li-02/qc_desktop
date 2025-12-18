import { BaseController } from './BaseController';
import { ImputationService } from '../service/ImputationService';
import type {
  ImputationMethod,
  ImputationResult,
  ImputationDetail,
  ImputationColumnStat,
  ImputationCategory,
  ExecuteImputationRequest,
  ExecuteImputationResponse,
  GetImputationResultsRequest,
  GetImputationDetailsRequest,
  ImputationProgressEvent,
} from '@shared/types/imputation';

export class ImputationController extends BaseController {
  private service: ImputationService;

  constructor() {
    super();
    this.service = new ImputationService();
  }

  getRoutes(): Record<string, (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any>> {
    return {
      // 方法管理
      'imputation:getMethods': this.getMethods.bind(this),
      'imputation:getMethodsByCategory': this.getMethodsByCategory.bind(this),
      'imputation:getAvailableMethods': this.getAvailableMethods.bind(this),
      
      // 执行插补
      'imputation:execute': this.executeImputation.bind(this),
      
      // 结果管理
      'imputation:getResult': this.getResult.bind(this),
      'imputation:getResultsByDataset': this.getResultsByDataset.bind(this),
      'imputation:getDetails': this.getDetails.bind(this),
      'imputation:getColumnStats': this.getColumnStats.bind(this),
      'imputation:deleteResult': this.deleteResult.bind(this),
    };
  }

  // ==================== 方法管理 ====================

  /**
   * 获取所有插补方法
   */
  private async getMethods(): Promise<{ success: boolean; data?: ImputationMethod[]; error?: string }> {
    try {
      const methods = this.service.getAllMethods();
      return { success: true, data: methods };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 根据分类获取插补方法
   */
  private async getMethodsByCategory(
    _event: Electron.IpcMainInvokeEvent,
    category: ImputationCategory
  ): Promise<{ success: boolean; data?: ImputationMethod[]; error?: string }> {
    try {
      const methods = this.service.getMethodsByCategory(category);
      return { success: true, data: methods };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取可用的插补方法
   */
  private async getAvailableMethods(): Promise<{ success: boolean; data?: ImputationMethod[]; error?: string }> {
    try {
      const methods = this.service.getAvailableMethods();
      return { success: true, data: methods };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==================== 执行插补 ====================

  /**
   * 执行插补
   */
  private async executeImputation(
    event: Electron.IpcMainInvokeEvent,
    request: ExecuteImputationRequest
  ): Promise<ExecuteImputationResponse> {
    try {
      // 进度回调 - 通过 IPC 发送进度事件到渲染进程
      const progressCallback = (progressEvent: ImputationProgressEvent) => {
        event.sender.send('imputation:progress', progressEvent);
      };

      const result = await this.service.executeImputation(request, progressCallback);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==================== 结果管理 ====================

  /**
   * 获取插补结果
   */
  private async getResult(
    _event: Electron.IpcMainInvokeEvent,
    resultId: number
  ): Promise<{ success: boolean; data?: ImputationResult | null; error?: string }> {
    try {
      const result = this.service.getResult(resultId);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取数据集的插补结果列表
   */
  private async getResultsByDataset(
    _event: Electron.IpcMainInvokeEvent,
    request: GetImputationResultsRequest
  ): Promise<{ success: boolean; data?: ImputationResult[]; error?: string }> {
    try {
      const results = this.service.getResultsByDataset(
        request.datasetId,
        request.limit,
        request.offset
      );
      return { success: true, data: results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取插补详情
   */
  private async getDetails(
    _event: Electron.IpcMainInvokeEvent,
    request: GetImputationDetailsRequest
  ): Promise<{ success: boolean; data?: ImputationDetail[]; error?: string }> {
    try {
      const details = this.service.getDetails(
        request.resultId,
        request.columnName,
        request.limit,
        request.offset
      );
      return { success: true, data: details };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取列统计
   */
  private async getColumnStats(
    _event: Electron.IpcMainInvokeEvent,
    resultId: number
  ): Promise<{ success: boolean; data?: ImputationColumnStat[]; error?: string }> {
    try {
      const stats = this.service.getColumnStats(resultId);
      return { success: true, data: stats };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除插补结果
   */
  private async deleteResult(
    _event: Electron.IpcMainInvokeEvent,
    resultId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.service.deleteResult(resultId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
