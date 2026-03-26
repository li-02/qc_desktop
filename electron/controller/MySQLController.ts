import { IpcMainInvokeEvent, BrowserWindow } from "electron";
import { BaseController } from "./BaseController";
import { MySQLService } from "../service/MySQLService";
import { MySQLConnectionConfig, MySQLImportRequest } from "@shared/types/mysqlInterface";

export class MySQLController extends BaseController {
  private mysqlService: MySQLService;

  constructor(mysqlService: MySQLService) {
    super();
    this.mysqlService = mysqlService;
  }

  /**
   * 测试 MySQL 连接
   */
  async testConnection(args: { connection: MySQLConnectionConfig }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const validationError = this.validateConnectionConfig(args.connection);
      if (validationError) throw new Error(validationError);

      const result = await this.mysqlService.testConnection(args.connection);
      if (!result.success) throw new Error(result.error);
      return result.data;
    });
  }

  /**
   * 获取数据库所有表和视图
   */
  async getTables(args: { connection: MySQLConnectionConfig }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const validationError = this.validateConnectionConfig(args.connection);
      if (validationError) throw new Error(validationError);

      const result = await this.mysqlService.getTables(args.connection);
      if (!result.success) throw new Error(result.error);
      return { tables: result.data };
    });
  }

  /**
   * 获取表预览数据
   */
  async getTablePreview(
    args: { connection: MySQLConnectionConfig; table: string; limit?: number },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      const validationError = this.validateConnectionConfig(args.connection);
      if (validationError) throw new Error(validationError);
      if (!args.table || typeof args.table !== "string") throw new Error("数据表名不能为空");

      const result = await this.mysqlService.getTablePreview(args.connection, args.table.trim(), args.limit ?? 50);
      if (!result.success) throw new Error(result.error);
      return result.data;
    });
  }

  /**
   * 从 MySQL 表导入数据集
   */
  async importTable(args: MySQLImportRequest, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.categoryId) throw new Error("分类ID不能为空");
      if (!args.datasetName || !args.datasetName.trim()) throw new Error("数据集名称不能为空");
      if (!args.table) throw new Error("数据表名不能为空");

      const validationError = this.validateConnectionConfig(args.connection);
      if (validationError) throw new Error(validationError);

      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await this.mysqlService.importTable(args, win);
      if (!result.success) throw new Error(result.error);
      return { success: true };
    });
  }

  private validateConnectionConfig(config: MySQLConnectionConfig): string | null {
    if (!config) return "连接配置不能为空";
    if (!config.host || !config.host.trim()) return "主机地址不能为空";
    if (!config.port || config.port < 1 || config.port > 65535) return "端口号无效（1-65535）";
    if (!config.user || !config.user.trim()) return "用户名不能为空";
    if (!config.database || !config.database.trim()) return "数据库名不能为空";
    return null;
  }
}
