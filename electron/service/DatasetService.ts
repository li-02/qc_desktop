// electron/services/DatasetService.ts

import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import { DatasetRepository } from "../repository/DatasetRepository";
import { ProjectRepository } from "../repository/ProjectRepository";
import {
  DatasetInfo,
  ImportDatasetRequest,
  ServiceResponse,
  ProjectInfo,
  DataQualityInfo,
} from "@shared/types/projectInterface";

/**
 * 数据集业务逻辑层
 * 职责：处理数据集相关的业务逻辑、数据验证、业务规则执行
 */
export class DatasetService {
  private datasetRepository: DatasetRepository;
  private projectRepository: ProjectRepository;

  constructor(datasetRepository: DatasetRepository, projectRepository: ProjectRepository) {
    this.datasetRepository = datasetRepository;
    this.projectRepository = projectRepository;
  }

  // #region 数据集导入

  /**
   * 导入数据集
   */
  async importDataset(request: ImportDatasetRequest): Promise<
    ServiceResponse<{
      datasetId: string;
      datasetName: string;
      path: string;
    }>
  > {
    try {
      // 1. 业务规则验证
      const validationResult = await this.validateImportRequest(request);
      if (!validationResult.success) {
        throw new Error(validationResult.error);
      }

      // 2. 获取项目信息
      const projectResult = await this.projectRepository.readProjectConfig(
        await this.getProjectPathById(request.projectId)
      );
      if (!projectResult.success) {
        throw new Error("项目不存在或无法访问");
      }

      const project = projectResult.data!;

      // 3. 检查数据集名称是否已存在
      const nameCheckResult = await this.checkDatasetNameAvailable(project, request.datasetName);
      if (!nameCheckResult.success || !nameCheckResult.data) {
        return {
          success: false,
          error: nameCheckResult.error || `数据集名称 "${request.datasetName}" 已存在`,
        };
      }

      // 4. 生成数据集信息
      const datasetId = uuidv4();
      const datasetPath = path.join(project.path, request.datasetName); // 使用数据集名称作为目录名
      const now = Date.now();

      // 5. 创建数据集目录
      const createDirResult = await this.datasetRepository.createDatasetDirectory(datasetPath);
      if (!createDirResult.success) {
        return { success: false, error: createDirResult.error };
      }

      // 6. 复制原始文件
      const originalExt = path.extname(request.file.name);
      const originalFilePath = path.join(datasetPath, `original${originalExt}`);

      const copyFileResult = await this.datasetRepository.copyOriginalFile(request.file.path, originalFilePath);
      if (!copyFileResult.success) {
        // 回滚：删除已创建的目录
        await this.datasetRepository.deleteDatasetDirectory(datasetPath);
        return { success: false, error: copyFileResult.error };
      }

      // 进行完整文件解析，获取数据质量信息
      let dataQuality: DataQualityInfo | undefined;
      try {
        const fullParseResult = await this.performFullFileAnalysis(
          originalFilePath,
          request.missingValueTypes,
          originalExt
        );
        if (fullParseResult.success) {
          dataQuality = fullParseResult.data!;
          console.log(`数据质量分析完成： ${fullParseResult.data!}`);
        }
      } catch (error: any) {
        console.warn(`数据质量分析失败 ${error.message}`);
      }

      // 7. 创建数据集元数据
      const metadata: DatasetInfo = {
        id: datasetId,
        name: request.datasetName,
        type: request.type,
        createdAt: now,
        updatedAt: now,
        belongTo: request.projectId,
        dirPath: datasetPath,
        missingValueTypes: [...request.missingValueTypes],
        originalFile: {
          name: request.file.name,
          filePath: originalFilePath,
          size: request.file.size,
          rows: request.rows,
          columns: [...request.columns],
          dataQuality: dataQuality || {
            totalRecords: request.rows,
            completeRecords: request.rows,
            missingValueStats: {},
            totalMissingCount: 0,
            qualityPercentage: 100,
            analyzedAt: now,
            columnMissingStatus: {},
          },
        },
        processedFiles: [],
      };

      // 8. 保存数据集元数据
      const saveMetadataResult = await this.datasetRepository.writeDatasetMetadata(metadata);
      if (!saveMetadataResult.success) {
        // 回滚：删除目录和文件
        await this.datasetRepository.deleteDatasetDirectory(datasetPath);
        return { success: false, error: saveMetadataResult.error };
      }

      // 9. 更新项目配置
      const updateProjectResult = await this.updateProjectWithNewDataset(project, metadata);
      if (!updateProjectResult.success) {
        // 回滚：删除数据集目录
        await this.datasetRepository.deleteDatasetDirectory(datasetPath);
        return { success: false, error: updateProjectResult.error };
      }

      return {
        success: true,
        data: {
          datasetId,
          datasetName: request.datasetName,
          path: datasetPath,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `导入数据集失败: ${error.message}`,
      };
    }
  }
  /**
   * 执行完整文件分析，获取数据质量信息
   */
  private async performFullFileAnalysis(
    filePath: string,
    missingValueTypes: string[],
    fileExtension: string
  ): Promise<ServiceResponse<DataQualityInfo>> {
    try {
      const fs = require("fs");

      // 读取文件内容
      let fileContent: string | ArrayBuffer;
      const fileType = fileExtension.toLowerCase().replace(".", "");

      if (fileType === "csv") {
        fileContent = fs.readFileSync(filePath, "utf-8");
      } else {
        fileContent = fs.readFileSync(filePath);
      }

      // 调用 FileController 的完整解析方法
      const { Worker } = require("worker_threads");
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

        // 发送完整解析请求（maxRows = -1）
        worker.postMessage({
          type: fileType === "csv" ? "csv" : "excel",
          data: fileContent,
          maxRows: -1,
          missingValueTypes,
        });
      });

      // 构建数据质量信息
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
      };

      return { success: true, data: dataQuality };
    } catch (error: any) {
      return {
        success: false,
        error: `文件分析失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 数据集查询

  /**
   * 获取项目的所有数据集
   */
  async getProjectDatasets(projectId: string): Promise<ServiceResponse<DatasetInfo[]>> {
    try {
      // 1. 获取项目信息
      const projectPath = await this.getProjectPathById(projectId);
      const projectResult = await this.projectRepository.readProjectConfig(projectPath);
      if (!projectResult.success) {
        return { success: false, error: "项目不存在或无法访问" };
      }

      const project = projectResult.data!;
      const datasets: DatasetInfo[] = [];

      // 2. 遍历项目中的数据集基本信息，加载完整数据集信息
      for (const datasetBaseInfo of project.datasets) {
        const datasetDirPath = this.datasetRepository.buildDatasetPath(project.path, datasetBaseInfo);

        // 检查数据集目录是否存在
        const dirExists = await this.datasetRepository.datasetDirectoryExists(datasetDirPath);
        if (!dirExists) {
          console.warn(`数据集目录不存在，跳过: ${datasetDirPath}`);
          continue;
        }

        // 检查元数据文件是否存在
        const metadataExists = await this.datasetRepository.datasetMetadataExists(datasetDirPath);
        if (!metadataExists) {
          console.warn(`数据集元数据不存在，跳过: ${datasetDirPath}`);
          continue;
        }

        // 读取数据集完整信息
        const datasetResult = await this.datasetRepository.readDatasetMetadata(datasetDirPath);
        if (datasetResult.success) {
          datasets.push(datasetResult.data!);
        } else {
          console.warn(`读取数据集元数据失败，跳过: ${datasetBaseInfo.name} - ${datasetResult.error}`);
        }
      }

      return {
        success: true,
        data: datasets.sort((a, b) => b.createdAt - a.createdAt),
      };
    } catch (error: any) {
      return {
        success: false,
        error: `获取项目数据集失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取单个数据集信息
   */
  async getDatasetInfo(projectId: string, datasetId: string): Promise<ServiceResponse<DatasetInfo>> {
    try {
      const datasetsResult = await this.getProjectDatasets(projectId);
      if (!datasetsResult.success) {
        return { success: false, error: datasetsResult.error };
      }

      const dataset = datasetsResult.data!.find(d => d.id === datasetId);
      if (!dataset) {
        return {
          success: false,
          error: `找不到ID为 "${datasetId}" 的数据集`,
        };
      }

      return { success: true, data: dataset };
    } catch (error: any) {
      return {
        success: false,
        error: `获取数据集信息失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 数据集管理

  /**
   * 删除数据集
   */
  async deleteDataset(projectId: string, datasetId: string): Promise<ServiceResponse<void>> {
    try {
      // 1. 获取数据集信息
      const datasetResult = await this.getDatasetInfo(projectId, datasetId);
      if (!datasetResult.success) {
        return { success: false, error: datasetResult.error };
      }

      const dataset = datasetResult.data!;

      // 2. 删除数据集目录
      const deleteDirResult = await this.datasetRepository.deleteDatasetDirectory(dataset.dirPath);
      if (!deleteDirResult.success) {
        return { success: false, error: deleteDirResult.error };
      }

      // 3. 从项目配置中移除数据集
      const updateProjectResult = await this.removeDatasetFromProject(projectId, datasetId);
      if (!updateProjectResult.success) {
        return { success: false, error: updateProjectResult.error };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `删除数据集失败: ${error.message}`,
      };
    }
  }

  /**
   * 更新数据集信息
   */
  async updateDataset(
    projectId: string,
    datasetId: string,
    updates: Partial<Omit<DatasetInfo, "id" | "belongTo" | "createdAt">>
  ): Promise<ServiceResponse<DatasetInfo>> {
    try {
      // 1. 获取当前数据集信息
      const datasetResult = await this.getDatasetInfo(projectId, datasetId);
      if (!datasetResult.success) {
        return { success: false, error: datasetResult.error };
      }

      const currentDataset = datasetResult.data!;

      // 2. 如果更新了数据集名称，需要验证名称可用性
      if (updates.name && updates.name !== currentDataset.name) {
        const projectPath = await this.getProjectPathById(projectId);
        const projectResult = await this.projectRepository.readProjectConfig(projectPath);
        if (!projectResult.success) {
          return { success: false, error: "项目不存在或无法访问" };
        }

        const nameCheckResult = await this.checkDatasetNameAvailable(projectResult.data!, updates.name);
        if (!nameCheckResult.success || !nameCheckResult.data) {
          return {
            success: false,
            error: nameCheckResult.error || `数据集名称 "${updates.name}" 已存在`,
          };
        }
      }

      // 3. 合并更新
      const updatedDataset: DatasetInfo = {
        ...currentDataset,
        ...updates,
        id: currentDataset.id, // 确保ID不变
        belongTo: currentDataset.belongTo, // 确保所属项目不变
        createdAt: currentDataset.createdAt, // 确保创建时间不变
        updatedAt: Date.now(),
      };

      // 4. 保存更新后的元数据
      const saveResult = await this.datasetRepository.writeDatasetMetadata(updatedDataset);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      // 5. 如果名称变化，需要更新项目配置中的数据集基本信息
      if (updates.name) {
        const updateProjectResult = await this.updateDatasetInProject(projectId, updatedDataset);
        if (!updateProjectResult.success) {
          return { success: false, error: updateProjectResult.error };
        }
      }

      return { success: true, data: updatedDataset };
    } catch (error: any) {
      return {
        success: false,
        error: `更新数据集失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 私有辅助方法

  /**
   * 验证导入数据集的请求参数
   */
  private async validateImportRequest(request: ImportDatasetRequest): Promise<ServiceResponse<void>> {
    // 验证项目ID
    if (!request.projectId || request.projectId.trim().length === 0) {
      return { success: false, error: "项目ID不能为空" };
    }

    // 验证数据集名称
    if (!request.datasetName || request.datasetName.trim().length === 0) {
      return { success: false, error: "数据集名称不能为空" };
    }

    if (request.datasetName.length > 50) {
      return { success: false, error: "数据集名称不能超过50个字符" };
    }

    // 验证数据类型
    if (!request.type || request.type.trim().length === 0) {
      return { success: false, error: "数据类型不能为空" };
    }

    // 验证文件信息
    if (!request.file || !request.file.name || !request.file.path) {
      return { success: false, error: "文件信息不完整" };
    }

    // 验证数据信息
    if (!request.columns || request.columns.length === 0) {
      return { success: false, error: "列信息不能为空" };
    }

    if (typeof request.rows !== "number" || request.rows <= 0) {
      return { success: false, error: "行数必须是正整数" };
    }

    return { success: true };
  }

  /**
   * 检查数据集名称在项目中是否可用
   */
  private async checkDatasetNameAvailable(
    project: ProjectInfo,
    datasetName: string
  ): Promise<ServiceResponse<boolean>> {
    try {
      const nameExists = project.datasets.some(dataset => dataset.name.toLowerCase() === datasetName.toLowerCase());

      return { success: true, data: !nameExists };
    } catch (error: any) {
      return {
        success: false,
        error: `检查数据集名称失败: ${error.message}`,
      };
    }
  }

  /**
   * 根据项目ID获取项目路径
   */
  private async getProjectPathById(projectId: string): Promise<string> {
    // 这里需要根据项目ID查找项目路径
    // 临时实现：从索引文件中查找
    const indexResult = await this.projectRepository.readProjectsIndex();
    if (!indexResult.success) {
      throw new Error("无法读取项目索引");
    }

    const projectBase = indexResult.data!.projects.find(p => p.id === projectId);
    if (!projectBase) {
      throw new Error(`找不到ID为 "${projectId}" 的项目`);
    }

    return projectBase.path;
  }

  /**
   * 更新项目配置，添加新数据集
   */
  private async updateProjectWithNewDataset(
    project: ProjectInfo,
    dataset: DatasetInfo
  ): Promise<ServiceResponse<void>> {
    try {
      const datasetBaseInfo = this.datasetRepository.toDatasetBaseInfo(dataset, project.path);

      project.datasets.push(datasetBaseInfo);
      project.lastUpdated = Date.now();

      return await this.projectRepository.writeProjectConfig(project);
    } catch (error: any) {
      return {
        success: false,
        error: `更新项目配置失败: ${error.message}`,
      };
    }
  }

  /**
   * 从项目配置中移除数据集
   */
  private async removeDatasetFromProject(projectId: string, datasetId: string): Promise<ServiceResponse<void>> {
    try {
      const projectPath = await this.getProjectPathById(projectId);
      const projectResult = await this.projectRepository.readProjectConfig(projectPath);
      if (!projectResult.success) {
        return { success: false, error: "项目不存在或无法访问" };
      }

      const project = projectResult.data!;
      project.datasets = project.datasets.filter(d => d.id !== datasetId);
      project.lastUpdated = Date.now();

      return await this.projectRepository.writeProjectConfig(project);
    } catch (error: any) {
      return {
        success: false,
        error: `从项目中移除数据集失败: ${error.message}`,
      };
    }
  }

  /**
   * 在项目配置中更新数据集基本信息
   */
  private async updateDatasetInProject(projectId: string, dataset: DatasetInfo): Promise<ServiceResponse<void>> {
    try {
      const projectPath = await this.getProjectPathById(projectId);
      const projectResult = await this.projectRepository.readProjectConfig(projectPath);
      if (!projectResult.success) {
        return { success: false, error: "项目不存在或无法访问" };
      }

      const project = projectResult.data!;
      const datasetIndex = project.datasets.findIndex(d => d.id === dataset.id);

      if (datasetIndex !== -1) {
        project.datasets[datasetIndex] = this.datasetRepository.toDatasetBaseInfo(dataset, project.path);
        project.lastUpdated = Date.now();

        return await this.projectRepository.writeProjectConfig(project);
      }

      return { success: false, error: "在项目中找不到对应的数据集" };
    } catch (error: any) {
      return {
        success: false,
        error: `更新项目中的数据集信息失败: ${error.message}`,
      };
    }
  }

  // #endregion
}
