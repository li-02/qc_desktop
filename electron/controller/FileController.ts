import { BaseController } from "./BaseController";
import { IpcMainInvokeEvent } from "electron";
import { Worker } from "worker_threads";
import * as path from "path";

export class FileController extends BaseController {
  private fileParserWorker: Worker | null = null;

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
  private parseFileWithWorker(type: string, data: any, maxRows: number = 20): Promise<any> {
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
      worker.postMessage({ type, data, maxRows });
    });
  }

  /**
   * 解析文件预览
   */
  async parseFilePreview(
    args: {
      fileType: string;
      fileContent: string | ArrayBuffer;
      maxRows?: number;
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      const result = await this.parseFileWithWorker(args.fileType, args.fileContent, args.maxRows || 20);
      return result;
    });
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
