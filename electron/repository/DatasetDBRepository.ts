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
      const stmt = this.db.prepare("SELECT * FROM sys_dataset WHERE id = ?");
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
        UPDATE sys_dataset SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id
      `);
      stmt.run({ ...dataset, id });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  deleteDataset(id: number): ServiceResponse<void> {
    try {
      const stmt = this.db.prepare("DELETE FROM sys_dataset WHERE id = ?");
      stmt.run(id);
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
      const stmt = this.db.prepare("SELECT * FROM biz_dataset_version WHERE dataset_id = ? ORDER BY created_at DESC");
      const versions = stmt.all(datasetId) as DatasetVersion[];
      return { success: true, data: versions };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getDatasetVersionById(id: number): ServiceResponse<DatasetVersion> {
    try {
      const stmt = this.db.prepare("SELECT * FROM biz_dataset_version WHERE id = ?");
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
        UPDATE biz_dataset_version SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id
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
      const stmt = this.db.prepare("SELECT * FROM stat_version_detail WHERE version_id = ?");
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
      const stmt = this.db.prepare("SELECT * FROM conf_column_setting WHERE dataset_id = ?");
      const settings = stmt.all(datasetId) as ColumnSetting[];
      return { success: true, data: settings };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
