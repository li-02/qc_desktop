// src/types/electron.d.ts
interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  siteInfo: {
    longitude: string;
    latitude: string;
    altitude: string;
  };
}

interface ElectronAPI {
  // 基础通信
  sendMessage: (channel: string, data: any) => void;
  receiveMessage: (channel: string, func: (...args: any[]) => void) => void;

  // 菜单事件
  onOpenCreateProjectDialog: (callback: () => void) => void;
  onOpenImportDataDialog: (callback: () => void) => void;

  // 项目管理
  getProjects: () => Promise<ProjectInfo[]>;
  createProject: (projectInfo: {
    name: string;
    siteInfo: {
      longitude: string;
      latitude: string;
      altitude: string;
    };
  }) => Promise<{success: boolean; project?: ProjectInfo; error?: string}>;
  checkProjectName: (name: string) => Promise<{success: boolean; isAvailable: boolean; error?: string}>;
  deleteProject: (projectId: string) => Promise<{success: boolean; error?: string}>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export type {ProjectInfo, ElectronAPI};
