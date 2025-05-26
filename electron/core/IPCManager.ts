import { ipcMain, IpcMainInvokeEvent } from "electron";

// IPC处理器类型定义
type IPCHandler = (args: any, event: IpcMainInvokeEvent) => Promise<any>;

export class IPCManager {
  private static routes = new Map<string, IPCHandler>();

  /**
   * 注册IPC路由
   */
  static registerRoute(channel: string, handler: IPCHandler) {
    this.routes.set(channel, handler);
  }

  /**
   * 初始化IPC管理器
   */
  static initialize() {
    // 统一的IPC调用入口
    ipcMain.handle("ipc-invoke", async (event, channel: string, args: any) => {
      if (this.routes.has(channel)) {
        const handler = this.routes.get(channel)!;
        try {
          return await handler(args, event);
        } catch (error: any) {
          console.error(`IPC路由 ${channel} 处理失败:`, error);
          return { success: false, error: error.message };
        }
      }
      console.error(`未找到IPC路由: ${channel}`);
      return { success: false, error: `未找到路由: ${channel}` };
    });

    console.log("IPC管理器已初始化");
  }

  /**
   * 获取所有已注册的路由
   */
  static getRegisteredRoutes(): string[] {
    return Array.from(this.routes.keys());
  }
}
