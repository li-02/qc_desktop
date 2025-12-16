import { defineStore } from 'pinia';
import { ref } from 'vue';
import { API_ROUTES } from '@shared/constants/apiRoutes';

// 时区选项列表
export const TIMEZONE_OPTIONS = [
  { value: 'UTC-12', label: 'UTC-12:00' },
  { value: 'UTC-11', label: 'UTC-11:00' },
  { value: 'UTC-10', label: 'UTC-10:00 (夏威夷)' },
  { value: 'UTC-9', label: 'UTC-09:00 (阿拉斯加)' },
  { value: 'UTC-8', label: 'UTC-08:00 (太平洋时间)' },
  { value: 'UTC-7', label: 'UTC-07:00 (山地时间)' },
  { value: 'UTC-6', label: 'UTC-06:00 (中部时间)' },
  { value: 'UTC-5', label: 'UTC-05:00 (东部时间)' },
  { value: 'UTC-4', label: 'UTC-04:00 (大西洋时间)' },
  { value: 'UTC-3', label: 'UTC-03:00 (巴西利亚)' },
  { value: 'UTC-2', label: 'UTC-02:00' },
  { value: 'UTC-1', label: 'UTC-01:00' },
  { value: 'UTC', label: 'UTC+00:00 (格林威治)' },
  { value: 'UTC+1', label: 'UTC+01:00 (中欧)' },
  { value: 'UTC+2', label: 'UTC+02:00 (东欧)' },
  { value: 'UTC+3', label: 'UTC+03:00 (莫斯科)' },
  { value: 'UTC+4', label: 'UTC+04:00 (迪拜)' },
  { value: 'UTC+5', label: 'UTC+05:00' },
  { value: 'UTC+5:30', label: 'UTC+05:30 (印度)' },
  { value: 'UTC+6', label: 'UTC+06:00' },
  { value: 'UTC+7', label: 'UTC+07:00 (曼谷)' },
  { value: 'UTC+8', label: 'UTC+08:00 (北京时间)' },
  { value: 'UTC+9', label: 'UTC+09:00 (东京)' },
  { value: 'UTC+10', label: 'UTC+10:00 (悉尼)' },
  { value: 'UTC+11', label: 'UTC+11:00' },
  { value: 'UTC+12', label: 'UTC+12:00 (奥克兰)' },
];

export const useSettingsStore = defineStore('settings', () => {
  // 状态
  const timezone = ref<string>('UTC+8');
  const dateFormat = ref<string>('YYYY-MM-DD HH:mm');
  const loading = ref<boolean>(false);
  const initialized = ref<boolean>(false);

  /**
   * 初始化设置（从后端加载）
   */
  const initSettings = async () => {
    if (initialized.value || !window.electronAPI) return;

    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.SETTINGS.GET_ALL, {});
      
      if (result.success && result.data) {
        timezone.value = result.data.timezone || 'UTC+8';
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
   * 获取时区设置
   */
  const getTimezone = async (): Promise<string> => {
    if (!window.electronAPI) return timezone.value;

    try {
      const result = await window.electronAPI.invoke(API_ROUTES.SETTINGS.GET_TIMEZONE, {});
      if (result.success) {
        timezone.value = result.data || 'UTC+8';
      }
      return timezone.value;
    } catch (error) {
      console.error('获取时区设置失败:', error);
      return timezone.value;
    }
  };

  /**
   * 设置时区
   */
  const setTimezone = async (newTimezone: string): Promise<boolean> => {
    if (!window.electronAPI) return false;

    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.SETTINGS.SET_TIMEZONE, {
        timezone: newTimezone,
      });

      if (result.success) {
        timezone.value = newTimezone;
        return true;
      }
      return false;
    } catch (error) {
      console.error('设置时区失败:', error);
      return false;
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
        // 更新本地状态
        if (key === 'timezone') {
          timezone.value = value;
        } else if (key === 'dateFormat') {
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
   * 获取时区显示标签
   */
  const getTimezoneLabel = (tz: string): string => {
    const option = TIMEZONE_OPTIONS.find(opt => opt.value === tz);
    return option ? option.label : tz;
  };

  return {
    // 状态
    timezone,
    dateFormat,
    loading,
    initialized,
    
    // 方法
    initSettings,
    getTimezone,
    setTimezone,
    updateSetting,
    getTimezoneLabel,
  };
});
