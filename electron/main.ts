import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import { ProjectManager } from "./project";
import { IPCManager } from "./core/IPCManager";
import { ControllerRegistry } from "./core/ControllerRegistry";

// 保持窗口对象的全局引用，避免JavaScript对象被垃圾回收时窗口关闭
let mainWindow: BrowserWindow | null = null;
// 项目根目录 项目索引目录
let projectsDir: string;
let indexPath: string;
let projectManager: ProjectManager;
// 控制器注册器
let controllerRegistry: ControllerRegistry;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 菜单栏模板
  const menuBar = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建项目",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("open-create-project-dialog");
            }
          },
        },
        {
          label: "导入数据",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("open-import-data-dialog");
            }
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(menuBar);
  Menu.setApplicationMenu(menu);

  // 设置项目根目录和索引文件路径
  projectsDir = path.join(app.getAppPath(), "projects");
  indexPath = path.join(projectsDir, "index.json");
  projectManager = new ProjectManager(projectsDir, indexPath);

  // 根据环境加载不同的URL
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../frontend/dist/index.html"));
  }

  // 监听窗口关闭事件
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIPC();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function setupIPC() {
  // 初始化IPC管理器
  IPCManager.initialize();

  // 创建并注册控制器
  controllerRegistry = new ControllerRegistry(projectManager);
  controllerRegistry.registerAllRoutes();

  console.log("IPC路由设置完成");
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  // 清理资源
  if (controllerRegistry) {
    controllerRegistry.cleanup();
  }
});
