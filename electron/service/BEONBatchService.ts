import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Papa from "papaparse";

import { BrowserWindow } from "electron";
import { PythonBridgeService } from "./PythonBridgeService";
import { MySQLService } from "./MySQLService";
import type { BEONEquipmentTableNameMap } from "./MySQLService";
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
type SiteConfig = BEONBatchRequest["sites"][number];

const FALLBACK_COLUMN_EXCLUDES = new Set([
  TIME_COLUMN,
  "id",
  "site_id",
  "is_del",
  "created_at",
  "updated_at",
  "deleted_at",
]);

interface CachedImportResult {
  csvPath: string;
  rowCount: number;
  cachePath?: string;
}

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
    const equipmentTableNames = await this.resolveEquipmentTableNames(connectionConfig, request, pool);

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
            equipmentTableNames,
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
    equipmentTableNames: BEONEquipmentTableNameMap,
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
    const tableNames = this.resolveTableNames(site, item.dataType, equipmentTableNames);
    if (tableNames.length === 0) {
      throw new Error(`未找到 ${item.siteCode} 的 ${item.dataType} 数据表`);
    }
    const fallbackRule = this.resolveFallbackRule(site);
    const resultFiles: string[] = [];
    let totalRowCount = 0;
    let lastPythonResult: any;

    for (let tableIndex = 0; tableIndex < tableNames.length; tableIndex++) {
      const tableName = tableNames[tableIndex];
      const tableLabel = tableNames.length > 1 ? `第 ${tableIndex + 1}/${tableNames.length} 个 FTP 表` : "FTP 表";
      log("info", `正在准备 ${tableLabel}: ${tableName} (${request.startTime} ~ ${request.endTime}) 数据...`);
      emit(2, `正在准备 ${dataType} 数据 (${tableName})...`);

      const importStart = Date.now();
      const chunkProgress = (current: number, total: number) => {
        emit(2 + Math.round((current / total) * 6), `拉取 ${tableName} 数据 ${current}/${total} 分片...`);
        log("info", `${tableName} 数据拉取分片 ${current}/${total} 完成`);
      };
      const importResult = await this.importTableWithLocalCache(
        connection,
        tableName,
        request,
        pool,
        tmpFiles,
        log,
        chunkProgress
      );
      const importMs = Date.now() - importStart;

      const rowCount = importResult.rowCount;
      totalRowCount += rowCount;
      log("info", `${tableName} 数据准备完成: ${rowCount} 行, 耗时 ${(importMs / 1000).toFixed(1)}s`);
      emit(8, `${tableName} 数据准备完成 (${rowCount} 行)`);

      let inputFile = importResult.csvPath;
      if (fallbackRule) {
        const fallbackProgress = (current: number, total: number) => {
          emit(8 + Math.round((current / total) * 2), `回退站点数据 ${current}/${total} 分片...`);
          log("info", `回退源 ${fallbackRule.sourceSiteCode} → ${site.siteCode} 数据拉取分片 ${current}/${total} 完成`);
        };
        inputFile = await this.applyFallbackColumnsIfNeeded({
          connection,
          pool,
          primaryCsvPath: inputFile,
          request,
          dataType,
          fallbackRule,
          equipmentTableNames,
          fallbackImportFiles,
          tmpFiles,
          log,
          onChunkProgress: fallbackProgress,
        });
      }

      const outputFile = this.createQCOutputPath(request.outputDir, tableName, dataType);
      // Output file is NOT added to tmpFiles — user wants to keep it

      // --- 2. Run pipeline ---
      if (dataType === "flux") {
        log("info", `启动 ${tableName} flux QC 管线 (REddyProc)...`);
        emit(10, `正在执行 ${tableName} flux QC 管线...`);

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
            if (progress.progress >= 0) {
              const mapped = 10 + Math.round((progress.progress / 100) * 85);
              emit(mapped, `[${tableName}] ${progress.message}`);
            }
            if (progress.message) {
              appendLog(item, "info", `[Python] ${progress.message}`);
            }
          }
        );
        const pipelineMs = Date.now() - pipelineStart;

        if (!result.success) {
          const stderrInfo = result.stderr ? `\n[stderr]: ${result.stderr}` : "";
          throw new Error((result.error || result.data?.error || "flux QC 管线执行失败") + stderrInfo);
        }

        log("info", `${tableName} flux QC 管线完成, 耗时 ${(pipelineMs / 1000).toFixed(1)}s`);

        // Store the RAW MySQL CSV (not the processed output) for non-flux driving data.
        // The raw CSV has record_time + original column names that non-flux pipelines expect.
        siteFluxDrivingFile.set(site.siteCode, inputFile);
        lastPythonResult = result.data;
      } else {
        // --- non-flux: need flux driving file ---
        let fluxDrivingFile = siteFluxDrivingFile.get(site.siteCode);

        if (!fluxDrivingFile) {
          log("info", "flux 驱动文件尚未准备，正在导入 flux 数据...");
          emit(8, "正在导入 flux 驱动变量...");
          const fluxTableNames = this.resolveTableNames(site, "flux", equipmentTableNames);
          if (fluxTableNames.length === 0) {
            throw new Error(`未找到 ${item.siteCode} 的 flux 驱动表`);
          }

          const fluxImportStart = Date.now();
          const fluxChunkProgress = (current: number, total: number) => {
            emit(8 + Math.round((current / total) * 7), `拉取 flux 驱动 ${current}/${total} 分片...`);
            log("info", `flux 驱动数据拉取分片 ${current}/${total} 完成`);
          };
          const fluxImportResult = await this.importTablesWithLocalCache(
            connection,
            fluxTableNames,
            request,
            pool,
            tmpFiles,
            log,
            fluxChunkProgress
          );
          const fluxImportMs = Date.now() - fluxImportStart;

          log(
            "info",
            `flux 驱动变量准备完成: ${fluxImportResult.rowCount} 行, 耗时 ${(fluxImportMs / 1000).toFixed(1)}s`
          );

          fluxDrivingFile = fluxImportResult.csvPath;
          if (fallbackRule) {
            const fluxFallbackProgress = (current: number, total: number) => {
              emit(14 + Math.round((current / total) * 1), `回退驱动数据 ${current}/${total} 分片...`);
              log(
                "info",
                `回退源 ${fallbackRule.sourceSiteCode} → ${site.siteCode} flux驱动拉取分片 ${current}/${total} 完成`
              );
            };
            fluxDrivingFile = await this.applyFallbackColumnsIfNeeded({
              connection,
              pool,
              primaryCsvPath: fluxDrivingFile,
              request,
              dataType: "flux",
              fallbackRule,
              equipmentTableNames,
              fallbackImportFiles,
              tmpFiles,
              log,
              onChunkProgress: fluxFallbackProgress,
            });
          }
          siteFluxDrivingFile.set(site.siteCode, fluxDrivingFile);
        } else {
          log("info", "复用已有 flux 驱动文件");
        }

        log("info", `启动 ${tableName} ${dataType} QC 管线...`);
        emit(15, `正在执行 ${tableName} ${dataType} QC 管线...`);

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
            if (progress.progress >= 0) {
              const mapped = 15 + Math.round((progress.progress / 100) * 80);
              emit(mapped, `[${tableName}] ${progress.message}`);
            }
            if (progress.message) {
              appendLog(item, "info", `[Python] ${progress.message}`);
            }
          }
        );
        const pipelineMs = Date.now() - pipelineStart;

        if (!result.success) {
          const stderrInfo = result.stderr ? `\n[stderr]: ${result.stderr}` : "";
          throw new Error((result.error || result.data?.error || `${dataType} QC 管线执行失败`) + stderrInfo);
        }

        log("info", `${tableName} ${dataType} QC 管线完成, 耗时 ${(pipelineMs / 1000).toFixed(1)}s`);
        lastPythonResult = result.data;
      }

      resultFiles.push(outputFile);
    }

    item.resultData = {
      outputFile: resultFiles[0],
      outputFiles: resultFiles,
      rowCount: totalRowCount,
      pythonResult: lastPythonResult,
    };

    emit(98, "处理完成");
  }

  private async resolveEquipmentTableNames(
    connection: MySQLConnectionConfig,
    request: BEONBatchRequest,
    pool: any
  ): Promise<BEONEquipmentTableNameMap> {
    const siteIds = request.sites.map(site => site.siteId);
    const dataTypes = Array.from(new Set([...request.dataTypes, "flux" as BEONDataType]));
    const result = await this.mysqlService.resolveBEONEquipmentTableNames(connection, siteIds, dataTypes, pool);
    if (!result.success) {
      throw new Error(result.error || "查询 equipments 表失败");
    }
    return result.data || {};
  }

  private resolveTableNames(
    site: SiteConfig,
    dataType: BEONDataType,
    equipmentTableNames?: BEONEquipmentTableNameMap
  ): string[] {
    const explicitMap: Record<BEONDataType, string | undefined> = {
      flux: site.fluxTableName,
      sapflow: site.sapflowTableName,
      aqi: site.aqiTableName,
      nai: site.naiTableName,
    };
    const explicitListMap: Record<BEONDataType, string[] | undefined> = {
      flux: site.tableNames?.flux || site.fluxTableNames,
      sapflow: site.tableNames?.sapflow || site.sapflowTableNames,
      aqi: site.tableNames?.aqi || site.aqiTableNames,
      nai: site.tableNames?.nai || site.naiTableNames,
    };

    const normalize = (values: Array<string | undefined>): string[] =>
      Array.from(new Set(values.map(value => (value || "").trim()).filter(Boolean)));

    const explicitList = normalize(explicitListMap[dataType] || []);
    if (site.tableNames && Object.prototype.hasOwnProperty.call(site.tableNames, dataType)) {
      return explicitList;
    }
    if (explicitList.length > 0) {
      return explicitList;
    }

    const equipmentTableNamesForType = equipmentTableNames?.[site.siteId]?.[dataType] || [];
    if (equipmentTableNamesForType.length > 0) {
      return normalize(equipmentTableNamesForType);
    }

    const explicit = explicitMap[dataType]?.trim();
    if (explicit) {
      return [explicit];
    }

    const siteCode = (site.siteCode || "").trim();
    return siteCode ? [siteCode + TABLE_SUFFIX[dataType]] : [];
  }

  private async importTablesWithLocalCache(
    connection: MySQLConnectionConfig,
    tableNames: string[],
    request: BEONBatchRequest,
    pool: any,
    tmpFiles: string[],
    log: (level: BEONBatchLogEntry["level"], text: string) => void,
    onChunkProgress?: (current: number, total: number) => void
  ): Promise<CachedImportResult> {
    if (tableNames.length === 1) {
      return this.importTableWithLocalCache(connection, tableNames[0], request, pool, tmpFiles, log, onChunkProgress);
    }

    const importedFiles: CachedImportResult[] = [];
    for (let index = 0; index < tableNames.length; index++) {
      const tableName = tableNames[index];
      log("info", `正在拉取第 ${index + 1}/${tableNames.length} 个 FTP 表: ${tableName}`);
      importedFiles.push(
        await this.importTableWithLocalCache(connection, tableName, request, pool, tmpFiles, log, onChunkProgress)
      );
    }

    const mergedCsvPath = path.join(
      os.tmpdir(),
      `beon_multi_ftp_${this.sanitizePathSegment(tableNames[0])}_${Date.now()}.csv`
    );
    const rowCount = this.mergeCsvFilesByTime(
      importedFiles.map(file => file.csvPath),
      mergedCsvPath
    );
    tmpFiles.push(mergedCsvPath);
    return { csvPath: mergedCsvPath, rowCount };
  }

  private async importTableWithLocalCache(
    connection: MySQLConnectionConfig,
    tableName: string,
    request: BEONBatchRequest,
    pool: any,
    tmpFiles: string[],
    log: (level: BEONBatchLogEntry["level"], text: string) => void,
    onChunkProgress?: (current: number, total: number) => void
  ): Promise<CachedImportResult> {
    const localDataDir = (request.localDataDir || "").trim();
    if (!localDataDir) {
      const directImport = await this.mysqlService.importTableByTimeRange(
        connection,
        tableName,
        request.startTime,
        request.endTime,
        undefined,
        TIME_COLUMN,
        pool,
        30,
        onChunkProgress
      );
      if (!directImport.success || !directImport.data) {
        throw new Error(directImport.error || `导入 ${tableName} 数据失败`);
      }
      tmpFiles.push(directImport.data.csvPath);
      return directImport.data;
    }

    fs.mkdirSync(localDataDir, { recursive: true });
    const cachePath = this.resolveCachePath(localDataDir, request.connectionProfileId, tableName);
    await this.ensureCacheCoversRange({
      connection,
      pool,
      tableName,
      cachePath,
      startTime: request.startTime,
      endTime: request.endTime,
      log,
      tmpFiles,
      onChunkProgress,
    });

    const slicePath = this.writeTimeRangeSlice(cachePath, tableName, request.startTime, request.endTime);
    tmpFiles.push(slicePath);
    const rowCount = this.readCsvRecords(slicePath).data.length;
    return { csvPath: slicePath, rowCount, cachePath };
  }

  private async ensureCacheCoversRange(args: {
    connection: MySQLConnectionConfig;
    pool: any;
    tableName: string;
    cachePath: string;
    startTime: string;
    endTime: string;
    log: (level: BEONBatchLogEntry["level"], text: string) => void;
    tmpFiles: string[];
    onChunkProgress?: (current: number, total: number) => void;
  }): Promise<void> {
    if (!fs.existsSync(args.cachePath)) {
      args.log("info", `本地缓存不存在，正在拉取 ${args.tableName} 首次数据...`);
      const imported = await this.fetchTableRange(
        args.connection,
        args.tableName,
        args.startTime,
        args.endTime,
        args.pool,
        args.onChunkProgress
      );
      args.tmpFiles.push(imported.csvPath);
      fs.mkdirSync(path.dirname(args.cachePath), { recursive: true });
      fs.copyFileSync(imported.csvPath, args.cachePath);
      args.log("info", `已写入本地缓存 ${args.cachePath}`);
      return;
    }

    const cached = this.readCsvRecords(args.cachePath);
    const bounds = this.getCsvTimeBounds(cached.data);
    if (!bounds) {
      args.log("warn", `本地缓存 ${args.tableName} 为空，正在重新拉取请求时间段...`);
      const imported = await this.fetchTableRange(
        args.connection,
        args.tableName,
        args.startTime,
        args.endTime,
        args.pool,
        args.onChunkProgress
      );
      args.tmpFiles.push(imported.csvPath);
      fs.mkdirSync(path.dirname(args.cachePath), { recursive: true });
      fs.copyFileSync(imported.csvPath, args.cachePath);
      return;
    }

    if (this.compareTime(args.startTime, bounds.min) < 0) {
      args.log("info", `本地缓存缺少前段数据，正在拉取 ${args.startTime} ~ ${bounds.min}...`);
      const imported = await this.fetchTableRange(
        args.connection,
        args.tableName,
        args.startTime,
        bounds.min,
        args.pool,
        args.onChunkProgress
      );
      args.tmpFiles.push(imported.csvPath);
      this.mergeCsvIntoCache(args.cachePath, imported.csvPath);
    }

    if (this.compareTime(args.endTime, bounds.max) > 0) {
      args.log("info", `本地缓存缺少新增数据，正在拉取 ${bounds.max} ~ ${args.endTime}...`);
      const imported = await this.fetchTableRange(
        args.connection,
        args.tableName,
        bounds.max,
        args.endTime,
        args.pool,
        args.onChunkProgress
      );
      args.tmpFiles.push(imported.csvPath);
      this.mergeCsvIntoCache(args.cachePath, imported.csvPath);
    }
  }

  private async fetchTableRange(
    connection: MySQLConnectionConfig,
    tableName: string,
    startTime: string,
    endTime: string,
    pool: any,
    onChunkProgress?: (current: number, total: number) => void
  ): Promise<{ csvPath: string; rowCount: number }> {
    const imported = await this.mysqlService.importTableByTimeRange(
      connection,
      tableName,
      startTime,
      endTime,
      undefined,
      TIME_COLUMN,
      pool,
      30, // 30 天分片
      onChunkProgress
    );
    if (!imported.success || !imported.data) {
      throw new Error(imported.error || `导入 ${tableName} 数据失败`);
    }
    return imported.data;
  }

  private mergeCsvIntoCache(cachePath: string, incomingCsvPath: string): void {
    const cached = this.readCsvRecords(cachePath);
    const incoming = this.readCsvRecords(incomingCsvPath);
    const fields = this.mergeCsvFields(cached.meta.fields || [], incoming.meta.fields || []);
    const byTime = new Map<string, CsvRecord>();

    for (const row of [...cached.data, ...incoming.data]) {
      const timeValue = row[TIME_COLUMN];
      if (!timeValue) {
        continue;
      }
      const existing = byTime.get(timeValue);
      if (!existing) {
        byTime.set(timeValue, row);
        continue;
      }
      for (const [column, value] of Object.entries(row)) {
        if (this.isBlankCsvValue(existing[column]) && !this.isBlankCsvValue(value)) {
          existing[column] = value;
        }
      }
    }

    const mergedRows = Array.from(byTime.values()).sort((a, b) => this.compareTime(a[TIME_COLUMN], b[TIME_COLUMN]));
    this.writeCsv(cachePath, fields, mergedRows);
  }

  private mergeCsvFilesByTime(csvPaths: string[], outputPath: string): number {
    const fields: string[] = [TIME_COLUMN];
    const rowsByTime = new Map<string, CsvRecord>();

    for (const csvPath of csvPaths) {
      const parsed = this.readCsvRecords(csvPath);
      for (const field of parsed.meta.fields || []) {
        if (!fields.includes(field)) {
          fields.push(field);
        }
      }

      for (const row of parsed.data) {
        const timeValue = row[TIME_COLUMN];
        if (!timeValue) {
          continue;
        }
        const merged = rowsByTime.get(timeValue) || { [TIME_COLUMN]: timeValue };
        for (const [column, value] of Object.entries(row)) {
          if (column === TIME_COLUMN) {
            continue;
          }
          if (this.isBlankCsvValue(merged[column]) && !this.isBlankCsvValue(value)) {
            merged[column] = value;
          }
        }
        rowsByTime.set(timeValue, merged);
      }
    }

    const rows = Array.from(rowsByTime.values()).sort((a, b) => this.compareTime(a[TIME_COLUMN], b[TIME_COLUMN]));
    this.writeCsv(outputPath, fields, rows);
    return rows.length;
  }

  private writeTimeRangeSlice(cachePath: string, tableName: string, startTime: string, endTime: string): string {
    const cached = this.readCsvRecords(cachePath);
    const fields = cached.meta.fields || [];
    const rows = cached.data
      .filter(row => this.isTimeInRange(row[TIME_COLUMN], startTime, endTime))
      .sort((a, b) => this.compareTime(a[TIME_COLUMN], b[TIME_COLUMN]));
    const slicePath = path.join(os.tmpdir(), `beon_cache_${this.sanitizePathSegment(tableName)}_${Date.now()}.csv`);
    this.writeCsv(slicePath, fields, rows);
    return slicePath;
  }

  private resolveCachePath(localDataDir: string, connectionProfileId: number, tableName: string): string {
    return path.join(localDataDir, `profile_${connectionProfileId}`, `${this.sanitizePathSegment(tableName)}.csv`);
  }

  private createQCOutputPath(outputDir: string, tableName: string, dataType: BEONDataType): string {
    const ftp = this.resolveFtpFromTableName(tableName, dataType);
    return path.join(outputDir, `QC_${this.sanitizePathSegment(ftp)}_${dataType}_${this.randomBase36(12)}.csv`);
  }

  private resolveFtpFromTableName(tableName: string, dataType: BEONDataType): string {
    const suffix = TABLE_SUFFIX[dataType];
    return tableName.endsWith(suffix) ? tableName.slice(0, -suffix.length) : tableName;
  }

  private randomBase36(length: number): string {
    let value = "";
    while (value.length < length) {
      value += Math.random().toString(36).slice(2);
    }
    return value.slice(0, length);
  }

  private mergeCsvFields(primary: string[], secondary: string[]): string[] {
    return Array.from(new Set([...primary, ...secondary]));
  }

  private getCsvTimeBounds(rows: CsvRecord[]): { min: string; max: string } | null {
    const values = rows
      .map(row => row[TIME_COLUMN])
      .filter(Boolean)
      .sort((a, b) => this.compareTime(a, b));
    if (values.length === 0) {
      return null;
    }
    return { min: values[0], max: values[values.length - 1] };
  }

  private isTimeInRange(value: string | undefined, startTime: string, endTime: string): boolean {
    if (!value) {
      return false;
    }
    return this.compareTime(value, startTime) >= 0 && this.compareTime(value, endTime) <= 0;
  }

  private compareTime(left: string, right: string): number {
    const leftTime = Date.parse(String(left).replace(" ", "T"));
    const rightTime = Date.parse(String(right).replace(" ", "T"));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      return leftTime - rightTime;
    }
    return String(left).localeCompare(String(right));
  }

  private sanitizePathSegment(value: string): string {
    return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\.+$/g, "_") || "table";
  }

  private writeCsv(filePath: string, fields: string[], rows: CsvRecord[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Papa.unparse({ fields, data: rows }), { encoding: "utf-8" });
  }

  private resolveFallbackRule(site: SiteConfig): SiteFallbackRule | null {
    const siteCode = (site.siteCode || "").trim().toLowerCase();
    return (
      SITE_FALLBACK_RULES.find(rule => rule.targetSiteIds.has(site.siteId) || rule.targetSiteCodes.has(siteCode)) ||
      null
    );
  }

  private resolveFallbackTableName(
    request: BEONBatchRequest,
    fallbackRule: SiteFallbackRule,
    dataType: BEONDataType,
    equipmentTableNames?: BEONEquipmentTableNameMap
  ): string {
    const configuredSource = request.sites.find(
      site =>
        site.siteId === fallbackRule.sourceSiteId ||
        (site.siteCode || "").trim().toLowerCase() === fallbackRule.sourceSiteCode
    );
    if (configuredSource) {
      const configuredTables = this.resolveTableNames(configuredSource, dataType, equipmentTableNames);
      if (configuredTables.length > 0) {
        return configuredTables[0];
      }
    }

    const equipmentTableName = equipmentTableNames?.[fallbackRule.sourceSiteId]?.[dataType]?.[0];
    if (equipmentTableName) {
      return equipmentTableName;
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
    equipmentTableNames?: BEONEquipmentTableNameMap;
    fallbackImportFiles: Map<string, string>;
    tmpFiles: string[];
    log: (level: BEONBatchLogEntry["level"], text: string) => void;
    onChunkProgress?: (current: number, total: number) => void;
  }): Promise<string> {
    const fallbackTableName = this.resolveFallbackTableName(
      args.request,
      args.fallbackRule,
      args.dataType,
      args.equipmentTableNames
    );
    const cacheKey = `${fallbackTableName}|${args.request.startTime}|${args.request.endTime}`;

    let fallbackCsvPath = args.fallbackImportFiles.get(cacheKey);
    if (!fallbackCsvPath) {
      args.log(
        "info",
        `站点缺指标回退已启用，正在分析 ${args.fallbackRule.sourceSiteCode}/${args.dataType} 需要补齐的指标列...`
      );

      // 1. 分析主表已有列及全为空列
      const primary = this.readCsvRecords(args.primaryCsvPath);
      const primaryColumns = primary.meta.fields || [];
      const primaryColumnSet = new Set(primaryColumns);
      const emptyPrimaryColumns = primaryColumns.filter(
        col => !FALLBACK_COLUMN_EXCLUDES.has(col) && primary.data.every(row => this.isBlankCsvValue(row[col]))
      );

      // 2. 获取回退表列名（轻量 SHOW COLUMNS，不传输数据行）
      const columnsResult = await this.mysqlService.getTableColumns(args.connection, fallbackTableName, args.pool);
      if (!columnsResult.success || !columnsResult.data) {
        throw new Error(`获取回退表 ${fallbackTableName} 列结构失败: ${columnsResult.error}`);
      }
      const fallbackAllColumns = columnsResult.data;

      // 3. 计算实际需要拉取的列
      const neededColumns: string[] = [TIME_COLUMN];
      for (const col of fallbackAllColumns) {
        if (FALLBACK_COLUMN_EXCLUDES.has(col)) continue;
        if (!primaryColumnSet.has(col)) {
          neededColumns.push(col); // columnsToCopy: 主表没有的列
        } else if (emptyPrimaryColumns.includes(col)) {
          neededColumns.push(col); // columnsToFill: 主表有但全为空的列
        }
      }

      // 4. 无需要补齐的列则跳过拉取
      if (neededColumns.length <= 1) {
        args.log("info", `回退表 ${fallbackTableName} 无需补齐任何指标列，跳过`);
        args.fallbackImportFiles.set(cacheKey, args.primaryCsvPath);
        return args.primaryCsvPath;
      }

      args.log(
        "info",
        `按需拉取回退表 ${fallbackTableName}: ${neededColumns.length} 个指标列 (原表共 ${fallbackAllColumns.length} 列)，可减少 ${fallbackAllColumns.length - neededColumns.length} 列传输`
      );

      const fallbackImport = await this.mysqlService.importTableByTimeRange(
        args.connection,
        fallbackTableName,
        args.request.startTime,
        args.request.endTime,
        neededColumns,
        TIME_COLUMN,
        args.pool,
        30,
        args.onChunkProgress
      );

      if (!fallbackImport.success || !fallbackImport.data) {
        throw new Error(fallbackImport.error || `导入回退表 ${fallbackTableName} 数据失败`);
      }

      fallbackCsvPath = fallbackImport.data.csvPath;
      args.tmpFiles.push(fallbackCsvPath);
      args.fallbackImportFiles.set(cacheKey, fallbackCsvPath);
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
    return (
      value === undefined ||
      value === null ||
      String(value).trim() === "" ||
      String(value).trim().toLowerCase() === "nan"
    );
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
