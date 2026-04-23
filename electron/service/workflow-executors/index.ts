/**
 * 工作流节点执行器
 *
 * 每个执行器封装对已有 Service 的调用，将其适配为统一的 INodeExecutor 接口。
 * 当前为基础实现，后续根据各 Service 的实际 API 逐步完善。
 */

import type { INodeExecutor } from "../WorkflowService";
import type {
  WorkflowNodeType,
  NodeExecutionContext,
  NodeExecutionResult,
  BEONQCPipelineNodeConfig,
  BEONDataType,
} from "@shared/types/workflow";
import * as path from "path";
import * as os from "os";

// ==================== 异常检测执行器 ====================

export class OutlierDetectionExecutor implements INodeExecutor {
  readonly nodeType: WorkflowNodeType = "OUTLIER_DETECTION";

  constructor(private outlierService: any) {}

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.config;
    const method = config.method || "THRESHOLD_STATIC";
    const startTime = Date.now();

    ctx.onProgress(10, "正在准备异常检测...");

    // 阈值过滤：如果指定了模板，先应用模板
    if (method === "THRESHOLD_STATIC" && config.templateKey) {
      ctx.onProgress(15, "正在应用阈值模板...");
      try {
        const templateKey: string = config.templateKey;
        if (templateKey.startsWith("builtin:")) {
          const templateName = templateKey.replace("builtin:", "");
          const templatesResult = this.outlierService.getFluxThresholdTemplates();
          if (templatesResult.success) {
            const template = templatesResult.data[templateName];
            if (template) {
              this.outlierService.applyThresholdTemplate(ctx.datasetId, template);
            }
          }
        } else if (templateKey.startsWith("user:")) {
          const templateId = parseInt(templateKey.replace("user:", ""));
          if (!isNaN(templateId)) {
            this.outlierService.applyUserTemplate(ctx.datasetId, templateId);
          }
        }
      } catch (error: any) {
        // 模板应用失败不阻断，继续使用现有阈值配置
        console.warn("应用阈值模板失败:", error.message);
      }
    }

    ctx.onProgress(30, "\u6b63\u5728\u6267\u884c\u5f02\u5e38\u68c0\u6d4b...");

    let detectionResult: any;
    try {
      const result = this.outlierService.executeDetection(
        ctx.datasetId,
        ctx.inputVersionId,
        method,
        config.params || {},
        config.columnNames || undefined
      );
      if (!result.success) {
        // 如果是"没有配置阈值的列"，模板匹配了 0 列，跳过检测而不是错误
        const isNoThresholdError =
          result.error?.includes("\u6ca1\u6709\u914d\u7f6e\u9608\u503c\u7684\u5217") ||
          result.error?.includes("\u6ca1\u6709\u53ef\u68c0\u6d4b\u7684\u5217");
        if (method === "THRESHOLD_STATIC" && isNoThresholdError) {
          console.warn(
            `[OutlierDetection] \u6a21\u677f\u5173\u952e\u5b57\u672a\u5339\u914d\u4efb\u4f55\u5217\u540d\uff0c\u8df3\u8fc7\u9608\u503c\u68c0\u6d4b\u3002` +
              `\u60a8\u53ef\u5728\u6570\u636e\u96c6\u8bbe\u7f6e\u9875\u624b\u52a8\u914d\u7f6e\u5217\u9608\u503c\uff0c\u6216\u4f7f\u7528\u81ea\u5b9a\u4e49\u6a21\u677f\u3002`
          );
          ctx.onProgress(
            100,
            "\u9608\u503c\u68c0\u6d4b\u8df3\u8fc7\uff08\u6a21\u677f\u672a\u5339\u914d\u4efb\u4f55\u5217\uff0c\u8bf7\u68c0\u67e5\u5217\u540d\u914d\u7f6e\uff09"
          );
          return {
            outputVersionId: null,
            resultData: {
              businessResultId: null,
              businessResultTable: "biz_outlier_result",
              executionTimeMs: Date.now() - startTime,
              skipped: true,
              skipReason: result.error,
            },
          };
        }
        throw new Error(result.error || "\u5f02\u5e38\u68c0\u6d4b\u5931\u8d25");
      }
      detectionResult = result.data;
    } catch (error: any) {
      throw new Error(`\u5f02\u5e38\u68c0\u6d4b\u5931\u8d25: ${error.message}`);
    }

    ctx.onProgress(100, `异常检测完成，检出 ${detectionResult?.summary?.outlierCount ?? 0} 个异常值`);

    return {
      outputVersionId: null,
      resultData: {
        businessResultId: detectionResult?.resultId,
        businessResultTable: "biz_outlier_result",
        executionTimeMs: Date.now() - startTime,
        summary: detectionResult?.summary,
      },
    };
  }
}

// ==================== 缺失值插补执行器 ====================

export class ImputationExecutor implements INodeExecutor {
  readonly nodeType: WorkflowNodeType = "IMPUTATION";

  constructor(private imputationService: any) {}

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.config;
    const startTime = Date.now();

    ctx.onProgress(10, "正在准备插补...");

    // 调用 ImputationService.executeImputation(request, progressCallback)
    // request: { datasetId, versionId, methodId, targetColumns, params?, validateSplit? }
    let result: any;
    try {
      result = await this.imputationService.executeImputation(
        {
          datasetId: ctx.datasetId,
          versionId: ctx.inputVersionId,
          methodId: config.methodId,
          targetColumns: config.targetColumns || null,
          params: config.params || {},
          validateSplit: config.validateSplit,
        },
        (progress: any) => {
          // 将插补进度映射到 10-90 区间
          const mapped = 10 + Math.round((progress.progress || 0) * 0.8);
          ctx.onProgress(mapped, progress.message || "正在插补...");
        }
      );
    } catch (error: any) {
      throw new Error(`缺失值插补失败: ${error.message}`);
    }

    if (!result.success) {
      throw new Error(result.error || "插补执行失败");
    }

    ctx.onProgress(100, "插补完成");

    return {
      outputVersionId: null,
      resultData: {
        businessResultId: result.resultId,
        businessResultTable: "biz_imputation_result",
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}

// ==================== 通量分割执行器 ====================

export class FluxPartitioningExecutor implements INodeExecutor {
  readonly nodeType: WorkflowNodeType = "FLUX_PARTITIONING";

  constructor(private fluxService: any) {}

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.config;
    const startTime = Date.now();

    ctx.onProgress(5, "正在准备通量分割...");

    // 调用 FluxPartitioningService
    let result: any;
    try {
      result = await this.fluxService.executePartitioning({
        datasetId: ctx.datasetId,
        versionId: ctx.inputVersionId,
        methodId: config.methodId,
        columnMapping: config.columnMapping,
        siteInfo: config.siteInfo,
        options: config.options,
      });
    } catch (error: any) {
      throw new Error(`通量分割失败: ${error.message}`);
    }

    ctx.onProgress(100, "通量分割完成");

    return {
      outputVersionId: result?.newVersionId || null,
      resultData: {
        businessResultId: result?.resultId,
        businessResultTable: "biz_flux_partitioning_result",
        method: config.methodId,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}

// ==================== 数据导出执行器 ====================

export class ExportExecutor implements INodeExecutor {
  readonly nodeType: WorkflowNodeType = "EXPORT";

  constructor(private exportService: any) {}

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.config;

    ctx.onProgress(10, "正在准备导出...");

    // ExportService.executeExport(options: ExportOptions, filePath: string)
    // ExportOptions: { versionId, selectedColumns, format, delimiter, missingValueOutput, includeHeader, defaultFileName? }
    // 工作流中 outputPath 由用户在 config 中指定
    const outputPath = config.outputPath;
    if (!outputPath) {
      throw new Error("导出路径 outputPath 未配置");
    }

    let result: any;
    try {
      result = await this.exportService.executeExport(
        {
          versionId: ctx.inputVersionId,
          selectedColumns: config.selectedColumns || [],
          format: config.format || "csv",
          delimiter: config.delimiter || ",",
          missingValueOutput: config.missingValueOutput || "",
          includeHeader: config.includeHeader !== false,
        },
        outputPath
      );
      if (!result.success) {
        throw new Error(result.error || "导出失败");
      }
    } catch (error: any) {
      throw new Error(`数据导出失败: ${error.message}`);
    }

    ctx.onProgress(100, "数据导出完成");

    // 不产生新版本
    return {
      outputVersionId: null,
      resultData: {
        filePath: outputPath,
        rowCount: result.data?.rowCount,
      },
    };
  }
}

export class BEONQCPipelineExecutor implements INodeExecutor {
  readonly nodeType: WorkflowNodeType = "BEON_QC_PIPELINE";

  constructor(
    private pythonBridge: any,
    private mysqlService: any,
    private datasetService: any
  ) {}

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config: BEONQCPipelineNodeConfig = ctx.config;

    if (!this.pythonBridge) {
      throw new Error("PythonBridgeService 未初始化");
    }
    if (!this.mysqlService) {
      throw new Error("MySQLService 未初始化");
    }
    if (!this.datasetService) {
      throw new Error("DatasetService 未初始化");
    }

    const dataTypes: BEONDataType[] = config.dataTypes?.length ? config.dataTypes : ["flux", "sapflow", "aqi", "nai"];
    const processedTypes: BEONDataType[] = [];
    const results: Partial<Record<BEONDataType, Record<string, any>>> = {};
    const totalTypes = dataTypes.length;

    const connectionProfile = this.mysqlService.getConnectionProfileById(config.connectionProfileId);
    if (!connectionProfile) {
      throw new Error(`MySQL 连接配置不存在: ${config.connectionProfileId}`);
    }

    const connection = {
      host: connectionProfile.host,
      port: connectionProfile.port,
      user: connectionProfile.user,
      password: connectionProfile.password,
      database: connectionProfile.database,
    };

    const tableNameMap: Record<BEONDataType, string | undefined> = {
      flux: config.fluxTableName,
      sapflow: config.sapflowTableName,
      aqi: config.aqiTableName,
      nai: config.naiTableName,
    };

    const fluxColumnMapping = {
      co2FluxCol: config.fluxColumnMapping?.co2FluxCol || "co2_flux",
      h2oFluxCol: config.fluxColumnMapping?.h2oFluxCol,
      leCol: config.fluxColumnMapping?.leCol,
      hCol: config.fluxColumnMapping?.hCol,
      qcCo2FluxCol: config.fluxColumnMapping?.qcCo2FluxCol,
      qcH2oFluxCol: config.fluxColumnMapping?.qcH2oFluxCol,
      qcLeCol: config.fluxColumnMapping?.qcLeCol,
      qcHCol: config.fluxColumnMapping?.qcHCol,
      ppfdCol: config.fluxColumnMapping?.ppfdCol || "ppfd",
      rgRawCol: config.fluxColumnMapping?.rgRawCol || "rg_raw",
      tairRawCol: config.fluxColumnMapping?.tairRawCol || "tair_raw",
      rhRawCol: config.fluxColumnMapping?.rhRawCol || "rh_raw",
      vpdRawCol: config.fluxColumnMapping?.vpdRawCol,
      ustarRawCol: config.fluxColumnMapping?.ustarRawCol || "ustar_raw",
      co2StrgCol: config.fluxColumnMapping?.co2StrgCol,
      h2oStrgCol: config.fluxColumnMapping?.h2oStrgCol,
      leStrgCol: config.fluxColumnMapping?.leStrgCol,
      hStrgCol: config.fluxColumnMapping?.hStrgCol,
      shortUpCol: config.fluxColumnMapping?.shortUpCol,
      rh12mCol: config.fluxColumnMapping?.rh12mCol,
      rh10mCol: config.fluxColumnMapping?.rh10mCol,
      ta12mCol: config.fluxColumnMapping?.ta12mCol,
    };

    let fluxDrivingFile = "";

    const mapProgress = (index: number, progress: number) => {
      const base = Math.floor((index / totalTypes) * 100);
      const next = Math.floor(((index + 1) / totalTypes) * 100);
      return Math.min(next, base + Math.round(((progress || 0) / 100) * Math.max(next - base, 1)));
    };

    const importInputFile = async (dataType: BEONDataType) => {
      const tableName = tableNameMap[dataType];
      if (!tableName) {
        throw new Error(`${dataType} 数据表未配置`);
      }

      const importResult = await this.mysqlService.importTableByTimeRange(
        connection,
        tableName,
        config.startTime,
        config.endTime
      );

      if (!importResult.success || !importResult.data) {
        throw new Error(importResult.error || `${dataType} 数据导入失败`);
      }

      return importResult.data;
    };

    const ensureFluxDrivingFile = async () => {
      if (fluxDrivingFile) {
        return fluxDrivingFile;
      }

      const fluxImport = await importInputFile("flux");
      fluxDrivingFile = fluxImport.csvPath;
      return fluxDrivingFile;
    };

    for (let index = 0; index < dataTypes.length; index++) {
      const dataType = dataTypes[index];
      ctx.onProgress(mapProgress(index, 0), `正在准备 ${dataType} 数据...`);

      const imported = await importInputFile(dataType);
      const inputFile = imported.csvPath;
      const outputFile = path.join(os.tmpdir(), `beon_qc_${dataType}_${Date.now()}.csv`);

      if (dataType === "flux") {
        ctx.onProgress(mapProgress(index, 8), "正在执行 flux QC 管线...");
        const result = await this.pythonBridge.runBEONREddyProcImputation(
          {
            inputFile,
            outputFile,
            latDeg: config.latitude,
            longDeg: config.longitude,
            timezoneHour: config.timezone,
            siteCode: config.siteCode,
            allowedQcFlags: config.qcFlagList?.length ? config.qcFlagList.join(",") : "0,1,2",
            useStrg: config.useStrg,
            despikingZ: config.despikingZ,
            co2FluxCol: fluxColumnMapping.co2FluxCol,
            h2oFluxCol: fluxColumnMapping.h2oFluxCol,
            leCol: fluxColumnMapping.leCol,
            hCol: fluxColumnMapping.hCol,
            qcCo2FluxCol: fluxColumnMapping.qcCo2FluxCol,
            qcH2oFluxCol: fluxColumnMapping.qcH2oFluxCol,
            qcLeCol: fluxColumnMapping.qcLeCol,
            qcHCol: fluxColumnMapping.qcHCol,
            ppfdCol: fluxColumnMapping.ppfdCol,
            rgRawCol: fluxColumnMapping.rgRawCol,
            tairRawCol: fluxColumnMapping.tairRawCol,
            rhRawCol: fluxColumnMapping.rhRawCol,
            vpdRawCol: fluxColumnMapping.vpdRawCol,
            ustarRawCol: fluxColumnMapping.ustarRawCol,
            co2StrgCol: fluxColumnMapping.co2StrgCol,
            h2oStrgCol: fluxColumnMapping.h2oStrgCol,
            leStrgCol: fluxColumnMapping.leStrgCol,
            hStrgCol: fluxColumnMapping.hStrgCol,
            shortUpCol: fluxColumnMapping.shortUpCol,
            rh12mCol: fluxColumnMapping.rh12mCol,
            rh10mCol: fluxColumnMapping.rh10mCol,
            ta12mCol: fluxColumnMapping.ta12mCol,
            thresholdsJson: config.thresholdsJson,
            localRulesJson: config.localRulesJson,
            fillAll: true,
          },
          (progress: { progress: number; message: string }) => {
            ctx.onProgress(mapProgress(index, progress.progress), `[flux] ${progress.message}`);
          }
        );

        if (!result.success) {
          throw new Error(result.error || "flux 管线执行失败");
        }

        fluxDrivingFile = outputFile;
        processedTypes.push(dataType);
        results[dataType] = {
          inputFile,
          outputFile,
          rowCount: imported.rowCount,
          result: result.data,
        };
      } else {
        const drivingFluxInputFile = await ensureFluxDrivingFile();
        ctx.onProgress(mapProgress(index, 8), `正在执行 ${dataType} QC 管线...`);
        const result = await this.pythonBridge.runBEONNonFluxPipeline(
          {
            inputFile,
            outputFile,
            fluxInputFile: drivingFluxInputFile,
            dataType,
            latDeg: config.latitude,
            longDeg: config.longitude,
            timezoneHour: config.timezone,
            siteCode: config.siteCode,
            thresholdsJson: config.thresholdsJson,
            gapfillIndicators: config.gapfillIndicators?.join(","),
            sapflowStdWindow: config.sapflowStdWindow,
            sapflowStdStep: config.sapflowStdStep,
          },
          (progress: { progress: number; message: string }) => {
            ctx.onProgress(mapProgress(index, progress.progress), `[${dataType}] ${progress.message}`);
          }
        );

        if (!result.success) {
          throw new Error(result.error || `${dataType} 管线执行失败`);
        }

        processedTypes.push(dataType);
        results[dataType] = {
          inputFile,
          outputFile,
          fluxInputFile: drivingFluxInputFile,
          rowCount: imported.rowCount,
          result: result.data,
        };
      }

      ctx.onProgress(mapProgress(index, 100), `${dataType} 处理完成`);
    }

    return {
      outputVersionId: null,
      resultData: {
        processedTypes,
        results,
      },
    };
  }
}
