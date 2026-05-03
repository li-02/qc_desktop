import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BrowserWindow, safeStorage } from "electron";
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

const ENCRYPTED_PREFIX = "__enc__";

function encryptPassword(plaintext: string): string {
  if (!plaintext) return "";
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plaintext);
    return ENCRYPTED_PREFIX + buf.toString("base64");
  }
  return plaintext;
}

function decryptPassword(stored: string): string {
  if (!stored) return "";
  if (stored.startsWith(ENCRYPTED_PREFIX) && safeStorage.isEncryptionAvailable()) {
    try {
      const b64 = stored.slice(ENCRYPTED_PREFIX.length);
      const buf = Buffer.from(b64, "base64");
      return safeStorage.decryptString(buf);
    } catch {
      return "";
    }
  }
  return stored;
}

export class MySQLService {
  private datasetService?: DatasetService;
  private db = DatabaseManager.getInstance().getDatabase();
  /** Cached connection pools keyed by "host:port:user:database" */
  private pools: Map<string, any> = new Map();

  constructor(datasetService?: DatasetService) {
    this.datasetService = datasetService;
  }

  // ---------------------------------------------------------------------------
  // Pool Management
  // ---------------------------------------------------------------------------

  /** Build a stable cache key from connection config */
  private poolKey(config: MySQLConnectionConfig): string {
    return `${config.host}:${config.port}:${config.user}:${config.database}`;
  }

  private async importSelectedColumns(
    request: MySQLImportRequest,
    mainWindow: BrowserWindow | null
  ): Promise<ServiceResponse<void>> {
    if (!this.datasetService) {
      return { success: false, error: "DatasetService 未初始化，无法执行 MySQL 导入" };
    }

    const selections = (request.selectedTables || []).filter(item => item.columns.length > 0);
    if (selections.length === 0) {
      return { success: false, error: "请选择至少一个数据列" };
    }

    const sendProgress = (progress: MySQLImportProgress) => {
      mainWindow?.webContents.send(IMPORT_PROGRESS_CHANNEL, progress);
    };

    let connection: any = null;
    let tmpCsvPath: string | null = null;

    try {
      sendProgress({ status: "connecting", message: "正在连接数据库...", datasetName: request.datasetName });
      connection = await this.createConnection(request.connection);
      sendProgress({ status: "fetching", message: "正在读取已选择的数据列...", datasetName: request.datasetName });

      const columnHeaders: string[] = [];
      const usedHeaders = new Set<string>();
      const rowsByTime = new Map<string, Record<string, any>>();

      for (const selection of selections) {
        if (!selection.timeColumn) {
          return { success: false, error: `数据表 ${selection.table} 未检测到时间列` };
        }

        const safeTable = this.escapeIdentifier(selection.table);
        const safeTimeColumn = this.escapeIdentifier(selection.timeColumn);
        const aliases = selection.columns.map((column, index) => ({
          column,
          alias: `c${index}`,
          header: this.uniqueColumnHeader(`${selection.table}_${column}`, usedHeaders),
        }));
        aliases.forEach(item => columnHeaders.push(item.header));

        const selectColumns = aliases.map(
          item => `${this.escapeIdentifier(item.column)} AS ${this.escapeIdentifier(item.alias)}`
        );
        const startTime = request.startTime || selection.startTime;
        const endTime = request.endTime || selection.endTime;
        const rangeSql = startTime && endTime ? ` AND ${safeTimeColumn} BETWEEN ? AND ?` : "";
        const queryParams = startTime && endTime ? [startTime, endTime] : [];
        const [rows] = await connection.query(
          `SELECT ${safeTimeColumn} AS __time${selectColumns.length ? `, ${selectColumns.join(", ")}` : ""}
           FROM ${safeTable}
           WHERE ${safeTimeColumn} IS NOT NULL${rangeSql}
           ORDER BY ${safeTimeColumn} ASC`,
          queryParams
        );

        for (const row of rows as any[]) {
          const timeValue = row.__time;
          if (timeValue === null || timeValue === undefined || timeValue === "") continue;
          const timeKey = this.normalizeTimeKey(timeValue);
          const mergedRow = rowsByTime.get(timeKey) || { record_time: timeKey };
          aliases.forEach(item => {
            mergedRow[item.header] = row[item.alias];
          });
          rowsByTime.set(timeKey, mergedRow);
        }
      }

      const columns = ["record_time", ...columnHeaders];
      const sortedRows = Array.from(rowsByTime.values()).sort((a, b) =>
        this.compareTimeKeys(a.record_time, b.record_time)
      );
      if (sortedRows.length === 0) {
        return { success: false, error: "所选列没有可按时间对齐的数据" };
      }

      sendProgress({ status: "processing", message: "正在按时间列对齐数据...", datasetName: request.datasetName });
      tmpCsvPath = path.join(os.tmpdir(), `mysql_joined_import_${Date.now()}.csv`);
      await fs.promises.writeFile(tmpCsvPath, this.toCsv(columns, sortedRows), "utf-8");

      const fileStats = await fs.promises.stat(tmpCsvPath);
      const importResult = await this.datasetService.importDataset({
        categoryId: request.categoryId,
        datasetName: request.datasetName,
        type: request.dataType,
        file: {
          name: `${request.datasetName}.csv`,
          size: String(fileStats.size),
          path: tmpCsvPath,
        },
        missingValueTypes: request.missingValueTypes,
        rows: sortedRows.length,
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
   * Get or create a connection pool for the given config.
   * Pools are cached per host:port:user:database and reused across calls.
   */
  getPool(config: MySQLConnectionConfig): any {
    const key = this.poolKey(config);
    let pool = this.pools.get(key);
    if (pool) {
      return pool;
    }

    const mysql2 = require("mysql2/promise");
    pool = mysql2.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10000,
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: 4,
      maxIdle: 4,
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    this.pools.set(key, pool);
    return pool;
  }

  /**
   * Close a specific pool (by config). Safe to call if pool doesn't exist.
   */
  async closePool(config: MySQLConnectionConfig): Promise<void> {
    const key = this.poolKey(config);
    const pool = this.pools.get(key);
    if (pool) {
      this.pools.delete(key);
      try {
        await pool.end();
      } catch (_) {}
    }
  }

  /**
   * Close all cached pools. Call on app shutdown.
   */
  async closeAllPools(): Promise<void> {
    const entries = Array.from(this.pools.entries());
    this.pools.clear();
    for (const [, pool] of entries) {
      try {
        await pool.end();
      } catch (_) {}
    }
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
      const previewLimit = this.normalizeLimit(limit);
      const [previewRows] = await connection.query(`SELECT * FROM ${safeTable} LIMIT ${previewLimit}`);
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

    if (request.selectedTables?.length) {
      return this.importSelectedColumns(request, mainWindow);
    }
    if (!request.table) {
      return { success: false, error: "数据表名不能为空" };
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

      // 3. 写入临时 CSV (async to avoid blocking main thread)
      sendProgress({ status: "processing", message: "正在处理数据...", datasetName: request.datasetName });
      tmpCsvPath = path.join(os.tmpdir(), `mysql_import_${Date.now()}.csv`);
      const csvContent = this.toCsv(columns, arr);
      await fs.promises.writeFile(tmpCsvPath, csvContent, "utf-8");

      const fileStats = await fs.promises.stat(tmpCsvPath);

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
   * 按时间范围导出表数据到临时 CSV (streaming)
   * 使用 mysql2 的 query().stream() 将行直接流式写入文件，避免将全量数据加载到内存。
   * 如果传入 pool 则复用连接，否则创建新连接 (向后兼容)
   */
  async importTableByTimeRange(
    config: MySQLConnectionConfig,
    table: string,
    startTime: string,
    endTime: string,
    columns?: string[],
    timeColumn: string = "record_time",
    pool?: any
  ): Promise<ServiceResponse<{ csvPath: string; rowCount: number }>> {
    const usePool = !!pool;
    let connection: any = null;
    const csvPath = path.join(os.tmpdir(), `mysql_time_range_${Date.now()}.csv`);

    try {
      if (usePool) {
        connection = await pool.getConnection();
      } else {
        connection = await this.createConnection(config);
      }

      const safeTable = this.escapeIdentifier(table);
      const safeTimeColumn = this.escapeIdentifier(timeColumn);
      const safeColumns = columns?.length ? columns.map(column => this.escapeIdentifier(column)).join(", ") : "*";

      const sql = `SELECT ${safeColumns}
         FROM ${safeTable}
         WHERE ${safeTimeColumn} BETWEEN ? AND ?
         ORDER BY ${safeTimeColumn} ASC`;

      // Access the underlying non-promise connection for streaming
      const rawConn = connection.connection;
      const queryCmd = rawConn.query(sql, [startTime, endTime]);
      const rowStream = queryCmd.stream({ highWaterMark: 256 });

      const result = await new Promise<{ rowCount: number }>((resolve, reject) => {
        const fileStream = fs.createWriteStream(csvPath, { encoding: "utf-8" });
        let headerWritten = false;
        let csvColumns: string[] = [];
        let rowCount = 0;

        const escapeCsvField = (val: any): string => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        rowStream.on("data", (row: any) => {
          if (!headerWritten) {
            csvColumns = columns?.length ? columns : Object.keys(row);
            fileStream.write(csvColumns.map(escapeCsvField).join(",") + "\n");
            headerWritten = true;
          }
          const line = csvColumns.map(col => escapeCsvField(row[col])).join(",") + "\n";
          rowCount++;
          // Respect backpressure: if write buffer is full, pause the row stream
          if (!fileStream.write(line)) {
            rowStream.pause();
            fileStream.once("drain", () => rowStream.resume());
          }
        });

        rowStream.on("error", (err: Error) => {
          fileStream.destroy();
          reject(err);
        });

        rowStream.on("end", () => {
          // If no rows came through, still write an empty file (or header-only)
          if (!headerWritten && columns?.length) {
            fileStream.write(columns.map(escapeCsvField).join(",") + "\n");
          }
          fileStream.end(() => resolve({ rowCount }));
        });

        fileStream.on("error", (err: Error) => {
          rowStream.destroy();
          reject(err);
        });
      });

      return {
        success: true,
        data: {
          csvPath,
          rowCount: result.rowCount,
        },
      };
    } catch (error: any) {
      if (fs.existsSync(csvPath)) {
        try {
          fs.unlinkSync(csvPath);
        } catch (_) {}
      }
      return { success: false, error: this.formatMySQLError(error) };
    } finally {
      if (connection) {
        try {
          if (usePool) {
            connection.release();
          } else {
            await connection.end();
          }
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
        .prepare(
          `
          SELECT *
          FROM conf_db_connection_profile
          WHERE is_del = 0
          ORDER BY is_default DESC, profile_name ASC
        `
        )
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
        .prepare(
          `
          SELECT id
          FROM conf_db_connection_profile
          WHERE profile_name = ? AND is_del = 0 AND (? IS NULL OR id != ?)
        `
        )
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
          this.db
            .prepare(
              `UPDATE conf_db_connection_profile SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE is_del = 0`
            )
            .run();
        }

        if (request.id) {
          this.db
            .prepare(
              `
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
            `
            )
            .run(
              request.profileName.trim(),
              dbType,
              request.connection.host.trim(),
              request.connection.port,
              request.connection.user.trim(),
              encryptPassword(request.connection.password),
              request.connection.database.trim(),
              shouldBeDefault ? 1 : 0,
              request.id
            );
          return request.id;
        }

        const info = this.db
          .prepare(
            `
            INSERT INTO conf_db_connection_profile
              (profile_name, db_type, host, port, user_name, password, database_name, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            request.profileName.trim(),
            dbType,
            request.connection.host.trim(),
            request.connection.port,
            request.connection.user.trim(),
            encryptPassword(request.connection.password),
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
        .prepare(
          `
          SELECT id, is_default
          FROM conf_db_connection_profile
          WHERE id = ? AND is_del = 0
        `
        )
        .get(id) as { id: number; is_default: number } | undefined;

      if (!current) {
        return { success: false, error: `连接配置不存在: ${id}` };
      }

      const trx = this.db.transaction(() => {
        this.db
          .prepare(
            `
            UPDATE conf_db_connection_profile
            SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `
          )
          .run(id);

        if (current.is_default === 1) {
          const next = this.db
            .prepare(
              `
              SELECT id
              FROM conf_db_connection_profile
              WHERE is_del = 0
              ORDER BY id ASC
              LIMIT 1
            `
            )
            .get() as { id: number } | undefined;

          if (next) {
            this.db
              .prepare(
                `
                UPDATE conf_db_connection_profile
                SET is_default = 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `
              )
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
            .prepare(
              `
              SELECT *
              FROM conf_beon_site_rule
              WHERE site_code = ? AND is_del = 0
              ORDER BY priority DESC, id ASC
            `
            )
            .all(siteCode.trim().toLowerCase()) as Array<any>)
        : (this.db
            .prepare(
              `
              SELECT *
              FROM conf_beon_site_rule
              WHERE is_del = 0
              ORDER BY site_code ASC, priority DESC, id ASC
            `
            )
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
        .prepare(
          `
          SELECT id
          FROM conf_beon_site_rule
          WHERE site_code = ? AND rule_name = ? AND is_del = 0 AND (? IS NULL OR id != ?)
        `
        )
        .get(request.siteCode.trim().toLowerCase(), request.ruleName.trim(), request.id ?? null, request.id ?? null) as
        | { id: number }
        | undefined;

      if (duplicate) {
        return { success: false, error: `规则名称已存在: ${request.siteCode}.${request.ruleName}` };
      }

      const ruleConfig = JSON.stringify(request.ruleConfig);

      if (request.id) {
        this.db
          .prepare(
            `
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
          `
          )
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
        .prepare(
          `
          INSERT INTO conf_beon_site_rule
            (site_code, rule_name, rule_type, connection_profile_id, source_table, match_time_column, priority, rule_config, is_active, is_builtin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `
        )
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
        .prepare(
          `
          UPDATE conf_beon_site_rule
          SET is_del = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
        )
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

  /**
   * 从远程 MySQL 查询 sites 表，过滤 ftp IS NOT NULL 且 is_del != 1 的站点
   */
  async queryBEONSites(connectionProfileId: number): Promise<ServiceResponse<any[]>> {
    const profile = this.getConnectionProfileById(connectionProfileId);
    if (!profile) {
      return { success: false, error: `连接配置不存在: ${connectionProfileId}` };
    }
    const config: MySQLConnectionConfig = {
      host: profile.host,
      port: profile.port,
      user: profile.user,
      password: profile.password,
      database: profile.database,
    };
    let connection: any = null;
    try {
      connection = await this.createConnection(config);
      const [rows] = await connection.execute(
        `SELECT id, abbr_name, ftp, longitude, latitude, altitude
         FROM sites
         WHERE ftp IS NOT NULL AND (is_del IS NULL OR is_del != 1)
         ORDER BY id ASC`
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

  getConnectionProfileById(id: number): DatabaseConnectionProfile | null {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM conf_db_connection_profile
        WHERE id = ? AND is_del = 0
      `
      )
      .get(id) as any;

    return row ? this.mapConnectionProfileRow(row) : null;
  }

  private getDefaultConnectionProfile(): DatabaseConnectionProfile | null {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM conf_db_connection_profile
        WHERE is_default = 1 AND is_del = 0
        ORDER BY id ASC
        LIMIT 1
      `
      )
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
      password: decryptPassword(row.password || ""),
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

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) return 50;
    return Math.max(1, Math.min(1000, Math.floor(limit)));
  }

  private uniqueColumnHeader(header: string, usedHeaders: Set<string>): string {
    const base = header.replace(/[^\w\u4e00-\u9fa5]+/g, "_").replace(/^_+|_+$/g, "") || "column";
    let candidate = base;
    let index = 2;
    while (usedHeaders.has(candidate)) {
      candidate = `${base}_${index}`;
      index++;
    }
    usedHeaders.add(candidate);
    return candidate;
  }

  private normalizeTimeKey(value: any): string {
    if (value instanceof Date) {
      return value.toISOString().replace("T", " ").slice(0, 19);
    }
    return String(value).trim();
  }

  private compareTimeKeys(a: string, b: string): number {
    const timeA = Date.parse(a);
    const timeB = Date.parse(b);
    if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
      return timeA - timeB;
    }
    return a.localeCompare(b);
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
