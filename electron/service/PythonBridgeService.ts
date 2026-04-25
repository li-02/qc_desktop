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
   * Strip R[write to console] noise (progress dots, blank lines) from stderr.
   * Keeps meaningful R messages like warnings/errors.
   */
  private static cleanRStderr(raw: string): string {
    return raw
      .split(/\r?\n/)
      .filter(line => {
        // Drop lines that are only R console dot-progress: "R[write to console]: . "
        if (/^R\[write to console\]:\s*[.\s]*$/.test(line)) return false;
        return true;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
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
      const proc = spawn(this.pythonPath!, ["-c", code], {
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
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
          error: code !== 0 ? PythonBridgeService.cleanRStderr(stderr) || stderr : undefined,
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
    const scriptPath = path.join(this.pythonDir, "methods", "timemixerpp.py");
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
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
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
          error: code !== 0 ? PythonBridgeService.cleanRStderr(stderr) || "执行失败" : undefined,
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
      timeColumn?: string;
      // 位置信息
      latDeg: number;
      longDeg: number;
      timezoneHour: number;
      // 气象变量列映射
      neeCol: string;
      parCol: string;
      rgCol: string;
      tairCol: string;
      rhCol: string;
      ustarCol: string;
      vpdCol?: string;
      h2oCol?: string;
      leCol?: string;
      hCol?: string;
      despikingZ?: number;
      fillAll?: boolean;
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
    const scriptPath = path.join(this.pythonDir, "methods", "reddyproc_flux_pipeline.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    // 构建命令行参数
    const args: string[] = [
      scriptPath,
      "--file",
      params.inputFile,
      "--output",
      params.outputFile,
      "--lat",
      params.latDeg.toString(),
      "--long",
      params.longDeg.toString(),
      "--tz",
      params.timezoneHour.toString(),
      "--nee-col",
      params.neeCol,
      "--par-col",
      params.parCol,
      "--rg-col",
      params.rgCol,
      "--tair-col",
      params.tairCol,
      "--rh-col",
      params.rhCol,
      "--ustar-col",
      params.ustarCol,
    ];

    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.vpdCol) args.push("--vpd-col", params.vpdCol);
    if (params.h2oCol) args.push("--h2o-col", params.h2oCol);
    if (params.leCol) args.push("--le-col", params.leCol);
    if (params.hCol) args.push("--h-col", params.hCol);
    if (params.despikingZ !== undefined) args.push("--despiking-z", params.despikingZ.toString());
    args.push("--fill-all", params.fillAll === false ? "false" : "true");

    const taskId = `reddyproc_mds_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 REddyProc 通量流程..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/6]")) {
          progressCallback?.({ stage: "checking", progress: 5, message: "正在检查R环境..." });
        } else if (text.includes("[2/6]")) {
          progressCallback?.({ stage: "loading", progress: 15, message: "正在加载数据..." });
        } else if (text.includes("[3/6]")) {
          progressCallback?.({ stage: "preparing", progress: 25, message: "正在准备通量输入..." });
        } else if (text.includes("[4/6]")) {
          progressCallback?.({ stage: "imputing", progress: 45, message: "正在执行 PAR 预插补与 despiking..." });
        } else if (text.includes("[5/6]")) {
          progressCallback?.({ stage: "imputing", progress: 70, message: "正在执行 u*、gap filling 与分割..." });
        } else if (text.includes("[6/6]")) {
          progressCallback?.({ stage: "saving", progress: 85, message: "正在保存结果..." });
        } else if (text.includes("插补完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "REddyProc 通量流程完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        let data: any;
        const marker = "__RESULT_JSON__:";
        const markerIndex = stdout.lastIndexOf(marker);
        if (markerIndex >= 0) {
          const jsonLine = stdout
            .slice(markerIndex + marker.length)
            .split(/\r?\n/, 1)[0]
            .trim();
          if (jsonLine) {
            try {
              data = JSON.parse(jsonLine);
            } catch {
              data = undefined;
            }
          }
        }
        const parsedError = data && typeof data === "object" && data.error ? String(data.error) : undefined;
        resolve({
          success: code === 0,
          data,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? (parsedError ?? PythonBridgeService.cleanRStderr(stderr)) || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 执行 BEON 原项目风格 REddyProc 任务
   */
  async runBEONREddyProcImputation(
    params: {
      inputFile: string;
      outputFile: string;
      timeColumn?: string;
      latDeg: number;
      longDeg: number;
      timezoneHour: number;
      siteCode?: string;
      allowedQcFlags: string;
      useStrg?: boolean;
      co2FluxCol: string;
      h2oFluxCol?: string;
      leCol?: string;
      hCol?: string;
      qcCo2FluxCol?: string;
      qcH2oFluxCol?: string;
      qcLeCol?: string;
      qcHCol?: string;
      ppfdCol: string;
      rgRawCol: string;
      tairRawCol: string;
      rhRawCol: string;
      vpdRawCol?: string;
      ustarRawCol: string;
      co2StrgCol?: string;
      h2oStrgCol?: string;
      leStrgCol?: string;
      hStrgCol?: string;
      shortUpCol?: string;
      rh12mCol?: string;
      rh10mCol?: string;
      ta12mCol?: string;
      despikingZ?: number;
      fillAll?: boolean;
      thresholdsJson?: string;
      localRulesJson?: string;
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    const scriptPath = path.join(this.pythonDir, "methods", "beon_reddyproc_pipeline.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    const args: string[] = [
      scriptPath,
      "--file",
      params.inputFile,
      "--output",
      params.outputFile,
      "--lat",
      params.latDeg.toString(),
      "--long",
      params.longDeg.toString(),
      "--tz",
      params.timezoneHour.toString(),
      "--allowed-qc-flags",
      params.allowedQcFlags,
      "--co2-flux-col",
      params.co2FluxCol,
      "--ppfd-col",
      params.ppfdCol,
      "--rg-raw-col",
      params.rgRawCol,
      "--tair-raw-col",
      params.tairRawCol,
      "--rh-raw-col",
      params.rhRawCol,
      "--ustar-raw-col",
      params.ustarRawCol,
    ];

    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.siteCode) args.push("--site-code", params.siteCode);
    args.push("--use-strg", params.useStrg ? "true" : "false");
    if (params.h2oFluxCol) args.push("--h2o-flux-col", params.h2oFluxCol);
    if (params.leCol) args.push("--le-col", params.leCol);
    if (params.hCol) args.push("--h-col", params.hCol);
    if (params.qcCo2FluxCol) args.push("--qc-co2-flux-col", params.qcCo2FluxCol);
    if (params.qcH2oFluxCol) args.push("--qc-h2o-flux-col", params.qcH2oFluxCol);
    if (params.qcLeCol) args.push("--qc-le-col", params.qcLeCol);
    if (params.qcHCol) args.push("--qc-h-col", params.qcHCol);
    if (params.vpdRawCol) args.push("--vpd-raw-col", params.vpdRawCol);
    if (params.co2StrgCol) args.push("--co2-strg-col", params.co2StrgCol);
    if (params.h2oStrgCol) args.push("--h2o-strg-col", params.h2oStrgCol);
    if (params.leStrgCol) args.push("--le-strg-col", params.leStrgCol);
    if (params.hStrgCol) args.push("--h-strg-col", params.hStrgCol);
    if (params.shortUpCol) args.push("--short-up-col", params.shortUpCol);
    if (params.rh12mCol) args.push("--rh-12m-col", params.rh12mCol);
    if (params.rh10mCol) args.push("--rh-10m-col", params.rh10mCol);
    if (params.ta12mCol) args.push("--ta-12m-col", params.ta12mCol);
    if (params.despikingZ !== undefined) args.push("--despiking-z", params.despikingZ.toString());
    args.push("--fill-all", params.fillAll === false ? "false" : "true");
    if (params.thresholdsJson) args.push("--thresholds-json", params.thresholdsJson);
    if (params.localRulesJson) args.push("--local-rules-json", params.localRulesJson);

    const taskId = `beon_reddyproc_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 BEON-REddyProc 流程..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/7]")) {
          progressCallback?.({ stage: "checking", progress: 5, message: "正在检查R环境..." });
        } else if (text.includes("[2/7]")) {
          progressCallback?.({ stage: "loading", progress: 12, message: "正在加载原始数据..." });
        } else if (text.includes("[3/7]")) {
          progressCallback?.({ stage: "preparing", progress: 28, message: "正在执行 QC/strg/threshold 预处理..." });
        } else if (text.includes("[4/7]")) {
          progressCallback?.({ stage: "preparing", progress: 42, message: "正在执行 PAR 预插补..." });
        } else if (text.includes("[5/7]")) {
          progressCallback?.({ stage: "imputing", progress: 56, message: "正在执行 despiking..." });
        } else if (text.includes("[6/7]")) {
          progressCallback?.({ stage: "imputing", progress: 74, message: "正在执行 u*、gap filling 与分割..." });
        } else if (text.includes("[7/7]")) {
          progressCallback?.({ stage: "saving", progress: 88, message: "正在保存结果..." });
        } else if (text.includes("流程完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "BEON-REddyProc 流程完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        let data: any;
        const marker = "__RESULT_JSON__:";
        const markerIndex = stdout.lastIndexOf(marker);
        if (markerIndex >= 0) {
          const jsonLine = stdout
            .slice(markerIndex + marker.length)
            .split(/\r?\n/, 1)[0]
            .trim();
          if (jsonLine) {
            try {
              data = JSON.parse(jsonLine);
            } catch {
              data = undefined;
            }
          }
        }
        const parsedError = data && typeof data === "object" && data.error ? String(data.error) : undefined;
        resolve({
          success: code === 0,
          data,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? (parsedError ?? PythonBridgeService.cleanRStderr(stderr)) || "执行失败" : undefined,
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

    const scriptPath = path.join(this.pythonDir, "methods", "reddyproc_partitioning.py");
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
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
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
          error: code !== 0 ? PythonBridgeService.cleanRStderr(stderr) || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 执行模型推理插补任务
   */
  async runRandomForestImputation(
    params: {
      modelPath: string;
      inputFile: string;
      outputFile: string;
      targetColumn: string;
      featureColumns?: string;
      timeColumn?: string;
      addTimeFeatures?: boolean;
      columnMapping?: string; // JSON string: {用户列名: 模型期望列名}
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    const scriptPath = path.join(this.pythonDir, "methods", "rf_impute.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    if (!fs.existsSync(params.modelPath)) {
      return { success: false, error: `模型文件不存在: ${params.modelPath}` };
    }

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

    if (params.featureColumns) args.push("--feature-columns", params.featureColumns);
    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.addTimeFeatures === false) args.push("--add-time-features", "false");
    if (params.columnMapping) args.push("--column-mapping", params.columnMapping);

    const taskId = `model_impute_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动模型推理..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/5]")) {
          progressCallback?.({ stage: "loading", progress: 10, message: "正在加载数据..." });
        } else if (text.includes("[2/5]")) {
          progressCallback?.({ stage: "loading_model", progress: 25, message: "正在加载模型..." });
        } else if (text.includes("[3/5]")) {
          progressCallback?.({ stage: "preparing", progress: 45, message: "正在构建特征矩阵..." });
        } else if (text.includes("[4/5]")) {
          progressCallback?.({ stage: "imputing", progress: 65, message: "正在执行模型插补..." });
        } else if (text.includes("[5/5]")) {
          progressCallback?.({ stage: "saving", progress: 85, message: "正在保存结果..." });
        } else if (text.includes("插补完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "模型插补完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        let resultData: any;
        const marker = "__RESULT_JSON__:";
        const markerIndex = stdout.lastIndexOf(marker);
        if (markerIndex >= 0) {
          const jsonLine = stdout
            .slice(markerIndex + marker.length)
            .split(/\r?\n/, 1)[0]
            .trim();
          if (jsonLine) {
            try {
              resultData = JSON.parse(jsonLine);
            } catch {
              resultData = undefined;
            }
          }
        }
        const parsedError =
          resultData && typeof resultData === "object" && resultData.error ? String(resultData.error) : undefined;
        resolve({
          success: code === 0,
          data: resultData,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? (parsedError ?? PythonBridgeService.cleanRStderr(stderr)) || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 执行 XGBoost 模型推理插补任务
   */
  async runXGBoostImputation(
    params: {
      modelPath: string;
      inputFile: string;
      outputFile: string;
      targetColumn: string;
      featureColumns?: string;
      timeColumn?: string;
      addTimeFeatures?: boolean;
      columnMapping?: string; // JSON string: {用户列名: 模型期望列名}
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    const scriptPath = path.join(this.pythonDir, "methods", "xgb_impute.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    if (!fs.existsSync(params.modelPath)) {
      return { success: false, error: `模型文件不存在: ${params.modelPath}` };
    }

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

    if (params.featureColumns) args.push("--feature-columns", params.featureColumns);
    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.addTimeFeatures === false) args.push("--add-time-features", "false");
    if (params.columnMapping) args.push("--column-mapping", params.columnMapping);

    const taskId = `xgb_impute_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 XGBoost 模型推理..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/5]")) {
          progressCallback?.({ stage: "loading", progress: 10, message: "正在加载数据..." });
        } else if (text.includes("[2/5]")) {
          progressCallback?.({ stage: "loading_model", progress: 25, message: "正在加载 XGBoost 模型..." });
        } else if (text.includes("[3/5]")) {
          progressCallback?.({ stage: "preparing", progress: 45, message: "正在构建特征矩阵..." });
        } else if (text.includes("[4/5]")) {
          progressCallback?.({ stage: "imputing", progress: 65, message: "正在执行 XGBoost 插补..." });
        } else if (text.includes("[5/5]")) {
          progressCallback?.({ stage: "saving", progress: 85, message: "正在保存结果..." });
        } else if (text.includes("插补完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "XGBoost 插补完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        let resultData: any;
        const marker = "__RESULT_JSON__:";
        const markerIndex = stdout.lastIndexOf(marker);
        if (markerIndex >= 0) {
          const jsonLine = stdout
            .slice(markerIndex + marker.length)
            .split(/\r?\n/, 1)[0]
            .trim();
          if (jsonLine) {
            try {
              resultData = JSON.parse(jsonLine);
            } catch {
              resultData = undefined;
            }
          }
        }
        const parsedError =
          resultData && typeof resultData === "object" && resultData.error ? String(resultData.error) : undefined;
        resolve({
          success: code === 0,
          data: resultData,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? (parsedError ?? PythonBridgeService.cleanRStderr(stderr)) || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 执行 SAITS 模型推理插补任务
   */
  async runSAITSImputation(
    params: {
      modelPath: string;
      metadataPath?: string;
      inputFile: string;
      outputFile: string;
      targetColumn: string;
      timeColumn?: string;
      seqLen?: number;
      batchSize?: number;
      device?: string;
      nLayers?: number;
      dModel?: number;
      nHeads?: number;
      dK?: number;
      dV?: number;
      dFfn?: number;
      dropout?: number;
      attnDropout?: number;
      diagonalAttentionMask?: boolean;
      ortWeight?: number;
      mitWeight?: number;
      columnMapping?: string;
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    const scriptPath = path.join(this.pythonDir, "methods", "saits_impute.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    if (!fs.existsSync(params.modelPath)) {
      return { success: false, error: `模型文件不存在: ${params.modelPath}` };
    }

    if (params.metadataPath && !fs.existsSync(params.metadataPath)) {
      return { success: false, error: `模型 metadata 文件不存在: ${params.metadataPath}` };
    }

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

    if (params.metadataPath) args.push("--metadata", params.metadataPath);
    if (params.timeColumn) args.push("--time-col", params.timeColumn);
    if (params.seqLen) args.push("--seq-len", params.seqLen.toString());
    if (params.batchSize) args.push("--batch-size", params.batchSize.toString());
    if (params.device) args.push("--device", params.device);
    if (params.nLayers) args.push("--n-layers", params.nLayers.toString());
    if (params.dModel) args.push("--d-model", params.dModel.toString());
    if (params.nHeads) args.push("--n-heads", params.nHeads.toString());
    if (params.dK) args.push("--d-k", params.dK.toString());
    if (params.dV) args.push("--d-v", params.dV.toString());
    if (params.dFfn) args.push("--d-ffn", params.dFfn.toString());
    if (params.dropout !== undefined) args.push("--dropout", params.dropout.toString());
    if (params.attnDropout !== undefined) args.push("--attn-dropout", params.attnDropout.toString());
    if (params.diagonalAttentionMask !== undefined) {
      args.push("--diagonal-attention-mask", params.diagonalAttentionMask ? "true" : "false");
    }
    if (params.ortWeight !== undefined) args.push("--ort-weight", params.ortWeight.toString());
    if (params.mitWeight !== undefined) args.push("--mit-weight", params.mitWeight.toString());
    if (params.columnMapping) args.push("--column-mapping", params.columnMapping);

    const taskId = `saits_impute_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 SAITS 模型推理..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/5]")) {
          progressCallback?.({ stage: "loading", progress: 10, message: "正在加载数据和 metadata..." });
        } else if (text.includes("[2/5]")) {
          progressCallback?.({ stage: "loading_model", progress: 25, message: "正在加载 SAITS 模型..." });
        } else if (text.includes("[3/5]")) {
          progressCallback?.({ stage: "preparing", progress: 45, message: "正在构建 SAITS 输入序列..." });
        } else if (text.includes("[4/5]")) {
          progressCallback?.({ stage: "imputing", progress: 65, message: "正在执行 SAITS 插补..." });
        } else if (text.includes("[5/5]")) {
          progressCallback?.({ stage: "saving", progress: 85, message: "正在保存结果..." });
        } else if (text.includes("插补完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "SAITS 插补完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        let resultData: any;
        const marker = "__RESULT_JSON__:";
        const markerIndex = stdout.lastIndexOf(marker);
        if (markerIndex >= 0) {
          const jsonLine = stdout
            .slice(markerIndex + marker.length)
            .split(/\r?\n/, 1)[0]
            .trim();
          if (jsonLine) {
            try {
              resultData = JSON.parse(jsonLine);
            } catch {
              resultData = undefined;
            }
          }
        }
        const parsedError =
          resultData && typeof resultData === "object" && resultData.error ? String(resultData.error) : undefined;
        resolve({
          success: code === 0,
          data: resultData,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? (parsedError ?? PythonBridgeService.cleanRStderr(stderr)) || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 执行 KNN 插补任务（无需预训练模型）
   */
  async runKNNImputation(
    params: {
      inputFile: string;
      outputFile: string;
      targetColumn: string;
      nNeighbors?: number;
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    const scriptPath = path.join(this.pythonDir, "methods", "knn_impute.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    const args: string[] = [
      scriptPath,
      "--file",
      params.inputFile,
      "--target",
      params.targetColumn,
      "--output",
      params.outputFile,
    ];

    if (params.nNeighbors) args.push("--n-neighbors", String(params.nNeighbors));

    const taskId = `knn_impute_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 KNN 插补..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/4]")) {
          progressCallback?.({ stage: "loading", progress: 15, message: "正在加载数据..." });
        } else if (text.includes("[2/4]")) {
          progressCallback?.({ stage: "preparing", progress: 35, message: "正在构建特征矩阵..." });
        } else if (text.includes("[3/4]")) {
          progressCallback?.({ stage: "imputing", progress: 60, message: "正在执行 KNN 插补..." });
        } else if (text.includes("[4/4]")) {
          progressCallback?.({ stage: "saving", progress: 85, message: "正在保存结果..." });
        } else if (text.includes("插补完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "KNN 插补完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        let resultData: any;
        const marker = "__RESULT_JSON__:";
        const markerIndex = stdout.lastIndexOf(marker);
        if (markerIndex >= 0) {
          const jsonLine = stdout
            .slice(markerIndex + marker.length)
            .split(/\r?\n/, 1)[0]
            .trim();
          if (jsonLine) {
            try {
              resultData = JSON.parse(jsonLine);
            } catch {
              resultData = undefined;
            }
          }
        }
        const parsedError =
          resultData && typeof resultData === "object" && resultData.error ? String(resultData.error) : undefined;
        resolve({
          success: code === 0,
          data: resultData,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? (parsedError ?? PythonBridgeService.cleanRStderr(stderr)) || "执行失败" : undefined,
        });
      });

      proc.on("error", err => {
        this.runningProcesses.delete(taskId);
        resolve({ success: false, error: err.message });
      });
    });
  }

  async runBEONNonFluxPipeline(
    params: {
      inputFile: string;
      outputFile: string;
      fluxInputFile: string;
      dataType: string;
      latDeg: number;
      longDeg: number;
      timezoneHour: number;
      siteCode?: string;
      thresholdsJson?: string;
      gapfillIndicators?: string;
      sapflowStdWindow?: number;
      sapflowStdStep?: number;
    },
    progressCallback?: ProgressCallback
  ): Promise<PythonTaskResult> {
    if (!this.pythonPath) {
      await this.detectPython();
    }
    if (!this.pythonPath) {
      return { success: false, error: "Python 环境未找到" };
    }

    const scriptPath = path.join(this.pythonDir, "methods", "beon_nonflux_pipeline.py");
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `脚本文件不存在: ${scriptPath}` };
    }

    const args: string[] = [
      scriptPath,
      "--file",
      params.inputFile,
      "--output",
      params.outputFile,
      "--flux-file",
      params.fluxInputFile,
      "--data-type",
      params.dataType,
      "--lat",
      params.latDeg.toString(),
      "--long",
      params.longDeg.toString(),
      "--tz",
      params.timezoneHour.toString(),
    ];

    if (params.siteCode) args.push("--site-code", params.siteCode);
    if (params.thresholdsJson) args.push("--thresholds-json", params.thresholdsJson);
    if (params.gapfillIndicators) args.push("--gapfill-indicators", params.gapfillIndicators);
    if (params.sapflowStdWindow !== undefined) args.push("--sapflow-std-window", params.sapflowStdWindow.toString());
    if (params.sapflowStdStep !== undefined) args.push("--sapflow-std-step", params.sapflowStdStep.toString());

    const taskId = `beon_nonflux_${Date.now()}`;

    return new Promise(resolve => {
      progressCallback?.({ stage: "starting", progress: 0, message: "正在启动 BEON 非通量流程..." });

      const proc = spawn(this.pythonPath!, args, {
        cwd: this.pythonDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });

      this.runningProcesses.set(taskId, proc);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", data => {
        const text = data.toString();
        stdout += text;

        if (text.includes("[1/4]")) {
          progressCallback?.({ stage: "loading", progress: 15, message: "正在加载非通量数据..." });
        } else if (text.includes("[2/4]")) {
          progressCallback?.({ stage: "preparing", progress: 40, message: "正在准备驱动变量与阈值规则..." });
        } else if (text.includes("[3/4]")) {
          progressCallback?.({ stage: "imputing", progress: 70, message: "正在执行非通量 gap filling..." });
        } else if (text.includes("[4/4]")) {
          progressCallback?.({ stage: "saving", progress: 88, message: "正在保存非通量结果..." });
        } else if (text.includes("流程完成")) {
          progressCallback?.({ stage: "completed", progress: 100, message: "BEON 非通量流程完成" });
        }
      });

      proc.stderr.on("data", data => {
        stderr += data.toString();
      });

      proc.on("close", code => {
        this.runningProcesses.delete(taskId);
        let data: any;
        const marker = "__RESULT_JSON__:";
        const markerIndex = stdout.lastIndexOf(marker);
        if (markerIndex >= 0) {
          const jsonLine = stdout
            .slice(markerIndex + marker.length)
            .split(/\r?\n/, 1)[0]
            .trim();
          if (jsonLine) {
            try {
              data = JSON.parse(jsonLine);
            } catch {
              data = undefined;
            }
          }
        }
        const parsedError = data && typeof data === "object" && data.error ? String(data.error) : undefined;
        resolve({
          success: code === 0,
          data,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          error: code !== 0 ? (parsedError ?? PythonBridgeService.cleanRStderr(stderr)) || "执行失败" : undefined,
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
