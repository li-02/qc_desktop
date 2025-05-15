# Electron项目架构与通信机制

## 项目总体架构

Electron应用由两个主要部分组成：

- **主进程(Main Process)** - 运行Node.js代码，可访问系统API
- **渲染进程(Renderer Process)** - 运行Web代码(Vue/React等)，负责UI展示

## 通信流程

```
渲染进程 (Vue应用) <--> preload.ts <--> main.ts <--> 系统资源(文件系统等)
```

### 主要文件及其作用

#### `main.ts` - 主进程

```typescript
// 设置IPC通信处理程序
function setupIPC() {
    ipcMain.handle('get-projects', async () => {
        return projectManager.getProjects();
    });

    ipcMain.handle('create-project', async (event, projectInfo) => {
        try {
            const project = projectManager.createProject(projectInfo);
            return {success: true, project};
        } catch (err: any) {
            return {success: false, error: err.message};
        }
    });

    // 其他IPC处理程序...
}
```

主要职责：

- 创建应用窗口
- 管理应用生命周期
- 访问系统资源(文件系统等)
- 处理来自渲染进程的请求
- 管理项目数据和文件操作

#### `preload.ts` - 预加载脚本

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
    // 暴露API给渲染进程
    getProjects: () => ipcRenderer.invoke('get-projects'),
    createProject: (projectInfo: any) => ipcRenderer.invoke('create-project', projectInfo),
    // 其他API...
});
```

主要职责：

- 为渲染进程提供安全的API
- 在主进程和渲染进程之间建立通信桥梁
- 维护上下文隔离，确保安全性

#### `project.ts` - 项目管理模块

```typescript
export class ProjectManager {
    // 项目管理功能
    public getProjects(): ProjectInfo[] { /*...*/
    }

    public createProject(projectInfo: { ... }): ProjectInfo { /*...*/
    }

    public deleteProject(projectId: string): boolean { /*...*/
    }

    // 其他方法...
}
```

主要职责：

- 项目CRUD操作
- 项目索引文件管理
- 文件系统交互

#### Vue组件 - 渲染进程

```typescript
// 加载项目列表
const loadProjects = async () => {
    if (window.electronAPI) {
        const projects = await window.electronAPI.getProjects();
        // 处理和显示项目列表
    }
};
```

主要职责：

- 用户界面展示
- 用户交互处理
- 通过electronAPI与主进程通信

## 通信模式

### 1. 请求-响应模式

渲染进程调用主进程功能并等待结果：

```
渲染进程: window.electronAPI.getProjects()
↓
预加载脚本: ipcRenderer.invoke('get-projects')
↓
主进程: ipcMain.handle('get-projects', ...)
↓
主进程: 执行操作，返回结果
↑
预加载脚本: 将结果通过Promise返回
↑
渲染进程: await window.electronAPI.getProjects()
```

### 2. 事件通知模式

主进程向渲染进程发送事件：

```
主进程: mainWindow.webContents.send('open-create-project-dialog')
↓
预加载脚本: ipcRenderer.on('open-create-project-dialog', callback)
↓
渲染进程: 执行注册的回调函数
```

## 数据存储

项目数据通过文件系统存储：

- 项目目录结构: `/projects/{项目名}/`
- 项目索引文件: `/projects/index.json`
- 项目配置文件: `/projects/{项目名}/project.json`

### 索引文件结构

```json
{
  "lastUpdated": 1684123456789,
  "projects": [
    {
      "id": "项目_1684123456789",
      "name": "项目",
      "path": "/.../projects/项目",
      "createdAt": 1684123456789,
      "siteInfo": {
        "longitude": "116.123",
        "latitude": "39.456",
        "altitude": "50"
      }
    }
  ]
}
```

## 项目生命周期

1. **创建项目**
    - 用户输入项目信息
    - 检查项目名称唯一性
    - 创建项目目录
    - 保存项目配置
    - 更新项目索引
    - 刷新UI显示

2. **查询项目**
    - 读取项目索引文件
    - 验证项目目录存在性
    - 返回有效项目列表
    - 在UI中展示

3. **删除项目**
    - 确认删除操作
    - 删除项目目录
    - 从索引中移除项目
    - 更新项目索引
    - 刷新UI显示

## 安全考量

- 使用contextBridge实现上下文隔离
- 精确控制渲染进程可用的API
- 所有文件系统操作都在主进程执行
- 错误处理和参数验证保障应用稳定性