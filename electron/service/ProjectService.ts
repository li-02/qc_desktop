// electron/services/ProjectService.ts

import { v4 as uuidv4 } from "uuid";
import { ProjectRepository } from "../repository/ProjectRepository";
import {
  ProjectInfo,
  ProjectBaseInfo,
  CreateProjectRequest,
  ServiceResponse,
  ProjectsIndexFile,
} from "@shared/types/projectInterface";

/**
 * 项目业务逻辑层
 * 职责：处理业务逻辑、数据验证、业务规则执行
 */
export class ProjectService {
  private projectRepository: ProjectRepository;

  constructor(projectRepository: ProjectRepository) {
    this.projectRepository = projectRepository;
  }

  // #region 项目管理

  /**
   * 获取所有项目
   * 从索引文件和项目配置文件中加载完整的项目信息
   */
  async getAllProjects(): Promise<ServiceResponse<ProjectInfo[]>> {
    try {
      // 1. 读取项目索引
      const indexResult = await this.projectRepository.readProjectsIndex();
      if (!indexResult.success) {
        return { success: false, error: indexResult.error };
      }

      const projects: ProjectInfo[] = [];
      const validProjects: ProjectBaseInfo[] = [];

      // 2. 遍历索引中的项目，加载完整配置
      for (const baseInfo of indexResult.data!.projects) {
        // 检查项目目录是否存在
        const projectExists = await this.projectRepository.projectExists(baseInfo.path);
        if (!projectExists) {
          console.warn(`项目目录不存在，跳过: ${baseInfo.path}`);
          continue;
        }

        // 检查项目配置文件是否存在
        const configExists = await this.projectRepository.projectConfigExists(baseInfo.path);
        if (!configExists) {
          console.warn(`项目配置文件不存在，跳过: ${baseInfo.path}`);
          continue;
        }

        // 读取项目完整配置
        const configResult = await this.projectRepository.readProjectConfig(baseInfo.path);
        if (configResult.success) {
          projects.push(configResult.data!);
          validProjects.push(baseInfo);
        } else {
          console.warn(`读取项目配置失败，跳过: ${baseInfo.name} - ${configResult.error}`);
        }
      }

      // 3. 如果有项目被清理，更新索引文件
      if (validProjects.length !== indexResult.data!.projects.length) {
        const updatedIndex: ProjectsIndexFile = {
          lastUpdated: Date.now(),
          projects: validProjects,
        };
        await this.projectRepository.writeProjectsIndex(updatedIndex);
      }

      return {
        success: true,
        data: projects.sort((a, b) => b.createdAt - a.createdAt),
      };
    } catch (error: any) {
      return {
        success: false,
        error: `获取项目列表失败: ${error.message}`,
      };
    }
  }

  /**
   * 根据ID获取单个项目
   */
  async getProjectById(projectId: string): Promise<ServiceResponse<ProjectInfo>> {
    try {
      const allProjectsResult = await this.getAllProjects();
      if (!allProjectsResult.success) {
        return { success: false, error: allProjectsResult.error };
      }

      const project = allProjectsResult.data!.find(p => p.id === projectId);
      if (!project) {
        return {
          success: false,
          error: `找不到ID为 "${projectId}" 的项目`,
        };
      }

      return { success: true, data: project };
    } catch (error: any) {
      return {
        success: false,
        error: `获取项目失败: ${error.message}`,
      };
    }
  }

  /**
   * 创建新项目
   */
  async createProject(request: CreateProjectRequest): Promise<ServiceResponse<ProjectBaseInfo>> {
    try {
      // 1. 业务规则验证
      const validationResult = await this.validateCreateProject(request);
      if (!validationResult.success) {
        throw new Error(validationResult.error);
      }

      // 2. 生成项目信息
      const projectId = uuidv4();
      const projectPath = this.projectRepository.getProjectPath(request.name);
      const now = Date.now();

      const newProject: ProjectInfo = {
        id: projectId,
        name: request.name,
        path: projectPath,
        createdAt: now,
        lastUpdated: now,
        siteInfo: request.siteInfo,
        datasets: [],
      };

      // 3. 创建项目目录
      const createDirResult = await this.projectRepository.createProjectDirectory(projectPath);
      if (!createDirResult.success) {
        return { success: false, error: createDirResult.error };
      }

      // 4. 保存项目配置
      const saveConfigResult = await this.projectRepository.writeProjectConfig(newProject);
      if (!saveConfigResult.success) {
        // 回滚：删除已创建的目录
        await this.projectRepository.deleteProjectDirectory(projectPath);
        return { success: false, error: saveConfigResult.error };
      }

      // 5. 更新索引文件
      const updateIndexResult = await this.updateProjectIndex(newProject, "add");
      if (!updateIndexResult.success) {
        // 回滚：删除项目目录和配置
        await this.projectRepository.deleteProjectDirectory(projectPath);
        return { success: false, error: updateIndexResult.error };
      }

      const projectBaseInfo = this.projectRepository.toProjectBaseInfo(newProject);
      return { success: true, data: projectBaseInfo };
    } catch (error: any) {
      return {
        success: false,
        error: `创建项目失败: ${error.message}`,
      };
    }
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<ServiceResponse<void>> {
    try {
      // 1. 查找项目
      const projectResult = await this.getProjectById(projectId);
      if (!projectResult.success) {
        return { success: false, error: projectResult.error };
      }

      const project = projectResult.data!;

      // 2. 删除项目目录
      const deleteDirResult = await this.projectRepository.deleteProjectDirectory(project.path);
      if (!deleteDirResult.success) {
        return { success: false, error: deleteDirResult.error };
      }

      // 3. 更新索引文件
      const updateIndexResult = await this.updateProjectIndex(project, "remove");
      if (!updateIndexResult.success) {
        return { success: false, error: updateIndexResult.error };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `删除项目失败: ${error.message}`,
      };
    }
  }

  /**
   * 更新项目信息
   */
  async updateProject(
    projectId: string,
    updates: Partial<Omit<ProjectInfo, "id" | "datasets" | "createdAt">>
  ): Promise<ServiceResponse<ProjectInfo>> {
    try {
      // 1. 获取当前项目信息
      const projectResult = await this.getProjectById(projectId);
      if (!projectResult.success) {
        return { success: false, error: projectResult.error };
      }

      const currentProject = projectResult.data!;

      // 2. 如果更新了项目名称，需要验证名称可用性
      if (updates.name && updates.name !== currentProject.name) {
        const nameCheckResult = await this.checkProjectNameAvailable(updates.name);
        if (!nameCheckResult.success || !nameCheckResult.data) {
          return {
            success: false,
            error: nameCheckResult.error || `项目名称 "${updates.name}" 已存在`,
          };
        }
      }

      // 3. 合并更新
      const updatedProject: ProjectInfo = {
        ...currentProject,
        ...updates,
        id: currentProject.id, // 确保ID不变
        datasets: currentProject.datasets, // 确保数据集信息不变
        createdAt: currentProject.createdAt, // 确保创建时间不变
        lastUpdated: Date.now(),
      };

      // 4. 保存更新后的配置
      const saveResult = await this.projectRepository.writeProjectConfig(updatedProject);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      // 5. 如果名称或路径变化，更新索引
      if (updates.name || updates.path) {
        const updateIndexResult = await this.updateProjectIndex(updatedProject, "update");
        if (!updateIndexResult.success) {
          return { success: false, error: updateIndexResult.error };
        }
      }

      return { success: true, data: updatedProject };
    } catch (error: any) {
      return {
        success: false,
        error: `更新项目失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 项目名称管理

  /**
   * 检查项目名称是否可用
   */
  async checkProjectNameAvailable(name: string): Promise<ServiceResponse<boolean>> {
    try {
      const allProjectsResult = await this.getAllProjects();
      if (!allProjectsResult.success) {
        return { success: false, error: allProjectsResult.error };
      }

      const nameExists = allProjectsResult.data!.some(project => project.name.toLowerCase() === name.toLowerCase());

      return { success: true, data: !nameExists };
    } catch (error: any) {
      return {
        success: false,
        error: `检查项目名称失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 私有辅助方法

  /**
   * 验证创建项目的请求参数
   */
  private async validateCreateProject(request: CreateProjectRequest): Promise<ServiceResponse<void>> {
    // 验证项目名称
    if (!request.name || request.name.trim().length === 0) {
      return { success: false, error: "项目名称不能为空" };
    }

    if (request.name.length > 50) {
      return { success: false, error: "项目名称不能超过50个字符" };
    }

    // 检查名称是否已存在
    const nameCheckResult = await this.checkProjectNameAvailable(request.name);
    if (!nameCheckResult.success) {
      return { success: false, error: nameCheckResult.error };
    }

    if (!nameCheckResult.data) {
      return { success: false, error: `项目名称 "${request.name}" 已存在` };
    }

    // 验证地理信息
    const { longitude, latitude, altitude } = request.siteInfo;

    if (!longitude || !latitude || !altitude) {
      return { success: false, error: "地理信息不能为空" };
    }

    const lon = parseFloat(longitude);
    const lat = parseFloat(latitude);
    const alt = parseFloat(altitude);

    if (isNaN(lon) || lon < -180 || lon > 180) {
      return { success: false, error: "经度必须在-180到180之间" };
    }

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return { success: false, error: "纬度必须在-90到90之间" };
    }

    if (isNaN(alt)) {
      return { success: false, error: "海拔必须是有效数字" };
    }

    return { success: true };
  }

  /**
   * 更新项目索引文件
   */
  private async updateProjectIndex(
    project: ProjectInfo,
    operation: "add" | "remove" | "update"
  ): Promise<ServiceResponse<void>> {
    try {
      const indexResult = await this.projectRepository.readProjectsIndex();
      if (!indexResult.success) {
        return { success: false, error: indexResult.error };
      }

      const indexData = indexResult.data!;
      const projectBaseInfo = this.projectRepository.toProjectBaseInfo(project);

      switch (operation) {
        case "add":
          indexData.projects.push(projectBaseInfo);
          break;

        case "remove":
          indexData.projects = indexData.projects.filter(p => p.id !== project.id);
          break;

        case "update":
          const index = indexData.projects.findIndex(p => p.id === project.id);
          if (index !== -1) {
            indexData.projects[index] = projectBaseInfo;
          }
          break;
      }

      return await this.projectRepository.writeProjectsIndex(indexData);
    } catch (error: any) {
      return {
        success: false,
        error: `更新项目索引失败: ${error.message}`,
      };
    }
  }

  // #endregion
}
