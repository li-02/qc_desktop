import { BaseController } from './BaseController';
import { ImputationService } from '../service/ImputationService';
import type {
  ImputationMethod,
  ImputationMethodParam,
  ImputationResult,
  ImputationDetail,
  ImputationColumnStat,
  ImputationModel,
  ImputationCategory,
  ExecuteImputationRequest,
  ExecuteImputationResponse,
  GetImputationResultsRequest,
  GetImputationDetailsRequest,
  ImputationProgressEvent,
} from '@shared/types/imputation';
import { dialog, BrowserWindow } from 'electron';

export class ImputationController extends BaseController {
  private service: ImputationService;

  constructor() {
    super();
    this.service = new ImputationService();
  }

  getRoutes(): Record<string, (args: any, event: Electron.IpcMainInvokeEvent) => Promise<any>> {
    return {
      // 方法管理
      'imputation:getMethods': this.getMethods.bind(this),
      'imputation:getMethodsByCategory': this.getMethodsByCategory.bind(this),
      'imputation:getAvailableMethods': this.getAvailableMethods.bind(this),
      'imputation:getMethodParams': this.getMethodParams.bind(this),
      'imputation:getMethodWithParams': this.getMethodWithParams.bind(this),

      // 执行插补
      'imputation:execute': this.executeImputation.bind(this),

      // 结果管理
      'imputation:getResult': this.getResult.bind(this),
      'imputation:getResultsByDataset': this.getResultsByDataset.bind(this),
      'imputation:getDetails': this.getDetails.bind(this),
      'imputation:getColumnStats': this.getColumnStats.bind(this),
      'imputation:deleteResult': this.deleteResult.bind(this),
      'imputation:applyVersion': this.applyVersion.bind(this),
      'imputation:exportFile': this.exportFile.bind(this),

      // 模型管理
      'imputation:createModel': this.createModel.bind(this),
      'imputation:getModelsByDataset': this.getModelsByDataset.bind(this),
      'imputation:getModel': this.getModel.bind(this),
      'imputation:setActiveModel': this.setActiveModel.bind(this),
      'imputation:updateModel': this.updateModel.bind(this),
      'imputation:deleteModel': this.deleteModel.bind(this),
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
    category: ImputationCategory,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: ImputationMethod[]; error?: string }> {
    try {
      // 验证 category 参数
      if (category === undefined || category === null) {
        return { success: true, data: [] };
      }
      // 确保 category 是字符串类型
      const validCategory = String(category) as ImputationCategory;
      const methods = this.service.getMethodsByCategory(validCategory);
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

  /**
   * 获取方法的参数定义
   */
  private async getMethodParams(
    methodId: string,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: ImputationMethodParam[]; error?: string }> {
    try {
      // 验证 methodId 参数
      if (methodId === undefined || methodId === null) {
        return { success: true, data: [] }; // 返回空数组而不是报错
      }
      // 确保 methodId 是字符串类型
      const validMethodId = String(methodId);
      const params = this.service.getMethodParams(validMethodId);
      return { success: true, data: params };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取方法及其参数定义
   */
  private async getMethodWithParams(
    methodId: string,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: { method: ImputationMethod; params: ImputationMethodParam[] }; error?: string }> {
    try {
      // 验证 methodId 参数
      if (methodId === undefined || methodId === null) {
        return { success: false, error: 'methodId 参数不能为空' };
      }
      // 确保 methodId 是字符串类型
      const validMethodId = String(methodId);
      const result = this.service.getMethodWithParams(validMethodId);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==================== 执行插补 ====================

  /**
   * 执行插补
   */
  private async executeImputation(
    request: ExecuteImputationRequest,
    event: Electron.IpcMainInvokeEvent
  ): Promise<ExecuteImputationResponse> {
    try {
      // 进度回调 - 通过 IPC 发送进度事件到渲染进程
      const progressCallback = (progressEvent: ImputationProgressEvent) => {
        try {
          // 使用 JSON 序列化来确保对象可以被克隆（移除 undefined 值）
          const serializableEvent = JSON.parse(JSON.stringify(progressEvent));
          event.sender.send('imputation:progress', serializableEvent);
        } catch (err) {
          console.error('发送进度事件失败:', err);
        }
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
    resultId: number,
    _event: Electron.IpcMainInvokeEvent
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
    request: GetImputationResultsRequest,
    _event: Electron.IpcMainInvokeEvent
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
    request: GetImputationDetailsRequest,
    _event: Electron.IpcMainInvokeEvent
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
    resultId: number,
    _event: Electron.IpcMainInvokeEvent
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

  /**
   * 应用为新版本
   */
  private async applyVersion(
    args: { resultId: number; remark?: string },
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.applyVersion(args.resultId, args.remark);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 导出为文件
   */
  private async exportFile(
    args: { resultId: number },
    event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: string; cancelled?: boolean; error?: string }> {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: '导出插补结果',
        defaultPath: 'imputed_data.csv',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
      };

      const { canceled, filePath } = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);

      if (canceled || !filePath) {
        return { success: true, cancelled: true };
      }

      await this.service.exportFile(args.resultId, filePath);
      return { success: true, data: filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==================== 模型管理 ====================

  /**
   * 创建插补模型
   */
  private async createModel(
    args: {
      datasetId?: number;
      methodId: string;
      modelName?: string;
      modelPath: string;
      modelParams?: Record<string, any>;
      targetColumn?: string;
      featureColumns?: string[];
      timeColumn?: string;
      trainingColumns?: string[];
      trainingSamples?: number;
      validationScore?: number;
    },
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: number; error?: string }> {
    try {
      const modelId = this.service.createModel(args);
      return { success: true, data: modelId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取数据集的所有模型
   */
  private async getModelsByDataset(
    args: { datasetId: number; methodId?: string },
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: ImputationModel[]; error?: string }> {
    try {
      const models = this.service.getModelsByDataset(args.datasetId, args.methodId);
      return { success: true, data: models };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取模型详情
   */
  private async getModel(
    modelId: number,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; data?: ImputationModel | null; error?: string }> {
    try {
      const model = this.service.getModel(modelId);
      return { success: true, data: model };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 设置活跃模型
   */
  private async setActiveModel(
    modelId: number,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.service.setActiveModel(modelId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新模型信息
   */
  private async updateModel(
    args: {
      modelId: number;
      modelName?: string;
      modelPath?: string;
      modelParams?: Record<string, any>;
      targetColumn?: string;
      featureColumns?: string[];
      timeColumn?: string;
      validationScore?: number;
    },
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.service.updateModel(args.modelId, {
        modelName: args.modelName,
        modelPath: args.modelPath,
        modelParams: args.modelParams,
        targetColumn: args.targetColumn,
        featureColumns: args.featureColumns,
        timeColumn: args.timeColumn,
        validationScore: args.validationScore,
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除模型
   */
  private async deleteModel(
    modelId: number,
    _event: Electron.IpcMainInvokeEvent
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.service.deleteModel(modelId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
