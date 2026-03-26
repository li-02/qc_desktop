// MySQL 连接配置
export interface MySQLConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// MySQL 表/视图信息
export interface MySQLTableInfo {
  name: string;
  type: "TABLE" | "VIEW";
  rowCount?: number;
}

// MySQL 表预览结果
export interface MySQLTablePreview {
  columns: string[];
  rows: any[][];
  totalCount: number;
}

// MySQL 导入请求参数
export interface MySQLImportRequest {
  categoryId: string;
  datasetName: string;
  dataType: string;
  connection: MySQLConnectionConfig;
  table: string;
  missingValueTypes: string[];
}

// MySQL 导入进度
export interface MySQLImportProgress {
  status: "connecting" | "fetching" | "processing" | "completed" | "failed";
  message: string;
  datasetName: string;
  error?: string;
}
