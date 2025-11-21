// electron/main.ts

import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import { IPCManager } from "./core/IPCManager";
import { ControllerRegistry } from "./core/ControllerRegistry";
import { DatabaseManager } from "./core/DatabaseManager";

// 应用状态管理
interface AppState {
  mainWindow: BrowserWindow | null;
  projectsDir: string;
  controllerRegistry: ControllerRegistry | null;
  isReady: boolean;
}

// 全局应用状态
const appState: AppState = {
  mainWindow: null,
  projectsDir: "",
  controllerRegistry: null,
  isReady: false,
};

/**
 * 创建主窗口
 */
function createWindow(): void {
  console.log("正在创建主窗口...");

  appState.mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: true,
    },
    titleBarStyle: "hiddenInset",
    show: false, // 先隐藏，等加载完成后显示
  });

  // 创建应用菜单
  createApplicationMenu();

  // 根据环境加载不同的URL
  if (process.env.NODE_ENV === "development") {
    console.log("开发环境：加载本地开发服务器");
    appState.mainWindow.loadURL("http://localhost:5173");
    appState.mainWindow.webContents.openDevTools();
  } else {
    console.log("生产环境：加载打包后的文件");
    appState.mainWindow.loadFile(path.join(__dirname, "../../frontend/dist/index.html"));
  }

  // 窗口事件监听
  setupWindowEvents();

  console.log("主窗口创建完成");
}

/**
 * 设置窗口事件监听
 */
function setupWindowEvents(): void {
  if (!appState.mainWindow) return;

  // 窗口准备好显示时
  appState.mainWindow.once("ready-to-show", () => {
    console.log("窗口准备就绪，显示主窗口");
    appState.mainWindow?.show();

    if (process.env.NODE_ENV === "development") {
      appState.mainWindow?.webContents.openDevTools();
    }
  });

  // 窗口关闭事件
  appState.mainWindow.on("closed", () => {
    console.log("主窗口已关闭");
    appState.mainWindow = null;
  });

  // 页面加载完成事件
  appState.mainWindow.webContents.once("dom-ready", () => {
    console.log("页面DOM加载完成");
    appState.isReady = true;
  });

  // 页面加载错误处理
  appState.mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error(`页面加载失败: ${errorDescription} (${errorCode}) - ${validatedURL}`);
  });
}

/**
 * 创建应用菜单
 */
function createApplicationMenu(): void {
  const menuTemplate = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建项目",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            if (appState.mainWindow) {
              appState.mainWindow.webContents.send("open-create-project-dialog");
            }
          },
        },
        {
          label: "导入数据",
          accelerator: "CmdOrCtrl+I",
          click: () => {
            if (appState.mainWindow) {
              appState.mainWindow.webContents.send("open-import-data-dialog");
            }
          },
        },
        { type: "separator" },
        {
          label: "退出",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "重做", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "剪切", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "复制", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "粘贴", accelerator: "CmdOrCtrl+V", role: "paste" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", accelerator: "CmdOrCtrl+R", role: "reload" },
        {
          label: "强制重新加载",
          accelerator: "CmdOrCtrl+Shift+R",
          role: "forceReload",
        },
        { label: "切换开发者工具", accelerator: "F12", role: "toggleDevTools" },
        { type: "separator" },
        { label: "实际大小", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
        { label: "放大", accelerator: "CmdOrCtrl+Plus", role: "zoomIn" },
        { label: "缩小", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { type: "separator" },
        { label: "切换全屏", accelerator: "F11", role: "togglefullscreen" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于",
          click: () => {
            if (appState.mainWindow) {
              appState.mainWindow.webContents.send("show-about-dialog");
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate as any);
  Menu.setApplicationMenu(menu);

  console.log("应用菜单创建完成");
}

/**
 * 初始化应用配置
 */
function initializeAppConfig(): void {
  console.log("正在初始化应用配置...");

  // 设置项目根目录
  appState.projectsDir = path.join(app.getAppPath(), "projects");
  console.log(`项目根目录: ${appState.projectsDir}`);

  // 确保项目目录存在
  const fs = require("fs");
  if (!fs.existsSync(appState.projectsDir)) {
    fs.mkdirSync(appState.projectsDir, { recursive: true });
    console.log("项目根目录已创建");
  }

  console.log("应用配置初始化完成");
}

/**
 * 设置IPC通信
 */
function setupIPC(): void {
  console.log("正在设置IPC通信...");

  try {
    // 1. 初始化IPC管理器
    IPCManager.initialize();
    console.log("✓ IPC管理器初始化完成");

    // 2. 创建并配置控制器注册器（移除第二个参数）
    appState.controllerRegistry = new ControllerRegistry(appState.projectsDir);
    console.log("✓ 控制器注册器创建完成");

    // 3. 注册所有路由
    appState.controllerRegistry.registerAllRoutes();
    console.log("✓ 所有路由注册完成");

    // 4. 打印依赖关系图（开发环境）
    if (process.env.NODE_ENV === "development") {
      appState.controllerRegistry.printDependencyGraph();
    }

    // 5. 打印应用健康状态（开发环境）
    if (process.env.NODE_ENV === "development") {
      const healthStatus = appState.controllerRegistry.getHealthStatus();
      console.log("应用健康状态:", healthStatus);
    }

    console.log("IPC系统设置完成");
  } catch (error: any) {
    console.error("IPC设置失败:", error);
    throw new Error(`IPC设置失败: ${error.message}`);
  }
}

/**
 * 应用准备就绪处理
 */
async function onAppReady(): Promise<void> {
  console.log("应用准备就绪，开始初始化...");

  try {
    // 1. 初始化应用配置
    initializeAppConfig();

    // 初始化数据库
    const dbPath = path.join(appState.projectsDir, "qc_metadata.db");
    DatabaseManager.getInstance().initialize(dbPath);
    console.log(`数据库已初始化: ${dbPath}`);

    // 2. 设置IPC通信
    setupIPC();

    // 3. 创建主窗口
    createWindow();

    console.log("应用初始化完成");
  } catch (error: any) {
    console.error("应用初始化失败:", error);

    // 显示错误对话框
    const { dialog } = require("electron");
    dialog.showErrorBox("应用启动失败", `初始化错误: ${error.message}`);

    // 退出应用
    app.quit();
  }
}

/**
 * 应用退出前的清理工作
 */
function onBeforeQuit(): void {
  console.log("应用即将退出，开始清理资源...");

  try {
    if (appState.controllerRegistry) {
      appState.controllerRegistry.cleanup();
      console.log("✓ 控制器资源清理完成");
    }

    console.log("所有资源清理完成");
  } catch (error: any) {
    console.error("资源清理失败:", error);
  }
}

// #region 应用事件监听

// 应用准备就绪
app.whenReady().then(onAppReady);

// 所有窗口关闭
app.on("window-all-closed", () => {
  // macOS下，除非明确退出，否则应用保持活跃状态
  if (process.platform !== "darwin") {
    console.log("所有窗口已关闭，退出应用");
    app.quit();
  }
});

// 应用激活（macOS特有）
app.on("activate", () => {
  // macOS下，当dock图标被点击且没有其他窗口打开时，重新创建一个窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    console.log("重新激活应用，创建新窗口");
    createWindow();
  }
});

// 应用退出前
app.on("before-quit", onBeforeQuit);

// 未处理的异常
process.on("uncaughtException", error => {
  console.error("未处理的异常:", error);
});

// 未处理的Promise拒绝
process.on("unhandledRejection", (reason, promise) => {
  console.error("未处理的Promise拒绝:", reason);
});

// #endregion

// #region 开发环境辅助

if (process.env.NODE_ENV === "development") {
  // 开发环境下的额外配置
  console.log("开发模式已启用");

  // 可以添加热重载、调试工具等开发辅助功能
}

// #endregion

// 导出应用状态（供调试使用）
export { appState };
