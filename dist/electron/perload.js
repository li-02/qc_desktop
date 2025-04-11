"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// electron/preload.ts
const electron_1 = require("electron");
// 暴露安全的API到渲染进程
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // 这里可以添加你需要在渲染进程中使用的函数
    sendMessage: (channel, data) => {
        electron_1.ipcRenderer.send(channel, data);
    },
    receiveMessage: (channel, func) => {
        electron_1.ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
});
//# sourceMappingURL=perload.js.map