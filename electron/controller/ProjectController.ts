import { BaseController } from "./BaseController";
import { ProjectManager } from "../project";
import { IpcMainInvokeEvent } from "electron";

export class ProjectController extends BaseController {
  constructor(private projectManager: ProjectManager) {
    super();
  }

  /**
   * 获取所有项目
   */
  async getProjects(args: void, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      return this.projectManager.getProjects();
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
      const project = this.projectManager.createProject(args);
      return { project };
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
    return this.handleAsync(async () => {
      const isAvailable = this.projectManager.checkProjectName(args.name);
      return { isAvailable };
    });
  }

  /**
   * 删除项目
   */
  async deleteProject(
    args: {
      projectId: string;
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      this.projectManager.deleteProject(args.projectId);
      return {};
    });
  }
}
