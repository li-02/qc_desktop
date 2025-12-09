import { BaseController } from './BaseController';
import { CorrelationAnalysisService } from '../service/CorrelationAnalysisService';

export class CorrelationAnalysisController extends BaseController {
  private service: CorrelationAnalysisService;

  constructor() {
    super();
    this.service = new CorrelationAnalysisService();
  }

  /**
   * 获取历史记录
   */
  async getHistory(_: any, datasetId: number) {
    return this.handleAsync(() => this.service.getHistory(datasetId));
  }

  /**
   * 运行分析
   */
  async analyze(_: any, params: any) {
    return this.handleAsync(() => this.service.calculateCorrelationMatrix(params));
  }

  /**
   * 删除单条记录
   */
  async deleteResult(_: any, id: number) {
    return this.handleAsync(() => this.service.deleteResult(id));
  }

  /**
   * 批量删除记录
   */
  async batchDeleteResults(_: any, ids: number[]) {
    return this.handleAsync(() => this.service.batchDeleteResults(ids));
  }
}
