import * as XLSX from "xlsx";
import type { TableColumn } from "@/types";

/**
 * 处理Excel文件
 * @param content Excel文件内容
 * @returns 包含表头和数据的对象
 */
export const processExcel = (content: ArrayBuffer): Promise<{ columns: TableColumn[]; tableData: any[] }> => {
  return new Promise((resolve, reject) => {
    try {
      const workbook = XLSX.read(content, { type: "array" });

      // 获取第一个工作表
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 将工作表转换为JSON
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const columns: TableColumn[] = [];
      let tableData: any[] = [];

      if (data && data.length > 0) {
        // 第一行作为表头
        const headers = data[0] as string[];

        if (headers && headers.length > 0) {
          headers.forEach(header => {
            columns.push({
              prop: header,
              label: header,
            });
          });

          // 剩余行作为数据
          if (data.length > 1) {
            const rows = data.slice(1);
            tableData = rows.map(row => {
              const obj: Record<string, any> = {};
              headers.forEach((header, index) => {
                obj[header] = (row as any[])[index];
              });
              return obj;
            });
          }
        }
      }

      resolve({ columns, tableData });
    } catch (error) {
      reject(new Error(`解析Excel文件时出错: ${error}`));
    }
  });
};
