import { ProjectDBRepository } from "../repository/ProjectDBRepository";
import { DatasetDBRepository } from "../repository/DatasetDBRepository";
import { Site, Dataset } from "@shared/types/database";
import * as fs from "fs";
import * as path from "path";
import {
  ProjectInfo,
  CreateProjectRequest,
  ServiceResponse,
} from "@shared/types/projectInterface";

export class ProjectService {
  private projectRepository: ProjectDBRepository;
  private datasetRepository: DatasetDBRepository;

  constructor(projectRepository: ProjectDBRepository, datasetRepository: DatasetDBRepository) {
    this.projectRepository = projectRepository;
    this.datasetRepository = datasetRepository;
  }

  /**
   * 解析 SQLite 存储的 DATETIME 字符串为 UTC epoch(ms)
   * 保持与 DatasetService 相同的解析策略，避免时区误差
   */
  private parseSQLiteTimestampAsUTC(timestamp?: string | null): number {
    if (!timestamp) return NaN;
    try {
      const iso = String(timestamp).trim().replace(" ", "T") + "Z";
      const t = Date.parse(iso);
      if (!isNaN(t)) return t;
    } catch (e) {
      // fallback below
    }
    const fallback = Date.parse(String(timestamp));
    return isNaN(fallback) ? NaN : fallback;
  }

  async getAllProjects(): Promise<ServiceResponse<ProjectInfo[]>> {
    try {
      const sitesResult = this.projectRepository.getAllProjects();
      if (!sitesResult.success) {
        return { success: false, error: sitesResult.error };
      }

      const projects: ProjectInfo[] = [];
      for (const site of sitesResult.data!) {
        const datasetsResult = this.datasetRepository.getDatasetsBySiteId(site.id);
        const datasets = datasetsResult.success ? datasetsResult.data! : [];
        projects.push(this.mapSiteToProjectInfo(site, datasets));
      }

      return { success: true, data: projects };
    } catch (error: any) {
      return { success: false, error: `获取项目列表失败: ${error.message}` };
    }
  }

  async getProjectById(projectId: string): Promise<ServiceResponse<ProjectInfo>> {
    try {
      const id = parseInt(projectId);
      if (isNaN(id)) {
        return { success: false, error: "无效的项目ID" };
      }

      const siteResult = this.projectRepository.getProjectById(id);
      if (!siteResult.success) {
        return { success: false, error: siteResult.error };
      }

      const datasetsResult = this.datasetRepository.getDatasetsBySiteId(id);
      const datasets = datasetsResult.success ? datasetsResult.data! : [];

      return { success: true, data: this.mapSiteToProjectInfo(siteResult.data!, datasets) };
    } catch (error: any) {
      return { success: false, error: `获取项目详情失败: ${error.message}` };
    }
  }

  async createProject(request: CreateProjectRequest): Promise<ServiceResponse<ProjectInfo>> {
    try {
      if (!request.name) {
        return { success: false, error: "项目名称不能为空" };
      }

      const siteResult = this.projectRepository.createProject({
        site_name: request.name,
        description: "",
        latitude: request.siteInfo?.latitude ? parseFloat(request.siteInfo.latitude) : undefined,
        longitude: request.siteInfo?.longitude ? parseFloat(request.siteInfo.longitude) : undefined,
        altitude: request.siteInfo?.altitude ? parseFloat(request.siteInfo.altitude) : undefined,
      });

      if (!siteResult.success) {
        return { success: false, error: siteResult.error };
      }

      return this.getProjectById(siteResult.data!.toString());
    } catch (error: any) {
      return { success: false, error: `创建项目失败: ${error.message}` };
    }
  }

  async deleteProject(projectId: string): Promise<ServiceResponse<void>> {
    try {
      const id = parseInt(projectId);
      if (isNaN(id)) {
        return { success: false, error: "无效的项目ID" };
      }
      
      // 级联软删除数据集
      const datasetsResult = this.datasetRepository.getDatasetsBySiteId(id);
      if (datasetsResult.success && datasetsResult.data) {
        for (const dataset of datasetsResult.data) {
          await this.datasetRepository.deleteDataset(dataset.id);
        }
      }

      return this.projectRepository.deleteProject(id);
    } catch (error: any) {
      return { success: false, error: `删除项目失败: ${error.message}` };
    }
  }

  async batchDeleteProjects(projectIds: string[]): Promise<ServiceResponse<void>> {
    try {
      const ids = projectIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      if (ids.length === 0) {
        return { success: true };
      }

      // 级联软删除数据集
      for (const id of ids) {
        const datasetsResult = this.datasetRepository.getDatasetsBySiteId(id);
        if (datasetsResult.success && datasetsResult.data) {
          for (const dataset of datasetsResult.data) {
            await this.datasetRepository.deleteDataset(dataset.id);
          }
        }
      }

      return this.projectRepository.batchDeleteProjects(ids);
    } catch (error: any) {
      return { success: false, error: `批量删除项目失败: ${error.message}` };
    }
  }

  async updateProject(
    projectId: string,
    updates: Partial<Omit<ProjectInfo, "id" | "datasets" | "createdAt">>
  ): Promise<ServiceResponse<ProjectInfo>> {
    try {
      const id = parseInt(projectId);
      if (isNaN(id)) {
        return { success: false, error: "无效的项目ID" };
      }

      const updateData: any = {};
      if (updates.name) updateData.site_name = updates.name;
      if (updates.siteInfo) {
        if (updates.siteInfo.latitude) updateData.latitude = parseFloat(updates.siteInfo.latitude);
        if (updates.siteInfo.longitude) updateData.longitude = parseFloat(updates.siteInfo.longitude);
        if (updates.siteInfo.altitude) updateData.altitude = parseFloat(updates.siteInfo.altitude);
      }

      const updateResult = this.projectRepository.updateProject(id, updateData);
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }

      return this.getProjectById(projectId);
    } catch (error: any) {
      return { success: false, error: `更新项目失败: ${error.message}` };
    }
  }

  async checkProjectNameAvailable(name: string): Promise<ServiceResponse<boolean>> {
    try {
      const allProjectsResult = await this.getAllProjects();
      if (!allProjectsResult.success) {
        return { success: false, error: allProjectsResult.error };
      }
      const nameExists = allProjectsResult.data!.some(project => project.name.toLowerCase() === name.toLowerCase());
      return { success: true, data: !nameExists };
    } catch (error: any) {
      return { success: false, error: `检查项目名称失败: ${error.message}` };
    }
  }

  private mapSiteToProjectInfo(site: Site, datasets: Dataset[]): ProjectInfo {
    return {
      id: site.id.toString(),
      name: site.site_name,
      path: "", 
      // SQLite CURRENT_TIMESTAMP is UTC; parse explicitly as UTC to get correct epoch(ms)
      createdAt: this.parseSQLiteTimestampAsUTC(site.created_at),
      lastUpdated: this.parseSQLiteTimestampAsUTC(site.updated_at),
      siteInfo: {
        longitude: site.longitude?.toString() || "",
        latitude: site.latitude?.toString() || "",
        altitude: site.altitude?.toString() || "",
      },
      datasets: datasets.map(d => {
        // determine version count for this dataset (used by UI to show versions)
        let versionCount = 0;
        try {
          const versionsRes = this.datasetRepository.getVersionsByDatasetId(d.id);
          if (versionsRes.success && Array.isArray(versionsRes.data)) {
            versionCount = versionsRes.data.length;
          }
        } catch {
          versionCount = 0;
        }

        return ({
        ...((): {
          dirPath: string;
          fileCount: number;
          totalSizeBytes: number;
          originalFileSizeBytes: number;
        } => {
          const sourceFilePath = d.source_file_path || "";
          const dirPath = sourceFilePath ? path.dirname(sourceFilePath) : "";

          let fileCount = 0;
          let totalSizeBytes = 0;
          let originalFileSizeBytes = 0;

          try {
            if (sourceFilePath && fs.existsSync(sourceFilePath)) {
              originalFileSizeBytes = fs.statSync(sourceFilePath).size;
            }
          } catch {
            originalFileSizeBytes = 0;
          }

          try {
            // Only count actual data files to avoid counting auxiliary or hidden files.
            const allowedExts = new Set([".csv", ".xlsx", ".xls"]);

            if (dirPath && fs.existsSync(dirPath)) {
              const entries = fs.readdirSync(dirPath, { withFileTypes: true });
              for (const entry of entries) {
                if (!entry.isFile()) continue;
                // ignore hidden/temp files
                if (entry.name.startsWith(".")) continue;
                const ext = path.extname(entry.name).toLowerCase();
                if (!allowedExts.has(ext)) continue;
                const fp = path.join(dirPath, entry.name);
                try {
                  const st = fs.statSync(fp);
                  fileCount += 1;
                  totalSizeBytes += st.size;
                } catch {
                  // ignore stat errors for individual files
                }
              }
            } else if (sourceFilePath && fs.existsSync(sourceFilePath)) {
              const ext = path.extname(sourceFilePath).toLowerCase();
              if ([".csv", ".xlsx", ".xls"].includes(ext)) {
                fileCount = 1;
                totalSizeBytes = originalFileSizeBytes;
              } else {
                // non-data file stored as original - still treat as 1 file but size unknown
                fileCount = 1;
                totalSizeBytes = originalFileSizeBytes || 0;
              }
            }
          } catch {
            // ignore directory read errors
          }

          return {
            dirPath,
            fileCount,
            totalSizeBytes,
            originalFileSizeBytes,
          };
        })(),
        id: d.id.toString(),
        name: d.dataset_name,
        type: "csv",
        originalFile: d.source_file_path || "",
        // 同样将 import_time 明确按 UTC 解析
        createdAt: this.parseSQLiteTimestampAsUTC(d.import_time),
        belongTo: site.id.toString(),
        versionCount
      } as any);
    })
    };
  }
}
