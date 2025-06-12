// import { ServiceResponse } from '@shared/types/common';
// import { FileParseResult } from '@shared/types/projectInterface';

// export interface CorrelationResult {
//   method: 'pearson' | 'spearman' | 'kendall';
//   matrix: number[][];
//   labels: string[];
//   pValues?: number[][];
//   significanceLevel?: number;
//   sampleSize: number;
//   timestamp: number;
// }

// export interface CorrelationAnalysisRequest {
//   filePath: string;
//   columns: string[];
//   method: 'pearson' | 'spearman' | 'kendall';
//   significanceLevel?: number;
//   missingValueTypes: string[];
// }

// export interface TimeLagAnalysisRequest {
//   filePath: string;
//   baseColumn: string;
//   targetColumn: string;
//   maxLag: number;
//   method: 'pearson' | 'spearman' | 'kendall';
//   missingValueTypes: string[];
// }

// export interface TimeLagResult {
//   baseColumn: string;
//   targetColumn: string;
//   method: string;
//   lagData: Array<{ lag: number; correlation: number; pValue?: number }>;
//   optimalLag: { lag: number; correlation: number };
//   timestamp: number;
// }

// /**
//  * 相关性分析服务
//  * 提供各种相关性计算和统计分析功能
//  */
// export class CorrelationAnalysisService {

//   /**
//    * 计算变量间的相关性矩阵
//    */
//   async calculateCorrelationMatrix(
//     request: CorrelationAnalysisRequest
//   ): Promise<ServiceResponse<CorrelationResult>> {
//     try {
//       // 1. 读取和解析数据
//       const parseResult = await this.parseDataFile(request.filePath, request.missingValueTypes);
//       if (!parseResult.success) {
//         return { success: false, error: parseResult.error };
//       }

//       const data = parseResult.data!;

//       // 2. 提取指定列的数据
//       const extractedData = this.extractColumnData(data, request.columns);
//       if (extractedData.some(col => col.length === 0)) {
//         return { success: false, error: '所选列中存在无效数据' };
//       }

//       // 3. 计算相关性矩阵
//       const matrix = this.computeCorrelationMatrix(extractedData, request.method);

//       // 4. 计算统计显著性（如果需要）
//       let pValues: number[][] | undefined;
//       if (request.significanceLevel) {
//         pValues = this.computeSignificanceMatrix(extractedData, request.method);
//       }

//       const result: CorrelationResult = {
//         method: request.method,
//         matrix: matrix,
//         labels: request.columns,
//         pValues: pValues,
//         significanceLevel: request.significanceLevel,
//         sampleSize: extractedData[0].length,
//         timestamp: Date.now()
//       };

//       return { success: true, data: result };
//     } catch (error: any) {
//       return { success: false, error: `相关性分析失败: ${error.message}` };
//     }
//   }

//   /**
//    * 时间延迟相关性分析
//    */
//   async analyzeTimeLagCorrelation(
//     request: TimeLagAnalysisRequest
//   ): Promise<ServiceResponse<TimeLagResult>> {
//     try {
//       // 1. 读取和解析数据
//       const parseResult = await this.parseDataFile(request.filePath, request.missingValueTypes);
//       if (!parseResult.success) {
//         return { success: false, error: parseResult.error };
//       }

//       const data = parseResult.data!;

//       // 2. 提取基准列和目标列数据
//       const baseData = this.extractSingleColumnData(data, request.baseColumn);
//       const targetData = this.extractSingleColumnData(data, request.targetColumn);

//       if (baseData.length === 0 || targetData.length === 0) {
//         return { success: false, error: '无法提取有效的列数据' };
//       }

//       // 3. 计算时间延迟相关性
//       const lagData: Array<{ lag: number; correlation: number; pValue?: number }> = [];
//       let optimalLag = { lag: 0, correlation: 0 };

//       for (let lag = -request.maxLag; lag <= request.maxLag; lag++) {
//         const { x, y } = this.applyLag(baseData, targetData, lag);
//         if (x.length < 10) continue; // 数据量太少，跳过

//         const correlation = this.calculateCorrelation(x, y, request.method);
//         const pValue = this.calculateCorrelationSignificance(x, y, correlation);

//         lagData.push({ lag, correlation, pValue });

//         // 更新最优延迟
//         if (Math.abs(correlation) > Math.abs(optimalLag.correlation)) {
//           optimalLag = { lag, correlation };
//         }
//       }

//       const result: TimeLagResult = {
//         baseColumn: request.baseColumn,
//         targetColumn: request.targetColumn,
//         method: request.method,
//         lagData: lagData,
//         optimalLag: optimalLag,
//         timestamp: Date.now()
//       };

//       return { success: true, data: result };
//     } catch (error: any) {
//       return { success: false, error: `时间延迟分析失败: ${error.message}` };
//     }
//   }

//   /**
//    * 解析数据文件
//    */
//   private async parseDataFile(
//     filePath: string,
//     missingValueTypes: string[]
//   ): Promise<ServiceResponse<FileParseResult>> {
//     try {
//       const fs = require('fs');
//       const path = require('path');
//       const { Worker } = require('worker_threads');

//       // 读取文件
//       const fileContent = fs.readFileSync(filePath, 'utf-8');
//       const fileExtension = path.extname(filePath).toLowerCase();

//       // 使用 Worker 解析
//       const workerPath = path.join(__dirname, '../workers', 'fileParser.js');

//       const parseResult = await new Promise<any>((resolve, reject) => {
//         const worker = new Worker(workerPath);

//         worker.on('message', (result: any) => {
//           worker.terminate();
//           if (result.success) {
//             resolve(result.data);
//           } else {
//             reject(new Error(result.error));
//           }
//         });

//         worker.on('error', (error: any) => {
//           worker.terminate();
//           reject(error);
//         });

//         worker.postMessage({
//           type: fileExtension === '.csv' ? 'csv' : 'excel',
//           data: fileContent,
//           maxRows: -1, // 读取全部数据
//           missingValueTypes,
//         });
//       });

//       return { success: true, data: parseResult };
//     } catch (error: any) {
//       return { success: false, error: `文件解析失败: ${error.message}` };
//     }
//   }

//   /**
//    * 提取列数据
//    */
//   private extractColumnData(data: FileParseResult, columns: string[]): number[][] {
//     return columns.map(column => this.extractSingleColumnData(data, column));
//   }

//   /**
//    * 提取单列数据
//    */
//   private extractSingleColumnData(data: FileParseResult, column: string): number[] {
//     return data.tableData
//       .map((row: any) => {
//         const value = row[column];
//         if (value !== null && value !== undefined && !isNaN(Number(value))) {
//           return Number(value);
//         }
//         return null;
//       })
//       .filter((value: number | null) => value !== null) as number[];
//   }

//   /**
//    * 计算相关性矩阵
//    */
//   private computeCorrelationMatrix(data: number[][], method: string): number[][] {
//     const n = data.length;
//     const matrix: number[][] = [];

//     for (let i = 0; i < n; i++) {
//       matrix[i] = [];
//       for (let j = 0; j < n; j++) {
//         if (i === j) {
//           matrix[i][j] = 1;
//         } else {
//           matrix[i][j] = this.calculateCorrelation(data[i], data[j], method);
//         }
//       }
//     }

//     return matrix;
//   }

//   /**
//    * 计算两个变量的相关性
//    */
//   private calculateCorrelation(x: number[], y: number[], method: string): number {
//     const n = Math.min(x.length, y.length);
//     if (n < 2) return 0;

//     switch (method) {
//       case 'pearson':
//         return this.calculatePearsonCorrelation(x.slice(0, n), y.slice(0, n));
//       case 'spearman':
//         return this.calculateSpearmanCorrelation(x.slice(0, n), y.slice(0, n));
//       case 'kendall':
//         return this.calculateKendallCorrelation(x.slice(0, n), y.slice(0, n));
//       default:
//         return 0;
//     }
//   }

//   /**
//    * 皮尔逊相关系数
//    */
//   private calculatePearsonCorrelation(x: number[], y: number[]): number {
//     const n = x.length;
//     const sumX = x.reduce((a, b) => a + b, 0);
//     const sumY = y.reduce((a, b) => a + b, 0);
//     const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
//     const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
//     const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

//     const numerator = n * sumXY - sumX * sumY;
//     const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

//     return denominator === 0 ? 0 : numerator / denominator;
//   }

//   /**
//    * 斯皮尔曼等级相关系数
//    */
//   private calculateSpearmanCorrelation(x: number[], y: number[]): number {
//     const xRanks = this.getRanks(x);
//     const yRanks = this.getRanks(y);
//     return this.calculatePearsonCorrelation(xRanks, yRanks);
//   }

//   /**
//    * 肯德尔等级相关系数
//    */
//   private calculateKendallCorrelation(x: number[], y: number[]): number {
//     const n = x.length;
//     let concordant = 0;
//     let discordant = 0;

//     for (let i = 0; i < n - 1; i++) {
//       for (let j = i + 1; j < n; j++) {
//         const xDiff = x[i] - x[j];
//         const yDiff = y[i] - y[j];

//         if ((xDiff > 0 && yDiff > 0) || (xDiff < 0 && yDiff < 0)) {
//           concordant++;
//         } else if ((xDiff > 0 && yDiff < 0) || (xDiff < 0 && yDiff > 0)) {
//           discordant++;
//         }
//       }
//     }

//     const denominator = Math.sqrt((concordant + discordant) * (concordant + discordant));
//     return denominator === 0 ? 0 : (concordant - discordant) / denominator;
//   }

//   /**
//    * 获取排序
//    */
//   private getRanks(arr: number[]): number[] {
//     const sorted = arr.map((value, index) => ({ value, index }))
//                      .sort((a, b) => a.value - b.value);
//     const ranks = new Array(arr.length);

//     for (let i = 0; i < sorted.length; i++) {
//       ranks[sorted[i].index] = i + 1;
//     }

//     return ranks;
//   }

//   /**
//    * 计算统计显著性矩阵
//    */
//   private computeSignificanceMatrix(data: number[][], method: string): number[][] {
//     const n = data.length;
//     const matrix: number[][] = [];

//     for (let i = 0; i < n; i++) {
//       matrix[i] = [];
//       for (let j = 0; j < n; j++) {
//         if (i === j) {
//           matrix[i][j] = 0; // 自相关的 p 值为 0
//         } else {
//           const correlation = this.calculateCorrelation(data[i], data[j], method);
//           matrix[i][j] = this.calculateCorrelationSignificance(data[i], data[j], correlation);
//         }
//       }
//     }

//     return matrix;
//   }

//   /**
//    * 计算相关性的统计显著性 (p-value)
//    * 使用 t 检验近似计算
//    */
//   private calculateCorrelationSignificance(x: number[], y: number[], correlation: number): number {
//     const n = Math.min(x.length, y.length);
//     if (n < 3) return 1; // 样本太小，无法计算显著性

//     // 对于皮尔逊相关系数，使用 t 分布
//     const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
//     const df = n - 2; // 自由度

//     // 简化的 t 分布 p 值计算（双尾检验）
//     // 实际应用中应该使用更精确的统计函数
//     const pValue = 2 * (1 - this.approximateTCDF(Math.abs(t), df));

//     return Math.max(0, Math.min(1, pValue));
//   }

//   /**
//    * t 分布累积分布函数的近似计算
//    * 这是一个简化版本，实际应用中建议使用专业的统计库
//    */
//   private approximateTCDF(t: number, df: number): number {
//     // 使用标准正态分布作为大样本近似
//     if (df > 30) {
//       return this.standardNormalCDF(t);
//     }

//     // 简化的 t 分布近似
//     const x = df / (df + t * t);
//     return 1 - 0.5 * this.incompleteBeta(0.5 * df, 0.5, x);
//   }

//   /**
//    * 标准正态分布累积分布函数
//    */
//   private standardNormalCDF(z: number): number {
//     return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
//   }

//   /**
//    * 误差函数的近似计算
//    */
//   private erf(x: number): number {
//     const a1 =  0.254829592;
//     const a2 = -0.284496736;
//     const a3 =  1.421413741;
//     const a4 = -1.453152027;
//     const a5 =  1.061405429;
//     const p  =  0.3275911;

//     const sign = x >= 0 ? 1 : -1;
//     x = Math.abs(x);

//     const t = 1.0 / (1.0 + p * x);
//     const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

//     return sign * y;
//   }

//   /**
//    * 不完全贝塔函数的近似计算
//    */
//   private incompleteBeta(a: number, b: number, x: number): number {
//     if (x === 0 || x === 1) return x;

//     // 简化版本，实际应该使用更精确的算法
//     return Math.pow(x, a) * Math.pow(1 - x, b) / (a * this.betaFunction(a, b));
//   }

//   /**
//    * 贝塔函数
//    */
//   private betaFunction(a: number, b: number): number {
//     return this.gammaFunction(a) * this.gammaFunction(b) / this.gammaFunction(a + b);
//   }

//   /**
//    * 伽马函数的近似计算（斯特林公式）
//    */
//   private gammaFunction(z: number): number {
//     if (z === 1) return 1;
//     if (z === 0.5) return Math.sqrt(Math.PI);

//     // 使用斯特林公式的近似
//     return Math.sqrt(2 * Math.PI / z) * Math.pow(z / Math.E, z);
//   }

//   /**
//    * 应用时间延迟
//    */
//   private applyLag(baseData: number[], targetData: number[], lag: number): { x: number[], y: number[] } {
//     if (lag === 0) {
//       const minLength = Math.min(baseData.length, targetData.length);
//       return {
//         x: baseData.slice(0, minLength),
//         y: targetData.slice(0, minLength)
//       };
//     } else if (lag > 0) {
//       // 正延迟：目标变量延迟
//       const x = baseData.slice(0, -lag);
//       const y = targetData.slice(lag);
//       const minLength = Math.min(x.length, y.length);
//       return {
//         x: x.slice(0, minLength),
//         y: y.slice(0, minLength)
//       };
//     } else {
//       // 负延迟：基准变量延迟
//       const x = baseData.slice(-lag);
//       const y = targetData.slice(0, lag);
//       const minLength = Math.min(x.length, y.length);
//       return {
//         x: x.slice(0, minLength),
//         y: y.slice(0, minLength)
//       };
//     }
//   }
// }
