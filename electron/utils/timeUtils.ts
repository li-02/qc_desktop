/**
 * 时间处理工具函数
 * 用于统一解析各种格式的时间字符串，转换为 epoch(ms)
 */

// 常见时区偏移量（分钟）
export const TIMEZONE_OFFSETS: Record<string, number> = {
  'UTC': 0,
  'UTC+0': 0,
  'UTC+1': 60,
  'UTC+2': 120,
  'UTC+3': 180,
  'UTC+4': 240,
  'UTC+5': 300,
  'UTC+5:30': 330,
  'UTC+6': 360,
  'UTC+7': 420,
  'UTC+8': 480,      // 北京时间
  'UTC+9': 540,
  'UTC+10': 600,
  'UTC+11': 660,
  'UTC+12': 720,
  'UTC-1': -60,
  'UTC-2': -120,
  'UTC-3': -180,
  'UTC-4': -240,
  'UTC-5': -300,     // 美东
  'UTC-6': -360,
  'UTC-7': -420,
  'UTC-8': -480,     // 美西
  'UTC-9': -540,
  'UTC-10': -600,
  'UTC-11': -660,
  'UTC-12': -720,
};

// 默认时区
export const DEFAULT_TIMEZONE = 'UTC+8';

/**
 * 时区选项列表（用于前端下拉选择）
 */
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

/**
 * 将各种格式的时间值标准化为 epoch(ms)
 * 
 * @param raw - 原始时间值（字符串、数字或 Date）
 * @param timezone - 时区标识（如 'UTC+8'），用于解释无时区的时间字符串
 * @returns epoch 毫秒数，解析失败返回 null
 */
export function normalizeTimestamp(raw: any, timezone: string = DEFAULT_TIMEZONE): number | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const offsetMinutes = TIMEZONE_OFFSETS[timezone] ?? TIMEZONE_OFFSETS[DEFAULT_TIMEZONE];

  // 1. 如果已经是 Date 对象
  if (raw instanceof Date) {
    const t = raw.getTime();
    return isNaN(t) ? null : t;
  }

  // 2. 如果是数字
  if (typeof raw === 'number') {
    // 判断是 epoch 秒还是毫秒
    // 如果数值小于 1e11，认为是秒；否则是毫秒
    // 1e11 秒 ≈ 公元 5138 年，1e11 毫秒 ≈ 1973 年
    if (raw < 1e11) {
      return raw * 1000;
    }
    return raw;
  }

  // 3. 如果是字符串
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // 3.1 纯数字字符串（epoch）
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (num < 1e11) {
        return num * 1000;
      }
      return num;
    }

    // 3.2 尝试各种日期格式
    let parsed: number | null = null;

    // 格式: YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD HH:mm
    const isoLikeMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (isoLikeMatch) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = isoLikeMatch;
      parsed = createDateWithOffset(
        parseInt(year), parseInt(month), parseInt(day),
        parseInt(hour), parseInt(minute), parseInt(second),
        offsetMinutes
      );
    }

    // 格式: YYYY/MM/DD HH:mm:ss 或 YYYY/MM/DD
    if (parsed === null) {
      const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (slashMatch) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = slashMatch;
        parsed = createDateWithOffset(
          parseInt(year), parseInt(month), parseInt(day),
          parseInt(hour), parseInt(minute), parseInt(second),
          offsetMinutes
        );
      }
    }

    // 格式: YYYYMMDDHHmmss 或 YYYYMMDDHHmm 或 YYYYMMDD
    if (parsed === null) {
      const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?$/);
      if (compactMatch) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = compactMatch;
        parsed = createDateWithOffset(
          parseInt(year), parseInt(month), parseInt(day),
          parseInt(hour || '0'), parseInt(minute || '0'), parseInt(second || '0'),
          offsetMinutes
        );
      }
    }

    // 格式: MM/DD/YYYY HH:mm:ss (美式)
    if (parsed === null) {
      const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (usMatch) {
        const [, month, day, year, hour = '0', minute = '0', second = '0'] = usMatch;
        parsed = createDateWithOffset(
          parseInt(year), parseInt(month), parseInt(day),
          parseInt(hour), parseInt(minute), parseInt(second),
          offsetMinutes
        );
      }
    }

    // 格式: DD-MM-YYYY 或 DD/MM/YYYY (欧式) - 仅当日期 > 12 时才能确定
    // 这里不做，因为容易和美式混淆

    // 3.3 如果上述都没匹配，尝试 Date.parse（但要注意时区）
    if (parsed === null) {
      // 检查字符串是否已经包含时区信息
      const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(trimmed);
      if (hasTimezone) {
        // 已有时区，直接解析
        const t = Date.parse(trimmed);
        if (!isNaN(t)) {
          parsed = t;
        }
      } else {
        // 无时区，用 Date.parse 解析后调整
        // 注意：Date.parse 对无时区字符串的解释因浏览器/Node 版本而异
        // 这里我们手动调整
        const t = Date.parse(trimmed);
        if (!isNaN(t)) {
          // Date.parse 通常按本地时区解释无时区字符串
          // 我们需要转换为指定时区
          const localOffset = new Date().getTimezoneOffset(); // 本地时区偏移（分钟，西为正）
          // 调整：先还原到 UTC，再应用目标时区
          parsed = t + localOffset * 60 * 1000 - offsetMinutes * 60 * 1000;
        }
      }
    }

    return parsed;
  }

  return null;
}

/**
 * 根据年月日时分秒和时区偏移创建 epoch(ms)
 */
function createDateWithOffset(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  offsetMinutes: number
): number {
  // 创建 UTC 时间
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  // 减去时区偏移得到真正的 UTC 时间
  return utc - offsetMinutes * 60 * 1000;
}

/**
 * 将 epoch(ms) 格式化为指定时区的显示字符串
 * 
 * @param epochMs - epoch 毫秒数
 * @param timezone - 时区标识
 * @param format - 输出格式 ('datetime' | 'date' | 'time')
 * @returns 格式化后的字符串
 */
export function formatTimestamp(
  epochMs: number,
  timezone: string = DEFAULT_TIMEZONE,
  format: 'datetime' | 'date' | 'time' = 'datetime'
): string {
  if (epochMs === null || epochMs === undefined || isNaN(epochMs)) {
    return '';
  }

  const offsetMinutes = TIMEZONE_OFFSETS[timezone] ?? TIMEZONE_OFFSETS[DEFAULT_TIMEZONE];
  
  // 将 UTC 时间调整到目标时区
  const adjustedMs = epochMs + offsetMinutes * 60 * 1000;
  const date = new Date(adjustedMs);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  switch (format) {
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hour}:${minute}:${second}`;
    case 'datetime':
    default:
      return `${year}-${month}-${day} ${hour}:${minute}`;
  }
}

/**
 * 批量标准化时间数据
 * 
 * @param data - 数据数组
 * @param timestampKey - 时间列的键名
 * @param timezone - 时区
 * @returns 带有标准化时间戳的数据数组
 */
export function normalizeTimeSeriesData<T extends Record<string, any>>(
  data: T[],
  timestampKey: string,
  timezone: string = DEFAULT_TIMEZONE
): Array<T & { _epochMs: number | null }> {
  return data.map(row => ({
    ...row,
    _epochMs: normalizeTimestamp(row[timestampKey], timezone)
  }));
}
