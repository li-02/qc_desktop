import { IPCManager } from "./IPCManager";
import { ProjectController } from "../controller/ProjectController";
import { DatasetController } from "../controller/DatasetController";
import { FileController } from "../controller/FileController";
import { ProjectManager } from "../project";

export class ControllerRegistry {
  private projectController: ProjectController;
  private datasetController: DatasetController;
  private fileController: FileController;

  constructor(projectManager: ProjectManager) {
    // 初始化控制器
    this.projectController = new ProjectController(projectManager);
    this.datasetController = new DatasetController(projectManager);
    this.fileController = new FileController();
  }

  /**
   * 注册所有控制器路由
   */
  registerAllRoutes() {
    this.registerProjectRoutes();
    this.registerDatasetRoutes();
    this.registerFileRoutes();

    console.log("所有控制器路由已注册");
    console.log("已注册路由:", IPCManager.getRegisteredRoutes());
  }

  /**
   * 注册项目相关路由
   */
  private registerProjectRoutes() {
    IPCManager.registerRoute(
      "projects/get-all",
      this.projectController.getProjects.bind(this.projectController)
    );
    IPCManager.registerRoute(
      "projects/create",
      this.projectController.createProject.bind(this.projectController)
    );
    IPCManager.registerRoute(
      "projects/check-name",
      this.projectController.checkProjectName.bind(this.projectController)
    );
    IPCManager.registerRoute(
      "projects/delete",
      this.projectController.deleteProject.bind(this.projectController)
    );
  }

  /**
   * 注册数据集相关路由
   */
  private registerDatasetRoutes() {
    IPCManager.registerRoute(
      "datasets/import",
      this.datasetController.importData.bind(this.datasetController)
    );
    IPCManager.registerRoute(
      "datasets/get-by-project",
      this.datasetController.getProjectDatasets.bind(this.datasetController)
    );
    IPCManager.registerRoute(
      "datasets/get-info",
      this.datasetController.getDatasetInfo.bind(this.datasetController)
    );
    IPCManager.registerRoute(
      "datasets/delete",
      this.datasetController.deleteDataset.bind(this.datasetController)
    );
  }

  /**
   * 注册文件处理相关路由
   */
  private registerFileRoutes() {
    IPCManager.registerRoute(
      "files/parse-preview",
      this.fileController.parseFilePreview.bind(this.fileController)
    );
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.fileController.cleanup();
  }
}
