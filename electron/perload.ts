// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 这里可以添加你需要在渲染进程中使用的函数
  sendMessage: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },
  receiveMessage: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  }
});