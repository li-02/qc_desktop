import { contextBridge, ipcRenderer } from "electron";

// 统一的IPC调用接口
const electronAPI = {
  // 统一的IPC调用方法
  invoke: async (channel: string, args?: any) => {
    try {
      const result = await ipcRenderer.invoke("ipc-invoke", channel, args);
      return result;
    } catch (error: any) {
      console.error("IPC调用失败:", error);
      return { success: false, error: error.message };
    }
  },

  // 监听主进程事件
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, callback);
  },

  // 移除事件监听
  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

// 暴露API到渲染进程
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// 添加调试日志
console.log("Preload script loaded, electronAPI:", electronAPI);
