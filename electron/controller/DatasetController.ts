import { BaseController } from "./BaseController";
import { ProjectManager } from "../project";
import { IpcMainInvokeEvent } from "electron";
import { ImportOption } from "../../shared/types/projectInterface";

export class DatasetController extends BaseController {
  constructor(private projectManager: ProjectManager) {
    super();
  }

  /**
   * 导入数据
   */
  async importData(
    args: {
      projectId: string;
      importOption: {
        type: string;
        file: {
          name: string;
          size: number;
          content: string | ArrayBuffer;
        };
        datasetName: string;
        missingValueTypes: string[];
        rows: number;
        columns: string[];
      };
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      const result = this.projectManager.importData(
        args.projectId,
        args.importOption
      );
      const datasetInfo = this.projectManager.getDatasetInfo(
        args.projectId,
        result.datasetId
      );

      return {
        dataset: {
          id: result.datasetId,
          datasetName: result.datasetName,
          type: args.importOption.type,
          path: result.path,
          originalFileName: args.importOption.file.name,
          rows: args.importOption.rows,
          columns: args.importOption.columns,
          createdAt: datasetInfo?.createdAt || Date.now(),
        },
      };
    });
  }

  /**
   * 获取项目数据集
   */
  async getProjectDatasets(
    args: {
      projectId: string;
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      const datasets = this.projectManager.getProjectDatasets(args.projectId);
      return { datasets };
    });
  }

  /**
   * 获取数据集信息
   */
  async getDatasetInfo(
    args: {
      projectId: string;
      datasetId: string;
    },
    event: IpcMainInvokeEvent
  ) {
    return this.handleAsync(async () => {
      const dataset = this.projectManager.getDatasetInfo(
        args.projectId,
        args.datasetId
      );
      if (!dataset) {
        throw new Error("数据集不存在");
      }
      return { dataset };
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
      const success = this.projectManager.deleteDataset(
        args.projectId,
        args.datasetId
      );
      return { success };
    });
  }
}
