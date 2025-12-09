// electron/core/ControllerRegistry.ts

import { IPCManager } from "./IPCManager";
import { ProjectController } from "../controller/ProjectController";
import { DatasetController } from "../controller/DatasetController";
import { FileController } from "../controller/FileController";
import { OutlierDetectionController } from "../controller/OutlierDetectionController";
import { CorrelationAnalysisController } from "../controller/CorrelationAnalysisController";

// 引入新的分层架构
import { ProjectDBRepository } from "../repository/ProjectDBRepository";
import { DatasetDBRepository } from "../repository/DatasetDBRepository";
import { OutlierDetectionRepository } from "../repository/OutlierDetectionRepository";
import { ProjectService } from "../service/ProjectService";
import { DatasetService } from "../service/DatasetService";
import { OutlierDetectionService } from "../service/OutlierDetectionService";

/**
 * 控制器注册器 - 完整重构版
 * 职责：依赖注入容器、路由注册管理
 */
export class ControllerRegistry {
  // 数据访问层
  private projectRepository!: ProjectDBRepository;
  private datasetRepository!: DatasetDBRepository;
  private outlierRepository!: OutlierDetectionRepository;

  // 业务逻辑层
  private projectService!: ProjectService;
  private datasetService!: DatasetService;
  private outlierService!: OutlierDetectionService;

  // 控制器层
  private projectController!: ProjectController;
  private datasetController!: DatasetController;
  private fileController!: FileController;
  private outlierController!: OutlierDetectionController;
  private correlationController!: CorrelationAnalysisController;

  constructor(projectsDir: string) {
    this.initializeDependencies(projectsDir);
  }

  /**
   * 初始化依赖关系
   * 按照 Repository → Service → Controller 的顺序构建依赖链
   */
  private initializeDependencies(projectsDir: string) {
    console.log("正在初始化应用依赖关系...");

    try {
      // 1. 初始化数据访问层 (Repository Layer)
      this.projectRepository = new ProjectDBRepository();
      console.log("✓ ProjectRepository 初始化完成");

      this.datasetRepository = new DatasetDBRepository();
      console.log("✓ DatasetRepository 初始化完成");

      this.outlierRepository = new OutlierDetectionRepository();
      console.log("✓ OutlierDetectionRepository 初始化完成");

      // 2. 初始化业务逻辑层 (Service Layer)
      this.projectService = new ProjectService(this.projectRepository, this.datasetRepository);
      console.log("✓ ProjectService 初始化完成");

      this.datasetService = new DatasetService(this.datasetRepository, this.projectRepository);
      console.log("✓ DatasetService 初始化完成");

      this.outlierService = new OutlierDetectionService(this.outlierRepository, this.datasetRepository);
      console.log("✓ OutlierDetectionService 初始化完成");

      // 3. 初始化控制器层 (Controller Layer)
      this.projectController = new ProjectController(this.projectService);
      console.log("✓ ProjectController 初始化完成");

      this.datasetController = new DatasetController(this.datasetService);
      console.log("✓ DatasetController 初始化完成");

      this.fileController = new FileController();
      console.log("✓ FileController 初始化完成");

      this.outlierController = new OutlierDetectionController(this.outlierService);
      console.log("✓ OutlierDetectionController 初始化完成");

      this.correlationController = new CorrelationAnalysisController();
      console.log("✓ CorrelationAnalysisController 初始化完成");

      console.log("所有依赖关系初始化完成");
    } catch (error: any) {
      console.error("依赖初始化失败:", error);
      throw new Error(`应用启动失败: ${error.message}`);
    }
  }

  /**
   * 注册所有控制器路由
   */
  registerAllRoutes() {
    try {
      this.registerProjectRoutes();
      this.registerDatasetRoutes();
      this.registerFileRoutes();
      this.registerOutlierDetectionRoutes();
      this.registerCorrelationRoutes();

      console.log("所有控制器路由已注册");
      console.log("已注册路由:", IPCManager.getRegisteredRoutes());
    } catch (error: any) {
      console.error("路由注册失败:", error);
      throw new Error(`路由注册失败: ${error.message}`);
    }
  }

  /**
   * 注册项目相关路由
   */
  private registerProjectRoutes() {
    const routes = [
      {
        path: "projects/get-all",
        handler: this.projectController.getProjects.bind(this.projectController),
        description: "获取所有项目",
      },
      {
        path: "projects/get-by-id",
        handler: this.projectController.getProjectById.bind(this.projectController),
        description: "根据ID获取项目",
      },
      {
        path: "projects/create",
        handler: this.projectController.createProject.bind(this.projectController),
        description: "创建新项目",
      },
      {
        path: "projects/update",
        handler: this.projectController.updateProject.bind(this.projectController),
        description: "更新项目信息",
      },
      {
        path: "projects/delete",
        handler: this.projectController.deleteProject.bind(this.projectController),
        description: "删除项目",
      },
      {
        path: "projects/batch-delete",
        handler: this.projectController.batchDeleteProjects.bind(this.projectController),
        description: "批量删除项目",
      },
      {
        path: "projects/check-name",
        handler: this.projectController.checkProjectName.bind(this.projectController),
        description: "检查项目名称可用性",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`项目路由注册完成，共 ${routes.length} 个路由`);
  }

  /**
   * 注册数据集相关路由
   */
  private registerDatasetRoutes() {
    const routes = [
      {
        path: "datasets/import",
        handler: this.datasetController.importData.bind(this.datasetController),
        description: "导入数据集",
      },
      {
        path: "datasets/get-by-project",
        handler: this.datasetController.getProjectDatasets.bind(this.datasetController),
        description: "获取项目数据集",
      },
      {
        path: "datasets/get-info",
        handler: this.datasetController.getDatasetInfo.bind(this.datasetController),
        description: "获取数据集信息",
      },
      {
        path: "datasets/get-versions",
        handler: this.datasetController.getDatasetVersions.bind(this.datasetController),
        description: "获取数据集版本",
      },
      {
        path: "datasets/get-version-stats",
        handler: this.datasetController.getDatasetVersionStats.bind(this.datasetController),
        description: "获取版本统计信息",
      },
      {
        path: "datasets/delete",
        handler: this.datasetController.deleteDataset.bind(this.datasetController),
        description: "删除数据集",
      },
      {
        path: "datasets/update",
        handler: this.datasetController.updateDataset.bind(this.datasetController),
        description: "更新数据集信息",
      },
      {
        path: "datasets/validate-structure",
        handler: this.datasetController.validateDatasetStructure.bind(this.datasetController),
        description: "验证数据集结构",
      },
      {
        path: "datasets/perform-imputation",
        handler: this.datasetController.performImputation.bind(this.datasetController),
        description: "执行缺失值插补",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`数据集路由注册完成，共 ${routes.length} 个路由`);
  }

  /**
   * 注册文件处理相关路由
   */
  private registerFileRoutes() {
    const routes = [
      {
        path: "files/parse-preview",
        handler: this.fileController.parseFilePreview.bind(this.fileController),
        description: "解析文件预览",
      },
      {
        path: "files/parse-full",
        handler: this.fileController.parseFullFile.bind(this.fileController),
        description: "解析完整文件（用于数据质量分析）",
      },
      {
        path: "files/read-csv-data",
        handler: this.fileController.readCsvData.bind(this.fileController),
        description: "读取CSV数据（用于数据可视化）",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`文件处理路由注册完成，共 ${routes.length} 个路由`);
  }

  /**
   * 注册异常检测相关路由
   */
  private registerOutlierDetectionRoutes() {
    const routes = [
      // 检测方法
      {
        path: "outlier/get-methods",
        handler: this.outlierController.getDetectionMethods.bind(this.outlierController),
        description: "获取可用检测方法",
      },
      // 列阈值配置
      {
        path: "outlier/get-column-thresholds",
        handler: this.outlierController.getColumnThresholds.bind(this.outlierController),
        description: "获取列阈值配置",
      },
      {
        path: "outlier/update-column-threshold",
        handler: this.outlierController.updateColumnThreshold.bind(this.outlierController),
        description: "更新列阈值配置",
      },
      {
        path: "outlier/batch-update-thresholds",
        handler: this.outlierController.batchUpdateColumnThresholds.bind(this.outlierController),
        description: "批量更新阈值配置",
      },
      // 阈值模板
      {
        path: "outlier/get-templates",
        handler: this.outlierController.getThresholdTemplates.bind(this.outlierController),
        description: "获取阈值模板",
      },
      {
        path: "outlier/apply-template",
        handler: this.outlierController.applyThresholdTemplate.bind(this.outlierController),
        description: "应用阈值模板",
      },
      // 检测配置 (三级作用域)
      {
        path: "outlier/get-detection-configs",
        handler: this.outlierController.getDetectionConfigs.bind(this.outlierController),
        description: "获取检测配置",
      },
      {
        path: "outlier/create-detection-config",
        handler: this.outlierController.createDetectionConfig.bind(this.outlierController),
        description: "创建检测配置",
      },
      {
        path: "outlier/update-detection-config",
        handler: this.outlierController.updateDetectionConfig.bind(this.outlierController),
        description: "更新检测配置",
      },
      {
        path: "outlier/delete-detection-config",
        handler: this.outlierController.deleteDetectionConfig.bind(this.outlierController),
        description: "删除检测配置",
      },
      // 阈值解析
      {
        path: "outlier/resolve-threshold",
        handler: this.outlierController.resolveColumnThreshold.bind(this.outlierController),
        description: "解析列阈值(考虑继承)",
      },
      // 检测执行
      {
        path: "outlier/execute-threshold-detection",
        handler: this.outlierController.executeThresholdDetection.bind(this.outlierController),
        description: "执行阈值检测",
      },
      {
        path: "outlier/get-detection-results",
        handler: this.outlierController.getDetectionResults.bind(this.outlierController),
        description: "获取检测结果列表",
      },
      {
        path: "outlier/get-result-details",
        handler: this.outlierController.getDetectionResultDetails.bind(this.outlierController),
        description: "获取检测结果详情",
      },
      {
        path: "outlier/delete-detection-result",
        handler: this.outlierController.deleteDetectionResult.bind(this.outlierController),
        description: "删除检测结果",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`异常检测路由注册完成，共 ${routes.length} 个路由`);
  }

  /**
   * 注册相关性分析路由
   */
  private registerCorrelationRoutes() {
    const routes = [
      {
        path: "correlation/get-history",
        handler: this.correlationController.getHistory.bind(this.correlationController),
        description: "获取分析历史",
      },
      {
        path: "correlation/analyze",
        handler: this.correlationController.analyze.bind(this.correlationController),
        description: "运行相关性分析",
      },
      {
        path: "correlation/delete-result",
        handler: this.correlationController.deleteResult.bind(this.correlationController),
        description: "删除分析结果",
      },
      {
        path: "correlation/batch-delete-results",
        handler: this.correlationController.batchDeleteResults.bind(this.correlationController),
        description: "批量删除分析结果",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`相关性分析路由注册完成，共 ${routes.length} 个路由`);
  }

  /**
   * 获取应用健康状态
   */
  getHealthStatus() {
    return {
      dependencies: {
        projectRepository: !!this.projectRepository,
        datasetRepository: !!this.datasetRepository,
        projectService: !!this.projectService,
        datasetService: !!this.datasetService,
        projectController: !!this.projectController,
        datasetController: !!this.datasetController,
        fileController: !!this.fileController,
      },
      routes: IPCManager.getRegisteredRoutes(),
      timestamp: Date.now(),
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    try {
      console.log("正在清理应用资源...");

      if (this.fileController) {
        this.fileController.cleanup();
        console.log("✓ FileController 资源清理完成");
      }

      // 清理其他资源
      console.log("所有资源清理完成");
    } catch (error: any) {
      console.error("资源清理失败:", error);
    }
  }

  // #region 临时兼容性方法

  /**
   * 创建传统ProjectManager实例（临时兼容性方法）
   * TODO: 完成DatasetController重构后移除此方法
   */
  private createLegacyProjectManager(projectsDir: string) {
    // 这是一个临时的兼容性桥接，用于在重构过程中保持DatasetController正常工作
    const path = require("path");
    const indexPath = path.join(projectsDir, "index.json");

    // 这里暂时返回原有的ProjectManager，等DatasetController重构完成后移除
    const { ProjectManager } = require("../project");
    return new ProjectManager(projectsDir, indexPath);
  }

  // #endregion

  // #region 开发和调试辅助方法

  /**
   * 打印依赖关系图（开发调试用）
   */
  printDependencyGraph() {
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│                        依赖关系图                              │
├─────────────────────────────────────────────────────────────┤
│  ProjectController          DatasetController               │
│         ↓                          ↓                       │
│  ProjectService             DatasetService                  │
│         ↓                          ↓                       │
│  ProjectRepository    →    DatasetRepository                │
│         ↓                          ↓                       │
│              FileSystem (JSON文件存储)                       │
└─────────────────────────────────────────────────────────────┘

依赖注入流程：
1. Repository层：ProjectRepository + DatasetRepository
2. Service层：ProjectService + DatasetService
3. Controller层：ProjectController + DatasetController
4. IPC路由：统一注册到IPCManager
    `);
  }

  /**
   * 获取性能统计信息（开发调试用）
   */
  getPerformanceStats() {
    return {
      registeredRoutes: IPCManager.getRegisteredRoutes().length,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }

  // #endregion
}
