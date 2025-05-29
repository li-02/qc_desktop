import Papa from "papaparse";
import type { TableColumn } from "@/types";

/**
 * 处理CSV文件
 * @param content CSV文件内容
 * @returns 包含表头和数据的对象
 */
export const processCSV = (content: string): Promise<{ columns: TableColumn[]; tableData: any[] }> => {
  return new Promise((resolve, reject) => {
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: results => {
        try {
          const columns: TableColumn[] = [];
          let tableData: any[] = [];

          if (results.data && results.data.length > 0) {
            // 设置表头
            if (results.meta.fields && results.meta.fields.length > 0) {
              results.meta.fields.forEach(field => {
                columns.push({
                  prop: field,
                  label: field,
                });
              });
            }

            // 设置数据
            tableData = results.data;
          }

          resolve({ columns, tableData });
        } catch (error) {
          reject(new Error(`解析CSV文件时出错: ${error}`));
        }
      },
      error: error => {
        reject(new Error(`解析CSV文件时出错: ${error}`));
      },
    });
  });
};
