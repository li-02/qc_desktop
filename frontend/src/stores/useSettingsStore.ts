import { defineStore } from 'pinia';
import { ref } from 'vue';
import { API_ROUTES } from '@shared/constants/apiRoutes';

/**
 * 自动从系统检测时区，返回 UTC±H 格式字符串
 */
const detectSystemTimezone = (): string => {
  const offsetMinutes = -new Date().getTimezoneOffset();
  if (offsetMinutes === 0) return 'UTC';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  if (minutes === 0) return `UTC${sign}${hours}`;
  return `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
};

export const useSettingsStore = defineStore('settings', () => {
  // 时区直接从系统检测，不再持久化
  const timezone = ref<string>(detectSystemTimezone());
  const dateFormat = ref<string>('YYYY-MM-DD HH:mm');
  const loading = ref<boolean>(false);
  const initialized = ref<boolean>(false);

  /**
   * 初始化设置（从后端加载非时区配置）
   */
  const initSettings = async () => {
    if (initialized.value || !window.electronAPI) return;

    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.SETTINGS.GET_ALL, {});
      
      if (result.success && result.data) {
        dateFormat.value = result.data.dateFormat || 'YYYY-MM-DD HH:mm';
      }
      
      initialized.value = true;
    } catch (error) {
      console.error('加载系统设置失败:', error);
    } finally {
      loading.value = false;
    }
  };

  /**
   * 更新单个设置
   */
  const updateSetting = async (key: string, value: string): Promise<boolean> => {
    if (!window.electronAPI) return false;

    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.SETTINGS.UPDATE, {
        key,
        value,
      });

      if (result.success) {
        if (key === 'dateFormat') {
          dateFormat.value = value;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('更新设置失败:', error);
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 获取自定义缺失值类型
   */
  const getCustomMissingTypes = async (): Promise<string[]> => {
    if (!window.electronAPI) return [];
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.SETTINGS.GET, { key: 'custom_missing_value_types' });
      if (result.success && result.data) {
        return JSON.parse(result.data);
      }
      return [];
    } catch (error) {
      console.error('获取自定义缺失值类型失败:', error);
      return [];
    }
  };

  /**
   * 添加自定义缺失值类型
   */
  const addCustomMissingType = async (newType: string): Promise<boolean> => {
    if (!window.electronAPI) return false;
    try {
      const currentTypes = await getCustomMissingTypes();
      if (!currentTypes.includes(newType)) {
        const newTypes = [...currentTypes, newType];
        await updateSetting('custom_missing_value_types', JSON.stringify(newTypes));
        return true;
      }
      return true;
    } catch (error) {
      console.error('添加自定义缺失值类型失败:', error);
      return false;
    }
  };

  return {
    // 状态
    timezone,
    dateFormat,
    loading,
    initialized,
    
    // 方法
    initSettings,
    updateSetting,
    getCustomMissingTypes,
    addCustomMissingType,
  };
});
