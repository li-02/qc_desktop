/**
 * 工作流节点执行器
 *
 * 每个执行器封装对已有 Service 的调用，将其适配为统一的 INodeExecutor 接口。
 * 当前为基础实现，后续根据各 Service 的实际 API 逐步完善。
 */

import type { INodeExecutor } from "../WorkflowService";
import type { WorkflowNodeType, NodeExecutionContext, NodeExecutionResult } from "@shared/types/workflow";

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

    ctx.onProgress(30, "正在执行异常检测...");

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
        throw new Error(result.error || "异常检测失败");
      }
      detectionResult = result.data;
    } catch (error: any) {
      throw new Error(`异常检测失败: ${error.message}`);
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

// ==================== 相关性分析执行器 ====================

export class CorrelationAnalysisExecutor implements INodeExecutor {
  readonly nodeType: WorkflowNodeType = "CORRELATION_ANALYSIS";

  constructor(private correlationService: any) {}

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.config;

    ctx.onProgress(10, "正在计算相关性...");

    // 调用 CorrelationAnalysisService.calculateCorrelationMatrix(request)
    // request: { datasetId, versionId?, filePath, columns, method, significanceLevel?, missingValueTypes }
    // 注意: filePath 和 missingValueTypes 需要从上下文或数据集信息获取
    let result: any;
    try {
      result = await this.correlationService.calculateCorrelationMatrix({
        datasetId: ctx.datasetId,
        versionId: ctx.inputVersionId,
        filePath: config.filePath || "",
        columns: config.columns || [],
        method: config.method || "pearson",
        significanceLevel: config.significanceLevel,
        missingValueTypes: config.missingValueTypes || [],
      });
      if (!result.success) {
        throw new Error(result.error || "相关性分析失败");
      }
    } catch (error: any) {
      throw new Error(`相关性分析失败: ${error.message}`);
    }

    ctx.onProgress(100, "相关性分析完成");

    // 不产生新版本
    return {
      outputVersionId: null,
      resultData: {
        method: config.method || "pearson",
        columns: config.columns,
        sampleSize: result.data?.sampleSize,
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
