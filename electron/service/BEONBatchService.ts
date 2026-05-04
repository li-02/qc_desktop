import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import Papa from "papaparse";

import { BrowserWindow } from "electron";
import { PythonBridgeService } from "./PythonBridgeService";
import { MySQLService } from "./MySQLService";
import {
  BEONDataType,
  BEONBatchRequest,
  BEONBatchItem,
  BEONBatchProgressEvent,
  BEONBatchLogEntry,
} from "@shared/types/workflow";
import { MySQLConnectionConfig } from "@shared/types/mysqlInterface";

const BATCH_PROGRESS_CHANNEL = "beon-batch/progress";

const TABLE_SUFFIX: Record<BEONDataType, string> = {
  flux: "_fluxs",
  sapflow: "_sapflows",
  aqi: "_aqis",
  nai: "_nais",
};

const TIME_COLUMN = "record_time";

const SITE_FALLBACK_RULES = [
  {
    targetSiteIds: new Set([10, 17]),
    targetSiteCodes: new Set(["hanshiqiao", "badaling"]),
    sourceSiteId: 14,
    sourceSiteCode: "shisanling",
  },
];

type SiteFallbackRule = (typeof SITE_FALLBACK_RULES)[number];

type CsvRecord = Record<string, string>;

const FALLBACK_COLUMN_EXCLUDES = new Set([TIME_COLUMN, "id", "site_id", "is_del", "created_at", "updated_at", "deleted_at"]);

interface BatchState {
  cancelled: boolean;
  items: BEONBatchItem[];
}

/** Helper: current HH:mm:ss */
function ts(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

/** Append a log entry to the item */
function appendLog(item: BEONBatchItem, level: BEONBatchLogEntry["level"], text: string): void {
  item.logs.push({ time: ts(), level, text });
}

export class BEONBatchService {
  private pythonBridge: PythonBridgeService;
  private mysqlService: MySQLService;
  private activeBatches: Map<string, BatchState> = new Map();

  constructor(pythonBridge: PythonBridgeService, mysqlService: MySQLService) {
    this.pythonBridge = pythonBridge;
    this.mysqlService = mysqlService;
  }

  async startBatch(request: BEONBatchRequest, mainWindow: BrowserWindow | null): Promise<{ batchId: string }> {
    const batchId = uuidv4();
    const items: BEONBatchItem[] = request.sites.flatMap(site =>
      request.dataTypes.map(dataType => ({
        id: uuidv4(),
        siteCode: site.siteCode,
        dataType,
        status: "PENDING" as const,
        startedAt: null,
        finishedAt: null,
        progress: 0,
        message: "等待中",
        logs: [] as BEONBatchLogEntry[],
      }))
    );

    if (items.length === 0) {
      return { batchId };
    }

    this.activeBatches.set(batchId, { cancelled: false, items });

    setImmediate(() => {
      void this.runBatch(batchId, request, mainWindow).catch(err => {
        console.error("[BEONBatch] runBatch top-level error:", err);
        this.activeBatches.delete(batchId);
      });
    });

    return { batchId };
  }

  cancelBatch(batchId: string): boolean {
    const state = this.activeBatches.get(batchId);
    if (!state) {
      return false;
    }

    state.cancelled = true;
    for (const item of state.items) {
      if (item.status === "PENDING") {
        item.status = "CANCELLED";
        item.message = "已取消";
        appendLog(item, "warn", "任务被用户取消");
      }
    }

    return true;
  }

  getBatchStatus(batchId: string): BEONBatchProgressEvent | null {
    const state = this.activeBatches.get(batchId);
    if (!state) {
      return null;
    }

    return this.buildProgressEvent(batchId, state);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async runBatch(batchId: string, request: BEONBatchRequest, mainWindow: BrowserWindow | null): Promise<void> {
    const state = this.activeBatches.get(batchId);
    if (!state) {
      return;
    }

    const profile = this.mysqlService.getConnectionProfileById(request.connectionProfileId);
    if (!profile) {
      const errorMessage = `MySQL 连接配置不存在: ${request.connectionProfileId}`;
      const finishedAt = new Date().toISOString();
      for (const item of state.items) {
        item.status = "FAILED";
        item.finishedAt = finishedAt;
        item.error = errorMessage;
        item.message = errorMessage;
        appendLog(item, "error", errorMessage);
      }
      this.emitProgress(batchId, state, mainWindow);
      this.activeBatches.delete(batchId);
      return;
    }

    const connectionConfig: MySQLConnectionConfig = {
      host: profile.host,
      port: profile.port,
      user: profile.user,
      password: profile.password,
      database: profile.database,
    };

    // Acquire a connection pool for the entire batch — all items reuse the same pool
    const pool = this.mysqlService.getPool(connectionConfig);

    const siteFluxDrivingFile: Map<string, string> = new Map();
    const fallbackImportFiles: Map<string, string> = new Map();
    const tmpFiles: string[] = [];

    try {
      for (const item of state.items) {
        if (state.cancelled) {
          break;
        }

        item.status = "RUNNING";
        item.startedAt = new Date().toISOString();
        item.progress = 0;
        item.message = "正在准备...";
        appendLog(item, "info", `开始处理 ${item.siteCode} / ${item.dataType}`);
        this.emitProgress(batchId, state, mainWindow);

        try {
          await this.processItem(
            item,
            request,
            connectionConfig,
            pool,
            siteFluxDrivingFile,
            fallbackImportFiles,
            tmpFiles,
            batchId,
            state,
            mainWindow
          );
          item.status = "COMPLETED";
          item.progress = 100;
          item.message = "完成";
          appendLog(item, "info", "处理完成");
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          item.status = "FAILED";
          item.error = errMsg;
          item.message = "失败";
          appendLog(item, "error", `执行失败: ${errMsg}`);
        }

        item.finishedAt = new Date().toISOString();
        this.emitProgress(batchId, state, mainWindow);
      }
    } finally {
      for (const filePath of tmpFiles) {
        this.cleanupTmpFile(filePath);
      }
      this.activeBatches.delete(batchId);
    }
  }

  private async processItem(
    item: BEONBatchItem,
    request: BEONBatchRequest,
    connection: MySQLConnectionConfig,
    pool: any,
    siteFluxDrivingFile: Map<string, string>,
    fallbackImportFiles: Map<string, string>,
    tmpFiles: string[],
    batchId: string,
    state: BatchState,
    mainWindow: BrowserWindow | null
  ): Promise<void> {
    const dataType = item.dataType;
    const site = request.sites.find(entry => entry.siteCode === item.siteCode);
    if (!site) {
      throw new Error(`站点不存在: ${item.siteCode}`);
    }

    const emit = (progress: number, message: string) => {
      item.progress = progress;
      item.message = message;
      this.emitProgress(batchId, state, mainWindow);
    };

    const log = (level: BEONBatchLogEntry["level"], text: string) => {
      appendLog(item, level, text);
      this.emitProgress(batchId, state, mainWindow);
    };

    // --- 1. Import data from MySQL ---
    const tableName = this.resolveTableName(site, item.dataType);
    if (!tableName) {
      throw new Error(`未找到 ${item.siteCode} 的 ${item.dataType} 数据表`);
    }

    log("info", `正在连接 MySQL 并导入 ${tableName} (${request.startTime} ~ ${request.endTime}) ...`);
    emit(2, `正在从 MySQL 导入 ${dataType} 数据 (${tableName})...`);

    const importStart = Date.now();
    const importResult = await this.mysqlService.importTableByTimeRange(
      connection,
      tableName,
      request.startTime,
      request.endTime,
      undefined,
      "record_time",
      pool
    );
    const importMs = Date.now() - importStart;

    if (!importResult.success || !importResult.data) {
      throw new Error(importResult.error || `导入 ${item.siteCode} ${dataType} 数据失败`);
    }

    const rowCount = importResult.data.rowCount;
    log("info", `MySQL 导入完成: ${rowCount} 行, 耗时 ${(importMs / 1000).toFixed(1)}s`);
    emit(8, `导入完成 (${rowCount} 行, ${(importMs / 1000).toFixed(1)}s)`);

    let inputFile = importResult.data.csvPath;
    tmpFiles.push(inputFile);
    const fallbackRule = this.resolveFallbackRule(site);
    if (fallbackRule) {
      inputFile = await this.applyFallbackColumnsIfNeeded({
        connection,
        pool,
        primaryCsvPath: inputFile,
        request,
        dataType,
        fallbackRule,
        fallbackImportFiles,
        tmpFiles,
        log,
      });
    }

    const outputFile = path.join(request.outputDir, `beon_${item.siteCode}_${dataType}_${Date.now()}.csv`);
    // Output file is NOT added to tmpFiles — user wants to keep it

    // --- 2. Run pipeline ---
    if (dataType === "flux") {
      log("info", "启动 flux QC 管线 (REddyProc)...");
      emit(10, "正在执行 flux QC 管线...");

      const fluxMapping = {
        co2FluxCol: request.fluxColumnMapping?.co2FluxCol || "co2_flux",
        ppfdCol: request.fluxColumnMapping?.ppfdCol || "ppfd",
        rgRawCol: request.fluxColumnMapping?.rgRawCol || "rg_raw",
        tairRawCol: request.fluxColumnMapping?.tairRawCol || "tair_raw",
        rhRawCol: request.fluxColumnMapping?.rhRawCol || "rh_raw",
        ustarRawCol: request.fluxColumnMapping?.ustarRawCol || "ustar_raw",
      };

      const pipelineStart = Date.now();
      const result = await this.pythonBridge.runBEONREddyProcImputation(
        {
          inputFile,
          outputFile,
          latDeg: site.latitude,
          longDeg: site.longitude,
          timezoneHour: site.timezone,
          siteCode: site.siteCode,
          allowedQcFlags: request.qcFlagList?.length ? request.qcFlagList.join(",") : "0,1,2",
          useStrg: request.useStrg,
          despikingZ: request.despikingZ,
          co2FluxCol: fluxMapping.co2FluxCol || "co2_flux",
          h2oFluxCol: request.fluxColumnMapping?.h2oFluxCol,
          leCol: request.fluxColumnMapping?.leCol,
          hCol: request.fluxColumnMapping?.hCol,
          qcCo2FluxCol: request.fluxColumnMapping?.qcCo2FluxCol,
          qcH2oFluxCol: request.fluxColumnMapping?.qcH2oFluxCol,
          qcLeCol: request.fluxColumnMapping?.qcLeCol,
          qcHCol: request.fluxColumnMapping?.qcHCol,
          ppfdCol: fluxMapping.ppfdCol || "ppfd",
          rgRawCol: fluxMapping.rgRawCol || "rg_raw",
          tairRawCol: fluxMapping.tairRawCol || "tair_raw",
          rhRawCol: fluxMapping.rhRawCol || "rh_raw",
          vpdRawCol: request.fluxColumnMapping?.vpdRawCol,
          ustarRawCol: fluxMapping.ustarRawCol || "ustar_raw",
          co2StrgCol: request.fluxColumnMapping?.co2StrgCol,
          h2oStrgCol: request.fluxColumnMapping?.h2oStrgCol,
          leStrgCol: request.fluxColumnMapping?.leStrgCol,
          hStrgCol: request.fluxColumnMapping?.hStrgCol,
          shortUpCol: request.fluxColumnMapping?.shortUpCol,
          rh12mCol: request.fluxColumnMapping?.rh12mCol,
          rh10mCol: request.fluxColumnMapping?.rh10mCol,
          ta12mCol: request.fluxColumnMapping?.ta12mCol,
          thresholdsJson: request.thresholdsJson,
          localRulesJson: request.localRulesJson,
          fillAll: true,
        },
        progress => {
          const mapped = 10 + Math.round((progress.progress / 100) * 85);
          emit(mapped, `[flux] ${progress.message}`);
          if (progress.message) {
            appendLog(item, "info", `[Python] ${progress.message}`);
          }
        }
      );
      const pipelineMs = Date.now() - pipelineStart;

      if (!result.success) {
        throw new Error(result.error || result.data?.error || "flux QC 管线执行失败");
      }

      log("info", `flux QC 管线完成, 耗时 ${(pipelineMs / 1000).toFixed(1)}s`);

      // Store the RAW MySQL CSV (not the processed output) for non-flux driving data.
      // The raw CSV has record_time + original column names that non-flux pipelines expect.
      siteFluxDrivingFile.set(site.siteCode, inputFile);
      item.resultData = {
        outputFile,
        rowCount,
        pythonResult: result.data,
      };
    } else {
      // --- non-flux: need flux driving file ---
      let fluxDrivingFile = siteFluxDrivingFile.get(site.siteCode);

      if (!fluxDrivingFile) {
        log("info", "flux 驱动文件尚未准备，正在导入 flux 数据...");
        emit(8, "正在导入 flux 驱动变量...");
        const fluxTableName = this.resolveTableName(site, "flux");
        if (!fluxTableName) {
          throw new Error(`未找到 ${item.siteCode} 的 flux 驱动表`);
        }

        const fluxImportStart = Date.now();
        const fluxImportResult = await this.mysqlService.importTableByTimeRange(
          connection,
          fluxTableName,
          request.startTime,
          request.endTime,
          undefined,
          "record_time",
          pool
        );
        const fluxImportMs = Date.now() - fluxImportStart;

        if (!fluxImportResult.success || !fluxImportResult.data) {
          throw new Error(fluxImportResult.error || `导入 ${item.siteCode} flux 驱动变量失败`);
        }

        log(
          "info",
          `flux 驱动变量导入完成: ${fluxImportResult.data.rowCount} 行, 耗时 ${(fluxImportMs / 1000).toFixed(1)}s`
        );

        fluxDrivingFile = fluxImportResult.data.csvPath;
        tmpFiles.push(fluxDrivingFile);
        if (fallbackRule) {
          fluxDrivingFile = await this.applyFallbackColumnsIfNeeded({
            connection,
            pool,
            primaryCsvPath: fluxDrivingFile,
            request,
            dataType: "flux",
            fallbackRule,
            fallbackImportFiles,
            tmpFiles,
            log,
          });
        }
        siteFluxDrivingFile.set(site.siteCode, fluxDrivingFile);
      } else {
        log("info", "复用已有 flux 驱动文件");
      }

      log("info", `启动 ${dataType} QC 管线...`);
      emit(15, `正在执行 ${dataType} QC 管线...`);

      const pipelineStart = Date.now();
      const result = await this.pythonBridge.runBEONNonFluxPipeline(
        {
          inputFile,
          outputFile,
          fluxInputFile: fluxDrivingFile,
          dataType,
          latDeg: site.latitude,
          longDeg: site.longitude,
          timezoneHour: site.timezone,
          siteCode: site.siteCode,
          thresholdsJson: request.thresholdsJson,
          gapfillIndicators: request.gapfillIndicators?.join(","),
        },
        progress => {
          const mapped = 15 + Math.round((progress.progress / 100) * 80);
          emit(mapped, `[${dataType}] ${progress.message}`);
          if (progress.message) {
            appendLog(item, "info", `[Python] ${progress.message}`);
          }
        }
      );
      const pipelineMs = Date.now() - pipelineStart;

      if (!result.success) {
        throw new Error(result.error || result.data?.error || `${dataType} QC 管线执行失败`);
      }

      log("info", `${dataType} QC 管线完成, 耗时 ${(pipelineMs / 1000).toFixed(1)}s`);

      item.resultData = {
        outputFile,
        fluxDrivingFile,
        rowCount,
        pythonResult: result.data,
      };
    }

    emit(98, "处理完成");
  }

  private resolveTableName(site: BEONBatchRequest["sites"][number], dataType: BEONDataType): string | undefined {
    const explicitMap: Record<BEONDataType, string | undefined> = {
      flux: site.fluxTableName,
      sapflow: site.sapflowTableName,
      aqi: site.aqiTableName,
      nai: site.naiTableName,
    };

    if (explicitMap[dataType]) {
      return explicitMap[dataType];
    }

    return site.siteCode + TABLE_SUFFIX[dataType];
  }

  private resolveFallbackRule(site: BEONBatchRequest["sites"][number]): SiteFallbackRule | null {
    const siteCode = (site.siteCode || "").trim().toLowerCase();
    return (
      SITE_FALLBACK_RULES.find(rule => rule.targetSiteIds.has(site.siteId) || rule.targetSiteCodes.has(siteCode)) || null
    );
  }

  private resolveFallbackTableName(
    request: BEONBatchRequest,
    fallbackRule: SiteFallbackRule,
    dataType: BEONDataType
  ): string {
    const configuredSource = request.sites.find(
      site =>
        site.siteId === fallbackRule.sourceSiteId ||
        (site.siteCode || "").trim().toLowerCase() === fallbackRule.sourceSiteCode
    );
    if (configuredSource) {
      const configuredTable = this.resolveTableName(configuredSource, dataType);
      if (configuredTable) {
        return configuredTable;
      }
    }

    return fallbackRule.sourceSiteCode + TABLE_SUFFIX[dataType];
  }

  private async applyFallbackColumnsIfNeeded(args: {
    connection: MySQLConnectionConfig;
    pool: any;
    primaryCsvPath: string;
    request: BEONBatchRequest;
    dataType: BEONDataType;
    fallbackRule: SiteFallbackRule;
    fallbackImportFiles: Map<string, string>;
    tmpFiles: string[];
    log: (level: BEONBatchLogEntry["level"], text: string) => void;
  }): Promise<string> {
    const fallbackTableName = this.resolveFallbackTableName(args.request, args.fallbackRule, args.dataType);
    const cacheKey = `${fallbackTableName}|${args.request.startTime}|${args.request.endTime}`;

    let fallbackCsvPath = args.fallbackImportFiles.get(cacheKey);
    if (!fallbackCsvPath) {
      args.log(
        "info",
        `站点缺指标回退已启用，正在导入 ${args.fallbackRule.sourceSiteCode}/${args.dataType} 数据 (${fallbackTableName})...`
      );
      const fallbackImport = await this.mysqlService.importTableByTimeRange(
        args.connection,
        fallbackTableName,
        args.request.startTime,
        args.request.endTime,
        undefined,
        TIME_COLUMN,
        args.pool
      );
      if (!fallbackImport.success || !fallbackImport.data) {
        throw new Error(
          fallbackImport.error ||
            `导入 ${args.fallbackRule.sourceSiteCode} ${args.dataType} 回退数据失败，无法补齐目标站点缺失指标`
        );
      }

      fallbackCsvPath = fallbackImport.data.csvPath;
      args.fallbackImportFiles.set(cacheKey, fallbackCsvPath);
      args.tmpFiles.push(fallbackCsvPath);
    }

    const mergedCsvPath = this.mergeMissingColumnsByTime(args.primaryCsvPath, fallbackCsvPath, args.dataType);
    if (mergedCsvPath === args.primaryCsvPath) {
      return args.primaryCsvPath;
    }

    args.tmpFiles.push(mergedCsvPath);
    args.log(
      "info",
      `已从 ${args.fallbackRule.sourceSiteCode}/${args.dataType} 按 ${TIME_COLUMN} 补齐目标站点缺失指标`
    );
    return mergedCsvPath;
  }

  private mergeMissingColumnsByTime(primaryCsvPath: string, fallbackCsvPath: string, dataType: BEONDataType): string {
    const primary = this.readCsvRecords(primaryCsvPath);
    const fallback = this.readCsvRecords(fallbackCsvPath);
    if (!primary.meta.fields?.includes(TIME_COLUMN) || !fallback.meta.fields?.includes(TIME_COLUMN)) {
      return primaryCsvPath;
    }

    const primaryColumns = primary.meta.fields;
    const fallbackColumns = fallback.meta.fields;
    const primaryColumnSet = new Set(primaryColumns);
    const columnsToCopy = fallbackColumns.filter(
      column => !primaryColumnSet.has(column) && !FALLBACK_COLUMN_EXCLUDES.has(column)
    );
    const columnsToFill = fallbackColumns.filter(
      column =>
        primaryColumnSet.has(column) &&
        !FALLBACK_COLUMN_EXCLUDES.has(column) &&
        primary.data.every(row => this.isBlankCsvValue(row[column]))
    );
    if (columnsToCopy.length === 0 && columnsToFill.length === 0) {
      return primaryCsvPath;
    }

    const fallbackByTime = new Map<string, CsvRecord>();
    for (const row of fallback.data) {
      const timeValue = row[TIME_COLUMN];
      if (timeValue && !fallbackByTime.has(timeValue)) {
        fallbackByTime.set(timeValue, row);
      }
    }

    const mergedRows = primary.data.map(row => {
      const source = fallbackByTime.get(row[TIME_COLUMN]);
      const merged: CsvRecord = { ...row };
      for (const column of columnsToCopy) {
        merged[column] = source?.[column] ?? "";
      }
      for (const column of columnsToFill) {
        merged[column] = source?.[column] ?? "";
      }
      return merged;
    });

    const mergedCsvPath = path.join(
      path.dirname(primaryCsvPath),
      `beon_${dataType}_fallback_${Date.now()}_${Math.random().toString(16).slice(2)}.csv`
    );
    fs.writeFileSync(mergedCsvPath, Papa.unparse({ fields: [...primaryColumns, ...columnsToCopy], data: mergedRows }), {
      encoding: "utf-8",
    });
    return mergedCsvPath;
  }

  private readCsvRecords(csvPath: string): Papa.ParseResult<CsvRecord> {
    const content = fs.readFileSync(csvPath, "utf-8");
    const parsed = Papa.parse<CsvRecord>(content, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0];
      throw new Error(`CSV 解析失败 (${path.basename(csvPath)}): ${firstError.message}`);
    }
    return parsed;
  }

  private isBlankCsvValue(value: string | undefined): boolean {
    return value === undefined || value === null || String(value).trim() === "" || String(value).trim().toLowerCase() === "nan";
  }

  private buildProgressEvent(batchId: string, state: BatchState): BEONBatchProgressEvent {
    const completedItems = state.items.filter(
      item => item.status === "COMPLETED" || item.status === "FAILED" || item.status === "CANCELLED"
    ).length;
    const currentItem = state.items.find(item => item.status === "RUNNING") || null;
    return {
      batchId,
      totalItems: state.items.length,
      completedItems,
      currentItem,
      items: state.items,
    };
  }

  private emitProgress(batchId: string, state: BatchState, mainWindow: BrowserWindow | null): void {
    const event = this.buildProgressEvent(batchId, state);
    mainWindow?.webContents.send(BATCH_PROGRESS_CHANNEL, event);
  }

  private cleanupTmpFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
  }
}
