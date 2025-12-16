import { DatabaseManager } from '../core/DatabaseManager';

export interface SystemSetting {
  id: number;
  setting_key: string;
  setting_value: string | null;
  setting_type: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepositoryResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class SettingsRepository {
  private db = DatabaseManager.getInstance().getDatabase();

  /**
   * 获取所有设置
   */
  getAllSettings(): RepositoryResponse<SystemSetting[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sys_settings ORDER BY setting_key
      `);
      const settings = stmt.all() as SystemSetting[];
      return { success: true, data: settings };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 根据键名获取设置
   */
  getSettingByKey(key: string): RepositoryResponse<SystemSetting | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sys_settings WHERE setting_key = ?
      `);
      const setting = stmt.get(key) as SystemSetting | undefined;
      return { success: true, data: setting || null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新设置值
   */
  updateSetting(key: string, value: string): RepositoryResponse<boolean> {
    try {
      const stmt = this.db.prepare(`
        UPDATE sys_settings 
        SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = ?
      `);
      const result = stmt.run(value, key);
      
      if (result.changes === 0) {
        // 如果没有更新到记录，尝试插入
        const insertStmt = this.db.prepare(`
          INSERT INTO sys_settings (setting_key, setting_value, setting_type)
          VALUES (?, ?, 'string')
        `);
        insertStmt.run(key, value);
      }
      
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量更新设置
   */
  updateSettings(settings: Record<string, string>): RepositoryResponse<boolean> {
    try {
      const updateStmt = this.db.prepare(`
        UPDATE sys_settings 
        SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = ?
      `);

      const transaction = this.db.transaction(() => {
        for (const [key, value] of Object.entries(settings)) {
          updateStmt.run(value, key);
        }
      });

      transaction();
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取时区设置
   */
  getTimezone(): RepositoryResponse<string> {
    const result = this.getSettingByKey('timezone');
    if (result.success && result.data) {
      return { success: true, data: result.data.setting_value || 'UTC+8' };
    }
    return { success: true, data: 'UTC+8' }; // 默认值
  }

  /**
   * 设置时区
   */
  setTimezone(timezone: string): RepositoryResponse<boolean> {
    return this.updateSetting('timezone', timezone);
  }
}
