import { DatabaseManager } from '../core/DatabaseManager';
import type {
  ImputationMethodRow,
  ImputationMethodParamRow,
  ImputationResultRow,
  ImputationColumnStatRow,
  ImputationCategory,
  ImputationResultStatus,
} from '@shared/types/imputation';

export class ImputationRepository {
  private db = DatabaseManager.getInstance().getDatabase();

  // ==================== 插补方法 ====================

  /**
   * 获取所有插补方法
   */
  getAllMethods(): ImputationMethodRow[] {
    return this.db
      .prepare(`
        SELECT * FROM conf_imputation_method 
        WHERE is_del = 0 
        ORDER BY priority DESC
      `)
      .all() as ImputationMethodRow[];
  }

  /**
   * 根据分类获取插补方法
   */
  getMethodsByCategory(category: ImputationCategory): ImputationMethodRow[] {
    // 确保 category 是有效的字符串类型
    if (category === undefined || category === null) {
      return [];
    }
    const validCategory = String(category);
    return this.db
      .prepare(`
        SELECT * FROM conf_imputation_method 
        WHERE category = ? AND is_del = 0 
        ORDER BY priority DESC
      `)
      .all(validCategory) as ImputationMethodRow[];
  }

  /**
   * 获取可用的插补方法
   */
  getAvailableMethods(): ImputationMethodRow[] {
    return this.db
      .prepare(`
        SELECT * FROM conf_imputation_method 
        WHERE is_available = 1 AND is_del = 0 
        ORDER BY priority DESC
      `)
      .all() as ImputationMethodRow[];
  }

  /**
   * 根据方法ID获取插补方法
   */
  getMethodById(methodId: string): ImputationMethodRow | undefined {
    // 确保 methodId 是有效的字符串类型
    if (methodId === undefined || methodId === null) {
      return undefined;
    }
    const validMethodId = String(methodId);
    return this.db
      .prepare(`
        SELECT * FROM conf_imputation_method
        WHERE method_id = ? AND is_del = 0
      `)
      .get(validMethodId) as ImputationMethodRow | undefined;
  }

  /**
   * 获取方法的参数定义
   */
  getMethodParams(methodId: string): ImputationMethodParamRow[] {
    // 确保 methodId 是有效的字符串类型
    if (methodId === undefined || methodId === null) {
      return [];
    }
    const validMethodId = String(methodId);
    return this.db
      .prepare(`
        SELECT * FROM conf_imputation_method_params
        WHERE method_id = ? AND is_del = 0
        ORDER BY param_order ASC
      `)
      .all(validMethodId) as ImputationMethodParamRow[];
  }

  /**
   * 获取方法及其参数定义
   */
  getMethodWithParams(methodId: string): {
    method: ImputationMethodRow;
    params: ImputationMethodParamRow[];
  } | null {
    const method = this.getMethodById(methodId);
    if (!method) return null;

    const params = this.getMethodParams(methodId);
    return { method, params };
  }

  // ==================== 插补结果 ====================

  /**
   * 创建插补结果记录
   */
  createResult(params: {
    datasetId: number;
    versionId: number;
    methodId: string;
    targetColumns: string[];
    methodParams?: Record<string, any>;
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO biz_imputation_result 
          (dataset_id, version_id, method_id, target_columns, method_params, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
      `)
      .run(
        params.datasetId,
        params.versionId,
        params.methodId,
        JSON.stringify(params.targetColumns),
        params.methodParams ? JSON.stringify(params.methodParams) : null
      );
    return result.lastInsertRowid as number;
  }

  /**
   * 更新插补结果状态
   */
  updateResultStatus(resultId: number, status: ImputationResultStatus, errorMessage?: string): void {
    this.db
      .prepare(`
        UPDATE biz_imputation_result 
        SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(status, errorMessage || null, resultId);
  }

  /**
   * 更新插补结果统计
   */
  updateResultStats(resultId: number, stats: {
    totalMissing: number;
    imputedCount: number;
    imputationRate: number;
    executionTimeMs?: number;
    newVersionId?: number;
  }): void {
    this.db
      .prepare(`
        UPDATE biz_imputation_result 
        SET total_missing = ?, imputed_count = ?, imputation_rate = ?, 
            execution_time_ms = ?, new_version_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        stats.totalMissing,
        stats.imputedCount,
        stats.imputationRate,
        stats.executionTimeMs || null,
        stats.newVersionId || null,
        resultId
      );
  }

  /**
   * 更新插补结果的新版本ID
   */
  updateResultNewVersion(resultId: number, newVersionId: number): void {
    this.db
      .prepare(`
        UPDATE biz_imputation_result 
        SET new_version_id = ?, status = 'APPLIED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(newVersionId, resultId);
  }


  /**
   * 获取插补结果
   */
  getResultById(resultId: number): ImputationResultRow | undefined {
    return this.db
      .prepare(`
        SELECT * FROM biz_imputation_result 
        WHERE id = ? AND is_del = 0
      `)
      .get(resultId) as ImputationResultRow | undefined;
  }

  /**
   * 获取数据集的插补结果列表
   */
  getResultsByDataset(datasetId: number, limit = 50, offset = 0): ImputationResultRow[] {
    return this.db
      .prepare(`
        SELECT * FROM biz_imputation_result 
        WHERE dataset_id = ? AND is_del = 0 
        ORDER BY executed_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(datasetId, limit, offset) as ImputationResultRow[];
  }

  /**
   * 删除插补结果（软删除）
   */
  deleteResult(resultId: number): void {
    this.db
      .prepare(`
        UPDATE biz_imputation_result 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(resultId);
  }

  /**
   * 重命名插补结果
   */
  renameResult(id: number, name: string): boolean {
    const result = this.db
      .prepare(`
        UPDATE biz_imputation_result 
        SET name = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND is_del = 0
      `)
      .run(name, id);
    return result.changes > 0;
  }

  /**
   * 批量更新排序顺序
   */
  updateSortOrders(orders: { id: number; sortOrder: number }[]): void {
    const stmt = this.db.prepare(`
      UPDATE biz_imputation_result 
      SET sort_order = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND is_del = 0
    `);
    const transaction = this.db.transaction(() => {
      for (const order of orders) {
        stmt.run(order.sortOrder, order.id);
      }
    });
    transaction();
  }

  // ==================== 插补列统计 ====================

  /**
   * 插入列统计
   */
  insertColumnStat(stat: {
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
    avgConfidence?: number;
    imputedRowIndices?: number[];
    imputedValues?: number[];
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO biz_imputation_column_stat 
          (result_id, column_name, missing_count, imputed_count, imputation_rate,
           mean_before, mean_after, std_before, std_after, min_imputed, max_imputed,
           avg_confidence, imputed_row_indices, imputed_values)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        stat.resultId,
        stat.columnName,
        stat.missingCount,
        stat.imputedCount,
        stat.imputationRate,
        stat.meanBefore ?? null,
        stat.meanAfter ?? null,
        stat.stdBefore ?? null,
        stat.stdAfter ?? null,
        stat.minImputed ?? null,
        stat.maxImputed ?? null,
        stat.avgConfidence ?? null,
        stat.imputedRowIndices ? JSON.stringify(stat.imputedRowIndices) : null,
        stat.imputedValues ? JSON.stringify(stat.imputedValues) : null
      );
    return result.lastInsertRowid as number;
  }

  /**
   * 获取列统计
   */
  getColumnStats(resultId: number): ImputationColumnStatRow[] {
    return this.db
      .prepare(`
        SELECT * FROM biz_imputation_column_stat 
        WHERE result_id = ? AND is_del = 0
        ORDER BY column_name
      `)
      .all(resultId) as ImputationColumnStatRow[];
  }

  // ==================== 插补模型管理 ====================

  /**
   * 创建插补模型记录
   */
  createModel(params: {
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
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO biz_imputation_model 
          (dataset_id, method_id, model_name, model_path, model_params, 
           target_column, feature_columns, time_column,
           training_columns, training_samples, validation_score, trained_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `)
      .run(
        params.datasetId || null,
        params.methodId,
        params.modelName || null,
        params.modelPath,
        params.modelParams ? JSON.stringify(params.modelParams) : null,
        params.targetColumn || null,
        params.featureColumns ? JSON.stringify(params.featureColumns) : null,
        params.timeColumn || 'record_time',
        params.trainingColumns ? JSON.stringify(params.trainingColumns) : null,
        params.trainingSamples || null,
        params.validationScore || null
      );
    return result.lastInsertRowid as number;
  }

  /**
   * 获取数据集的所有模型
   */
  getModelsByDataset(datasetId: number, methodId?: string): any[] {
    if (methodId) {
      return this.db
        .prepare(`
          SELECT * FROM biz_imputation_model 
          WHERE dataset_id = ? AND method_id = ? AND is_del = 0
          ORDER BY trained_at DESC
        `)
        .all(datasetId, methodId);
    }
    return this.db
      .prepare(`
        SELECT * FROM biz_imputation_model 
        WHERE dataset_id = ? AND is_del = 0
        ORDER BY trained_at DESC
      `)
      .all(datasetId);
  }

  /**
   * 获取模型详情
   */
  getModelById(modelId: number): any | undefined {
    return this.db
      .prepare(`
        SELECT * FROM biz_imputation_model 
        WHERE id = ? AND is_del = 0
      `)
      .get(modelId);
  }

  /**
   * 设置活跃模型（同时取消同方法的其他活跃模型）
   */
  setActiveModel(modelId: number): void {
    const model = this.getModelById(modelId);
    if (!model) return;

    // 取消同数据集同方法的其他活跃模型
    this.db
      .prepare(`
        UPDATE biz_imputation_model 
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE dataset_id = ? AND method_id = ? AND is_del = 0
      `)
      .run(model.dataset_id, model.method_id);

    // 设置当前模型为活跃
    this.db
      .prepare(`
        UPDATE biz_imputation_model 
        SET is_active = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(modelId);
  }

  /**
   * 更新模型信息
   */
  updateModel(modelId: number, params: {
    modelName?: string;
    modelPath?: string;
    modelParams?: Record<string, any>;
    targetColumn?: string;
    featureColumns?: string[];
    timeColumn?: string;
    validationScore?: number;
  }): void {
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [];

    if (params.modelName !== undefined) {
      updates.push('model_name = ?');
      values.push(params.modelName);
    }
    if (params.modelPath !== undefined) {
      updates.push('model_path = ?');
      values.push(params.modelPath);
    }
    if (params.modelParams !== undefined) {
      updates.push('model_params = ?');
      values.push(JSON.stringify(params.modelParams));
    }
    if (params.targetColumn !== undefined) {
      updates.push('target_column = ?');
      values.push(params.targetColumn);
    }
    if (params.featureColumns !== undefined) {
      updates.push('feature_columns = ?');
      values.push(JSON.stringify(params.featureColumns));
    }
    if (params.timeColumn !== undefined) {
      updates.push('time_column = ?');
      values.push(params.timeColumn);
    }
    if (params.validationScore !== undefined) {
      updates.push('validation_score = ?');
      values.push(params.validationScore);
    }

    values.push(modelId);

    this.db
      .prepare(`
        UPDATE biz_imputation_model 
        SET ${updates.join(', ')}
        WHERE id = ?
      `)
      .run(...values);
  }

  /**
   * 删除模型（软删除）
   */
  deleteModel(modelId: number): void {
    this.db
      .prepare(`
        UPDATE biz_imputation_model 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(modelId);
  }
}
