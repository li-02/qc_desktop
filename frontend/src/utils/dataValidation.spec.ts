import * as dataValidation from "./dataValidation";
import { describe, expect, it } from "vitest";

const {
  isEmptyValue,
  normalizeMissingMarkers,
  validateDatasetName,
  validateColumns,
  validateCsvPreviewRows,
  summarizeColumnQuality,
} = dataValidation;

describe("dataValidation 工具函数", () => {
  describe("isEmptyValue", () => {
    it("能识别常规空值和自定义缺失标记", () => {
      expect(isEmptyValue(null)).toBe(true);
      expect(isEmptyValue(undefined)).toBe(true);
      expect(isEmptyValue("   ")).toBe(true);
      expect(isEmptyValue(Number.NaN)).toBe(true);
      expect(isEmptyValue("-9999", ["-9999", "NA"])).toBe(true);
      expect(isEmptyValue("23.5", ["-9999"])).toBe(false);
    });

    it("能处理特殊字符和零值边界", () => {
      expect(isEmptyValue("0", ["NA"])).toBe(false);
      expect(isEmptyValue(0)).toBe(false);
      expect(isEmptyValue("N/A,quoted", ["N/A,quoted"])).toBe(true);
    });
  });

  describe("normalizeMissingMarkers", () => {
    it("会去除空白、空项和重复标记", () => {
      expect(normalizeMissingMarkers([" NA ", "", "NA", "-9999", "  "])).toEqual(["NA", "-9999"]);
    });

    it("能处理超大缺失标记列表", () => {
      const markers = Array.from({ length: 10_000 }, (_, index) => (index % 2 === 0 ? "NA" : `M${index}`));
      expect(normalizeMissingMarkers(markers)).toContain("NA");
      expect(normalizeMissingMarkers(markers).length).toBe(5001);
    });
  });

  describe("validateDatasetName", () => {
    it("接受真实业务数据集名称", () => {
      expect(validateDatasetName("鄱阳湖通量塔_2025_QC").valid).toBe(true);
    });

    it("拒绝空名称、超长名称和非法路径字符", () => {
      expect(validateDatasetName("").valid).toBe(false);
      expect(validateDatasetName(" ".repeat(4)).valid).toBe(false);
      expect(validateDatasetName("a".repeat(51)).valid).toBe(false);
      expect(validateDatasetName("flux/site.csv").valid).toBe(false);
      expect(validateDatasetName(42).valid).toBe(false);
    });
  });

  describe("validateColumns", () => {
    it("接受标准 CSV 列名", () => {
      expect(validateColumns(["record_time", "co2_flux", "qc_co2_flux"])).toEqual({
        valid: true,
        duplicates: [],
        emptyIndexes: [],
      });
    });

    it("能发现空列名和大小写重复列名", () => {
      expect(validateColumns(["record_time", "", "CO2_flux", "co2_flux"])).toEqual({
        valid: false,
        duplicates: ["co2_flux"],
        emptyIndexes: [1],
      });
    });

    it("拒绝非数组列名输入", () => {
      expect(validateColumns("record_time")).toEqual({ valid: false, duplicates: [], emptyIndexes: [] });
    });
  });

  describe("validateCsvPreviewRows", () => {
    it("接受对象数组形式的预览数据", () => {
      expect(validateCsvPreviewRows([{ record_time: "2025-01-01 00:00", co2_flux: 1.2 }])).toBe(true);
    });

    it("拒绝非对象行、非数组和超大数据", () => {
      expect(validateCsvPreviewRows(null)).toBe(false);
      expect(validateCsvPreviewRows([["record_time"]])).toBe(false);
      expect(
        validateCsvPreviewRows(
          Array.from({ length: 3 }, () => ({})),
          2
        )
      ).toBe(false);
    });
  });

  describe("summarizeColumnQuality", () => {
    it("统计列缺失率和唯一值数量", () => {
      const rows = [
        { record_time: "2025-01-01 00:00", co2_flux: "1.2" },
        { record_time: "2025-01-01 00:30", co2_flux: "-9999" },
        { record_time: "2025-01-01 01:00", co2_flux: "1.2" },
        { record_time: "2025-01-01 01:30", co2_flux: "" },
      ];

      expect(summarizeColumnQuality(rows, "co2_flux", ["-9999"])).toEqual({
        columnName: "co2_flux",
        total: 4,
        missing: 2,
        missingRate: 0.5,
        uniqueValues: 1,
      });
    });

    it("空数据集返回零缺失率", () => {
      expect(summarizeColumnQuality([], "co2_flux")).toEqual({
        columnName: "co2_flux",
        total: 0,
        missing: 0,
        missingRate: 0,
        uniqueValues: 0,
      });
    });
  });
});
