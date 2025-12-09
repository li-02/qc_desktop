import { ProjectDBRepository } from "../repository/ProjectDBRepository";
import { DatasetDBRepository } from "../repository/DatasetDBRepository";
import { Site, Dataset } from "@shared/types/database";
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
      createdAt: new Date(site.created_at).getTime(),
      lastUpdated: new Date(site.updated_at).getTime(),
      siteInfo: {
        longitude: site.longitude?.toString() || "",
        latitude: site.latitude?.toString() || "",
        altitude: site.altitude?.toString() || "",
      },
      datasets: datasets.map(d => ({
        id: d.id.toString(),
        name: d.dataset_name,
        type: "csv",
        dirPath: "",
        originalFile: d.source_file_path || "",
        createdAt: new Date(d.import_time).getTime(),
        belongTo: site.id.toString()
      }))
    };
  }
}
