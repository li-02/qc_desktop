import { BaseController } from "./BaseController";
import { IpcMainInvokeEvent } from "electron";
import { Worker } from "worker_threads";
import * as path from "path";
import { normalizeTimestamp, formatTimestamp } from "../utils/timeUtils";
import { SettingsRepository } from "../repository/SettingsRepository";

export class FileController extends BaseController {
  private fileParserWorker: Worker | null = null;
  private settingsRepository: SettingsRepository;

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

      // 读取文件内容
      const fileContent = fs.readFileSync(args.filePath, "utf-8");

      // 使用worker解析文件，读取全部数据
      const result = await this.parseFileWithWorker("csv", fileContent, -1, []);

      // 获取时区设置
      const timezoneResult = this.settingsRepository.getTimezone();
      const timezone = timezoneResult.success ? timezoneResult.data! : 'UTC+8';

      // 如果指定了列名，只返回该列的数据和统计信息
      if (args.columnName && result.tableData) {
        const columnName = args.columnName;

        // 识别时间列
        const timestampKey = this.findTimestampKey(result.tableData);

        // 过滤出包含指定列的数据，并标准化时间戳
        const columnData = result.tableData
          .map((row: any) => {
            const rawTimestamp = timestampKey ? row[timestampKey] : null;
            const epochMs = rawTimestamp ? normalizeTimestamp(rawTimestamp, timezone) : null;
            
            return {
              [columnName]: row[columnName],
              TIMESTAMP: rawTimestamp,
              _epochMs: epochMs,
              _formattedTime: epochMs ? formatTimestamp(epochMs, timezone) : null,
            };
          })
          .filter((row: any) => row[columnName] !== undefined && row[columnName] !== null);

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
    if (this.fileParserWorker) {
      this.fileParserWorker.terminate();
      this.fileParserWorker = null;
    }
  }
}
