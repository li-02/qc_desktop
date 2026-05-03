import { BrowserWindow } from "electron";
import { DatasetController } from "./DatasetController";
import { API_ROUTES } from "@shared/constants/apiRoutes";

jest.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: jest.fn(),
  },
  dialog: {
    showSaveDialog: jest.fn(),
  },
}));

const datasetService = {
  importDataset: jest.fn(),
  getCategoryDatasets: jest.fn(),
  getDatasetInfo: jest.fn(),
  getDatasetVersions: jest.fn(),
  getDatasetVersionStats: jest.fn(),
  getDatasetVersionMissingStats: jest.fn(),
  deleteDataset: jest.fn(),
  updateDataset: jest.fn(),
  updateDatasetVersion: jest.fn(),
  deleteDatasetVersion: jest.fn(),
  performImputation: jest.fn(),
  exportDatasetVersion: jest.fn(),
};

const importQueueService = {
  startBatchImport: jest.fn(),
};

function createController() {
  return new DatasetController(datasetService as any, importQueueService as any);
}

const event = { sender: {} } as any;

describe("DatasetController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("数据集 IPC 路由清单与 API_ROUTES 保持一致", () => {
    const routes = [
      API_ROUTES.DATASETS.IMPORT,
      API_ROUTES.DATASETS.BATCH_IMPORT,
      API_ROUTES.DATASETS.GET_BY_CATEGORY,
      API_ROUTES.DATASETS.GET_INFO,
      API_ROUTES.DATASETS.GET_VERSIONS,
      API_ROUTES.DATASETS.GET_VERSION_STATS,
      API_ROUTES.DATASETS.GET_VERSION_MISSING_STATS,
      API_ROUTES.DATASETS.EXPORT,
      API_ROUTES.DATASETS.DELETE,
      API_ROUTES.DATASETS.UPDATE,
      API_ROUTES.DATASETS.DELETE_VERSION,
      API_ROUTES.DATASETS.UPDATE_VERSION,
    ];

    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).toContain("datasets/import");
    expect(routes).toContain("datasets/get-info");
  });

  it("importData 会清理参数并调用 DatasetService", async () => {
    datasetService.importDataset.mockResolvedValue({
      success: true,
      data: { datasetId: "11", datasetName: "半小时通量数据", path: "E:/data/flux.csv" },
    });

    const result = await createController().importData(
      {
        categoryId: " 1 ",
        importOption: {
          datasetName: " 半小时通量数据 ",
          type: " csv ",
          file: { name: " flux.csv ", size: " 2 KB ", path: " E:/data/flux.csv " },
          missingValueTypes: [" -9999 ", " NA "],
          rows: 48,
          columns: [" record_time ", " co2_flux "],
          sourceTimezone: "UTC+8",
        },
      },
      event
    );

    expect(result.success).toBe(true);
    expect(datasetService.importDataset).toHaveBeenCalledWith({
      categoryId: "1",
      datasetName: "半小时通量数据",
      type: "csv",
      file: { name: "flux.csv", size: "2 KB", path: "E:/data/flux.csv" },
      missingValueTypes: ["-9999", "NA"],
      rows: 48,
      columns: ["record_time", "co2_flux"],
      sourceTimezone: "UTC+8",
    });
  });

  it("importData 会把校验失败转换成统一 IPC 错误响应", async () => {
    const result = await createController().importData(
      {
        categoryId: "",
        importOption: {
          datasetName: "",
          type: "csv",
          file: { name: "flux.csv", size: "2 KB", path: "E:/data/flux.csv" },
          missingValueTypes: [],
          rows: 0,
          columns: [],
        },
      },
      event
    );

    expect(result.success).toBe(false);
    expect(datasetService.importDataset).not.toHaveBeenCalled();
  });

  it("batchImport 会绑定窗口并启动批量导入队列", async () => {
    const win = { id: 1 };
    (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(win);
    importQueueService.startBatchImport.mockResolvedValue({ batchId: "batch-1" });

    const result = await createController().batchImport(
      { categoryId: "1", files: [{ path: "E:/data/a.csv", name: "a.csv" }] } as any,
      event
    );

    expect(result).toEqual({ success: true, data: { batchId: "batch-1" } });
    expect(importQueueService.startBatchImport).toHaveBeenCalledWith(
      { categoryId: "1", files: [{ path: "E:/data/a.csv", name: "a.csv" }] },
      win
    );
  });

  it("查询类 handler 会调用对应 Service 并包装成功响应", async () => {
    datasetService.getCategoryDatasets.mockResolvedValue({ success: true, data: [{ id: "11" }] });
    datasetService.getDatasetInfo.mockResolvedValue({ success: true, data: { id: "11" } });
    datasetService.getDatasetVersions.mockResolvedValue({ success: true, data: [{ id: 1 }] });
    datasetService.getDatasetVersionStats.mockResolvedValue({ success: true, data: { totalRows: 48 } });
    datasetService.getDatasetVersionMissingStats.mockResolvedValue({ success: true, data: { totalMissingValues: 2 } });

    await expect(createController().getCategoryDatasets({ categoryId: " 1 " }, event)).resolves.toEqual({
      success: true,
      data: { datasets: [{ id: "11" }] },
    });
    await expect(createController().getDatasetInfo({ categoryId: "1", datasetId: "11" }, event)).resolves.toEqual({
      success: true,
      data: { id: "11" },
    });
    await expect(createController().getDatasetVersions({ datasetId: "11" }, event)).resolves.toEqual({
      success: true,
      data: [{ id: 1 }],
    });
    await expect(createController().getDatasetVersionStats({ versionId: "1" }, event)).resolves.toEqual({
      success: true,
      data: { totalRows: 48 },
    });
    await expect(
      createController().getDatasetVersionMissingStats(
        { datasetId: "11", versionId: "1", missingMarkers: ["-9999"] },
        event
      )
    ).resolves.toEqual({ success: true, data: { totalMissingValues: 2 } });
  });

  it("写入类 handler 会处理正常和错误场景", async () => {
    datasetService.deleteDataset.mockResolvedValue({ success: true });
    datasetService.updateDataset.mockResolvedValue({ success: true, data: { id: "11", missingValueTypes: ["NA"] } });
    datasetService.updateDatasetVersion.mockResolvedValue({ success: true });
    datasetService.deleteDatasetVersion.mockResolvedValue({ success: true });
    datasetService.performImputation.mockResolvedValue({ success: true, data: { versionId: 2 } });

    await expect(createController().deleteDataset({ categoryId: "1", datasetId: "11" }, event)).resolves.toEqual({
      success: true,
      data: { success: true },
    });
    await expect(
      createController().updateDataset(
        { categoryId: "1", datasetId: "11", updates: { name: " 清洗后通量数据 ", missingValueTypes: [" NA "] } },
        event
      )
    ).resolves.toEqual({ success: true, data: { dataset: { id: "11", missingValueTypes: ["NA"] } } });
    await expect(
      createController().updateDatasetVersion({ versionId: "1", updates: { remark: " 审核后版本 " } }, event)
    ).resolves.toEqual({ success: true, data: {} });
    await expect(createController().deleteDatasetVersion({ versionId: "2" }, event)).resolves.toEqual({
      success: true,
      data: {},
    });
    await expect(
      createController().performImputation({ categoryId: "1", datasetId: "11", method: "KNN", options: {} }, event)
    ).resolves.toEqual({ success: true, data: { versionId: 2 } });

    datasetService.deleteDataset.mockResolvedValueOnce({ success: false, error: "删除失败" });
    await expect(createController().deleteDataset({ categoryId: "1", datasetId: "11" }, event)).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
  });
});
