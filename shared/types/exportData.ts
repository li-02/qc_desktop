/**
 * 数据导出相关类型定义
 */

/** 导出文件格式 */
export type ExportFormat = "csv" | "csv_bom" | "xlsx";

/** CSV 分隔符 */
export type ExportDelimiter = "," | ";" | "\t";

/** 导出配置选项 */
export interface ExportOptions {
  /** 数据版本 ID */
  versionId: number;
  /** 导出的列名列表（空数组=全部导出） */
  selectedColumns: string[];
  /** 文件格式 */
  format: ExportFormat;
  /** CSV 分隔符 */
  delimiter: ExportDelimiter;
  /** 缺失值输出表示 */
  missingValueOutput: string;
  /** 是否包含表头行 */
  includeHeader: boolean;
  /** 默认文件名 */
  defaultFileName?: string;
}

/** 导出预览请求 */
export interface ExportPreviewRequest {
  versionId: number;
  maxRows?: number;
}

/** 列信息 */
export interface ExportColumnInfo {
  name: string;
  index: number;
  sampleValues: string[];
  missingCount: number;
  totalCount: number;
}

/** 导出预览结果 */
export interface ExportPreviewResult {
  columns: ExportColumnInfo[];
  sampleData: Record<string, string>[];
  totalRows: number;
  filePath: string;
}
