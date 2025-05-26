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
    DELETE: "datasets/delete",
  },

  // 文件处理
  FILES: {
    PARSE_PREVIEW: "files/parse-preview",
  },

  // 菜单事件
  MENU: {
    OPEN_CREATE_PROJECT: "open-create-project-dialog",
    OPEN_IMPORT_DATA: "open-import-data-dialog",
  },
} as const;
