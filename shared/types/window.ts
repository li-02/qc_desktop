import type { ElectronAPI } from "./electron-api";

// 全局 Window 对象扩展
export interface ElectronWindow extends Window {
  electronAPI?: ElectronAPI;
}
