import * as fs from "fs";
import * as path from "path";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";
import { DatasetDBRepository } from "../repository/DatasetDBRepository";
import { ServiceResponse } from "@shared/types/projectInterface";
import type {
  ExportOptions,
  ExportPreviewRequest,
  ExportPreviewResult,
  ExportColumnInfo,
} from "@shared/types/exportData";

export class ExportService {
  private datasetRepository: DatasetDBRepository;

  constructor(datasetRepository: DatasetDBRepository) {
    this.datasetRepository = datasetRepository;
  }

  /**
   * 获取导出预览（列信息 + 样本数据）
   */
  async getExportPreview(request: ExportPreviewRequest): Promise<ServiceResponse<ExportPreviewResult>> {
    try {
      const { versionId, maxRows = 10 } = request;

      // 获取版本信息
      const versionResult = this.datasetRepository.getDatasetVersionById(versionId);
      if (!versionResult.success || !versionResult.data) {
        return { success: false, error: "未找到版本信息" };
      }

      const version = versionResult.data;
      if (!version.file_path || !fs.existsSync(version.file_path)) {
        return { success: false, error: "版本数据文件不存在" };
      }

      // 读取 CSV 文件
      const fileContent = fs.readFileSync(version.file_path, "utf-8");
      const parsed = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors.length > 0 && !parsed.data.length) {
        return { success: false, error: "CSV 文件解析失败" };
      }

      const allRows = parsed.data as Record<string, string>[];
      const columnNames = parsed.meta.fields || [];

      // 获取版本统计信息（如果有的话）
      let columnStatsMap: Record<string, number> = {};
      try {
        const statsResult = this.datasetRepository.getStatByVersionId(versionId);
        if (statsResult.success && statsResult.data?.column_stats_json) {
          const parsedStats = JSON.parse(statsResult.data.column_stats_json);
          for (const [colName, stats] of Object.entries(parsedStats)) {
            columnStatsMap[colName] = (stats as any).missing_count || 0;
          }
        }
      } catch {
        // 统计信息非必须
      }

      // 构建列信息
      const columns: ExportColumnInfo[] = columnNames.map((name, index) => {
        // 取前 5 个非空样本值
        const sampleValues: string[] = [];
        for (let i = 0; i < Math.min(allRows.length, 50) && sampleValues.length < 5; i++) {
          const val = allRows[i][name];
          if (val !== undefined && val !== null && val !== "") {
            sampleValues.push(String(val));
          }
        }
        return {
          name,
          index,
          sampleValues,
          missingCount: columnStatsMap[name] || 0,
          totalCount: allRows.length,
        };
      });

      // 取样本数据
      const sampleData = allRows.slice(0, maxRows).map(row => {
        const record: Record<string, string> = {};
        for (const col of columnNames) {
          record[col] = row[col] !== undefined ? String(row[col]) : "";
        }
        return record;
      });

      return {
        success: true,
        data: {
          columns,
          sampleData,
          totalRows: allRows.length,
          filePath: version.file_path,
        },
      };
    } catch (error: any) {
      return { success: false, error: `获取预览失败: ${error.message}` };
    }
  }

  /**
   * 执行数据导出
   */
  async executeExport(options: ExportOptions, targetPath: string): Promise<ServiceResponse<{ rowCount: number }>> {
    try {
      const { versionId, selectedColumns, format, delimiter, missingValueOutput, includeHeader } = options;

      // 获取版本信息
      const versionResult = this.datasetRepository.getDatasetVersionById(versionId);
      if (!versionResult.success || !versionResult.data) {
        return { success: false, error: "未找到版本信息" };
      }

      const version = versionResult.data;
      if (!version.file_path || !fs.existsSync(version.file_path)) {
        return { success: false, error: "版本数据文件不存在" };
      }

      // 读取源 CSV
      const fileContent = fs.readFileSync(version.file_path, "utf-8");
      const parsed = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
      });

      if (!parsed.data.length) {
        return { success: false, error: "源数据文件为空" };
      }

      const allRows = parsed.data as Record<string, string>[];
      const allColumns = parsed.meta.fields || [];

      // 确定要导出的列
      const exportColumns =
        selectedColumns.length > 0 ? selectedColumns.filter(c => allColumns.includes(c)) : allColumns;

      if (exportColumns.length === 0) {
        return { success: false, error: "没有可导出的列" };
      }

      // 构建导出数据
      const exportData = allRows.map(row => {
        const record: Record<string, string> = {};
        for (const col of exportColumns) {
          let val = row[col];
          // 处理缺失值
          if (val === undefined || val === null || val === "" || val === "NaN" || val === "nan") {
            val = missingValueOutput;
          }
          record[col] = val;
        }
        return record;
      });

      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      if (format === "xlsx") {
        // 构建 xlsx worksheet 数据
        const wsData: (string | number | null)[][] = [];
        if (includeHeader) {
          wsData.push(exportColumns);
        }
        for (const row of exportData) {
          wsData.push(
            exportColumns.map(col => {
              const v = row[col];
              if (v === undefined || v === null || v === "") return null;
              const num = Number(v);
              return isNaN(num) ? v : num;
            })
          );
        }
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, targetPath);
      } else {
        // 使用 papaparse 生成 CSV
        const csvContent = Papa.unparse(exportData, {
          columns: exportColumns,
          header: includeHeader,
          delimiter: delimiter,
          newline: "\n",
        });

        if (format === "csv_bom") {
          // UTF-8 with BOM
          const bom = "\uFEFF";
          fs.writeFileSync(targetPath, bom + csvContent, "utf-8");
        } else {
          fs.writeFileSync(targetPath, csvContent, "utf-8");
        }
      }

      return {
        success: true,
        data: { rowCount: exportData.length },
      };
    } catch (error: any) {
      return { success: false, error: `导出失败: ${error.message}` };
    }
  }
}
