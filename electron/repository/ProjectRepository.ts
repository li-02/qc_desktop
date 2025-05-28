// electron/repositories/ProjectRepository.ts

import * as fs from "fs";
import * as path from "path";
import {
  ProjectsIndexFile,
  ProjectBaseInfo,
  ProjectInfo,
  ServiceResponse,
} from "@shared/types/projectInterface";

/**
 * 项目数据访问层
 * 职责：纯粹的数据读写操作，不包含业务逻辑
 * 相当于对数据库操作的封装
 */
export class ProjectRepository {
  private projectsDir: string;
  private indexPath: string;

  constructor(projectsDir: string) {
    this.projectsDir = projectsDir;
    this.indexPath = path.join(projectsDir, "index.json");
    this.ensureProjectsDir();
  }

  // #region 索引文件操作

  /**
   * 读取项目索引文件
   */
  async readProjectsIndex(): Promise<ServiceResponse<ProjectsIndexFile>> {
    try {
      if (!fs.existsSync(this.indexPath)) {
        // 如果索引文件不存在，创建一个空的
        const emptyIndex: ProjectsIndexFile = {
          lastUpdated: Date.now(),
          projects: [],
        };
        await this.writeProjectsIndex(emptyIndex);
        return { success: true, data: emptyIndex };
      }

      const content = fs.readFileSync(this.indexPath, "utf-8");
      const indexData: ProjectsIndexFile = JSON.parse(content);

      return { success: true, data: indexData };
    } catch (error: any) {
      return {
        success: false,
        error: `读取项目索引失败: ${error.message}`,
      };
    }
  }

  /**
   * 写入项目索引文件
   */
  async writeProjectsIndex(
    indexData: ProjectsIndexFile
  ): Promise<ServiceResponse<void>> {
    try {
      indexData.lastUpdated = Date.now();
      const content = JSON.stringify(indexData, null, 2);
      fs.writeFileSync(this.indexPath, content, "utf-8");

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `写入项目索引失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 项目配置文件操作

  /**
   * 读取项目配置文件
   */
  async readProjectConfig(
    projectPath: string
  ): Promise<ServiceResponse<ProjectInfo>> {
    try {
      const configPath = path.join(projectPath, "project.json");

      if (!fs.existsSync(configPath)) {
        return {
          success: false,
          error: "项目配置文件不存在",
        };
      }

      const content = fs.readFileSync(configPath, "utf-8");
      const projectInfo: ProjectInfo = JSON.parse(content);

      return { success: true, data: projectInfo };
    } catch (error: any) {
      return {
        success: false,
        error: `读取项目配置失败: ${error.message}`,
      };
    }
  }

  /**
   * 写入项目配置文件
   */
  async writeProjectConfig(
    projectInfo: ProjectInfo
  ): Promise<ServiceResponse<void>> {
    try {
      const configPath = path.join(projectInfo.path, "project.json");
      projectInfo.lastUpdated = Date.now();

      const content = JSON.stringify(projectInfo, null, 2);
      fs.writeFileSync(configPath, content, "utf-8");

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `写入项目配置失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 文件系统操作

  /**
   * 创建项目目录
   */
  async createProjectDirectory(
    projectPath: string
  ): Promise<ServiceResponse<void>> {
    try {
      if (fs.existsSync(projectPath)) {
        return {
          success: false,
          error: "项目目录已存在",
        };
      }

      fs.mkdirSync(projectPath, { recursive: true });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `创建项目目录失败: ${error.message}`,
      };
    }
  }

  /**
   * 删除项目目录
   */
  async deleteProjectDirectory(
    projectPath: string
  ): Promise<ServiceResponse<void>> {
    try {
      if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
      }
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `删除项目目录失败: ${error.message}`,
      };
    }
  }

  /**
   * 检查项目目录是否存在
   */
  async projectExists(projectPath: string): Promise<boolean> {
    return fs.existsSync(projectPath);
  }

  /**
   * 检查项目配置文件是否存在
   */
  async projectConfigExists(projectPath: string): Promise<boolean> {
    const configPath = path.join(projectPath, "project.json");
    return fs.existsSync(configPath);
  }

  // #endregion

  // #region 辅助方法

  /**
   * 确保项目根目录存在
   */
  private ensureProjectsDir(): void {
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  /**
   * 获取项目路径
   */
  getProjectPath(projectName: string): string {
    return path.join(this.projectsDir, projectName);
  }

  /**
   * 获取项目根目录
   */
  getProjectsDirectory(): string {
    return this.projectsDir;
  }

  /**
   * 将ProjectInfo转换为ProjectBaseInfo
   */
  toProjectBaseInfo(projectInfo: ProjectInfo): ProjectBaseInfo {
    return {
      id: projectInfo.id,
      name: projectInfo.name,
      path: projectInfo.path,
      createdAt: projectInfo.createdAt,
    };
  }

  // #endregion
}
