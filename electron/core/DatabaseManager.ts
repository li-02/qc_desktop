import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";

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
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }

  public getDatabase(): Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  private initSchema(): void {
    if (!this.db) return;

    this.initCoreTables();
    this.initSystemSettingsTables();
    this.initExternalDataSourceTables();
    this.initOutlierDetectionTables();
    this.initImputationTables();
    this.initFluxPartitioningTables();
    this.initWorkflowTables();
    this.migrateSchema();
    this.seedBuiltinTemplates();
    this.seedBuiltinBEONSiteRules();
  }

  /**
   * 初始化核心表结构
   */
  private initCoreTables(): void {
    if (!this.db) return;

    // 3.2.1 分类表 (sys_category)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sys_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 分类唯一标识
        category_name TEXT NOT NULL,           -- 分类名称
        description TEXT,                      -- 分类描述
        latitude REAL,                         -- 纬度 (保留字段)
        longitude REAL,                        -- 经度 (保留字段)
        altitude REAL,                         -- 海拔高度 (保留字段)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0               -- 软删除标记 (0=正常, 1=已删除)
      );
    `);

    // 3.2.2 数据集表 (sys_dataset)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sys_dataset (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 数据集唯一标识
        category_id INTEGER NOT NULL,          -- 所属分类ID
        dataset_name TEXT NOT NULL,            -- 数据集名称 (通常为文件名)
        source_file_path TEXT,                 -- 原始文件路径
        missing_value_types TEXT,              -- 缺失值表示 (JSON数组字符串)
        time_column TEXT,                      -- 时间列名称 (解析时自动识别)
        import_time DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 导入时间
        description TEXT,                      -- 数据集描述
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0,              -- 软删除标记
        FOREIGN KEY (category_id) REFERENCES sys_category(id) ON DELETE CASCADE
      );
    `);

    // 3.2.3 列配置表 (conf_column_setting) - 扩展支持异常检测阈值
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_column_setting (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 列配置唯一标识
        dataset_id INTEGER NOT NULL,           -- 所属数据集ID
        column_name TEXT NOT NULL,             -- 列名
        column_index INTEGER,                  -- 列在文件中的顺序索引 (从0开始)
        data_type TEXT,                        -- 数据类型 (number/string/datetime)
        min_threshold REAL,                    -- 基础最小阈值 (用户自定义过滤边界)
        max_threshold REAL,                    -- 基础最大阈值 (用户自定义过滤边界)
        physical_min REAL,                     -- 物理最小值 (绝对边界, 超出即无效)
        physical_max REAL,                     -- 物理最大值 (绝对边界, 超出即无效)
        warning_min REAL,                      -- 警告最小值 (软边界, 超出需审核)
        warning_max REAL,                      -- 警告最大值 (软边界, 超出需审核)
        unit TEXT,                             -- 单位 (如 °C, W/m², μmol/m²/s)
        variable_type TEXT,                    -- 变量类型 (如 temperature/radiation/flux)
        is_active BOOLEAN DEFAULT 1,           -- 是否参与计算 (0=禁用, 1=启用)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0,              -- 软删除标记
        FOREIGN KEY (dataset_id) REFERENCES sys_dataset(id) ON DELETE CASCADE
      );
    `);

    // 3.2.4 数据版本表 (biz_dataset_version)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_dataset_version (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 版本唯一标识
        dataset_id INTEGER NOT NULL,           -- 所属数据集ID
        parent_version_id INTEGER,             -- 父版本ID (用于版本链追溯)
        stage_type TEXT NOT NULL,              -- 阶段类型 (RAW=原始/FILTERED=过滤后/QC=质控后)
        file_path VARCHAR(256) NOT NULL,       -- 数据文件路径 (Parquet格式)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0,              -- 软删除标记
        remark TEXT,                           -- 版本备注
        FOREIGN KEY (dataset_id) REFERENCES sys_dataset(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_version_id) REFERENCES biz_dataset_version(id)
      );
    `);

    // 3.2.5 统计详情表 (stat_version_detail)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stat_version_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 统计记录唯一标识
        version_id INTEGER NOT NULL,           -- 所属数据版本ID
        total_rows INTEGER DEFAULT 0,          -- 总行数
        total_cols INTEGER DEFAULT 0,          -- 总列数
        total_missing_count INTEGER DEFAULT 0, -- 缺失值总数
        total_outlier_count INTEGER DEFAULT 0, -- 异常值总数
        column_stats_json TEXT,                -- 列级统计信息 (JSON格式)
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 统计计算时间
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0,              -- 软删除标记
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
    // 支持三级作用域: APP(全局) / CATEGORY(分类) / DATASET(数据集)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_outlier_detection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 配置唯一标识
        scope_type TEXT NOT NULL CHECK(scope_type IN ('APP', 'CATEGORY', 'DATASET')),  -- 作用域类型 (APP=全局/CATEGORY=分类级/DATASET=数据集级)
        scope_id INTEGER,                      -- 作用域ID (APP时为NULL, CATEGORY时为分类ID, DATASET时为数据集ID)
        column_name TEXT,                      -- 列名 (NULL表示全局默认配置)
        detection_method TEXT NOT NULL,        -- 检测方法标识 (如 ZSCORE/IQR/THRESHOLD_STATIC)
        method_params TEXT,                    -- 方法参数 (JSON格式)
        priority INTEGER DEFAULT 0,            -- 优先级 (数值越大优先级越高)
        is_active BOOLEAN DEFAULT 1,           -- 是否启用 (0=禁用, 1=启用)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0               -- 软删除标记
      );
    `);

    // 异常检测结果表 (biz_outlier_result)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_outlier_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 结果唯一标识
        dataset_id INTEGER,                    -- 数据集ID
        version_id INTEGER NOT NULL,           -- 数据版本ID
        generated_version_id INTEGER,          -- 生成的新版本ID (仅状态为APPLIED时有效)
        detection_config_id INTEGER,           -- 检测配置ID (可为NULL表示临时检测)
        column_name TEXT,                      -- 检测的列名
        detection_method TEXT NOT NULL,        -- 使用的检测方法
        name TEXT,                             -- 用户自定义名称 (默认为 方法-时间)
        outlier_indices TEXT,                  -- 异常值行索引 (JSON数组格式)
        outlier_count INTEGER DEFAULT 0,       -- 异常值数量
        total_rows INTEGER DEFAULT 0,          -- 总行数
        outlier_rate REAL DEFAULT 0,           -- 异常率 (0~1)
        detection_params TEXT,                 -- 实际使用的检测参数 (JSON格式)
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 执行时间
        status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'APPLIED', 'REVERTED')),  -- 状态 (PENDING=待执行/RUNNING=执行中/COMPLETED=已完成/FAILED=失败/APPLIED=已应用/REVERTED=已撤销)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0               -- 软删除标记
        -- 外键约束在业务层处理: version_id -> biz_dataset_version.id, detection_config_id -> conf_outlier_detection.id
      );
    `);

    // 为已存在的表添加 name 列（如果不存在）
    try {
      this.db.exec(`ALTER TABLE biz_outlier_result ADD COLUMN name TEXT;`);
    } catch (e) {
      // 列已存在，忽略错误
    }
    try {
      this.db.exec(`ALTER TABLE biz_outlier_result ADD COLUMN sort_order INTEGER DEFAULT 0;`);
    } catch (e) {
      // 列已存在，忽略错误
    }

    // 异常值详情表 (biz_outlier_detail)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_outlier_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 详情唯一标识
        result_id INTEGER NOT NULL,            -- 所属检测结果ID
        column_name TEXT,                      -- 列名
        row_index INTEGER NOT NULL,            -- 行索引 (从0开始)
        original_value REAL,                   -- 原始值
        outlier_type TEXT,                     -- 异常类型 (如 HIGH=超上限/LOW=超下限)
        threshold_value REAL,                  -- 触发的阈值
        action TEXT DEFAULT 'FLAGGED' CHECK(action IN ('FLAGGED', 'REMOVED', 'REPLACED')),  -- 处理动作 (FLAGGED=仅标记/REMOVED=已删除/REPLACED=已替换)
        replaced_value REAL,                   -- 替换后的值 (仅action=REPLACED时有效)
        is_confirmed BOOLEAN DEFAULT 0,        -- 是否已人工确认 (0=未确认, 1=已确认)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0               -- 软删除标记
        -- 外键约束在业务层处理: result_id -> biz_outlier_result.id
      );
    `);

    // 异常检测列统计表 (biz_outlier_column_stat)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_outlier_column_stat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 统计唯一标识
        result_id INTEGER NOT NULL,            -- 所属检测结果ID
        column_name TEXT NOT NULL,             -- 列名
        outlier_count INTEGER DEFAULT 0,       -- 异常值数量
        min_threshold REAL,                    -- 最小阈值
        max_threshold REAL,                    -- 最大阈值
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0               -- 软删除标记
      );
    `);

    // 用户自定义阈值模板表 (conf_threshold_template)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_threshold_template (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,  -- 模板唯一标识
        name              TEXT NOT NULL,                      -- 模板名称
        description       TEXT,                               -- 模板描述（可选）
        template_data     TEXT NOT NULL,                      -- 模板数据 (JSON格式)
        source_dataset_id INTEGER,                            -- 来源数据集ID（仅记录来源，可为NULL）
        is_builtin        INTEGER DEFAULT 0,                  -- 是否内置模板 (0=用户, 1=内置)
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP, -- 更新时间
        deleted_at        DATETIME,                           -- 删除时间
        is_del            BOOLEAN DEFAULT 0                   -- 软删除标记
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
        
      CREATE INDEX IF NOT EXISTS idx_outlier_column_stat_result 
        ON biz_outlier_column_stat(result_id);

      CREATE INDEX IF NOT EXISTS idx_threshold_template_name
        ON conf_threshold_template(name);
    `);
  }

  /**
   * 初始化系统设置表结构
   */
  private initSystemSettingsTables(): void {
    if (!this.db) return;

    // 系统设置表 (sys_settings)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sys_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 设置唯一标识
        setting_key TEXT NOT NULL UNIQUE,      -- 设置键名
        setting_value TEXT,                    -- 设置值 (JSON格式存储复杂值)
        setting_type TEXT DEFAULT 'string',    -- 值类型 (string/number/boolean/json)
        description TEXT,                      -- 设置描述
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP   -- 更新时间
      );
    `);

    // 插入默认设置（如果不存在）
    const defaultSettings = [
      { key: "timezone", value: "UTC+8", type: "string", description: "系统时区设置，用于解析无时区的时间字符串" },
      { key: "dateFormat", value: "YYYY-MM-DD HH:mm", type: "string", description: "日期时间显示格式" },
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO sys_settings (setting_key, setting_value, setting_type, description)
      VALUES (?, ?, ?, ?)
    `);

    for (const setting of defaultSettings) {
      insertStmt.run(setting.key, setting.value, setting.type, setting.description);
    }
  }

  /**
   * 初始化外部数据源相关表结构
   */
  private initExternalDataSourceTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_db_connection_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_name TEXT NOT NULL,
        db_type TEXT NOT NULL CHECK(db_type IN ('MYSQL')),
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        password TEXT,
        database_name TEXT NOT NULL,
        is_default BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS conf_beon_site_rule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_code TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        rule_type TEXT NOT NULL CHECK(rule_type IN ('fallback_query', 'local_override')),
        connection_profile_id INTEGER,
        source_table TEXT,
        match_time_column TEXT DEFAULT 'record_time',
        priority INTEGER DEFAULT 0,
        rule_config TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        is_builtin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0,
        FOREIGN KEY (connection_profile_id) REFERENCES conf_db_connection_profile(id)
      );

      CREATE INDEX IF NOT EXISTS idx_db_connection_profile_name
        ON conf_db_connection_profile(profile_name, is_del);

      CREATE INDEX IF NOT EXISTS idx_db_connection_profile_default
        ON conf_db_connection_profile(is_default, is_del);

      CREATE INDEX IF NOT EXISTS idx_beon_site_rule_site
        ON conf_beon_site_rule(site_code, is_active, is_del);

      CREATE INDEX IF NOT EXISTS idx_beon_site_rule_type
        ON conf_beon_site_rule(rule_type, is_active, is_del);
    `);
  }

  /**
   * 初始化缺失值插补相关表结构
   */
  private initImputationTables(): void {
    if (!this.db) return;

    // 插补方法配置表 (conf_imputation_method)
    // 存储可用的插补方法及其基本信息
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_imputation_method (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 方法唯一标识
        method_id TEXT NOT NULL UNIQUE,        -- 方法标识符 (如 MEAN/LINEAR/KNN)
        method_name TEXT NOT NULL,             -- 方法显示名称
        category TEXT NOT NULL CHECK(category IN ('basic', 'statistical', 'timeseries', 'ml', 'dl')),  -- 方法分类
        description TEXT,                      -- 方法描述
        requires_python BOOLEAN DEFAULT 0,     -- 是否需要Python环境
        is_available BOOLEAN DEFAULT 1,        -- 是否可用
        estimated_time TEXT CHECK(estimated_time IN ('fast', 'medium', 'slow')),  -- 预估耗时
        accuracy TEXT CHECK(accuracy IN ('low', 'medium', 'high')),  -- 准确度等级
        priority INTEGER DEFAULT 0,            -- 显示优先级
        applicable_data_types TEXT,            -- 适用数据类型 (JSON数组)
        icon TEXT,                             -- 方法图标
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_del BOOLEAN DEFAULT 0
      );
    `);

    // 插补方法参数定义表 (conf_imputation_method_params)
    // 存储每个方法的参数配置信息，支持动态参数管理
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_imputation_method_params (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 参数唯一标识
        method_id TEXT NOT NULL,               -- 所属方法ID
        param_key TEXT NOT NULL,               -- 参数键名
        param_name TEXT NOT NULL,              -- 参数显示名称
        param_type TEXT NOT NULL CHECK(param_type IN ('number', 'select', 'boolean', 'range', 'string')),  -- 参数类型
        default_value TEXT,                    -- 默认值
        min_value REAL,                        -- 数值类型最小值
        max_value REAL,                        -- 数值类型最大值
        step_value REAL,                       -- 数值类型步长
        options TEXT,                          -- 选择项配置 (JSON格式)
        tooltip TEXT,                          -- 参数提示信息
        is_required BOOLEAN DEFAULT 0,         -- 是否必需参数
        is_advanced BOOLEAN DEFAULT 0,         -- 是否为高级参数
        param_order INTEGER DEFAULT 0,         -- 参数显示顺序
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_del BOOLEAN DEFAULT 0,
        FOREIGN KEY (method_id) REFERENCES conf_imputation_method(method_id) ON DELETE CASCADE
      );
    `);

    // 插补结果表 (biz_imputation_result)
    // 存储每次插补操作的结果信息
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_imputation_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 结果唯一标识
        dataset_id INTEGER NOT NULL,           -- 数据集ID
        version_id INTEGER NOT NULL,           -- 原始数据版本ID
        new_version_id INTEGER,                -- 插补后生成的新版本ID
        method_id TEXT NOT NULL,               -- 使用的插补方法
        target_columns TEXT NOT NULL,          -- 目标列 (JSON数组)
        method_params TEXT,                    -- 实际使用的方法参数 (JSON)
        output_file_path TEXT,                 -- 完整输出结果文件路径（用于保留新增列）
        total_missing INTEGER DEFAULT 0,       -- 缺失值总数
        imputed_count INTEGER DEFAULT 0,       -- 成功插补数量
        imputation_rate REAL DEFAULT 0,        -- 插补率 (0~1)
        execution_time_ms INTEGER,             -- 执行耗时(毫秒)
        status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'APPLIED', 'REVERTED')),
        error_message TEXT,                    -- 错误信息
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0
      );
    `);

    // 插补列统计表 (biz_imputation_column_stat)
    // 存储每列的插补统计信息
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_imputation_column_stat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 统计唯一标识
        result_id INTEGER NOT NULL,            -- 所属插补结果ID
        column_name TEXT NOT NULL,             -- 列名
        missing_count INTEGER DEFAULT 0,       -- 缺失值数量
        imputed_count INTEGER DEFAULT 0,       -- 插补数量
        imputation_rate REAL DEFAULT 0,        -- 插补率
        mean_before REAL,                      -- 插补前均值
        mean_after REAL,                       -- 插补后均值
        std_before REAL,                       -- 插补前标准差
        std_after REAL,                        -- 插补后标准差
        min_imputed REAL,                      -- 插补值最小值
        max_imputed REAL,                      -- 插补值最大值
        avg_confidence REAL,                   -- 平均置信度
        imputed_row_indices TEXT,              -- 插补点行索引 (JSON数组)
        imputed_values TEXT,                   -- 插补点数值 (JSON数组)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_del BOOLEAN DEFAULT 0
      );
    `);

    // 为已有数据库添加新字段（如果不存在）
    try {
      this.db.exec(`ALTER TABLE biz_imputation_column_stat ADD COLUMN imputed_row_indices TEXT`);
    } catch (e) {
      /* 字段已存在 */
    }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_column_stat ADD COLUMN imputed_values TEXT`);
    } catch (e) {
      /* 字段已存在 */
    }
    // 为 biz_imputation_result 添加 name 和 sort_order 列
    try {
      this.db.exec(`ALTER TABLE biz_imputation_result ADD COLUMN name TEXT;`);
    } catch (e) {
      /* 列已存在 */
    }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_result ADD COLUMN sort_order INTEGER DEFAULT 0;`);
    } catch (e) {
      /* 列已存在 */
    }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_result ADD COLUMN output_file_path TEXT;`);
    } catch (e) {
      /* 列已存在 */
    }

    // 插补模型表 (biz_imputation_model)
    // 存储训练好的模型信息 (用于ML/DL方法)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_imputation_model (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 模型唯一标识
        dataset_id INTEGER,                    -- 数据集ID (可为空，表示通用模型)
        method_id TEXT NOT NULL,               -- 插补方法
        model_name TEXT,                       -- 模型名称
        model_path TEXT,                       -- 模型文件路径
        model_params TEXT,                     -- 模型超参数 (JSON)
        target_column TEXT,                    -- 目标插补列名
        feature_columns TEXT,                  -- 模型需要的特征列 (JSON数组，包含目标列)
        time_column TEXT DEFAULT 'record_time', -- 模型期望的时间列名
        column_mapping TEXT,                   -- 列名映射 (JSON对象: {用户列名: 模型期望列名})
        training_columns TEXT,                 -- 训练使用的列 (JSON数组，兼容旧字段)
        training_samples INTEGER,              -- 训练样本数
        validation_score REAL,                 -- 验证分数
        is_active BOOLEAN DEFAULT 1,           -- 是否激活
        trained_at DATETIME,                   -- 训练时间
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0
      );
    `);

    // 为旧表添加新字段（如果不存在）
    try {
      this.db.exec(`ALTER TABLE biz_imputation_model ADD COLUMN target_column TEXT`);
    } catch (e) {
      /* 字段已存在 */
    }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_model ADD COLUMN feature_columns TEXT`);
    } catch (e) {
      /* 字段已存在 */
    }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_model ADD COLUMN time_column TEXT DEFAULT 'record_time'`);
    } catch (e) {
      /* 字段已存在 */
    }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_model ADD COLUMN column_mapping TEXT`);
    } catch (e) {
      /* 字段已存在 */
    }

    // 创建索引以提升查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_imputation_result_dataset
        ON biz_imputation_result(dataset_id, version_id);

      CREATE INDEX IF NOT EXISTS idx_imputation_result_status
        ON biz_imputation_result(status);

      CREATE INDEX IF NOT EXISTS idx_imputation_column_stat_result
        ON biz_imputation_column_stat(result_id);

      CREATE INDEX IF NOT EXISTS idx_imputation_model_dataset
        ON biz_imputation_model(dataset_id, method_id);

      CREATE INDEX IF NOT EXISTS idx_imputation_method_category
        ON conf_imputation_method(category, priority);

      CREATE INDEX IF NOT EXISTS idx_imputation_method_params_method
        ON conf_imputation_method_params(method_id, param_order);
    `);

    // 插入默认的插补方法配置
    this.insertDefaultImputationMethods();
  }

  /**
   * 初始化通量分割相关表结构
   */
  private initFluxPartitioningTables(): void {
    if (!this.db) return;

    // 通量分割结果表 (biz_flux_partitioning_result)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_flux_partitioning_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        version_id INTEGER NOT NULL,
        new_version_id INTEGER,
        method_id TEXT NOT NULL,
        method_name TEXT NOT NULL,
        column_mapping TEXT NOT NULL,
        site_info TEXT NOT NULL,
        options TEXT,
        output_columns TEXT,
        gpp_stats TEXT,
        reco_stats TEXT,
        execution_time_ms INTEGER,
        status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'APPLIED')),
        error_message TEXT,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_flux_partitioning_result_dataset
        ON biz_flux_partitioning_result(dataset_id, version_id);
      CREATE INDEX IF NOT EXISTS idx_flux_partitioning_result_status
        ON biz_flux_partitioning_result(status);
    `);
    // 为 biz_flux_partitioning_result 添加 name 和 sort_order 列
    try {
      this.db.exec(`ALTER TABLE biz_flux_partitioning_result ADD COLUMN name TEXT;`);
    } catch (e) {
      /* 列已存在 */
    }
    try {
      this.db.exec(`ALTER TABLE biz_flux_partitioning_result ADD COLUMN sort_order INTEGER DEFAULT 0;`);
    } catch (e) {
      /* 列已存在 */
    }
  }

  /**
   * 初始化自动化工作流相关表结构
   */
  private initWorkflowTables(): void {
    if (!this.db) return;

    // 工作流定义表 (biz_workflow) — v2.0: dataset_id 和 initial_version_id 改为可空
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_workflow (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT    NOT NULL,
        description         TEXT,
        dataset_id          INTEGER,
        initial_version_id  INTEGER,
        status              TEXT    NOT NULL DEFAULT 'DRAFT'
                              CHECK(status IN ('DRAFT', 'READY', 'RUNNING', 'COMPLETED', 'FAILED')),
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at          DATETIME,
        is_del              BOOLEAN  DEFAULT 0
      );
    `);

    // 工作流节点表 (biz_workflow_node)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_workflow_node (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id   INTEGER NOT NULL,
        node_order    INTEGER NOT NULL,
        node_type     TEXT    NOT NULL
                        CHECK(node_type IN (
                          'OUTLIER_DETECTION',
                          'IMPUTATION',
                          'FLUX_PARTITIONING',
                          'EXPORT'
                        )),
        node_name     TEXT    NOT NULL,
        config_json   TEXT,
        is_enabled    BOOLEAN DEFAULT 1,
        position_x    REAL,
        position_y    REAL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at    DATETIME,
        is_del        BOOLEAN  DEFAULT 0,
        FOREIGN KEY (workflow_id) REFERENCES biz_workflow(id) ON DELETE CASCADE
      );
    `);

    // 工作流执行记录表 (biz_workflow_execution) — v2.0: 新增 dataset_id 和 initial_version_id
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_workflow_execution (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id         INTEGER NOT NULL,
        dataset_id          INTEGER NOT NULL DEFAULT 0,
        initial_version_id  INTEGER NOT NULL DEFAULT 0,
        status              TEXT    NOT NULL DEFAULT 'PENDING'
                              CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
        started_at          DATETIME,
        finished_at         DATETIME,
        total_nodes         INTEGER DEFAULT 0,
        completed_nodes     INTEGER DEFAULT 0,
        error_message       TEXT,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES biz_workflow(id) ON DELETE CASCADE
      );
    `);

    // 节点执行详情表 (biz_workflow_node_execution)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_workflow_node_execution (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id      INTEGER NOT NULL,
        node_id           INTEGER NOT NULL,
        input_version_id  INTEGER,
        output_version_id INTEGER,
        status            TEXT    NOT NULL DEFAULT 'PENDING'
                            CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),
        started_at        DATETIME,
        finished_at       DATETIME,
        result_json       TEXT,
        error_message     TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES biz_workflow_execution(id) ON DELETE CASCADE,
        FOREIGN KEY (node_id) REFERENCES biz_workflow_node(id),
        FOREIGN KEY (input_version_id) REFERENCES biz_dataset_version(id),
        FOREIGN KEY (output_version_id) REFERENCES biz_dataset_version(id)
      );
    `);

    // 索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workflow_status
        ON biz_workflow(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_node_order
        ON biz_workflow_node(workflow_id, node_order);
      CREATE INDEX IF NOT EXISTS idx_workflow_execution_workflow
        ON biz_workflow_execution(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_execution_status
        ON biz_workflow_execution(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_node_execution_exec
        ON biz_workflow_node_execution(execution_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_node_execution_node
        ON biz_workflow_node_execution(node_id);
    `);

    // v2.0 迁移：为已存在的 biz_workflow_execution 表添加 dataset_id 和 initial_version_id 列
    this.migrateWorkflowTables();
  }

  private migrateWorkflowTables(): void {
    if (!this.db) return;

    // 检查 biz_workflow_execution 是否缺少 dataset_id 列
    const execCols = this.db.prepare(`PRAGMA table_info(biz_workflow_execution)`).all() as any[];
    const hasDatasetId = execCols.some((c: any) => c.name === "dataset_id");
    if (!hasDatasetId) {
      this.db.exec(`ALTER TABLE biz_workflow_execution ADD COLUMN dataset_id INTEGER NOT NULL DEFAULT 0`);
      this.db.exec(`ALTER TABLE biz_workflow_execution ADD COLUMN initial_version_id INTEGER NOT NULL DEFAULT 0`);
    }
    // v2.1 迁移：为执行记录添加自定义标签列
    const hasLabel = execCols.some((c: any) => c.name === "label");
    if (!hasLabel) {
      this.db.exec(`ALTER TABLE biz_workflow_execution ADD COLUMN label TEXT`);
    }

    // 检查 biz_workflow 的 dataset_id 是否为 NOT NULL，如果是则需要重建表
    const wfCols = this.db.prepare(`PRAGMA table_info(biz_workflow)`).all() as any[];
    const datasetCol = wfCols.find((c: any) => c.name === "dataset_id");
    if (datasetCol && datasetCol.notnull === 1) {
      this.db.exec(`
        CREATE TABLE biz_workflow_new (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          name                TEXT    NOT NULL,
          description         TEXT,
          dataset_id          INTEGER,
          initial_version_id  INTEGER,
          status              TEXT    NOT NULL DEFAULT 'DRAFT'
                                CHECK(status IN ('DRAFT', 'READY', 'RUNNING', 'COMPLETED', 'FAILED')),
          created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_at          DATETIME,
          is_del              BOOLEAN  DEFAULT 0
        );
        INSERT INTO biz_workflow_new SELECT * FROM biz_workflow;
        DROP TABLE biz_workflow;
        ALTER TABLE biz_workflow_new RENAME TO biz_workflow;
      `);
    }
  }

  /**
   * 插入默认的插补方法配置和参数定义
   */
  private insertDefaultImputationMethods(): void {
    if (!this.db) return;

    const defaultMethods = [
      // 基础方法
      {
        method_id: "MEAN",
        method_name: "均值填充",
        category: "basic",
        description: "使用列均值填充缺失值",
        requires_python: 0,
        estimated_time: "fast",
        accuracy: "low",
        priority: 100,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "📊",
      },
      {
        method_id: "MEDIAN",
        method_name: "中位数填充",
        category: "basic",
        description: "使用列中位数填充缺失值",
        requires_python: 0,
        estimated_time: "fast",
        accuracy: "low",
        priority: 99,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "📊",
      },
      {
        method_id: "MODE",
        method_name: "众数填充",
        category: "basic",
        description: "使用列众数填充缺失值",
        requires_python: 0,
        estimated_time: "fast",
        accuracy: "low",
        priority: 98,
        applicable_data_types: JSON.stringify(["numeric", "string"]),
        icon: "📊",
      },
      {
        method_id: "FORWARD_FILL",
        method_name: "向前填充",
        category: "basic",
        description: "使用前一个有效值填充",
        requires_python: 0,
        estimated_time: "fast",
        accuracy: "low",
        priority: 97,
        applicable_data_types: JSON.stringify(["numeric", "string"]),
        icon: "⏪",
      },
      {
        method_id: "BACKWARD_FILL",
        method_name: "向后填充",
        category: "basic",
        description: "使用后一个有效值填充",
        requires_python: 0,
        estimated_time: "fast",
        accuracy: "low",
        priority: 96,
        applicable_data_types: JSON.stringify(["numeric", "string"]),
        icon: "⏩",
      },
      // 统计方法
      {
        method_id: "LINEAR",
        method_name: "线性插值",
        category: "statistical",
        description: "基于线性关系进行插值",
        requires_python: 0,
        estimated_time: "fast",
        accuracy: "medium",
        priority: 90,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "📈",
      },
      {
        method_id: "MDS_REDDYPROC",
        method_name: "REddyProc MDS",
        category: "statistical",
        description: "按 REddyProc 通量处理链执行 PAR 预插补、despiking、u* 阈值处理、NEE gap filling 与分割的专业方法",
        requires_python: 1,
        estimated_time: "medium",
        accuracy: "high",
        priority: 85,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "🌿",
      },
      {
        method_id: "SPLINE",
        method_name: "样条插值",
        category: "statistical",
        description: "使用样条曲线进行插值",
        requires_python: 1,
        estimated_time: "fast",
        accuracy: "medium",
        priority: 89,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "📈",
      },
      {
        method_id: "POLYNOMIAL",
        method_name: "多项式插值",
        category: "statistical",
        description: "使用多项式曲线进行插值",
        requires_python: 1,
        estimated_time: "fast",
        accuracy: "medium",
        priority: 88,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "📈",
      },
      // 机器学习方法
      {
        method_id: "XGBOOST",
        method_name: "XGBoost",
        category: "ml",
        description: "基于梯度提升树的高性能插补",
        requires_python: 1,
        estimated_time: "slow",
        accuracy: "high",
        priority: 69,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "🤖",
      },
      {
        method_id: "RANDOM_FOREST",
        method_name: "随机森林",
        category: "ml",
        description: "基于随机森林回归模型的稳健插补",
        requires_python: 1,
        estimated_time: "slow",
        accuracy: "high",
        priority: 68,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "🤖",
      },
      // 深度学习方法
      {
        method_id: "ITRANSFORMER",
        method_name: "iTransformer",
        category: "dl",
        description: "基于倒置Transformer的时序插补模型，将变量作为token处理，擅长捕获多变量间依赖关系",
        requires_python: 1,
        estimated_time: "slow",
        accuracy: "high",
        priority: 65,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "🧠",
      },
      {
        method_id: "SAITS",
        method_name: "SAITS",
        category: "dl",
        description: "自注意力时序插补模型，联合优化观测值重建和缺失值插补",
        requires_python: 1,
        estimated_time: "slow",
        accuracy: "high",
        priority: 64,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "🧠",
      },
      {
        method_id: "TIMEMIXER",
        method_name: "TimeMixer",
        category: "dl",
        description: "基于多尺度时序混合的插补模型，支持多变量时序数据",
        requires_python: 1,
        estimated_time: "slow",
        accuracy: "high",
        priority: 62,
        applicable_data_types: JSON.stringify(["numeric"]),
        icon: "🧠",
      },
    ];

    // 插入方法
    const insertMethodStmt = this.db.prepare(`
      INSERT INTO conf_imputation_method
        (method_id, method_name, category, description, requires_python, estimated_time, accuracy, priority, applicable_data_types, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(method_id) DO UPDATE SET
        method_name = excluded.method_name,
        category = excluded.category,
        description = excluded.description,
        requires_python = excluded.requires_python,
        estimated_time = excluded.estimated_time,
        accuracy = excluded.accuracy,
        priority = excluded.priority,
        applicable_data_types = excluded.applicable_data_types,
        icon = excluded.icon,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const method of defaultMethods) {
      insertMethodStmt.run(
        method.method_id,
        method.method_name,
        method.category,
        method.description,
        method.requires_python,
        method.estimated_time,
        method.accuracy,
        method.priority,
        method.applicable_data_types,
        method.icon
      );
    }

    this.cleanupObsoleteImputationMethods(defaultMethods.map(method => method.method_id));

    // 插入方法参数定义
    this.insertDefaultMethodParams();
    this.seedBuiltinMachineLearningModels();
    this.seedBuiltinSAITSModels();
    this.seedBuiltinITransformerModels();
    this.seedBuiltinTimeMixerModels();
  }

  private cleanupObsoleteImputationMethods(activeMethodIds: string[]): void {
    if (!this.db) return;

    const activeSet = new Set(activeMethodIds);
    const obsoleteMethodIds = (
      this.db
        .prepare("SELECT method_id FROM conf_imputation_method WHERE method_id NOT LIKE 'CUSTOM_%'")
        .all() as Array<{ method_id: string }>
    )
      .map(row => row.method_id)
      .filter(methodId => !activeSet.has(methodId));

    if (obsoleteMethodIds.length === 0) return;

    const deleteParamsStmt = this.db.prepare("DELETE FROM conf_imputation_method_params WHERE method_id = ?");
    const deleteMethodStmt = this.db.prepare("DELETE FROM conf_imputation_method WHERE method_id = ?");

    for (const methodId of obsoleteMethodIds) {
      deleteParamsStmt.run(methodId);
      deleteMethodStmt.run(methodId);
    }
  }

  /**
   * 插入默认的方法参数定义
   */
  private insertDefaultMethodParams(): void {
    if (!this.db) return;

    const defaultParams = [
      // XGBoost 参数
      {
        method_id: "XGBOOST",
        param_key: "n_estimators",
        param_name: "树的数量",
        param_type: "number",
        default_value: "100",
        min_value: 10,
        max_value: 500,
        step_value: 10,
        tooltip: "梯度提升轮数",
        is_required: true,
        is_advanced: false,
        param_order: 1,
      },
      {
        method_id: "XGBOOST",
        param_key: "max_depth",
        param_name: "最大深度",
        param_type: "number",
        default_value: "6",
        min_value: 1,
        max_value: 20,
        step_value: 1,
        tooltip: "树的最大深度",
        is_required: false,
        is_advanced: true,
        param_order: 2,
      },
      {
        method_id: "XGBOOST",
        param_key: "learning_rate",
        param_name: "学习率",
        param_type: "number",
        default_value: "0.1",
        min_value: 0.01,
        max_value: 1.0,
        step_value: 0.01,
        tooltip: "每步的收缩系数，越小越需要更多轮数",
        is_required: false,
        is_advanced: true,
        param_order: 3,
      },

      // 随机森林参数
      {
        method_id: "RANDOM_FOREST",
        param_key: "n_estimators",
        param_name: "树的数量",
        param_type: "number",
        default_value: "100",
        min_value: 10,
        max_value: 500,
        step_value: 10,
        tooltip: "随机森林中决策树的数量",
        is_required: false,
        is_advanced: false,
        param_order: 1,
      },
      {
        method_id: "RANDOM_FOREST",
        param_key: "max_depth",
        param_name: "最大深度",
        param_type: "number",
        default_value: "10",
        min_value: 1,
        max_value: 50,
        step_value: 1,
        tooltip: "单棵树的最大深度",
        is_required: false,
        is_advanced: true,
        param_order: 2,
      },
      {
        method_id: "RANDOM_FOREST",
        param_key: "min_samples_split",
        param_name: "最小分裂样本数",
        param_type: "number",
        default_value: "2",
        min_value: 2,
        max_value: 50,
        step_value: 1,
        tooltip: "内部节点继续分裂所需的最小样本数",
        is_required: false,
        is_advanced: true,
        param_order: 3,
      },
      {
        method_id: "RANDOM_FOREST",
        param_key: "min_samples_leaf",
        param_name: "叶节点最小样本数",
        param_type: "number",
        default_value: "1",
        min_value: 1,
        max_value: 50,
        step_value: 1,
        tooltip: "叶节点保留的最小样本数",
        is_required: false,
        is_advanced: true,
        param_order: 4,
      },

      // 样条插值参数
      {
        method_id: "SPLINE",
        param_key: "degree",
        param_name: "样条度数",
        param_type: "select",
        default_value: "3",
        options: JSON.stringify([
          { label: "线性 (1阶)", value: "1" },
          { label: "二次 (2阶)", value: "2" },
          { label: "三次 (3阶)", value: "3" },
        ]),
        tooltip: "样条曲线的度数，影响插值平滑度",
        is_required: true,
        is_advanced: false,
        param_order: 1,
      },

      // 多项式插值参数
      {
        method_id: "POLYNOMIAL",
        param_key: "degree",
        param_name: "多项式度数",
        param_type: "number",
        default_value: "2",
        min_value: 1,
        max_value: 5,
        step_value: 1,
        tooltip: "多项式的度数，度数越高拟合越精确但可能过拟合",
        is_required: true,
        is_advanced: false,
        param_order: 1,
      },

      // REddyProc MDS 参数 - 位置信息
      {
        method_id: "MDS_REDDYPROC",
        param_key: "lat_deg",
        param_name: "纬度 (°)",
        param_type: "number",
        default_value: "39.0",
        min_value: -90,
        max_value: 90,
        step_value: 0.01,
        tooltip: "站点纬度，范围 -90 到 90",
        is_required: true,
        is_advanced: false,
        param_order: 1,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "long_deg",
        param_name: "经度 (°)",
        param_type: "number",
        default_value: "116.0",
        min_value: -180,
        max_value: 180,
        step_value: 0.01,
        tooltip: "站点经度，范围 -180 到 180",
        is_required: true,
        is_advanced: false,
        param_order: 2,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "timezone_hour",
        param_name: "时区 (小时)",
        param_type: "number",
        default_value: "8",
        min_value: -12,
        max_value: 14,
        step_value: 1,
        tooltip: "站点时区，相对于UTC的小时偏移",
        is_required: true,
        is_advanced: false,
        param_order: 3,
      },
      // REddyProc MDS 参数 - 气象变量列映射
      {
        method_id: "MDS_REDDYPROC",
        param_key: "rg_col",
        param_name: "全球辐射列 (Rg)",
        param_type: "string",
        default_value: "Rg",
        tooltip: "原项目流程必需列。全球辐射列名，单位 W/m²",
        is_required: true,
        is_advanced: false,
        param_order: 4,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "tair_col",
        param_name: "气温列 (Tair)",
        param_type: "string",
        default_value: "Tair",
        tooltip: "原项目流程必需列。气温列名，单位 °C",
        is_required: true,
        is_advanced: false,
        param_order: 5,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "rh_col",
        param_name: "相对湿度列 (rH)",
        param_type: "string",
        default_value: "rH",
        tooltip: "原项目流程必需列。相对湿度列名，单位 %",
        is_required: true,
        is_advanced: false,
        param_order: 6,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "par_col",
        param_name: "PAR列",
        param_type: "string",
        default_value: "Par",
        tooltip: "原项目流程必需列。用于 PAR 预插补和 despiking 的光合有效辐射列",
        is_required: true,
        is_advanced: false,
        param_order: 7,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "nee_col",
        param_name: "NEE列",
        param_type: "string",
        default_value: "NEE",
        tooltip: "原项目流程必需列。用于 u* 阈值处理、NEE gap filling 和分割",
        is_required: true,
        is_advanced: false,
        param_order: 8,
      },
      // REddyProc MDS 参数 - 高级选项
      {
        method_id: "MDS_REDDYPROC",
        param_key: "ustar_col",
        param_name: "摩擦速度列 (Ustar)",
        param_type: "string",
        default_value: "Ustar",
        tooltip: "原项目流程必需列。用于 u* 阈值处理",
        is_required: true,
        is_advanced: false,
        param_order: 9,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "vpd_col",
        param_name: "VPD列",
        param_type: "string",
        default_value: "",
        tooltip: "辅助列，可为空。为空时按原项目逻辑由 rH 和 Tair 重新计算 VPD",
        is_required: false,
        is_advanced: false,
        param_order: 10,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "h2o_col",
        param_name: "H2O列",
        param_type: "string",
        default_value: "",
        tooltip: "可选 companion 通量列。填写后参与原项目同款 H2O gap filling",
        is_required: false,
        is_advanced: false,
        param_order: 11,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "le_col",
        param_name: "LE列",
        param_type: "string",
        default_value: "",
        tooltip: "可选 companion 通量列。填写后参与原项目同款 LE gap filling",
        is_required: false,
        is_advanced: false,
        param_order: 12,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "h_col",
        param_name: "H列",
        param_type: "string",
        default_value: "",
        tooltip: "可选 companion 通量列。填写后参与原项目同款 H gap filling",
        is_required: false,
        is_advanced: false,
        param_order: 13,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "despiking_z",
        param_name: "Despiking阈值",
        param_type: "number",
        default_value: "4",
        min_value: 1,
        max_value: 10,
        step_value: 1,
        tooltip: "原项目默认值为 4。用于 MAD despiking 阈值",
        is_required: false,
        is_advanced: true,
        param_order: 14,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "fill_all",
        param_name: "填充所有值",
        param_type: "boolean",
        default_value: "true",
        tooltip: "保留为数据库参数。当前原项目链路默认在关键阶段执行 FillAll=TRUE",
        is_required: false,
        is_advanced: true,
        param_order: 15,
      },
      {
        method_id: "MDS_REDDYPROC",
        param_key: "ustar_filtering",
        param_name: "启用u*过滤",
        param_type: "boolean",
        default_value: "true",
        tooltip: "保留为数据库参数。当前原项目链路默认启用 u* 阈值处理",
        is_required: false,
        is_advanced: true,
        param_order: 16,
      },

      // iTransformer 参数
      {
        method_id: "ITRANSFORMER",
        param_key: "seq_len",
        param_name: "序列长度",
        param_type: "number",
        default_value: "96",
        min_value: 24,
        max_value: 512,
        step_value: 24,
        tooltip: "滑动窗口长度",
        is_required: true,
        is_advanced: false,
        param_order: 1,
      },
      {
        method_id: "ITRANSFORMER",
        param_key: "n_layers",
        param_name: "层数",
        param_type: "number",
        default_value: "2",
        min_value: 1,
        max_value: 8,
        step_value: 1,
        tooltip: "模型层数",
        is_required: false,
        is_advanced: true,
        param_order: 2,
      },
      {
        method_id: "ITRANSFORMER",
        param_key: "d_model",
        param_name: "隐藏层维度",
        param_type: "number",
        default_value: "64",
        min_value: 16,
        max_value: 256,
        step_value: 16,
        tooltip: "隐藏层特征维度",
        is_required: false,
        is_advanced: true,
        param_order: 3,
      },
      {
        method_id: "ITRANSFORMER",
        param_key: "n_heads",
        param_name: "注意力头数",
        param_type: "number",
        default_value: "4",
        min_value: 1,
        max_value: 16,
        step_value: 1,
        tooltip: "Multi-head Attention 的头数",
        is_required: false,
        is_advanced: true,
        param_order: 4,
      },
      {
        method_id: "ITRANSFORMER",
        param_key: "d_ffn",
        param_name: "FFN维度",
        param_type: "number",
        default_value: "128",
        min_value: 32,
        max_value: 512,
        step_value: 32,
        tooltip: "前馈网络维度",
        is_required: false,
        is_advanced: true,
        param_order: 5,
      },
      {
        method_id: "ITRANSFORMER",
        param_key: "dropout",
        param_name: "Dropout率",
        param_type: "number",
        default_value: "0.1",
        min_value: 0,
        max_value: 0.5,
        step_value: 0.05,
        tooltip: "Dropout 比率",
        is_required: false,
        is_advanced: true,
        param_order: 6,
      },
      {
        method_id: "ITRANSFORMER",
        param_key: "epochs",
        param_name: "训练轮数",
        param_type: "number",
        default_value: "100",
        min_value: 10,
        max_value: 500,
        step_value: 10,
        tooltip: "训练轮数",
        is_required: false,
        is_advanced: true,
        param_order: 7,
      },
      {
        method_id: "ITRANSFORMER",
        param_key: "batch_size",
        param_name: "批次大小",
        param_type: "number",
        default_value: "32",
        min_value: 8,
        max_value: 256,
        step_value: 8,
        tooltip: "每批次训练样本数",
        is_required: false,
        is_advanced: true,
        param_order: 8,
      },

      // SAITS 参数
      {
        method_id: "SAITS",
        param_key: "seq_len",
        param_name: "序列长度",
        param_type: "number",
        default_value: "96",
        min_value: 24,
        max_value: 512,
        step_value: 24,
        tooltip: "滑动窗口长度",
        is_required: true,
        is_advanced: false,
        param_order: 1,
      },
      {
        method_id: "SAITS",
        param_key: "n_layers",
        param_name: "层数",
        param_type: "number",
        default_value: "2",
        min_value: 1,
        max_value: 8,
        step_value: 1,
        tooltip: "模型层数",
        is_required: false,
        is_advanced: true,
        param_order: 2,
      },
      {
        method_id: "SAITS",
        param_key: "d_model",
        param_name: "隐藏层维度",
        param_type: "number",
        default_value: "64",
        min_value: 16,
        max_value: 256,
        step_value: 16,
        tooltip: "隐藏层特征维度",
        is_required: false,
        is_advanced: true,
        param_order: 3,
      },
      {
        method_id: "SAITS",
        param_key: "n_heads",
        param_name: "注意力头数",
        param_type: "number",
        default_value: "4",
        min_value: 1,
        max_value: 16,
        step_value: 1,
        tooltip: "Multi-head Attention 的头数",
        is_required: false,
        is_advanced: true,
        param_order: 4,
      },
      {
        method_id: "SAITS",
        param_key: "d_ffn",
        param_name: "FFN维度",
        param_type: "number",
        default_value: "128",
        min_value: 32,
        max_value: 512,
        step_value: 32,
        tooltip: "前馈网络维度",
        is_required: false,
        is_advanced: true,
        param_order: 5,
      },
      {
        method_id: "SAITS",
        param_key: "dropout",
        param_name: "Dropout率",
        param_type: "number",
        default_value: "0.1",
        min_value: 0,
        max_value: 0.5,
        step_value: 0.05,
        tooltip: "Dropout 比率",
        is_required: false,
        is_advanced: true,
        param_order: 6,
      },
      {
        method_id: "SAITS",
        param_key: "epochs",
        param_name: "训练轮数",
        param_type: "number",
        default_value: "100",
        min_value: 10,
        max_value: 500,
        step_value: 10,
        tooltip: "训练轮数",
        is_required: false,
        is_advanced: true,
        param_order: 7,
      },
      {
        method_id: "SAITS",
        param_key: "batch_size",
        param_name: "批次大小",
        param_type: "number",
        default_value: "32",
        min_value: 8,
        max_value: 256,
        step_value: 8,
        tooltip: "每批次训练样本数",
        is_required: false,
        is_advanced: true,
        param_order: 8,
      },

      // TimeMixer 参数
      {
        method_id: "TIMEMIXER",
        param_key: "seq_len",
        param_name: "序列长度",
        param_type: "number",
        default_value: "96",
        min_value: 24,
        max_value: 512,
        step_value: 24,
        tooltip: "滑动窗口长度",
        is_required: true,
        is_advanced: false,
        param_order: 1,
      },
      {
        method_id: "TIMEMIXER",
        param_key: "n_layers",
        param_name: "层数",
        param_type: "number",
        default_value: "2",
        min_value: 1,
        max_value: 8,
        step_value: 1,
        tooltip: "模型层数",
        is_required: false,
        is_advanced: true,
        param_order: 2,
      },
      {
        method_id: "TIMEMIXER",
        param_key: "d_model",
        param_name: "隐藏层维度",
        param_type: "number",
        default_value: "32",
        min_value: 16,
        max_value: 256,
        step_value: 16,
        tooltip: "隐藏层特征维度",
        is_required: false,
        is_advanced: true,
        param_order: 3,
      },
      {
        method_id: "TIMEMIXER",
        param_key: "d_ffn",
        param_name: "FFN维度",
        param_type: "number",
        default_value: "64",
        min_value: 32,
        max_value: 512,
        step_value: 32,
        tooltip: "前馈网络维度",
        is_required: false,
        is_advanced: true,
        param_order: 4,
      },
      {
        method_id: "TIMEMIXER",
        param_key: "top_k",
        param_name: "Top-K频率",
        param_type: "number",
        default_value: "5",
        min_value: 1,
        max_value: 20,
        step_value: 1,
        tooltip: "Top-K 频率成分数量",
        is_required: false,
        is_advanced: true,
        param_order: 5,
      },
      {
        method_id: "TIMEMIXER",
        param_key: "dropout",
        param_name: "Dropout率",
        param_type: "number",
        default_value: "0.1",
        min_value: 0,
        max_value: 0.5,
        step_value: 0.05,
        tooltip: "Dropout 比率",
        is_required: false,
        is_advanced: true,
        param_order: 6,
      },
      {
        method_id: "TIMEMIXER",
        param_key: "epochs",
        param_name: "训练轮数",
        param_type: "number",
        default_value: "100",
        min_value: 10,
        max_value: 500,
        step_value: 10,
        tooltip: "训练轮数",
        is_required: false,
        is_advanced: true,
        param_order: 7,
      },
      {
        method_id: "TIMEMIXER",
        param_key: "batch_size",
        param_name: "批次大小",
        param_type: "number",
        default_value: "32",
        min_value: 8,
        max_value: 256,
        step_value: 8,
        tooltip: "每批次训练样本数",
        is_required: false,
        is_advanced: true,
        param_order: 8,
      },
    ];

    // 清理已有的重复参数数据（保留每组的第一条记录）
    this.db.exec(`
      DELETE FROM conf_imputation_method_params 
      WHERE id NOT IN (
        SELECT MIN(id) FROM conf_imputation_method_params 
        GROUP BY method_id, param_key
      );
    `);

    // 清理后创建唯一索引（防止后续重复插入）
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_method_param_unique 
      ON conf_imputation_method_params(method_id, param_key);
    `);

    const insertParamStmt = this.db.prepare(`
      INSERT INTO conf_imputation_method_params
        (method_id, param_key, param_name, param_type, default_value, min_value, max_value, step_value, options, tooltip, is_required, is_advanced, param_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(method_id, param_key) DO UPDATE SET
        param_name = excluded.param_name,
        param_type = excluded.param_type,
        default_value = excluded.default_value,
        min_value = excluded.min_value,
        max_value = excluded.max_value,
        step_value = excluded.step_value,
        options = excluded.options,
        tooltip = excluded.tooltip,
        is_required = excluded.is_required,
        is_advanced = excluded.is_advanced,
        param_order = excluded.param_order,
        is_del = 0,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const param of defaultParams) {
      insertParamStmt.run(
        param.method_id,
        param.param_key,
        param.param_name,
        param.param_type,
        param.default_value,
        param.min_value || null,
        param.max_value || null,
        param.step_value || null,
        param.options || null,
        param.tooltip || null,
        param.is_required || false ? 1 : 0,
        param.is_advanced || false ? 1 : 0,
        param.param_order
      );
    }
  }

  // 预训练插补模型配置（TIMEMIXER、RANDOM_FOREST、XGBOOST）已直接内置到 qc_metadata.db 中，
  // model_path 使用相对于 pythonDir 的路径（如 "models/XGBOOST/NEE/XGB_model_xxx.pkl"），
  // ImputationService.performCustomModelImputation 会在运行时将相对路径解析为绝对路径。

  private getPythonDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, "python")
      : path.join(__dirname, "..", "..", "..", "python");
  }

  private seedBuiltinMachineLearningModels(): void {
    if (!this.db) return;

    const pythonDir = this.getPythonDir();
    const targetConfigs: Record<
      string,
      {
        targetColumn: string;
        displayName: string;
        featureColumns: string[];
      }
    > = {
      FCH4: {
        targetColumn: "FCH4",
        displayName: "FCH4",
        featureColumns: ["ta_1_2_1", "vpd", "swin", "ws_1_2_1", "par", "rh_1_2_1"],
      },
      NAI: {
        targetColumn: "nai",
        displayName: "NAI",
        featureColumns: ["rh", "vpd", "rg", "ppfd", "ta", "pm2_5", "pm10"],
      },
      NEE: {
        targetColumn: "co2_flux",
        displayName: "NEE",
        featureColumns: ["rg_1_1_2", "rn_1_1_1", "ta_1_2_1", "vpd", "rh_1_1_1", "swc_1_1_1", "ts_1_1_1"],
      },
    };

    const methods = [
      {
        methodId: "XGBOOST",
        displayName: "XGBoost",
        root: path.join(pythonDir, "models", "XGBOOST"),
        filePattern: /^XGB_model_.*\.pkl$/i,
        framework: "xgboost",
      },
      {
        methodId: "RANDOM_FOREST",
        displayName: "随机森林",
        root: path.join(pythonDir, "models"),
        filePattern: /^RF_model_.*\.pkl$/i,
        framework: "sklearn",
      },
    ];

    const toRelativePythonPath = (absolutePath: string): string =>
      path.relative(pythonDir, absolutePath).replace(/\\/g, "/");

    const resolveMissingDays = (fileName: string): number => {
      const match = fileName.match(/masks(\d+)/i);
      return match ? Number(match[1]) : 1;
    };

    const resolveTimestamp = (fileName: string): string | null => {
      const match = fileName.match(/_(\d{8})_(\d{6})\.pkl$/i);
      if (!match) return null;
      const date = match[1];
      const time = match[2];
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
    };

    const findStmt = this.db.prepare(`
      SELECT id FROM biz_imputation_model
      WHERE dataset_id IS NULL AND method_id = ? AND target_column = ? AND model_path = ? AND is_del = 0
      LIMIT 1
    `);

    const insertStmt = this.db.prepare(`
      INSERT INTO biz_imputation_model
        (dataset_id, method_id, model_name, model_path, model_params,
         target_column, feature_columns, time_column, training_columns,
         is_active, trained_at)
      VALUES
        (NULL, ?, ?, ?, ?, ?, ?, 'record_time', ?, 1, COALESCE(?, CURRENT_TIMESTAMP))
    `);

    const updateStmt = this.db.prepare(`
      UPDATE biz_imputation_model
      SET model_name = ?,
          model_params = ?,
          feature_columns = ?,
          training_columns = ?,
          is_active = 1,
          trained_at = COALESCE(?, trained_at),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const method of methods) {
      if (!fs.existsSync(method.root)) continue;

      for (const [targetDir, config] of Object.entries(targetConfigs)) {
        const modelDir = path.join(method.root, targetDir);
        if (!fs.existsSync(modelDir)) continue;

        const modelFiles = fs
          .readdirSync(modelDir)
          .filter(file => method.filePattern.test(file))
          .sort();

        for (const modelFile of modelFiles) {
          const absoluteModelPath = path.join(modelDir, modelFile);
          const modelPath = toRelativePythonPath(absoluteModelPath);
          const missingDays = resolveMissingDays(modelFile);
          const modelParams = {
            model_path: modelPath,
            framework: method.framework,
            missing_days: missingDays,
          };
          const featureColumns = JSON.stringify(config.featureColumns);
          const modelParamsJson = JSON.stringify(modelParams);
          const trainedAt = resolveTimestamp(modelFile);
          const modelName = `${config.displayName} ${method.displayName} 适合缺失${missingDays}天`;
          const existing = findStmt.get(method.methodId, config.targetColumn, modelPath) as { id: number } | undefined;

          if (existing) {
            updateStmt.run(modelName, modelParamsJson, featureColumns, featureColumns, trainedAt, existing.id);
          } else {
            insertStmt.run(
              method.methodId,
              modelName,
              modelPath,
              modelParamsJson,
              config.targetColumn,
              featureColumns,
              featureColumns,
              trainedAt
            );
          }
        }
      }
    }
  }

  private seedBuiltinSAITSModels(): void {
    if (!this.db) return;

    const modelsRoot = path.join(this.getPythonDir(), "models", "SAITS");
    if (!fs.existsSync(modelsRoot)) return;

    const targetConfigs: Record<
      string,
      {
        targetColumn: string;
        displayName: string;
        featureColumns: string[];
      }
    > = {
      FCH4: {
        targetColumn: "FCH4",
        displayName: "FCH4",
        featureColumns: ["ta_1_2_1", "vpd", "swin", "ws_1_2_1", "par", "rh_1_2_1"],
      },
      NAI: {
        targetColumn: "nai",
        displayName: "NAI",
        featureColumns: ["rh", "vpd", "rg", "ppfd", "ta", "pm2_5", "pm10"],
      },
      NEE: {
        targetColumn: "co2_flux",
        displayName: "NEE",
        featureColumns: ["co2_flux", "rg_1_1_2", "rn_1_1_1", "ta_1_2_1", "vpd", "rh_1_1_1", "swc_1_1_1", "ts_1_1_1"],
      },
    };

    const toRelativePythonPath = (absolutePath: string): string =>
      path.relative(this.getPythonDir(), absolutePath).replace(/\\/g, "/");

    const resolveMissingDays = (fileName: string): number => {
      const match = fileName.match(/masks(\d+)/i);
      return match ? Number(match[1]) : 1;
    };

    const resolveSeqLen = (missingDays: number): number => {
      if (missingDays === 1) return 192;
      if (missingDays === 7) return 768;
      if (missingDays === 15) return 1440;
      if (missingDays === 30) return 2880;
      return 192;
    };

    const resolveMetricLabel = (targetColumn: string): string => {
      if (targetColumn === "co2_flux") return "NEE";
      return targetColumn.toUpperCase();
    };

    const findStmt = this.db.prepare(`
      SELECT id FROM biz_imputation_model
      WHERE dataset_id IS NULL AND method_id = 'SAITS' AND target_column = ? AND model_path = ? AND is_del = 0
      LIMIT 1
    `);

    const insertStmt = this.db.prepare(`
      INSERT INTO biz_imputation_model
        (dataset_id, method_id, model_name, model_path, model_params,
         target_column, feature_columns, time_column, training_columns,
         is_active, trained_at)
      VALUES
        (NULL, 'SAITS', ?, ?, ?, ?, ?, 'record_time', ?, 1, CURRENT_TIMESTAMP)
    `);

    const updateStmt = this.db.prepare(`
      UPDATE biz_imputation_model
      SET model_name = ?,
          model_params = ?,
          feature_columns = ?,
          training_columns = ?,
          is_active = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const entry of fs.readdirSync(modelsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const config = targetConfigs[entry.name.toUpperCase()];
      if (!config) continue;

      const modelDir = path.join(modelsRoot, entry.name);
      const modelFiles = fs
        .readdirSync(modelDir)
        .filter(file => file.toLowerCase().endsWith(".pypots"))
        .sort();

      for (const modelFile of modelFiles) {
        const absoluteModelPath = path.join(modelDir, modelFile);
        const metadataFile = modelFile.replace(/\.pypots$/i, "_metadata.joblib");
        const absoluteMetadataPath = path.join(modelDir, metadataFile);
        if (!fs.existsSync(absoluteMetadataPath)) continue;

        const modelPath = toRelativePythonPath(absoluteModelPath);
        const metadataPath = toRelativePythonPath(absoluteMetadataPath);
        const missingDays = resolveMissingDays(modelFile);
        const modelParams = {
          metadata_path: metadataPath,
          framework: "pypots",
          pypots_version: "1.1",
          missing_days: missingDays,
          seq_len: resolveSeqLen(missingDays),
          n_layers: 2,
          d_model: 128,
          n_heads: 8,
          d_k: 16,
          d_v: 16,
          d_ffn: 128,
          dropout: 0.1,
          attn_dropout: 0,
          diagonal_attention_mask: true,
          ort_weight: 1,
          mit_weight: 1,
          batch_size: 32,
          use_gpu: false,
        };
        const featureColumns = JSON.stringify(config.featureColumns);
        const modelParamsJson = JSON.stringify(modelParams);
        const existing = findStmt.get(config.targetColumn, modelPath) as { id: number } | undefined;
        const modelName = `${resolveMetricLabel(config.targetColumn)} 适合缺失${missingDays}天`;

        if (existing) {
          updateStmt.run(modelName, modelParamsJson, featureColumns, featureColumns, existing.id);
        } else {
          insertStmt.run(modelName, modelPath, modelParamsJson, config.targetColumn, featureColumns, featureColumns);
        }
      }
    }
  }

  private seedBuiltinITransformerModels(): void {
    if (!this.db) return;

    const modelsRoot = path.join(this.getPythonDir(), "models", "ITRANSFORMER");
    if (!fs.existsSync(modelsRoot)) return;

    const targetConfigs: Record<
      string,
      {
        targetColumn: string;
        displayName: string;
        featureColumns: string[];
      }
    > = {
      FCH4: {
        targetColumn: "FCH4",
        displayName: "FCH4",
        featureColumns: ["ta_1_2_1", "vpd", "swin", "ws_1_2_1", "par", "rh_1_2_1"],
      },
      NAI: {
        targetColumn: "nai",
        displayName: "NAI",
        featureColumns: ["rh", "vpd", "rg", "ppfd", "ta", "pm2_5", "pm10"],
      },
      "NEE/BEON": {
        targetColumn: "nee",
        displayName: "NEE BEON",
        featureColumns: ["rg_1_1_2", "rn_1_1_1", "ta_1_2_1", "vpd", "rh_1_1_1", "swc_1_1_1", "ts_1_1_1"],
      },
      "NEE/FLUXNET": {
        targetColumn: "co2_flux",
        displayName: "NEE Fluxnet",
        featureColumns: ["rg_1_1_2", "rn_1_1_1", "ta_1_2_1", "vpd", "rh_1_1_1", "swc_1_1_1", "ts_1_1_1"],
      },
    };

    const toRelativePythonPath = (absolutePath: string): string =>
      path.relative(this.getPythonDir(), absolutePath).replace(/\\/g, "/");

    const collectModelFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectModelFiles(fullPath));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pypots")) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const resolveConfig = (absoluteModelPath: string) => {
      const relativeDir = path
        .relative(modelsRoot, path.dirname(absoluteModelPath))
        .replace(/\\/g, "/")
        .toUpperCase();
      return targetConfigs[relativeDir];
    };

    const resolveMissingDays = (fileName: string): number => {
      const match = fileName.match(/masks(\d+)/i);
      return match ? Number(match[1]) : 1;
    };

    const resolveSeqLen = (missingDays: number): number => {
      if (missingDays === 1) return 192;
      if (missingDays === 7) return 768;
      if (missingDays === 15) return 1440;
      if (missingDays === 30) return 2880;
      return 192;
    };

    const resolveDimensions = (
      config: { targetColumn: string },
      missingDays: number
    ): { dModel: number; dFfn: number; dK: number; dV: number } => {
      // FCH4/NAI checkpoints were trained with 128 hidden units for all missing-day classes.
      const usesFixed128 = config.targetColumn === "FCH4" || config.targetColumn === "nai";
      const dModel = usesFixed128 ? 128 : missingDays === 1 ? 128 : missingDays === 7 ? 256 : 512;
      return { dModel, dFfn: dModel, dK: dModel / 8, dV: dModel / 8 };
    };

    const resolveModelLabel = (fileName: string): string => {
      const missingDays = resolveMissingDays(fileName);
      return `适合缺失${missingDays}天`;
    };

    const resolveMetricLabel = (targetColumn: string): string => {
      if (targetColumn === "co2_flux") return "NEE";
      return targetColumn.toUpperCase();
    };

    const resolveTimestamp = (fileName: string): string | null => {
      const match = fileName.match(/_(\d{8})_(\d{6})\.pypots$/i);
      if (!match) return null;
      const date = match[1];
      const time = match[2];
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
    };

    const findStmt = this.db.prepare(`
      SELECT id FROM biz_imputation_model
      WHERE dataset_id IS NULL AND method_id = 'ITRANSFORMER' AND target_column = ? AND model_path = ? AND is_del = 0
      LIMIT 1
    `);

    const insertStmt = this.db.prepare(`
      INSERT INTO biz_imputation_model
        (dataset_id, method_id, model_name, model_path, model_params,
         target_column, feature_columns, time_column, training_columns,
         is_active, trained_at)
      VALUES
        (NULL, 'ITRANSFORMER', ?, ?, ?, ?, ?, 'record_time', ?, 1, COALESCE(?, CURRENT_TIMESTAMP))
    `);

    const updateStmt = this.db.prepare(`
      UPDATE biz_imputation_model
      SET model_name = ?,
          model_params = ?,
          feature_columns = ?,
          training_columns = ?,
          is_active = 1,
          trained_at = COALESCE(?, trained_at),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const absoluteModelPath of collectModelFiles(modelsRoot)) {
      const config = resolveConfig(absoluteModelPath);
      if (!config) continue;

      const metadataFile = absoluteModelPath.replace(/\.pypots$/i, "_metadata.joblib");
      if (!fs.existsSync(metadataFile)) continue;

      const modelPath = toRelativePythonPath(absoluteModelPath);
      const metadataPath = toRelativePythonPath(metadataFile);
      const missingDays = resolveMissingDays(path.basename(absoluteModelPath));
      const dimensions = resolveDimensions(config, missingDays);
      const modelParams = {
        model_path: modelPath,
        metadata_path: metadataPath,
        framework: "pypots",
        pypots_version: "1.1",
        missing_days: missingDays,
        seq_len: resolveSeqLen(missingDays),
        n_layers: 2,
        d_model: dimensions.dModel,
        n_heads: 8,
        d_k: dimensions.dK,
        d_v: dimensions.dV,
        d_ffn: dimensions.dFfn,
        dropout: 0.1,
        attn_dropout: 0,
        ort_weight: 1,
        mit_weight: 1,
        batch_size: 4,
        use_gpu: false,
      };
      const featureColumns = JSON.stringify(config.featureColumns);
      const modelParamsJson = JSON.stringify(modelParams);
      const trainedAt = resolveTimestamp(path.basename(absoluteModelPath));
      const modelName = `${resolveMetricLabel(config.targetColumn)} ${resolveModelLabel(path.basename(absoluteModelPath))}`;
      const existing = findStmt.get(config.targetColumn, modelPath) as { id: number } | undefined;

      if (existing) {
        updateStmt.run(modelName, modelParamsJson, featureColumns, featureColumns, trainedAt, existing.id);
      } else {
        insertStmt.run(
          modelName,
          modelPath,
          modelParamsJson,
          config.targetColumn,
          featureColumns,
          featureColumns,
          trainedAt
        );
      }
    }
  }

  private seedBuiltinTimeMixerModels(): void {
    if (!this.db) return;

    const modelsRoot = path.join(this.getPythonDir(), "models", "TIMEMIXER");
    if (!fs.existsSync(modelsRoot)) return;

    this.db
      .prepare(
        `UPDATE biz_imputation_model
         SET is_del = 1,
             is_active = 0,
             deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE dataset_id IS NULL
           AND method_id = 'TIMEMIXER'
           AND is_del = 0
           AND (
             lower(model_path) GLOB 'models/timemixer/timemixerpp*'
             OR lower(model_path) GLOB 'models/timemixer/timermixerpp*'
           )`
      )
      .run();

    const targetConfigs: Record<
      string,
      {
        targetColumn: string;
        displayName: string;
        featureColumns: string[];
      }
    > = {
      FCH4: {
        targetColumn: "FCH4",
        displayName: "FCH4",
        featureColumns: ["ta_1_2_1", "vpd", "swin", "ws_1_2_1", "par", "rh_1_2_1"],
      },
      NAI: {
        targetColumn: "nai",
        displayName: "NAI",
        featureColumns: ["rh", "vpd", "rg", "ppfd", "ta", "pm2_5", "pm10"],
      },
      "NEE/BEON": {
        targetColumn: "nee",
        displayName: "NEE BEON",
        featureColumns: ["rg_1_1_2", "rn_1_1_1", "ta_1_2_1", "vpd", "rh_1_1_1", "swc_1_1_1", "ts_1_1_1"],
      },
      "NEE/FLUXNET": {
        targetColumn: "co2_flux",
        displayName: "NEE Fluxnet",
        featureColumns: ["rg_1_1_2", "rn_1_1_1", "ta_1_2_1", "vpd", "rh_1_1_1", "swc_1_1_1", "ts_1_1_1"],
      },
    };

    const toRelativePythonPath = (absolutePath: string): string =>
      path.relative(this.getPythonDir(), absolutePath).replace(/\\/g, "/");

    const collectModelFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectModelFiles(fullPath));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pypots")) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const resolveConfig = (absoluteModelPath: string) => {
      const relativeDir = path
        .relative(modelsRoot, path.dirname(absoluteModelPath))
        .replace(/\\/g, "/")
        .toUpperCase();
      return targetConfigs[relativeDir];
    };

    const resolveMissingDays = (fileName: string): number => {
      const match = fileName.match(/masks(\d+)/i);
      return match ? Number(match[1]) : 1;
    };

    const resolveSeqLen = (missingDays: number): number => {
      if (missingDays === 1) return 192;
      if (missingDays === 7) return 672;
      if (missingDays === 15) return 1440;
      if (missingDays === 30) return 2880;
      return 192;
    };

    const resolveModelLabel = (fileName: string): string => {
      const missingDays = resolveMissingDays(fileName);
      return `适合缺失${missingDays}天`;
    };

    const resolveMetricLabel = (targetColumn: string, displayName: string): string => {
      if (targetColumn === "co2_flux" || targetColumn === "nee") return displayName;
      return targetColumn.toUpperCase();
    };

    const resolveTimestamp = (fileName: string): string | null => {
      const match = fileName.match(/_(\d{8})_(\d{6})\.pypots$/i);
      if (!match) return null;
      const date = match[1];
      const time = match[2];
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
    };

    const findStmt = this.db.prepare(`
      SELECT id FROM biz_imputation_model
      WHERE dataset_id IS NULL AND method_id = 'TIMEMIXER' AND target_column = ? AND model_path = ? AND is_del = 0
      LIMIT 1
    `);

    const insertStmt = this.db.prepare(`
      INSERT INTO biz_imputation_model
        (dataset_id, method_id, model_name, model_path, model_params,
         target_column, feature_columns, time_column, training_columns,
         is_active, trained_at)
      VALUES
        (NULL, 'TIMEMIXER', ?, ?, ?, ?, ?, 'record_time', ?, 1, COALESCE(?, CURRENT_TIMESTAMP))
    `);

    const updateStmt = this.db.prepare(`
      UPDATE biz_imputation_model
      SET model_name = ?,
          model_params = ?,
          feature_columns = ?,
          training_columns = ?,
          is_active = 1,
          trained_at = COALESCE(?, trained_at),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const absoluteModelPath of collectModelFiles(modelsRoot)) {
      const config = resolveConfig(absoluteModelPath);
      if (!config) continue;

      const metadataFile = absoluteModelPath.replace(/\.pypots$/i, "_metadata.joblib");
      if (!fs.existsSync(metadataFile)) continue;

      const modelPath = toRelativePythonPath(absoluteModelPath);
      const metadataPath = toRelativePythonPath(metadataFile);
      const missingDays = resolveMissingDays(path.basename(absoluteModelPath));
      const modelParams = {
        model_path: modelPath,
        metadata_path: metadataPath,
        framework: "pypots",
        pypots_version: "1.1",
        missing_days: missingDays,
        seq_len: resolveSeqLen(missingDays),
        n_layers: 3,
        d_model: 16,
        d_ffn: 32,
        top_k: 5,
        dropout: 0.1,
        channel_independence: false,
        decomp_method: "moving_avg",
        moving_avg: 25,
        downsampling_layers: 3,
        downsampling_window: 2,
        apply_nonstationary_norm: false,
        batch_size: 4,
        use_gpu: false,
      };
      const featureColumns = JSON.stringify(config.featureColumns);
      const modelParamsJson = JSON.stringify(modelParams);
      const trainedAt = resolveTimestamp(path.basename(absoluteModelPath));
      const modelName = `${resolveMetricLabel(config.targetColumn, config.displayName)} ${resolveModelLabel(path.basename(absoluteModelPath))}`;
      const existing = findStmt.get(config.targetColumn, modelPath) as { id: number } | undefined;

      if (existing) {
        updateStmt.run(modelName, modelParamsJson, featureColumns, featureColumns, trainedAt, existing.id);
      } else {
        insertStmt.run(
          modelName,
          modelPath,
          modelParamsJson,
          config.targetColumn,
          featureColumns,
          featureColumns,
          trainedAt
        );
      }
    }
  }

  /**
   * 数据库迁移 - 为现有表添加新字段
   */
  private migrateSchema(): void {
    if (!this.db) return;

    // 检查并添加 sys_dataset 表的新字段
    const datasetInfo = this.db.prepare("PRAGMA table_info(sys_dataset)").all() as { name: string }[];

    const datasetColumns = new Set(datasetInfo.map(c => c.name));

    const datasetNewColumns = [
      { name: "time_column", type: "TEXT" },
      { name: "missing_value_types", type: "TEXT" },
    ];

    for (const col of datasetNewColumns) {
      if (!datasetColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE sys_dataset ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 修复已有数据集的 missing_value_types 为 NULL 的问题
    this.db.exec(`UPDATE sys_dataset SET missing_value_types = '[]' WHERE missing_value_types IS NULL;`);

    // 检查并添加 conf_column_setting 表的新字段
    const columnSettingInfo = this.db.prepare("PRAGMA table_info(conf_column_setting)").all() as { name: string }[];

    const columnSettingColumns = new Set(columnSettingInfo.map(c => c.name));

    const columnSettingNewColumns = [
      { name: "physical_min", type: "REAL" },
      { name: "physical_max", type: "REAL" },
      { name: "warning_min", type: "REAL" },
      { name: "warning_max", type: "REAL" },
      { name: "unit", type: "TEXT" },
      { name: "variable_type", type: "TEXT" },
    ];

    for (const col of columnSettingNewColumns) {
      if (!columnSettingColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE conf_column_setting ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 检查并添加 biz_outlier_result 表的新字段
    const outlierResultInfo = this.db.prepare("PRAGMA table_info(biz_outlier_result)").all() as { name: string }[];

    const outlierResultColumns = new Set(outlierResultInfo.map(c => c.name));

    const outlierResultNewColumns = [
      { name: "dataset_id", type: "INTEGER" },
      { name: "total_rows", type: "INTEGER DEFAULT 0" },
      { name: "outlier_rate", type: "REAL DEFAULT 0" },
    ];

    for (const col of outlierResultNewColumns) {
      if (!outlierResultColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE biz_outlier_result ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 检查并添加 biz_outlier_detail 表的新字段
    const outlierDetailInfo = this.db.prepare("PRAGMA table_info(biz_outlier_detail)").all() as { name: string }[];

    const outlierDetailColumns = new Set(outlierDetailInfo.map(c => c.name));

    const outlierDetailNewColumns = [{ name: "time_point", type: "DATETIME" }];

    for (const col of outlierDetailNewColumns) {
      if (!outlierDetailColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE biz_outlier_detail ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 检查并添加 biz_outlier_column_stat 表的新字段
    const outlierColumnStatInfo = this.db.prepare("PRAGMA table_info(biz_outlier_column_stat)").all() as {
      name: string;
    }[];

    const outlierColumnStatColumns = new Set(outlierColumnStatInfo.map(c => c.name));

    const outlierColumnStatNewColumns = [{ name: "missing_count", type: "INTEGER DEFAULT 0" }];

    for (const col of outlierColumnStatNewColumns) {
      if (!outlierColumnStatColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE biz_outlier_column_stat ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 迁移 biz_outlier_result 表以修复 CHECK 约束
    this.migrateOutlierResultTable();

    // 迁移 sys_site -> sys_category (重命名表和字段)
    this.migrateSiteToCategoryTable();

    // 检查并添加 conf_threshold_template 表的 is_builtin 字段
    const templateInfo = this.db.prepare("PRAGMA table_info(conf_threshold_template)").all() as { name: string }[];
    const templateColumns = new Set(templateInfo.map(c => c.name));
    if (!templateColumns.has("is_builtin")) {
      this.db.exec("ALTER TABLE conf_threshold_template ADD COLUMN is_builtin INTEGER DEFAULT 0;");
    }
  }

  /**
   * 迁移 biz_outlier_result 表 - 修复 status CHECK 约束
   * SQLite 不支持直接修改 CHECK 约束，需要重建表
   */
  private migrateOutlierResultTable(): void {
    if (!this.db) return;

    // 检查当前表的 CHECK 约束是否需要更新
    const tableInfo = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='biz_outlier_result'")
      .get() as { sql: string } | undefined;

    if (!tableInfo) return;

    // 如果已经包含 'RUNNING' 和 'COMPLETED' 状态，则不需要迁移
    if (tableInfo.sql.includes("RUNNING") && tableInfo.sql.includes("COMPLETED") && tableInfo.sql.includes("FAILED")) {
      return;
    }

    console.log("正在迁移 biz_outlier_result 表以更新 CHECK 约束...");

    // 使用事务重建表
    this.db.exec(`
      -- 1. 重命名旧表
      ALTER TABLE biz_outlier_result RENAME TO biz_outlier_result_old;

      -- 2. 创建新表（包含正确的 CHECK 约束，无外键约束）
      CREATE TABLE biz_outlier_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER,
        version_id INTEGER NOT NULL,
        generated_version_id INTEGER,
        detection_config_id INTEGER,
        column_name TEXT,
        detection_method TEXT NOT NULL,
        outlier_indices TEXT,
        outlier_count INTEGER DEFAULT 0,
        total_rows INTEGER DEFAULT 0,
        outlier_rate REAL DEFAULT 0,
        detection_params TEXT,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'APPLIED', 'REVERTED')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_del BOOLEAN DEFAULT 0
      );

      -- 3. 复制数据
      INSERT INTO biz_outlier_result 
        (id, dataset_id, version_id, generated_version_id, detection_config_id, column_name, detection_method, 
         outlier_indices, outlier_count, total_rows, outlier_rate, detection_params, 
         executed_at, status, created_at, updated_at, deleted_at, is_del)
      SELECT 
        id, dataset_id, version_id, NULL, detection_config_id, column_name, detection_method,
        outlier_indices, outlier_count, total_rows, outlier_rate, detection_params,
        executed_at, 
        CASE WHEN status IN ('PENDING', 'APPLIED', 'REVERTED') THEN status ELSE 'PENDING' END,
        created_at, updated_at, deleted_at, is_del
      FROM biz_outlier_result_old;

      -- 4. 删除旧表
      DROP TABLE biz_outlier_result_old;

      -- 5. 重建索引
      CREATE INDEX IF NOT EXISTS idx_outlier_result_version 
        ON biz_outlier_result(version_id, column_name);
    `);

    console.log("biz_outlier_result 表迁移完成");
  }

  /**
   * 迁移 sys_site -> sys_category
   * 处理已有数据库的表重命名和字段重命名
   */
  private migrateSiteToCategoryTable(): void {
    if (!this.db) return;

    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = new Set(tables.map(t => t.name));

    // 如果 sys_site 存在而 sys_category 不存在，执行迁移
    if (tableNames.has("sys_site") && !tableNames.has("sys_category")) {
      console.log("正在迁移 sys_site -> sys_category...");
      this.db.exec(`ALTER TABLE sys_site RENAME TO sys_category;`);
      console.log("sys_site 已重命名为 sys_category");
    }

    // 如果 sys_category 存在，检查是否需要重命名 site_name -> category_name
    if (tableNames.has("sys_category") || tableNames.has("sys_site")) {
      const cols = this.db.prepare("PRAGMA table_info(sys_category)").all() as { name: string }[];
      const colNames = new Set(cols.map(c => c.name));

      if (colNames.has("site_name") && !colNames.has("category_name")) {
        console.log("正在重命名 site_name -> category_name...");
        this.db.exec(`ALTER TABLE sys_category RENAME COLUMN site_name TO category_name;`);
        console.log("site_name 已重命名为 category_name");
      }
    }

    // 如果 sys_dataset 存在，检查是否需要重命名 site_id -> category_id
    if (tableNames.has("sys_dataset")) {
      const datasetCols = this.db.prepare("PRAGMA table_info(sys_dataset)").all() as { name: string }[];
      const datasetColNames = new Set(datasetCols.map(c => c.name));

      if (datasetColNames.has("site_id") && !datasetColNames.has("category_id")) {
        console.log("正在重命名 sys_dataset.site_id -> category_id...");
        this.db.exec(`ALTER TABLE sys_dataset RENAME COLUMN site_id TO category_id;`);
        console.log("site_id 已重命名为 category_id");
      }
    }
  }

  /**
   * 种入内置阈值模板数据（已存在则跳过）
   * 数据来源：shared/static/indicators_filtered.csv
   */
  private seedBuiltinTemplates(): void {
    if (!this.db) return;

    const existing = this.db
      .prepare("SELECT id FROM conf_threshold_template WHERE is_builtin = 1 AND name = 'standard' AND is_del = 0")
      .get();
    if (existing) return;

    const templateData: Record<string, { min: number; max: number; unit: string }> = {
      tau: { min: -5, max: 5, unit: "[kg+1m-1s-2]" },
      h: { min: -800, max: 800, unit: "[W+1m-2]" },
      le: { min: -500, max: 1000, unit: "[W+1m-2]" },
      co2_flux: { min: -50, max: 50, unit: "[μmol+1s-1m-2]" },
      h2o_flux: { min: -10, max: 25, unit: "[mmol+1s-1m-2]" },
      ch4_flux: { min: -50, max: 50, unit: "[μmol+1s-1m-2]" },
      h_strg: { min: -30, max: 30, unit: "[W+1m-2]" },
      le_strg: { min: -30, max: 30, unit: "[W+1m-2]" },
      co2_strg: { min: -5, max: 5, unit: "[μmol+1s-1m-2]" },
      h2o_strg: { min: -0.5, max: 0.5, unit: "[mmol+1s-1m-2]" },
      ch4_strg: { min: -5, max: 5, unit: "[μmol+1s-1m-2]" },
      co2_molar_density: { min: 10, max: 40, unit: "[mmol+1m-3]" },
      co2_mole_fraction: { min: 300, max: 1000, unit: "[μmol+1mol_a-1]" },
      co2_mixing_ratio: { min: 300, max: 1000, unit: "[μmol+1mol_d-1]" },
      h2o_molar_density: { min: 0, max: 2000, unit: "[mmol+1m-3]" },
      h2o_mole_fraction: { min: 0, max: 50, unit: "[mmol+1mol_a-1]" },
      h2o_mixing_ratio: { min: 0, max: 50, unit: "[mmol+1mol_d-1]" },
      ch4_molar_density: { min: 0, max: 200, unit: "[mmol+1m-3]" },
      ch4_mole_fraction: { min: 0, max: 100, unit: "[μmol+1mol_a-1]" },
      ch4_mixing_ratio: { min: 0, max: 100, unit: "[μmol+1mol_d-1]" },
      sonic_temperature: { min: -30, max: 50, unit: "[℃]" },
      air_temperature: { min: -30, max: 50, unit: "[℃]" },
      air_pressure: { min: 80000, max: 110000, unit: "[Pa]" },
      air_density: { min: 0.9, max: 1.5, unit: "[kg+1m-3]" },
      air_heat_capacity: { min: 1000, max: 1050, unit: "[J+1kg-1K-1]" },
      air_molar_volume: { min: 0.015, max: 0.03, unit: "[m+3mol-1]" },
      et: { min: -1, max: 2, unit: "[mm+1hour-1]" },
      water_vapor_density: { min: 0, max: 0.04, unit: "[kg+1m-3]" },
      e: { min: 0, max: 5000, unit: "[Pa]" },
      es: { min: 0, max: 6000, unit: "[Pa]" },
      specific_humidity: { min: 0, max: 0.03, unit: "[kg+1kg-1]" },
      rh: { min: 0, max: 100, unit: "[%]" },
      vpd: { min: 0, max: 6000, unit: "[Pa]" },
      tdew: { min: -100, max: 50, unit: "[℃]" },
      u_unrot: { min: -10, max: 10, unit: "[m+1s-1]" },
      v_unrot: { min: -10, max: 10, unit: "[m+1s-1]" },
      w_unrot: { min: -2.5, max: 2.5, unit: "[m+1s-1]" },
      wind_speed: { min: 0, max: 12, unit: "[m+1s-1]" },
      max_wind_speed: { min: 0, max: 30, unit: "[m+1s-1]" },
      wind_dir: { min: 0, max: 360, unit: "[deg_from_north]" },
      u_: { min: 0, max: 3, unit: "[m+1s-1]" },
      x_peak: { min: 0, max: 10000, unit: "[m]" },
      x_offset: { min: 0, max: 10000, unit: "[m]" },
      x_10_: { min: 0, max: 10000, unit: "[m]" },
      x_30_: { min: 0, max: 10000, unit: "[m]" },
      x_50_: { min: 0, max: 10000, unit: "[m]" },
      x_70_: { min: 0, max: 10000, unit: "[m]" },
      x_90_: { min: 0, max: 10000, unit: "[m]" },
      co2_mean: { min: 300, max: 1000, unit: "[μmol+1mol_a-1]" },
      h2o_mean: { min: 0, max: 50, unit: "[mmol+1mol_a-1]" },
      dew_point_mean: { min: -100, max: 50, unit: "[C]" },
      co2_signal_strength_7500_mean: { min: 0, max: 150, unit: "" },
      alb_1_1_1: { min: 0, max: 100, unit: "[%]" },
      lwin_1_1_1: { min: 0, max: 700, unit: "[W/m^2]" },
      lwout_1_1_1: { min: 0, max: 700, unit: "[W/m^2]" },
      ppfd_1_1_1: { min: -5, max: 2500, unit: "[μmol/m^2/s]" },
      ptemp_1_1_1: { min: -30, max: 50, unit: "[℃]" },
      p_rain_1_1_1: { min: 0, max: 0.1, unit: "[m]" },
      p_rain_1_2_1: { min: 0, max: 0.1, unit: "[m]" },
      rh_1_1_1: { min: 0, max: 100, unit: "[%]" },
      rh_1_2_1: { min: 0, max: 100, unit: "[%]" },
      rn_1_1_1: { min: -300, max: 1200, unit: "[W/m^2]" },
      rg_1_1_2: { min: -5, max: 1250, unit: "[W/m^2]" },
      rlnet_1_1_1: { min: -200, max: 100, unit: "[W/M^2]" },
      rsnet_1_1_1: { min: -50, max: 1200, unit: "[W/M^2]" },
      r_uva_1_1_1: { min: -5, max: 100, unit: "[W/m^2]" },
      swc_1_1_1: { min: 0, max: 1, unit: "[m^3/m^3]" },
      swc_1_2_1: { min: 0, max: 1, unit: "[m^3/m^3]" },
      swc_1_3_1: { min: 0, max: 1, unit: "[m^3/m^3]" },
      swc_1_4_1: { min: 0, max: 1, unit: "[m^3/m^3]" },
      swc_1_5_1: { min: 0, max: 1, unit: "[m^3/m^3]" },
      swdif_1_1_1: { min: -5, max: 1000, unit: "[W/m^2]" },
      swin_1_1_1: { min: -5, max: 1200, unit: "[W/m^2]" },
      swout_1_1_1: { min: -5, max: 300, unit: "[W/m^2]" },
      trn_1_1_1: { min: -30, max: 50, unit: "[℃]" },
      ts_1_1_1: { min: -15, max: 30, unit: "[℃]" },
      ts_1_2_1: { min: -15, max: 30, unit: "[℃]" },
      ts_1_3_1: { min: -15, max: 30, unit: "[℃]" },
      ts_1_4_1: { min: -15, max: 30, unit: "[℃]" },
      ts_1_5_1: { min: -15, max: 30, unit: "[℃]" },
      ta_1_1_1: { min: -30, max: 50, unit: "[℃]" },
      ta_1_2_1: { min: -30, max: 50, unit: "[℃]" },
      vin_1_1_1: { min: 0, max: 20, unit: "[V]" },
      wd_1_1_1: { min: 0, max: 360, unit: "[Degrees_past_North]" },
      wd_1_2_1: { min: 0, max: 360, unit: "[Degrees_past_North]" },
      ws_1_1_1: { min: 0, max: 12, unit: "[m/s]" },
      ws_1_2_1: { min: 0, max: 12, unit: "[m/s]" },
      so2: { min: 0, max: 2500, unit: "μg/m3" },
      no: { min: 0, max: 100, unit: "μg/m3" },
      nox: { min: 0, max: 250, unit: "μg/m3" },
      no2: { min: 0, max: 250, unit: "μg/m3" },
      co: { min: 0, max: 10, unit: "mg/m3" },
      o3: { min: 0, max: 1000, unit: "μg/m3" },
      pm10: { min: 0, max: 1000, unit: "μg/m3" },
      pm2_5: { min: 0, max: 1000, unit: "μg/m3" },
      nai: { min: 0, max: 12000, unit: "[个/cm3]" },
      tc_vel_1_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_2_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_3_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_4_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_5_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_6_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_7_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_8_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_9_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_10_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_11_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_12_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_13_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_14_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_15_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_16_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_17_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_18_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_19_: { min: 0, max: 25, unit: "[cm/hr]" },
      tc_vel_20_: { min: 0, max: 25, unit: "[cm/hr]" },
      ppfd_1_1_2: { min: -5, max: 500, unit: "[μmol/m^2/s]" },
      ws_2_1_1: { min: 0, max: 12, unit: "" },
      soilg_2_avg: { min: -300, max: 1000, unit: "" },
      tc_dtca_1_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_2_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_3_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_4_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_5_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_6_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_7_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_8_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_9_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_10_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_11_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_12_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_13_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_14_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_15_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_16_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_17_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_18_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_19_: { min: 3, max: 12, unit: "[℃]" },
      tc_dtca_20_: { min: 3, max: 12, unit: "[℃]" },
      tsp: { min: 0, max: 1000, unit: "μg/m3" },
    };

    this.db
      .prepare(
        `INSERT INTO conf_threshold_template (name, description, template_data, is_builtin)
         VALUES (?, ?, ?, 1)`
      )
      .run("standard", "系统内置标准物理范围模板，来源于 shared/static/indicators_filtered.csv", JSON.stringify(templateData));

    console.log("内置阈值模板 'standard' 已写入数据库");
  }

  /**
   * 种入内置 BEON 站点规则
   * 这些规则对应 qc_code_2 中原先写死在 main_step.py 的站点特例
   */
  private seedBuiltinBEONSiteRules(): void {
    if (!this.db) return;

    const builtinRules = [
      {
        site_code: "cuihu",
        rule_name: "fallback-shisanling-rg-tair",
        rule_type: "fallback_query",
        source_table: "shisanling_fluxs",
        match_time_column: "record_time",
        priority: 100,
        rule_config: JSON.stringify({
          select_columns: ["record_time", "rg_1_1_2", "ta_1_2_1"],
          drop_local_columns: ["rg_1_1_2", "ta_1_2_1"],
          target_mapping: {
            rg_1_1_2: "rg_1_1_2",
            ta_1_2_1: "ta_1_2_1",
          },
          required_columns: ["rg_1_1_2", "ta_1_2_1"],
          require_all: true,
        }),
      },
      {
        site_code: "yeyahu",
        rule_name: "fallback-shisanling-rg-tair",
        rule_type: "fallback_query",
        source_table: "shisanling_fluxs",
        match_time_column: "record_time",
        priority: 100,
        rule_config: JSON.stringify({
          select_columns: ["record_time", "rg_1_1_2", "ta_1_2_1"],
          drop_local_columns: ["rg_1_1_2", "ta_1_2_1"],
          target_mapping: {
            rg_1_1_2: "rg_1_1_2",
            ta_1_2_1: "ta_1_2_1",
          },
          required_columns: ["rg_1_1_2", "ta_1_2_1"],
          require_all: true,
        }),
      },
      {
        site_code: "yuankeyuan",
        rule_name: "fallback-shisanling-rg",
        rule_type: "fallback_query",
        source_table: "shisanling_fluxs",
        match_time_column: "record_time",
        priority: 100,
        rule_config: JSON.stringify({
          select_columns: ["record_time", "rg_1_1_2"],
          drop_local_columns: ["rg_1_1_2"],
          target_mapping: {
            rg_1_1_2: "rg_1_1_2",
          },
          required_columns: ["rg_1_1_2"],
          require_all: true,
        }),
      },
      {
        site_code: "songshan",
        rule_name: "fallback-shisanling-rg",
        rule_type: "fallback_query",
        source_table: "shisanling_fluxs",
        match_time_column: "record_time",
        priority: 100,
        rule_config: JSON.stringify({
          select_columns: ["record_time", "rg_1_1_2"],
          drop_local_columns: ["rg_1_1_2"],
          target_mapping: {
            rg_1_1_2: "rg_1_1_2",
          },
          required_columns: ["rg_1_1_2"],
          require_all: true,
        }),
      },
      {
        site_code: "aosen",
        rule_name: "local-override-campbell",
        rule_type: "local_override",
        source_table: null,
        match_time_column: "record_time",
        priority: 100,
        rule_config: JSON.stringify({
          drop_columns: ["rg_1_1_2", "vpd", "rh"],
          copy_columns: [
            { target: "rg_1_1_2", source: "short_up_avg" },
            { target: "rh", source: "rh_12m_avg" },
          ],
          numeric_columns: ["short_up_avg", "rh_12m_avg", "ta_12m_avg"],
          vpd_formula: {
            target: "vpd",
            rh_column: "rh",
            tair_column: "ta_12m_avg",
            output_unit: "pa",
          },
          cleanup_columns: ["short_up_avg", "rh_12m_avg", "rh_10m_avg", "ta_12m_avg"],
        }),
      },
      {
        site_code: "badaling",
        rule_name: "local-override-campbell",
        rule_type: "local_override",
        source_table: null,
        match_time_column: "record_time",
        priority: 100,
        rule_config: JSON.stringify({
          drop_columns: ["rg_1_1_2", "vpd", "rh"],
          copy_columns: [
            { target: "rg_1_1_2", source: "short_up_avg" },
            { target: "rh", source: "rh_10m_avg" },
            { target: "ta_1_2_1", source: "ta_1_2_1" },
          ],
          numeric_columns: ["short_up_avg", "rh_10m_avg", "ta_1_2_1"],
          vpd_formula: {
            target: "vpd",
            rh_column: "rh",
            tair_column: "ta_1_2_1",
            output_unit: "pa",
          },
          cleanup_columns: ["short_up_avg", "rh_12m_avg", "rh_10m_avg", "ta_12m_avg"],
        }),
      },
    ];

    const findStmt = this.db.prepare(`
      SELECT id FROM conf_beon_site_rule
      WHERE site_code = ? AND rule_name = ? AND is_builtin = 1 AND is_del = 0
    `);

    const insertStmt = this.db.prepare(`
      INSERT INTO conf_beon_site_rule
        (site_code, rule_name, rule_type, connection_profile_id, source_table, match_time_column, priority, rule_config, is_active, is_builtin)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, 1)
    `);

    const updateStmt = this.db.prepare(`
      UPDATE conf_beon_site_rule
      SET rule_type = ?,
          source_table = ?,
          match_time_column = ?,
          priority = ?,
          rule_config = ?,
          is_active = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const rule of builtinRules) {
      const existing = findStmt.get(rule.site_code, rule.rule_name) as { id: number } | undefined;
      if (existing) {
        updateStmt.run(
          rule.rule_type,
          rule.source_table,
          rule.match_time_column,
          rule.priority,
          rule.rule_config,
          existing.id
        );
        continue;
      }

      insertStmt.run(
        rule.site_code,
        rule.rule_name,
        rule.rule_type,
        rule.source_table,
        rule.match_time_column,
        rule.priority,
        rule.rule_config
      );
    }
  }
}
