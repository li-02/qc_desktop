import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public initialize(dbPath: string): void {
    if (this.db) {
      return;
    }

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  public getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  private initSchema(): void {
    if (!this.db) return;

    // 3.2.1 站点表 (sys_site)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sys_site (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_name TEXT NOT NULL,
        description TEXT,
        latitude REAL,
        longitude REAL,
        altitude REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0
      );
    `);

    // 3.2.2 数据集表 (sys_dataset)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sys_dataset (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        dataset_name TEXT NOT NULL,
        source_file_path TEXT,
        import_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0,
        FOREIGN KEY (site_id) REFERENCES sys_site(id) ON DELETE CASCADE
      );
    `);

    // 3.2.3 列配置表 (conf_column_setting)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_column_setting (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        column_name TEXT NOT NULL,
        column_index INTEGER,
        data_type TEXT,
        min_threshold REAL,
        max_threshold REAL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0,
        FOREIGN KEY (dataset_id) REFERENCES sys_dataset(id) ON DELETE CASCADE
      );
    `);

    // 3.2.4 数据版本表 (biz_dataset_version)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_dataset_version (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        parent_version_id INTEGER,
        stage_type TEXT NOT NULL,
        file_path VARCHAR(256) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0,
        remark TEXT,
        FOREIGN KEY (dataset_id) REFERENCES sys_dataset(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_version_id) REFERENCES biz_dataset_version(id)
      );
    `);

    // 3.2.5 统计详情表 (stat_version_detail)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stat_version_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id INTEGER NOT NULL,
        total_rows INTEGER DEFAULT 0,
        total_cols INTEGER DEFAULT 0,
        total_missing_count INTEGER DEFAULT 0,
        total_outlier_count INTEGER DEFAULT 0,
        column_stats_json TEXT,
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0,
        FOREIGN KEY (version_id) REFERENCES biz_dataset_version(id) ON DELETE CASCADE
      );
    `);
  }
}
