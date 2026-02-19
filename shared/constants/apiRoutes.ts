export const API_ROUTES = {
  // 项目管理
  PROJECTS: {
    GET_ALL: "projects/get-all",
    CREATE: "projects/create",
    CHECK_NAME: "projects/check-name",
    DELETE: "projects/delete",
  },

  // 数据集管理
  DATASETS: {
    IMPORT: "datasets/import",
    GET_BY_PROJECT: "datasets/get-by-project",
    GET_INFO: "datasets/get-info",
    GET_VERSIONS: "datasets/get-versions",
    GET_VERSION_STATS: "datasets/get-version-stats",
    EXPORT: "datasets/export",
    DELETE: "datasets/delete",
    GET_VERSION_MISSING_STATS: "datasets/get-version-missing-stats",
    UPDATE: "datasets/update",
  },

  // 文件处理
  FILES: {
    PARSE_PREVIEW: "files/parse-preview",
    PARSE_FULL: "files/parse-full",
    READ_CSV_DATA: "files/read-csv-data",
  },

  // 异常检测
  OUTLIER: {
    // 检测方法
    GET_METHODS: "outlier/get-methods",

    // 列阈值配置
    GET_COLUMN_THRESHOLDS: "outlier/get-column-thresholds",
    UPDATE_COLUMN_THRESHOLD: "outlier/update-column-threshold",
    BATCH_UPDATE_THRESHOLDS: "outlier/batch-update-thresholds",

    // 阈值模板
    GET_TEMPLATES: "outlier/get-templates",
    APPLY_TEMPLATE: "outlier/apply-template",

    // 检测配置 (三级作用域)
    GET_DETECTION_CONFIGS: "outlier/get-detection-configs",
    CREATE_DETECTION_CONFIG: "outlier/create-detection-config",
    UPDATE_DETECTION_CONFIG: "outlier/update-detection-config",
    DELETE_DETECTION_CONFIG: "outlier/delete-detection-config",

    // 阈值解析
    RESOLVE_THRESHOLD: "outlier/resolve-threshold",

    // 检测执行
    EXECUTE_THRESHOLD_DETECTION: "outlier/execute-threshold-detection",
    GET_DETECTION_RESULTS: "outlier/get-detection-results",
    GET_RESULT_DETAILS: "outlier/get-result-details",
    GET_RESULT_STATS: "outlier/get-result-stats",
    DELETE_DETECTION_RESULT: "outlier/delete-detection-result",
    RENAME_DETECTION_RESULT: "outlier/rename-detection-result",

    // 结果应用与回退
    APPLY_FILTERING: "outlier/apply-filtering",
    REVERT_FILTERING: "outlier/revert-filtering",
  },

  // 系统设置
  SETTINGS: {
    GET_ALL: "settings/get-all",
    GET: "settings/get",
    UPDATE: "settings/update",
    UPDATE_BATCH: "settings/update-batch",
    GET_TIMEZONE: "settings/get-timezone",
    SET_TIMEZONE: "settings/set-timezone",
  },

  // 缺失值插补
  IMPUTATION: {
    // 方法管理
    GET_METHODS: "imputation:getMethods",
    GET_METHODS_BY_CATEGORY: "imputation:getMethodsByCategory",
    GET_AVAILABLE_METHODS: "imputation:getAvailableMethods",
    GET_METHOD_PARAMS: "imputation:getMethodParams",
    GET_METHOD_WITH_PARAMS: "imputation:getMethodWithParams",
    // 执行插补
    EXECUTE: "imputation:execute",
    // 结果管理
    GET_RESULT: "imputation:getResult",
    GET_RESULTS_BY_DATASET: "imputation:getResultsByDataset",
    GET_DETAILS: "imputation:getDetails",
    GET_COLUMN_STATS: "imputation:getColumnStats",
    DELETE_RESULT: "imputation:deleteResult",
    APPLY_VERSION: "imputation:applyVersion",
    EXPORT_FILE: "imputation:exportFile",
  },

  // 通量分割
  FLUX_PARTITIONING: {
    EXECUTE: "fluxPartitioning:execute",
    GET_RESULTS_BY_DATASET: "fluxPartitioning:getResultsByDataset",
    GET_RESULT: "fluxPartitioning:getResult",
    DELETE_RESULT: "fluxPartitioning:deleteResult",
  },

  // 数据导出
  EXPORT: {
    GET_PREVIEW: "export:getPreview",
    EXECUTE: "export:execute",
  },

  // 菜单事件
  MENU: {
    OPEN_CREATE_PROJECT: "open-create-project-dialog",
    OPEN_IMPORT_DATA: "open-import-data-dialog",
  },
} as const;
