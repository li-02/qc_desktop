import { DatabaseManager } from '../core/DatabaseManager';
import type {
  FluxPartitioningResultRow,
  FluxPartitioningStatus,
} from '@shared/types/fluxPartitioning';

export class FluxPartitioningRepository {
  private db = DatabaseManager.getInstance().getDatabase();

  // ==================== 分割结果 ====================

  /**
   * 创建分割结果记录
   */
  createResult(params: {
    datasetId: number;
    versionId: number;
    methodId: string;
    methodName: string;
    columnMapping: Record<string, string>;
    siteInfo: Record<string, number>;
    options?: Record<string, any>;
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO biz_flux_partitioning_result 
          (dataset_id, version_id, method_id, method_name, column_mapping, site_info, options, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `)
      .run(
        params.datasetId,
        params.versionId,
        params.methodId,
        params.methodName,
        JSON.stringify(params.columnMapping),
        JSON.stringify(params.siteInfo),
        params.options ? JSON.stringify(params.options) : null
      );
    return result.lastInsertRowid as number;
  }

  /**
   * 更新结果状态
   */
  updateResultStatus(resultId: number, status: FluxPartitioningStatus, errorMessage?: string): void {
    this.db
      .prepare(`
        UPDATE biz_flux_partitioning_result 
        SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(status, errorMessage || null, resultId);
  }

  /**
   * 更新结果统计和输出信息
   */
  updateResultOutput(resultId: number, params: {
    outputColumns?: string[];
    gppStats?: Record<string, any>;
    recoStats?: Record<string, any>;
    executionTimeMs?: number;
    newVersionId?: number;
  }): void {
    this.db
      .prepare(`
        UPDATE biz_flux_partitioning_result 
        SET output_columns = ?, gpp_stats = ?, reco_stats = ?,
            execution_time_ms = ?, new_version_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        params.outputColumns ? JSON.stringify(params.outputColumns) : null,
        params.gppStats ? JSON.stringify(params.gppStats) : null,
        params.recoStats ? JSON.stringify(params.recoStats) : null,
        params.executionTimeMs || null,
        params.newVersionId || null,
        resultId
      );
  }

  /**
   * 获取结果
   */
  getResultById(resultId: number): FluxPartitioningResultRow | undefined {
    return this.db
      .prepare(`
        SELECT * FROM biz_flux_partitioning_result 
        WHERE id = ? AND is_del = 0
      `)
      .get(resultId) as FluxPartitioningResultRow | undefined;
  }

  /**
   * 获取数据集的分割结果列表
   */
  getResultsByDataset(datasetId: number, limit = 50, offset = 0): FluxPartitioningResultRow[] {
    return this.db
      .prepare(`
        SELECT * FROM biz_flux_partitioning_result 
        WHERE dataset_id = ? AND is_del = 0 
        ORDER BY executed_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(datasetId, limit, offset) as FluxPartitioningResultRow[];
  }

  /**
   * 删除分割结果（软删除）
   */
  deleteResult(resultId: number): void {
    this.db
      .prepare(`
        UPDATE biz_flux_partitioning_result 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(resultId);
  }

  /**
   * 更新结果的新版本ID
   */
  updateResultNewVersion(resultId: number, newVersionId: number): void {
    this.db
      .prepare(`
        UPDATE biz_flux_partitioning_result 
        SET new_version_id = ?, status = 'APPLIED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(newVersionId, resultId);
  }
}
