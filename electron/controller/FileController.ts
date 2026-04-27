import { BaseController } from "./BaseController";
import { IpcMainInvokeEvent } from "electron";
import { Worker } from "worker_threads";
import * as path from "path";
import { normalizeTimestamp, formatTimestamp } from "../utils/timeUtils";
import { SettingsRepository } from "../repository/SettingsRepository";

type ParsedCsvCacheEntry = {
  data: any;
  lastUsed: number;
};

export class FileController extends BaseController {
  private fileParserWorker: Worker | null = null;
  private settingsRepository: SettingsRepository;
  private parserQueue: Promise<void> = Promise.resolve();
  private parsedCsvCache = new Map<string, ParsedCsvCacheEntry>();
  private parsedCsvInFlight = new Map<string, Promise<any>>();
  private readonly maxParsedCsvCacheEntries = 4;

  constructor() {
    super();
    this.settingsRepository = new SettingsRepository();
  }

  /**
   * 创建文件解析Worker
   */
  private createFileParserWorker(): Worker {
    if (this.fileParserWorker) {
      return this.fileParserWorker;
    }

    const workerPath = path.join(__dirname, "../workers", "fileParser.js");
    this.fileParserWorker = new Worker(workerPath);

    // 当worker退出时，清除引用
    this.fileParserWorker.on("exit", () => {
      this.fileParserWorker = null;
    });

    // 处理worker错误
    this.fileParserWorker.on("error", err => {
      console.error("文件解析worker错误:", err);
      this.fileParserWorker = null;
    });

    return this.fileParserWorker;
  }

  /**
   * 使用Worker解析文件
   */
  private parseFileWithWorker(
    type: string,
    data: any,
    maxRows: number = 20,
    missingValueTypes: string[] = []
  ): Promise<any> {
    const task = this.parserQueue.then(
      () => this.runParseFileWithWorker(type, data, maxRows, missingValueTypes),
      () => this.runParseFileWithWorker(type, data, maxRows, missingValueTypes)
    );
    this.parserQueue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  private runParseFileWithWorker(
    type: string,
    data: any,
    maxRows: number = 20,
    missingValueTypes: string[] = []
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const worker = this.createFileParserWorker();

      // 处理worker返回的消息
      const messageHandler = (result: any) => {
        worker.removeListener("message", messageHandler);
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.error));
        }
      };

      worker.on("message", messageHandler);
      // 发送数据到worker
      worker.postMessage({ type, data, maxRows, missingValueTypes });
    });
  }

  private getMissingTypesKey(missingValueTypes: string[] = []): string {
    return [...missingValueTypes].map(value => String(value)).sort().join("\u001f");
  }

  private getCsvCacheKey(filePath: string, stat: { size: number; mtimeMs: number }, missingValueTypes: string[]): string {
    return [filePath, stat.size, stat.mtimeMs, this.getMissingTypesKey(missingValueTypes)].join("\u001e");
  }

  private trimParsedCsvCache() {
    if (this.parsedCsvCache.size <= this.maxParsedCsvCacheEntries) return;

    const entries = [...this.parsedCsvCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const deleteCount = this.parsedCsvCache.size - this.maxParsedCsvCacheEntries;
    for (let i = 0; i < deleteCount; i++) {
      this.parsedCsvCache.delete(entries[i][0]);
    }
  }

  private async getParsedCsvData(filePath: string, missingValueTypes: string[]): Promise<any> {
    const fs = require("fs");
    const stat = fs.statSync(filePath);
    const cacheKey = this.getCsvCacheKey(filePath, stat, missingValueTypes);
    const cached = this.parsedCsvCache.get(cacheKey);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.data;
    }

    const inFlight = this.parsedCsvInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const parsePromise = (async () => {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const parsed = await this.parseFileWithWorker("csv", fileContent, -1, missingValueTypes);
      this.parsedCsvCache.set(cacheKey, {
        data: parsed,
        lastUsed: Date.now(),
      });
      this.trimParsedCsvCache();
      return parsed;
    })();

    this.parsedCsvInFlight.set(cacheKey, parsePromise);
    try {
      return await parsePromise;
    } finally {
      this.parsedCsvInFlight.delete(cacheKey);
    }
  }

  /**
   * 解析文件预览（预览模式）
   */
  async parseFilePreview(
    args: {
      fileType: string;
      fileContent: string | ArrayBuffer;
      maxRows?: number;
      missingValueTypes?: string[];
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      return await this.parseFileWithWorker(
        args.fileType,
        args.fileContent,
        args.maxRows || 20,
        args.missingValueTypes || []
      );
    });
  }

  /**
   * 解析完整文件（用于导入时的数据质量分析）
   */
  async parseFullFile(
    args: {
      fileType: string;
      fileContent: string | ArrayBuffer;
      missingValueTypes: string[];
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      // maxRows = -1 表示解析全部数据
      return await this.parseFileWithWorker(args.fileType, args.fileContent, -1, args.missingValueTypes);
    });
  }

  /**
   * 根据文件路径读取CSV数据（用于数据可视化）
   */
  async readCsvData(
    args: {
      filePath: string;
      columnName?: string; // 可选：只读取特定列
      missingValueTypes?: string[]; // 可选：缺失值类型
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      const fs = require("fs");
      const path = require("path");

      // 检查文件是否存在
      if (!fs.existsSync(args.filePath)) {
        throw new Error(`文件不存在: ${args.filePath}`);
      }

      // 检查文件扩展名
      const fileExtension = path.extname(args.filePath).toLowerCase();
      if (fileExtension !== ".csv") {
        throw new Error("只支持CSV文件格式");
      }

      const missingValueTypes = args.missingValueTypes || [];

      // 使用文件级缓存解析 CSV。相同文件、相同缺失标记只解析一次。
      const result = await this.getParsedCsvData(args.filePath, missingValueTypes);

      // 获取时区设置
      const timezoneResult = this.settingsRepository.getTimezone();
      const timezone = timezoneResult.success ? timezoneResult.data! : 'UTC+8';

      // 辅助函数：判断是否为缺失值
      const isMissingValue = (value: any, missingTypes: string[]): boolean => {
        if (!missingTypes || missingTypes.length === 0) return false;
        
        if (value === null || value === undefined) {
          return missingTypes.includes("null") || missingTypes.includes("");
        }
        
        const stringValue = String(value).trim();
        return missingTypes.some(type => {
          if (type === "") return stringValue === "";
          return stringValue.toLowerCase() === type.toLowerCase();
        });
      };

      // 如果指定了列名，只返回该列的数据和统计信息
      if (args.columnName && result.tableData) {
        const columnName = args.columnName;
        const missingTypes = missingValueTypes;

        // 识别时间列
        const timestampKey = this.findTimestampKey(result.tableData);

        // 过滤出包含指定列的数据，并标准化时间戳
        const columnData = result.tableData
          .map((row: any) => {
            const rawTimestamp = timestampKey ? row[timestampKey] : null;
            const epochMs = rawTimestamp ? normalizeTimestamp(rawTimestamp, timezone) : null;
            
            let value = row[columnName];
            // 标准化缺失值为 null
            if (isMissingValue(value, missingTypes)) {
              value = null;
            }

            return {
              [columnName]: value,
              TIMESTAMP: rawTimestamp,
              _epochMs: epochMs,
              _formattedTime: epochMs ? formatTimestamp(epochMs, timezone) : null,
            };
          });

        // 按时间排序（如果有有效的时间戳）
        columnData.sort((a: any, b: any) => {
          if (a._epochMs === null && b._epochMs === null) return 0;
          if (a._epochMs === null) return 1;
          if (b._epochMs === null) return -1;
          return a._epochMs - b._epochMs;
        });

        // 计算统计信息
        const columnStatistics = this.calculateColumnStatistics(result.tableData, columnName, timezone);

        return {
          tableData: columnData,
          targetColumn: args.columnName,
          statistics: columnStatistics,
          timezone: timezone,
        };
      }

      return result;
    });
  }

  /**
   * 识别时间列的键名
   */
  private findTimestampKey(tableData: any[]): string | null {
    if (!tableData || tableData.length === 0) {
      return null;
    }

    const firstRow = tableData[0];
    const keys = Object.keys(firstRow);

    // 1. 优先匹配常见的时间列名
    const priorityKeys = [
      'TIMESTAMP', 'timestamp', 'Timestamp',
      'Date', 'date', 'DATE',
      'Time', 'time', 'TIME',
      'record_time', 'Record_Time', 'RECORD_TIME',
      'datetime', 'DateTime', 'DATETIME',
      'time_stamp', 'Time_Stamp', 'TIME_STAMP'
    ];

    for (const key of priorityKeys) {
      if (keys.includes(key)) {
        return key;
      }
    }

    // 2. 如果没找到，尝试智能识别内容
    for (const key of keys) {
      const value = firstRow[key];
      if (typeof value === 'string') {
        // 简单的日期格式检查：包含 - / : 且能被 Date 解析
        if ((value.includes('-') || value.includes('/') || value.includes(':')) && !isNaN(Date.parse(value))) {
          return key;
        }
      }
    }

    return null;
  }

  /**
   * 计算列的统计信息
   */
  private calculateColumnStatistics(
    data: any[],
    columnName: string,
    timezone: string = 'UTC+8'
  ): {
    mean: number;
    std: number;
    min: number;
    max: number;
    count: number;
    validCount: number;
    minTimestamp?: string;
    maxTimestamp?: string;
  } {
    // 识别时间列
    const timestampKey = this.findTimestampKey(data);

    // 提取列数据，保留时间戳信息
    const validDataWithTimestamp = data
      .map(row => {
        const rawTimestamp = timestampKey ? row[timestampKey] : null;
        const epochMs = rawTimestamp ? normalizeTimestamp(rawTimestamp, timezone) : null;
        return {
          value: row[columnName],
          timestamp: rawTimestamp,
          epochMs: epochMs,
          formattedTime: epochMs ? formatTimestamp(epochMs, timezone) : null
        };
      })
      .filter(item => 
        item.value !== null && 
        item.value !== undefined && 
        !isNaN(parseFloat(item.value)) && 
        isFinite(parseFloat(item.value))
      )
      .map(item => ({
        value: parseFloat(item.value),
        timestamp: item.timestamp
      }));

    const validCount = validDataWithTimestamp.length;
    const totalCount = data.length;

    if (validCount === 0) {
      return {
        mean: 0,
        std: 0,
        min: 0,
        max: 0,
        count: totalCount,
        validCount: 0,
      };
    }

    const values = validDataWithTimestamp.map(item => item.value);

    // 计算均值
    const mean = values.reduce((sum, value) => sum + value, 0) / validCount;

    // 找到最小值和最大值及其对应的时间戳
    let minValue = values[0];
    let maxValue = values[0];
    let minTimestamp = validDataWithTimestamp[0].timestamp;
    let maxTimestamp = validDataWithTimestamp[0].timestamp;

    validDataWithTimestamp.forEach(item => {
      if (item.value < minValue) {
        minValue = item.value;
        minTimestamp = item.timestamp;
      }
      if (item.value > maxValue) {
        maxValue = item.value;
        maxTimestamp = item.timestamp;
      }
    });

    // 计算标准差
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / validCount;
    const std = Math.sqrt(variance);

    return {
      mean: Number(mean.toFixed(6)),
      std: Number(std.toFixed(6)),
      min: Number(minValue.toFixed(6)),
      max: Number(maxValue.toFixed(6)),
      count: totalCount,
      validCount: validCount,
      minTimestamp: minTimestamp ? String(minTimestamp) : undefined,
      maxTimestamp: maxTimestamp ? String(maxTimestamp) : undefined,
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.parsedCsvCache.clear();
    this.parsedCsvInFlight.clear();
    if (this.fileParserWorker) {
      this.fileParserWorker.terminate();
      this.fileParserWorker = null;
    }
  }
}
