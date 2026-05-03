export interface DatasetNameValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ColumnValidationResult {
  valid: boolean;
  duplicates: string[];
  emptyIndexes: number[];
}

export interface CsvPreviewRow {
  [columnName: string]: unknown;
}

export interface ColumnQualitySummary {
  columnName: string;
  total: number;
  missing: number;
  missingRate: number;
  uniqueValues: number;
}

const INVALID_DATASET_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

export function isEmptyValue(value: unknown, missingMarkers: string[] = []): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);

  const normalized = String(value).trim();
  if (normalized.length === 0) return true;

  const normalizedMarkers = normalizeMissingMarkers(missingMarkers);
  return normalizedMarkers.includes(normalized);
}

export function normalizeMissingMarkers(markers: string[]): string[] {
  return Array.from(new Set(markers.map(marker => String(marker).trim()).filter(marker => marker.length > 0)));
}

export function validateDatasetName(name: unknown): DatasetNameValidationResult {
  if (typeof name !== "string") return { valid: false, reason: "数据集名称必须是字符串" };

  const trimmed = name.trim();
  if (!trimmed) return { valid: false, reason: "数据集名称不能为空" };
  if (trimmed.length > 50) return { valid: false, reason: "数据集名称不能超过 50 个字符" };
  if (INVALID_DATASET_NAME_CHARS.test(trimmed)) return { valid: false, reason: "数据集名称包含非法字符" };

  return { valid: true };
}

export function validateColumns(columns: unknown): ColumnValidationResult {
  if (!Array.isArray(columns)) {
    return { valid: false, duplicates: [], emptyIndexes: [] };
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const emptyIndexes: number[] = [];

  columns.forEach((column, index) => {
    const normalized = String(column ?? "").trim();
    if (!normalized) {
      emptyIndexes.push(index);
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) duplicates.add(normalized);
    seen.add(key);
  });

  return {
    valid: columns.length > 0 && duplicates.size === 0 && emptyIndexes.length === 0,
    duplicates: Array.from(duplicates),
    emptyIndexes,
  };
}

export function validateCsvPreviewRows(rows: unknown, maxRows = 100_000): boolean {
  if (!Array.isArray(rows)) return false;
  if (rows.length > maxRows) return false;
  return rows.every(row => row !== null && typeof row === "object" && !Array.isArray(row));
}

export function summarizeColumnQuality(
  rows: CsvPreviewRow[],
  columnName: string,
  missingMarkers: string[] = []
): ColumnQualitySummary {
  const values = rows.map(row => row[columnName]);
  const missing = values.filter(value => isEmptyValue(value, missingMarkers)).length;
  const uniqueValues = new Set(values.filter(value => !isEmptyValue(value, missingMarkers)).map(value => String(value)))
    .size;

  return {
    columnName,
    total: rows.length,
    missing,
    missingRate: rows.length === 0 ? 0 : missing / rows.length,
    uniqueValues,
  };
}
