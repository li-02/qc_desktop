import { API_ROUTES } from "@shared/constants/apiRoutes";

export type CsvColumnRequest = {
  datasetId?: string | number | null;
  versionId?: string | number | null;
  filePath: string;
  columnName: string;
  missingValueTypes?: string[];
};

type CacheEntry = {
  data: any;
  lastUsed: number;
};

const maxCacheEntries = 60;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<any>>();

const markerKey = (missingValueTypes: string[] = []) =>
  [...missingValueTypes]
    .map(value => String(value))
    .sort()
    .join("\u001f");

const normalizeRequest = (request: CsvColumnRequest): CsvColumnRequest => ({
  datasetId: request.datasetId ?? null,
  versionId: request.versionId ?? null,
  filePath: String(request.filePath || ""),
  columnName: String(request.columnName || ""),
  missingValueTypes: [...(request.missingValueTypes || [])].map(value => String(value)),
});

export const getCsvColumnCacheKey = ({
  datasetId,
  versionId,
  filePath,
  columnName,
  missingValueTypes = [],
}: CsvColumnRequest) =>
  [datasetId ?? "", versionId ?? "", filePath, columnName, markerKey(missingValueTypes)].join("\u001e");

const trimCache = () => {
  if (cache.size <= maxCacheEntries) return;

  const entries = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const deleteCount = cache.size - maxCacheEntries;
  for (let i = 0; i < deleteCount; i++) {
    cache.delete(entries[i][0]);
  }
};

export const peekCsvColumnData = (request: CsvColumnRequest) => {
  const key = getCsvColumnCacheKey(normalizeRequest(request));
  const entry = cache.get(key);
  if (!entry) return null;
  entry.lastUsed = Date.now();
  return entry.data;
};

export const readCsvColumnData = async (request: CsvColumnRequest) => {
  const plainRequest = normalizeRequest(request);
  const key = getCsvColumnCacheKey(plainRequest);
  const cached = cache.get(key);
  if (cached) {
    cached.lastUsed = Date.now();
    return { success: true, data: cached.data };
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = window.electronAPI
    .invoke(API_ROUTES.FILES.READ_CSV_DATA, {
      filePath: plainRequest.filePath,
      columnName: plainRequest.columnName,
      missingValueTypes: plainRequest.missingValueTypes,
    })
    .then(result => {
      if (result?.success) {
        cache.set(key, {
          data: result.data,
          lastUsed: Date.now(),
        });
        trimCache();
      }
      return result;
    });

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
};
