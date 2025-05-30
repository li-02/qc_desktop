export interface ProjectsIndexFile {
  lastUpdated: number;
  projects: ProjectBaseInfo[];
}
// 项目基本信息
export interface ProjectBaseInfo {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}
// 项目信息
export interface ProjectInfo extends ProjectBaseInfo {
  lastUpdated: number;
  siteInfo: {
    longitude: string;
    latitude: string;
    altitude: string;
  };
  datasets: {
    id: string;
    name: string; //数据集名字
    type: string;
    dirPath: string; // 数据集目录
    originalFile: string;
    createdAt: number;
    belongTo: string; // 所属项目 id
  }[];
}
// 数据质量信息接口
export interface DataQualityInfo {
  totalRecords: number;
  completeRecords: number;
  missingValueStats: Record<string, number>; // 各类型缺失值统计
  totalMissingCount: number;
  qualityPercentage: number; // 数据质量百分比
  analyzedAt: number; // 分析时间戳
}
export interface DatasetBaseInfo {
  id: string;
  name: string;
  type: string;
  dirPath: string;
  originalFile: string;
  createdAt: number;
  belongTo: string; // 所属项目 id
}

export interface DatasetInfo {
  id: string;
  name: string;
  type: string;
  createdAt: number;
  updatedAt: number;
  belongTo: string;
  dirPath: string;
  missingValueTypes: string[];
  originalFile: {
    name: string;
    filePath: string;
    size: string;
    rows: number;
    columns: string[];
  };
  // 这部分有待扩展
  processedFiles: {
    name: string;
    filePath: string;
    size: string;
    rows: number;
    columns: string[];
  }[]; // 处理后的文件
  dataQuality?: DataQualityInfo; // 数据质量信息
}

// 创建项目的请求参数
export interface CreateProjectRequest {
  name: string;
  siteInfo: {
    longitude: string;
    latitude: string;
    altitude: string;
  };
}
export interface ImportOption {
  type: string;
  file: {
    name: string;
    path: string;
    size: string;
  };
  datasetName: string;
  missingValueTypes: string[];
  rows: number;
  columns: string[];
}
// 导入数据集的请求参数
export interface ImportDatasetRequest {
  projectId: string;
  datasetName: string;
  type: string;
  file: {
    name: string;
    size: string;
    path: string;
  };
  missingValueTypes: string[];
  rows: number;
  columns: string[];
}

// 统一的响应格式
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// 文件系统操作接口
export interface FileSystemOperation {
  path: string;
  operation: "read" | "write" | "delete" | "exists";
  data?: any;
}
// 缺失值统计信息
export interface MissingValueStats {
  [missingType: string]: number; // 每种缺失值类型的出现次数
}

// 文件解析结果
export interface FileParseResult {
  columns: { prop: string; label: string }[]; // 列信息
  tableData: any[]; // 表格数据
  totalRows: number; // 总行数
  missingValueStats?: MissingValueStats; // 缺失值统计信息
  totalMissingCount: number; // 总缺失值计数
}
// 文件解析请求参数
export interface FileParseRequest {
  fileType: "csv" | "excel";
  fileContent: string | ArrayBuffer;
  maxRows?: number;
  missingValueTypes: string[]; // 新增：缺失值类型列表
}

// Worker 线程消息格式
export interface WorkerMessage {
  type: "csv" | "excel";
  data: string | ArrayBuffer;
  maxRows: number;
  missingValueTypes: string[]; // 新增：缺失值类型
}

// Worker 线程返回结果
export interface WorkerResult {
  success: boolean;
  data?: FileParseResult;
  error?: string;
}
