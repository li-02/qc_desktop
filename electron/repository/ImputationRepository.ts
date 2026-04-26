import { DatabaseManager } from "../core/DatabaseManager";
import type {
  ImputationMethodRow,
  ImputationMethodParamRow,
  ImputationResultRow,
  ImputationColumnStatRow,
  ImputationCategory,
  ImputationResultStatus,
} from "@shared/types/imputation";

export class ImputationRepository {
  private db = DatabaseManager.getInstance().getDatabase();

  // ==================== 插补方法 ====================

  /**
   * 获取所有插补方法
   */
  getAllMethods(): ImputationMethodRow[] {
    return this.db
      .prepare(
        `
        SELECT * FROM conf_imputation_method 
        WHERE is_del = 0 
        ORDER BY priority DESC
      `
      )
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
      .prepare(
        `
        SELECT * FROM conf_imputation_method 
        WHERE category = ? AND is_del = 0 
        ORDER BY priority DESC
      `
      )
      .all(validCategory) as ImputationMethodRow[];
  }

  /**
   * 获取可用的插补方法
   */
  getAvailableMethods(): ImputationMethodRow[] {
    return this.db
      .prepare(
        `
        SELECT * FROM conf_imputation_method 
        WHERE is_available = 1 AND is_del = 0 
        ORDER BY priority DESC
      `
      )
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
      .prepare(
        `
        SELECT * FROM conf_imputation_method
        WHERE method_id = ? AND is_del = 0
      `
      )
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
      .prepare(
        `
        SELECT * FROM conf_imputation_method_params
        WHERE method_id = ? AND is_del = 0
        ORDER BY param_order ASC
      `
      )
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
      .prepare(
        `
        INSERT INTO biz_imputation_result 
          (dataset_id, version_id, method_id, target_columns, method_params, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
      `
      )
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
      .prepare(
        `
        UPDATE biz_imputation_result 
        SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(status, errorMessage || null, resultId);
  }

  /**
   * 更新插补结果输出文件
   */
  updateResultOutputFile(resultId: number, outputFilePath: string): void {
    this.db
      .prepare(
        `
        UPDATE biz_imputation_result
        SET output_file_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(outputFilePath, resultId);
  }

  /**
   * 更新插补结果统计
   */
  updateResultStats(
    resultId: number,
    stats: {
      totalMissing: number;
      imputedCount: number;
      imputationRate: number;
      executionTimeMs?: number;
      newVersionId?: number;
    }
  ): void {
    this.db
      .prepare(
        `
        UPDATE biz_imputation_result 
        SET total_missing = ?, imputed_count = ?, imputation_rate = ?, 
            execution_time_ms = ?, new_version_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
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
      .prepare(
        `
        UPDATE biz_imputation_result 
        SET new_version_id = ?, status = 'APPLIED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(newVersionId, resultId);
  }

  /**
   * 获取插补结果
   */
  getResultById(resultId: number): ImputationResultRow | undefined {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_imputation_result 
        WHERE id = ? AND is_del = 0
      `
      )
      .get(resultId) as ImputationResultRow | undefined;
  }

  /**
   * 获取数据集的插补结果列表
   */
  getResultsByDataset(datasetId: number, limit = 50, offset = 0): ImputationResultRow[] {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_imputation_result 
        WHERE dataset_id = ? AND is_del = 0 
        ORDER BY executed_at DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(datasetId, limit, offset) as ImputationResultRow[];
  }

  /**
   * 删除插补结果（软删除）
   */
  deleteResult(resultId: number): void {
    this.db
      .prepare(
        `
        UPDATE biz_imputation_result 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(resultId);
  }

  /**
   * 重命名插补结果
   */
  renameResult(id: number, name: string): boolean {
    const result = this.db
      .prepare(
        `
        UPDATE biz_imputation_result 
        SET name = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND is_del = 0
      `
      )
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
      .prepare(
        `
        INSERT INTO biz_imputation_column_stat 
          (result_id, column_name, missing_count, imputed_count, imputation_rate,
           mean_before, mean_after, std_before, std_after, min_imputed, max_imputed,
           avg_confidence, imputed_row_indices, imputed_values)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
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
      .prepare(
        `
        SELECT * FROM biz_imputation_column_stat 
        WHERE result_id = ? AND is_del = 0
        ORDER BY column_name
      `
      )
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
      .prepare(
        `
        INSERT INTO biz_imputation_model 
          (dataset_id, method_id, model_name, model_path, model_params, 
           target_column, feature_columns, time_column,
           training_columns, training_samples, validation_score, trained_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      )
      .run(
        params.datasetId || null,
        params.methodId,
        params.modelName || null,
        params.modelPath,
        params.modelParams ? JSON.stringify(params.modelParams) : null,
        params.targetColumn || null,
        params.featureColumns ? JSON.stringify(params.featureColumns) : null,
        params.timeColumn || "record_time",
        params.trainingColumns ? JSON.stringify(params.trainingColumns) : null,
        params.trainingSamples || null,
        params.validationScore || null
      );
    return result.lastInsertRowid as number;
  }

  /**
   * 获取数据集的所有模型（包括通用模型，即 dataset_id IS NULL）
   */
  getModelsByDataset(datasetId: number, methodId?: string): any[] {
    if (methodId) {
      const orderBy =
        methodId === "ITRANSFORMER" || methodId === "SAITS" || methodId === "TIMEMIXER"
          ? `
          ORDER BY
            target_column COLLATE NOCASE,
            CASE
              WHEN lower(model_path) GLOB '*masks1_*' THEN 1
              WHEN lower(model_path) GLOB '*masks7_*' THEN 7
              WHEN lower(model_path) GLOB '*masks15_*' THEN 15
              WHEN lower(model_path) GLOB '*masks30_*' THEN 30
              ELSE 999
            END,
            trained_at DESC
        `
          : "ORDER BY trained_at DESC";

      return this.db
        .prepare(
          `
          SELECT * FROM biz_imputation_model 
          WHERE (dataset_id = ? OR dataset_id IS NULL) AND method_id = ? AND is_del = 0
          ${orderBy}
        `
        )
        .all(datasetId, methodId);
    }
    return this.db
      .prepare(
        `
        SELECT * FROM biz_imputation_model 
        WHERE (dataset_id = ? OR dataset_id IS NULL) AND is_del = 0
        ORDER BY trained_at DESC
      `
      )
      .all(datasetId);
  }

  /**
   * 获取模型详情
   */
  getModelById(modelId: number): any | undefined {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_imputation_model 
        WHERE id = ? AND is_del = 0
      `
      )
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
      .prepare(
        `
        UPDATE biz_imputation_model 
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE dataset_id = ? AND method_id = ? AND is_del = 0
      `
      )
      .run(model.dataset_id, model.method_id);

    // 设置当前模型为活跃
    this.db
      .prepare(
        `
        UPDATE biz_imputation_model 
        SET is_active = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(modelId);
  }

  /**
   * 更新模型信息
   */
  updateModel(
    modelId: number,
    params: {
      modelName?: string;
      modelPath?: string;
      modelParams?: Record<string, any>;
      targetColumn?: string;
      featureColumns?: string[];
      timeColumn?: string;
      columnMapping?: Record<string, string>;
      validationScore?: number;
    }
  ): void {
    const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: any[] = [];

    if (params.modelName !== undefined) {
      updates.push("model_name = ?");
      values.push(params.modelName);
    }
    if (params.modelPath !== undefined) {
      updates.push("model_path = ?");
      values.push(params.modelPath);
    }
    if (params.modelParams !== undefined) {
      updates.push("model_params = ?");
      values.push(JSON.stringify(params.modelParams));
    }
    if (params.targetColumn !== undefined) {
      updates.push("target_column = ?");
      values.push(params.targetColumn);
    }
    if (params.featureColumns !== undefined) {
      updates.push("feature_columns = ?");
      values.push(JSON.stringify(params.featureColumns));
    }
    if (params.timeColumn !== undefined) {
      updates.push("time_column = ?");
      values.push(params.timeColumn);
    }
    if (params.columnMapping !== undefined) {
      updates.push("column_mapping = ?");
      values.push(JSON.stringify(params.columnMapping));
    }
    if (params.validationScore !== undefined) {
      updates.push("validation_score = ?");
      values.push(params.validationScore);
    }

    values.push(modelId);

    this.db
      .prepare(
        `
        UPDATE biz_imputation_model 
        SET ${updates.join(", ")}
        WHERE id = ?
      `
      )
      .run(...values);
  }

  /**
   * 删除模型（软删除）
   */
  deleteModel(modelId: number): void {
    this.db
      .prepare(
        `
        UPDATE biz_imputation_model 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(modelId);
  }

  // ==================== 自定义模型注册 ====================

  /**
   * 注册自定义插补方法（插入 conf_imputation_method）
   */
  createMethod(params: {
    methodId: string;
    methodName: string;
    category: string;
    description?: string;
    estimatedTime?: string;
    accuracy?: string;
    priority?: number;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO conf_imputation_method 
          (method_id, method_name, category, description, estimated_time, accuracy, priority, is_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `
      )
      .run(
        params.methodId,
        params.methodName,
        params.category,
        params.description || null,
        params.estimatedTime || "medium",
        params.accuracy || "medium",
        params.priority || 50
      );
  }

  /**
   * 注册自定义方法参数（批量插入 conf_imputation_method_params）
   */
  createMethodParams(
    methodId: string,
    paramsList: Array<{
      paramKey: string;
      paramName: string;
      paramType: string;
      defaultValue: string;
      minValue?: number;
      maxValue?: number;
      stepValue?: number;
      options?: string;
      tooltip?: string;
      isRequired: boolean;
      isAdvanced: boolean;
      paramOrder: number;
    }>
  ): void {
    const stmt = this.db.prepare(
      `
      INSERT INTO conf_imputation_method_params 
        (method_id, param_key, param_name, param_type, default_value, 
         min_value, max_value, step_value, options, tooltip, is_required, is_advanced, param_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    const insertMany = this.db.transaction((params: typeof paramsList) => {
      for (const p of params) {
        stmt.run(
          methodId,
          p.paramKey,
          p.paramName,
          p.paramType,
          p.defaultValue,
          p.minValue ?? null,
          p.maxValue ?? null,
          p.stepValue ?? null,
          p.options ?? null,
          p.tooltip ?? null,
          p.isRequired ? 1 : 0,
          p.isAdvanced ? 1 : 0,
          p.paramOrder
        );
      }
    });

    insertMany(paramsList);
  }

  /**
   * 获取所有自定义模型方法（category = 'custom'）
   */
  getCustomMethods(): ImputationMethodRow[] {
    return this.db
      .prepare(
        `
        SELECT * FROM conf_imputation_method 
        WHERE category = 'custom' AND is_del = 0 
        ORDER BY created_at DESC
      `
      )
      .all() as ImputationMethodRow[];
  }

  /**
   * 删除自定义方法及其关联的参数和模型（软删除）
   */
  deleteCustomMethod(methodId: string): void {
    const deleteAll = this.db.transaction(() => {
      // 软删除方法
      this.db
        .prepare(
          `
          UPDATE conf_imputation_method 
          SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE method_id = ? AND category = 'custom'
        `
        )
        .run(methodId);

      // 软删除关联参数
      this.db
        .prepare(
          `
          UPDATE conf_imputation_method_params 
          SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE method_id = ?
        `
        )
        .run(methodId);

      // 软删除关联模型
      this.db
        .prepare(
          `
          UPDATE biz_imputation_model 
          SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE method_id = ?
        `
        )
        .run(methodId);
    });

    deleteAll();
  }

  /**
   * 根据方法ID获取所有模型（不限定 dataset_id）
   */
  getModelsByMethodId(methodId: string): any[] {
    return this.db
      .prepare(
        `
        SELECT * FROM biz_imputation_model 
        WHERE method_id = ? AND is_del = 0
        ORDER BY trained_at DESC
      `
      )
      .all(methodId);
  }
}
