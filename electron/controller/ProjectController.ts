import { BaseController } from "./BaseController";
import { IpcMainInvokeEvent } from "electron";
import { ProjectService } from "service/ProjectService";
import { CreateProjectRequest } from "@shared/types/projectInterface";

export class ProjectController extends BaseController {
  private projectService: ProjectService;

  constructor(projectService: ProjectService) {
    super();
    this.projectService = projectService;
  }

  /**
   * 获取所有项目
   * @param args
   * @param event
   * @returns ProjectBaseInfo[]
   */
  async getProjects(args: void, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = await this.projectService.getAllProjects();
      if (!result.success) {
        throw new Error(result.error || "获取项目失败");
      }
      return result.data;
    });
  }
  /**
   * 根据ID获取项目
   * @param args { projectId: string }
   * @param event
   * @returns ProjectInfo
   */
  async getProjectById(args: { projectId: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }
      const result = await this.projectService.getProjectById(args.projectId);
      if (!result.success) {
        throw new Error(result.error || "获取项目失败");
      }
      return result.data;
    });
  }

  /**
   * 创建项目
   */
  async createProject(
    args: {
      name: string;
      siteInfo: {
        longitude: string;
        latitude: string;
        altitude: string;
      };
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      const validationError = this.validateCreateProjectArgs(args);
      if (validationError) {
        throw new Error(validationError);
      }
      const request: CreateProjectRequest = {
        name: args.name.trim(),
        siteInfo: {
          longitude: args.siteInfo.longitude.trim(),
          latitude: args.siteInfo.latitude.trim(),
          altitude: args.siteInfo.altitude.trim(),
        },
      };
      const result = await this.projectService.createProject(request);
      if (!result.success) {
        throw new Error(result.error || "创建项目失败");
      }
      return { project: result.data };
    });
  }
  /**
   * 更新项目信息
   */
  async updateProject(
    args: {
      projectId: string;
      updates: {
        name?: string;
        siteInfo?: {
          longitude?: string;
          latitude?: string;
          altitude?: string;
        };
      };
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }

      if (!args.updates || Object.keys(args.updates).length === 0) {
        throw new Error("更新内容不能为空");
      }

      // 清理和验证更新数据
      const cleanUpdates: any = {};

      if (args.updates.name !== undefined) {
        if (typeof args.updates.name !== "string" || args.updates.name.trim().length === 0) {
          throw new Error("项目名称不能为空");
        }
        cleanUpdates.name = args.updates.name.trim();
      }

      if (args.updates.siteInfo) {
        cleanUpdates.siteInfo = {};
        const siteInfo = args.updates.siteInfo;

        if (siteInfo.longitude !== undefined) {
          cleanUpdates.siteInfo.longitude = siteInfo.longitude.trim();
        }
        if (siteInfo.latitude !== undefined) {
          cleanUpdates.siteInfo.latitude = siteInfo.latitude.trim();
        }
        if (siteInfo.altitude !== undefined) {
          cleanUpdates.siteInfo.altitude = siteInfo.altitude.trim();
        }
      }

      const result = await this.projectService.updateProject(args.projectId, cleanUpdates);

      if (!result.success) {
        throw new Error(result.error || "更新项目失败");
      }

      return { project: result.data };
    });
  }

  /**
   * 删除项目
   */
  async deleteProject(args: { projectId: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }

      const result = await this.projectService.deleteProject(args.projectId);

      if (!result.success) {
        throw new Error(result.error || "删除项目失败");
      }

      return {};
    });
  }

  /**
   * 检查项目名称
   */
  async checkProjectName(
    args: {
      name: string;
    },
    event: IpcMainInvokeEvent
  ) {
    console.warn("args", args.name);
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.name) {
        throw new Error("项目名称不能为空");
      }
      const trimmedName = args.name.trim();
      console.log("trimmed name", trimmedName);
      if (trimmedName.length === 0) {
        throw new Error("项目名称不能为空");
      }
      const result = await this.projectService.checkProjectNameAvailable(trimmedName);
      if (!result.success) {
        throw new Error(result.error || "检查项目名称失败");
      }
      return { isAvailable: result.data };
    });
  }

  // #region 私有辅助方法

  /**
   * 验证创建项目的参数
   */
  private validateCreateProjectArgs(args: any): string | null {
    if (!args) {
      return "参数不能为空";
    }

    if (!args.name || typeof args.name !== "string") {
      return "项目名称不能为空";
    }

    if (args.name.trim().length === 0) {
      return "项目名称不能为空";
    }

    if (args.name.length > 50) {
      return "项目名称不能超过50个字符";
    }

    if (!args.siteInfo) {
      return "地理信息不能为空";
    }

    const { longitude, latitude, altitude } = args.siteInfo;

    if (!longitude || typeof longitude !== "string") {
      return "经度不能为空";
    }

    if (!latitude || typeof latitude !== "string") {
      return "纬度不能为空";
    }

    if (!altitude || typeof altitude !== "string") {
      return "海拔不能为空";
    }

    // 基础格式验证
    if (longitude.trim().length === 0 || latitude.trim().length === 0 || altitude.trim().length === 0) {
      return "地理信息不能为空";
    }

    return null; // 验证通过
  }

  // #endregion
}
