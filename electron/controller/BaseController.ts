import { IpcMainInvokeEvent } from "electron";

export abstract class BaseController {
  /**
   * 统一的响应格式
   */
  protected success<T = any>(data: T): { success: true; data: T } {
    return { success: true, data };
  }

  protected error(message: string): { success: false; error: string } {
    return { success: false, error: message };
  }

  /**
   * 异步错误处理装饰器
   */
  protected async handleAsync<T>(
    operation: () => Promise<T>
  ): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
      const result = await operation();
      return this.success(result);
    } catch (error: any) {
      console.error("控制器操作失败:", error);
      return this.error(error.message || "操作失败");
    }
  }
}
