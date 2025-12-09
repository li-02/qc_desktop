import { DatabaseManager } from '../core/DatabaseManager';
import { CorrelationResult } from '@shared/types/database';

export class CorrelationAnalysisRepository {
  private get db() {
    return DatabaseManager.getInstance().getDatabase();
  }

  /**
   * 保存相关性分析结果
   */
  async create(result: Omit<CorrelationResult, 'id' | 'created_at' | 'updated_at' | 'is_del'>): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO biz_correlation_result (
        dataset_id, version_id, columns, method, result_matrix, 
        significance_level, sample_size, executed_at
      ) VALUES (
        @dataset_id, @version_id, @columns, @method, @result_matrix, 
        @significance_level, @sample_size, @executed_at
      )
    `);

    const info = stmt.run(result);
    return Number(info.lastInsertRowid);
  }

  /**
   * 获取数据集的分析历史
   */
  async findByDatasetId(datasetId: number): Promise<CorrelationResult[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM biz_correlation_result 
      WHERE dataset_id = ? AND is_del = 0 
      ORDER BY executed_at DESC
    `);
    
    return stmt.all(datasetId) as CorrelationResult[];
  }

  /**
   * 删除分析结果 (软删除)
   */
  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      UPDATE biz_correlation_result 
      SET is_del = 1, deleted_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * 批量删除分析结果 (软删除)
   */
  async batchDelete(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      UPDATE biz_correlation_result 
      SET is_del = 1, deleted_at = CURRENT_TIMESTAMP 
      WHERE id IN (${placeholders})
    `);
    
    const info = stmt.run(...ids);
    return info.changes;
  }
}
