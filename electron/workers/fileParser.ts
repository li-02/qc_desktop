// electron/workers/fileParser.ts
import { parentPort } from "worker_threads";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { ColumnMissingStatus } from "@shared/types";

if (parentPort) {
  const messagePort = parentPort;
  console.log("Worker: 文件解析器已启动");

  messagePort.on("message", async message => {
    const { type, data, maxRows, missingValueTypes, timeColumn } = message;
    console.log(`Worker received task: type=${type}, maxRows=${maxRows}, timeColumn=${timeColumn}`);
    console.log(`Worker received missingValueTypes:`, JSON.stringify(missingValueTypes));

    try {
      let result;
      if (type === "csv") {
        result = await parseCSV(data, maxRows, missingValueTypes, timeColumn);
      } else if (type === "excel") {
        result = await parseExcel(data, maxRows, missingValueTypes, timeColumn);
      } else {
        throw new Error("不支持的文件类型");
      }

      messagePort.postMessage({ success: true, data: result });
    } catch (error: any) {
      console.error("Worker error:", error);
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
  columnMissingStatus?: ColumnMissingStatus; // 每列缺失值统计
  completeRecords: number;
} {
  const missingValueStats: Record<string, number> = {};
  const columnMissingStatus: ColumnMissingStatus = {};
  let totalMissingCount = 0;
  let completeRecords = 0;
  // 该行是否有缺失值的标志
  let hasMissingValue = false;

  // 初始化统计对象
  missingValueTypes.forEach(type => {
    missingValueStats[type === "" ? "空值" : type] = 0;
  });
  // 初始化每列缺失值计数
  columns.forEach(column => {
    columnMissingStatus[column] = 0;
  });

  // 遍历所有数据统计缺失值
  data.forEach((row, index) => {
    hasMissingValue = false; // 每行开始时重置标志

    // DEBUG: Log first 5 rows for pm2_5
    if (index < 5 && row['pm2_5'] !== undefined) {
      // console.log(`Row ${index} pm2_5 value:`, row['pm2_5'], 'Type:', typeof row['pm2_5']);
    }

    columns.forEach(column => {
      const value = row[column];

      // DEBUG: Log detailed mismatch for first missing expectation
      if (index === 1 && column === 'pm2_5') { // Row 2 in file (index 1 here?)
        console.log(`Checking Row ${index} Col ${column}. Value:`, value, `(${typeof value})`);
        console.log('Is Missing?', isMissingValue(value, missingValueTypes));
      }

      if (isMissingValue(value, missingValueTypes)) {
        hasMissingValue = true;
        totalMissingCount++;
        // 更新每列缺失值计数
        columnMissingStatus[column]++;

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
    if (!hasMissingValue) {
      completeRecords++;
    }
  });

  return { missingValueStats, totalMissingCount, columnMissingStatus, completeRecords };
}

// 计算列的统计信息
function calculateColumnStatistics(
  data: any[],
  columnName: string
): {
  mean: number;
  std: number;
  min: number;
  max: number;
  count: number;
  validCount: number;
} {
  // 提取列数据，过滤掉无效值
  const values = data
    .map(row => row[columnName])
    .filter(value => value !== null && value !== undefined && !isNaN(parseFloat(value)) && isFinite(parseFloat(value)))
    .map(value => parseFloat(value));

  const validCount = values.length;
  const totalCount = data.length;

  if (validCount === 0) {
    return {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      count: totalCount,
      validCount: 0,
    };
  }

  // 计算均值
  const mean = values.reduce((sum, value) => sum + value, 0) / validCount;

  // 计算最小值和最大值
  const min = Math.min(...values);
  const max = Math.max(...values);

  // 计算标准差
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / validCount;
  const std = Math.sqrt(variance);

  return {
    mean: Number(mean.toFixed(6)),
    std: Number(std.toFixed(6)),
    min: Number(min.toFixed(6)),
    max: Number(max.toFixed(6)),
    count: totalCount,
    validCount: validCount,
  };
}

// 时间分布统计接口
interface TimeDistribution {
  monthly: Record<string, number>; // "2023-01": 10
  hourly: Record<string, number>;  // "00": 5, "14": 8
  heatmap: Record<string, number>; // "2023-01-01 14": 2 (Day + Hour)
}

// 计算时间分布
function calculateTimeDistribution(
  data: any[],
  timeColumn: string,
  columns: string[],
  missingValueTypes: string[]
): TimeDistribution {
  const monthly: Record<string, number> = {};
  const hourly: Record<string, number> = {};
  const heatmap: Record<string, number> = {};

  // 初始化小时统计 (00-23)
  for (let i = 0; i < 24; i++) {
    const h = i.toString().padStart(2, '0');
    hourly[h] = 0;
  }

  data.forEach(row => {
    const timeVal = row[timeColumn];
    if (!timeVal) return;

    // 尝试解析日期
    // 支持多种格式，这里简单处理，实际可能需要更强健的解析
    const date = new Date(timeVal);
    if (isNaN(date.getTime())) return;

    // 检查该行是否有任意缺失值
    let hasMissing = false;
    for (const col of columns) {
      // 跳过时间列本身的检查 (通常时间列不应缺失，但如果缺失也就是无法定位时间)
      if (col === timeColumn) continue;
      if (isMissingValue(row[col], missingValueTypes)) {
        hasMissing = true;
        break;
      }
    }

    if (hasMissing) {
      // 月份 YYYY-MM
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthly[monthKey] = (monthly[monthKey] || 0) + 1;

      // 小时 HH
      const hourKey = String(date.getHours()).padStart(2, '0');
      hourly[hourKey] = (hourly[hourKey] || 0) + 1;

      // 热力图 YYYY-MM-DD HH
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const heatmapKey = `${dayKey} ${hourKey}`;
      heatmap[heatmapKey] = (heatmap[heatmapKey] || 0) + 1;
    }
  });

  return { monthly, hourly, heatmap };
}

// 使用papaparse解析CSV文件
function parseCSV(content: any, maxRows = 20, missingValueTypes: string[] = [], timeColumn: string = "") {
  try {
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
    let columnMissingStatus: ColumnMissingStatus | undefined = {};
    let columnStatistics: Record<string, any> = {};
    let completeRecords = 0;
    let timeDistribution: TimeDistribution | undefined;

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
        // 🆕 使用增强的统计函数
        if (maxRows === -1 || missingValueTypes.length > 0) {
          const stats = calculateMissingValueStats(fullResults.data, fullResults.meta.fields, missingValueTypes);
          missingValueStats = stats.missingValueStats;
          totalMissingCount = stats.totalMissingCount;
          columnMissingStatus = stats.columnMissingStatus;
          completeRecords = stats.completeRecords;

          // 计算列统计信息
          fullResults.meta.fields.forEach(col => {
            const colStats = calculateColumnStatistics(fullResults.data, col);
            // 只有当有有效数值时才保存统计信息
            if (colStats.validCount > 0) {
              columnStatistics[col] = colStats;
            }
          });
        }

        if (maxRows !== -1) {
          tableData = fullResults.data.slice(0, maxRows);
        } else {
          tableData = fullResults.data;
        }
      }
    }

    return {
      columns,
      tableData,
      totalRows,
      missingValueStats,
      totalMissingCount,
      columnMissingStatus,
      columnStatistics,
      completeRecords,
    };
  } catch (error: any) {
    throw new Error(`CSV解析错误: ${error.message}`);
  }
}

// 解析Excel文件
function parseExcel(buffer: ArrayBuffer | Uint8Array | Buffer, maxRows = 20, missingValueTypes: string[] = [], timeColumn: string = "") {
  try {
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
    let columnMissingStatus: ColumnMissingStatus | undefined = {};
    let columnStatistics: Record<string, any> = {};
    let completeRecords = 0;
    let timeDistribution: TimeDistribution | undefined;

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
          columnMissingStatus = stats.columnMissingStatus;
          completeRecords = stats.completeRecords;

          // 计算列统计信息
          headers.forEach(col => {
            const colStats = calculateColumnStatistics(formattedData, col);
            if (colStats.validCount > 0) {
              columnStatistics[col] = colStats;
            }
          });

          // 如果有时间列，计算时间分布
          if (timeColumn && headers.includes(timeColumn)) {
            timeDistribution = calculateTimeDistribution(formattedData, timeColumn, headers, missingValueTypes);
          }
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
      columnMissingStatus,
      columnStatistics,
      completeRecords,
      timeDistribution
    };
  } catch (error: any) {
    throw new Error(`Excel解析错误: ${error.message}`);
  }
}
