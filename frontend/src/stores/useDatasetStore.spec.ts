import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ROUTES } from "@shared/constants/apiRoutes";
import { useCategoryStore } from "./useCategoryStore";
import { useDatasetStore } from "./useDatasetStore";

vi.mock("element-plus", () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const invokeMock = vi.fn();

const category = {
  id: "1",
  name: "通量塔项目",
  createdAt: 100,
  datasets: [
    {
      id: "11",
      name: "半小时通量数据",
      type: "csv",
      createdAt: 200,
      dirPath: "data/1/半小时通量数据",
      originalFile: { name: "flux.csv" },
    },
    {
      id: "12",
      name: "气象数据",
      type: "csv",
      createdAt: 100,
      dirPath: "data/1/气象数据",
      originalFile: { name: "met.csv" },
    },
  ],
};

function mockElectronApi() {
  Object.defineProperty(window, "electronAPI", {
    value: { invoke: invokeMock },
    configurable: true,
  });
}

async function setupStore() {
  setActivePinia(createPinia());
  mockElectronApi();
  const categoryStore = useCategoryStore();
  vi.spyOn(categoryStore, "loadCategories").mockResolvedValue([category] as any);
  categoryStore.categories = [category] as any;
  categoryStore.currentCategory = category as any;
  const datasetStore = useDatasetStore();
  await nextTick();
  await datasetStore.loadDatasets("1");
  return { categoryStore, datasetStore };
}

describe("useDatasetStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("能计算数据集 getter 并按创建时间升序排序", async () => {
    const { datasetStore } = await setupStore();

    expect(datasetStore.hasDatasets).toBe(true);
    expect(datasetStore.datasetsSortedByDate.map(dataset => dataset.id)).toEqual(["12", "11"]);
    expect(datasetStore.currentCategoryDatasets.map(dataset => dataset.id)).toEqual(["11", "12"]);
    expect(datasetStore.currentDatasetMissingMarkers).toEqual([]);
  });

  it("loadDatasets 在没有当前分类时会清空状态", async () => {
    setActivePinia(createPinia());
    mockElectronApi();
    const datasetStore = useDatasetStore();

    await datasetStore.loadDatasets();

    expect(datasetStore.datasets).toEqual([]);
    expect(datasetStore.currentDataset).toBeNull();
  });

  it("setCurrentDataset 会加载详情、版本并选择原始默认版本", async () => {
    const { datasetStore } = await setupStore();
    invokeMock.mockImplementation(async (route: string) => {
      if (route === API_ROUTES.DATASETS.GET_INFO) {
        return {
          success: true,
          data: {
            id: "11",
            name: "半小时通量数据",
            type: "csv",
            createdAt: 200,
            updatedAt: 200,
            belongTo: "1",
            dirPath: "data/1/半小时通量数据",
            missingValueTypes: ["-9999", "NA"],
            originalFile: { name: "flux.csv", columns: ["record_time", "co2_flux"] },
            processedFiles: [],
          },
        };
      }
      if (route === API_ROUTES.DATASETS.GET_VERSIONS) {
        return {
          success: true,
          data: [
            {
              id: 2,
              datasetId: 11,
              parentVersionId: 1,
              stageType: "FILTERED",
              filePath: "filtered.csv",
              createdAt: 300,
            },
            { id: 1, datasetId: 11, parentVersionId: null, stageType: "RAW", filePath: "raw.csv", createdAt: 100 },
          ],
        };
      }
      if (route === API_ROUTES.DATASETS.GET_VERSION_STATS) {
        return { success: true, data: { versionId: 1, totalRows: 48, totalCols: 2, totalMissingCount: 1 } };
      }
      return { success: false, error: "未知路由" };
    });

    await datasetStore.setCurrentDataset("11");

    expect(datasetStore.currentDataset?.id).toBe("11");
    expect(datasetStore.currentDatasetMissingMarkers).toEqual(["-9999", "NA"]);
    expect(datasetStore.versions.map(version => version.id)).toEqual([2, 1]);
    expect(datasetStore.currentVersion?.id).toBe(1);
    expect(datasetStore.currentVersionStats?.totalRows).toBe(48);
  });

  it("setCurrentVersion 会忽略不存在或不属于当前数据集的版本", async () => {
    const { datasetStore } = await setupStore();
    datasetStore.currentDataset = { id: "11" } as any;
    datasetStore.versions = [{ id: 2, datasetId: 12, stageType: "RAW", createdAt: 1, filePath: "other.csv" }] as any;

    await datasetStore.setCurrentVersion(2);
    await datasetStore.setCurrentVersion(999);

    expect(datasetStore.currentVersion).toBeNull();
    expect(invokeMock).not.toHaveBeenCalledWith(API_ROUTES.DATASETS.GET_VERSION_STATS, expect.anything());
  });

  it("importData 会调用导入 IPC 并刷新分类和数据集", async () => {
    const { categoryStore, datasetStore } = await setupStore();
    invokeMock.mockResolvedValue({ success: true, data: { datasetId: "13" } });

    await expect(
      datasetStore.importData({
        datasetName: "新通量数据",
        type: "csv",
        file: { name: "new_flux.csv", size: "2 KB", path: "E:/data/new_flux.csv" },
        missingValueTypes: ["-9999"],
        rows: 2,
        columns: ["record_time", "co2_flux"],
      } as any)
    ).resolves.toBe(true);

    expect(invokeMock).toHaveBeenCalledWith(API_ROUTES.DATASETS.IMPORT, expect.objectContaining({ categoryId: "1" }));
    expect(categoryStore.loadCategories).toHaveBeenCalled();
  });

  it("batchImportData 会返回批量任务 ID 并透传请求", async () => {
    const { datasetStore } = await setupStore();
    const request = { categoryId: "1", files: [{ path: "E:/data/a.csv", name: "a.csv" }] } as any;
    invokeMock.mockResolvedValueOnce({ success: true, data: { batchId: "batch-1" } });

    await expect(datasetStore.batchImportData(request)).resolves.toEqual({ batchId: "batch-1" });
    expect(invokeMock).toHaveBeenCalledWith(API_ROUTES.DATASETS.BATCH_IMPORT, request);
  });

  it("updateMissingMarkers 会更新当前数据集详情", async () => {
    const { datasetStore } = await setupStore();
    datasetStore.currentDataset = { id: "11", missingValueTypes: ["NA"] } as any;
    invokeMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, data: { id: "11", missingValueTypes: ["-9999", "NA"] } });

    await datasetStore.updateMissingMarkers(["-9999", "NA"]);

    expect(invokeMock).toHaveBeenNthCalledWith(1, API_ROUTES.DATASETS.UPDATE, {
      categoryId: "1",
      datasetId: "11",
      updates: { missingValueTypes: ["-9999", "NA"] },
    });
    expect(datasetStore.currentDataset?.missingValueTypes).toEqual(["-9999", "NA"]);
  });

  it("deleteDataset 会清空被删除的当前数据集", async () => {
    const { datasetStore } = await setupStore();
    datasetStore.currentDataset = { id: "11" } as any;
    invokeMock.mockResolvedValue({ success: true });

    await expect(datasetStore.deleteDataset("1", "11")).resolves.toBe(true);

    expect(datasetStore.currentDataset).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith(API_ROUTES.DATASETS.DELETE, { categoryId: "1", datasetId: "11" });
  });

  it("deleteVersion 会删除当前版本并重新选择默认版本", async () => {
    const { datasetStore } = await setupStore();
    datasetStore.currentDataset = { id: "11" } as any;
    datasetStore.versions = [
      { id: 1, datasetId: 11, parentVersionId: null, stageType: "RAW", filePath: "raw.csv", createdAt: 100 },
      { id: 2, datasetId: 11, parentVersionId: 1, stageType: "FILTERED", filePath: "filtered.csv", createdAt: 200 },
    ] as any;
    datasetStore.currentVersion = datasetStore.versions[1] as any;
    invokeMock.mockImplementation(async (route: string) => {
      if (route === API_ROUTES.DATASETS.DELETE_VERSION) return { success: true };
      if (route === API_ROUTES.DATASETS.GET_VERSIONS) return { success: true, data: [datasetStore.versions[0]] };
      if (route === API_ROUTES.DATASETS.GET_VERSION_STATS) return { success: true, data: { versionId: 1 } };
      return { success: false };
    });

    await expect(datasetStore.deleteVersion(2)).resolves.toBe(true);

    expect(datasetStore.currentVersion?.id).toBe(1);
  });

  it("updateVersionRemark 会同步版本列表和当前版本备注", async () => {
    const { datasetStore } = await setupStore();
    datasetStore.versions = [{ id: 1, datasetId: 11, remark: "旧备注" }] as any;
    datasetStore.currentVersion = datasetStore.versions[0] as any;
    invokeMock.mockResolvedValue({ success: true });

    await expect(datasetStore.updateVersionRemark(1, "质控后版本")).resolves.toBe(true);

    expect(datasetStore.versions[0].remark).toBe("质控后版本");
    expect(datasetStore.currentVersion?.remark).toBe("质控后版本");
  });

  it("exportVersion 会区分成功、取消和失败场景", async () => {
    const { datasetStore } = await setupStore();
    invokeMock.mockResolvedValueOnce({ success: true });
    await expect(datasetStore.exportVersion(1, "flux_export.csv")).resolves.toBe(true);

    invokeMock.mockResolvedValueOnce({ success: false, canceled: true });
    await expect(datasetStore.exportVersion(1)).resolves.toBe(false);

    invokeMock.mockRejectedValueOnce(new Error("磁盘不可写"));
    await expect(datasetStore.exportVersion(1)).resolves.toBe(false);
  });
});
