import { EventEmitter } from "events";
import * as fs from "fs";
import { spawn } from "child_process";
import { PythonBridgeService } from "./PythonBridgeService";

jest.mock("electron", () => ({
  app: { isPackaged: false },
}));

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
}));

const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

function createMockProcess(stdoutChunks: string[], stderrChunks: string[], closeCode: number | null = 0) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();

  process.nextTick(() => {
    stdoutChunks.forEach(chunk => proc.stdout.emit("data", Buffer.from(chunk)));
    stderrChunks.forEach(chunk => proc.stderr.emit("data", Buffer.from(chunk)));
    proc.emit("close", closeCode);
  });

  return proc;
}

function getFreshService() {
  (PythonBridgeService as any).instance = undefined;
  const service = PythonBridgeService.getInstance();
  (service as any).pythonPath = "python";
  (service as any).pythonDir = "E:/code/qc_desktop/python";
  return service;
}

describe("PythonBridgeService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("detectPython 会优先选择本地虚拟环境并解析版本号", async () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    spawnMock.mockReturnValueOnce(createMockProcess(["Python 3.11.8"], []));

    const result = await getFreshService().detectPython();

    expect(result.available).toBe(true);
    expect(result.version).toBe("3.11.8");
    expect(spawnMock).toHaveBeenCalledWith(expect.stringContaining("python.exe"), ["--version"]);
  });

  it("runPythonCode 会使用 -c 执行代码并返回 stdout", async () => {
    spawnMock.mockReturnValueOnce(createMockProcess(["ok\n"], []));

    const result = await getFreshService().runPythonCode("print('ok')");

    expect(result).toEqual(expect.objectContaining({ success: true, exitCode: 0, stdout: "ok\n" }));
    expect(spawnMock).toHaveBeenCalledWith(
      "python",
      ["-c", "print('ok')"],
      expect.objectContaining({ env: expect.objectContaining({ PYTHONIOENCODING: "utf-8" }) })
    );
  });

  it("runPythonCode 会清理 R 控制台噪声并返回错误", async () => {
    spawnMock.mockReturnValueOnce(createMockProcess([], ["R[write to console]: . \n真实错误\n"], 1));

    const result = await getFreshService().runPythonCode("raise RuntimeError('bad')");

    expect(result.success).toBe(false);
    expect(result.error).toBe("真实错误");
  });

  it("runKNNImputation 会构建正确脚本参数并解析结果 JSON", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    spawnMock.mockReturnValueOnce(
      createMockProcess(['[1/4] loading\n__RESULT_JSON__:{"rows":48,"target":"co2_flux"}\n'], [])
    );
    const progress = jest.fn();

    const result = await getFreshService().runKNNImputation(
      {
        inputFile: "E:/data/flux.csv",
        outputFile: "E:/data/flux_knn.csv",
        targetColumn: "co2_flux",
        nNeighbors: 5,
      },
      progress
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ rows: 48, target: "co2_flux" });
    expect(spawnMock).toHaveBeenCalledWith(
      "python",
      [
        expect.stringContaining("knn_impute.py"),
        "--file",
        "E:/data/flux.csv",
        "--target",
        "co2_flux",
        "--output",
        "E:/data/flux_knn.csv",
        "--n-neighbors",
        "5",
      ],
      expect.objectContaining({ cwd: "E:/code/qc_desktop/python" })
    );
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: "loading" }));
  });

  it("runKNNImputation 会在脚本或输入文件不存在时返回错误且不启动进程", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const result = await getFreshService().runKNNImputation({
      inputFile: "E:/data/missing.csv",
      outputFile: "E:/data/out.csv",
      targetColumn: "co2_flux",
    });

    expect(result.success).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("runREddyProcImputation 会解析 stdout 中最后一个结果 JSON 并优先使用 JSON 错误", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    spawnMock.mockReturnValueOnce(
      createMockProcess(['progress\n__RESULT_JSON__:{"error":"R 环境不可用"}\n'], ["ignored"], 1)
    );

    const result = await getFreshService().runREddyProcImputation({
      inputFile: "E:/data/flux.csv",
      outputFile: "E:/data/flux_mds.csv",
      latDeg: 39.1,
      longDeg: 116.4,
      timezoneHour: 8,
      neeCol: "co2_flux",
      parCol: "PPFD",
      rgCol: "RG",
      tairCol: "TA",
      rhCol: "RH",
      ustarCol: "u*",
      fillAll: false,
    });

    expect(result.success).toBe(false);
    expect(result.data).toEqual({ error: "R 环境不可用" });
    expect(result.error).toBe("R 环境不可用");
    expect(spawnMock).toHaveBeenCalledWith(
      "python",
      expect.arrayContaining(["--fill-all", "false"]),
      expect.anything()
    );
  });

  it("cancelTask 会终止正在运行的任务", () => {
    const service = getFreshService();
    const proc = { kill: jest.fn() };
    (service as any).runningProcesses.set("knn_1", proc);

    expect(service.cancelTask("knn_1")).toBe(true);
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    expect(service.cancelTask("knn_1")).toBe(false);
  });
});
