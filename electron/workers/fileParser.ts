// electron/workers/fileParser.js
import { parentPort } from "worker_threads";
import * as XLSX from "xlsx";
import Papa from "papaparse";

if (parentPort) {
  // 接收消息并处理
  const messagePort = parentPort;
  console.log("in parentPort");
  messagePort.on("message", async message => {
    const { type, data, maxRows } = message;

    try {
      let result;
      if (type === "csv") {
        result = await parseCSV(data, maxRows);
      } else if (type === "excel") {
        result = await parseExcel(data, maxRows);
      } else {
        // 明确抛出错误以中断解析流程
        throw new Error("不支持的文件类型");
      }

      // 发送处理结果回主线程
      messagePort.postMessage({ success: true, data: result });
    } catch (error: any) {
      messagePort.postMessage({ success: false, error: error.message });
    }
  });
} else {
  console.error("parentPort 不存在,当前不在worker线程中");
}

// 使用papaparse解析CSV文件
function parseCSV(content: any, maxRows = 20) {
  try {
    // 估算总行数
    const totalRows = content.split("\n").length - 1;

    // 使用papaparse解析
    const results = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      preview: maxRows, // 限制只解析前maxRows行
    });

    const columns: { prop: string; label: string }[] = [];
    // 设置表头
    if (results.meta.fields && results.meta.fields.length > 0) {
      results.meta.fields.forEach(field => {
        columns.push({
          prop: field,
          label: field,
        });
      });
    }
    return {
      columns,
      tableData: results.data,
      totalRows,
    };
  } catch (error: any) {
    throw new Error(`CSV解析错误: ${error.message}`);
  }
}

// 解析Excel文件
function parseExcel(buffer: ArrayBuffer | Uint8Array | Buffer, maxRows = 20) {
  try {
    // 读取工作簿
    const workbook = XLSX.read(buffer);

    // 获取第一个工作表
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Excel中没有可用的工作表");
    }
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      throw new Error("`无法获取工作表 ${firstSheetName}`");
    }
    // 获取工作表范围
    const ref = worksheet["!ref"] ?? "A1:A1";
    const range = XLSX.utils.decode_range(ref);
    const totalRows = range.e.r; // 总行数（不包括标题行）

    // 限制行数的新范围
    const limitedRange = {
      s: { r: range.s.r, c: range.s.c },
      e: { r: Math.min(range.s.r + maxRows, range.e.r), c: range.e.c },
    };

    // 设置新范围
    worksheet["!ref"] = XLSX.utils.encode_range(limitedRange);

    // 转换为JSON
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // 提取列和数据
    const columns: { prop: string; label: string }[] = [];
    let tableData: any[] = [];

    if (data && data.length > 0) {
      // 第一行作为表头
      const headers: any[] = data[0].map(h => String(h));

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
              obj[header] = row[index];
            });
            return obj;
          });
        }
      }
    }

    return {
      columns,
      tableData,
      totalRows,
    };
  } catch (error: any) {
    throw new Error(`Excel解析错误: ${error.message}`);
  }
}
