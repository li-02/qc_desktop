// 预加载脚本暴露的 API 类型
export interface ElectronAPI {
  getFilePath: (file: File) => string;
  invoke: (channel: string, args?: any) => Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => void;
  removeListener: (channel: string, callback: (...args: any[]) => void) => void;
}
