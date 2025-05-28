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
