import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BrowserWindow } from "electron";
import {
  BEONResolvedSiteContext,
  BEONSiteRule,
  DatabaseConnectionProfile,
  DatabaseType,
  MySQLConnectionConfig,
  MySQLTableInfo,
  MySQLTablePreview,
  MySQLImportRequest,
  MySQLImportProgress,
  SaveBEONSiteRuleRequest,
  SaveDatabaseConnectionProfileRequest,
} from "@shared/types/mysqlInterface";
import { ServiceResponse } from "@shared/types/projectInterface";
import { DatasetService } from "./DatasetService";
import { DatabaseManager } from "../core/DatabaseManager";

const IMPORT_PROGRESS_CHANNEL = "mysql/import-progress";

export class MySQLService {
  private datasetService?: DatasetService;
  private db = DatabaseManager.getInstance().getDatabase();

  constructor(datasetService?: DatasetService) {
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
      dateStrings: true,
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
    if (!this.datasetService) {
      return { success: false, error: "DatasetService 未初始化，无法执行 MySQL 导入" };
    }

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
   * 获取保存的数据库连接配置
   */
  getConnectionProfiles(): ServiceResponse<DatabaseConnectionProfile[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT *
          FROM conf_db_connection_profile
          WHERE is_del = 0
          ORDER BY is_default DESC, profile_name ASC
        `)
        .all() as Array<any>;

      return {
        success: true,
        data: rows.map(row => this.mapConnectionProfileRow(row)),
      };
    } catch (error: any) {
      return { success: false, error: error.message || "获取连接配置失败" };
    }
  }

  /**
   * 保存数据库连接配置
   */
  saveConnectionProfile(request: SaveDatabaseConnectionProfileRequest): ServiceResponse<{ id: number }> {
    try {
      if (!request.profileName || !request.profileName.trim()) {
        return { success: false, error: "连接名称不能为空" };
      }

      const dbType: DatabaseType = request.dbType || "MYSQL";
      const duplicate = this.db
        .prepare(`
          SELECT id
          FROM conf_db_connection_profile
          WHERE profile_name = ? AND is_del = 0 AND (? IS NULL OR id != ?)
        `)
        .get(request.profileName.trim(), request.id ?? null, request.id ?? null) as { id: number } | undefined;

      if (duplicate) {
        return { success: false, error: `连接名称已存在: ${request.profileName.trim()}` };
      }

      const activeCount = this.db
        .prepare(`SELECT COUNT(*) as cnt FROM conf_db_connection_profile WHERE is_del = 0`)
        .get() as { cnt: number };
      const shouldBeDefault = request.isDefault === true || activeCount.cnt === 0;

      const trx = this.db.transaction(() => {
        if (shouldBeDefault) {
          this.db.prepare(`UPDATE conf_db_connection_profile SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE is_del = 0`).run();
        }

        if (request.id) {
          this.db
            .prepare(`
              UPDATE conf_db_connection_profile
              SET profile_name = ?,
                  db_type = ?,
                  host = ?,
                  port = ?,
                  user_name = ?,
                  password = ?,
                  database_name = ?,
                  is_default = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND is_del = 0
            `)
            .run(
              request.profileName.trim(),
              dbType,
              request.connection.host.trim(),
              request.connection.port,
              request.connection.user.trim(),
              request.connection.password,
              request.connection.database.trim(),
              shouldBeDefault ? 1 : 0,
              request.id
            );
          return request.id;
        }

        const info = this.db
          .prepare(`
            INSERT INTO conf_db_connection_profile
              (profile_name, db_type, host, port, user_name, password, database_name, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            request.profileName.trim(),
            dbType,
            request.connection.host.trim(),
            request.connection.port,
            request.connection.user.trim(),
            request.connection.password,
            request.connection.database.trim(),
            shouldBeDefault ? 1 : 0
          );
        return Number(info.lastInsertRowid);
      });

      return { success: true, data: { id: trx() } };
    } catch (error: any) {
      return { success: false, error: error.message || "保存连接配置失败" };
    }
  }

  /**
   * 删除数据库连接配置
   */
  deleteConnectionProfile(id: number): ServiceResponse<void> {
    try {
      const current = this.db
        .prepare(`
          SELECT id, is_default
          FROM conf_db_connection_profile
          WHERE id = ? AND is_del = 0
        `)
        .get(id) as { id: number; is_default: number } | undefined;

      if (!current) {
        return { success: false, error: `连接配置不存在: ${id}` };
      }

      const trx = this.db.transaction(() => {
        this.db
          .prepare(`
            UPDATE conf_db_connection_profile
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .run(id);

        if (current.is_default === 1) {
          const next = this.db
            .prepare(`
              SELECT id
              FROM conf_db_connection_profile
              WHERE is_del = 0
              ORDER BY id ASC
              LIMIT 1
            `)
            .get() as { id: number } | undefined;

          if (next) {
            this.db
              .prepare(`
                UPDATE conf_db_connection_profile
                SET is_default = 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `)
              .run(next.id);
          }
        }
      });

      trx();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || "删除连接配置失败" };
    }
  }

  /**
   * 获取 BEON 站点规则
   */
  getBEONSiteRules(siteCode?: string): ServiceResponse<BEONSiteRule[]> {
    try {
      const rows = siteCode
        ? (this.db
            .prepare(`
              SELECT *
              FROM conf_beon_site_rule
              WHERE site_code = ? AND is_del = 0
              ORDER BY priority DESC, id ASC
            `)
            .all(siteCode.trim().toLowerCase()) as Array<any>)
        : (this.db
            .prepare(`
              SELECT *
              FROM conf_beon_site_rule
              WHERE is_del = 0
              ORDER BY site_code ASC, priority DESC, id ASC
            `)
            .all() as Array<any>);

      return {
        success: true,
        data: rows.map(row => this.mapBEONSiteRuleRow(row)),
      };
    } catch (error: any) {
      return { success: false, error: error.message || "获取 BEON 站点规则失败" };
    }
  }

  /**
   * 保存 BEON 站点规则
   */
  saveBEONSiteRule(request: SaveBEONSiteRuleRequest): ServiceResponse<{ id: number }> {
    try {
      if (!request.siteCode || !request.siteCode.trim()) {
        return { success: false, error: "siteCode 不能为空" };
      }
      if (!request.ruleName || !request.ruleName.trim()) {
        return { success: false, error: "ruleName 不能为空" };
      }
      if (!request.ruleConfig || typeof request.ruleConfig !== "object") {
        return { success: false, error: "ruleConfig 必须是对象" };
      }

      if (request.connectionProfileId) {
        const connection = this.getConnectionProfileById(request.connectionProfileId);
        if (!connection) {
          return { success: false, error: `连接配置不存在: ${request.connectionProfileId}` };
        }
      }

      const duplicate = this.db
        .prepare(`
          SELECT id
          FROM conf_beon_site_rule
          WHERE site_code = ? AND rule_name = ? AND is_del = 0 AND (? IS NULL OR id != ?)
        `)
        .get(
          request.siteCode.trim().toLowerCase(),
          request.ruleName.trim(),
          request.id ?? null,
          request.id ?? null
        ) as { id: number } | undefined;

      if (duplicate) {
        return { success: false, error: `规则名称已存在: ${request.siteCode}.${request.ruleName}` };
      }

      const ruleConfig = JSON.stringify(request.ruleConfig);

      if (request.id) {
        this.db
          .prepare(`
            UPDATE conf_beon_site_rule
            SET site_code = ?,
                rule_name = ?,
                rule_type = ?,
                connection_profile_id = ?,
                source_table = ?,
                match_time_column = ?,
                priority = ?,
                rule_config = ?,
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_del = 0
          `)
          .run(
            request.siteCode.trim().toLowerCase(),
            request.ruleName.trim(),
            request.ruleType,
            request.connectionProfileId ?? null,
            request.sourceTable?.trim() || null,
            request.matchTimeColumn?.trim() || "record_time",
            request.priority ?? 0,
            ruleConfig,
            request.isActive === false ? 0 : 1,
            request.id
          );
        return { success: true, data: { id: request.id } };
      }

      const info = this.db
        .prepare(`
          INSERT INTO conf_beon_site_rule
            (site_code, rule_name, rule_type, connection_profile_id, source_table, match_time_column, priority, rule_config, is_active, is_builtin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `)
        .run(
          request.siteCode.trim().toLowerCase(),
          request.ruleName.trim(),
          request.ruleType,
          request.connectionProfileId ?? null,
          request.sourceTable?.trim() || null,
          request.matchTimeColumn?.trim() || "record_time",
          request.priority ?? 0,
          ruleConfig,
          request.isActive === false ? 0 : 1
        );

      return { success: true, data: { id: Number(info.lastInsertRowid) } };
    } catch (error: any) {
      return { success: false, error: error.message || "保存 BEON 站点规则失败" };
    }
  }

  /**
   * 删除 BEON 站点规则
   */
  deleteBEONSiteRule(id: number): ServiceResponse<void> {
    try {
      const rule = this.db
        .prepare(`SELECT id, is_builtin FROM conf_beon_site_rule WHERE id = ? AND is_del = 0`)
        .get(id) as { id: number; is_builtin: number } | undefined;

      if (!rule) {
        return { success: false, error: `站点规则不存在: ${id}` };
      }

      this.db
        .prepare(`
          UPDATE conf_beon_site_rule
          SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .run(id);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || "删除 BEON 站点规则失败" };
    }
  }

  /**
   * 解析某个站点当前生效的 BEON 规则
   */
  resolveBEONSiteContext(siteCode: string, connectionProfileId?: number): ServiceResponse<BEONResolvedSiteContext> {
    try {
      const normalizedSiteCode = siteCode.trim().toLowerCase();
      if (!normalizedSiteCode) {
        return { success: false, error: "siteCode 不能为空" };
      }

      const rulesResult = this.getBEONSiteRules(normalizedSiteCode);
      if (!rulesResult.success) {
        return { success: false, error: rulesResult.error };
      }

      const activeRules = (rulesResult.data || []).filter(rule => rule.isActive);
      const fallbackRules = activeRules.filter(rule => rule.ruleType === "fallback_query");
      const localOverrideRules = activeRules.filter(rule => rule.ruleType === "local_override");

      let connectionProfile: DatabaseConnectionProfile | undefined;
      if (connectionProfileId) {
        connectionProfile = this.getConnectionProfileById(connectionProfileId) || undefined;
        if (!connectionProfile) {
          return { success: false, error: `连接配置不存在: ${connectionProfileId}` };
        }
      } else {
        const ruleConnectionId = fallbackRules.find(rule => rule.connectionProfileId)?.connectionProfileId;
        if (ruleConnectionId) {
          connectionProfile = this.getConnectionProfileById(ruleConnectionId) || undefined;
        }
      }
      if (!connectionProfile && fallbackRules.length > 0) {
        connectionProfile = this.getDefaultConnectionProfile() || undefined;
      }

      return {
        success: true,
        data: {
          siteCode: normalizedSiteCode,
          connectionProfile,
          fallbackRules,
          localOverrideRules,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message || "解析站点规则失败" };
    }
  }

  /**
   * 按时间范围读取远端 MySQL 表数据
   */
  async getRowsByTimeRange(
    config: MySQLConnectionConfig,
    table: string,
    columns: string[],
    timeColumn: string,
    startTime: string,
    endTime: string
  ): Promise<ServiceResponse<any[]>> {
    let connection: any = null;
    try {
      const queryColumns = Array.from(new Set([timeColumn, ...columns.filter(Boolean)]));
      if (queryColumns.length === 0) {
        return { success: false, error: "查询列不能为空" };
      }

      connection = await this.createConnection(config);
      const safeColumns = queryColumns.map(column => this.escapeIdentifier(column)).join(", ");
      const safeTable = this.escapeIdentifier(table);
      const safeTimeColumn = this.escapeIdentifier(timeColumn);
      const [rows] = await connection.execute(
        `SELECT ${safeColumns}
         FROM ${safeTable}
         WHERE ${safeTimeColumn} BETWEEN ? AND ?
         ORDER BY ${safeTimeColumn} ASC`,
        [startTime, endTime]
      );

      return { success: true, data: rows as any[] };
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

  private getConnectionProfileById(id: number): DatabaseConnectionProfile | null {
    const row = this.db
      .prepare(`
        SELECT *
        FROM conf_db_connection_profile
        WHERE id = ? AND is_del = 0
      `)
      .get(id) as any;

    return row ? this.mapConnectionProfileRow(row) : null;
  }

  private getDefaultConnectionProfile(): DatabaseConnectionProfile | null {
    const row = this.db
      .prepare(`
        SELECT *
        FROM conf_db_connection_profile
        WHERE is_default = 1 AND is_del = 0
        ORDER BY id ASC
        LIMIT 1
      `)
      .get() as any;

    return row ? this.mapConnectionProfileRow(row) : null;
  }

  private mapConnectionProfileRow(row: any): DatabaseConnectionProfile {
    return {
      id: row.id,
      profileName: row.profile_name,
      dbType: row.db_type as DatabaseType,
      host: row.host,
      port: row.port,
      user: row.user_name,
      password: row.password || "",
      database: row.database_name,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapBEONSiteRuleRow(row: any): BEONSiteRule {
    return {
      id: row.id,
      siteCode: row.site_code,
      ruleName: row.rule_name,
      ruleType: row.rule_type,
      connectionProfileId: row.connection_profile_id || undefined,
      sourceTable: row.source_table || undefined,
      matchTimeColumn: row.match_time_column || "record_time",
      priority: row.priority ?? 0,
      isActive: row.is_active === 1,
      isBuiltin: row.is_builtin === 1,
      ruleConfig: row.rule_config ? JSON.parse(row.rule_config) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
