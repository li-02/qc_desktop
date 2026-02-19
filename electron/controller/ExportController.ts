import { BaseController } from "./BaseController";
import { ExportService } from "../service/ExportService";
import { IpcMainInvokeEvent } from "electron";
import type { ExportOptions, ExportPreviewRequest } from "@shared/types/exportData";

/**
 * 数据导出控制器
 */
export class ExportController extends BaseController {
  private exportService: ExportService;

  constructor(exportService: ExportService) {
    super();
    this.exportService = exportService;
  }

  /**
   * 获取导出预览
   */
  async getExportPreview(args: ExportPreviewRequest, _event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.versionId || typeof args.versionId !== "number") {
        throw new Error("版本ID不能为空");
      }

      const result = await this.exportService.getExportPreview(args);
      if (!result.success) {
        throw new Error(result.error || "获取预览失败");
      }
      return result.data;
    });
  }

  /**
   * 执行数据导出（弹出保存对话框）
   */
  async executeExport(args: ExportOptions, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const { dialog, BrowserWindow } = require("electron");

      if (!args.versionId) {
        throw new Error("版本ID不能为空");
      }

      // 弹出保存对话框
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) {
        throw new Error("无法获取当前窗口");
      }

      const isXlsx = args.format === "xlsx";
      const defaultName = args.defaultFileName
        ? isXlsx
          ? args.defaultFileName.replace(/\.csv$/i, ".xlsx")
          : args.defaultFileName
        : isXlsx
          ? "export_data.xlsx"
          : "export_data.csv";

      const saveResult = await dialog.showSaveDialog(win, {
        title: "导出数据",
        defaultPath: defaultName,
        filters: isXlsx
          ? [
              { name: "Excel Files", extensions: ["xlsx"] },
              { name: "All Files", extensions: ["*"] },
            ]
          : [
              { name: "CSV Files", extensions: ["csv"] },
              { name: "All Files", extensions: ["*"] },
            ],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { canceled: true };
      }

      // 执行导出
      const exportResult = await this.exportService.executeExport(args, saveResult.filePath);
      if (!exportResult.success) {
        throw new Error(exportResult.error || "导出失败");
      }

      return {
        success: true,
        filePath: saveResult.filePath,
        rowCount: exportResult.data!.rowCount,
      };
    });
  }

  /**
   * 获取路由映射
   */
  getRoutes(): Record<string, (...args: any[]) => any> {
    return {
      "export:getPreview": this.getExportPreview.bind(this),
      "export:execute": this.executeExport.bind(this),
    };
  }
}
