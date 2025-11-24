import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";
import { DatasetDBRepository } from "../repository/DatasetDBRepository";
import { ProjectDBRepository } from "../repository/ProjectDBRepository";
import {
  DatasetInfo,
  ImportDatasetRequest,
  ServiceResponse,
  DataQualityInfo,
  DatasetVersionInfo,
  VersionStatsInfo
} from "@shared/types/projectInterface";
import { Dataset, DatasetVersion, StatVersionDetail, ColumnSetting } from "@shared/types/database";
import { Worker } from "worker_threads";

export class DatasetService {
  private datasetRepository: DatasetDBRepository;
  private projectRepository: ProjectDBRepository;

  constructor(datasetRepository: DatasetDBRepository, projectRepository: ProjectDBRepository) {
    this.datasetRepository = datasetRepository;
    this.projectRepository = projectRepository;
  }

  async importDataset(request: ImportDatasetRequest): Promise<ServiceResponse<{
      datasetId: string;
      datasetName: string;
      path: string;
    }>> {
    try {
      const validationResult = await this.validateImportRequest(request);
      if (!validationResult.success) {
        throw new Error(validationResult.error);
      }

      const projectId = parseInt(request.projectId);
      if (isNaN(projectId)) throw new Error("无效的项目ID");
      
      const projectResult = this.projectRepository.getProjectById(projectId);
      if (!projectResult.success) {
        throw new Error("项目不存在");
      }

      const datasetsResult = this.datasetRepository.getDatasetsBySiteId(projectId);
      if (datasetsResult.success && datasetsResult.data!.some(d => d.dataset_name === request.datasetName)) {
         throw new Error(`数据集名称 "${request.datasetName}" 已存在`);
      }

      const baseDataDir = path.join(process.cwd(), "data");
      const datasetDir = path.join(baseDataDir, projectId.toString(), request.datasetName);
      if (!fs.existsSync(datasetDir)) {
        fs.mkdirSync(datasetDir, { recursive: true });
      }
      
      const originalExt = path.extname(request.file.name);
      const savedFileName = `original${originalExt}`;
      const savedFilePath = path.join(datasetDir, savedFileName);
      
      fs.copyFileSync(request.file.path, savedFilePath);

      const datasetIdResult = this.datasetRepository.createDataset({
        site_id: projectId,
        dataset_name: request.datasetName,
        source_file_path: savedFilePath,
        description: ""
      });
      
      if (!datasetIdResult.success) {
         throw new Error(datasetIdResult.error);
      }
      const datasetId = datasetIdResult.data!;

      const versionIdResult = this.datasetRepository.createDatasetVersion({
        dataset_id: datasetId,
        parent_version_id: null as any,
        stage_type: 'RAW',
        file_path: savedFilePath,
        remark: 'Initial Import'
      });
      
      if (!versionIdResult.success) {
         throw new Error(versionIdResult.error);
      }
      const versionId = versionIdResult.data!;

      const dataQuality = await this.performFullFileAnalysis(savedFilePath, request.missingValueTypes, originalExt);
      if (dataQuality.success) {
         const dq = dataQuality.data!;
         this.datasetRepository.createStatVersionDetail({
           version_id: versionId,
           total_rows: dq.totalRecords,
           total_cols: request.columns.length,
           total_missing_count: dq.totalMissingCount,
           total_outlier_count: 0,
           column_stats_json: JSON.stringify({
             columnMissingStatus: dq.columnMissingStatus,
             missingValueStats: dq.missingValueStats,
             columnStatistics: dq.columnStatistics
           })
         });
      }

      const columnSettings = request.columns.map((col, index) => ({
        dataset_id: datasetId,
        column_name: col,
        column_index: index,
        is_active: 1,
        data_type: 'text',
        min_threshold: null,
        max_threshold: null
      } as any));
      const saveSettingsResult = this.datasetRepository.saveColumnSettings(columnSettings);
      if (!saveSettingsResult.success) {
         throw new Error(`保存列设置失败: ${saveSettingsResult.error}`);
      }

      return {
        success: true,
        data: {
          datasetId: datasetId.toString(),
          datasetName: request.datasetName,
          path: savedFilePath
        }
      };

    } catch (error: any) {
      return { success: false, error: `导入数据集失败: ${error.message}` };
    }
  }

  async getProjectDatasets(projectId: string): Promise<ServiceResponse<DatasetInfo[]>> {
    try {
      const id = parseInt(projectId);
      if (isNaN(id)) return { success: false, error: "无效的项目ID" };

      const datasetsResult = this.datasetRepository.getDatasetsBySiteId(id);
      if (!datasetsResult.success) return { success: false, error: datasetsResult.error };

      const datasets = datasetsResult.data!;
      const datasetInfos: DatasetInfo[] = [];
      
      for (const d of datasets) {
        datasetInfos.push(await this.mapDatasetToInfo(d));
      }
      
      return { success: true, data: datasetInfos };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getDatasetById(datasetId: string): Promise<ServiceResponse<DatasetInfo>> {
    try {
      const id = parseInt(datasetId);
      if (isNaN(id)) return { success: false, error: "无效的数据集ID" };

      const datasetResult = this.datasetRepository.getDatasetById(id);
      if (!datasetResult.success) return { success: false, error: datasetResult.error };

      const info = await this.mapDatasetToInfo(datasetResult.data!);
      return { success: true, data: info };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getDatasetInfo(projectId: string, datasetId: string): Promise<ServiceResponse<DatasetInfo>> {
    try {
      const pId = parseInt(projectId);
      const dId = parseInt(datasetId);
      if (isNaN(pId) || isNaN(dId)) return { success: false, error: "无效的ID" };

      const datasetResult = this.datasetRepository.getDatasetById(dId);
      if (!datasetResult.success) return { success: false, error: datasetResult.error };
      const dataset = datasetResult.data!;

      const versionsResult = this.datasetRepository.getVersionsByDatasetId(dId);
      const versions = versionsResult.success ? versionsResult.data! : [];

      // Get latest version stats
      let dataQuality: DataQualityInfo | undefined;
      if (versions.length > 0) {
        const latestVersion = versions[0];
        const statResult = this.datasetRepository.getStatByVersionId(latestVersion.id);
        if (statResult.success) {
          const stat = statResult.data!;
          dataQuality = {
            totalRecords: stat.total_rows,
            completeRecords: stat.total_rows - stat.total_missing_count, // Approximate
            missingValueStats: {}, // Need to parse from json if available
            totalMissingCount: stat.total_missing_count,
            qualityPercentage: stat.total_rows > 0 ? ((stat.total_rows * stat.total_cols - stat.total_missing_count) / (stat.total_rows * stat.total_cols)) * 100 : 0,
            analyzedAt: new Date(stat.calculated_at).getTime(),
            columnMissingStatus: {}
          };
          if (stat.column_stats_json) {
             try {
                const colStats = JSON.parse(stat.column_stats_json);
                if (colStats.columnMissingStatus) {
                   dataQuality.missingValueStats = colStats.missingValueStats || {};
                   dataQuality.columnMissingStatus = colStats.columnMissingStatus || {};
                   dataQuality.columnStatistics = colStats.columnStatistics || {};
                } else {
                   // Fallback for old format where it was just the missing status map
                   dataQuality.columnMissingStatus = colStats;
                }
             } catch (e) {}
          }
        }
      }

      const datasetInfo: DatasetInfo = {
        id: dataset.id.toString(),
        name: dataset.dataset_name,
        type: "csv", // Default or store in db
        createdAt: new Date(dataset.import_time).getTime(),
        updatedAt: new Date(dataset.import_time).getTime(),
        belongTo: dataset.site_id.toString(),
        dirPath: path.dirname(dataset.source_file_path || ""),
        missingValueTypes: [], // Store in db?
        originalFile: {
          name: path.basename(dataset.source_file_path || ""),
          filePath: dataset.source_file_path || "",
          size: "0 KB", // Need to check file stats
          rows: dataQuality?.totalRecords || 0,
          columns: this.datasetRepository.getColumnSettings(dId).success ? this.datasetRepository.getColumnSettings(dId).data!.map(c => c.column_name) : [],
          dataQuality: dataQuality || {
            totalRecords: 0,
            completeRecords: 0,
            missingValueStats: {},
            totalMissingCount: 0,
            qualityPercentage: 0,
            analyzedAt: 0,
            columnMissingStatus: {}
          }
        },
        processedFiles: versions.map(v => ({
          id: v.id.toString(),
          name: `Version ${v.id}`,
          filePath: v.file_path,
          createdAt: new Date(v.created_at).getTime(),
          type: v.stage_type,
          processingMethod: v.remark || "",
          rows: 0, // Need stats
          columns: [],
          size: "0 KB"
        }))
      };

      return { success: true, data: datasetInfo };
    } catch (error: any) {
      return { success: false, error: `获取数据集信息失败: ${error.message}` };
    }
  }

  async getDatasetVersions(datasetId: string): Promise<ServiceResponse<DatasetVersionInfo[]>> {
    try {
      const dId = parseInt(datasetId);
      if (isNaN(dId)) return { success: false, error: "无效的数据集ID" };

      const versionsResult = this.datasetRepository.getVersionsByDatasetId(dId);
      if (!versionsResult.success) return { success: false, error: versionsResult.error };

      const versions = versionsResult.data!.map(v => ({
        id: v.id,
        datasetId: v.dataset_id,
        parentVersionId: v.parent_version_id || null,
        stageType: v.stage_type,
        createdAt: new Date(v.created_at).getTime(),
        remark: v.remark || ""
      }));

      return { success: true, data: versions };
    } catch (error: any) {
      return { success: false, error: `获取数据集版本失败: ${error.message}` };
    }
  }

  async getDatasetVersionStats(versionId: string): Promise<ServiceResponse<VersionStatsInfo>> {
    try {
      const vId = parseInt(versionId);
      if (isNaN(vId)) return { success: false, error: "无效的版本ID" };

      const statResult = this.datasetRepository.getStatByVersionId(vId);
      if (!statResult.success) return { success: false, error: statResult.error };

      const stat = statResult.data!;
      return {
        success: true,
        data: {
          versionId: stat.version_id,
          totalRows: stat.total_rows,
          totalCols: stat.total_cols,
          totalMissingCount: stat.total_missing_count,
          totalOutlierCount: stat.total_outlier_count,
          columnStats: stat.column_stats_json ? JSON.parse(stat.column_stats_json) : {},
          calculatedAt: new Date(stat.calculated_at).getTime()
        }
      };
    } catch (error: any) {
      return { success: false, error: `获取版本统计信息失败: ${error.message}` };
    }
  }

  async deleteDataset(projectId: string, datasetId: string): Promise<ServiceResponse<void>> {
    try {
      const dId = parseInt(datasetId);
      if (isNaN(dId)) return { success: false, error: "无效的数据集ID" };

      // Get dataset to find files to delete
      const datasetResult = this.datasetRepository.getDatasetById(dId);
      if (datasetResult.success) {
        const dataset = datasetResult.data!;
        // Optional: Delete files from disk
        // const dirPath = path.dirname(dataset.source_file_path || "");
        // if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
      }

      return this.datasetRepository.deleteDataset(dId);
    } catch (error: any) {
      return { success: false, error: `删除数据集失败: ${error.message}` };
    }
  }

  async updateDataset(
    projectId: string,
    datasetId: string,
    updates: { name?: string; type?: string; missingValueTypes?: string[] }
  ): Promise<ServiceResponse<DatasetInfo>> {
    try {
      const dId = parseInt(datasetId);
      if (isNaN(dId)) return { success: false, error: "无效的数据集ID" };

      const updateData: any = {};
      if (updates.name) updateData.dataset_name = updates.name;
      
      const result = this.datasetRepository.updateDataset(dId, updateData);
      if (!result.success) return { success: false, error: result.error };

      return this.getDatasetInfo(projectId, datasetId);
    } catch (error: any) {
      return { success: false, error: `更新数据集失败: ${error.message}` };
    }
  }

  async performImputation(
    projectId: string,
    datasetId: string,
    method: string,
    options: any
  ): Promise<ServiceResponse<any>> {
     // TODO: Implement actual imputation logic using python scripts or other methods
     console.log(`Performing imputation on dataset ${datasetId} using ${method}`, options);
     return { success: false, error: "插补功能暂未实现 (Database Refactor Pending)" };
  }

  private async mapDatasetToInfo(d: Dataset): Promise<DatasetInfo> {
     const versionsResult = this.datasetRepository.getVersionsByDatasetId(d.id);
     const versions = versionsResult.success ? versionsResult.data! : [];
     const latestVersion = versions[0];
     
     let dataQuality: DataQualityInfo = {
        totalRecords: 0,
        completeRecords: 0,
        missingValueStats: {},
        totalMissingCount: 0,
        qualityPercentage: 0,
        analyzedAt: 0,
        columnMissingStatus: {}
     };

     if (latestVersion) {
       const statResult = this.datasetRepository.getStatByVersionId(latestVersion.id);
       if (statResult.success) {
         const stat = statResult.data!;
         let columnMissingStatus = {};
         let missingValueStats = {};
         let columnStatistics = {};

         if (stat.column_stats_json) {
            try {
                const parsed = JSON.parse(stat.column_stats_json);
                if (parsed.columnMissingStatus) {
                    columnMissingStatus = parsed.columnMissingStatus;
                    missingValueStats = parsed.missingValueStats || {};
                    columnStatistics = parsed.columnStatistics || {};
                } else {
                    columnMissingStatus = parsed;
                }
            } catch(e) {}
         }

         dataQuality = {
            totalRecords: stat.total_rows,
            completeRecords: stat.total_rows - stat.total_missing_count,
            missingValueStats: missingValueStats,
            totalMissingCount: stat.total_missing_count,
            qualityPercentage: stat.total_rows > 0 ? ((stat.total_rows - stat.total_missing_count) / stat.total_rows) * 100 : 100,
            analyzedAt: new Date(stat.calculated_at).getTime(),
            columnMissingStatus: columnMissingStatus,
            columnStatistics: columnStatistics
         };
       }
     }

     return {
       id: d.id.toString(),
       name: d.dataset_name,
       type: "csv",
       createdAt: new Date(d.import_time).getTime(),
       updatedAt: new Date(d.import_time).getTime(),
       belongTo: d.site_id.toString(),
       dirPath: path.dirname(d.source_file_path || ""),
       missingValueTypes: [],
       originalFile: {
         name: path.basename(d.source_file_path || ""),
         filePath: d.source_file_path || "",
         size: "0",
         rows: dataQuality.totalRecords,
         columns: this.datasetRepository.getColumnSettings(d.id).success ? this.datasetRepository.getColumnSettings(d.id).data!.map(c => c.column_name) : [],
         dataQuality: dataQuality
       },
       processedFiles: []
     };
  }

  private async validateImportRequest(request: ImportDatasetRequest): Promise<ServiceResponse<void>> {
    if (!request.projectId) return { success: false, error: "项目ID不能为空" };
    if (!request.datasetName) return { success: false, error: "数据集名称不能为空" };
    if (!request.file || !request.file.path) return { success: false, error: "文件路径不能为空" };
    if (!request.columns || request.columns.length === 0) return { success: false, error: "列信息不能为空" };
    if (typeof request.rows !== "number" || request.rows <= 0) return { success: false, error: "行数必须是正整数" };
    return { success: true };
  }

  private async performFullFileAnalysis(
    filePath: string,
    missingValueTypes: string[],
    fileExtension: string
  ): Promise<ServiceResponse<DataQualityInfo>> {
    try {
      let fileContent: string | Buffer;
      const fileType = fileExtension.toLowerCase().replace(".", "");

      if (fileType === "csv") {
        fileContent = fs.readFileSync(filePath, "utf-8");
      } else {
        fileContent = fs.readFileSync(filePath);
      }

      const workerPath = path.join(__dirname, "../workers", "fileParser.js");

      const parseResult = await new Promise<any>((resolve, reject) => {
        const worker = new Worker(workerPath);

        worker.on("message", (result: any) => {
          worker.terminate();
          if (result.success) {
            resolve(result.data);
          } else {
            reject(new Error(result.error));
          }
        });

        worker.on("error", (error: any) => {
          worker.terminate();
          reject(error);
        });

        worker.postMessage({
          type: fileType === "csv" ? "csv" : "excel",
          data: fileContent,
          maxRows: -1,
          missingValueTypes,
        });
      });

      const dataQuality: DataQualityInfo = {
        totalRecords: parseResult.totalRows,
        completeRecords: parseResult.completeRecords,
        missingValueStats: parseResult.missingValueStats || {},
        totalMissingCount: parseResult.totalMissingCount || 0,
        qualityPercentage:
          parseResult.totalRows > 0
            ? ((parseResult.totalRows - Math.floor(parseResult.totalMissingCount / parseResult.columns.length)) /
                parseResult.totalRows) *
              100
            : 100,
        analyzedAt: Date.now(),
        columnMissingStatus: parseResult.columnMissingStatus || {},
        columnStatistics: parseResult.columnStatistics || {},
      };
      return { success: true, data: dataQuality };
    } catch (error: any) {
      return {
        success: false,
        error: `文件分析失败: ${error.message}`,
      };
    }
  }
}
