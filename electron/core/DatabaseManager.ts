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

    this.initCoreTables();
    this.initOutlierDetectionTables();
    this.migrateSchema();
  }

  /**
   * 初始化核心表结构
   */
  private initCoreTables(): void {
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

    // 3.2.3 列配置表 (conf_column_setting) - 扩展支持异常检测阈值
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_column_setting (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        column_name TEXT NOT NULL,
        column_index INTEGER,
        data_type TEXT,
        min_threshold REAL,
        max_threshold REAL,
        physical_min REAL,
        physical_max REAL,
        warning_min REAL,
        warning_max REAL,
        unit TEXT,
        variable_type TEXT,
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

  /**
   * 初始化异常检测相关表结构
   */
  private initOutlierDetectionTables(): void {
    if (!this.db) return;

    // 异常检测配置表 (conf_outlier_detection)
    // 支持三级作用域: APP(全局) / SITE(站点) / DATASET(数据集)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_outlier_detection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_type TEXT NOT NULL CHECK(scope_type IN ('APP', 'SITE', 'DATASET')),
        scope_id INTEGER,
        column_name TEXT,
        detection_method TEXT NOT NULL,
        method_params TEXT,
        priority INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0
      );
    `);

    // 异常检测结果表 (biz_outlier_result)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_outlier_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id INTEGER NOT NULL,
        detection_config_id INTEGER,
        column_name TEXT NOT NULL,
        detection_method TEXT NOT NULL,
        outlier_indices TEXT,
        outlier_count INTEGER DEFAULT 0,
        detection_params TEXT,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPLIED', 'REVERTED')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0,
        FOREIGN KEY (version_id) REFERENCES biz_dataset_version(id) ON DELETE CASCADE,
        FOREIGN KEY (detection_config_id) REFERENCES conf_outlier_detection(id)
      );
    `);

    // 异常值详情表 (biz_outlier_detail)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_outlier_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        result_id INTEGER NOT NULL,
        row_index INTEGER NOT NULL,
        original_value REAL,
        action TEXT DEFAULT 'FLAGGED' CHECK(action IN ('FLAGGED', 'REMOVED', 'REPLACED')),
        replaced_value REAL,
        is_confirmed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0,
        FOREIGN KEY (result_id) REFERENCES biz_outlier_result(id) ON DELETE CASCADE
      );
    `);

    // 创建索引以提升查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_outlier_detection_scope 
        ON conf_outlier_detection(scope_type, scope_id, column_name);
      
      CREATE INDEX IF NOT EXISTS idx_outlier_result_version 
        ON biz_outlier_result(version_id, column_name);
      
      CREATE INDEX IF NOT EXISTS idx_outlier_detail_result 
        ON biz_outlier_detail(result_id, row_index);
    `);
  }

  /**
   * 数据库迁移 - 为现有表添加新字段
   */
  private migrateSchema(): void {
    if (!this.db) return;

    // 检查并添加 conf_column_setting 表的新字段
    const columnInfo = this.db
      .prepare("PRAGMA table_info(conf_column_setting)")
      .all() as { name: string }[];
    
    const existingColumns = new Set(columnInfo.map(c => c.name));

    const newColumns = [
      { name: 'physical_min', type: 'REAL' },
      { name: 'physical_max', type: 'REAL' },
      { name: 'warning_min', type: 'REAL' },
      { name: 'warning_max', type: 'REAL' },
      { name: 'unit', type: 'TEXT' },
      { name: 'variable_type', type: 'TEXT' }
    ];

    for (const col of newColumns) {
      if (!existingColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE conf_column_setting ADD COLUMN ${col.name} ${col.type};`);
      }
    }
  }
}
