import { IpcMainInvokeEvent, BrowserWindow } from "electron";
import { BaseController } from "./BaseController";
import { MySQLService } from "../service/MySQLService";
import {
  MySQLConnectionConfig,
  MySQLImportRequest,
  SaveDatabaseConnectionProfileRequest,
  SaveBEONSiteRuleRequest,
} from "@shared/types/mysqlInterface";

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
      if (!args.table && (!args.selectedTables || args.selectedTables.length === 0)) throw new Error("请选择至少一个数据表列");

      const validationError = this.validateConnectionConfig(args.connection);
      if (validationError) throw new Error(validationError);

      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await this.mysqlService.importTable(args, win);
      if (!result.success) throw new Error(result.error);
      return { success: true };
    });
  }

  /**
   * 获取保存的连接配置
   */
  async getConnectionProfiles(args: { source?: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = this.mysqlService.getConnectionProfiles(args?.source);
      if (!result.success) throw new Error(result.error);
      return { profiles: result.data };
    });
  }

  /**
   * 保存连接配置
   */
  async saveConnectionProfile(args: SaveDatabaseConnectionProfileRequest, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args?.profileName?.trim()) throw new Error("连接名称不能为空");
      const validationError = this.validateConnectionConfig(args.connection);
      if (validationError) throw new Error(validationError);

      const result = this.mysqlService.saveConnectionProfile(args);
      if (!result.success) throw new Error(result.error);
      return result.data;
    });
  }

  /**
   * 删除连接配置
   */
  async deleteConnectionProfile(args: { id: number }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args?.id) throw new Error("连接配置ID不能为空");
      const result = this.mysqlService.deleteConnectionProfile(args.id);
      if (!result.success) throw new Error(result.error);
      return { success: true };
    });
  }

  /**
   * 获取 BEON 站点规则
   */
  async getBEONSiteRules(args: { siteCode?: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = this.mysqlService.getBEONSiteRules(args?.siteCode);
      if (!result.success) throw new Error(result.error);
      return { rules: result.data };
    });
  }

  /**
   * 保存 BEON 站点规则
   */
  async saveBEONSiteRule(args: SaveBEONSiteRuleRequest, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args?.siteCode?.trim()) throw new Error("siteCode 不能为空");
      if (!args?.ruleName?.trim()) throw new Error("ruleName 不能为空");
      const result = this.mysqlService.saveBEONSiteRule(args);
      if (!result.success) throw new Error(result.error);
      return result.data;
    });
  }

  /**
   * 删除 BEON 站点规则
   */
  async deleteBEONSiteRule(args: { id: number }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args?.id) throw new Error("规则ID不能为空");
      const result = this.mysqlService.deleteBEONSiteRule(args.id);
      if (!result.success) throw new Error(result.error);
      return { success: true };
    });
  }

  /**
   * 解析某个站点当前生效的规则上下文
   */
  async resolveBEONSiteContext(args: { siteCode: string; connectionProfileId?: number }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args?.siteCode?.trim()) throw new Error("siteCode 不能为空");
      const result = this.mysqlService.resolveBEONSiteContext(args.siteCode, args.connectionProfileId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    });
  }

  /**
   * 从远程 MySQL 查询 sites 表中的有效站点
   */
  async queryBEONSites(args: { connectionProfileId: number }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args?.connectionProfileId) throw new Error("connectionProfileId 不能为空");
      const result = await this.mysqlService.queryBEONSites(args.connectionProfileId);
      if (!result.success) throw new Error(result.error);
      return result.data;
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
