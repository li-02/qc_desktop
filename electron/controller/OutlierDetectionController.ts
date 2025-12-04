import { BaseController } from './BaseController';
import { OutlierDetectionService } from '../service/OutlierDetectionService';
import { IpcMainInvokeEvent } from 'electron';
import type { OutlierDetectionScopeType, DetectionMethodId } from '../../shared/types/database';

/**
 * 异常检测控制器
 * 处理阈值配置、检测方法管理的 IPC 请求
 */
export class OutlierDetectionController extends BaseController {
  private outlierService: OutlierDetectionService;

  constructor(outlierService: OutlierDetectionService) {
    super();
    this.outlierService = outlierService;
  }

  // ==================== 检测方法 ====================

  /**
   * 获取可用的检测方法列表
   */
  async getDetectionMethods(_args: {}, _event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = this.outlierService.getAvailableDetectionMethods();
      if (!result.success) {
        throw new Error(result.error);
      }
      return { methods: result.data };
    });
  }

  // ==================== 列阈值配置 ====================

  /**
   * 获取数据集的列阈值配置
   */
  async getColumnThresholds(
    args: { datasetId: string },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.datasetId) {
        throw new Error('数据集ID不能为空');
      }

      const datasetId = parseInt(args.datasetId);
      if (isNaN(datasetId)) {
        throw new Error('无效的数据集ID');
      }

      const result = this.outlierService.getColumnThresholds(datasetId);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { columns: result.data };
    });
  }

  /**
   * 更新单列阈值配置
   */
  async updateColumnThreshold(
    args: {
      columnId: string;
      thresholds: {
        min_threshold?: number;
        max_threshold?: number;
        physical_min?: number;
        physical_max?: number;
        warning_min?: number;
        warning_max?: number;
        unit?: string;
        variable_type?: string;
      };
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.columnId) {
        throw new Error('列ID不能为空');
      }

      const columnId = parseInt(args.columnId);
      if (isNaN(columnId)) {
        throw new Error('无效的列ID');
      }

      if (!args.thresholds || Object.keys(args.thresholds).length === 0) {
        throw new Error('阈值配置不能为空');
      }

      const result = this.outlierService.updateColumnThreshold(columnId, args.thresholds);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    });
  }

  /**
   * 批量更新列阈值
   */
  async batchUpdateColumnThresholds(
    args: {
      updates: Array<{
        id: string;
        min_threshold?: number;
        max_threshold?: number;
        physical_min?: number;
        physical_max?: number;
      }>;
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.updates || !Array.isArray(args.updates) || args.updates.length === 0) {
        throw new Error('更新列表不能为空');
      }

      const updates = args.updates.map(u => ({
        id: parseInt(u.id),
        min_threshold: u.min_threshold,
        max_threshold: u.max_threshold,
        physical_min: u.physical_min,
        physical_max: u.physical_max
      }));

      // 验证所有 ID
      for (const u of updates) {
        if (isNaN(u.id)) {
          throw new Error('存在无效的列ID');
        }
      }

      const result = this.outlierService.batchUpdateColumnThresholds(updates);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { updatedCount: result.data!.updatedCount };
    });
  }

  /**
   * 应用阈值模板
   */
  async applyThresholdTemplate(
    args: {
      datasetId: string;
      templateName: string;
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.datasetId) {
        throw new Error('数据集ID不能为空');
      }
      if (!args.templateName) {
        throw new Error('模板名称不能为空');
      }

      const datasetId = parseInt(args.datasetId);
      if (isNaN(datasetId)) {
        throw new Error('无效的数据集ID');
      }

      // 获取模板
      const templatesResult = this.outlierService.getFluxThresholdTemplates();
      if (!templatesResult.success) {
        throw new Error(templatesResult.error);
      }

      const template = templatesResult.data![args.templateName as keyof typeof templatesResult.data];
      if (!template) {
        throw new Error(`模板 "${args.templateName}" 不存在`);
      }

      const result = this.outlierService.applyThresholdTemplate(datasetId, template);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { appliedCount: result.data!.appliedCount };
    });
  }

  /**
   * 获取阈值模板列表
   */
  async getThresholdTemplates(_args: {}, _event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = this.outlierService.getFluxThresholdTemplates();
      if (!result.success) {
        throw new Error(result.error);
      }
      return { templates: result.data };
    });
  }

  // ==================== 检测配置管理 (三级作用域) ====================

  /**
   * 获取检测配置
   */
  async getDetectionConfigs(
    args: {
      scopeType: OutlierDetectionScopeType;
      scopeId?: string;
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.scopeType || !['APP', 'SITE', 'DATASET'].includes(args.scopeType)) {
        throw new Error('无效的作用域类型');
      }

      let scopeId: number | undefined;
      if (args.scopeId) {
        scopeId = parseInt(args.scopeId);
        if (isNaN(scopeId)) {
          throw new Error('无效的作用域ID');
        }
      }

      const result = this.outlierService.getDetectionConfigs(args.scopeType, scopeId);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { configs: result.data };
    });
  }

  /**
   * 创建检测配置
   */
  async createDetectionConfig(
    args: {
      scopeType: OutlierDetectionScopeType;
      scopeId?: string;
      columnName?: string;
      detectionMethod: DetectionMethodId;
      methodParams?: Record<string, any>;
      priority?: number;
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.scopeType || !['APP', 'SITE', 'DATASET'].includes(args.scopeType)) {
        throw new Error('无效的作用域类型');
      }
      if (!args.detectionMethod) {
        throw new Error('检测方法不能为空');
      }

      let scopeId: number | undefined;
      if (args.scopeId) {
        scopeId = parseInt(args.scopeId);
        if (isNaN(scopeId)) {
          throw new Error('无效的作用域ID');
        }
      }

      const result = this.outlierService.createDetectionConfig({
        scope_type: args.scopeType,
        scope_id: scopeId,
        column_name: args.columnName,
        detection_method: args.detectionMethod,
        method_params: args.methodParams,
        priority: args.priority
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return { id: result.data!.id };
    });
  }

  /**
   * 更新检测配置
   */
  async updateDetectionConfig(
    args: {
      id: string;
      updates: {
        detectionMethod?: DetectionMethodId;
        methodParams?: Record<string, any>;
        priority?: number;
        isActive?: boolean;
      };
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.id) {
        throw new Error('配置ID不能为空');
      }

      const id = parseInt(args.id);
      if (isNaN(id)) {
        throw new Error('无效的配置ID');
      }

      const result = this.outlierService.updateDetectionConfig(id, {
        detection_method: args.updates.detectionMethod,
        method_params: args.updates.methodParams,
        priority: args.updates.priority,
        is_active: args.updates.isActive !== undefined ? (args.updates.isActive ? 1 : 0) : undefined
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    });
  }

  /**
   * 删除检测配置
   */
  async deleteDetectionConfig(
    args: { id: string },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.id) {
        throw new Error('配置ID不能为空');
      }

      const id = parseInt(args.id);
      if (isNaN(id)) {
        throw new Error('无效的配置ID');
      }

      const result = this.outlierService.deleteDetectionConfig(id);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    });
  }

  /**
   * 解析列的有效阈值 (考虑继承)
   */
  async resolveColumnThreshold(
    args: {
      columnName: string;
      datasetId: string;
      siteId: string;
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.columnName) {
        throw new Error('列名不能为空');
      }
      if (!args.datasetId || !args.siteId) {
        throw new Error('数据集ID和站点ID不能为空');
      }

      const datasetId = parseInt(args.datasetId);
      const siteId = parseInt(args.siteId);
      if (isNaN(datasetId) || isNaN(siteId)) {
        throw new Error('无效的ID');
      }

      const result = this.outlierService.resolveColumnThreshold(args.columnName, datasetId, siteId);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { threshold: result.data };
    });
  }

  // ==================== 检测执行 ====================

  /**
   * 执行阈值检测
   */
  async executeThresholdDetection(
    args: {
      datasetId: string;
      versionId: string;
      columnNames?: string[];
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.datasetId || !args.versionId) {
        throw new Error('数据集ID和版本ID不能为空');
      }

      const datasetId = parseInt(args.datasetId);
      const versionId = parseInt(args.versionId);
      if (isNaN(datasetId) || isNaN(versionId)) {
        throw new Error('无效的ID');
      }

      const result = this.outlierService.executeThresholdDetection(
        datasetId,
        versionId,
        args.columnNames
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    });
  }

  /**
   * 获取检测结果列表
   */
  async getDetectionResults(
    args: { datasetId: string },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.datasetId) {
        throw new Error('数据集ID不能为空');
      }

      const datasetId = parseInt(args.datasetId);
      if (isNaN(datasetId)) {
        throw new Error('无效的数据集ID');
      }

      const result = this.outlierService.getDetectionResults(datasetId);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { results: result.data };
    });
  }

  /**
   * 获取检测结果详情
   */
  async getDetectionResultDetails(
    args: {
      resultId: string;
      columnName?: string;
      limit?: number;
      offset?: number;
    },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.resultId) {
        throw new Error('结果ID不能为空');
      }

      const resultId = parseInt(args.resultId);
      if (isNaN(resultId)) {
        throw new Error('无效的结果ID');
      }

      const result = this.outlierService.getDetectionResultDetails(
        resultId,
        args.columnName,
        args.limit ?? 100,
        args.offset ?? 0
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    });
  }

  /**
   * 删除检测结果
   */
  async deleteDetectionResult(
    args: { resultId: string },
    _event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      if (!args.resultId) {
        throw new Error('结果ID不能为空');
      }

      const resultId = parseInt(args.resultId);
      if (isNaN(resultId)) {
        throw new Error('无效的结果ID');
      }

      const result = this.outlierService.deleteDetectionResult(resultId);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    });
  }
}
