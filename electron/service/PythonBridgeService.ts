import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";

export interface PythonTaskResult {
  success: boolean;
  data?: any;
  error?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface PythonTaskProgress {
  stage: string;
  progress: number;
  message: string;
}

type ProgressCallback = (progress: PythonTaskProgress) => void;

/**
 * Python 桥接服务
 * 负责调用 Python 脚本执行深度学习模型推理等任务
 */
export class PythonBridgeService {
  private static instance: PythonBridgeService;
  private pythonPath: string | null = null;
  private pythonDir: string;
  private runningProcesses: Map<string, ChildProcess> = new Map();

  private constructor() {
    // 开发环境使用项目根目录下的 python 文件夹
    // 生产环境使用 resources/python（通过 electron-builder extraResources 打包）
    this.pythonDir = app.isPackaged
      ? path.join(process.resourcesPath, "python")
      : path.join(__dirname, "..", "..", "..", "python");
  }

  public static getInstance(): PythonBridgeService {
    if (!PythonBridgeService.instance) {
      PythonBridgeService.instance = new PythonBridgeService();
    }
    return PythonBridgeService.instance;
  }

  /**
   * 检测 Python 环境
   */
  async detectPython(): Promise<{ available: boolean; version?: string; path?: string }> {
    // 优先检测项目虚拟环境
    const venvPaths = [
      path.join(this.pythonDir, ".venv", "Scripts", "python.exe"), // Windows
      path.join(this.pythonDir, ".venv", "bin", "python"), // Linux/Mac
    ];

    for (const venvPath of venvPaths) {
      if (fs.existsSync(venvPath)) {
        const version = await this.getPythonVersion(venvPath);
        if (version) {
          this.pythonPath = venvPath;
          return { available: true, version, path: venvPath };
        }
      }
    }

    // 回退到系统 Python
    const systemPythons = ["python3", "python"];
    for (const py of systemPythons) {
      const version = await this.getPythonVersion(py);
      if (version) {
        this.pythonPath = py;
        return { available: true, version, path: py };
      }
    }

    return { available: false };
  }

  private async getPythonVersion(pythonPath: string): Promise<string | null> {
    return new Promise(resolve => {
      const proc = spawn(pythonPath, ["--version"]);
      let output = "";

      proc.stdout.on("data", data => {
        output += data.toString();
      });
      proc.stderr.on("data", data => {
        output += data.toString();
      });

      proc.on("close", code => {
        if (code === 0 && output) {
          const match = output.match(/Python (\d+\.\d+\.\d+)/);
          resolve(match ? match[1] : null);
        } else {
          resolve(null);
        }
      });

      proc.on("error", () => resolve(null));
    });
  }

  /**
   * 检查必需的 Python 包是否安装
   */
  async checkDependencies(packages: string[]): Promise<{ installed: boolean; missing: string[] }> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { installed: false, missing: packages };
    }

    const missing: string[] = [];

    for (const pkg of packages) {
      const result = await this.runPythonCode(`import ${pkg}; print('ok')`);
      if (!result.success || !result.stdout?.includes("ok")) {
        missing.push(pkg);
      }
    }

    return { installed: missing.length === 0, missing };
  }

  /**
   * 执行 Python 代码片段
   */
  async runPythonCode(code: string): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    return new Promise(resolve => {
      const proc = spawn(this.pythonPath!, ["-c", code]);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        stdout += data.toString();
      });
      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        resolve({
          success: code === 0,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? stderr : undefined,
        });
      });

      proc.on("error", err => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 执行 TimeMixer++ 插补任务
   */
  async runTimeMixerPPImputation(
    params: {
      modelPath: string;
      inputFile: string;
      outputFile: string;
      targetColumn: string;
      timeColumn?: string;
      seqLen?: number;
      nLayers?: number;
      dModel?: number;
      dFfn?: number;
      topK?: number;
      nHeads?: number;
      nKernels?: number;
      dropout?: number;
      downLayers?: number;
      downWindow?: number;
      useGpu?: boolean;
      trainFile?: string;
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    // 构建脚本路径
    const scriptPath = path.join(this.pythonDir, "timemixerpp.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    // 检查模型文件
    if (!fs.existsSync(params.modelPath)) {
      return { success: false, error: `模型文件不存在: ${params.modelPath}` };
    }

    // 构建命令行参数
    const args: string[] = [
      scriptPath,
      "--model",
      params.modelPath,
      "--file",
      params.inputFile,
      "--target",
      params.targetColumn,
      "--output",
      params.outputFile,
    ];

    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.seqLen) args.push("--seq-len", params.seqLen.toString());
    if (params.nLayers) args.push("--n-layers", params.nLayers.toString());
    if (params.dModel) args.push("--d-model", params.dModel.toString());
    if (params.dFfn) args.push("--d-ffn", params.dFfn.toString());
    if (params.topK) args.push("--top-k", params.topK.toString());
    if (params.nHeads) args.push("--n-heads", params.nHeads.toString());
    if (params.nKernels) args.push("--n-kernels", params.nKernels.toString());
    if (params.dropout !== undefined) args.push("--dropout", params.dropout.toString());
    if (params.downLayers) args.push("--down-layers", params.downLayers.toString());
    if (params.downWindow) args.push("--down-window", params.downWindow.toString());
    if (params.useGpu === false) args.push("--device", "cpu");
    if (params.trainFile) args.push("--train-file", params.trainFile);

    const taskId = `timemixer_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 Python 进程..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        // 解析进度信息
        if (text.includes("[1/4]")) {
          progressCallback?.({ stage: "loading", progress: 10, message: "正在加载数据..." });
        } else if (text.includes("[2/4]")) {
          progressCallback?.({ stage: "loading_model", progress: 30, message: "正在加载模型..." });
        } else if (text.includes("[3/4]")) {
          progressCallback?.({ stage: "imputing", progress: 50, message: "正在执行插补..." });
        } else if (text.includes("[4/4]")) {
          progressCallback?.({ stage: "saving", progress: 80, message: "正在保存结果..." });
        } else if (text.includes("插补完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "插补完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        resolve({
          success: code === 0,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? stderr || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 取消正在运行的任务
   */
  cancelTask(taskId: string): boolean {
    const proc = this.runningProcesses.get(taskId);
    if (proc) {
      proc.kill("SIGTERM");
      this.runningProcesses.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * 执行 REddyProc MDS 插补任务
   */
  async runREddyProcImputation(
    params: {
      inputFile: string;
      outputFile: string;
      targetColumn: string;
      timeColumn?: string;
      // 位置信息
      latDeg: number;
      longDeg: number;
      timezoneHour: number;
      // 气象变量列映射
      rgCol: string;
      tairCol: string;
      vpdCol?: string;
      rhCol?: string;
      // 高级选项
      ustarCol?: string;
      fillAll?: boolean;
      ustarFiltering?: boolean;
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    // 构建脚本路径 (使用rpy2调用R的REddyProc包)
    const scriptPath = path.join(this.pythonDir, "reddyproc_r_bridge.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    // 构建命令行参数
    const args: string[] = [
      scriptPath,
      "--file",
      params.inputFile,
      "--target",
      params.targetColumn,
      "--output",
      params.outputFile,
      "--lat",
      params.latDeg.toString(),
      "--long",
      params.longDeg.toString(),
      "--tz",
      params.timezoneHour.toString(),
      "--rg-col",
      params.rgCol,
      "--tair-col",
      params.tairCol,
    ];

    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.vpdCol) args.push("--vpd-col", params.vpdCol);
    if (params.rhCol) args.push("--rh-col", params.rhCol);
    if (params.ustarCol) args.push("--ustar-col", params.ustarCol);
    if (params.fillAll) args.push("--fill-all", "true");
    if (params.ustarFiltering) args.push("--ustar-filtering", "true");

    const taskId = `reddyproc_mds_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 REddyProc (R) 插补..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        // 解析进度信息 (rpy2 R桥接脚本)
        if (text.includes("[1/5]")) {
          progressCallback?.({ stage: "checking", progress: 5, message: "正在检查R环境..." });
        } else if (text.includes("[2/5]")) {
          progressCallback?.({ stage: "loading", progress: 15, message: "正在加载数据..." });
        } else if (text.includes("[3/5]")) {
          progressCallback?.({ stage: "preparing", progress: 25, message: "正在准备数据格式..." });
        } else if (text.includes("[4/5]")) {
          progressCallback?.({ stage: "imputing", progress: 40, message: "正在执行REddyProc MDS插补..." });
        } else if (text.includes("[5/5]")) {
          progressCallback?.({ stage: "saving", progress: 85, message: "正在保存结果..." });
        } else if (text.includes("插补完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "REddyProc MDS插补完成" });
        } else if (text.includes("执行MDS插补")) {
          progressCallback?.({ stage: "imputing", progress: 50, message: "正在执行REddyProc sMDSGapFill..." });
        } else if (text.includes("导出结果")) {
          progressCallback?.({ stage: "exporting", progress: 75, message: "正在导出REddyProc结果..." });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        resolve({
          success: code === 0,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? stderr || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 执行 REddyProc 通量分割任务
   */
  async runREddyProcPartitioning(
    params: {
      inputFile: string;
      outputFile: string;
      method: "nighttime" | "daytime";
      timeColumn?: string;
      // 位置信息
      latDeg: number;
      longDeg: number;
      timezoneHour: number;
      // 变量列映射
      neeCol: string;
      rgCol: string;
      tairCol: string;
      vpdCol: string;
      rhCol?: string;
      // 高级选项
      ustarCol?: string;
      ustarFiltering?: boolean;
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    const scriptPath = path.join(this.pythonDir, "reddyproc_partitioning.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    const args: string[] = [
      scriptPath,
      "--file",
      params.inputFile,
      "--output",
      params.outputFile,
      "--method",
      params.method,
      "--lat",
      params.latDeg.toString(),
      "--long",
      params.longDeg.toString(),
      "--tz",
      params.timezoneHour.toString(),
      "--nee-col",
      params.neeCol,
      "--rg-col",
      params.rgCol,
      "--tair-col",
      params.tairCol,
      "--vpd-col",
      params.vpdCol,
    ];

    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.rhCol) args.push("--rh-col", params.rhCol);
    if (params.ustarCol) args.push("--ustar-col", params.ustarCol);
    if (params.ustarFiltering) args.push("--ustar-filtering", "true");

    const taskId = `reddyproc_partition_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 REddyProc 通量分割..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/5]")) {
          progressCallback?.({ stage: "checking", progress: 5, message: "正在检查R环境..." });
        } else if (text.includes("[2/5]")) {
          progressCallback?.({ stage: "loading", progress: 15, message: "正在加载数据..." });
        } else if (text.includes("[3/5]")) {
          progressCallback?.({ stage: "preparing", progress: 25, message: "正在准备数据格式..." });
        } else if (text.includes("[4/5]")) {
          progressCallback?.({ stage: "partitioning", progress: 35, message: "正在执行通量分割..." });
        } else if (text.includes("Gap-filling")) {
          progressCallback?.({ stage: "gapfilling", progress: 45, message: "正在Gap-fill变量..." });
        } else if (text.includes("执行夜间法分割") || text.includes("执行白天法分割")) {
          progressCallback?.({ stage: "partitioning", progress: 65, message: "正在执行通量分割算法..." });
        } else if (text.includes("导出结果")) {
          progressCallback?.({ stage: "saving", progress: 80, message: "正在导出分割结果..." });
        } else if (text.includes("[5/5]")) {
          progressCallback?.({ stage: "saving", progress: 85, message: "正在保存结果..." });
        } else if (text.includes("通量分割完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "通量分割完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        resolve({
          success: code === 0,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? stderr || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 获取 Python 脚本目录
   */
  getPythonDir(): string {
    return this.pythonDir;
  }

  /**
   * 获取 Python 路径
   */
  getPythonPath(): string | null {
    return this.pythonPath;
  }
}
