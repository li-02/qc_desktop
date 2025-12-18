import { DatabaseManager } from '../core/DatabaseManager';
import type {
  ImputationMethodRow,
  ImputationResultRow,
  ImputationDetailRow,
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
    return this.db
      .prepare(`
        SELECT * FROM conf_imputation_method 
        WHERE category = ? AND is_del = 0 
        ORDER BY priority DESC
      `)
      .all(category) as ImputationMethodRow[];
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
    return this.db
      .prepare(`
        SELECT * FROM conf_imputation_method 
        WHERE method_id = ? AND is_del = 0
      `)
      .get(methodId) as ImputationMethodRow | undefined;
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

  // ==================== 插补详情 ====================

  /**
   * 批量插入插补详情
   */
  insertDetails(details: Array<{
    resultId: number;
    columnName: string;
    rowIndex: number;
    timePoint?: string;
    originalValue?: number | null;
    imputedValue: number;
    confidence?: number;
    imputationMethod?: string;
    neighborValues?: number[];
  }>): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO biz_imputation_detail 
        (result_id, column_name, row_index, time_point, original_value, imputed_value, 
         confidence, imputation_method, neighbor_values)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: typeof details) => {
      for (const item of items) {
        insertStmt.run(
          item.resultId,
          item.columnName,
          item.rowIndex,
          item.timePoint || null,
          item.originalValue ?? null,
          item.imputedValue,
          item.confidence || null,
          item.imputationMethod || null,
          item.neighborValues ? JSON.stringify(item.neighborValues) : null
        );
      }
    });

    insertMany(details);
  }

  /**
   * 获取插补详情
   */
  getDetailsByResult(resultId: number, columnName?: string, limit = 1000, offset = 0): ImputationDetailRow[] {
    if (columnName) {
      return this.db
        .prepare(`
          SELECT * FROM biz_imputation_detail 
          WHERE result_id = ? AND column_name = ? AND is_del = 0
          ORDER BY row_index
          LIMIT ? OFFSET ?
        `)
        .all(resultId, columnName, limit, offset) as ImputationDetailRow[];
    }
    return this.db
      .prepare(`
        SELECT * FROM biz_imputation_detail 
        WHERE result_id = ? AND is_del = 0
        ORDER BY column_name, row_index
        LIMIT ? OFFSET ?
      `)
      .all(resultId, limit, offset) as ImputationDetailRow[];
  }

  /**
   * 标记详情已应用
   */
  markDetailsApplied(resultId: number): void {
    this.db
      .prepare(`
        UPDATE biz_imputation_detail 
        SET is_applied = 1, updated_at = CURRENT_TIMESTAMP
        WHERE result_id = ?
      `)
      .run(resultId);
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
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO biz_imputation_column_stat 
          (result_id, column_name, missing_count, imputed_count, imputation_rate,
           mean_before, mean_after, std_before, std_after, min_imputed, max_imputed, avg_confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        stat.avgConfidence ?? null
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
}
