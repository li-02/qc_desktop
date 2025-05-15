import {app, BrowserWindow, ipcMain, Menu} from 'electron'; // 引入Menu模块
import * as path from 'path';
import {ProjectManager} from "./project";

// 保持窗口对象的全局引用，避免JavaScript对象被垃圾回收时窗口关闭
let mainWindow: BrowserWindow | null = null;
// 项目根目录 项目索引目录
let projectsDir: string;
let indexPath: string;
let projectManager: ProjectManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // 我们将添加预加载脚本
    }
  });

  // 菜单栏模板
  const menuBar=[
    {
      label: '文件',
      submenu:[
        {label:'新建项目',click:()=>{
          if(mainWindow){
            mainWindow.webContents.send('open-create-project-dialog');
          }
        }},
        {label:'导入数据',click:()=>{
          if(mainWindow){
            mainWindow.webContents.send('open-import-data-dialog');
          }
        }}
      ]
    }
  ];
  const menu=Menu.buildFromTemplate(menuBar); // 构建菜单栏
  Menu.setApplicationMenu(menu); // 设置菜单栏

  // 设置项目根目录和索引文件路径
  projectsDir = path.join(app.getAppPath(), 'projects');
  indexPath = path.join(projectsDir, 'index.json');
  projectManager = new ProjectManager(projectsDir, indexPath);

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

  // 设置IPC通信
  setupIPC();

  app.on('activate', () => {
    // 在macOS上，当dock图标被点击且没有其他窗口打开时，通常会重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function setupIPC() {
  ipcMain.handle('get-projects', async () => {
    return projectManager.getProjects();
  });
  // 创建新项目
  ipcMain.handle('create-project', async (event, projectInfo) => {
    try {
      const project = projectManager.createProject(projectInfo);
      return {success: true, project};
    } catch (err: any) {
      return {success: false, error: err.message};
    }
  });
  // 检查项目名
  ipcMain.handle('check-project-name', async (event, name) => {
    try {
      const isAvailable = projectManager.checkProjectName(name);
      return {success: true, isAvailable};
    } catch (err: any) {
      return {success: false, error: err.message};
    }
  })
  // 删除项目
  ipcMain.handle('delete-project', async (event, projectId) => {
    try {
      projectManager.deleteProject(projectId);
      return {success: true}
    } catch (e: any) {
      return {success: false, error: e.message};
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});