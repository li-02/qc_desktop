import { DatabaseManager } from "../core/DatabaseManager";
import { Dataset, DatasetVersion, StatVersionDetail, ColumnSetting } from "@shared/types/database";
import { ServiceResponse } from "@shared/types/projectInterface";

export class DatasetDBRepository {
  private get db() {
    return DatabaseManager.getInstance().getDatabase();
  }

  // Dataset operations
  createDataset(
    dataset: Omit<Dataset, "id" | "import_time" | "created_at" | "updated_at" | "is_del" | "deleted_at">
  ): ServiceResponse<number> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sys_dataset (category_id, dataset_name, source_file_path, missing_value_types, time_column, description)
        VALUES (@category_id, @dataset_name, @source_file_path, @missing_value_types, @time_column, @description)
      `);
      const info = stmt.run(dataset);
      return { success: true, data: Number(info.lastInsertRowid) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getDatasetsByCategoryId(categoryId: number): ServiceResponse<Dataset[]> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM sys_dataset WHERE category_id = ? AND is_del = 0 ORDER BY import_time DESC"
      );
      const datasets = stmt.all(categoryId) as Dataset[];
      return { success: true, data: datasets };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getDatasetById(id: number): ServiceResponse<Dataset> {
    try {
      const stmt = this.db.prepare("SELECT * FROM sys_dataset WHERE id = ? AND is_del = 0");
      const dataset = stmt.get(id) as Dataset;
      if (!dataset) {
        return { success: false, error: "Dataset not found" };
      }
      return { success: true, data: dataset };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  updateDataset(
    id: number,
    dataset: Partial<Omit<Dataset, "id" | "import_time" | "created_at" | "updated_at" | "is_del" | "deleted_at">>
  ): ServiceResponse<void> {
    try {
      const fields = Object.keys(dataset)
        .map(key => `${key} = @${key}`)
        .join(", ");
      if (!fields) return { success: true };

      const stmt = this.db.prepare(`
        UPDATE sys_dataset SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND is_del = 0
      `);
      stmt.run({ ...dataset, id });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  deleteDataset(id: number): ServiceResponse<void> {
    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `
            UPDATE biz_outlier_detail
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE result_id IN (
              SELECT id FROM biz_outlier_result
              WHERE (
                dataset_id = ?
                OR version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
                OR generated_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
              )
              AND is_del = 0
            )
          `
          )
          .run(id, id, id);

        this.db
          .prepare(
            `
            UPDATE biz_outlier_column_stat
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE result_id IN (
              SELECT id FROM biz_outlier_result
              WHERE (
                dataset_id = ?
                OR version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
                OR generated_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
              )
              AND is_del = 0
            )
          `
          )
          .run(id, id, id);

        this.db
          .prepare(
            `
            UPDATE biz_outlier_result
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE (
              dataset_id = ?
              OR version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
              OR generated_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
            )
            AND is_del = 0
          `
          )
          .run(id, id, id);

        this.db
          .prepare(
            `
            UPDATE conf_outlier_detection
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE scope_type = 'DATASET' AND scope_id = ? AND is_del = 0
          `
          )
          .run(id);

        this.db
          .prepare(
            `
            UPDATE biz_imputation_column_stat
            SET is_del = 1, updated_at = CURRENT_TIMESTAMP
            WHERE result_id IN (
              SELECT id FROM biz_imputation_result
              WHERE (
                dataset_id = ?
                OR version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
                OR new_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
              )
              AND is_del = 0
            )
          `
          )
          .run(id, id, id);

        this.db
          .prepare(
            `
            UPDATE biz_imputation_result
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE (
              dataset_id = ?
              OR version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
              OR new_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
            )
            AND is_del = 0
          `
          )
          .run(id, id, id);

        this.db
          .prepare(
            `
            UPDATE biz_imputation_model
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE dataset_id = ? AND is_del = 0
          `
          )
          .run(id);

        this.db
          .prepare(
            `
            UPDATE biz_flux_partitioning_result
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE (
              dataset_id = ?
              OR version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
              OR new_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
            )
            AND is_del = 0
          `
          )
          .run(id, id, id);

        this.db
          .prepare(
            `
            UPDATE biz_workflow_node
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE workflow_id IN (
              SELECT id FROM biz_workflow
              WHERE (
                dataset_id = ?
                OR initial_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
              )
              AND is_del = 0
            )
          `
          )
          .run(id, id);

        this.db
          .prepare(
            `
            UPDATE biz_workflow
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE (
              dataset_id = ?
              OR initial_version_id IN (SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0)
            )
            AND is_del = 0
          `
          )
          .run(id, id);

        this.db
          .prepare(
            `
            UPDATE stat_version_detail
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE version_id IN (
              SELECT id FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0
            )
          `
          )
          .run(id);

        this.db
          .prepare(
            `
            UPDATE biz_dataset_version
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE dataset_id = ? AND is_del = 0
          `
          )
          .run(id);

        this.db
          .prepare(
            `
            UPDATE conf_column_setting
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE dataset_id = ? AND is_del = 0
          `
          )
          .run(id);

        this.db
          .prepare(
            `
            UPDATE sys_dataset
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_del = 0
          `
          )
          .run(id);
      })();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Dataset Version operations
  createDatasetVersion(
    version: Omit<DatasetVersion, "id" | "created_at" | "updated_at" | "is_del" | "deleted_at">
  ): ServiceResponse<number> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO biz_dataset_version (dataset_id, parent_version_id, stage_type, file_path, remark)
        VALUES (@dataset_id, @parent_version_id, @stage_type, @file_path, @remark)
      `);
      const info = stmt.run(version);
      return { success: true, data: Number(info.lastInsertRowid) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getVersionsByDatasetId(datasetId: number): ServiceResponse<DatasetVersion[]> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM biz_dataset_version WHERE dataset_id = ? AND is_del = 0 ORDER BY created_at DESC"
      );
      const versions = stmt.all(datasetId) as DatasetVersion[];
      return { success: true, data: versions };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getDatasetVersionById(id: number): ServiceResponse<DatasetVersion> {
    try {
      const stmt = this.db.prepare("SELECT * FROM biz_dataset_version WHERE id = ? AND is_del = 0");
      const version = stmt.get(id) as DatasetVersion;
      if (!version) {
        return { success: false, error: "Version not found" };
      }
      return { success: true, data: version };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  updateDatasetVersion(id: number, updates: Partial<Pick<DatasetVersion, "remark">>): ServiceResponse<void> {
    try {
      const fields = Object.keys(updates)
        .map(key => `${key} = @${key}`)
        .join(", ");
      if (!fields) return { success: true };
      const stmt = this.db.prepare(`
        UPDATE biz_dataset_version SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND is_del = 0
      `);
      stmt.run({ ...updates, id });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  deleteDatasetVersion(id: number): ServiceResponse<void> {
    try {
      this.db.transaction(() => {
        this.db.prepare("DELETE FROM stat_version_detail WHERE version_id = ?").run(id);
        this.db.prepare("DELETE FROM biz_dataset_version WHERE id = ?").run(id);
      })();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Stat Version Detail operations
  createStatVersionDetail(
    stat: Omit<StatVersionDetail, "id" | "calculated_at" | "created_at" | "updated_at" | "is_del" | "deleted_at">
  ): ServiceResponse<number> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO stat_version_detail (version_id, total_rows, total_cols, total_missing_count, total_outlier_count, column_stats_json)
        VALUES (@version_id, @total_rows, @total_cols, @total_missing_count, @total_outlier_count, @column_stats_json)
      `);
      const info = stmt.run(stat);
      return { success: true, data: Number(info.lastInsertRowid) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getStatByVersionId(versionId: number): ServiceResponse<StatVersionDetail> {
    try {
      const stmt = this.db.prepare("SELECT * FROM stat_version_detail WHERE version_id = ? AND is_del = 0");
      const stat = stmt.get(versionId) as StatVersionDetail;
      if (!stat) {
        return { success: false, error: "Stat not found" };
      }
      return { success: true, data: stat };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Column Setting operations
  saveColumnSettings(
    settings: Omit<ColumnSetting, "id" | "created_at" | "updated_at" | "is_del" | "deleted_at">[]
  ): ServiceResponse<void> {
    const insert = this.db.prepare(`
      INSERT INTO conf_column_setting (dataset_id, column_name, column_index, data_type, min_threshold, max_threshold, is_active)
      VALUES (@dataset_id, @column_name, @column_index, @data_type, @min_threshold, @max_threshold, @is_active)
    `);

    const deleteExisting = this.db.prepare("DELETE FROM conf_column_setting WHERE dataset_id = ?");

    try {
      this.db.transaction(() => {
        if (settings.length > 0) {
          deleteExisting.run(settings[0].dataset_id);
          for (const setting of settings) {
            insert.run(setting);
          }
        }
      })();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getColumnSettings(datasetId: number): ServiceResponse<ColumnSetting[]> {
    try {
      const stmt = this.db.prepare("SELECT * FROM conf_column_setting WHERE dataset_id = ? AND is_del = 0");
      const settings = stmt.all(datasetId) as ColumnSetting[];
      return { success: true, data: settings };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
