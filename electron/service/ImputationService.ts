import { ImputationRepository } from '../repository/ImputationRepository';
import { DatabaseManager } from '../core/DatabaseManager';
import type {
  ImputationMethod,
  ImputationResult,
  ImputationDetail,
  ImputationColumnStat,
  ImputationMethodId,
  ImputationCategory,
  ImputationProgressEvent,
  ExecuteImputationRequest,
  ExecuteImputationResponse,
  ImputationMethodRow,
  ImputationResultRow,
} from '@shared/types/imputation';
import type { DatasetVersion } from '@shared/types/database';
import * as fs from 'fs';
import * as Papa from 'papaparse';

// 进度回调类型
type ProgressCallback = (event: ImputationProgressEvent) => void;

export class ImputationService {
  private repository: ImputationRepository;
  private db = DatabaseManager.getInstance().getDatabase();
  private progressCallbacks: Map<number, ProgressCallback> = new Map();

  constructor() {
    this.repository = new ImputationRepository();
  }

  // ==================== 方法管理 ====================

  /**
   * 获取所有插补方法
   */
  getAllMethods(): ImputationMethod[] {
    const rows = this.repository.getAllMethods();
    return rows.map(this.mapMethodRow);
  }

  /**
   * 根据分类获取插补方法
   */
  getMethodsByCategory(category: ImputationCategory): ImputationMethod[] {
    const rows = this.repository.getMethodsByCategory(category);
    return rows.map(this.mapMethodRow);
  }

  /**
   * 获取可用的插补方法
   */
  getAvailableMethods(): ImputationMethod[] {
    const rows = this.repository.getAvailableMethods();
    return rows.map(this.mapMethodRow);
  }

  // ==================== 执行插补 ====================

  /**
   * 执行插补
   */
  async executeImputation(
    request: ExecuteImputationRequest,
    progressCallback?: ProgressCallback
  ): Promise<ExecuteImputationResponse> {
    const startTime = Date.now();

    // 创建结果记录
    const resultId = this.repository.createResult({
      datasetId: request.datasetId,
      versionId: request.versionId,
      methodId: request.methodId,
      targetColumns: request.targetColumns,
      methodParams: request.params,
    });

    if (progressCallback) {
      this.progressCallbacks.set(resultId, progressCallback);
    }

    try {
      // 更新状态为运行中
      this.repository.updateResultStatus(resultId, 'RUNNING');
      this.emitProgress(resultId, {
        resultId,
        stage: 'preparing',
        progress: 0,
        message: '正在准备数据...',
      });

      // 获取版本信息
      const version = this.db
        .prepare('SELECT * FROM biz_dataset_version WHERE id = ?')
        .get(request.versionId) as DatasetVersion | undefined;
      if (!version) {
        throw new Error(`版本不存在: ${request.versionId}`);
      }

      // 读取数据
      this.emitProgress(resultId, {
        resultId,
        stage: 'preparing',
        progress: 10,
        message: '正在读取数据文件...',
      });

      const data = await this.readDataFile(version.file_path);
      if (!data || data.length === 0) {
        throw new Error('数据为空');
      }

      // 验证目标列
      const columns = Object.keys(data[0]);
      const invalidColumns = request.targetColumns.filter(col => !columns.includes(col));
      if (invalidColumns.length > 0) {
        throw new Error(`无效的列: ${invalidColumns.join(', ')}`);
      }

      // 执行插补
      this.emitProgress(resultId, {
        resultId,
        stage: 'imputing',
        progress: 20,
        message: '正在执行插补...',
      });

      const { imputedData, details, columnStats } = await this.performImputation(
        resultId,
        data,
        request.targetColumns,
        request.methodId,
        request.params || {},
        (progress, message, currentColumn) => {
          this.emitProgress(resultId, {
            resultId,
            stage: 'imputing',
            progress: 20 + progress * 0.6, // 20% - 80%
            message,
            currentColumn,
          });
        }
      );

      // 保存详情和统计
      this.emitProgress(resultId, {
        resultId,
        stage: 'saving',
        progress: 80,
        message: '正在保存插补结果...',
      });

      if (details.length > 0) {
        this.repository.insertDetails(details);
      }

      let totalMissing = 0;
      let totalImputed = 0;
      for (const stat of columnStats) {
        this.repository.insertColumnStat(stat);
        totalMissing += stat.missingCount;
        totalImputed += stat.imputedCount;
      }

      // 更新结果统计
      const executionTimeMs = Date.now() - startTime;
      this.repository.updateResultStats(resultId, {
        totalMissing,
        imputedCount: totalImputed,
        imputationRate: totalMissing > 0 ? totalImputed / totalMissing : 0,
        executionTimeMs,
      });

      // 更新状态为完成
      this.repository.updateResultStatus(resultId, 'COMPLETED');
      this.emitProgress(resultId, {
        resultId,
        stage: 'saving',
        progress: 100,
        message: '插补完成',
      });

      return {
        success: true,
        resultId,
        message: `成功插补 ${totalImputed} 个缺失值`,
      };
    } catch (error: any) {
      this.repository.updateResultStatus(resultId, 'FAILED', error.message);
      return {
        success: false,
        resultId,
        error: error.message,
      };
    } finally {
      this.progressCallbacks.delete(resultId);
    }
  }

  /**
   * 执行实际的插补操作
   */
  private async performImputation(
    resultId: number,
    data: Record<string, any>[],
    targetColumns: string[],
    methodId: ImputationMethodId,
    params: Record<string, any>,
    onProgress: (progress: number, message: string, currentColumn?: string) => void
  ): Promise<{
    imputedData: Record<string, any>[];
    details: Array<{
      resultId: number;
      columnName: string;
      rowIndex: number;
      originalValue: number | null;
      imputedValue: number;
      confidence?: number;
      imputationMethod: string;
    }>;
    columnStats: Array<{
      resultId: number;
      columnName: string;
      missingCount: number;
      imputedCount: number;
      imputationRate: number;
      meanBefore?: number;
      meanAfter?: number;
      stdBefore?: number;
      stdAfter?: number;
      minImputed?: number;
      maxImputed?: number;
    }>;
  }> {
    const details: Array<{
      resultId: number;
      columnName: string;
      rowIndex: number;
      originalValue: number | null;
      imputedValue: number;
      confidence?: number;
      imputationMethod: string;
    }> = [];
    const columnStats: Array<{
      resultId: number;
      columnName: string;
      missingCount: number;
      imputedCount: number;
      imputationRate: number;
      meanBefore?: number;
      meanAfter?: number;
      stdBefore?: number;
      stdAfter?: number;
      minImputed?: number;
      maxImputed?: number;
    }> = [];

    const totalColumns = targetColumns.length;

    for (let colIndex = 0; colIndex < targetColumns.length; colIndex++) {
      const columnName = targetColumns[colIndex];
      const progress = (colIndex / totalColumns) * 100;
      onProgress(progress, `正在处理列: ${columnName}`, columnName);

      // 提取列数据
      const columnData = data.map(row => row[columnName]);
      const numericData = columnData.map(v => 
        v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
      );

      // 找出缺失值索引
      const missingIndices: number[] = [];
      const validValues: number[] = [];
      numericData.forEach((v, i) => {
        if (v === null) {
          missingIndices.push(i);
        } else {
          validValues.push(v);
        }
      });

      if (missingIndices.length === 0) {
        // 没有缺失值
        columnStats.push({
          resultId,
          columnName,
          missingCount: 0,
          imputedCount: 0,
          imputationRate: 0,
        });
        continue;
      }

      // 计算插补前统计
      const meanBefore = this.calculateMean(validValues);
      const stdBefore = this.calculateStd(validValues, meanBefore);

      // 执行插补
      const imputedValues = this.imputeColumn(numericData, methodId, params);
      const imputedOnlyValues: number[] = [];

      // 记录详情
      for (const idx of missingIndices) {
        const imputedValue = imputedValues[idx];
        if (imputedValue !== null) {
          imputedOnlyValues.push(imputedValue);
          details.push({
            resultId,
            columnName,
            rowIndex: idx,
            originalValue: null,
            imputedValue,
            confidence: this.calculateConfidence(methodId, imputedValue, validValues),
            imputationMethod: methodId,
          });
          // 更新数据
          data[idx][columnName] = imputedValue;
        }
      }

      // 计算插补后统计
      const allValuesAfter = [...validValues, ...imputedOnlyValues];
      const meanAfter = this.calculateMean(allValuesAfter);
      const stdAfter = this.calculateStd(allValuesAfter, meanAfter);

      columnStats.push({
        resultId,
        columnName,
        missingCount: missingIndices.length,
        imputedCount: imputedOnlyValues.length,
        imputationRate: imputedOnlyValues.length / missingIndices.length,
        meanBefore,
        meanAfter,
        stdBefore,
        stdAfter,
        minImputed: imputedOnlyValues.length > 0 ? Math.min(...imputedOnlyValues) : undefined,
        maxImputed: imputedOnlyValues.length > 0 ? Math.max(...imputedOnlyValues) : undefined,
      });
    }

    onProgress(100, '插补完成');

    return { imputedData: data, details, columnStats };
  }

  /**
   * 对单列执行插补
   */
  private imputeColumn(
    data: (number | null)[],
    methodId: ImputationMethodId,
    params: Record<string, any>
  ): (number | null)[] {
    const result = [...data];
    const validValues = data.filter(v => v !== null) as number[];

    if (validValues.length === 0) {
      return result; // 无法插补
    }

    switch (methodId) {
      case 'MEAN':
        return this.imputeMean(result, validValues);
      case 'MEDIAN':
        return this.imputeMedian(result, validValues);
      case 'MODE':
        return this.imputeMode(result, validValues);
      case 'FORWARD_FILL':
        return this.imputeForwardFill(result);
      case 'BACKWARD_FILL':
        return this.imputeBackwardFill(result);
      case 'LINEAR':
        return this.imputeLinear(result);
      case 'SPLINE':
        return this.imputeSpline(result, params.degree || 3);
      case 'POLYNOMIAL':
        return this.imputePolynomial(result, params.degree || 2);
      default:
        // 对于需要Python的方法，暂时使用线性插值作为后备
        console.warn(`方法 ${methodId} 需要Python支持，使用线性插值作为后备`);
        return this.imputeLinear(result);
    }
  }

  // ==================== 基础插补方法 ====================

  /**
   * 均值填充
   */
  private imputeMean(data: (number | null)[], validValues: number[]): (number | null)[] {
    const mean = this.calculateMean(validValues);
    return data.map(v => v === null ? mean : v);
  }

  /**
   * 中位数填充
   */
  private imputeMedian(data: (number | null)[], validValues: number[]): (number | null)[] {
    const sorted = [...validValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
    return data.map(v => v === null ? median : v);
  }

  /**
   * 众数填充
   */
  private imputeMode(data: (number | null)[], validValues: number[]): (number | null)[] {
    const frequency = new Map<number, number>();
    for (const v of validValues) {
      frequency.set(v, (frequency.get(v) || 0) + 1);
    }
    let mode = validValues[0];
    let maxFreq = 0;
    for (const [value, freq] of frequency) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mode = value;
      }
    }
    return data.map(v => v === null ? mode : v);
  }

  /**
   * 向前填充
   */
  private imputeForwardFill(data: (number | null)[]): (number | null)[] {
    const result = [...data];
    let lastValid: number | null = null;
    for (let i = 0; i < result.length; i++) {
      if (result[i] !== null) {
        lastValid = result[i];
      } else if (lastValid !== null) {
        result[i] = lastValid;
      }
    }
    return result;
  }

  /**
   * 向后填充
   */
  private imputeBackwardFill(data: (number | null)[]): (number | null)[] {
    const result = [...data];
    let nextValid: number | null = null;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i] !== null) {
        nextValid = result[i];
      } else if (nextValid !== null) {
        result[i] = nextValid;
      }
    }
    return result;
  }

  /**
   * 线性插值
   */
  private imputeLinear(data: (number | null)[]): (number | null)[] {
    const result = [...data];
    
    // 找到所有有效值的索引和值
    const validPoints: { index: number; value: number }[] = [];
    data.forEach((v, i) => {
      if (v !== null) {
        validPoints.push({ index: i, value: v });
      }
    });

    if (validPoints.length < 2) {
      // 不足以进行线性插值，使用均值
      if (validPoints.length === 1) {
        return data.map(v => v === null ? validPoints[0].value : v);
      }
      return result;
    }

    // 对每个缺失值进行线性插值
    for (let i = 0; i < result.length; i++) {
      if (result[i] === null) {
        // 找到前后最近的有效值
        let prevPoint: { index: number; value: number } | null = null;
        let nextPoint: { index: number; value: number } | null = null;

        for (const point of validPoints) {
          if (point.index < i) {
            prevPoint = point;
          } else if (point.index > i && !nextPoint) {
            nextPoint = point;
            break;
          }
        }

        if (prevPoint && nextPoint) {
          // 线性插值
          const ratio = (i - prevPoint.index) / (nextPoint.index - prevPoint.index);
          result[i] = prevPoint.value + ratio * (nextPoint.value - prevPoint.value);
        } else if (prevPoint) {
          // 只有前值，使用前值
          result[i] = prevPoint.value;
        } else if (nextPoint) {
          // 只有后值，使用后值
          result[i] = nextPoint.value;
        }
      }
    }

    return result;
  }

  /**
   * 样条插值（简化版：使用线性插值）
   */
  private imputeSpline(data: (number | null)[], degree: number): (number | null)[] {
    // 简化实现：使用线性插值
    // 完整的样条插值需要更复杂的算法
    return this.imputeLinear(data);
  }

  /**
   * 多项式插值（简化版：使用线性插值）
   */
  private imputePolynomial(data: (number | null)[], degree: number): (number | null)[] {
    // 简化实现：使用线性插值
    // 完整的多项式插值需要更复杂的算法
    return this.imputeLinear(data);
  }

  // ==================== 工具方法 ====================

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateStd(values: number[], mean?: number): number {
    if (values.length === 0) return 0;
    const m = mean ?? this.calculateMean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateConfidence(methodId: ImputationMethodId, imputedValue: number, validValues: number[]): number {
    // 简单的置信度计算：基于插补值与有效值的相似性
    if (validValues.length === 0) return 0.5;
    
    const mean = this.calculateMean(validValues);
    const std = this.calculateStd(validValues, mean);
    
    if (std === 0) return 1.0;
    
    // 使用正态分布概率作为置信度
    const zScore = Math.abs(imputedValue - mean) / std;
    const confidence = Math.exp(-0.5 * zScore * zScore);
    
    // 根据方法调整置信度
    const methodMultiplier: Record<string, number> = {
      'MEAN': 0.6,
      'MEDIAN': 0.65,
      'MODE': 0.55,
      'FORWARD_FILL': 0.7,
      'BACKWARD_FILL': 0.7,
      'LINEAR': 0.8,
      'SPLINE': 0.85,
      'POLYNOMIAL': 0.8,
    };
    
    return Math.min(1.0, confidence * (methodMultiplier[methodId] || 0.75));
  }

  private async readDataFile(filePath: string): Promise<Record<string, any>[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const ext = filePath.toLowerCase().split('.').pop();
    
    if (ext === 'csv') {
      return this.readCsvFile(filePath);
    } else {
      // 尝试作为 CSV 读取
      return this.readCsvFile(filePath);
    }
  }

  private readCsvFile(filePath: string): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const result = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });
      
      if (result.errors.length > 0) {
        console.warn('CSV 解析警告:', result.errors);
      }
      
      resolve(result.data as Record<string, any>[]);
    });
  }

  private emitProgress(resultId: number, event: ImputationProgressEvent): void {
    const callback = this.progressCallbacks.get(resultId);
    if (callback) {
      callback(event);
    }
  }

  // ==================== 结果管理 ====================

  /**
   * 获取插补结果
   */
  getResult(resultId: number): ImputationResult | null {
    const row = this.repository.getResultById(resultId);
    return row ? this.mapResultRow(row) : null;
  }

  /**
   * 获取数据集的插补历史
   */
  getResultsByDataset(datasetId: number, limit = 50, offset = 0): ImputationResult[] {
    const rows = this.repository.getResultsByDataset(datasetId, limit, offset);
    return rows.map(this.mapResultRow);
  }

  /**
   * 获取插补详情
   */
  getDetails(resultId: number, columnName?: string, limit = 1000, offset = 0): ImputationDetail[] {
    const rows = this.repository.getDetailsByResult(resultId, columnName, limit, offset);
    return rows.map(row => ({
      id: row.id,
      resultId: row.result_id,
      columnName: row.column_name,
      rowIndex: row.row_index,
      timePoint: row.time_point || undefined,
      originalValue: row.original_value,
      imputedValue: row.imputed_value,
      confidence: row.confidence || undefined,
      imputationMethod: row.imputation_method || undefined,
      neighborValues: row.neighbor_values ? JSON.parse(row.neighbor_values) : undefined,
      isApplied: row.is_applied === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * 获取列统计
   */
  getColumnStats(resultId: number): ImputationColumnStat[] {
    const rows = this.repository.getColumnStats(resultId);
    return rows.map(row => ({
      id: row.id,
      resultId: row.result_id,
      columnName: row.column_name,
      missingCount: row.missing_count,
      imputedCount: row.imputed_count,
      imputationRate: row.imputation_rate,
      meanBefore: row.mean_before || undefined,
      meanAfter: row.mean_after || undefined,
      stdBefore: row.std_before || undefined,
      stdAfter: row.std_after || undefined,
      minImputed: row.min_imputed || undefined,
      maxImputed: row.max_imputed || undefined,
      avgConfidence: row.avg_confidence || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * 删除插补结果
   */
  deleteResult(resultId: number): void {
    this.repository.deleteResult(resultId);
  }

  // ==================== 映射方法 ====================

  private mapMethodRow(row: ImputationMethodRow): ImputationMethod {
    return {
      id: row.id,
      methodId: row.method_id as ImputationMethodId,
      methodName: row.method_name,
      category: row.category as ImputationCategory,
      description: row.description || '',
      defaultParams: row.default_params ? JSON.parse(row.default_params) : undefined,
      requiresPython: row.requires_python === 1,
      isAvailable: row.is_available === 1,
      estimatedTime: row.estimated_time as any,
      accuracy: row.accuracy as any,
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapResultRow(row: ImputationResultRow): ImputationResult {
    return {
      id: row.id,
      datasetId: row.dataset_id,
      versionId: row.version_id,
      newVersionId: row.new_version_id || undefined,
      methodId: row.method_id as ImputationMethodId,
      targetColumns: JSON.parse(row.target_columns),
      methodParams: row.method_params ? JSON.parse(row.method_params) : undefined,
      totalMissing: row.total_missing,
      imputedCount: row.imputed_count,
      imputationRate: row.imputation_rate,
      executionTimeMs: row.execution_time_ms || undefined,
      status: row.status as any,
      errorMessage: row.error_message || undefined,
      executedAt: row.executed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
