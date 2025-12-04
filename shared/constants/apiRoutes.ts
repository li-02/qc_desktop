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
    DELETE: "datasets/delete",
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
    DELETE_DETECTION_RESULT: "outlier/delete-detection-result",
  },

  // 菜单事件
  MENU: {
    OPEN_CREATE_PROJECT: "open-create-project-dialog",
    OPEN_IMPORT_DATA: "open-import-data-dialog",
  },
} as const;
