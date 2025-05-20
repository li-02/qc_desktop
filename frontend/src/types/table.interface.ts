// 表头列定义
export interface TableColumn {
  prop: string;
  label: string;
}

// 文件处理结果
export interface FileProcessResult {
  columns: TableColumn[];
  tableData: any[];
}
