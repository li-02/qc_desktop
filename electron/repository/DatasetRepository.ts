// electron/repositories/DatasetRepository.ts

import * as fs from "fs";
import * as path from "path";
import {
  DatasetInfo,
  DatasetBaseInfo,
  ServiceResponse,
  ProjectInfo,
} from "@shared/types/projectInterface";

/**
 * 数据集数据访问层
 * 职责：纯粹的数据集数据读写操作，不包含业务逻辑
 */
export class DatasetRepository {
  // #region 数据集元数据操作

  /**
   * 读取数据集元数据文件
   */
  async readDatasetMetadata(
    datasetDirPath: string
  ): Promise<ServiceResponse<DatasetInfo>> {
    try {
      const metadataPath = path.join(datasetDirPath, "metadata.json");

      if (!fs.existsSync(metadataPath)) {
        return {
          success: false,
          error: "数据集元数据文件不存在",
        };
      }

      const content = fs.readFileSync(metadataPath, "utf-8");
      const datasetInfo: DatasetInfo = JSON.parse(content);

      return { success: true, data: datasetInfo };
    } catch (error: any) {
      return {
        success: false,
        error: `读取数据集元数据失败: ${error.message}`,
      };
    }
  }

  /**
   * 写入数据集元数据文件
   */
  async writeDatasetMetadata(
    datasetInfo: DatasetInfo
  ): Promise<ServiceResponse<void>> {
    try {
      const metadataPath = path.join(datasetInfo.dirPath, "metadata.json");
      datasetInfo.updatedAt = Date.now();

      const content = JSON.stringify(datasetInfo, null, 2);
      fs.writeFileSync(metadataPath, content, "utf-8");

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `写入数据集元数据失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 数据集目录操作

  /**
   * 创建数据集目录
   */
  async createDatasetDirectory(
    datasetDirPath: string
  ): Promise<ServiceResponse<void>> {
    try {
      if (fs.existsSync(datasetDirPath)) {
        return {
          success: false,
          error: "数据集目录已存在",
        };
      }

      fs.mkdirSync(datasetDirPath, { recursive: true });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `创建数据集目录失败: ${error.message}`,
      };
    }
  }

  /**
   * 删除数据集目录
   */
  async deleteDatasetDirectory(
    datasetDirPath: string
  ): Promise<ServiceResponse<void>> {
    try {
      if (fs.existsSync(datasetDirPath)) {
        fs.rmSync(datasetDirPath, { recursive: true, force: true });
      }
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `删除数据集目录失败: ${error.message}`,
      };
    }
  }

  /**
   * 检查数据集目录是否存在
   */
  async datasetDirectoryExists(datasetDirPath: string): Promise<boolean> {
    return fs.existsSync(datasetDirPath);
  }

  /**
   * 检查数据集元数据文件是否存在
   */
  async datasetMetadataExists(datasetDirPath: string): Promise<boolean> {
    const metadataPath = path.join(datasetDirPath, "metadata.json");
    return fs.existsSync(metadataPath);
  }

  // #endregion

  // #region 文件操作

  /**
   * 复制原始文件到数据集目录
   */
  async copyOriginalFile(
    sourcePath: string,
    targetPath: string
  ): Promise<ServiceResponse<void>> {
    try {
      if (!fs.existsSync(sourcePath)) {
        return {
          success: false,
          error: "源文件不存在",
        };
      }

      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.copyFileSync(sourcePath, targetPath);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `复制文件失败: ${error.message}`,
      };
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<ServiceResponse<void>> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `删除文件失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取文件大小
   */
  async getFileSize(filePath: string): Promise<ServiceResponse<number>> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: "文件不存在",
        };
      }

      const stats = fs.statSync(filePath);
      return { success: true, data: stats.size };
    } catch (error: any) {
      return {
        success: false,
        error: `获取文件大小失败: ${error.message}`,
      };
    }
  }

  // #endregion

  // #region 辅助方法

  /**
   * 将DatasetInfo转换为DatasetBaseInfo
   */
  toDatasetBaseInfo(
    dataset: DatasetInfo,
    projectPath: string
  ): DatasetBaseInfo {
    // 获取数据集目录相对于项目目录的相对路径
    // 例如：dataset.dirPath = "/projects/测试2/数据集1"
    //      projectPath = "/projects/测试2"
    //      结果应该是：数据集1
    const relativePath = path.relative(projectPath, dataset.dirPath);

    return {
      id: dataset.id,
      name: dataset.name,
      type: dataset.type,
      dirPath: relativePath, // 使用相对路径
      originalFile: path.basename(dataset.originalFile.filePath),
      createdAt: dataset.createdAt,
      belongTo: dataset.belongTo,
    };
  }

  /**
   * 根据项目路径和数据集基本信息构建完整路径
   */
  buildDatasetPath(
    projectPath: string,
    datasetBaseInfo: DatasetBaseInfo
  ): string {
    // 如果dirPath已经是绝对路径，直接返回
    if (path.isAbsolute(datasetBaseInfo.dirPath)) {
      return datasetBaseInfo.dirPath;
    }

    // 否则拼接相对路径
    return path.join(projectPath, datasetBaseInfo.dirPath);
  }

  /**
   * 获取数据集的所有文件列表
   */
  async getDatasetFiles(
    datasetDirPath: string
  ): Promise<ServiceResponse<string[]>> {
    try {
      if (!fs.existsSync(datasetDirPath)) {
        return {
          success: false,
          error: "数据集目录不存在",
        };
      }

      const files = fs.readdirSync(datasetDirPath).filter((file) => {
        const filePath = path.join(datasetDirPath, file);
        return fs.statSync(filePath).isFile();
      });

      return { success: true, data: files };
    } catch (error: any) {
      return {
        success: false,
        error: `获取文件列表失败: ${error.message}`,
      };
    }
  }

  /**
   * 验证数据集目录结构
   */
  async validateDatasetStructure(datasetDirPath: string): Promise<
    ServiceResponse<{
      hasMetadata: boolean;
      hasOriginalFile: boolean;
      fileCount: number;
    }>
  > {
    try {
      if (!fs.existsSync(datasetDirPath)) {
        return {
          success: false,
          error: "数据集目录不存在",
        };
      }

      const hasMetadata = await this.datasetMetadataExists(datasetDirPath);

      let hasOriginalFile = false;
      let fileCount = 0;

      if (hasMetadata) {
        const metadataResult = await this.readDatasetMetadata(datasetDirPath);
        if (metadataResult.success) {
          hasOriginalFile = fs.existsSync(
            metadataResult.data!.originalFile.filePath
          );
        }
      }

      const filesResult = await this.getDatasetFiles(datasetDirPath);
      if (filesResult.success) {
        fileCount = filesResult.data!.length;
      }

      return {
        success: true,
        data: {
          hasMetadata,
          hasOriginalFile,
          fileCount,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `验证数据集结构失败: ${error.message}`,
      };
    }
  }

  // #endregion
}
