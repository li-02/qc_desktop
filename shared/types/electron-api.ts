import type { IPCChannels } from "./ipc";

// 预加载脚本暴露的 API 类型
export interface ElectronAPI {
  // 基础通信
  sendMessage: (channel: string, data: any) => void;
  receiveMessage: (channel: string, func: (...args: any[]) => void) => void;

  // 菜单事件
  onOpenCreateProjectDialog: (callback: () => void) => void;
  onOpenImportDataDialog: (callback: () => void) => void;

  // 项目管理
  getProjects: () => Promise<IPCChannels["get-projects"]["response"]>;

  createProject: (
    projectInfo: IPCChannels["create-project"]["request"]
  ) => Promise<IPCChannels["create-project"]["response"]>;

  checkProjectName: (
    name: IPCChannels["check-project-name"]["request"]
  ) => Promise<IPCChannels["check-project-name"]["response"]>;

  deleteProject: (
    projectId: IPCChannels["delete-project"]["request"]
  ) => Promise<IPCChannels["delete-project"]["response"]>;

  // 文件处理
  parseFilePreview: (
    fileType: IPCChannels["parse-file-preview"]["request"]["fileType"],
    fileContent: IPCChannels["parse-file-preview"]["request"]["fileContent"],
    maxRows?: number
  ) => Promise<IPCChannels["parse-file-preview"]["response"]>;

  importData: (
    projectId: IPCChannels["import-data"]["request"]["projectId"],
    importOptions: IPCChannels["import-data"]["request"]["importOption"]
  ) => Promise<IPCChannels["import-data"]["response"]>;
}
