import { BaseController } from './BaseController';
import { SettingsService } from '../service/SettingsService';
import { IpcMainInvokeEvent } from 'electron';

export class SettingsController extends BaseController {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    super();
    this.settingsService = settingsService;
  }

  /**
   * 获取所有系统设置
   */
  async getAllSettings(args: {}, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = await this.settingsService.getAllSettings();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    });
  }

  /**
   * 获取单个设置
   */
  async getSetting(args: { key: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.key) {
        throw new Error('设置键名不能为空');
      }

      const result = await this.settingsService.getSetting(args.key);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    });
  }

  /**
   * 更新单个设置
   */
  async updateSetting(args: { key: string; value: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.key) {
        throw new Error('设置键名不能为空');
      }

      const result = await this.settingsService.updateSetting(args.key, args.value);
      if (!result.success) {
        throw new Error(result.error);
      }
      return true;
    });
  }

  /**
   * 批量更新设置
   */
  async updateSettings(args: { settings: Record<string, string> }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.settings || Object.keys(args.settings).length === 0) {
        throw new Error('设置不能为空');
      }

      const result = await this.settingsService.updateSettings(args.settings);
      if (!result.success) {
        throw new Error(result.error);
      }
      return true;
    });
  }

  /**
   * 获取时区设置
   */
  async getTimezone(args: {}, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = await this.settingsService.getTimezone();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    });
  }

  /**
   * 设置时区
   */
  async setTimezone(args: { timezone: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.timezone) {
        throw new Error('时区不能为空');
      }

      const result = await this.settingsService.setTimezone(args.timezone);
      if (!result.success) {
        throw new Error(result.error);
      }
      return true;
    });
  }
}
