// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";
import * as fs from "fs";
import * as path from "path";
// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  // 这里可以添加你需要在渲染进程中使用的函数
  // 监听“新建项目”菜单项的点击事件
  onOpenCreateProjectDialog: (callback: () => void) => {
    ipcRenderer.on("open-create-project-dialog", callback);
  },
  // 监听“导入数据”菜单项的点击事件
  onOpenImportDataDialog: (callback: () => void) => {
    ipcRenderer.on("open-import-data-dialog", callback);
  },
  // -------------------------
  // 项目管理功能
  getProjects: () => ipcRenderer.invoke("get-projects"),
  createProject: (projectInfo: any) =>
    ipcRenderer.invoke("create-project", projectInfo),
  checkProjectName: (name: string) =>
    ipcRenderer.invoke("check-project-name", name),
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke("delete-project", projectId),
  // -------------------------
  // 文件
  parseFilePreview: (fileType: string, fileContent: any, maxRows = 20) => {
    ipcRenderer.invoke("parse-file-preview", fileType, fileContent, maxRows);
  },
});
