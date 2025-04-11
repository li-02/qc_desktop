import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

// 保持窗口对象的全局引用，避免JavaScript对象被垃圾回收时窗口关闭
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js') // 我们将添加预加载脚本
    }
  });

  // 根据环境加载不同的URL
  if (process.env.NODE_ENV === 'development') {
    // 在开发环境中，确保Vite服务器已经启动
    mainWindow.loadURL('http://localhost:5173');
    // 打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    // 在生产环境中，加载打包后的index.html文件
    mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }

  // 监听窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // 在macOS上，当dock图标被点击且没有其他窗口打开时，通常会重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});