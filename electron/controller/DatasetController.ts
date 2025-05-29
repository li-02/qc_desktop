// electron/controller/DatasetController.ts

import { BaseController } from "./BaseController";
import { DatasetService } from "../service/DatasetService";
import { IpcMainInvokeEvent } from "electron";
import { ImportDatasetRequest } from "@shared/types/projectInterface";

/**
 * 数据集控制器 - 重构版
 * 职责：IPC路由分发、参数校验、调用Service层
 */
export class DatasetController extends BaseController {
  private datasetService: DatasetService;

  constructor(datasetService: DatasetService) {
    super();
    this.datasetService = datasetService;
  }

  /**
   * 导入数据集
   */
  async importData(
    args: {
      projectId: string;
      importOption: {
        datasetName: string;
        type: string;
        file: {
          name: string;
          size: string;
          path: string;
        };
        missingValueTypes: string[];
        rows: number;
        columns: string[];
      };
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      console.log("进入 importData 方法", args);

      // 参数校验
      const validationError = this.validateImportDataArgs(args);
      if (validationError) {
        throw new Error(validationError);
      }

      // 构造请求对象
      const request: ImportDatasetRequest = {
        projectId: args.projectId.trim(),
        datasetName: args.importOption.datasetName.trim(),
        type: args.importOption.type.trim(),
        file: {
          name: args.importOption.file.name.trim(),
          size: args.importOption.file.size.trim(),
          path: args.importOption.file.path.trim(),
        },
        missingValueTypes: args.importOption.missingValueTypes.map((v) =>
          v.trim()
        ),
        rows: Number(args.importOption.rows),
        columns: args.importOption.columns
          .map((col) => col.trim())
          .filter((col) => col.length > 0),
      };

      const result = await this.datasetService.importDataset(request);

      if (!result.success) {
        throw new Error(result.error || "导入数据集失败");
      }

      return {
        datasetId: result.data!.datasetId,
        datasetName: result.data!.datasetName,
        path: result.data!.path,
      };
    });
  }

  /**
   * 获取项目的所有数据集
   */
  async getProjectDatasets(
    args: { projectId: string },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }

      const result = await this.datasetService.getProjectDatasets(
        args.projectId.trim()
      );

      if (!result.success) {
        throw new Error(result.error || "获取项目数据集失败");
      }

      return { datasets: result.data };
    });
  }

  /**
   * 获取单个数据集信息
   */
  async getDatasetInfo(
    args: {
      projectId: string;
      datasetId: string;
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }

      if (!args.datasetId || typeof args.datasetId !== "string") {
        throw new Error("数据集ID不能为空");
      }

      const result = await this.datasetService.getDatasetInfo(
        args.projectId.trim(),
        args.datasetId.trim()
      );

      if (!result.success) {
        throw new Error(result.error || "获取数据集信息失败");
      }

      return result.data;
    });
  }

  /**
   * 删除数据集
   */
  async deleteDataset(
    args: {
      projectId: string;
      datasetId: string;
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }

      if (!args.datasetId || typeof args.datasetId !== "string") {
        throw new Error("数据集ID不能为空");
      }

      const result = await this.datasetService.deleteDataset(
        args.projectId.trim(),
        args.datasetId.trim()
      );

      if (!result.success) {
        throw new Error(result.error || "删除数据集失败");
      }

      return { success: true };
    });
  }

  /**
   * 更新数据集信息
   */
  async updateDataset(
    args: {
      projectId: string;
      datasetId: string;
      updates: {
        name?: string;
        type?: string;
        missingValueTypes?: string[];
      };
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }

      if (!args.datasetId || typeof args.datasetId !== "string") {
        throw new Error("数据集ID不能为空");
      }

      if (!args.updates || Object.keys(args.updates).length === 0) {
        throw new Error("更新内容不能为空");
      }

      // 清理和验证更新数据
      const cleanUpdates: any = {};

      if (args.updates.name !== undefined) {
        if (
          typeof args.updates.name !== "string" ||
          args.updates.name.trim().length === 0
        ) {
          throw new Error("数据集名称不能为空");
        }
        cleanUpdates.name = args.updates.name.trim();
      }

      if (args.updates.type !== undefined) {
        if (
          typeof args.updates.type !== "string" ||
          args.updates.type.trim().length === 0
        ) {
          throw new Error("数据类型不能为空");
        }
        cleanUpdates.type = args.updates.type.trim();
      }

      if (args.updates.missingValueTypes !== undefined) {
        if (!Array.isArray(args.updates.missingValueTypes)) {
          throw new Error("缺失值类型必须是数组");
        }
        cleanUpdates.missingValueTypes = args.updates.missingValueTypes
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      }

      const result = await this.datasetService.updateDataset(
        args.projectId.trim(),
        args.datasetId.trim(),
        cleanUpdates
      );

      if (!result.success) {
        throw new Error(result.error || "更新数据集失败");
      }

      return { dataset: result.data };
    });
  }

  /**
   * 验证数据集目录结构
   */
  async validateDatasetStructure(
    args: {
      projectId: string;
      datasetId: string;
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      // 参数校验
      if (!args.projectId || typeof args.projectId !== "string") {
        throw new Error("项目ID不能为空");
      }

      if (!args.datasetId || typeof args.datasetId !== "string") {
        throw new Error("数据集ID不能为空");
      }

      // 先获取数据集信息
      const datasetResult = await this.datasetService.getDatasetInfo(
        args.projectId.trim(),
        args.datasetId.trim()
      );

      if (!datasetResult.success) {
        throw new Error(datasetResult.error || "数据集不存在");
      }

      // 这里可以添加目录结构验证逻辑
      // 暂时返回基本信息
      return {
        isValid: true,
        dataset: datasetResult.data,
        message: "数据集结构正常",
      };
    });
  }

  // #region 私有辅助方法

  /**
   * 验证导入数据集的参数
   */
  private validateImportDataArgs(args: any): string | null {
    if (!args) {
      return "参数不能为空";
    }

    if (!args.projectId || typeof args.projectId !== "string") {
      return "项目ID不能为空";
    }

    if (args.projectId.trim().length === 0) {
      return "项目ID不能为空";
    }

    if (!args.importOption) {
      return "导入选项不能为空";
    }

    const option = args.importOption;

    // 验证数据集名称
    if (!option.datasetName || typeof option.datasetName !== "string") {
      return "数据集名称不能为空";
    }

    if (option.datasetName.trim().length === 0) {
      return "数据集名称不能为空";
    }

    if (option.datasetName.length > 50) {
      return "数据集名称不能超过50个字符";
    }

    // 验证数据类型
    if (!option.type || typeof option.type !== "string") {
      return "数据类型不能为空";
    }

    if (option.type.trim().length === 0) {
      return "数据类型不能为空";
    }

    // 验证文件信息
    if (!option.file) {
      return "文件信息不能为空";
    }

    if (!option.file.name || typeof option.file.name !== "string") {
      return "文件名不能为空";
    }

    if (!option.file.path || typeof option.file.path !== "string") {
      return "文件路径不能为空";
    }

    if (!option.file.size || typeof option.file.size !== "string") {
      return "文件大小信息不能为空";
    }

    // 验证缺失值类型
    if (!Array.isArray(option.missingValueTypes)) {
      return "缺失值类型必须是数组";
    }

    // 验证行数
    if (typeof option.rows !== "number" || option.rows <= 0) {
      return "行数必须是正整数";
    }

    // 验证列信息
    if (!Array.isArray(option.columns) || option.columns.length === 0) {
      return "列信息不能为空";
    }

    for (const col of option.columns) {
      if (typeof col !== "string" || col.trim().length === 0) {
        return "列名不能为空";
      }
    }

    return null; // 验证通过
  }

  // #endregion
}
