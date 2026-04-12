// electron/core/ControllerRegistry.ts

import { IPCManager } from "./IPCManager";
import { CategoryController } from "../controller/CategoryController";
import { DatasetController } from "../controller/DatasetController";
import { FileController } from "../controller/FileController";
import { OutlierDetectionController } from "../controller/OutlierDetectionController";
import { SettingsController } from "../controller/SettingsController";
import { ImputationController } from "../controller/ImputationController";
import { FluxPartitioningController } from "../controller/FluxPartitioningController";
import { ExportController } from "../controller/ExportController";
import { ExportService } from "../service/ExportService";
import { WorkflowController } from "../controller/WorkflowController";
import { WorkflowRepository } from "../repository/WorkflowRepository";
import { WorkflowService } from "../service/WorkflowService";
import { MySQLController } from "../controller/MySQLController";
import { MySQLService } from "../service/MySQLService";
import {
  OutlierDetectionExecutor,
  ImputationExecutor,
  FluxPartitioningExecutor,
  ExportExecutor,
} from "../service/workflow-executors";

// 引入新的分层架构
import { CategoryDBRepository } from "../repository/CategoryDBRepository";
import { DatasetDBRepository } from "../repository/DatasetDBRepository";
import { OutlierDetectionRepository } from "../repository/OutlierDetectionRepository";
import { SettingsRepository } from "../repository/SettingsRepository";
import { CategoryService } from "../service/CategoryService";
import { DatasetService } from "../service/DatasetService";
import { ImportQueueService } from "../service/ImportQueueService";
import { OutlierDetectionService } from "../service/OutlierDetectionService";
import { SettingsService } from "../service/SettingsService";

/**
 * 控制器注册器 - 完整重构版
 * 职责：依赖注入容器、路由注册管理
 */
export class ControllerRegistry {
  // 数据访问层
  private categoryRepository!: CategoryDBRepository;
  private datasetRepository!: DatasetDBRepository;
  private outlierRepository!: OutlierDetectionRepository;
  private settingsRepository!: SettingsRepository;

  // 业务逻辑层
  private categoryService!: CategoryService;
  private datasetService!: DatasetService;
  private importQueueService!: ImportQueueService;
  private outlierService!: OutlierDetectionService;
  private settingsService!: SettingsService;

  // 控制器层
  private categoryController!: CategoryController;
  private datasetController!: DatasetController;
  private fileController!: FileController;
  private outlierController!: OutlierDetectionController;
  private settingsController!: SettingsController;
  private imputationController!: ImputationController;
  private fluxPartitioningController!: FluxPartitioningController;
  private exportController!: ExportController;
  private exportService!: ExportService;
  private workflowRepository!: WorkflowRepository;
  private workflowService!: WorkflowService;
  private workflowController!: WorkflowController;
  private mysqlService!: MySQLService;
  private mysqlController!: MySQLController;

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
      this.categoryRepository = new CategoryDBRepository();
      console.log("✓ CategoryRepository 初始化完成");

      this.datasetRepository = new DatasetDBRepository();
      console.log("✓ DatasetRepository 初始化完成");

      this.outlierRepository = new OutlierDetectionRepository();
      console.log("✓ OutlierDetectionRepository 初始化完成");

      this.settingsRepository = new SettingsRepository();
      console.log("✓ SettingsRepository 初始化完成");

      // 2. 初始化业务逻辑层 (Service Layer)
      this.categoryService = new CategoryService(this.categoryRepository, this.datasetRepository);
      console.log("✓ CategoryService 初始化完成");

      this.datasetService = new DatasetService(
        this.datasetRepository,
        this.categoryRepository,
        this.settingsRepository
      );
      console.log("✓ DatasetService 初始化完成");

      this.importQueueService = new ImportQueueService(this.datasetService);
      console.log("✓ ImportQueueService 初始化完成");

      this.outlierService = new OutlierDetectionService(this.outlierRepository, this.datasetRepository);
      console.log("✓ OutlierDetectionService 初始化完成");

      this.settingsService = new SettingsService(this.settingsRepository);
      console.log("✓ SettingsService 初始化完成");

      // 3. 初始化控制器层 (Controller Layer)
      this.categoryController = new CategoryController(this.categoryService);
      console.log("✓ CategoryController 初始化完成");

      this.datasetController = new DatasetController(this.datasetService, this.importQueueService);
      console.log("✓ DatasetController 初始化完成");

      this.fileController = new FileController();
      console.log("✓ FileController 初始化完成");

      this.outlierController = new OutlierDetectionController(this.outlierService);
      console.log("✓ OutlierDetectionController 初始化完成");

      this.settingsController = new SettingsController(this.settingsService);
      console.log("✓ SettingsController 初始化完成");

      this.imputationController = new ImputationController();
      console.log("✓ ImputationController 初始化完成");

      this.fluxPartitioningController = new FluxPartitioningController();
      console.log("✓ FluxPartitioningController 初始化完成");

      this.exportService = new ExportService(this.datasetRepository);
      console.log("✓ ExportService 初始化完成");

      this.exportController = new ExportController(this.exportService);
      console.log("✓ ExportController 初始化完成");

      // 4. 初始化工作流模块
      this.workflowRepository = new WorkflowRepository();
      console.log("✓ WorkflowRepository 初始化完成");

      this.workflowService = new WorkflowService(this.workflowRepository);
      // 注册节点执行器
      this.workflowService.registerExecutor(new OutlierDetectionExecutor(this.outlierService));
      this.workflowService.registerExecutor(new ImputationExecutor(this.imputationController));
      this.workflowService.registerExecutor(new FluxPartitioningExecutor(this.fluxPartitioningController));
      this.workflowService.registerExecutor(new ExportExecutor(this.exportService));
      console.log("✓ WorkflowService 初始化完成（含节点执行器）");

      this.workflowController = new WorkflowController(this.workflowService, null);
      console.log("✓ WorkflowController 初始化完成");

      this.mysqlService = new MySQLService(this.datasetService);
      console.log("✓ MySQLService 初始化完成");

      this.mysqlController = new MySQLController(this.mysqlService);
      console.log("✓ MySQLController 初始化完成");

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
      this.registerCategoryRoutes();
      this.registerDatasetRoutes();
      this.registerFileRoutes();
      this.registerOutlierDetectionRoutes();
      this.registerSettingsRoutes();
      this.registerImputationRoutes();
      this.registerFluxPartitioningRoutes();
      this.registerExportRoutes();
      this.registerWorkflowRoutes();
      this.registerMySQLRoutes();

      console.log("所有控制器路由已注册");
      console.log("已注册路由:", IPCManager.getRegisteredRoutes());
    } catch (error: any) {
      console.error("路由注册失败:", error);
      throw new Error(`路由注册失败: ${error.message}`);
    }
  }

  /**
   * 注册分类相关路由
   */
  private registerCategoryRoutes() {
    const routes = [
      {
        path: "categories/get-all",
        handler: this.categoryController.getCategories.bind(this.categoryController),
        description: "获取所有分类",
      },
      {
        path: "categories/get-by-id",
        handler: this.categoryController.getCategoryById.bind(this.categoryController),
        description: "根据ID获取分类",
      },
      {
        path: "categories/create",
        handler: this.categoryController.createCategory.bind(this.categoryController),
        description: "创建新分类",
      },
      {
        path: "categories/update",
        handler: this.categoryController.updateCategory.bind(this.categoryController),
        description: "更新分类信息",
      },
      {
        path: "categories/delete",
        handler: this.categoryController.deleteCategory.bind(this.categoryController),
        description: "删除分类",
      },
      {
        path: "categories/batch-delete",
        handler: this.categoryController.batchDeleteCategories.bind(this.categoryController),
        description: "批量删除分类",
      },
      {
        path: "categories/check-name",
        handler: this.categoryController.checkCategoryName.bind(this.categoryController),
        description: "检查分类名称可用性",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`分类路由注册完成，共 ${routes.length} 个路由`);
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
        path: "datasets/batch-import",
        handler: this.datasetController.batchImport.bind(this.datasetController),
        description: "批量导入数据集",
      },
      {
        path: "datasets/get-by-category",
        handler: this.datasetController.getCategoryDatasets.bind(this.datasetController),
        description: "获取分类数据集",
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
        path: "datasets/get-version-missing-stats",
        handler: this.datasetController.getDatasetVersionMissingStats.bind(this.datasetController),
        description: "获取版本缺失值统计信息",
      },
      {
        path: "datasets/export",
        handler: this.datasetController.exportDatasetVersion.bind(this.datasetController),
        description: "导出数据集版本",
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
      {
        path: "datasets/delete-version",
        handler: this.datasetController.deleteDatasetVersion.bind(this.datasetController),
        description: "删除数据集版本",
      },
      {
        path: "datasets/update-version",
        handler: this.datasetController.updateDatasetVersion.bind(this.datasetController),
        description: "更新数据集版本备注",
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
      // 用户自定义阈值模板
      {
        path: "outlier/create-user-template",
        handler: this.outlierController.createUserTemplate.bind(this.outlierController),
        description: "直接创建用户自定义模板",
      },
      {
        path: "outlier/save-as-template",
        handler: this.outlierController.saveAsTemplate.bind(this.outlierController),
        description: "保存当前阈值配置为模板",
      },
      {
        path: "outlier/get-user-templates",
        handler: this.outlierController.getUserTemplates.bind(this.outlierController),
        description: "获取用户自定义模板列表",
      },
      {
        path: "outlier/update-user-template",
        handler: this.outlierController.updateUserTemplate.bind(this.outlierController),
        description: "更新用户自定义模板",
      },
      {
        path: "outlier/delete-user-template",
        handler: this.outlierController.deleteUserTemplate.bind(this.outlierController),
        description: "删除用户自定义模板",
      },
      {
        path: "outlier/apply-user-template",
        handler: this.outlierController.applyUserTemplate.bind(this.outlierController),
        description: "应用用户自定义模板",
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
        path: "outlier/execute-detection",
        handler: this.outlierController.executeDetection.bind(this.outlierController),
        description: "通用检测执行(支持所有方法)",
      },
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
        path: "outlier/get-result-stats",
        handler: this.outlierController.getOutlierResultStats.bind(this.outlierController),
        description: "获取检测结果统计",
      },
      {
        path: "outlier/delete-detection-result",
        handler: this.outlierController.deleteDetectionResult.bind(this.outlierController),
        description: "删除检测结果",
      },
      {
        path: "outlier/rename-detection-result",
        handler: this.outlierController.renameDetectionResult.bind(this.outlierController),
        description: "重命名检测结果",
      },
      // 结果应用与回退
      {
        path: "outlier/apply-filtering",
        handler: this.outlierController.applyOutlierFiltering.bind(this.outlierController),
        description: "应用异常值过滤",
      },
      {
        path: "outlier/revert-filtering",
        handler: this.outlierController.revertOutlierFiltering.bind(this.outlierController),
        description: "撤销异常值过滤",
      },
      {
        path: "outlier/reorder-results",
        handler: this.outlierController.reorderResults.bind(this.outlierController),
        description: "更新排序顺序",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`异常检测路由注册完成，共 ${routes.length} 个路由`);
  }

  /**
   * 注册系统设置相关路由
   */
  private registerSettingsRoutes() {
    const routes = [
      {
        path: "settings/get-all",
        handler: this.settingsController.getAllSettings.bind(this.settingsController),
        description: "获取所有系统设置",
      },
      {
        path: "settings/get",
        handler: this.settingsController.getSetting.bind(this.settingsController),
        description: "获取单个设置",
      },
      {
        path: "settings/update",
        handler: this.settingsController.updateSetting.bind(this.settingsController),
        description: "更新单个设置",
      },
      {
        path: "settings/update-batch",
        handler: this.settingsController.updateSettings.bind(this.settingsController),
        description: "批量更新设置",
      },
      {
        path: "settings/get-timezone",
        handler: this.settingsController.getTimezone.bind(this.settingsController),
        description: "获取时区设置",
      },
      {
        path: "settings/set-timezone",
        handler: this.settingsController.setTimezone.bind(this.settingsController),
        description: "设置时区",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`系统设置路由注册完成，共 ${routes.length} 个路由`);
  }

  /**
   * 注册缺失值插补相关路由
   */
  private registerImputationRoutes() {
    const routes = this.imputationController.getRoutes();
    let count = 0;

    for (const [path, handler] of Object.entries(routes)) {
      IPCManager.registerRoute(path, handler);
      console.log(`✓ 注册路由: ${path}`);
      count++;
    }

    console.log(`缺失值插补路由注册完成，共 ${count} 个路由`);
  }

  /**
   * 注册通量分割相关路由
   */
  private registerFluxPartitioningRoutes() {
    const routes = this.fluxPartitioningController.getRoutes();
    let count = 0;

    for (const [path, handler] of Object.entries(routes)) {
      IPCManager.registerRoute(path, handler);
      console.log(`✓ 注册路由: ${path}`);
      count++;
    }

    console.log(`通量分割路由注册完成，共 ${count} 个路由`);
  }

  /**
   * 注册数据导出相关路由
   */
  private registerExportRoutes() {
    const routes = this.exportController.getRoutes();
    let count = 0;

    for (const [path, handler] of Object.entries(routes)) {
      IPCManager.registerRoute(path, handler);
      console.log(`✓ 注册路由: ${path}`);
      count++;
    }

    console.log(`数据导出路由注册完成，共 ${count} 个路由`);
  }

  /**
   * 注册自动化工作流相关路由
   */
  private registerWorkflowRoutes() {
    const routes = this.workflowController.getRoutes();
    let count = 0;

    for (const [path, handler] of Object.entries(routes)) {
      IPCManager.registerRoute(path, handler);
      console.log(`✓ 注册路由: ${path}`);
      count++;
    }

    console.log(`自动化工作流路由注册完成，共 ${count} 个路由`);
  }

  /**
   * 设置主窗口引用（用于工作流进度推送）
   */
  setMainWindow(mainWindow: Electron.BrowserWindow) {
    this.workflowController.setMainWindow(mainWindow);
  }

  /**
   * 获取应用健康状态
   */
  getHealthStatus() {
    return {
      dependencies: {
        categoryRepository: !!this.categoryRepository,
        datasetRepository: !!this.datasetRepository,
        categoryService: !!this.categoryService,
        datasetService: !!this.datasetService,
        categoryController: !!this.categoryController,
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

  /**
   * 注册 MySQL 数据库导入相关路由
   */
  private registerMySQLRoutes() {
    const routes = [
      {
        path: "mysql/test-connection",
        handler: this.mysqlController.testConnection.bind(this.mysqlController),
        description: "测试 MySQL 连接",
      },
      {
        path: "mysql/get-tables",
        handler: this.mysqlController.getTables.bind(this.mysqlController),
        description: "获取数据库表列表",
      },
      {
        path: "mysql/get-table-preview",
        handler: this.mysqlController.getTablePreview.bind(this.mysqlController),
        description: "获取表数据预览",
      },
      {
        path: "mysql/import",
        handler: this.mysqlController.importTable.bind(this.mysqlController),
        description: "从 MySQL 表导入数据集",
      },
      {
        path: "mysql/get-connection-profiles",
        handler: this.mysqlController.getConnectionProfiles.bind(this.mysqlController),
        description: "获取保存的数据库连接配置",
      },
      {
        path: "mysql/save-connection-profile",
        handler: this.mysqlController.saveConnectionProfile.bind(this.mysqlController),
        description: "保存数据库连接配置",
      },
      {
        path: "mysql/delete-connection-profile",
        handler: this.mysqlController.deleteConnectionProfile.bind(this.mysqlController),
        description: "删除数据库连接配置",
      },
      {
        path: "mysql/get-beon-site-rules",
        handler: this.mysqlController.getBEONSiteRules.bind(this.mysqlController),
        description: "获取 BEON 站点规则",
      },
      {
        path: "mysql/save-beon-site-rule",
        handler: this.mysqlController.saveBEONSiteRule.bind(this.mysqlController),
        description: "保存 BEON 站点规则",
      },
      {
        path: "mysql/delete-beon-site-rule",
        handler: this.mysqlController.deleteBEONSiteRule.bind(this.mysqlController),
        description: "删除 BEON 站点规则",
      },
      {
        path: "mysql/resolve-beon-site-context",
        handler: this.mysqlController.resolveBEONSiteContext.bind(this.mysqlController),
        description: "解析 BEON 站点规则上下文",
      },
    ];

    routes.forEach(route => {
      IPCManager.registerRoute(route.path, route.handler);
      console.log(`✓ 注册路由: ${route.path} - ${route.description}`);
    });

    console.log(`MySQL 导入路由注册完成，共 ${routes.length} 个路由`);
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
