import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database | null = null;

  private constructor() { }

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
    this.initSystemSettingsTables();
    this.initOutlierDetectionTables();
    this.initCorrelationAnalysisTables();
    this.initImputationTables();
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
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 站点唯一标识
        site_name TEXT NOT NULL,               -- 站点名称
        description TEXT,                      -- 站点描述
        latitude REAL,                         -- 纬度 (-90 ~ 90)
        longitude REAL,                        -- 经度 (-180 ~ 180)
        altitude REAL,                         -- 海拔高度 (米)
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
        site_id INTEGER NOT NULL,              -- 所属站点ID
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
        FOREIGN KEY (site_id) REFERENCES sys_site(id) ON DELETE CASCADE
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
    // 支持三级作用域: APP(全局) / SITE(站点) / DATASET(数据集)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_outlier_detection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 配置唯一标识
        scope_type TEXT NOT NULL CHECK(scope_type IN ('APP', 'SITE', 'DATASET')),  -- 作用域类型 (APP=全局/SITE=站点级/DATASET=数据集级)
        scope_id INTEGER,                      -- 作用域ID (APP时为NULL, SITE时为站点ID, DATASET时为数据集ID)
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
      { key: 'timezone', value: 'UTC+8', type: 'string', description: '系统时区设置，用于解析无时区的时间字符串' },
      { key: 'dateFormat', value: 'YYYY-MM-DD HH:mm', type: 'string', description: '日期时间显示格式' },
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
   * 初始化相关性分析相关表结构
   */
  private initCorrelationAnalysisTables(): void {
    if (!this.db) return;

    // 相关性分析结果表 (biz_correlation_result)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_correlation_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 结果唯一标识
        dataset_id INTEGER NOT NULL,           -- 数据集ID
        version_id INTEGER,                    -- 数据版本ID
        columns TEXT NOT NULL,                 -- 参与分析的列 (JSON数组)
        method TEXT NOT NULL,                  -- 分析方法 (pearson/spearman/kendall)
        result_matrix TEXT NOT NULL,           -- 结果矩阵 (JSON格式)
        significance_level REAL,               -- 显著性水平
        sample_size INTEGER,                   -- 样本大小
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 执行时间
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- 创建时间
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- 更新时间
        deleted_at DATETIME,                   -- 删除时间
        is_del BOOLEAN DEFAULT 0               -- 软删除标记
      );
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
        method_id TEXT NOT NULL UNIQUE,        -- 方法标识符 (如 MEAN/LINEAR/ARIMA)
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

    // 插补详情表 (biz_imputation_detail)
    // 存储每个被插补的数据点详情
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS biz_imputation_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 详情唯一标识
        result_id INTEGER NOT NULL,            -- 所属插补结果ID
        column_name TEXT NOT NULL,             -- 列名
        row_index INTEGER NOT NULL,            -- 行索引 (从0开始)
        time_point DATETIME,                   -- 时间点
        original_value REAL,                   -- 原始值 (通常为NULL表示缺失)
        imputed_value REAL NOT NULL,           -- 插补值
        confidence REAL,                       -- 置信度 (0~1)
        imputation_method TEXT,                -- 具体使用的插补方式
        neighbor_values TEXT,                  -- 参考的相邻值 (JSON数组)
        is_applied BOOLEAN DEFAULT 0,          -- 是否已应用到数据
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_del BOOLEAN DEFAULT 0
      );
    `);

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
    } catch (e) { /* 字段已存在 */ }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_model ADD COLUMN feature_columns TEXT`);
    } catch (e) { /* 字段已存在 */ }
    try {
      this.db.exec(`ALTER TABLE biz_imputation_model ADD COLUMN time_column TEXT DEFAULT 'record_time'`);
    } catch (e) { /* 字段已存在 */ }

    // 插入默认模型配置（如果不存在）
    this.insertDefaultImputationModels();

    // 创建索引以提升查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_imputation_result_dataset
        ON biz_imputation_result(dataset_id, version_id);

      CREATE INDEX IF NOT EXISTS idx_imputation_result_status
        ON biz_imputation_result(status);

      CREATE INDEX IF NOT EXISTS idx_imputation_detail_result
        ON biz_imputation_detail(result_id, column_name);

      CREATE INDEX IF NOT EXISTS idx_imputation_detail_row
        ON biz_imputation_detail(result_id, row_index);

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
   * 插入默认的插补方法配置和参数定义
   */
  private insertDefaultImputationMethods(): void {
    if (!this.db) return;

    const defaultMethods = [
      // 基础方法
      {
        method_id: 'MEAN',
        method_name: '均值填充',
        category: 'basic',
        description: '使用列均值填充缺失值',
        requires_python: 0,
        estimated_time: 'fast',
        accuracy: 'low',
        priority: 100,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '📊'
      },
      {
        method_id: 'MEDIAN',
        method_name: '中位数填充',
        category: 'basic',
        description: '使用列中位数填充缺失值',
        requires_python: 0,
        estimated_time: 'fast',
        accuracy: 'low',
        priority: 99,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '📊'
      },
      {
        method_id: 'MODE',
        method_name: '众数填充',
        category: 'basic',
        description: '使用列众数填充缺失值',
        requires_python: 0,
        estimated_time: 'fast',
        accuracy: 'low',
        priority: 98,
        applicable_data_types: JSON.stringify(['numeric', 'string']),
        icon: '📊'
      },
      {
        method_id: 'FORWARD_FILL',
        method_name: '向前填充',
        category: 'basic',
        description: '使用前一个有效值填充',
        requires_python: 0,
        estimated_time: 'fast',
        accuracy: 'low',
        priority: 97,
        applicable_data_types: JSON.stringify(['numeric', 'string']),
        icon: '⏪'
      },
      {
        method_id: 'BACKWARD_FILL',
        method_name: '向后填充',
        category: 'basic',
        description: '使用后一个有效值填充',
        requires_python: 0,
        estimated_time: 'fast',
        accuracy: 'low',
        priority: 96,
        applicable_data_types: JSON.stringify(['numeric', 'string']),
        icon: '⏩'
      },
      // 统计方法
      {
        method_id: 'LINEAR',
        method_name: '线性插值',
        category: 'statistical',
        description: '基于线性关系进行插值',
        requires_python: 0,
        estimated_time: 'fast',
        accuracy: 'medium',
        priority: 90,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '📈'
      },
      {
        method_id: 'MDS_REDDYPROC',
        method_name: 'REddyProc MDS',
        category: 'statistical',
        description: '边际分布采样法，基于气象条件相似性的通量数据专业插补方法，适用于涡度协方差数据',
        requires_python: 1,
        estimated_time: 'medium',
        accuracy: 'high',
        priority: 85,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🌿'
      },
      {
        method_id: 'SPLINE',
        method_name: '样条插值',
        category: 'statistical',
        description: '使用样条曲线进行插值',
        requires_python: 1,
        estimated_time: 'fast',
        accuracy: 'medium',
        priority: 89,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '📈'
      },
      {
        method_id: 'POLYNOMIAL',
        method_name: '多项式插值',
        category: 'statistical',
        description: '使用多项式曲线进行插值',
        requires_python: 1,
        estimated_time: 'fast',
        accuracy: 'medium',
        priority: 88,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '📈'
      },
      // 时序方法
      {
        method_id: 'ARIMA',
        method_name: 'ARIMA模型',
        category: 'timeseries',
        description: '基于ARIMA时序模型的插补',
        requires_python: 1,
        estimated_time: 'medium',
        accuracy: 'high',
        priority: 80,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '⏱️'
      },
      {
        method_id: 'SARIMA',
        method_name: 'SARIMA模型',
        category: 'timeseries',
        description: '考虑季节性的ARIMA模型',
        requires_python: 1,
        estimated_time: 'medium',
        accuracy: 'high',
        priority: 79,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '⏱️'
      },
      {
        method_id: 'ETS',
        method_name: 'ETS模型',
        category: 'timeseries',
        description: '指数平滑状态空间模型',
        requires_python: 1,
        estimated_time: 'medium',
        accuracy: 'high',
        priority: 78,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '⏱️'
      },
      // 机器学习方法
      {
        method_id: 'KNN',
        method_name: 'KNN插补',
        category: 'ml',
        description: '基于K近邻算法的插补',
        requires_python: 1,
        estimated_time: 'medium',
        accuracy: 'high',
        priority: 70,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🤖'
      },
      {
        method_id: 'RANDOM_FOREST',
        method_name: '随机森林',
        category: 'ml',
        description: '基于随机森林的插补',
        requires_python: 1,
        estimated_time: 'slow',
        accuracy: 'high',
        priority: 69,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🤖'
      },
      {
        method_id: 'MICE',
        method_name: 'MICE多重插补',
        category: 'ml',
        description: '链式方程多重插补',
        requires_python: 1,
        estimated_time: 'slow',
        accuracy: 'high',
        priority: 68,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🤖'
      },
      {
        method_id: 'MISSFOREST',
        method_name: 'MissForest',
        category: 'ml',
        description: '基于随机森林的迭代插补',
        requires_python: 1,
        estimated_time: 'slow',
        accuracy: 'high',
        priority: 67,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🤖'
      },
      // 深度学习方法
      {
        method_id: 'TIMEMIXER_PP',
        method_name: 'TimeMixer++',
        category: 'dl',
        description: '基于TimeMixer++的高精度时序插补模型，支持多变量时序数据，适用于生态环境监测数据',
        requires_python: 1,
        estimated_time: 'slow',
        accuracy: 'high',
        priority: 65,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🧠'
      },
      {
        method_id: 'LSTM',
        method_name: 'LSTM网络',
        category: 'dl',
        description: '基于LSTM的时序插补',
        requires_python: 1,
        estimated_time: 'slow',
        accuracy: 'high',
        priority: 60,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🧠'
      },
      {
        method_id: 'GRU',
        method_name: 'GRU网络',
        category: 'dl',
        description: '基于GRU的时序插补',
        requires_python: 1,
        estimated_time: 'slow',
        accuracy: 'high',
        priority: 59,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🧠'
      },
      {
        method_id: 'TRANSFORMER',
        method_name: 'Transformer',
        category: 'dl',
        description: '基于Transformer的插补',
        requires_python: 1,
        estimated_time: 'slow',
        accuracy: 'high',
        priority: 58,
        applicable_data_types: JSON.stringify(['numeric']),
        icon: '🧠'
      }
    ];

    // 插入方法
    const insertMethodStmt = this.db.prepare(`
      INSERT OR IGNORE INTO conf_imputation_method
        (method_id, method_name, category, description, requires_python, estimated_time, accuracy, priority, applicable_data_types, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    // 插入方法参数定义
    this.insertDefaultMethodParams();
  }

  /**
   * 插入默认的方法参数定义
   */
  private insertDefaultMethodParams(): void {
    if (!this.db) return;

    const defaultParams = [
      // ARIMA 参数
      { method_id: 'ARIMA', param_key: 'autoSelect', param_name: '自动选择参数', param_type: 'boolean', default_value: 'true', tooltip: '是否自动选择最优的ARIMA参数', is_required: false, is_advanced: false, param_order: 1 },
      { method_id: 'ARIMA', param_key: 'p', param_name: 'AR阶数 (p)', param_type: 'number', default_value: '1', min_value: 0, max_value: 5, step_value: 1, tooltip: '自回归阶数', is_required: false, is_advanced: false, param_order: 2 },
      { method_id: 'ARIMA', param_key: 'd', param_name: '差分次数 (d)', param_type: 'number', default_value: '1', min_value: 0, max_value: 2, step_value: 1, tooltip: '差分阶数', is_required: false, is_advanced: false, param_order: 3 },
      { method_id: 'ARIMA', param_key: 'q', param_name: 'MA阶数 (q)', param_type: 'number', default_value: '1', min_value: 0, max_value: 5, step_value: 1, tooltip: '移动平均阶数', is_required: false, is_advanced: false, param_order: 4 },

      // SARIMA 参数
      { method_id: 'SARIMA', param_key: 'autoSelect', param_name: '自动选择参数', param_type: 'boolean', default_value: 'true', tooltip: '是否自动选择最优的SARIMA参数', is_required: false, is_advanced: false, param_order: 1 },
      { method_id: 'SARIMA', param_key: 'p', param_name: 'AR阶数 (p)', param_type: 'number', default_value: '1', min_value: 0, max_value: 5, step_value: 1, tooltip: '自回归阶数', is_required: false, is_advanced: false, param_order: 2 },
      { method_id: 'SARIMA', param_key: 'd', param_name: '差分次数 (d)', param_type: 'number', default_value: '1', min_value: 0, max_value: 2, step_value: 1, tooltip: '差分阶数', is_required: false, is_advanced: false, param_order: 3 },
      { method_id: 'SARIMA', param_key: 'q', param_name: 'MA阶数 (q)', param_type: 'number', default_value: '1', min_value: 0, max_value: 5, step_value: 1, tooltip: '移动平均阶数', is_required: false, is_advanced: false, param_order: 4 },
      { method_id: 'SARIMA', param_key: 'P', param_name: '季节性AR阶数 (P)', param_type: 'number', default_value: '1', min_value: 0, max_value: 5, step_value: 1, tooltip: '季节性自回归阶数', is_required: false, is_advanced: false, param_order: 5 },
      { method_id: 'SARIMA', param_key: 'D', param_name: '季节性差分次数 (D)', param_type: 'number', default_value: '1', min_value: 0, max_value: 2, step_value: 1, tooltip: '季节性差分阶数', is_required: false, is_advanced: false, param_order: 6 },
      { method_id: 'SARIMA', param_key: 'Q', param_name: '季节性MA阶数 (Q)', param_type: 'number', default_value: '1', min_value: 0, max_value: 5, step_value: 1, tooltip: '季节性移动平均阶数', is_required: false, is_advanced: false, param_order: 7 },
      { method_id: 'SARIMA', param_key: 's', param_name: '季节性周期 (s)', param_type: 'number', default_value: '24', min_value: 2, max_value: 365, step_value: 1, tooltip: '季节性周期长度', is_required: false, is_advanced: false, param_order: 8 },

      // KNN 参数
      { method_id: 'KNN', param_key: 'n_neighbors', param_name: 'K近邻数量', param_type: 'number', default_value: '5', min_value: 1, max_value: 20, step_value: 1, tooltip: '用于插补的近邻数量', is_required: true, is_advanced: false, param_order: 1 },

      // 样条插值参数
      { method_id: 'SPLINE', param_key: 'degree', param_name: '样条度数', param_type: 'select', default_value: '3', options: JSON.stringify([
        { label: '线性 (1阶)', value: '1' },
        { label: '二次 (2阶)', value: '2' },
        { label: '三次 (3阶)', value: '3' }
      ]), tooltip: '样条曲线的度数，影响插值平滑度', is_required: true, is_advanced: false, param_order: 1 },

      // 多项式插值参数
      { method_id: 'POLYNOMIAL', param_key: 'degree', param_name: '多项式度数', param_type: 'number', default_value: '2', min_value: 1, max_value: 5, step_value: 1, tooltip: '多项式的度数，度数越高拟合越精确但可能过拟合', is_required: true, is_advanced: false, param_order: 1 },

      // ETS 参数
      { method_id: 'ETS', param_key: 'trend', param_name: '趋势组件', param_type: 'select', default_value: 'add', options: JSON.stringify([
        { label: '加法趋势', value: 'add' },
        { label: '乘法趋势', value: 'mul' },
        { label: '无趋势', value: 'none' }
      ]), tooltip: '趋势组件的类型', is_required: false, is_advanced: false, param_order: 1 },
      { method_id: 'ETS', param_key: 'seasonal', param_name: '季节性组件', param_type: 'select', default_value: 'add', options: JSON.stringify([
        { label: '加法季节性', value: 'add' },
        { label: '乘法季节性', value: 'mul' },
        { label: '无季节性', value: 'none' }
      ]), tooltip: '季节性组件的类型', is_required: false, is_advanced: false, param_order: 2 },
      { method_id: 'ETS', param_key: 'seasonal_periods', param_name: '季节性周期', param_type: 'number', default_value: '24', min_value: 2, max_value: 365, step_value: 1, tooltip: '季节性周期长度', is_required: false, is_advanced: false, param_order: 3 },

      // REddyProc MDS 参数 - 位置信息
      { method_id: 'MDS_REDDYPROC', param_key: 'lat_deg', param_name: '纬度 (°)', param_type: 'number', default_value: '39.0', min_value: -90, max_value: 90, step_value: 0.01, tooltip: '站点纬度，范围 -90 到 90', is_required: true, is_advanced: false, param_order: 1 },
      { method_id: 'MDS_REDDYPROC', param_key: 'long_deg', param_name: '经度 (°)', param_type: 'number', default_value: '116.0', min_value: -180, max_value: 180, step_value: 0.01, tooltip: '站点经度，范围 -180 到 180', is_required: true, is_advanced: false, param_order: 2 },
      { method_id: 'MDS_REDDYPROC', param_key: 'timezone_hour', param_name: '时区 (小时)', param_type: 'number', default_value: '8', min_value: -12, max_value: 14, step_value: 1, tooltip: '站点时区，相对于UTC的小时偏移', is_required: true, is_advanced: false, param_order: 3 },
      // REddyProc MDS 参数 - 气象变量列映射
      { method_id: 'MDS_REDDYPROC', param_key: 'rg_col', param_name: '全球辐射列 (Rg)', param_type: 'string', default_value: 'Rg', tooltip: '全球辐射列名，单位 W/m²', is_required: true, is_advanced: false, param_order: 4 },
      { method_id: 'MDS_REDDYPROC', param_key: 'tair_col', param_name: '气温列 (Tair)', param_type: 'string', default_value: 'Tair', tooltip: '气温列名，单位 °C', is_required: true, is_advanced: false, param_order: 5 },
      { method_id: 'MDS_REDDYPROC', param_key: 'vpd_col', param_name: 'VPD列', param_type: 'string', default_value: 'VPD', tooltip: '饱和水汽压差列名，单位 hPa。若无VPD列，可留空并提供相对湿度列', is_required: false, is_advanced: false, param_order: 6 },
      { method_id: 'MDS_REDDYPROC', param_key: 'rh_col', param_name: '相对湿度列 (rH)', param_type: 'string', default_value: '', tooltip: '相对湿度列名，单位 %。用于计算VPD（当VPD列为空时）', is_required: false, is_advanced: false, param_order: 7 },
      // REddyProc MDS 参数 - 高级选项
      { method_id: 'MDS_REDDYPROC', param_key: 'ustar_col', param_name: '摩擦速度列 (Ustar)', param_type: 'string', default_value: '', tooltip: '摩擦速度列名，单位 m/s。用于u*过滤（可选）', is_required: false, is_advanced: true, param_order: 8 },
      { method_id: 'MDS_REDDYPROC', param_key: 'fill_all', param_name: '填充所有值', param_type: 'boolean', default_value: 'false', tooltip: '是否为所有数据点（包括有效值）计算不确定性。默认仅填充缺失值', is_required: false, is_advanced: true, param_order: 9 },
      { method_id: 'MDS_REDDYPROC', param_key: 'ustar_filtering', param_name: '启用u*过滤', param_type: 'boolean', default_value: 'false', tooltip: '是否在插补前进行u*过滤（需要提供Ustar列）', is_required: false, is_advanced: true, param_order: 10 },

      // TimeMixer++ 参数
      { method_id: 'TIMEMIXER_PP', param_key: 'model_path', param_name: '模型文件路径', param_type: 'string', default_value: '', tooltip: '训练好的模型文件路径 (.pypots 文件)，留空则使用数据集关联的模型', is_required: false, is_advanced: false, param_order: 1 },
      { method_id: 'TIMEMIXER_PP', param_key: 'seq_len', param_name: '序列长度', param_type: 'number', default_value: '96', min_value: 24, max_value: 512, step_value: 24, tooltip: '滑动窗口长度，必须与训练时一致', is_required: true, is_advanced: false, param_order: 2 },
      { method_id: 'TIMEMIXER_PP', param_key: 'n_layers', param_name: '层数', param_type: 'number', default_value: '2', min_value: 1, max_value: 8, step_value: 1, tooltip: '模型层数', is_required: false, is_advanced: true, param_order: 3 },
      { method_id: 'TIMEMIXER_PP', param_key: 'd_model', param_name: '隐藏层维度', param_type: 'number', default_value: '32', min_value: 16, max_value: 256, step_value: 16, tooltip: '隐藏层特征维度', is_required: false, is_advanced: true, param_order: 4 },
      { method_id: 'TIMEMIXER_PP', param_key: 'd_ffn', param_name: 'FFN维度', param_type: 'number', default_value: '64', min_value: 32, max_value: 512, step_value: 32, tooltip: '前馈网络维度', is_required: false, is_advanced: true, param_order: 5 },
      { method_id: 'TIMEMIXER_PP', param_key: 'top_k', param_name: 'Top-K频率', param_type: 'number', default_value: '5', min_value: 1, max_value: 20, step_value: 1, tooltip: 'Top-K 频率成分数量', is_required: false, is_advanced: true, param_order: 6 },
      { method_id: 'TIMEMIXER_PP', param_key: 'n_heads', param_name: '注意力头数', param_type: 'number', default_value: '4', min_value: 1, max_value: 16, step_value: 1, tooltip: 'Multi-head Attention 的头数', is_required: false, is_advanced: true, param_order: 7 },
      { method_id: 'TIMEMIXER_PP', param_key: 'n_kernels', param_name: 'Kernel数量', param_type: 'number', default_value: '3', min_value: 1, max_value: 8, step_value: 1, tooltip: 'Inception Kernel 数量', is_required: false, is_advanced: true, param_order: 8 },
      { method_id: 'TIMEMIXER_PP', param_key: 'dropout', param_name: 'Dropout率', param_type: 'number', default_value: '0.1', min_value: 0, max_value: 0.5, step_value: 0.05, tooltip: 'Dropout 比率', is_required: false, is_advanced: true, param_order: 9 },
      { method_id: 'TIMEMIXER_PP', param_key: 'down_layers', param_name: '下采样层数', param_type: 'number', default_value: '3', min_value: 1, max_value: 5, step_value: 1, tooltip: '下采样层数', is_required: false, is_advanced: true, param_order: 10 },
      { method_id: 'TIMEMIXER_PP', param_key: 'down_window', param_name: '下采样窗口', param_type: 'number', default_value: '2', min_value: 2, max_value: 8, step_value: 1, tooltip: '下采样窗口大小', is_required: false, is_advanced: true, param_order: 11 },
      { method_id: 'TIMEMIXER_PP', param_key: 'use_gpu', param_name: '使用GPU', param_type: 'boolean', default_value: 'true', tooltip: '是否使用GPU加速（如可用）', is_required: false, is_advanced: false, param_order: 12 }
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
      INSERT OR IGNORE INTO conf_imputation_method_params
        (method_id, param_key, param_name, param_type, default_value, min_value, max_value, step_value, options, tooltip, is_required, is_advanced, param_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        (param.is_required || false) ? 1 : 0,
        (param.is_advanced || false) ? 1 : 0,
        param.param_order
      );
    }
  }

  /**
   * 插入预训练的插补模型配置
   */
  private insertDefaultImputationModels(): void {
    if (!this.db) return;

    const path = require('path');
    const { app } = require('electron');
    
    // 开发环境：项目根目录/python
    // 生产环境：resources/python（通过 electron-builder extraResources 配置）
    const pythonDir = app.isPackaged
      ? path.join(process.resourcesPath, 'python')
      : path.join(__dirname, '..', '..', '..', 'python');
    
    const models = [
      {
        method_id: 'TIMEMIXER_PP',
        model_name: 'CO2通量插补模型',
        model_path: path.join(pythonDir, 'timemixerpp_co2_flux.pypots'),
        target_column: 'co2_flux',
        feature_columns: JSON.stringify([
          'record_time', 'co2_flux', 'rg_1_1_2', 'rn_1_1_1', 
          'ta_1_2_1', 'vpd', 'rh_1_1_1', 'swc_1_1_1', 'ts_1_1_1'
        ]),
        time_column: 'record_time',
        model_params: JSON.stringify({
          seq_len: 96, n_layers: 2, d_model: 32, d_ffn: 64,
          top_k: 5, n_heads: 4, n_kernels: 3, dropout: 0.1,
          down_layers: 3, down_window: 2
        }),
        is_active: 1
      },
      {
        method_id: 'TIMEMIXER_PP',
        model_name: 'PM2.5插补模型',
        model_path: path.join(pythonDir, 'timermixerpp_pm2_5.pypots'),
        target_column: 'pm2_5',
        feature_columns: JSON.stringify(['record_time', 'pm2_5']),
        time_column: 'record_time',
        model_params: JSON.stringify({
          seq_len: 96, n_layers: 2, d_model: 32, d_ffn: 64,
          top_k: 5, n_heads: 4, n_kernels: 3, dropout: 0.1,
          down_layers: 3, down_window: 2
        }),
        is_active: 1
      }
    ];

    const insertModelStmt = this.db.prepare(`
      INSERT OR IGNORE INTO biz_imputation_model
        (dataset_id, method_id, model_name, model_path, model_params, 
         target_column, feature_columns, time_column, is_active, trained_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const model of models) {
      const existing = this.db.prepare(`
        SELECT id FROM biz_imputation_model WHERE model_name = ? AND is_del = 0
      `).get(model.model_name);

      if (!existing) {
        insertModelStmt.run(
          null, model.method_id, model.model_name, model.model_path,
          model.model_params, model.target_column, model.feature_columns,
          model.time_column, model.is_active
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
    const datasetInfo = this.db
      .prepare("PRAGMA table_info(sys_dataset)")
      .all() as { name: string }[];

    const datasetColumns = new Set(datasetInfo.map(c => c.name));

    const datasetNewColumns = [
      { name: 'time_column', type: 'TEXT' },
      { name: 'missing_value_types', type: 'TEXT' }
    ];

    for (const col of datasetNewColumns) {
      if (!datasetColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE sys_dataset ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 检查并添加 conf_column_setting 表的新字段
    const columnSettingInfo = this.db
      .prepare("PRAGMA table_info(conf_column_setting)")
      .all() as { name: string }[];

    const columnSettingColumns = new Set(columnSettingInfo.map(c => c.name));

    const columnSettingNewColumns = [
      { name: 'physical_min', type: 'REAL' },
      { name: 'physical_max', type: 'REAL' },
      { name: 'warning_min', type: 'REAL' },
      { name: 'warning_max', type: 'REAL' },
      { name: 'unit', type: 'TEXT' },
      { name: 'variable_type', type: 'TEXT' }
    ];

    for (const col of columnSettingNewColumns) {
      if (!columnSettingColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE conf_column_setting ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 检查并添加 biz_outlier_result 表的新字段
    const outlierResultInfo = this.db
      .prepare("PRAGMA table_info(biz_outlier_result)")
      .all() as { name: string }[];

    const outlierResultColumns = new Set(outlierResultInfo.map(c => c.name));

    const outlierResultNewColumns = [
      { name: 'dataset_id', type: 'INTEGER' },
      { name: 'total_rows', type: 'INTEGER DEFAULT 0' },
      { name: 'outlier_rate', type: 'REAL DEFAULT 0' }
    ];

    for (const col of outlierResultNewColumns) {
      if (!outlierResultColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE biz_outlier_result ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 检查并添加 biz_outlier_detail 表的新字段
    const outlierDetailInfo = this.db
      .prepare("PRAGMA table_info(biz_outlier_detail)")
      .all() as { name: string }[];

    const outlierDetailColumns = new Set(outlierDetailInfo.map(c => c.name));

    const outlierDetailNewColumns = [
      { name: 'time_point', type: 'DATETIME' }
    ];

    for (const col of outlierDetailNewColumns) {
      if (!outlierDetailColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE biz_outlier_detail ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 检查并添加 biz_outlier_column_stat 表的新字段
    const outlierColumnStatInfo = this.db
      .prepare("PRAGMA table_info(biz_outlier_column_stat)")
      .all() as { name: string }[];

    const outlierColumnStatColumns = new Set(outlierColumnStatInfo.map(c => c.name));

    const outlierColumnStatNewColumns = [
      { name: 'missing_count', type: 'INTEGER DEFAULT 0' }
    ];

    for (const col of outlierColumnStatNewColumns) {
      if (!outlierColumnStatColumns.has(col.name)) {
        this.db.exec(`ALTER TABLE biz_outlier_column_stat ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // 迁移 biz_outlier_result 表以修复 CHECK 约束
    this.migrateOutlierResultTable();
  }

  /**
   * 迁移 biz_outlier_result 表 - 修复 status CHECK 约束
   * SQLite 不支持直接修改 CHECK 约束，需要重建表
   */
  private migrateOutlierResultTable(): void {
    if (!this.db) return;

    // 检查当前表的 CHECK 约束是否需要更新
    const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='biz_outlier_result'").get() as { sql: string } | undefined;

    if (!tableInfo) return;

    // 如果已经包含 'RUNNING' 和 'COMPLETED' 状态，则不需要迁移
    if (tableInfo.sql.includes('RUNNING') && tableInfo.sql.includes('COMPLETED') && tableInfo.sql.includes('FAILED')) {
      return;
    }

    console.log('正在迁移 biz_outlier_result 表以更新 CHECK 约束...');

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

    console.log('biz_outlier_result 表迁移完成');
  }
}
