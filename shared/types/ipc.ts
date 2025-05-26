import type {
  DatasetBaseInfo,
  DatasetInfo,
  ImportOption,
  ProjectBaseInfo,
  ProjectInfo,
} from "./projectInterface";
import type { TableColumn } from "./table";

export interface IPCChannels {
  "get-projects": {
    request: void;
    response: ProjectInfo[];
  };
  "create-project": {
    request: {
      name: string;
      siteInfo: {
        longitude: string;
        latitude: string;
        altitude: string;
      };
    };
    response: {
      success: boolean;
      project?: ProjectBaseInfo;
      error?: string;
    };
  };
  "check-project-name": {
    request: string;
    response: {
      success: boolean;
      isAvailable: boolean;
      error?: string;
    };
  };
  // 删除项目
  "delete-project": {
    request: string;
    response: {
      success: boolean;
      error?: string;
    };
  };

  // 文件解析预览
  "parse-file-preview": {
    request: {
      fileType: "csv" | "excel";
      fileContent: string | ArrayBuffer;
      maxRows?: number;
    };
    response: {
      success: boolean;
      data?: {
        columns: TableColumn[];
        tableData: any[];
        totalRows: number;
      };
      error?: string;
    };
  };
  // 导入数据集
  "import-data": {
    request: {
      projectId: string;
      importOption: ImportOption;
    };
    response: {
      success: boolean;
      datasets?: {
        id: string;
        name: string;
        type: string;
        path: string;
        originalFileName: string;
        rows: number;
        columns: string[];
        createdAt: number;
      };
      error?: string;
    };
  };

  // 删除数据集
  "delete-dataset": {
    request: {
      projectId: string;
      datasetId: string;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  // 修改数据集
  "update-data": {
    request: {
      projectId: string;
      datasetId: string;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  // 获取项目的所有数据集
  "get-project-datasets": {
    request: string;
    response: {
      success: boolean;
      error?: string;
      datasets?: DatasetBaseInfo[];
    };
  };

  // 获取单个数据集详情
  "get-dataset-info": {
    request: {
      projectId: string;
      datasetId: string;
    };
    response: {
      success: boolean;
      error?: string;
      dataset?: DatasetInfo;
    };
  };
}
