import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BrowserWindow } from "electron";
import {
  MySQLConnectionConfig,
  MySQLTableInfo,
  MySQLTablePreview,
  MySQLImportRequest,
  MySQLImportProgress,
} from "@shared/types/mysqlInterface";
import { ServiceResponse } from "@shared/types/projectInterface";
import { DatasetService } from "./DatasetService";

const IMPORT_PROGRESS_CHANNEL = "mysql/import-progress";

export class MySQLService {
  private datasetService: DatasetService;

  constructor(datasetService: DatasetService) {
    this.datasetService = datasetService;
  }

  private createConnection(config: MySQLConnectionConfig) {
    const mysql2 = require("mysql2/promise");
    return mysql2.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10000,
    });
  }

  /**
   * 测试数据库连接
   */
  async testConnection(config: MySQLConnectionConfig): Promise<ServiceResponse<{ serverVersion: string }>> {
    let connection: any = null;
    try {
      connection = await this.createConnection(config);
      const [rows] = await connection.execute("SELECT VERSION() as version");
      const serverVersion = (rows as any[])[0]?.version || "unknown";
      return { success: true, data: { serverVersion } };
    } catch (error: any) {
      return { success: false, error: this.formatMySQLError(error) };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (_) {}
      }
    }
  }

  /**
   * 获取数据库所有表和视图
   */
  async getTables(config: MySQLConnectionConfig): Promise<ServiceResponse<MySQLTableInfo[]>> {
    let connection: any = null;
    try {
      connection = await this.createConnection(config);
      const [rows] = await connection.execute(
        `SELECT TABLE_NAME as name, TABLE_TYPE as type
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_TYPE, TABLE_NAME`,
        [config.database]
      );
      const tables: MySQLTableInfo[] = (rows as any[]).map(row => ({
        name: row.name,
        type: row.type === "VIEW" ? "VIEW" : "TABLE",
      }));
      return { success: true, data: tables };
    } catch (error: any) {
      return { success: false, error: this.formatMySQLError(error) };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (_) {}
      }
    }
  }

  /**
   * 获取表预览数据
   */
  async getTablePreview(
    config: MySQLConnectionConfig,
    table: string,
    limit: number = 50
  ): Promise<ServiceResponse<MySQLTablePreview>> {
    let connection: any = null;
    try {
      connection = await this.createConnection(config);

      // 获取总行数
      const safeTable = this.escapeIdentifier(table);
      const [countRows] = await connection.execute(`SELECT COUNT(*) as cnt FROM ${safeTable}`);
      const totalCount = (countRows as any[])[0]?.cnt || 0;

      // 获取预览数据
      const [previewRows] = await connection.execute(`SELECT * FROM ${safeTable} LIMIT ?`, [limit]);
      const arr = previewRows as any[];

      const columns = arr.length > 0 ? Object.keys(arr[0]) : [];
      const rows = arr.map(row => columns.map(col => row[col]));

      return { success: true, data: { columns, rows, totalCount } };
    } catch (error: any) {
      return { success: false, error: this.formatMySQLError(error) };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (_) {}
      }
    }
  }

  /**
   * 从 MySQL 表导入数据集
   * 流程：连接 → 拉全量数据 → 写临时 CSV → 调用 DatasetService.importDataset()
   */
  async importTable(request: MySQLImportRequest, mainWindow: BrowserWindow | null): Promise<ServiceResponse<void>> {
    const sendProgress = (progress: MySQLImportProgress) => {
      mainWindow?.webContents.send(IMPORT_PROGRESS_CHANNEL, progress);
    };

    let connection: any = null;
    let tmpCsvPath: string | null = null;

    try {
      // 1. 连接数据库
      sendProgress({ status: "connecting", message: "正在连接数据库...", datasetName: request.datasetName });
      connection = await this.createConnection(request.connection);

      // 2. 拉取全量数据
      sendProgress({ status: "fetching", message: "正在读取数据表...", datasetName: request.datasetName });
      const safeTable = this.escapeIdentifier(request.table);
      const [rows] = await connection.execute(`SELECT * FROM ${safeTable}`);
      await connection.end();
      connection = null;

      const arr = rows as any[];
      if (arr.length === 0) {
        return { success: false, error: "所选数据表为空，无法导入" };
      }

      const columns = Object.keys(arr[0]);

      // 3. 写入临时 CSV
      sendProgress({ status: "processing", message: "正在处理数据...", datasetName: request.datasetName });
      tmpCsvPath = path.join(os.tmpdir(), `mysql_import_${Date.now()}.csv`);
      const csvContent = this.toCsv(columns, arr);
      fs.writeFileSync(tmpCsvPath, csvContent, "utf-8");

      const fileStats = fs.statSync(tmpCsvPath);

      // 4. 调用现有导入管线
      const importResult = await this.datasetService.importDataset({
        categoryId: request.categoryId,
        datasetName: request.datasetName,
        type: request.dataType,
        file: {
          name: `${request.table}.csv`,
          size: String(fileStats.size),
          path: tmpCsvPath,
        },
        missingValueTypes: request.missingValueTypes,
        rows: arr.length,
        columns,
        sourceTimezone: "auto",
      });

      if (!importResult.success) {
        throw new Error(importResult.error || "导入失败");
      }

      sendProgress({ status: "completed", message: "导入完成", datasetName: request.datasetName });
      return { success: true };
    } catch (error: any) {
      const msg = this.formatMySQLError(error);
      sendProgress({ status: "failed", message: msg, datasetName: request.datasetName, error: msg });
      return { success: false, error: msg };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (_) {}
      }
      if (tmpCsvPath && fs.existsSync(tmpCsvPath)) {
        try {
          fs.unlinkSync(tmpCsvPath);
        } catch (_) {}
      }
    }
  }

  /**
   * 将行数据序列化为 CSV 字符串
   */
  private toCsv(columns: string[], rows: any[]): string {
    const escape = (val: any): string => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const header = columns.map(escape).join(",");
    const body = rows.map(row => columns.map(col => escape(row[col])).join(",")).join("\n");
    return `${header}\n${body}`;
  }

  /**
   * 安全转义 MySQL 标识符（表名/列名）
   */
  private escapeIdentifier(name: string): string {
    return "`" + name.replace(/`/g, "``") + "`";
  }

  /**
   * 格式化 MySQL 错误为友好消息
   */
  private formatMySQLError(error: any): string {
    if (!error) return "未知错误";
    const code = error.code || "";
    const msg = error.message || String(error);

    const codeMap: Record<string, string> = {
      ECONNREFUSED: "连接被拒绝，请检查主机和端口",
      ETIMEDOUT: "连接超时，请检查网络或主机地址",
      ENOTFOUND: "无法解析主机名，请检查地址是否正确",
      ER_ACCESS_DENIED_ERROR: "用户名或密码错误",
      ER_BAD_DB_ERROR: "数据库不存在",
      ER_NO_SUCH_TABLE: "数据表不存在",
      ECONNRESET: "连接被重置，请重试",
    };

    return codeMap[code] || msg;
  }
}
