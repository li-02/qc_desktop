import { DatabaseManager } from '../core/DatabaseManager';
import type {
  OutlierDetectionConfig,
  OutlierResult,
  OutlierDetail,
  OutlierDetectionScopeType,
  DetectionMethodId,
  OutlierResultStatus,
  ColumnSetting
} from '../../shared/types/database';

/**
 * 异常检测数据仓库
 * 处理异常检测配置、结果和详情的 CRUD 操作
 */
export class OutlierDetectionRepository {
  private db = DatabaseManager.getInstance().getDatabase();

  // ==================== 配置管理 ====================

  /**
   * 获取指定作用域的检测配置
   */
  getDetectionConfigs(
    scopeType: OutlierDetectionScopeType,
    scopeId?: number,
    columnName?: string
  ): OutlierDetectionConfig[] {
    let sql = `
      SELECT * FROM conf_outlier_detection 
      WHERE is_del = 0 AND scope_type = ?
    `;
    const params: (string | number)[] = [scopeType];

    if (scopeType !== 'APP' && scopeId !== undefined) {
      sql += ' AND scope_id = ?';
      params.push(scopeId);
    }

    if (columnName) {
      sql += ' AND (column_name = ? OR column_name IS NULL)';
      params.push(columnName);
    }

    sql += ' ORDER BY priority ASC';

    return this.db.prepare(sql).all(...params) as OutlierDetectionConfig[];
  }

  /**
   * 获取单个检测配置
   */
  getDetectionConfigById(id: number): OutlierDetectionConfig | undefined {
    return this.db
      .prepare('SELECT * FROM conf_outlier_detection WHERE id = ? AND is_del = 0')
      .get(id) as OutlierDetectionConfig | undefined;
  }

  /**
   * 创建检测配置
   */
  createDetectionConfig(config: Omit<OutlierDetectionConfig, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'is_del'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO conf_outlier_detection 
        (scope_type, scope_id, column_name, detection_method, method_params, priority, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      config.scope_type,
      config.scope_id ?? null,
      config.column_name ?? null,
      config.detection_method,
      config.method_params ?? null,
      config.priority ?? 0,
      config.is_active ?? 1
    );

    return result.lastInsertRowid as number;
  }

  /**
   * 更新检测配置
   */
  updateDetectionConfig(id: number, updates: Partial<OutlierDetectionConfig>): boolean {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.detection_method !== undefined) {
      fields.push('detection_method = ?');
      values.push(updates.detection_method);
    }
    if (updates.method_params !== undefined) {
      fields.push('method_params = ?');
      values.push(updates.method_params);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE conf_outlier_detection SET ${fields.join(', ')} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...values);

    return result.changes > 0;
  }

  /**
   * 删除检测配置 (软删除)
   */
  deleteDetectionConfig(id: number): boolean {
    const result = this.db
      .prepare(`
        UPDATE conf_outlier_detection 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `)
      .run(id);

    return result.changes > 0;
  }

  // ==================== 阈值配置 (基于 ColumnSetting) ====================

  /**
   * 获取列的阈值配置
   */
  getColumnThresholds(datasetId: number, columnName?: string): ColumnSetting[] {
    let sql = `
      SELECT * FROM conf_column_setting 
      WHERE dataset_id = ? AND is_del = 0
    `;
    const params: (number | string)[] = [datasetId];

    if (columnName) {
      sql += ' AND column_name = ?';
      params.push(columnName);
    }

    sql += ' ORDER BY column_index ASC';

    return this.db.prepare(sql).all(...params) as ColumnSetting[];
  }

  /**
   * 更新列的阈值配置
   */
  updateColumnThresholds(
    id: number,
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
  ): boolean {
    const fields: string[] = [];
    const values: (number | string | null)[] = [];

    const fieldMap: Record<string, keyof typeof thresholds> = {
      min_threshold: 'min_threshold',
      max_threshold: 'max_threshold',
      physical_min: 'physical_min',
      physical_max: 'physical_max',
      warning_min: 'warning_min',
      warning_max: 'warning_max',
      unit: 'unit',
      variable_type: 'variable_type'
    };

    for (const [dbField, key] of Object.entries(fieldMap)) {
      if (thresholds[key] !== undefined) {
        fields.push(`${dbField} = ?`);
        values.push(thresholds[key] ?? null);
      }
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE conf_column_setting SET ${fields.join(', ')} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...values);

    return result.changes > 0;
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
  ): number {
    const updateStmt = this.db.prepare(`
      UPDATE conf_column_setting 
      SET min_threshold = COALESCE(?, min_threshold),
          max_threshold = COALESCE(?, max_threshold),
          physical_min = COALESCE(?, physical_min),
          physical_max = COALESCE(?, physical_max),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    let count = 0;
    const transaction = this.db.transaction(() => {
      for (const update of updates) {
        const result = updateStmt.run(
          update.min_threshold ?? null,
          update.max_threshold ?? null,
          update.physical_min ?? null,
          update.physical_max ?? null,
          update.id
        );
        if (result.changes > 0) count++;
      }
    });

    transaction();
    return count;
  }

  // ==================== 检测结果管理 ====================

  /**
   * 创建检测结果 (新版，支持 dataset_id)
   */
  createDetectionResult(result: {
    dataset_id: number;
    version_id: number;
    detection_method: string;
    method_params?: string;
    status: string;
    column_name?: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO biz_outlier_result 
        (version_id, detection_method, detection_params, executed_at, status, dataset_id, column_name)
      VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
    `);

    const insertResult = stmt.run(
      result.version_id,
      result.detection_method,
      result.method_params ?? null,
      result.status,
      result.dataset_id,
      result.column_name ?? '_MULTI_COLUMN_'
    );

    return insertResult.lastInsertRowid as number;
  }

  /**
   * 更新检测结果
   */
  updateDetectionResult(id: number, updates: {
    status?: string;
    total_rows?: number;
    outlier_count?: number;
    outlier_rate?: number;
    detection_params?: string;
    generated_version_id?: number;
  }): boolean {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.total_rows !== undefined) {
      fields.push('total_rows = ?');
      values.push(updates.total_rows);
    }
    if (updates.outlier_count !== undefined) {
      fields.push('outlier_count = ?');
      values.push(updates.outlier_count);
    }
    if (updates.outlier_rate !== undefined) {
      fields.push('outlier_rate = ?');
      values.push(updates.outlier_rate);
    }
    if (updates.detection_params !== undefined) {
      fields.push('detection_params = ?');
      values.push(updates.detection_params);
    }
    if (updates.generated_version_id !== undefined) {
      fields.push('generated_version_id = ?');
      values.push(updates.generated_version_id);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE biz_outlier_result SET ${fields.join(', ')} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...values);

    return result.changes > 0;
  }

  /**
   * 创建检测结果 (旧版兼容)
   */
  createOutlierResult(result: Omit<OutlierResult, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'is_del'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO biz_outlier_result 
        (version_id, detection_config_id, column_name, detection_method, 
         outlier_indices, outlier_count, detection_params, executed_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertResult = stmt.run(
      result.version_id,
      result.detection_config_id ?? null,
      result.column_name,
      result.detection_method,
      result.outlier_indices ?? null,
      result.outlier_count ?? 0,
      result.detection_params ?? null,
      result.executed_at ?? new Date().toISOString(),
      result.status ?? 'PENDING'
    );

    return insertResult.lastInsertRowid as number;
  }

  /**
   * 获取数据集的检测结果
   */
  getDetectionResults(datasetId: number): OutlierResult[] {
    return this.db
      .prepare(`
        SELECT * FROM biz_outlier_result 
        WHERE dataset_id = ? AND is_del = 0 
        ORDER BY executed_at DESC
      `)
      .all(datasetId) as OutlierResult[];
  }

  /**
   * 获取版本的检测结果
   */
  getOutlierResults(versionId: number, columnName?: string): OutlierResult[] {
    let sql = `
      SELECT * FROM biz_outlier_result 
      WHERE version_id = ? AND is_del = 0
    `;
    const params: (number | string)[] = [versionId];

    if (columnName) {
      sql += ' AND column_name = ?';
      params.push(columnName);
    }

    sql += ' ORDER BY executed_at DESC';

    return this.db.prepare(sql).all(...params) as OutlierResult[];
  }

  /**
   * 删除检测结果
   */
  deleteDetectionResult(id: number): boolean {
    const result = this.db
      .prepare(`
        UPDATE biz_outlier_result 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `)
      .run(id);

    return result.changes > 0;
  }

  /**
   * 获取单个检测结果
   */
  getOutlierResultById(id: number): OutlierResult | undefined {
    return this.db
      .prepare('SELECT * FROM biz_outlier_result WHERE id = ? AND is_del = 0')
      .get(id) as OutlierResult | undefined;
  }

  /**
   * 更新检测结果状态
   */
  updateOutlierResultStatus(id: number, status: OutlierResultStatus): boolean {
    const result = this.db
      .prepare(`
        UPDATE biz_outlier_result 
        SET status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `)
      .run(status, id);

    return result.changes > 0;
  }

  /**
   * 删除检测结果 (软删除)
   */
  deleteOutlierResult(id: number): boolean {
    const result = this.db
      .prepare(`
        UPDATE biz_outlier_result 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `)
      .run(id);

    return result.changes > 0;
  }

  // ==================== 异常值详情管理 ====================

  /**
   * 批量创建异常值详情
   */
  createOutlierDetails(
    resultId: number,
    details: Array<{
      row_index: number;
      original_value?: number;
      action?: 'FLAGGED' | 'REMOVED' | 'REPLACED';
      replaced_value?: number;
    }>
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO biz_outlier_detail 
        (result_id, row_index, original_value, action, replaced_value)
      VALUES (?, ?, ?, ?, ?)
    `);

    let count = 0;
    const transaction = this.db.transaction(() => {
      for (const detail of details) {
        stmt.run(
          resultId,
          detail.row_index,
          detail.original_value ?? null,
          detail.action ?? 'FLAGGED',
          detail.replaced_value ?? null
        );
        count++;
      }
    });

    transaction();
    return count;
  }

  /**
   * 获取检测结果的详情 (支持分页和列筛选)
   */
  getOutlierDetails(
    resultId: number,
    columnName?: string,
    limit: number = 100,
    offset: number = 0
  ): OutlierDetail[] {
    let sql = `
      SELECT * FROM biz_outlier_detail 
      WHERE result_id = ? AND is_del = 0
    `;
    const params: (number | string)[] = [resultId];

    if (columnName) {
      sql += ' AND column_name = ?';
      params.push(columnName);
    }

    sql += ' ORDER BY row_index ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params) as OutlierDetail[];
  }

  /**
   * 获取检测结果的所有详情 (不分页)
   */
  getAllOutlierDetails(resultId: number): OutlierDetail[] {
    return this.db
      .prepare('SELECT * FROM biz_outlier_detail WHERE result_id = ? AND is_del = 0 ORDER BY row_index ASC')
      .all(resultId) as OutlierDetail[];
  }

  /**
   * 获取异常值详情数量
   */
  getOutlierDetailsCount(resultId: number, columnName?: string): number {
    let sql = `
      SELECT COUNT(*) as count FROM biz_outlier_detail 
      WHERE result_id = ? AND is_del = 0
    `;
    const params: (number | string)[] = [resultId];

    if (columnName) {
      sql += ' AND column_name = ?';
      params.push(columnName);
    }

    const result = this.db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  /**
   * 批量创建异常值详情 (新版，支持更多字段)
   */
  batchCreateOutlierDetails(
    details: Array<{
      result_id: number;
      column_name: string;
      row_index: number;
      original_value: number;
      outlier_type: string;
      threshold_value: number;
      time_point?: string;
    }>
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO biz_outlier_detail 
        (result_id, column_name, row_index, original_value, outlier_type, threshold_value, time_point, action)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'FLAGGED')
    `);

    let count = 0;
    const transaction = this.db.transaction(() => {
      for (const detail of details) {
        stmt.run(
          detail.result_id,
          detail.column_name,
          detail.row_index,
          detail.original_value,
          detail.outlier_type,
          detail.threshold_value,
          detail.time_point ?? null
        );
        count++;
      }
    });

    transaction();
    return count;
  }

  /**
   * 删除检测结果的所有详情
   */
  deleteOutlierDetails(resultId: number): boolean {
    const result = this.db
      .prepare(`
        UPDATE biz_outlier_detail 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE result_id = ?
      `)
      .run(resultId);

    return result.changes > 0;
  }

  /**
   * 更新异常值详情 (确认/修改动作)
   */
  updateOutlierDetail(
    id: number,
    updates: {
      action?: 'FLAGGED' | 'REMOVED' | 'REPLACED';
      replaced_value?: number;
      is_confirmed?: number;
    }
  ): boolean {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.action !== undefined) {
      fields.push('action = ?');
      values.push(updates.action);
    }
    if (updates.replaced_value !== undefined) {
      fields.push('replaced_value = ?');
      values.push(updates.replaced_value);
    }
    if (updates.is_confirmed !== undefined) {
      fields.push('is_confirmed = ?');
      values.push(updates.is_confirmed);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE biz_outlier_detail SET ${fields.join(', ')} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...values);

    return result.changes > 0;
  }

  /**
   * 批量确认异常值
   */
  batchConfirmOutliers(detailIds: number[]): number {
    if (detailIds.length === 0) return 0;

    const placeholders = detailIds.map(() => '?').join(',');
    const result = this.db
      .prepare(`
        UPDATE biz_outlier_detail 
        SET is_confirmed = 1, updated_at = CURRENT_TIMESTAMP 
        WHERE id IN (${placeholders}) AND is_del = 0
      `)
      .run(...detailIds);

    return result.changes;
  }

  // ==================== 统计查询 ====================

  /**
   * 获取版本的异常值统计
   */
  getOutlierStatsByVersion(versionId: number): {
    total_outliers: number;
    by_column: Record<string, number>;
    by_method: Record<string, number>;
  } {
    const results = this.db
      .prepare(`
        SELECT column_name, detection_method, SUM(outlier_count) as count
        FROM biz_outlier_result 
        WHERE version_id = ? AND is_del = 0 AND status != 'REVERTED'
        GROUP BY column_name, detection_method
      `)
      .all(versionId) as Array<{ column_name: string; detection_method: string; count: number }>;

    const byColumn: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let total = 0;

    for (const row of results) {
      byColumn[row.column_name] = (byColumn[row.column_name] || 0) + row.count;
      byMethod[row.detection_method] = (byMethod[row.detection_method] || 0) + row.count;
      total += row.count;
    }

    return { total_outliers: total, by_column: byColumn, by_method: byMethod };
  }

  /**
   * 批量创建异常检测列统计
   */
  batchCreateOutlierColumnStats(
    stats: Array<{
      result_id: number;
      column_name: string;
      outlier_count: number;
      min_threshold?: number;
      max_threshold?: number;
    }>
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO biz_outlier_column_stat 
        (result_id, column_name, outlier_count, min_threshold, max_threshold)
      VALUES (?, ?, ?, ?, ?)
    `);

    let count = 0;
    const transaction = this.db.transaction(() => {
      for (const stat of stats) {
        stmt.run(
          stat.result_id,
          stat.column_name,
          stat.outlier_count,
          stat.min_threshold ?? null,
          stat.max_threshold ?? null
        );
        count++;
      }
    });

    transaction();
    return count;
  }

  /**
   * 删除检测结果的列统计
   */
  deleteOutlierColumnStats(resultId: number): boolean {
    const result = this.db
      .prepare(`
        UPDATE biz_outlier_column_stat 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE result_id = ?
      `)
      .run(resultId);

    return result.changes > 0;
  }

  /**
   * 获取检测结果的列统计数据
   * 优先从 biz_outlier_column_stat 获取，如果没有则从 biz_outlier_detail 聚合（兼容旧数据）
   */
  getOutlierColumnStats(resultId: number): Array<{
    columnName: string;
    outlierCount: number;
    minThreshold: number | null;
    maxThreshold: number | null;
  }> {
    // 1. 尝试从 biz_outlier_column_stat 获取
    const stats = this.db
      .prepare(`
        SELECT column_name, outlier_count, min_threshold, max_threshold
        FROM biz_outlier_column_stat
        WHERE result_id = ? AND is_del = 0
      `)
      .all(resultId) as Array<{
        column_name: string;
        outlier_count: number;
        min_threshold: number | null;
        max_threshold: number | null;
      }>;

    if (stats.length > 0) {
      return stats.map(s => ({
        columnName: s.column_name,
        outlierCount: s.outlier_count,
        minThreshold: s.min_threshold,
        maxThreshold: s.max_threshold
      }));
    }

    // 2. 回退到旧逻辑：从 biz_outlier_detail 聚合
    const results = this.db
      .prepare(`
        SELECT column_name as columnName, COUNT(*) as outlierCount
        FROM biz_outlier_detail 
        WHERE result_id = ? AND is_del = 0
        GROUP BY column_name
      `)
      .all(resultId) as Array<{ columnName: string; outlierCount: number }>;

    return results.map(r => ({
      columnName: r.columnName,
      outlierCount: r.outlierCount,
      minThreshold: null,
      maxThreshold: null
    }));
  }
}
