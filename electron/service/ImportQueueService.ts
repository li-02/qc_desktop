import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as readline from "readline";
import { BrowserWindow } from "electron";
import { DatasetService } from "./DatasetService";
import { BatchImportRequest, ImportTaskProgress } from "@shared/types/projectInterface";

const IMPORT_PROGRESS_CHANNEL = "datasets/import-progress";

export class ImportQueueService {
  private datasetService: DatasetService;
  private activeBatches: Set<string> = new Set();

  constructor(datasetService: DatasetService) {
    this.datasetService = datasetService;
  }

  /**
   * 启动批量导入，立即返回 batchId，后台顺序处理每个文件。
   * 进度通过 IPC 事件推送到渲染进程。
   */
  async startBatchImport(request: BatchImportRequest, mainWindow: BrowserWindow | null): Promise<{ batchId: string }> {
    const batchId = uuidv4();
    const total = request.files.length;

    if (total === 0) {
      return { batchId };
    }

    this.activeBatches.add(batchId);

    setImmediate(async () => {
      for (let i = 0; i < request.files.length; i++) {
        if (!this.activeBatches.has(batchId)) {
          break;
        }

        const fileItem = request.files[i];

        const processingProgress: ImportTaskProgress = {
          batchId,
          taskIndex: i,
          total,
          datasetName: fileItem.datasetName,
          status: "processing",
        };
        mainWindow?.webContents.send(IMPORT_PROGRESS_CHANNEL, processingProgress);

        try {
          const columns = await this.readCsvHeader(fileItem.file.path);

          const importResult = await this.datasetService.importDataset({
            categoryId: request.categoryId,
            datasetName: fileItem.datasetName,
            type: request.dataType,
            file: fileItem.file,
            missingValueTypes: request.missingValueTypes,
            rows: 0,
            columns,
            sourceTimezone: request.sourceTimezone || "auto",
          });

          const resultProgress: ImportTaskProgress = {
            batchId,
            taskIndex: i,
            total,
            datasetName: fileItem.datasetName,
            status: importResult.success ? "completed" : "failed",
            error: importResult.success ? undefined : (importResult.error ?? undefined),
          };
          mainWindow?.webContents.send(IMPORT_PROGRESS_CHANNEL, resultProgress);
        } catch (error: any) {
          const errorProgress: ImportTaskProgress = {
            batchId,
            taskIndex: i,
            total,
            datasetName: fileItem.datasetName,
            status: "failed",
            error: error.message,
          };
          mainWindow?.webContents.send(IMPORT_PROGRESS_CHANNEL, errorProgress);
        }
      }

      this.activeBatches.delete(batchId);
    });

    return { batchId };
  }

  /**
   * 取消指定批次（中断后续任务）
   */
  cancelBatch(batchId: string): void {
    this.activeBatches.delete(batchId);
  }

  /**
   * 读取 CSV 文件第一行，返回列名数组
   */
  private readCsvHeader(filePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return resolve([]);
      }

      const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });

      let resolved = false;

      rl.on("line", (line: string) => {
        if (!resolved) {
          resolved = true;
          rl.close();
          const headers = line
            .split(",")
            .map(h => h.trim().replace(/^["']|["']$/g, ""))
            .filter(h => h.length > 0);
          resolve(headers);
        }
      });

      rl.on("error", (err: Error) => reject(err));

      rl.on("close", () => {
        if (!resolved) resolve([]);
      });
    });
  }
}
