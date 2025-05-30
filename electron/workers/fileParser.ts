// electron/workers/fileParser.ts
import { parentPort } from "worker_threads";
import * as XLSX from "xlsx";
import Papa from "papaparse";

if (parentPort) {
  const messagePort = parentPort;
  console.log("Worker: 文件解析器已启动");

  messagePort.on("message", async message => {
    const { type, data, maxRows, missingValueTypes } = message;

    try {
      let result;
      if (type === "csv") {
        result = await parseCSV(data, maxRows, missingValueTypes);
      } else if (type === "excel") {
        result = await parseExcel(data, maxRows, missingValueTypes);
      } else {
        throw new Error("不支持的文件类型");
      }

      messagePort.postMessage({ success: true, data: result });
    } catch (error: any) {
      messagePort.postMessage({ success: false, error: error.message });
    }
  });
} else {
  console.error("parentPort 不存在,当前不在worker线程中");
}

// 检查值是否为缺失值
function isMissingValue(value: any, missingValueTypes: string[]): boolean {
  if (!missingValueTypes || missingValueTypes.length === 0) {
    return false;
  }

  // 处理各种缺失值情况
  if (value === null || value === undefined) {
    return missingValueTypes.includes("null") || missingValueTypes.includes("");
  }

  const stringValue = String(value).trim();

  // 检查是否匹配用户定义的缺失值类型
  return missingValueTypes.some(missingType => {
    if (missingType === "") {
      return stringValue === "";
    }
    return stringValue.toLowerCase() === missingType.toLowerCase();
  });
}

// 统计缺失值
function calculateMissingValueStats(
  data: any[],
  columns: string[],
  missingValueTypes: string[]
): {
  missingValueStats: Record<string, number>;
  totalMissingCount: number;
} {
  const missingValueStats: Record<string, number> = {};
  let totalMissingCount = 0;

  // 初始化统计对象
  missingValueTypes.forEach(type => {
    missingValueStats[type === "" ? "空值" : type] = 0;
  });

  // 遍历所有数据统计缺失值
  data.forEach(row => {
    columns.forEach(column => {
      const value = row[column];

      if (isMissingValue(value, missingValueTypes)) {
        totalMissingCount++;

        // 确定具体的缺失值类型
        if (value === null || value === undefined || String(value).trim() === "") {
          const emptyKey = missingValueTypes.includes("") ? "空值" : missingValueTypes[0];
          missingValueStats[emptyKey] = (missingValueStats[emptyKey] || 0) + 1;
        } else {
          const stringValue = String(value).trim();
          const matchedType = missingValueTypes.find(type => stringValue.toLowerCase() === type.toLowerCase());
          if (matchedType) {
            missingValueStats[matchedType] = (missingValueStats[matchedType] || 0) + 1;
          }
        }
      }
    });
  });

  return { missingValueStats, totalMissingCount };
}

// 使用papaparse解析CSV文件
function parseCSV(content: any, maxRows = 20, missingValueTypes: string[] = []) {
  try {
    console.log(`Worker: 开始解析CSV，限制行数: ${maxRows === -1 ? "全部" : maxRows}`);

    // 完整解析（用于统计）
    const fullResults = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    const columns: { prop: string; label: string }[] = [];
    let tableData: any[] = [];
    let totalRows = 0;
    let missingValueStats: Record<string, number> = {};
    let totalMissingCount = 0;

    if (fullResults.data && fullResults.data.length > 0) {
      totalRows = fullResults.data.length;

      // 设置表头
      if (fullResults.meta.fields && fullResults.meta.fields.length > 0) {
        fullResults.meta.fields.forEach(field => {
          columns.push({
            prop: field,
            label: field,
          });
        });
      }

      // 如果需要完整解析（maxRows = -1）或者有缺失值类型定义，进行缺失值统计
      if (maxRows === -1 || missingValueTypes.length > 0) {
        const stats = calculateMissingValueStats(fullResults.data, fullResults.meta.fields || [], missingValueTypes);
        missingValueStats = stats.missingValueStats;
        totalMissingCount = stats.totalMissingCount;

        console.log(`Worker: 缺失值统计完成，总缺失: ${totalMissingCount}`);
      }

      // 设置预览数据（如果maxRows不是-1）
      if (maxRows !== -1) {
        tableData = fullResults.data.slice(0, maxRows);
      } else {
        tableData = fullResults.data;
      }
    }

    return {
      columns,
      tableData,
      totalRows,
      missingValueStats,
      totalMissingCount,
    };
  } catch (error: any) {
    throw new Error(`CSV解析错误: ${error.message}`);
  }
}

// 解析Excel文件
function parseExcel(buffer: ArrayBuffer | Uint8Array | Buffer, maxRows = 20, missingValueTypes: string[] = []) {
  try {
    console.log(`Worker: 开始解析Excel，限制行数: ${maxRows === -1 ? "全部" : maxRows}`);

    const workbook = XLSX.read(buffer);
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Excel中没有可用的工作表");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      throw new Error(`无法获取工作表 ${firstSheetName}`);
    }

    // 获取完整数据用于统计
    const fullData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const columns: { prop: string; label: string }[] = [];
    let tableData: any[] = [];
    let totalRows = 0;
    let missingValueStats: Record<string, number> = {};
    let totalMissingCount = 0;

    if (fullData && fullData.length > 0) {
      const headers: any[] = fullData[0].map(h => String(h));
      totalRows = fullData.length - 1; // 减去表头行

      if (headers && headers.length > 0) {
        headers.forEach(header => {
          columns.push({
            prop: header,
            label: header,
          });
        });

        // 转换数据格式
        const rowsData = fullData.slice(1);
        const formattedData = rowsData.map(row => {
          const obj: Record<string, any> = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });

        // 如果需要完整解析或有缺失值类型定义，进行统计
        if (maxRows === -1 || missingValueTypes.length > 0) {
          const stats = calculateMissingValueStats(formattedData, headers, missingValueTypes);
          missingValueStats = stats.missingValueStats;
          totalMissingCount = stats.totalMissingCount;

          console.log(`Worker: 缺失值统计完成，总缺失: ${totalMissingCount}`);
        }

        // 设置预览数据
        if (maxRows !== -1) {
          tableData = formattedData.slice(0, maxRows);
        } else {
          tableData = formattedData;
        }
      }
    }

    return {
      columns,
      tableData,
      totalRows,
      missingValueStats,
      totalMissingCount,
    };
  } catch (error: any) {
    throw new Error(`Excel解析错误: ${error.message}`);
  }
}
