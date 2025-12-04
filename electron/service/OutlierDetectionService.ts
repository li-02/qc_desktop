import { OutlierDetectionRepository } from '../repository/OutlierDetectionRepository';
import { DatasetDBRepository } from '../repository/DatasetDBRepository';
import type {
  OutlierDetectionConfig,
  OutlierResult,
  OutlierDetail,
  OutlierDetectionScopeType,
  DetectionMethodId,
  ColumnSetting,
  ResolvedThresholdConfig,
  DetectionMethod,
  DetectionMethodParam
} from '../../shared/types/database';
import type { ServiceResponse } from '../../shared/types/projectInterface';

/**
 * 异常检测服务
 * 处理阈值配置、检测执行、结果管理
 */
export class OutlierDetectionService {
  private outlierRepo: OutlierDetectionRepository;
  private datasetRepo: DatasetDBRepository;

  constructor(
    outlierRepo: OutlierDetectionRepository,
    datasetRepo: DatasetDBRepository
  ) {
    this.outlierRepo = outlierRepo;
    this.datasetRepo = datasetRepo;
  }

  // ==================== 检测方法注册表 ====================

  /**
   * 获取所有可用的检测方法
   */
  getAvailableDetectionMethods(): ServiceResponse<DetectionMethod[]> {
    const methods: DetectionMethod[] = [
      {
        id: 'THRESHOLD_STATIC',
        name: '静态阈值过滤',
        category: 'threshold',
        description: '根据设定的上下限过滤超出范围的值',
        requiresPython: false,
        isAvailable: true,
        params: [
          { key: 'min_value', label: '最小值', type: 'number', default: 0, tooltip: '低于此值将被标记为异常' },
          { key: 'max_value', label: '最大值', type: 'number', default: 100, tooltip: '高于此值将被标记为异常' },
          { key: 'include_boundary', label: '包含边界值', type: 'boolean', default: true }
        ]
      },
      {
        id: 'ZSCORE',
        name: 'Z-Score 标准差法',
        category: 'statistical',
        description: '基于标准差检测偏离均值过远的异常值',
        requiresPython: false,
        isAvailable: true,
        params: [
          { key: 'threshold', label: '阈值倍数', type: 'number', default: 3, min: 1, max: 5, step: 0.5, tooltip: '超过均值±N倍标准差的值将被标记' }
        ]
      },
      {
        id: 'MODIFIED_ZSCORE',
        name: 'Modified Z-Score (MAD)',
        category: 'statistical',
        description: '基于中位数绝对偏差的稳健异常检测',
        requiresPython: false,
        isAvailable: true,
        params: [
          { key: 'threshold', label: 'MAD阈值', type: 'number', default: 3.5, min: 2, max: 5, step: 0.5 }
        ]
      },
      {
        id: 'IQR',
        name: 'IQR 四分位距法',
        category: 'statistical',
        description: '基于四分位距检测异常值',
        requiresPython: false,
        isAvailable: true,
        params: [
          { key: 'multiplier', label: 'IQR倍数', type: 'number', default: 1.5, min: 1, max: 3, step: 0.5 }
        ]
      },
      {
        id: 'DESPIKING_MAD',
        name: 'MAD Despiking',
        category: 'statistical',
        description: '滑动窗口MAD去尖峰，适用于通量数据',
        requiresPython: true,
        isAvailable: true,
        params: [
          { key: 'window_size', label: '窗口大小', type: 'number', default: 13, min: 5, max: 51, step: 2 },
          { key: 'threshold', label: 'MAD倍数', type: 'number', default: 5.2, min: 3, max: 10, step: 0.1 },
          { key: 'max_iterations', label: '最大迭代次数', type: 'number', default: 10, min: 1, max: 20 }
        ]
      },
      {
        id: 'ISOLATION_FOREST',
        name: 'Isolation Forest',
        category: 'ml',
        description: '基于隔离森林的机器学习异常检测',
        requiresPython: true,
        isAvailable: false, // Phase 2
        params: [
          { key: 'contamination', label: '异常比例', type: 'number', default: 0.1, min: 0.01, max: 0.5, step: 0.01 },
          { key: 'n_estimators', label: '树数量', type: 'number', default: 100, min: 50, max: 500 }
        ]
      }
    ];

    return { success: true, data: methods };
  }

  // ==================== 阈值配置管理 ====================

  /**
   * 获取数据集的列阈值配置
   */
  getColumnThresholds(datasetId: number): ServiceResponse<ColumnSetting[]> {
    try {
      const columns = this.outlierRepo.getColumnThresholds(datasetId);
      return { success: true, data: columns };
    } catch (error: any) {
      return { success: false, error: `获取列阈值配置失败: ${error.message}` };
    }
  }

  /**
   * 更新单列的阈值配置
   */
  updateColumnThreshold(
    columnId: number,
    thresholds: {
      min_threshold?: number;
      max_threshold?: number;
      physical_min?: number;
      physical_max?: number;
      warning_min?: number;
      warning_max?: number;
      unit?: string;
      variable_type?: string;
    }
  ): ServiceResponse<void> {
    try {
      // 验证阈值逻辑
      const validationError = this.validateThresholds(thresholds);
      if (validationError) {
        return { success: false, error: validationError };
      }

      const updated = this.outlierRepo.updateColumnThresholds(columnId, thresholds);
      if (!updated) {
        return { success: false, error: '更新失败，列配置不存在' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: `更新列阈值失败: ${error.message}` };
    }
  }

  /**
   * 批量更新列阈值
   */
  batchUpdateColumnThresholds(
    updates: Array<{
      id: number;
      min_threshold?: number;
      max_threshold?: number;
      physical_min?: number;
      physical_max?: number;
    }>
  ): ServiceResponse<{ updatedCount: number }> {
    try {
      // 验证每个更新
      for (const update of updates) {
        const validationError = this.validateThresholds(update);
        if (validationError) {
          return { success: false, error: `列ID ${update.id}: ${validationError}` };
        }
      }

      const count = this.outlierRepo.batchUpdateColumnThresholds(updates);
      return { success: true, data: { updatedCount: count } };
    } catch (error: any) {
      return { success: false, error: `批量更新阈值失败: ${error.message}` };
    }
  }

  /**
   * 从模板应用阈值配置
   */
  applyThresholdTemplate(
    datasetId: number,
    template: Record<string, { min: number; max: number; unit?: string }>
  ): ServiceResponse<{ appliedCount: number }> {
    try {
      const columns = this.outlierRepo.getColumnThresholds(datasetId);
      const updates: Array<{ id: number; min_threshold: number; max_threshold: number }> = [];

      for (const col of columns) {
        const templateConfig = template[col.column_name] || template[col.variable_type || ''];
        if (templateConfig) {
          updates.push({
            id: col.id,
            min_threshold: templateConfig.min,
            max_threshold: templateConfig.max
          });
        }
      }

      if (updates.length === 0) {
        return { success: true, data: { appliedCount: 0 } };
      }

      const count = this.outlierRepo.batchUpdateColumnThresholds(updates);
      return { success: true, data: { appliedCount: count } };
    } catch (error: any) {
      return { success: false, error: `应用模板失败: ${error.message}` };
    }
  }

  // ==================== 三级作用域配置管理 ====================

  /**
   * 获取检测配置 (支持三级作用域)
   */
  getDetectionConfigs(
    scopeType: OutlierDetectionScopeType,
    scopeId?: number
  ): ServiceResponse<OutlierDetectionConfig[]> {
    try {
      const configs = this.outlierRepo.getDetectionConfigs(scopeType, scopeId);
      return { success: true, data: configs };
    } catch (error: any) {
      return { success: false, error: `获取检测配置失败: ${error.message}` };
    }
  }

  /**
   * 创建检测配置
   */
  createDetectionConfig(config: {
    scope_type: OutlierDetectionScopeType;
    scope_id?: number;
    column_name?: string;
    detection_method: DetectionMethodId;
    method_params?: Record<string, any>;
    priority?: number;
  }): ServiceResponse<{ id: number }> {
    try {
      const id = this.outlierRepo.createDetectionConfig({
        scope_type: config.scope_type,
        scope_id: config.scope_id,
        column_name: config.column_name,
        detection_method: config.detection_method,
        method_params: config.method_params ? JSON.stringify(config.method_params) : undefined,
        priority: config.priority ?? 0,
        is_active: 1
      });

      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: `创建检测配置失败: ${error.message}` };
    }
  }

  /**
   * 更新检测配置
   */
  updateDetectionConfig(
    id: number,
    updates: {
      detection_method?: DetectionMethodId;
      method_params?: Record<string, any>;
      priority?: number;
      is_active?: number;
    }
  ): ServiceResponse<void> {
    try {
      const updateData: Partial<OutlierDetectionConfig> = {};
      
      if (updates.detection_method) updateData.detection_method = updates.detection_method;
      if (updates.method_params) updateData.method_params = JSON.stringify(updates.method_params);
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

      const success = this.outlierRepo.updateDetectionConfig(id, updateData);
      if (!success) {
        return { success: false, error: '配置不存在或更新失败' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: `更新检测配置失败: ${error.message}` };
    }
  }

  /**
   * 删除检测配置
   */
  deleteDetectionConfig(id: number): ServiceResponse<void> {
    try {
      const success = this.outlierRepo.deleteDetectionConfig(id);
      if (!success) {
        return { success: false, error: '配置不存在' };
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: `删除检测配置失败: ${error.message}` };
    }
  }

  /**
   * 解析列的有效阈值配置 (考虑三级作用域继承)
   */
  resolveColumnThreshold(
    columnName: string,
    datasetId: number,
    siteId: number
  ): ServiceResponse<ResolvedThresholdConfig> {
    try {
      // 1. 先查 DATASET 级配置
      const datasetColumns = this.outlierRepo.getColumnThresholds(datasetId, columnName);
      if (datasetColumns.length > 0) {
        const col = datasetColumns[0];
        if (col.min_threshold !== null || col.max_threshold !== null) {
          return {
            success: true,
            data: {
              columnName,
              minThreshold: col.min_threshold ?? undefined,
              maxThreshold: col.max_threshold ?? undefined,
              physicalMin: col.physical_min ?? undefined,
              physicalMax: col.physical_max ?? undefined,
              warningMin: col.warning_min ?? undefined,
              warningMax: col.warning_max ?? undefined,
              unit: col.unit ?? undefined,
              variableType: col.variable_type ?? undefined,
              source: 'DATASET'
            }
          };
        }
      }

      // 2. 查 SITE 级配置
      const siteConfigs = this.outlierRepo.getDetectionConfigs('SITE', siteId, columnName);
      const siteThresholdConfig = siteConfigs.find(c => c.detection_method === 'THRESHOLD_STATIC');
      if (siteThresholdConfig && siteThresholdConfig.method_params) {
        const params = JSON.parse(siteThresholdConfig.method_params);
        return {
          success: true,
          data: {
            columnName,
            minThreshold: params.min_value,
            maxThreshold: params.max_value,
            source: 'SITE'
          }
        };
      }

      // 3. 查 APP 级配置
      const appConfigs = this.outlierRepo.getDetectionConfigs('APP', undefined, columnName);
      const appThresholdConfig = appConfigs.find(c => c.detection_method === 'THRESHOLD_STATIC');
      if (appThresholdConfig && appThresholdConfig.method_params) {
        const params = JSON.parse(appThresholdConfig.method_params);
        return {
          success: true,
          data: {
            columnName,
            minThreshold: params.min_value,
            maxThreshold: params.max_value,
            source: 'APP'
          }
        };
      }

      // 没有配置
      return {
        success: true,
        data: {
          columnName,
          source: 'APP' // 默认
        }
      };
    } catch (error: any) {
      return { success: false, error: `解析阈值配置失败: ${error.message}` };
    }
  }

  // ==================== 预设阈值模板 ====================

  /**
   * 获取通量数据常用阈值模板
   */
  getFluxThresholdTemplates(): ServiceResponse<Record<string, Record<string, { min: number; max: number; unit: string }>>> {
    const templates = {
      standard: {
        Ta: { min: -40, max: 50, unit: '°C' },
        Ta_2m: { min: -40, max: 50, unit: '°C' },
        RH: { min: 0, max: 100, unit: '%' },
        VPD: { min: 0, max: 8, unit: 'kPa' },
        SW_IN: { min: 0, max: 1400, unit: 'W/m²' },
        SW_OUT: { min: 0, max: 1000, unit: 'W/m²' },
        LW_IN: { min: 100, max: 600, unit: 'W/m²' },
        LW_OUT: { min: 200, max: 700, unit: 'W/m²' },
        PPFD: { min: 0, max: 2500, unit: 'μmol/m²/s' },
        CO2: { min: 350, max: 550, unit: 'ppm' },
        H2O: { min: 0, max: 50, unit: 'mmol/mol' },
        NEE: { min: -40, max: 30, unit: 'μmol/m²/s' },
        LE: { min: -50, max: 700, unit: 'W/m²' },
        H: { min: -100, max: 500, unit: 'W/m²' },
        USTAR: { min: 0, max: 3, unit: 'm/s' },
        WS: { min: 0, max: 30, unit: 'm/s' },
        WD: { min: 0, max: 360, unit: '°' },
        P: { min: 0, max: 100, unit: 'mm' },
        PA: { min: 80, max: 110, unit: 'kPa' }
      },
      strict: {
        Ta: { min: -30, max: 45, unit: '°C' },
        RH: { min: 5, max: 100, unit: '%' },
        SW_IN: { min: 0, max: 1300, unit: 'W/m²' },
        CO2: { min: 380, max: 500, unit: 'ppm' },
        NEE: { min: -30, max: 20, unit: 'μmol/m²/s' }
      }
    };

    return { success: true, data: templates };
  }

  // ==================== 检测执行 ====================

  /**
   * 执行阈值检测 (基于列配置的阈值)
   */
  executeThresholdDetection(
    datasetId: number,
    versionId: number,
    columnNames?: string[]
  ): ServiceResponse<{
    resultId: number;
    summary: {
      totalRows: number;
      columnsChecked: number;
      outlierCount: number;
      outlierRate: number;
      columnResults: Array<{
        columnName: string;
        outlierCount: number;
        minThreshold: number | null;
        maxThreshold: number | null;
      }>;
    };
  }> {
    try {
      // 1. 获取列阈值配置
      const columns = this.outlierRepo.getColumnThresholds(datasetId);
      const targetColumns = columnNames 
        ? columns.filter(c => columnNames.includes(c.column_name))
        : columns.filter(c => c.min_threshold !== null || c.max_threshold !== null);

      if (targetColumns.length === 0) {
        return { success: false, error: '没有配置阈值的列，请先配置阈值' };
      }

      // 2. 创建检测结果记录
      const resultId = this.outlierRepo.createDetectionResult({
        dataset_id: datasetId,
        version_id: versionId,
        detection_method: 'THRESHOLD_STATIC',
        method_params: JSON.stringify({ columns: targetColumns.map(c => c.column_name) }),
        status: 'RUNNING'
      });

      // 3. 读取数据并执行检测
      const datasetResult = this.datasetRepo.getDatasetById(datasetId);
      if (!datasetResult.success || !datasetResult.data) {
        this.outlierRepo.updateDetectionResult(resultId, { status: 'FAILED' });
        return { success: false, error: '数据集不存在' };
      }

      // 获取 CSV 文件路径
      const filePath = datasetResult.data.source_file_path;
      if (!filePath) {
        this.outlierRepo.updateDetectionResult(resultId, { status: 'FAILED' });
        return { success: false, error: '数据文件路径不存在' };
      }

      // 4. 读取 CSV 数据并检测
      const fs = require('fs');
      const path = require('path');
      
      if (!fs.existsSync(filePath)) {
        this.outlierRepo.updateDetectionResult(resultId, { status: 'FAILED' });
        return { success: false, error: `数据文件不存在: ${filePath}` };
      }

      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const lines = csvContent.split('\n').filter((line: string) => line.trim());
      
      if (lines.length < 2) {
        this.outlierRepo.updateDetectionResult(resultId, { status: 'FAILED' });
        return { success: false, error: '数据文件为空或格式错误' };
      }

      const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
      const totalRows = lines.length - 1;
      
      // 5. 对每列执行阈值检测
      const columnResults: Array<{
        columnName: string;
        outlierCount: number;
        minThreshold: number | null;
        maxThreshold: number | null;
      }> = [];
      
      let totalOutliers = 0;
      const outlierDetails: Array<{
        result_id: number;
        column_name: string;
        row_index: number;
        original_value: number;
        outlier_type: string;
        threshold_value: number;
      }> = [];

      for (const col of targetColumns) {
        const colIndex = headers.indexOf(col.column_name);
        if (colIndex === -1) continue;

        let outlierCount = 0;
        const minThreshold = col.min_threshold ?? null;
        const maxThreshold = col.max_threshold ?? null;

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (colIndex >= values.length) continue;

          const rawValue = values[colIndex].trim().replace(/"/g, '');
          const value = parseFloat(rawValue);
          
          if (isNaN(value)) continue;

          // 检测是否超出阈值
          let isOutlier = false;
          let outlierType = '';
          let thresholdValue = 0;

          if (minThreshold !== null && value < minThreshold) {
            isOutlier = true;
            outlierType = 'BELOW_MIN';
            thresholdValue = minThreshold;
          } else if (maxThreshold !== null && value > maxThreshold) {
            isOutlier = true;
            outlierType = 'ABOVE_MAX';
            thresholdValue = maxThreshold;
          }

          if (isOutlier) {
            outlierCount++;
            totalOutliers++;
            
            // 只记录前1000个异常值详情（避免数据量过大）
            if (outlierDetails.length < 1000) {
              outlierDetails.push({
                result_id: resultId,
                column_name: col.column_name,
                row_index: i,
                original_value: value,
                outlier_type: outlierType,
                threshold_value: thresholdValue
              });
            }
          }
        }

        columnResults.push({
          columnName: col.column_name,
          outlierCount,
          minThreshold,
          maxThreshold
        });
      }

      // 6. 批量保存异常值详情
      if (outlierDetails.length > 0) {
        this.outlierRepo.batchCreateOutlierDetails(outlierDetails);
      }

      // 7. 更新检测结果
      const outlierRate = totalRows > 0 ? (totalOutliers / (totalRows * targetColumns.length)) * 100 : 0;
      
      this.outlierRepo.updateDetectionResult(resultId, {
        status: 'COMPLETED',
        total_rows: totalRows,
        outlier_count: totalOutliers,
        outlier_rate: outlierRate
      });

      return {
        success: true,
        data: {
          resultId,
          summary: {
            totalRows,
            columnsChecked: targetColumns.length,
            outlierCount: totalOutliers,
            outlierRate,
            columnResults
          }
        }
      };
    } catch (error: any) {
      return { success: false, error: `检测执行失败: ${error.message}` };
    }
  }

  /**
   * 获取检测结果列表
   */
  getDetectionResults(datasetId: number): ServiceResponse<OutlierResult[]> {
    try {
      const results = this.outlierRepo.getDetectionResults(datasetId);
      return { success: true, data: results };
    } catch (error: any) {
      return { success: false, error: `获取检测结果失败: ${error.message}` };
    }
  }

  /**
   * 获取检测结果详情
   */
  getDetectionResultDetails(
    resultId: number,
    columnName?: string,
    limit: number = 100,
    offset: number = 0
  ): ServiceResponse<{
    details: OutlierDetail[];
    total: number;
  }> {
    try {
      const details = this.outlierRepo.getOutlierDetails(resultId, columnName, limit, offset);
      const total = this.outlierRepo.getOutlierDetailsCount(resultId, columnName);
      return { success: true, data: { details, total } };
    } catch (error: any) {
      return { success: false, error: `获取检测详情失败: ${error.message}` };
    }
  }

  /**
   * 删除检测结果
   */
  deleteDetectionResult(resultId: number): ServiceResponse<void> {
    try {
      // 先删除详情
      this.outlierRepo.deleteOutlierDetails(resultId);
      // 再删除结果
      const success = this.outlierRepo.deleteDetectionResult(resultId);
      if (!success) {
        return { success: false, error: '检测结果不存在' };
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: `删除检测结果失败: ${error.message}` };
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 验证阈值逻辑
   */
  private validateThresholds(thresholds: {
    min_threshold?: number;
    max_threshold?: number;
    physical_min?: number;
    physical_max?: number;
    warning_min?: number;
    warning_max?: number;
  }): string | null {
    // 基础阈值验证
    if (thresholds.min_threshold !== undefined && thresholds.max_threshold !== undefined) {
      if (thresholds.min_threshold > thresholds.max_threshold) {
        return '最小阈值不能大于最大阈值';
      }
    }

    // 物理阈值验证
    if (thresholds.physical_min !== undefined && thresholds.physical_max !== undefined) {
      if (thresholds.physical_min > thresholds.physical_max) {
        return '物理最小值不能大于物理最大值';
      }
    }

    // 警告阈值验证
    if (thresholds.warning_min !== undefined && thresholds.warning_max !== undefined) {
      if (thresholds.warning_min > thresholds.warning_max) {
        return '警告最小值不能大于警告最大值';
      }
    }

    // 层级验证: physical <= warning <= threshold
    if (thresholds.physical_min !== undefined && thresholds.warning_min !== undefined) {
      if (thresholds.physical_min > thresholds.warning_min) {
        return '物理最小值应小于等于警告最小值';
      }
    }

    if (thresholds.warning_min !== undefined && thresholds.min_threshold !== undefined) {
      if (thresholds.warning_min > thresholds.min_threshold) {
        return '警告最小值应小于等于阈值最小值';
      }
    }

    return null;
  }
}
