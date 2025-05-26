// global.d.ts
import type {ElectronAPI} from "./shared/types";

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export {};