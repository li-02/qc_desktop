import { SettingsRepository, SystemSetting } from '../repository/SettingsRepository';

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class SettingsService {
  private settingsRepository: SettingsRepository;

  constructor(settingsRepository: SettingsRepository) {
    this.settingsRepository = settingsRepository;
  }

  /**
   * 获取所有系统设置
   */
  async getAllSettings(): Promise<ServiceResponse<Record<string, string>>> {
    try {
      const result = this.settingsRepository.getAllSettings();
      if (!result.success) {
        throw new Error(result.error);
      }

      // 转换为键值对格式
      const settingsMap: Record<string, string> = {};
      for (const setting of result.data || []) {
        settingsMap[setting.setting_key] = setting.setting_value || '';
      }

      return { success: true, data: settingsMap };
    } catch (error: any) {
      return { success: false, error: `获取系统设置失败: ${error.message}` };
    }
  }

  /**
   * 获取单个设置值
   */
  async getSetting(key: string): Promise<ServiceResponse<string>> {
    try {
      const result = this.settingsRepository.getSettingByKey(key);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { 
        success: true, 
        data: result.data?.setting_value || '' 
      };
    } catch (error: any) {
      return { success: false, error: `获取设置失败: ${error.message}` };
    }
  }

  /**
   * 更新单个设置
   */
  async updateSetting(key: string, value: string): Promise<ServiceResponse<boolean>> {
    try {
      const result = this.settingsRepository.updateSetting(key, value);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: `更新设置失败: ${error.message}` };
    }
  }

  /**
   * 批量更新设置
   */
  async updateSettings(settings: Record<string, string>): Promise<ServiceResponse<boolean>> {
    try {
      const result = this.settingsRepository.updateSettings(settings);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: `批量更新设置失败: ${error.message}` };
    }
  }

  /**
   * 获取时区设置
   */
  async getTimezone(): Promise<ServiceResponse<string>> {
    try {
      const result = this.settingsRepository.getTimezone();
      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: `获取时区设置失败: ${error.message}` };
    }
  }

  /**
   * 设置时区
   */
  async setTimezone(timezone: string): Promise<ServiceResponse<boolean>> {
    try {
      // 验证时区格式
      const validTimezones = [
        'UTC', 'UTC+0', 'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+5:30',
        'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12',
        'UTC-1', 'UTC-2', 'UTC-3', 'UTC-4', 'UTC-5', 'UTC-6', 'UTC-7',
        'UTC-8', 'UTC-9', 'UTC-10', 'UTC-11', 'UTC-12'
      ];

      if (!validTimezones.includes(timezone)) {
        throw new Error(`无效的时区: ${timezone}`);
      }

      const result = this.settingsRepository.setTimezone(timezone);
      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: `设置时区失败: ${error.message}` };
    }
  }
}
