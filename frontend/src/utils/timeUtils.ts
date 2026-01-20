// frontend/src/utils/timeUtils.ts
export function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 将 epoch 毫秒或可解析的时间字符串格式化为 本地时间 + 时区后缀
 * 输出示例: "12/31 10:18 (UTC+8)"
 */
export function formatLocalWithTZ(input: number | string | Date | undefined | null): string {
  if (input === undefined || input === null) return "";
  const date = typeof input === "number" ? new Date(input) : new Date(String(input));
  if (isNaN(date.getTime())) return "";

  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  // getTimezoneOffset 返回的是 本地时间 与 UTC 的差值（分钟），注意符号：本地 = UTC - offset
  const offsetMinutes = -date.getTimezoneOffset(); // 将符号反转，方便理解（正数表示 UTC+）
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const hoursOffset = Math.floor(absMinutes / 60);
  const minsOffset = absMinutes % 60;
  const tz = minsOffset === 0 ? `UTC${sign}${hoursOffset}` : `UTC${sign}${hoursOffset}:${String(minsOffset).padStart(2, "0")}`;

  return `${month}/${day} ${hour}:${minute} (${tz})`;
}

/**
 * 将 epoch(ms) 格式化为本地 ISO 字符串（保留时区后缀）
 * 供需要详细时间格式的地方使用
 */
export function formatLocalIsoWithTZ(epochMs: number | string | Date): string {
  const date = typeof epochMs === "number" ? new Date(epochMs) : new Date(String(epochMs));
  if (isNaN(date.getTime())) return "";
  const yr = date.getFullYear();
  const mon = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const hoursOffset = Math.floor(absMinutes / 60);
  const minsOffset = absMinutes % 60;
  const tz = minsOffset === 0 ? `UTC${sign}${hoursOffset}` : `UTC${sign}${hoursOffset}:${String(minsOffset).padStart(2, "0")}`;
  return `${yr}-${mon}-${d} ${hh}:${mm}:${ss} (${tz})`;
}


