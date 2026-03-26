import { FluxPartitioningRepository } from '../repository/FluxPartitioningRepository';
import { DatabaseManager } from '../core/DatabaseManager';
import { PythonBridgeService } from './PythonBridgeService';
import type {
  FluxPartitioningResult,
  FluxPartitioningResultRow,
  FluxPartitioningProgressEvent,
  ExecuteFluxPartitioningRequest,
  ExecuteFluxPartitioningResponse,
  FluxPartitioningColumnStats,
} from '@shared/types/fluxPartitioning';
import type { DatasetVersion } from '@shared/types/database';
import * as fs from 'fs';
import * as path from 'path';
import * as Papa from 'papaparse';

type ProgressCallback = (event: FluxPartitioningProgressEvent) => void;

const METHOD_NAMES: Record<string, string> = {
  'NIGHTTIME_REICHSTEIN': '夜间法 (Reichstein et al. 2005)',
  'DAYTIME_LASSLOP': '白天法 (Lasslop et al. 2010)',
};

export class FluxPartitioningService {
  private repository: FluxPartitioningRepository;
  private db = DatabaseManager.getInstance().getDatabase();
  private progressCallbacks: Map<number, ProgressCallback> = new Map();

  constructor() {
    this.repository = new FluxPartitioningRepository();
  }

  // ==================== 执行分割 ====================

  /**
   * 执行通量分割
   */
  async executePartitioning(
    request: ExecuteFluxPartitioningRequest,
    progressCallback?: ProgressCallback
  ): Promise<ExecuteFluxPartitioningResponse> {
    const startTime = Date.now();

    // 获取版本信息
    const version = this.db
      .prepare('SELECT * FROM biz_dataset_version WHERE id = ?')
      .get(request.versionId) as DatasetVersion | undefined;
    if (!version) {
      throw new Error(`版本不存在: ${request.versionId}`);
    }

    // 获取时间列
    const dataset = this.db
      .prepare('SELECT time_column FROM sys_dataset WHERE id = ?')
      .get(request.datasetId) as { time_column?: string } | undefined;
    const timeColumn = dataset?.time_column || 'TIMESTAMP';

    // 确定方法名称和R方法参数
    const methodName = METHOD_NAMES[request.methodId] || request.methodId;
    const rMethod = request.methodId === 'NIGHTTIME_REICHSTEIN' ? 'nighttime' : 'daytime';

    // 创建结果记录
    const resultId = this.repository.createResult({
      datasetId: request.datasetId,
      versionId: request.versionId,
      methodId: request.methodId,
      methodName: methodName,
      columnMapping: request.columnMapping,
      siteInfo: request.siteInfo,
      options: request.options,
    });

    if (progressCallback) {
      this.progressCallbacks.set(resultId, progressCallback);
    }

    try {
      // 更新状态为运行中
      this.repository.updateResultStatus(resultId, 'RUNNING');
      this.emitProgress(resultId, {
        resultId,
        stage: 'preparing',
        progress: 0,
        message: '正在准备数据...',
      });

      // 检查 Python/R 环境
      const pythonBridge = PythonBridgeService.getInstance();
      this.emitProgress(resultId, {
        resultId,
        stage: 'checking',
        progress: 5,
        message: '正在检查 Python/R 环境...',
      });

      const pythonStatus = await pythonBridge.detectPython();
      if (!pythonStatus.available) {
        throw new Error('Python 环境未找到。通量分割需要: Python 3.8+, R 4.0+, rpy2, REddyProc R包');
      }

      // 验证必需参数
      const { columnMapping, siteInfo } = request;
      if (!columnMapping.neeCol || !columnMapping.rgCol || !columnMapping.tairCol || !columnMapping.vpdCol) {
        throw new Error('缺少必需的列映射 (NEE, Rg, Tair, VPD)');
      }
      if (siteInfo.latDeg === undefined || siteInfo.longDeg === undefined || siteInfo.timezoneHour === undefined) {
        throw new Error('缺少站点位置信息 (纬度、经度、时区)');
      }

      // 创建临时输入输出文件
      const tempDir = path.dirname(version.file_path);
      const tempInputFile = path.join(tempDir, `temp_partition_input_${resultId}.csv`);
      const tempOutputFile = path.join(tempDir, `temp_partition_output_${resultId}.csv`);

      try {
        // 读取数据并写入临时文件
        this.emitProgress(resultId, {
          resultId,
          stage: 'loading',
          progress: 10,
          message: '正在加载数据...',
        });

        const data = await this.readDataFile(version.file_path);
        if (!data || data.length === 0) {
          throw new Error('数据为空');
        }

        const csvContent = Papa.unparse(data);
        fs.writeFileSync(tempInputFile, csvContent, 'utf-8');

        // 调用 Python/R 脚本执行分割
        this.emitProgress(resultId, {
          resultId,
          stage: 'partitioning',
          progress: 20,
          message: '正在执行通量分割...',
        });

        const result = await pythonBridge.runREddyProcPartitioning({
          inputFile: tempInputFile,
          outputFile: tempOutputFile,
          method: rMethod,
          timeColumn: timeColumn,
          latDeg: siteInfo.latDeg,
          longDeg: siteInfo.longDeg,
          timezoneHour: siteInfo.timezoneHour,
          neeCol: columnMapping.neeCol,
          rgCol: columnMapping.rgCol,
          tairCol: columnMapping.tairCol,
          vpdCol: columnMapping.vpdCol,
          rhCol: columnMapping.rhCol || '',
          ustarCol: columnMapping.ustarCol || '',
          ustarFiltering: request.options?.ustarFiltering || false,
        }, (pythonProgress) => {
          const adjustedProgress = 20 + (pythonProgress.progress / 100) * 60;
          this.emitProgress(resultId, {
            resultId,
            stage: pythonProgress.stage as any,
            progress: adjustedProgress,
            message: pythonProgress.message,
          });
        });

        if (!result.success) {
          throw new Error(`REddyProc 通量分割失败: ${result.error}`);
        }

        // 读取输出文件并解析
        if (!fs.existsSync(tempOutputFile)) {
          throw new Error('分割结果文件未生成');
        }

        // 解析Python脚本输出中的JSON结果
        let outputColumns: string[] = [];
        let gppStats: FluxPartitioningColumnStats | undefined;
        let recoStats: FluxPartitioningColumnStats | undefined;

        if (result.stdout) {
          const jsonMatch = result.stdout.match(/__RESULT_JSON__:(.*)/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              outputColumns = parsed.outputColumns || [];
              if (parsed.stats?.GPP) {
                gppStats = parsed.stats.GPP;
              }
              if (parsed.stats?.Reco) {
                recoStats = parsed.stats.Reco;
              }
            } catch {
              // JSON解析失败，忽略
            }
          }
        }

        // 将分割结果作为新版本保存
        this.emitProgress(resultId, {
          resultId,
          stage: 'saving',
          progress: 85,
          message: '正在保存分割结果为新版本...',
        });

        const outputData = await this.readDataFile(tempOutputFile);
        const newVersionId = await this.createNewVersion(
          request.datasetId,
          request.versionId,
          version.file_path,
          outputData,
          `通量分割: ${methodName}`
        );

        // 更新结果记录
        const executionTimeMs = Date.now() - startTime;
        this.repository.updateResultOutput(resultId, {
          outputColumns,
          gppStats: gppStats as any,
          recoStats: recoStats as any,
          executionTimeMs,
          newVersionId,
        });

        this.repository.updateResultStatus(resultId, 'COMPLETED');
        this.emitProgress(resultId, {
          resultId,
          stage: 'completed',
          progress: 100,
          message: '通量分割完成',
        });

        return {
          success: true,
          resultId,
          message: `通量分割完成 (${methodName})`,
        };
      } finally {
        // 清理临时文件
        if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
        if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
      }
    } catch (error: any) {
      this.repository.updateResultStatus(resultId, 'FAILED', error.message);
      return {
        success: false,
        resultId,
        error: error.message,
      };
    } finally {
      this.progressCallbacks.delete(resultId);
    }
  }

  // ==================== 结果管理 ====================

  /**
   * 获取数据集的分割结果列表
   */
  getResultsByDataset(datasetId: number, limit = 50, offset = 0): FluxPartitioningResult[] {
    const rows = this.repository.getResultsByDataset(datasetId, limit, offset);
    return rows.map(this.mapResultRow);
  }

  /**
   * 获取分割结果
   */
  getResult(resultId: number): FluxPartitioningResult | null {
    const row = this.repository.getResultById(resultId);
    if (!row) return null;
    return this.mapResultRow(row);
  }

  /**
   * 删除分割结果
   */
  deleteResult(resultId: number): void {
    this.repository.deleteResult(resultId);
  }

  /**
   * 重命名分割结果
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

  // ==================== 内部方法 ====================

  private emitProgress(resultId: number, event: FluxPartitioningProgressEvent): void {
    const callback = this.progressCallbacks.get(resultId);
    if (callback) {
      callback(event);
    }
  }

  private mapResultRow(row: FluxPartitioningResultRow): FluxPartitioningResult {
    return {
      id: row.id,
      datasetId: row.dataset_id,
      versionId: row.version_id,
      newVersionId: row.new_version_id || undefined,
      methodId: row.method_id as any,
      methodName: row.method_name,
      name: row.name || undefined,
      columnMapping: JSON.parse(row.column_mapping),
      siteInfo: JSON.parse(row.site_info),
      options: row.options ? JSON.parse(row.options) : undefined,
      outputColumns: row.output_columns ? JSON.parse(row.output_columns) : [],
      gppStats: row.gpp_stats ? JSON.parse(row.gpp_stats) : undefined,
      recoStats: row.reco_stats ? JSON.parse(row.reco_stats) : undefined,
      executionTimeMs: row.execution_time_ms || undefined,
      status: row.status as any,
      errorMessage: row.error_message || undefined,
      executedAt: row.executed_at,
      createdAt: row.created_at,
    };
  }

  private async readDataFile(filePath: string): Promise<Record<string, any>[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    return result.data as Record<string, any>[];
  }

  /**
   * 创建新的数据版本（包含分割结果列）
   */
  private async createNewVersion(
    datasetId: number,
    parentVersionId: number,
    parentFilePath: string,
    data: Record<string, any>[],
    remark: string
  ): Promise<number> {
    // 生成新版本文件路径
    const dir = path.dirname(parentFilePath);
    const ext = path.extname(parentFilePath);
    const baseName = path.basename(parentFilePath, ext);
    const newFileName = `${baseName}_partitioned_${Date.now()}${ext}`;
    const newFilePath = path.join(dir, newFileName);

    // 保存数据
    const csvContent = Papa.unparse(data);
    fs.writeFileSync(newFilePath, csvContent, 'utf-8');

    // 创建版本记录
    const result = this.db
      .prepare(`
        INSERT INTO biz_dataset_version 
          (dataset_id, parent_version_id, stage_type, file_path, remark)
        VALUES (?, ?, 'QC', ?, ?)
      `)
      .run(datasetId, parentVersionId, newFilePath, remark);

    return result.lastInsertRowid as number;
  }
}
