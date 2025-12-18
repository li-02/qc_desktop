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
    // 存储可用的插补方法及其默认参数
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conf_imputation_method (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 方法唯一标识
        method_id TEXT NOT NULL UNIQUE,        -- 方法标识符 (如 MEAN/LINEAR/ARIMA)
        method_name TEXT NOT NULL,             -- 方法显示名称
        category TEXT NOT NULL CHECK(category IN ('basic', 'statistical', 'timeseries', 'ml', 'dl')),  -- 方法分类
        description TEXT,                      -- 方法描述
        default_params TEXT,                   -- 默认参数 (JSON格式)
        requires_python BOOLEAN DEFAULT 0,     -- 是否需要Python环境
        is_available BOOLEAN DEFAULT 1,        -- 是否可用
        estimated_time TEXT CHECK(estimated_time IN ('fast', 'medium', 'slow')),  -- 预估耗时
        accuracy TEXT CHECK(accuracy IN ('low', 'medium', 'high')),  -- 准确度等级
        priority INTEGER DEFAULT 0,            -- 显示优先级
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_del BOOLEAN DEFAULT 0
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
        dataset_id INTEGER NOT NULL,           -- 数据集ID
        method_id TEXT NOT NULL,               -- 插补方法
        model_name TEXT,                       -- 模型名称
        model_path TEXT,                       -- 模型文件路径
        model_params TEXT,                     -- 模型参数 (JSON)
        training_columns TEXT,                 -- 训练使用的列 (JSON数组)
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
    `);

    // 插入默认的插补方法配置
    this.insertDefaultImputationMethods();
  }

  /**
   * 插入默认的插补方法配置
   */
  private insertDefaultImputationMethods(): void {
    if (!this.db) return;

    const defaultMethods = [
      // 基础方法
      { method_id: 'MEAN', method_name: '均值填充', category: 'basic', description: '使用列均值填充缺失值', requires_python: 0, estimated_time: 'fast', accuracy: 'low', priority: 100 },
      { method_id: 'MEDIAN', method_name: '中位数填充', category: 'basic', description: '使用列中位数填充缺失值', requires_python: 0, estimated_time: 'fast', accuracy: 'low', priority: 99 },
      { method_id: 'MODE', method_name: '众数填充', category: 'basic', description: '使用列众数填充缺失值', requires_python: 0, estimated_time: 'fast', accuracy: 'low', priority: 98 },
      { method_id: 'FORWARD_FILL', method_name: '向前填充', category: 'basic', description: '使用前一个有效值填充', requires_python: 0, estimated_time: 'fast', accuracy: 'low', priority: 97 },
      { method_id: 'BACKWARD_FILL', method_name: '向后填充', category: 'basic', description: '使用后一个有效值填充', requires_python: 0, estimated_time: 'fast', accuracy: 'low', priority: 96 },
      // 统计方法
      { method_id: 'LINEAR', method_name: '线性插值', category: 'statistical', description: '基于线性关系进行插值', requires_python: 0, estimated_time: 'fast', accuracy: 'medium', priority: 90 },
      { method_id: 'SPLINE', method_name: '样条插值', category: 'statistical', description: '使用样条曲线进行插值', requires_python: 0, estimated_time: 'fast', accuracy: 'medium', priority: 89 },
      { method_id: 'POLYNOMIAL', method_name: '多项式插值', category: 'statistical', description: '使用多项式曲线进行插值', requires_python: 0, estimated_time: 'fast', accuracy: 'medium', priority: 88 },
      { method_id: 'SEASONAL', method_name: '季节性插值', category: 'statistical', description: '考虑季节性模式的插值', requires_python: 1, estimated_time: 'medium', accuracy: 'high', priority: 87 },
      // 时序方法
      { method_id: 'ARIMA', method_name: 'ARIMA模型', category: 'timeseries', description: '基于ARIMA时序模型的插补', requires_python: 1, estimated_time: 'medium', accuracy: 'high', priority: 80 },
      { method_id: 'SARIMA', method_name: 'SARIMA模型', category: 'timeseries', description: '考虑季节性的ARIMA模型', requires_python: 1, estimated_time: 'medium', accuracy: 'high', priority: 79 },
      { method_id: 'ETS', method_name: 'ETS模型', category: 'timeseries', description: '指数平滑状态空间模型', requires_python: 1, estimated_time: 'medium', accuracy: 'high', priority: 78 },
      // 机器学习方法
      { method_id: 'KNN', method_name: 'KNN插补', category: 'ml', description: '基于K近邻算法的插补', requires_python: 1, estimated_time: 'medium', accuracy: 'high', priority: 70 },
      { method_id: 'RANDOM_FOREST', method_name: '随机森林', category: 'ml', description: '基于随机森林的插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 69 },
      { method_id: 'MICE', method_name: 'MICE多重插补', category: 'ml', description: '链式方程多重插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 68 },
      { method_id: 'MISSFOREST', method_name: 'MissForest', category: 'ml', description: '基于随机森林的迭代插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 67 },
      // 深度学习方法
      { method_id: 'LSTM', method_name: 'LSTM网络', category: 'dl', description: '基于LSTM的时序插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 60 },
      { method_id: 'GRU', method_name: 'GRU网络', category: 'dl', description: '基于GRU的时序插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 59 },
      { method_id: 'TRANSFORMER', method_name: 'Transformer', category: 'dl', description: '基于Transformer的插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 58 },
      { method_id: 'VAE', method_name: 'VAE变分自编码器', category: 'dl', description: '基于变分自编码器的插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 57 },
      { method_id: 'GAIN', method_name: 'GAIN生成对抗网络', category: 'dl', description: '基于GAN的缺失值插补', requires_python: 1, estimated_time: 'slow', accuracy: 'high', priority: 56 },
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO conf_imputation_method 
        (method_id, method_name, category, description, requires_python, estimated_time, accuracy, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const method of defaultMethods) {
      insertStmt.run(
        method.method_id,
        method.method_name,
        method.category,
        method.description,
        method.requires_python,
        method.estimated_time,
        method.accuracy,
        method.priority
      );
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
