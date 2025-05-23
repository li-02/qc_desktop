import {ImportOption, ProjectBaseInfo, ProjectInfo} from "./projectInterface";
import {TableColumn} from "./table";

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

  "import-data": {
    request: {
      projectId: string;
      importOption: ImportOption;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };


}
