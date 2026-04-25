import { ImputationRepository } from "../repository/ImputationRepository";
import { DatabaseManager } from "../core/DatabaseManager";
import { PythonBridgeService, type PythonTaskResult } from "./PythonBridgeService";
import type {
  ImputationMethod,
  ImputationMethodParam,
  ImputationResult,
  ImputationColumnStat,
  ImputationModel,
  ImputationMethodId,
  ImputationCategory,
  ImputationProgressEvent,
  ExecuteImputationRequest,
  ExecuteImputationResponse,
  ImputationMethodRow,
  ImputationMethodParamRow,
  ImputationResultRow,
  CustomModelConfig,
} from "@shared/types/imputation";
import type { DatasetVersion } from "@shared/types/database";
import * as fs from "fs";
import * as path from "path";
import * as Papa from "papaparse";

// 进度回调类型
type ProgressCallback = (event: ImputationProgressEvent) => void;

export class ImputationService {
  private repository: ImputationRepository;
  private db = DatabaseManager.getInstance().getDatabase();
  private progressCallbacks: Map<number, ProgressCallback> = new Map();

  constructor() {
    this.repository = new ImputationRepository();
  }

  // ==================== 方法管理 ====================

  /**
   * 获取所有插补方法
   */
  getAllMethods(): ImputationMethod[] {
    const rows = this.repository.getAllMethods();
    return rows.map(this.mapMethodRow);
  }

  /**
   * 根据分类获取插补方法
   */
  getMethodsByCategory(category: ImputationCategory): ImputationMethod[] {
    const rows = this.repository.getMethodsByCategory(category);
    return rows.map(this.mapMethodRow);
  }

  /**
   * 获取可用的插补方法
   */
  getAvailableMethods(): ImputationMethod[] {
    const rows = this.repository.getAvailableMethods();
    return rows.map(this.mapMethodRow);
  }

  /**
   * 获取方法的参数定义
   */
  getMethodParams(methodId: string): ImputationMethodParam[] {
    const rows = this.repository.getMethodParams(methodId);
    return rows.map(this.mapMethodParamRow);
  }

  /**
   * 获取方法及其参数定义
   */
  getMethodWithParams(methodId: string): { method: ImputationMethod; params: ImputationMethodParam[] } | undefined {
    const result = this.repository.getMethodWithParams(methodId);
    if (!result) return undefined;

    return {
      method: this.mapMethodRow(result.method),
      params: result.params.map(this.mapMethodParamRow),
    };
  }

  private getDatasetTimeColumn(datasetId: number): string {
    const dataset = this.db.prepare("SELECT time_column FROM sys_dataset WHERE id = ?").get(datasetId) as
      | { time_column?: string }
      | undefined;
    return dataset?.time_column || "TIMESTAMP";
  }

  private isMissingParamValue(paramType: ImputationMethodParam["paramType"], value: unknown): boolean {
    if (value === null || value === undefined) return true;

    switch (paramType) {
      case "number":
        return Number.isNaN(Number(value));
      case "string":
      case "select":
        return String(value).trim().length === 0;
      default:
        return false;
    }
  }

  private validateRequiredMethodParams(methodId: string, params: Record<string, any>): void {
    const methodParams = this.repository.getMethodParams(methodId);
    const missingParams = methodParams.filter(
      param => param.is_required === 1 && this.isMissingParamValue(param.param_type as any, params[param.param_key])
    );

    if (missingParams.length > 0) {
      throw new Error(`缺少必需参数: ${missingParams.map(param => param.param_name).join("、")}`);
    }
  }

  private validateREddyProcParams(datasetId: number, availableColumns: string[], params: Record<string, any>): void {
    const timeColumn = this.getDatasetTimeColumn(datasetId);
    if (!availableColumns.includes(timeColumn)) {
      throw new Error(`无法执行 REddyProc：缺少时间列 ${timeColumn}`);
    }

    const requiredColumnMappings: Array<{ key: string; label: string }> = [
      { key: "rg_col", label: "Rg" },
      { key: "tair_col", label: "Tair" },
      { key: "rh_col", label: "rH" },
      { key: "par_col", label: "Par" },
      { key: "nee_col", label: "NEE" },
      { key: "ustar_col", label: "Ustar" },
    ];

    for (const mapping of requiredColumnMappings) {
      const columnName = String(params[mapping.key] ?? "").trim();
      if (!columnName || !availableColumns.includes(columnName)) {
        throw new Error(`无法执行 REddyProc：缺少${mapping.label}列 ${columnName || `(${mapping.key})`}`);
      }
    }

    const optionalColumnMappings: Array<{ key: string; label: string }> = [
      { key: "vpd_col", label: "VPD" },
      { key: "h2o_col", label: "H2O" },
      { key: "le_col", label: "LE" },
      { key: "h_col", label: "H" },
    ];

    for (const mapping of optionalColumnMappings) {
      const rawValue = params[mapping.key];
      if (rawValue === null || rawValue === undefined) continue;
      const columnName = String(rawValue).trim();
      if (!columnName) continue;
      if (!availableColumns.includes(columnName)) {
        throw new Error(`无法执行 REddyProc：配置的${mapping.label}列不存在: ${columnName}`);
      }
    }
  }

  private getDatasetThresholdMap(
    datasetId: number,
    columnNames: string[]
  ): Record<string, { lower?: number; upper?: number }> {
    const rows = this.db
      .prepare(
        `
        SELECT column_name, min_threshold, max_threshold, physical_min, physical_max, warning_min, warning_max
        FROM conf_column_setting
        WHERE dataset_id = ? AND is_del = 0
      `
      )
      .all(datasetId) as Array<{
      column_name: string;
      min_threshold: number | null;
      max_threshold: number | null;
      physical_min: number | null;
      physical_max: number | null;
      warning_min: number | null;
      warning_max: number | null;
    }>;

    const requested = new Set(columnNames.filter(Boolean));
    const thresholdMap: Record<string, { lower?: number; upper?: number }> = {};

    for (const row of rows) {
      if (!requested.has(row.column_name)) continue;

      const lower = row.min_threshold ?? row.physical_min ?? row.warning_min ?? undefined;
      const upper = row.max_threshold ?? row.physical_max ?? row.warning_max ?? undefined;
      if (lower === undefined && upper === undefined) continue;

      thresholdMap[row.column_name] = {
        ...(lower !== undefined ? { lower } : {}),
        ...(upper !== undefined ? { upper } : {}),
      };
    }

    return thresholdMap;
  }

  private isMissingDataValue(value: unknown): boolean {
    return value === null || value === undefined || value === "" || Number.isNaN(Number(value));
  }

  private toNumericValue(value: unknown): number | null {
    if (this.isMissingDataValue(value)) return null;
    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  private buildREddyProcColumnStat(
    resultId: number,
    originalData: Record<string, any>[],
    outputData: Record<string, any>[],
    sourceColumn: string,
    outputColumn: string
  ) {
    const missingIndices: number[] = [];
    const validValues: number[] = [];

    originalData.forEach((row, idx) => {
      const numericValue = this.toNumericValue(row[sourceColumn]);
      if (numericValue === null) {
        missingIndices.push(idx);
      } else {
        validValues.push(numericValue);
      }
    });

    if (missingIndices.length === 0) {
      return {
        resultId,
        columnName: sourceColumn,
        missingCount: 0,
        imputedCount: 0,
        imputationRate: 0,
        imputedRowIndices: [],
        imputedValues: [],
      };
    }

    const meanBefore = this.calculateMean(validValues);
    const stdBefore = this.calculateStd(validValues, meanBefore);
    const imputedRowIndices: number[] = [];
    const imputedValues: number[] = [];

    for (const idx of missingIndices) {
      const imputedValue = this.toNumericValue(outputData[idx]?.[outputColumn]);
      if (imputedValue !== null) {
        imputedRowIndices.push(idx);
        imputedValues.push(imputedValue);
      }
    }

    const allValuesAfter = [...validValues, ...imputedValues];
    const meanAfter = this.calculateMean(allValuesAfter);
    const stdAfter = this.calculateStd(allValuesAfter, meanAfter);

    return {
      resultId,
      columnName: sourceColumn,
      missingCount: missingIndices.length,
      imputedCount: imputedValues.length,
      imputationRate: missingIndices.length > 0 ? imputedValues.length / missingIndices.length : 0,
      meanBefore,
      meanAfter,
      stdBefore,
      stdAfter,
      minImputed: imputedValues.length > 0 ? Math.min(...imputedValues) : undefined,
      maxImputed: imputedValues.length > 0 ? Math.max(...imputedValues) : undefined,
      imputedRowIndices,
      imputedValues,
    };
  }


  // ==================== 执行插补 ====================

  /**
   * 执行插补
   */
  async executeImputation(
    request: ExecuteImputationRequest,
    progressCallback?: ProgressCallback
  ): Promise<ExecuteImputationResponse> {
    const startTime = Date.now();

    // 获取版本信息
    const version = this.db.prepare("SELECT * FROM biz_dataset_version WHERE id = ?").get(request.versionId) as
      | DatasetVersion
      | undefined;
    if (!version) {
      throw new Error(`版本不存在: ${request.versionId}`);
    }

    // 读取数据以确定列名
    const data = await this.readDataFile(version.file_path);
    if (!data || data.length === 0) {
      throw new Error("数据为空");
    }

    // 处理目标列
    const availableColumns = Object.keys(data[0]);
    const targetColumns = request.targetColumns || availableColumns;

    // 验证目标列
    const invalidColumns = targetColumns.filter(col => !availableColumns.includes(col));
    if (invalidColumns.length > 0) {
      throw new Error(`无效的列: ${invalidColumns.join(", ")}`);
    }

    const methodParams = request.params || {};
    this.validateRequiredMethodParams(request.methodId, methodParams);
    if (this.isDirectREddyProcMethod(request.methodId)) {
      this.validateREddyProcParams(request.datasetId, availableColumns, methodParams);
    }

    // 创建结果记录
    const resultId = this.repository.createResult({
      datasetId: request.datasetId,
      versionId: request.versionId,
      methodId: request.methodId,
      targetColumns: targetColumns,
      methodParams,
    });

    if (progressCallback) {
      this.progressCallbacks.set(resultId, progressCallback);
    }

    try {
      // 更新状态为运行中
      this.repository.updateResultStatus(resultId, "RUNNING");
      this.emitProgress(resultId, {
        resultId,
        stage: "preparing",
        progress: 0,
        message: "正在准备数据...",
      });

      // 执行插补
      this.emitProgress(resultId, {
        resultId,
        stage: "imputing",
        progress: 20,
        message: "正在执行插补...",
      });

      // 根据方法类型选择执行路径
      let imputedData: Record<string, any>[];
      let columnStats: Array<any>;

      if (this.isDeepLearningMethod(request.methodId)) {
        // 深度学习方法需要特殊处理
        const result = await this.performDeepLearningImputation(
          resultId,
          data,
          targetColumns,
          request.methodId,
          methodParams,
          { file_path: version.file_path, dataset_id: request.datasetId },
          (progress, message, currentColumn) => {
            this.emitProgress(resultId, {
              resultId,
              stage: "imputing",
              progress: 20 + progress * 0.6,
              message,
              currentColumn,
            });
          }
        );
        imputedData = result.imputedData;
        columnStats = result.columnStats;
      } else if (this.isDirectREddyProcMethod(request.methodId)) {
        const result = await this.performREddyProcImputation(
          resultId,
          data,
          targetColumns,
          methodParams,
          { file_path: version.file_path, dataset_id: request.datasetId },
          (progress, message, currentColumn) => {
            this.emitProgress(resultId, {
              resultId,
              stage: "imputing",
              progress: 20 + progress * 0.6,
              message,
              currentColumn,
            });
          }
        );
        imputedData = result.imputedData;
        columnStats = result.columnStats;
      } else if (this.isMachineLearningModelMethod(request.methodId)) {
        const result = await this.performCustomModelImputation(
          resultId,
          data,
          targetColumns,
          request.methodId,
          methodParams,
          { file_path: version.file_path, dataset_id: request.datasetId },
          request.columnMapping,
          (progress, message, currentColumn) => {
            this.emitProgress(resultId, {
              resultId,
              stage: "imputing",
              progress: 20 + progress * 0.6,
              message,
              currentColumn,
            });
          }
        );
        imputedData = result.imputedData;
        columnStats = result.columnStats;
      } else if (this.isCustomMethod(request.methodId)) {
        const result = await this.performCustomModelImputation(
          resultId,
          data,
          targetColumns,
          request.methodId,
          methodParams,
          { file_path: version.file_path, dataset_id: request.datasetId },
          request.columnMapping,
          (progress, message, currentColumn) => {
            this.emitProgress(resultId, {
              resultId,
              stage: "imputing",
              progress: 20 + progress * 0.6,
              message,
              currentColumn,
            });
          }
        );
        imputedData = result.imputedData;
        columnStats = result.columnStats;
      } else {
        // 基础方法
        const result = await this.performImputation(
          resultId,
          data,
          targetColumns,
          request.methodId,
          methodParams,
          (progress, message, currentColumn) => {
            this.emitProgress(resultId, {
              resultId,
              stage: "imputing",
              progress: 20 + progress * 0.6, // 20% - 80%
              message,
              currentColumn,
            });
          }
        );
        imputedData = result.imputedData;
        columnStats = result.columnStats;
      }

      // 保存统计
      this.emitProgress(resultId, {
        resultId,
        stage: "saving",
        progress: 80,
        message: "正在保存插补结果...",
      });

      let totalMissing = 0;
      let totalImputed = 0;
      for (const stat of columnStats) {
        this.repository.insertColumnStat(stat);
        totalMissing += stat.missingCount;
        totalImputed += stat.imputedCount;
      }

      // 更新结果统计
      const executionTimeMs = Date.now() - startTime;
      this.repository.updateResultStats(resultId, {
        totalMissing,
        imputedCount: totalImputed,
        imputationRate: totalMissing > 0 ? totalImputed / totalMissing : 0,
        executionTimeMs,
      });

      // 更新状态为完成
      this.repository.updateResultStatus(resultId, "COMPLETED");
      this.emitProgress(resultId, {
        resultId,
        stage: "saving",
        progress: 100,
        message: "插补完成",
      });

      return {
        success: true,
        resultId,
        message: `成功插补 ${totalImputed} 个缺失值`,
      };
    } catch (error: any) {
      this.repository.updateResultStatus(resultId, "FAILED", error.message);
      return {
        success: false,
        resultId,
        error: error.message,
      };
    } finally {
      this.progressCallbacks.delete(resultId);
    }
  }

  /**
   * 执行实际的插补操作
   */
  private async performImputation(
    resultId: number,
    data: Record<string, any>[],
    targetColumns: string[],
    methodId: ImputationMethodId,
    params: Record<string, any>,
    onProgress: (progress: number, message: string, currentColumn?: string) => void
  ): Promise<{
    imputedData: Record<string, any>[];
    columnStats: Array<{
      resultId: number;
      columnName: string;
      missingCount: number;
      imputedCount: number;
      imputationRate: number;
      meanBefore?: number;
      meanAfter?: number;
      stdBefore?: number;
      stdAfter?: number;
      minImputed?: number;
      maxImputed?: number;
      imputedRowIndices: number[];
      imputedValues: number[];
    }>;
  }> {
    const columnStats: Array<{
      resultId: number;
      columnName: string;
      missingCount: number;
      imputedCount: number;
      imputationRate: number;
      meanBefore?: number;
      meanAfter?: number;
      stdBefore?: number;
      stdAfter?: number;
      minImputed?: number;
      maxImputed?: number;
      imputedRowIndices: number[];
      imputedValues: number[];
    }> = [];

    const totalColumns = targetColumns.length;

    for (let colIndex = 0; colIndex < targetColumns.length; colIndex++) {
      const columnName = targetColumns[colIndex];
      const progress = (colIndex / totalColumns) * 100;
      onProgress(progress, `正在处理列: ${columnName}`, columnName);

      // 提取列数据
      const columnData = data.map(row => row[columnName]);
      const numericData = columnData.map(v =>
        v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v)
      );

      // 找出缺失值索引
      const missingIndices: number[] = [];
      const validValues: number[] = [];
      numericData.forEach((v, i) => {
        if (v === null) {
          missingIndices.push(i);
        } else {
          validValues.push(v);
        }
      });

      if (missingIndices.length === 0) {
        // 没有缺失值
        columnStats.push({
          resultId,
          columnName,
          missingCount: 0,
          imputedCount: 0,
          imputationRate: 0,
          imputedRowIndices: [],
          imputedValues: [],
        });
        continue;
      }

      // 计算插补前统计
      const meanBefore = this.calculateMean(validValues);
      const stdBefore = this.calculateStd(validValues, meanBefore);

      // 执行插补
      const imputedValues = this.imputeColumn(numericData, methodId, params);
      const imputedOnlyValues: number[] = [];
      const imputedRowIndices: number[] = [];

      for (const idx of missingIndices) {
        const imputedValue = imputedValues[idx];
        if (imputedValue !== null) {
          imputedOnlyValues.push(imputedValue);
          imputedRowIndices.push(idx);
          data[idx][columnName] = imputedValue;
        }
      }

      // 计算插补后统计
      const allValuesAfter = [...validValues, ...imputedOnlyValues];
      const meanAfter = this.calculateMean(allValuesAfter);
      const stdAfter = this.calculateStd(allValuesAfter, meanAfter);

      columnStats.push({
        resultId,
        columnName,
        missingCount: missingIndices.length,
        imputedCount: imputedOnlyValues.length,
        imputationRate: imputedOnlyValues.length / missingIndices.length,
        meanBefore,
        meanAfter,
        stdBefore,
        stdAfter,
        minImputed: imputedOnlyValues.length > 0 ? Math.min(...imputedOnlyValues) : undefined,
        maxImputed: imputedOnlyValues.length > 0 ? Math.max(...imputedOnlyValues) : undefined,
        imputedRowIndices,
        imputedValues: imputedOnlyValues,
      });
    }

    onProgress(100, "插补完成");

    return { imputedData: data, columnStats };
  }

  /**
   * 对单列执行插补
   */
  private imputeColumn(
    data: (number | null)[],
    methodId: ImputationMethodId,
    params: Record<string, any>
  ): (number | null)[] {
    const result = [...data];
    const validValues = data.filter(v => v !== null) as number[];

    if (validValues.length === 0) {
      return result; // 无法插补
    }

    let imputed: (number | null)[];

    switch (methodId) {
      case "MEAN":
        imputed = this.imputeMean(result, validValues);
        break;
      case "MEDIAN":
        imputed = this.imputeMedian(result, validValues);
        break;
      case "MODE":
        imputed = this.imputeMode(result, validValues);
        break;
      case "FORWARD_FILL":
        imputed = this.imputeForwardFill(result);
        break;
      case "BACKWARD_FILL":
        imputed = this.imputeBackwardFill(result);
        break;
      case "LINEAR":
        imputed = this.imputeLinear(result);
        break;
      case "SPLINE":
        imputed = this.imputeSpline(result, params.degree || 3);
        break;
      case "POLYNOMIAL":
        imputed = this.imputePolynomial(result, params.degree || 2);
        break;
      case "ITRANSFORMER":
      case "SAITS":
      case "BITS":
      case "TIMEMIXER":
        // 深度学习方法需要整体数据处理，在 performImputation 中特殊处理
        // 这里返回原数据，实际插补在 performDeepLearningImputation 中执行
        return result;
      default:
        // 对于需要Python的方法，暂时使用线性插值作为后备
        console.warn(`方法 ${methodId} 需要Python支持，使用线性插值作为后备`);
        imputed = this.imputeLinear(result);
    }

    // 保持原始数据的小数位精度
    return this.roundImputedValues(imputed, validValues);
  }

  /**
   * 检查是否为深度学习方法
   */
  private isDeepLearningMethod(methodId: ImputationMethodId): boolean {
    return ["ITRANSFORMER", "SAITS", "BITS", "TIMEMIXER"].includes(methodId);
  }

  /**
   * 检查是否为时序模型方法
   */
  /**
   * 检查是否为REddyProc方法
   */
  private isDirectREddyProcMethod(methodId: ImputationMethodId): boolean {
    return methodId === "MDS_REDDYPROC";
  }

  private isCustomMethod(methodId: ImputationMethodId): boolean {
    return typeof methodId === "string" && methodId.startsWith("CUSTOM_");
  }

  private isMachineLearningModelMethod(methodId: ImputationMethodId): boolean {
    return methodId === "XGBOOST" || methodId === "RANDOM_FOREST";
  }

  /**
   * 执行 REddyProc MDS 插补
   */
  private async performREddyProcImputation(
    resultId: number,
    data: Record<string, any>[],
    targetColumns: string[],
    params: Record<string, any>,
    version: { file_path: string; dataset_id: number },
    onProgress: (progress: number, message: string, currentColumn?: string) => void
  ): Promise<{
    imputedData: Record<string, any>[];
    columnStats: Array<any>;
  }> {
    const pythonBridge = PythonBridgeService.getInstance();

    // 检查 Python/R 环境 (REddyProc需要rpy2和R)
    onProgress(5, "正在检查 Python/R 环境...");
    const pythonStatus = await pythonBridge.detectPython();
    if (!pythonStatus.available) {
      throw new Error("Python 环境未找到。REddyProc方法需要: Python 3.8+, R 4.0+, rpy2==3.5.16, REddyProc R包");
    }

    // 获取数据集时间列配置
    const timeColumn = this.getDatasetTimeColumn(version.dataset_id);

    // 验证必需的参数
    if (
      params.lat_deg === undefined ||
      params.lat_deg === null ||
      params.long_deg === undefined ||
      params.long_deg === null ||
      params.timezone_hour === undefined ||
      params.timezone_hour === null
    ) {
      throw new Error("REddyProc MDS 方法需要提供站点位置信息（纬度、经度、时区）");
    }

    const availableColumns = Object.keys(data[0] || {});
    this.validateREddyProcParams(version.dataset_id, availableColumns, params);

    const versionDir = path.dirname(version.file_path);
    const versionExt = path.extname(version.file_path) || ".csv";
    const versionName = path.basename(version.file_path, versionExt);
    const outputFile = path.join(versionDir, `${versionName}_reddyproc_result_${resultId}.csv`);

    onProgress(10, "正在执行 REddyProc 通量完整流程...");
    const result = await pythonBridge.runREddyProcImputation(
      {
        inputFile: version.file_path,
        outputFile,
        timeColumn,
        latDeg: Number(params.lat_deg),
        longDeg: Number(params.long_deg),
        timezoneHour: Number(params.timezone_hour),
        neeCol: String(params.nee_col),
        parCol: String(params.par_col),
        rgCol: String(params.rg_col),
        tairCol: String(params.tair_col),
        rhCol: String(params.rh_col),
        ustarCol: String(params.ustar_col),
        vpdCol: params.vpd_col ? String(params.vpd_col) : "",
        h2oCol: params.h2o_col ? String(params.h2o_col) : "",
        leCol: params.le_col ? String(params.le_col) : "",
        hCol: params.h_col ? String(params.h_col) : "",
        despikingZ: Number(params.despiking_z ?? 4),
        fillAll: params.fill_all !== false,
      },
      pythonProgress => {
        onProgress(pythonProgress.progress, pythonProgress.message);
      }
    );

    if (!result.success) {
      throw new Error(`REddyProc 通量流程失败: ${result.error}`);
    }

    if (!fs.existsSync(outputFile)) {
      throw new Error(`REddyProc 输出文件未生成: ${outputFile}`);
    }

    const outputData = await this.readDataFile(outputFile);
    if (outputData.length !== data.length) {
      throw new Error(`REddyProc 输出行数异常: 期望 ${data.length}，实际 ${outputData.length}`);
    }

    this.repository.updateResultOutputFile(resultId, outputFile);

    const representatives = (result.data?.representatives || {}) as Record<string, string | null>;
    const statMappings = [
      { sourceColumn: String(params.nee_col), outputColumn: representatives.nee },
      { sourceColumn: params.h2o_col ? String(params.h2o_col) : "", outputColumn: representatives.h2o },
      { sourceColumn: params.le_col ? String(params.le_col) : "", outputColumn: representatives.le },
      { sourceColumn: params.h_col ? String(params.h_col) : "", outputColumn: representatives.h },
    ].filter(mapping => mapping.sourceColumn && outputData[0] && targetColumns.includes(mapping.sourceColumn));

    const missingRepresentative = statMappings.find(
      mapping => !mapping.outputColumn || !(mapping.outputColumn in outputData[0])
    );
    if (missingRepresentative) {
      throw new Error(`REddyProc 结果缺少代表输出列: ${missingRepresentative.sourceColumn}`);
    }

    const columnStats = statMappings.map(mapping =>
      this.buildREddyProcColumnStat(resultId, data, outputData, mapping.sourceColumn, mapping.outputColumn!)
    );

    onProgress(100, "REddyProc 通量流程完成");
    return { imputedData: outputData, columnStats };
  }

  /**
   * 执行自定义模型插补
   * 对 targetColumns 中的每一列独立调用推理脚本，逐列输出临时文件后合并回主数据。
   * 底层通过 PythonBridgeService 调用推理脚本，后续可根据 model_params.inference_type 扩展。
   */
  private async performCustomModelImputation(
    resultId: number,
    data: Record<string, any>[],
    targetColumns: string[],
    methodId: ImputationMethodId,
    params: Record<string, any>,
    version: { file_path: string; dataset_id: number },
    columnMapping: Record<string, string> | undefined,
    onProgress: (progress: number, message: string, currentColumn?: string) => void
  ): Promise<{
    imputedData: Record<string, any>[];
    columnStats: Array<any>;
  }> {
    const pythonBridge = PythonBridgeService.getInstance();
    const columnStats: Array<any> = [];

    // 检查 Python 环境
    onProgress(5, "正在检查 Python 环境...");
    const pythonStatus = await pythonBridge.detectPython();
    if (!pythonStatus.available) {
      throw new Error("Python 环境未找到，请先安装 Python 3.8+");
    }

    // 获取时间列
    const userTimeColumn = this.getDatasetTimeColumn(version.dataset_id);

    // 为每个目标列执行插补
    for (let colIndex = 0; colIndex < targetColumns.length; colIndex++) {
      const columnName = targetColumns[colIndex];
      const baseProgress = 10 + (colIndex / targetColumns.length) * 80;
      onProgress(baseProgress, `正在插补列: ${columnName}`, columnName);

      // 记录原始缺失值位置
      const missingIndices: number[] = [];
      const validValues: number[] = [];
      data.forEach((row, idx) => {
        const val = row[columnName];
        if (val === null || val === undefined || val === "" || Number.isNaN(Number(val))) {
          missingIndices.push(idx);
        } else {
          validValues.push(Number(val));
        }
      });

      if (missingIndices.length === 0) {
        columnStats.push({
          resultId,
          columnName,
          missingCount: 0,
          imputedCount: 0,
          imputationRate: 0,
          imputedRowIndices: [],
          imputedValues: [],
        });
        continue;
      }

      // 按 target_column 精确查找该列对应的预训练模型
      const modelConfig = this.getModelForTargetColumn(version.dataset_id, methodId, columnName);

      // 计算插补前统计
      const meanBefore = this.calculateMean(validValues);
      const stdBefore = this.calculateStd(validValues, meanBefore);

      // 创建临时文件
      const tempDir = path.dirname(version.file_path);
      const tempInputFile = path.join(tempDir, `custom_input_${resultId}_${colIndex}.csv`);
      const tempOutputFile = path.join(tempDir, `custom_output_${resultId}_${colIndex}.csv`);

      try {
        // 写入临时输入文件
        const csvContent = Papa.unparse(data);
        fs.writeFileSync(tempInputFile, csvContent, "utf-8");

        const bridgeProgress = (pythonProgress: { progress: number; message: string }) => {
          const adjusted = baseProgress + (pythonProgress.progress / 100) * (80 / targetColumns.length);
          onProgress(adjusted, pythonProgress.message, columnName);
        };

        let result: PythonTaskResult;

        if (modelConfig?.modelPath) {
          // ── 有预训练模型：使用 XGBoost / RandomForest 推理 ──
          let modelPath = params.model_path || modelConfig.modelPath;
          if (!path.isAbsolute(modelPath)) {
            const pythonDir = pythonBridge.getPythonDir();
            modelPath = path.join(pythonDir, modelPath);
          }

          const featureColumnsRaw = params.feature_columns || modelConfig.featureColumns?.join(",") || "";
          const timeCol = params.time_col || modelConfig.timeColumn || userTimeColumn || "record_time";
          const addTimeFeatures = params.add_time_features !== false && params.add_time_features !== "false";

          const bridgeParams = {
            modelPath,
            inputFile: tempInputFile,
            outputFile: tempOutputFile,
            targetColumn: columnName,
            featureColumns: featureColumnsRaw,
            timeColumn: timeCol,
            addTimeFeatures,
            columnMapping:
              columnMapping && Object.keys(columnMapping).length > 0 ? JSON.stringify(columnMapping) : undefined,
          };

          result =
            methodId === "XGBOOST"
              ? await pythonBridge.runXGBoostImputation(bridgeParams, bridgeProgress)
              : await pythonBridge.runRandomForestImputation(bridgeParams, bridgeProgress);
        } else {
          // ── 无预训练模型：fallback 到 KNN 插补 ──
          onProgress(baseProgress, `列 "${columnName}" 无专属模型，使用 KNN 插补`, columnName);
          result = await pythonBridge.runKNNImputation(
            {
              inputFile: tempInputFile,
              outputFile: tempOutputFile,
              targetColumn: columnName,
            },
            bridgeProgress
          );
        }

        if (!result.success) {
          throw new Error(`自定义模型插补失败 (列: ${columnName}): ${result.error}`);
        }

        if (!fs.existsSync(tempOutputFile)) {
          throw new Error(`自定义模型输出文件未生成: ${tempOutputFile}`);
        }

        // 读取插补结果
        const imputedDataRaw = await this.readDataFile(tempOutputFile);
        const imputedOnlyValues: number[] = [];
        const imputedRowIndices: number[] = [];

        for (const idx of missingIndices) {
          const imputedValue = Number(imputedDataRaw[idx]?.[columnName]);
          if (!Number.isNaN(imputedValue)) {
            imputedOnlyValues.push(imputedValue);
            imputedRowIndices.push(idx);
            data[idx][columnName] = imputedValue;
          }
        }

        // 计算插补后统计
        const allValuesAfter = [...validValues, ...imputedOnlyValues];
        const meanAfter = this.calculateMean(allValuesAfter);
        const stdAfter = this.calculateStd(allValuesAfter, meanAfter);

        columnStats.push({
          resultId,
          columnName,
          missingCount: missingIndices.length,
          imputedCount: imputedOnlyValues.length,
          imputationRate: imputedOnlyValues.length / missingIndices.length,
          meanBefore,
          meanAfter,
          stdBefore,
          stdAfter,
          minImputed: imputedOnlyValues.length > 0 ? Math.min(...imputedOnlyValues) : undefined,
          maxImputed: imputedOnlyValues.length > 0 ? Math.max(...imputedOnlyValues) : undefined,
          imputedRowIndices,
          imputedValues: imputedOnlyValues,
        });
      } finally {
        if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
        if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
      }
    }

    onProgress(100, "自定义模型插补完成");
    return { imputedData: data, columnStats };
  }

  /**
   * 执行深度学习模型插补
   */
  private async performDeepLearningImputation(
    resultId: number,
    data: Record<string, any>[],
    targetColumns: string[],
    methodId: ImputationMethodId,
    params: Record<string, any>,
    version: { file_path: string; dataset_id: number },
    onProgress: (progress: number, message: string, currentColumn?: string) => void
  ): Promise<{
    imputedData: Record<string, any>[];
    columnStats: Array<any>;
  }> {
    if (methodId === "ITRANSFORMER" || methodId === "SAITS" || methodId === "BITS" || methodId === "TIMEMIXER") {
      return this.performTimeMixerPPImputation(resultId, data, targetColumns, methodId, params, version, onProgress);
    }

    throw new Error(`深度学习方法 ${methodId} 暂未实现`);
  }

  /**
   * 执行 TimeMixer++ 插补
   */
  private async performTimeMixerPPImputation(
    resultId: number,
    data: Record<string, any>[],
    targetColumns: string[],
    methodId: ImputationMethodId,
    params: Record<string, any>,
    version: { file_path: string; dataset_id: number },
    onProgress: (progress: number, message: string, currentColumn?: string) => void
  ): Promise<{
    imputedData: Record<string, any>[];
    columnStats: Array<any>;
  }> {
    const pythonBridge = PythonBridgeService.getInstance();
    const columnStats: Array<any> = [];

    // 检查 Python 环境
    onProgress(5, "正在检查 Python 环境...");
    const pythonStatus = await pythonBridge.detectPython();
    if (!pythonStatus.available) {
      throw new Error("Python 环境未找到，请先安装 Python 3.8+");
    }

    // 获取模型配置
    let modelPath = params.model_path;
    let modelConfig: {
      modelPath?: string;
      modelParams?: Record<string, any>;
      targetColumn?: string;
      featureColumns?: string[];
      timeColumn?: string;
    } | null = null;

    if (!modelPath) {
      // 尝试从数据库获取关联的模型配置
      modelConfig = this.getActiveModelFull(version.dataset_id, methodId);
      if (modelConfig?.modelPath) {
        modelPath = modelConfig.modelPath;
      } else {
        throw new Error("未指定模型文件路径，且数据集没有关联的深度学习模型");
      }
    }

    // 获取数据集时间列配置
    const dataset = this.db.prepare("SELECT time_column FROM sys_dataset WHERE id = ?").get(version.dataset_id) as
      | { time_column?: string }
      | undefined;
    const userTimeColumn = dataset?.time_column || "record_time";

    // 模型期望的时间列名（从模型配置或默认）
    const modelTimeColumn = modelConfig?.timeColumn || "record_time";

    // 如果用户数据时间列与模型期望不同，需要重命名
    let timeColumnRenamed = false;
    const originalTimeColumnName = userTimeColumn;
    if (userTimeColumn !== modelTimeColumn && data.length > 0 && userTimeColumn in data[0]) {
      onProgress(8, `重命名时间列: ${userTimeColumn} -> ${modelTimeColumn}`);
      for (const row of data) {
        row[modelTimeColumn] = row[userTimeColumn];
        if (userTimeColumn !== modelTimeColumn) {
          delete row[userTimeColumn];
        }
      }
      timeColumnRenamed = true;
    }

    // 验证特征列是否存在
    const modelFeatureColumns = modelConfig?.featureColumns;
    if (modelFeatureColumns && modelFeatureColumns.length > 0 && data.length > 0) {
      const availableColumns = Object.keys(data[0]);
      const missingFeatures = modelFeatureColumns.filter(
        col => col !== modelTimeColumn && !availableColumns.includes(col)
      );
      if (missingFeatures.length > 0) {
        throw new Error(`数据缺少模型所需的特征列: ${missingFeatures.join(", ")}`);
      }
    }

    // 为每个目标列执行插补
    for (let colIndex = 0; colIndex < targetColumns.length; colIndex++) {
      const columnName = targetColumns[colIndex];
      const progress = 10 + (colIndex / targetColumns.length) * 80;
      onProgress(progress, `正在插补列: ${columnName}`, columnName);

      // 记录原始缺失值位置
      const missingIndices: number[] = [];
      const validValues: number[] = [];
      data.forEach((row, idx) => {
        const val = row[columnName];
        if (val === null || val === undefined || val === "" || Number.isNaN(Number(val))) {
          missingIndices.push(idx);
        } else {
          validValues.push(Number(val));
        }
      });

      if (missingIndices.length === 0) {
        columnStats.push({
          resultId,
          columnName,
          missingCount: 0,
          imputedCount: 0,
          imputationRate: 0,
          imputedRowIndices: [],
          imputedValues: [],
        });
        continue;
      }

      // 计算插补前统计
      const meanBefore = this.calculateMean(validValues);
      const stdBefore = this.calculateStd(validValues, meanBefore);

      // 创建临时输入输出文件
      const tempDir = path.dirname(version.file_path);
      const tempInputFile = path.join(tempDir, `temp_input_${resultId}_${colIndex}.csv`);
      const tempOutputFile = path.join(tempDir, `temp_output_${resultId}_${colIndex}.csv`);

      try {
        // 写入临时输入文件
        const csvContent = Papa.unparse(data);
        fs.writeFileSync(tempInputFile, csvContent, "utf-8");

        // 调用 Python 脚本
        const result = await pythonBridge.runTimeMixerPPImputation(
          {
            modelPath,
            inputFile: tempInputFile,
            outputFile: tempOutputFile,
            targetColumn: columnName,
            timeColumn: modelTimeColumn,
            seqLen: params.seq_len || 96,
            nLayers: params.n_layers,
            dModel: params.d_model,
            dFfn: params.d_ffn,
            topK: params.top_k,
            nHeads: params.n_heads,
            nKernels: params.n_kernels,
            dropout: params.dropout,
            downLayers: params.down_layers,
            downWindow: params.down_window,
            useGpu: params.use_gpu !== false,
          },
          pythonProgress => {
            const adjustedProgress = progress + (pythonProgress.progress / 100) * (80 / targetColumns.length);
            onProgress(adjustedProgress, pythonProgress.message, columnName);
          }
        );

        if (!result.success) {
          throw new Error(`TimeMixer++ 插补失败: ${result.error}`);
        }

        // 读取插补结果
        if (!fs.existsSync(tempOutputFile)) {
          throw new Error("插补结果文件未生成");
        }

        const imputedDataRaw = await this.readDataFile(tempOutputFile);
        const imputedOnlyValues: number[] = [];
        const imputedRowIndices: number[] = [];

        for (const idx of missingIndices) {
          const imputedValue = Number(imputedDataRaw[idx]?.[columnName]);
          if (!Number.isNaN(imputedValue)) {
            imputedOnlyValues.push(imputedValue);
            imputedRowIndices.push(idx);
            data[idx][columnName] = imputedValue;
          }
        }

        // 计算插补后统计
        const allValuesAfter = [...validValues, ...imputedOnlyValues];
        const meanAfter = this.calculateMean(allValuesAfter);
        const stdAfter = this.calculateStd(allValuesAfter, meanAfter);

        columnStats.push({
          resultId,
          columnName,
          missingCount: missingIndices.length,
          imputedCount: imputedOnlyValues.length,
          imputationRate: imputedOnlyValues.length / missingIndices.length,
          meanBefore,
          meanAfter,
          stdBefore,
          stdAfter,
          minImputed: imputedOnlyValues.length > 0 ? Math.min(...imputedOnlyValues) : undefined,
          maxImputed: imputedOnlyValues.length > 0 ? Math.max(...imputedOnlyValues) : undefined,
          imputedRowIndices,
          imputedValues: imputedOnlyValues,
        });
      } finally {
        // 清理临时文件
        if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
        if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
      }
    }

    onProgress(100, "插补完成");
    return { imputedData: data, columnStats };
  }

  /**
   * 获取数据集的活跃模型（基础信息）
   */
  private getActiveModel(
    datasetId: number,
    methodId: string
  ): {
    modelPath?: string;
    modelParams?: Record<string, any>;
  } | null {
    const row = this.db
      .prepare(
        `
      SELECT model_path, model_params FROM biz_imputation_model
      WHERE dataset_id = ? AND method_id = ? AND is_active = 1 AND is_del = 0
      ORDER BY trained_at DESC LIMIT 1
    `
      )
      .get(datasetId, methodId) as { model_path?: string; model_params?: string } | undefined;

    if (!row) return null;

    return {
      modelPath: row.model_path || undefined,
      modelParams: row.model_params ? JSON.parse(row.model_params) : undefined,
    };
  }

  /**
   * 获取数据集的活跃模型（完整配置）
   * 优先查找数据集专属模型，如果没有则查找通用模型（dataset_id 为 NULL）
   */
  private getActiveModelFull(
    datasetId: number,
    methodId: string
  ): {
    modelPath?: string;
    modelParams?: Record<string, any>;
    targetColumn?: string;
    featureColumns?: string[];
    timeColumn?: string;
  } | null {
    // 优先查找数据集专属模型
    let row = this.db
      .prepare(
        `
      SELECT model_path, model_params, target_column, feature_columns, time_column 
      FROM biz_imputation_model
      WHERE dataset_id = ? AND method_id = ? AND is_active = 1 AND is_del = 0
      ORDER BY trained_at DESC LIMIT 1
    `
      )
      .get(datasetId, methodId) as
      | {
          model_path?: string;
          model_params?: string;
          target_column?: string;
          feature_columns?: string;
          time_column?: string;
        }
      | undefined;

    // 如果没有找到，查找通用模型（dataset_id 为 NULL）
    if (!row) {
      row = this.db
        .prepare(
          `
        SELECT model_path, model_params, target_column, feature_columns, time_column 
        FROM biz_imputation_model
        WHERE dataset_id IS NULL AND method_id = ? AND is_active = 1 AND is_del = 0
        ORDER BY trained_at DESC LIMIT 1
      `
        )
        .get(methodId) as typeof row;
    }

    if (!row) return null;

    return {
      modelPath: row.model_path || undefined,
      modelParams: row.model_params ? JSON.parse(row.model_params) : undefined,
      targetColumn: row.target_column || undefined,
      featureColumns: row.feature_columns ? JSON.parse(row.feature_columns) : undefined,
      timeColumn: row.time_column || "record_time",
    };
  }

  /**
   * 按 target_column 精确匹配模型配置。
   * 用于 XGBoost / RANDOM_FOREST 等 ML 方法——每个目标指标有独立训练的模型。
   * 若匹配不到，返回 null（由调用方 fallback 到 KNN）。
   */
  private getModelForTargetColumn(
    datasetId: number,
    methodId: string,
    targetColumn: string
  ): {
    modelPath?: string;
    modelParams?: Record<string, any>;
    targetColumn?: string;
    featureColumns?: string[];
    timeColumn?: string;
  } | null {
    type Row = {
      model_path?: string;
      model_params?: string;
      target_column?: string;
      feature_columns?: string;
      time_column?: string;
    };

    // 优先查找数据集专属模型（按 target_column 精确匹配）
    let row = this.db
      .prepare(
        `SELECT model_path, model_params, target_column, feature_columns, time_column
         FROM biz_imputation_model
         WHERE dataset_id = ? AND method_id = ? AND target_column = ? AND is_active = 1 AND is_del = 0
         ORDER BY trained_at DESC LIMIT 1`
      )
      .get(datasetId, methodId, targetColumn) as Row | undefined;

    // 如果没有找到，查找通用模型（dataset_id 为 NULL）
    if (!row) {
      row = this.db
        .prepare(
          `SELECT model_path, model_params, target_column, feature_columns, time_column
           FROM biz_imputation_model
           WHERE dataset_id IS NULL AND method_id = ? AND target_column = ? AND is_active = 1 AND is_del = 0
           ORDER BY trained_at DESC LIMIT 1`
        )
        .get(methodId, targetColumn) as Row | undefined;
    }

    if (!row) return null;

    return {
      modelPath: row.model_path || undefined,
      modelParams: row.model_params ? JSON.parse(row.model_params) : undefined,
      targetColumn: row.target_column || undefined,
      featureColumns: row.feature_columns ? JSON.parse(row.feature_columns) : undefined,
      timeColumn: row.time_column || "record_time",
    };
  }

  // ==================== 基础插补方法 ====================

  /**
   * 均值填充
   */
  private imputeMean(data: (number | null)[], validValues: number[]): (number | null)[] {
    const mean = this.calculateMean(validValues);
    return data.map(v => (v === null ? mean : v));
  }

  /**
   * 中位数填充
   */
  private imputeMedian(data: (number | null)[], validValues: number[]): (number | null)[] {
    const sorted = [...validValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return data.map(v => (v === null ? median : v));
  }

  /**
   * 众数填充
   */
  private imputeMode(data: (number | null)[], validValues: number[]): (number | null)[] {
    const frequency = new Map<number, number>();
    for (const v of validValues) {
      frequency.set(v, (frequency.get(v) || 0) + 1);
    }
    let mode = validValues[0];
    let maxFreq = 0;
    for (const [value, freq] of frequency) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mode = value;
      }
    }
    return data.map(v => (v === null ? mode : v));
  }

  /**
   * 向前填充
   */
  private imputeForwardFill(data: (number | null)[]): (number | null)[] {
    const result = [...data];
    let lastValid: number | null = null;
    for (let i = 0; i < result.length; i++) {
      if (result[i] !== null) {
        lastValid = result[i];
      } else if (lastValid !== null) {
        result[i] = lastValid;
      }
    }
    return result;
  }

  /**
   * 向后填充
   */
  private imputeBackwardFill(data: (number | null)[]): (number | null)[] {
    const result = [...data];
    let nextValid: number | null = null;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i] !== null) {
        nextValid = result[i];
      } else if (nextValid !== null) {
        result[i] = nextValid;
      }
    }
    return result;
  }

  /**
   * 线性插值
   */
  private imputeLinear(data: (number | null)[]): (number | null)[] {
    const result = [...data];

    // 找到所有有效值的索引和值
    const validPoints: { index: number; value: number }[] = [];
    data.forEach((v, i) => {
      if (v !== null) {
        validPoints.push({ index: i, value: v });
      }
    });

    if (validPoints.length < 2) {
      // 不足以进行线性插值，使用均值
      if (validPoints.length === 1) {
        return data.map(v => (v === null ? validPoints[0].value : v));
      }
      return result;
    }

    // 对每个缺失值进行线性插值
    for (let i = 0; i < result.length; i++) {
      if (result[i] === null) {
        // 找到前后最近的有效值
        let prevPoint: { index: number; value: number } | null = null;
        let nextPoint: { index: number; value: number } | null = null;

        for (const point of validPoints) {
          if (point.index < i) {
            prevPoint = point;
          } else if (point.index > i && !nextPoint) {
            nextPoint = point;
            break;
          }
        }

        if (prevPoint && nextPoint) {
          // 线性插值
          const ratio = (i - prevPoint.index) / (nextPoint.index - prevPoint.index);
          result[i] = prevPoint.value + ratio * (nextPoint.value - prevPoint.value);
        } else if (prevPoint) {
          // 只有前值，使用前值
          result[i] = prevPoint.value;
        } else if (nextPoint) {
          // 只有后值，使用后值
          result[i] = nextPoint.value;
        }
      }
    }

    return result;
  }

  /**
   * 样条插值（三次自然样条）
   * 使用三次样条曲线对缺失值进行插值，保证曲线平滑且二阶导数连续
   */
  private imputeSpline(data: (number | null)[], degree: number): (number | null)[] {
    const result = [...data];

    // 提取有效数据点
    const validPoints: { index: number; value: number }[] = [];
    data.forEach((v, i) => {
      if (v !== null) {
        validPoints.push({ index: i, value: v });
      }
    });

    // 至少需要2个点才能进行样条插值
    if (validPoints.length < 2) {
      if (validPoints.length === 1) {
        return data.map(v => (v === null ? validPoints[0].value : v));
      }
      return result;
    }

    // 如果只有2个点，退化为线性插值
    if (validPoints.length === 2) {
      return this.imputeLinear(data);
    }

    const n = validPoints.length;
    const x = validPoints.map(p => p.index);
    const y = validPoints.map(p => p.value);

    // 计算三次样条系数
    const splineCoeffs = this.computeCubicSplineCoefficients(x, y);

    // 对每个缺失值进行插值
    for (let i = 0; i < result.length; i++) {
      if (result[i] === null) {
        result[i] = this.evaluateCubicSpline(i, x, y, splineCoeffs);
      }
    }

    return result;
  }

  /**
   * 计算三次自然样条的系数
   * 返回每个区间的二阶导数值 M
   */
  private computeCubicSplineCoefficients(x: number[], y: number[]): number[] {
    const n = x.length;

    // h[i] = x[i+1] - x[i]
    const h: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      h.push(x[i + 1] - x[i]);
    }

    // 构建三对角矩阵方程 AM = d
    // 自然样条边界条件: M[0] = M[n-1] = 0
    const alpha: number[] = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = (3 / h[i]) * (y[i + 1] - y[i]) - (3 / h[i - 1]) * (y[i] - y[i - 1]);
    }

    // 追赶法求解三对角方程组
    const l: number[] = new Array(n).fill(1);
    const mu: number[] = new Array(n).fill(0);
    const z: number[] = new Array(n).fill(0);

    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    // 回代求解 M (二阶导数)
    const M: number[] = new Array(n).fill(0);
    for (let j = n - 2; j >= 1; j--) {
      M[j] = z[j] - mu[j] * M[j + 1];
    }

    return M;
  }

  /**
   * 使用三次样条计算给定位置的插值
   */
  private evaluateCubicSpline(xi: number, x: number[], y: number[], M: number[]): number {
    const n = x.length;

    // 找到 xi 所在的区间 [x[j], x[j+1]]
    let j = 0;
    if (xi <= x[0]) {
      j = 0;
    } else if (xi >= x[n - 1]) {
      j = n - 2;
    } else {
      for (let i = 0; i < n - 1; i++) {
        if (xi >= x[i] && xi <= x[i + 1]) {
          j = i;
          break;
        }
      }
    }

    const h = x[j + 1] - x[j];
    const t = xi - x[j];
    const t1 = x[j + 1] - xi;

    // 三次样条插值公式
    const a = (M[j] * Math.pow(t1, 3)) / (6 * h);
    const b = (M[j + 1] * Math.pow(t, 3)) / (6 * h);
    const c = (y[j] / h - (M[j] * h) / 6) * t1;
    const d = (y[j + 1] / h - (M[j + 1] * h) / 6) * t;

    return a + b + c + d;
  }

  /**
   * 多项式插值（局部拉格朗日插值）
   * 使用指定度数的多项式对缺失值进行插值
   * 采用局部窗口方式避免高阶多项式的龙格现象
   */
  private imputePolynomial(data: (number | null)[], degree: number): (number | null)[] {
    const result = [...data];

    // 提取有效数据点
    const validPoints: { index: number; value: number }[] = [];
    data.forEach((v, i) => {
      if (v !== null) {
        validPoints.push({ index: i, value: v });
      }
    });

    // 至少需要 degree+1 个点才能进行 degree 阶多项式插值
    const minPoints = degree + 1;
    if (validPoints.length < minPoints) {
      // 点数不足，退化为线性插值
      return this.imputeLinear(data);
    }

    // 对每个缺失值进行插值
    for (let i = 0; i < result.length; i++) {
      if (result[i] === null) {
        // 选择最近的 minPoints 个点进行局部多项式插值
        const nearestPoints = this.selectNearestPoints(i, validPoints, minPoints);
        result[i] = this.lagrangeInterpolate(i, nearestPoints);
      }
    }

    return result;
  }

  /**
   * 选择距离目标索引最近的 n 个有效点
   */
  private selectNearestPoints(
    targetIndex: number,
    validPoints: { index: number; value: number }[],
    n: number
  ): { index: number; value: number }[] {
    // 按距离排序
    const sorted = [...validPoints].sort((a, b) => Math.abs(a.index - targetIndex) - Math.abs(b.index - targetIndex));

    // 取最近的 n 个点，然后按索引排序以保持顺序
    return sorted.slice(0, n).sort((a, b) => a.index - b.index);
  }

  /**
   * 拉格朗日多项式插值
   */
  private lagrangeInterpolate(xi: number, points: { index: number; value: number }[]): number {
    let result = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      let term = points[i].value;

      for (let j = 0; j < n; j++) {
        if (i !== j) {
          term *= (xi - points[j].index) / (points[i].index - points[j].index);
        }
      }

      result += term;
    }

    return result;
  }

  // ==================== 工具方法 ====================

  /**
   * 检测数值数组的小数位数（基于有效值）
   */
  private getDecimalPlaces(values: number[]): number {
    if (values.length === 0) return 2; // 默认2位小数

    let maxDecimals = 0;
    // 采样前1000个值
    const sampleSize = Math.min(values.length, 1000);
    for (let i = 0; i < sampleSize; i++) {
      const val = values[i];
      const strVal = val.toFixed(10).replace(/0+$/, "");
      if (strVal.includes(".")) {
        const decimals = strVal.split(".")[1]?.length || 0;
        maxDecimals = Math.max(maxDecimals, decimals);
      }
    }
    return maxDecimals;
  }

  /**
   * 将插补值四舍五入到指定的小数位数
   */
  private roundToDecimalPlaces(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * 将插补结果数组四舍五入到原始数据的小数位精度
   */
  private roundImputedValues(imputedData: (number | null)[], originalValidValues: number[]): (number | null)[] {
    const decimals = this.getDecimalPlaces(originalValidValues);
    return imputedData.map(v => (v === null ? null : this.roundToDecimalPlaces(v, decimals)));
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateStd(values: number[], mean?: number): number {
    if (values.length === 0) return 0;
    const m = mean ?? this.calculateMean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateConfidence(methodId: ImputationMethodId, imputedValue: number, validValues: number[]): number {
    // 简单的置信度计算：基于插补值与有效值的相似性
    if (validValues.length === 0) return 0.5;

    const mean = this.calculateMean(validValues);
    const std = this.calculateStd(validValues, mean);

    if (std === 0) return 1.0;

    // 使用正态分布概率作为置信度
    const zScore = Math.abs(imputedValue - mean) / std;
    const confidence = Math.exp(-0.5 * zScore * zScore);

    // 根据方法调整置信度
    const methodMultiplier: Record<string, number> = {
      MEAN: 0.6,
      MEDIAN: 0.65,
      MODE: 0.55,
      FORWARD_FILL: 0.7,
      BACKWARD_FILL: 0.7,
      LINEAR: 0.8,
      SPLINE: 0.85,
      POLYNOMIAL: 0.8,
    };

    return Math.min(1.0, confidence * (methodMultiplier[methodId] || 0.75));
  }

  private async readDataFile(filePath: string): Promise<Record<string, any>[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const ext = filePath.toLowerCase().split(".").pop();

    if (ext === "csv") {
      return this.readCsvFile(filePath);
    } else {
      // 尝试作为 CSV 读取
      return this.readCsvFile(filePath);
    }
  }

  private readCsvFile(filePath: string): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const result = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      if (result.errors.length > 0) {
        console.warn("CSV 解析警告:", result.errors);
      }

      resolve(result.data as Record<string, any>[]);
    });
  }

  private emitProgress(resultId: number, event: ImputationProgressEvent): void {
    const callback = this.progressCallbacks.get(resultId);
    if (callback) {
      callback(event);
    }
  }

  // ==================== 结果管理 ====================

  /**
   * 获取插补结果
   */
  getResult(resultId: number): ImputationResult | null {
    const row = this.repository.getResultById(resultId);
    return row ? this.mapResultRow(row) : null;
  }

  /**
   * 获取数据集的插补历史
   */
  getResultsByDataset(datasetId: number, limit = 50, offset = 0): ImputationResult[] {
    const rows = this.repository.getResultsByDataset(datasetId, limit, offset);
    return rows.map(this.mapResultRow);
  }

  /**
   * 获取列统计
   */
  getColumnStats(resultId: number): ImputationColumnStat[] {
    const rows = this.repository.getColumnStats(resultId);
    return rows.map(row => ({
      id: row.id,
      resultId: row.result_id,
      columnName: row.column_name,
      missingCount: row.missing_count,
      imputedCount: row.imputed_count,
      imputationRate: row.imputation_rate,
      meanBefore: row.mean_before || undefined,
      meanAfter: row.mean_after || undefined,
      stdBefore: row.std_before || undefined,
      stdAfter: row.std_after || undefined,
      minImputed: row.min_imputed || undefined,
      maxImputed: row.max_imputed || undefined,
      avgConfidence: row.avg_confidence || undefined,
      imputedRowIndices: row.imputed_row_indices ? JSON.parse(row.imputed_row_indices) : undefined,
      imputedValues: row.imputed_values ? JSON.parse(row.imputed_values) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * 删除插补结果
   */
  deleteResult(resultId: number): void {
    this.repository.deleteResult(resultId);
  }

  /**
   * 重命名插补结果
   */
  renameResult(resultId: number, name: string): boolean {
    return this.repository.renameResult(resultId, name);
  }

  /**
   * 批量更新排序顺序
   */
  reorderResults(orders: { id: number; sortOrder: number }[]): void {
    this.repository.updateSortOrders(orders);
  }

  // ==================== 结果应用与导出 ====================

  /**
   * 重构数据（原始数据 + 列统计中的插补点）
   */
  async reconstructData(resultId: number): Promise<Record<string, any>[]> {
    const result = this.getResult(resultId);
    if (!result) throw new Error(`Result not found: ${resultId}`);

    if (result.outputFilePath) {
      if (!fs.existsSync(result.outputFilePath)) {
        throw new Error(`插补结果文件不存在: ${result.outputFilePath}`);
      }
      return this.readDataFile(result.outputFilePath);
    }

    // 获取版本信息
    const version = this.db
      .prepare("SELECT * FROM biz_dataset_version WHERE id = ?")
      .get(result.versionId) as DatasetVersion;
    if (!version) throw new Error("Original version not found");

    // 读取原始数据
    const data = await this.readDataFile(version.file_path);

    // 从列统计中读取插补点并应用
    const columnStats = this.getColumnStats(resultId);
    for (const stat of columnStats) {
      if (stat.imputedRowIndices && stat.imputedValues) {
        for (let i = 0; i < stat.imputedRowIndices.length; i++) {
          const rowIdx = stat.imputedRowIndices[i];
          if (data[rowIdx] !== undefined) {
            data[rowIdx][stat.columnName] = stat.imputedValues[i];
          }
        }
      }
    }

    return data;
  }

  /**
   * 应用插补结果为新版本
   */
  async applyVersion(resultId: number, remark?: string): Promise<DatasetVersion> {
    const result = this.getResult(resultId);
    if (!result) throw new Error("Result not found");

    // 1. 重构数据
    const data = await this.reconstructData(resultId);

    // 2. 生成新文件路径
    const version = this.db
      .prepare("SELECT * FROM biz_dataset_version WHERE id = ?")
      .get(result.versionId) as DatasetVersion;
    if (!version) throw new Error("Original version not found");

    const dir = path.dirname(version.file_path);
    const ext = path.extname(version.file_path);
    const name = path.basename(version.file_path, ext);
    // 避免文件名冲突，使用时间戳或UUID，这里简单用 resultId
    const newFileName = `${name}_imputed_${resultId}_${Date.now()}${ext}`;
    const newFilePath = path.join(dir, newFileName);

    // 3. 写入文件
    const csv = Papa.unparse(data);
    fs.writeFileSync(newFilePath, csv, "utf-8");

    // 4. 创建新版本记录
    const stmt = this.db.prepare(`
      INSERT INTO biz_dataset_version (
          dataset_id, parent_version_id, stage_type, 
          file_path, created_at, remark
      ) VALUES (
          @dataset_id, @parent_version_id, @stage_type,
          @file_path, @created_at, @remark
      )
    `);

    const now = new Date().toISOString();
    const info = stmt.run({
      dataset_id: result.datasetId,
      parent_version_id: result.versionId,
      stage_type: "QC",
      file_path: newFilePath,
      created_at: now,
      remark: remark || `插补处理 (${result.methodId})`,
    });

    const newVersionId = Number(info.lastInsertRowid);

    // 5. 创建统计详情记录
    const statStmt = this.db.prepare(`
      INSERT INTO stat_version_detail (
        version_id, total_rows, total_cols, created_at
      ) VALUES (
        @version_id, @total_rows, @total_cols, @created_at
      )
    `);

    // 计算总列数
    const totalCols = data.length > 0 ? Object.keys(data[0]).length : 0;

    statStmt.run({
      version_id: newVersionId,
      total_rows: data.length,
      total_cols: totalCols,
      created_at: now,
    });

    // 6. 更新结果关联
    this.repository.updateResultNewVersion(resultId, newVersionId);

    return this.db.prepare("SELECT * FROM biz_dataset_version WHERE id = ?").get(newVersionId) as DatasetVersion;
  }

  /**
   * 导出插补结果为文件
   */
  async exportFile(resultId: number, targetPath?: string): Promise<string> {
    const data = await this.reconstructData(resultId);
    const csv = Papa.unparse(data);

    // 如果没有提供路径，则返回 CSV 内容（或者这里假设由 Controller 处理路径选择）
    // 这里我们假设 Controller 已经处理了路径选择，或者我们返回内容供 Controller 处理
    // 但 Service 层通常不处理 UI 交互。
    // 如果 targetPath 存在，则写入。

    if (targetPath) {
      fs.writeFileSync(targetPath, csv, "utf-8");
      return targetPath;
    }

    return csv; // Return CSV content if no path (allow Controller to handle)
  }

  // ==================== 模型管理 ====================

  /**
   * 创建插补模型记录
   */
  createModel(params: {
    datasetId?: number;
    methodId: string;
    modelName?: string;
    modelPath: string;
    modelParams?: Record<string, any>;
    targetColumn?: string;
    featureColumns?: string[];
    timeColumn?: string;
    trainingColumns?: string[];
    trainingSamples?: number;
    validationScore?: number;
  }): number {
    return this.repository.createModel(params);
  }

  /**
   * 获取数据集的所有模型
   */
  getModelsByDataset(datasetId: number, methodId?: string): ImputationModel[] {
    const rows = this.repository.getModelsByDataset(datasetId, methodId);
    return rows.map(this.mapModelRow);
  }

  /**
   * 获取模型详情
   */
  getModel(modelId: number): ImputationModel | null {
    const row = this.repository.getModelById(modelId);
    return row ? this.mapModelRow(row) : null;
  }

  /**
   * 设置活跃模型
   */
  setActiveModel(modelId: number): void {
    this.repository.setActiveModel(modelId);
  }

  /**
   * 更新模型信息
   */
  updateModel(
    modelId: number,
    params: {
      modelName?: string;
      modelPath?: string;
      modelParams?: Record<string, any>;
      targetColumn?: string;
      featureColumns?: string[];
      timeColumn?: string;
      columnMapping?: Record<string, string>;
      validationScore?: number;
    }
  ): void {
    this.repository.updateModel(modelId, params);
  }

  /**
   * 删除模型
   */
  deleteModel(modelId: number): void {
    this.repository.deleteModel(modelId);
  }

  // ==================== 自定义模型管理 ====================

  /**
   * 注册自定义模型
   * 1. 生成 CUSTOM_xxx methodId
   * 2. 插入 conf_imputation_method（category='custom'）
   * 3. 插入方法参数 conf_imputation_method_params
   * 4. 插入模型记录 biz_imputation_model
   */
  registerCustomModel(config: CustomModelConfig): {
    methodId: ImputationMethodId;
    modelId: number;
  } {
    // 生成唯一 methodId
    const timestamp = Date.now();
    const methodId = `CUSTOM_${timestamp}` as ImputationMethodId;

    // 1. 注册方法
    this.repository.createMethod({
      methodId,
      methodName: config.modelName,
      category: "custom",
      description: config.description,
      estimatedTime: config.estimatedTime || "medium",
      accuracy: config.accuracy || "medium",
      priority: 50,
    });

    // 2. 注册内置参数（model_path、inference_script、framework 等固定参数）
    const builtinParams = [
      {
        paramKey: "model_path",
        paramName: "模型文件路径",
        paramType: "string",
        defaultValue: config.modelFilePath,
        isRequired: true,
        isAdvanced: false,
        paramOrder: 0,
      },
      {
        paramKey: "inference_script",
        paramName: "推理脚本路径",
        paramType: "string",
        defaultValue: config.inferenceScriptPath,
        isRequired: true,
        isAdvanced: false,
        paramOrder: 1,
      },
      {
        paramKey: "framework",
        paramName: "模型框架",
        paramType: "string",
        defaultValue: config.framework,
        isRequired: true,
        isAdvanced: false,
        paramOrder: 2,
      },
    ];

    // 3. 注册用户自定义参数
    const userParams = (config.params || []).map((p, idx) => ({
      paramKey: p.paramKey,
      paramName: p.paramName,
      paramType: p.paramType,
      defaultValue: p.defaultValue,
      minValue: p.minValue,
      maxValue: p.maxValue,
      stepValue: p.stepValue,
      options: p.options ? JSON.stringify(p.options) : undefined,
      tooltip: p.tooltip,
      isRequired: p.isRequired,
      isAdvanced: p.isAdvanced,
      paramOrder: idx + builtinParams.length,
    }));

    this.repository.createMethodParams(methodId, [...builtinParams, ...userParams] as any);

    // 4. 创建模型记录（通用模型，dataset_id = null）
    const modelId = this.repository.createModel({
      methodId,
      modelName: config.modelName,
      modelPath: config.modelFilePath,
      modelParams: {
        inferenceScriptPath: config.inferenceScriptPath,
        framework: config.framework,
        seqLen: config.seqLen,
      },
      targetColumn: config.targetColumn,
      featureColumns: config.featureColumns,
      timeColumn: config.timeColumn,
    });

    // 设置为活跃模型
    this.repository.setActiveModel(modelId);

    return { methodId, modelId };
  }

  /**
   * 获取所有自定义模型方法（及其参数和关联模型）
   */
  getCustomModels(): Array<{
    method: ImputationMethod;
    params: ImputationMethodParam[];
    models: ImputationModel[];
  }> {
    const methodRows = this.repository.getCustomMethods();
    return methodRows.map(row => {
      const method = this.mapMethodRow(row);
      const paramRows = this.repository.getMethodParams(row.method_id);
      const params = paramRows.map(p => this.mapMethodParamRow(p));
      const modelRows = this.repository.getModelsByMethodId(row.method_id);
      const models = modelRows.map(m => this.mapModelRow(m));
      return { method, params, models };
    });
  }

  /**
   * 删除自定义模型（软删除方法+参数+模型）
   */
  deleteCustomModel(methodId: string): void {
    // 验证是自定义模型
    if (!methodId.startsWith("CUSTOM_")) {
      throw new Error("只能删除自定义模型");
    }
    this.repository.deleteCustomMethod(methodId);
  }

  /**
   * 验证模型文件是否存在且可访问
   */
  validateModelFile(filePath: string): { valid: boolean; error?: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: "文件不存在" };
      }
      fs.accessSync(filePath, fs.constants.R_OK);
      const ext = path.extname(filePath).toLowerCase();
      const supportedExts = [".pt", ".pth", ".onnx", ".pkl", ".joblib", ".pypots", ".h5"];
      if (!supportedExts.includes(ext)) {
        return { valid: false, error: `不支持的文件格式: ${ext}，支持: ${supportedExts.join(", ")}` };
      }
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * 验证推理脚本文件是否存在且可访问
   */
  validateScriptFile(filePath: string): { valid: boolean; error?: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: "文件不存在" };
      }
      fs.accessSync(filePath, fs.constants.R_OK);
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== ".py") {
        return { valid: false, error: `推理脚本必须是 .py 文件，当前: ${ext}` };
      }
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  // ==================== 映射方法 ====================

  private mapModelRow(row: any): ImputationModel {
    return {
      id: row.id,
      datasetId: row.dataset_id || undefined,
      methodId: row.method_id as ImputationMethodId,
      modelName: row.model_name || undefined,
      modelPath: row.model_path || undefined,
      modelParams: row.model_params ? JSON.parse(row.model_params) : undefined,
      targetColumn: row.target_column || undefined,
      featureColumns: row.feature_columns ? JSON.parse(row.feature_columns) : undefined,
      timeColumn: row.time_column || "record_time",
      columnMapping: row.column_mapping ? JSON.parse(row.column_mapping) : undefined,
      trainingColumns: row.training_columns ? JSON.parse(row.training_columns) : undefined,
      trainingSamples: row.training_samples || undefined,
      validationScore: row.validation_score || undefined,
      isActive: row.is_active === 1,
      trainedAt: row.trained_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapMethodRow(row: ImputationMethodRow): ImputationMethod {
    return {
      id: row.id,
      methodId: row.method_id as ImputationMethodId,
      methodName: row.method_name,
      category: row.category as ImputationCategory,
      description: row.description || "",
      requiresPython: row.requires_python === 1,
      isAvailable: row.is_available === 1,
      estimatedTime: row.estimated_time as any,
      accuracy: row.accuracy as any,
      priority: row.priority,
      applicableDataTypes: row.applicable_data_types ? JSON.parse(row.applicable_data_types) : [],
      icon: row.icon || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapMethodParamRow(row: ImputationMethodParamRow): ImputationMethodParam {
    return {
      id: row.id,
      methodId: row.method_id as ImputationMethodId,
      paramKey: row.param_key,
      paramName: row.param_name,
      paramType: row.param_type as any,
      defaultValue: row.default_value,
      minValue: row.min_value || undefined,
      maxValue: row.max_value || undefined,
      stepValue: row.step_value || undefined,
      options: row.options,
      tooltip: row.tooltip || undefined,
      isRequired: row.is_required === 1,
      isAdvanced: row.is_advanced === 1,
      paramOrder: row.param_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapResultRow(row: ImputationResultRow): ImputationResult {
    return {
      id: row.id,
      datasetId: row.dataset_id,
      versionId: row.version_id,
      newVersionId: row.new_version_id || undefined,
      methodId: row.method_id as ImputationMethodId,
      name: row.name || undefined,
      targetColumns: JSON.parse(row.target_columns),
      methodParams: row.method_params ? JSON.parse(row.method_params) : undefined,
      outputFilePath: row.output_file_path || undefined,
      totalMissing: row.total_missing,
      imputedCount: row.imputed_count,
      imputationRate: row.imputation_rate,
      executionTimeMs: row.execution_time_ms || undefined,
      status: row.status as any,
      errorMessage: row.error_message || undefined,
      executedAt: row.executed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
