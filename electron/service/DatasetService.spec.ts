import * as fs from "fs";
import { DatasetService } from "./DatasetService";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
  copyFileSync: jest.fn(),
}));

const datasetRepository = {
  getDatasetsByCategoryId: jest.fn(),
  getDatasetById: jest.fn(),
  getVersionsByDatasetId: jest.fn(),
  getStatByVersionId: jest.fn(),
  getColumnSettings: jest.fn(),
  deleteDataset: jest.fn(),
  updateDataset: jest.fn(),
  getDatasetVersionById: jest.fn(),
  updateDatasetVersion: jest.fn(),
  deleteDatasetVersion: jest.fn(),
};

const categoryRepository = {
  getCategoryById: jest.fn(),
};

const settingsRepository = {};

function createService() {
  return new DatasetService(datasetRepository as any, categoryRepository as any, settingsRepository as any);
}

const dataset = {
  id: 11,
  category_id: 1,
  dataset_name: "半小时通量数据",
  source_file_path: "E:/data/flux.csv",
  missing_value_types: JSON.stringify(["-9999", "NA"]),
  time_column: "record_time",
  import_time: "2025-01-01 00:00:00",
};

const rawVersion = {
  id: 1,
  dataset_id: 11,
  parent_version_id: null,
  stage_type: "RAW",
  file_path: "E:/data/flux.csv",
  created_at: "2025-01-01 00:00:00",
  remark: "原始导入",
};

describe("DatasetService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    datasetRepository.getVersionsByDatasetId.mockReturnValue({ success: true, data: [rawVersion] });
    datasetRepository.getStatByVersionId.mockReturnValue({
      success: true,
      data: {
        version_id: 1,
        total_rows: 48,
        total_cols: 3,
        total_missing_count: 2,
        total_outlier_count: 0,
        column_stats_json: JSON.stringify({
          columnMissingStatus: { co2_flux: 2 },
          missingValueStats: { "-9999": 2 },
          columnStatistics: { co2_flux: { min: -10, max: 12 } },
        }),
        calculated_at: "2025-01-01 01:00:00",
      },
    });
    datasetRepository.getColumnSettings.mockReturnValue({
      success: true,
      data: [{ column_name: "record_time" }, { column_name: "co2_flux" }, { column_name: "qc_co2_flux" }],
    });
  });

  it("getCategoryDatasets 会读取指定分类并映射数据质量信息", async () => {
    datasetRepository.getDatasetsByCategoryId.mockReturnValue({ success: true, data: [dataset] });

    const result = await createService().getCategoryDatasets("1");

    expect(result.success).toBe(true);
    expect(datasetRepository.getDatasetsByCategoryId).toHaveBeenCalledTimes(1);
    expect(datasetRepository.getDatasetsByCategoryId).toHaveBeenCalledWith(1);
    expect(result.data?.[0]).toEqual(
      expect.objectContaining({
        id: "11",
        name: "半小时通量数据",
        missingValueTypes: ["-9999", "NA"],
      })
    );
  });

  it("getCategoryDatasets 会拒绝非法分类 ID 并透传仓储错误", async () => {
    await expect(createService().getCategoryDatasets("abc")).resolves.toEqual(
      expect.objectContaining({ success: false })
    );

    datasetRepository.getDatasetsByCategoryId.mockReturnValue({ success: false, error: "database locked" });
    await expect(createService().getCategoryDatasets("1")).resolves.toEqual({
      success: false,
      error: "database locked",
    });
  });

  it("getDatasetInfo 会读取详情、版本、统计和列配置", async () => {
    datasetRepository.getDatasetById.mockReturnValue({ success: true, data: dataset });

    const result = await createService().getDatasetInfo("1", "11");

    expect(result.success).toBe(true);
    expect(datasetRepository.getDatasetById).toHaveBeenCalledWith(11);
    expect(datasetRepository.getVersionsByDatasetId).toHaveBeenCalledWith(11);
    expect(datasetRepository.getStatByVersionId).toHaveBeenCalledWith(1);
    expect(result.data?.originalFile.columns).toEqual(["record_time", "co2_flux", "qc_co2_flux"]);
  });

  it("getDatasetInfo 会处理非法 ID、仓储失败和损坏的缺失标记 JSON", async () => {
    await expect(createService().getDatasetInfo("x", "11")).resolves.toEqual(
      expect.objectContaining({ success: false })
    );

    datasetRepository.getDatasetById.mockReturnValue({ success: false, error: "Dataset not found" });
    await expect(createService().getDatasetInfo("1", "11")).resolves.toEqual({
      success: false,
      error: "Dataset not found",
    });

    datasetRepository.getDatasetById.mockReturnValue({
      success: true,
      data: { ...dataset, missing_value_types: "{broken" },
    });
    const result = await createService().getDatasetInfo("1", "11");
    expect(result.success).toBe(true);
    expect(result.data?.missingValueTypes).toEqual([]);
  });

  it("getDatasetVersions 会按仓储结果映射版本信息", async () => {
    datasetRepository.getVersionsByDatasetId.mockReturnValue({ success: true, data: [rawVersion] });

    const result = await createService().getDatasetVersions("11");

    expect(result.success).toBe(true);
    expect(datasetRepository.getVersionsByDatasetId).toHaveBeenCalledWith(11);
    expect(result.data?.[0]).toEqual(expect.objectContaining({ id: 1, datasetId: 11, stageType: "RAW" }));
  });

  it("getDatasetVersionStats 会解析 columnStats 并处理异常 JSON", async () => {
    let result = await createService().getDatasetVersionStats("1");
    expect(result.success).toBe(true);
    expect(result.data?.columnStats.columnMissingStatus).toEqual({ co2_flux: 2 });

    datasetRepository.getStatByVersionId.mockReturnValue({
      success: true,
      data: {
        version_id: 1,
        total_rows: 1,
        total_cols: 1,
        total_missing_count: 0,
        total_outlier_count: 0,
        column_stats_json: "{",
      },
    });
    result = await createService().getDatasetVersionStats("1");
    expect(result.success).toBe(false);
  });

  it("deleteDataset 会校验 ID 并调用仓储删除", async () => {
    datasetRepository.getDatasetById.mockReturnValue({ success: true, data: dataset });
    datasetRepository.deleteDataset.mockReturnValue({ success: true });

    await expect(createService().deleteDataset("1", "11")).resolves.toEqual({ success: true });
    expect(datasetRepository.deleteDataset).toHaveBeenCalledWith(11);

    await expect(createService().deleteDataset("1", "bad")).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
  });

  it("updateDataset 会转换字段并返回更新后的详情", async () => {
    datasetRepository.updateDataset.mockReturnValue({ success: true });
    datasetRepository.getDatasetById.mockReturnValue({ success: true, data: dataset });

    const result = await createService().updateDataset("1", "11", {
      name: "清洗后通量数据",
      missingValueTypes: ["-9999"],
    });

    expect(result.success).toBe(true);
    expect(datasetRepository.updateDataset).toHaveBeenCalledWith(11, {
      dataset_name: "清洗后通量数据",
      missing_value_types: JSON.stringify(["-9999"]),
    });
  });

  it("updateDatasetVersion 和 deleteDatasetVersion 会保护不存在版本和原始版本", async () => {
    datasetRepository.getDatasetVersionById.mockReturnValue({ success: true, data: rawVersion });
    datasetRepository.updateDatasetVersion.mockReturnValue({ success: true });

    await expect(createService().updateDatasetVersion("1", { remark: "审核后版本" })).resolves.toEqual({
      success: true,
    });
    expect(datasetRepository.updateDatasetVersion).toHaveBeenCalledWith(1, { remark: "审核后版本" });

    await expect(createService().deleteDatasetVersion("1")).resolves.toEqual(
      expect.objectContaining({ success: false })
    );

    datasetRepository.getDatasetVersionById.mockReturnValue({
      success: true,
      data: { ...rawVersion, id: 2, parent_version_id: 1, stage_type: "FILTERED" },
    });
    datasetRepository.deleteDatasetVersion.mockReturnValue({ success: true });
    await expect(createService().deleteDatasetVersion("2")).resolves.toEqual({ success: true });
  });

  it("exportDatasetVersion 会复制版本文件并报告文件缺失", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.copyFileSync as jest.Mock).mockImplementation();
    datasetRepository.getDatasetVersionById.mockReturnValue({ success: true, data: rawVersion });

    await expect(createService().exportDatasetVersion("1", "E:/export/flux.csv")).resolves.toEqual({ success: true });
    expect(fs.copyFileSync).toHaveBeenCalledWith("E:/data/flux.csv", "E:/export/flux.csv");

    (fs.existsSync as jest.Mock).mockReturnValue(false);
    await expect(createService().exportDatasetVersion("1", "E:/export/flux.csv")).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
  });
});
