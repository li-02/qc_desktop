import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Papa from "papaparse";
import { BEONBatchService } from "./BEONBatchService";

function createTempCsv(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beon-batch-service-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function readCsv(filePath: string): Array<Record<string, string>> {
  return Papa.parse<Record<string, string>>(fs.readFileSync(filePath, "utf-8"), {
    header: true,
    skipEmptyLines: true,
  }).data;
}

describe("BEONBatchService", () => {
  it("会按 record_time 从 shisanling 数据补齐目标站点缺失指标列", () => {
    const service = new BEONBatchService({} as any, {} as any);
    const primary = createTempCsv("primary.csv", "record_time,co2_flux\n2021-01-01 00:00:00,1\n2021-01-01 00:30:00,2\n");
    const fallback = createTempCsv(
      "fallback.csv",
      "record_time,site_id,co2_flux,rg_1_1_2,ta_1_2_1\n2021-01-01 00:00:00,14,9,100,10\n2021-01-01 00:30:00,14,8,101,11\n"
    );

    const merged = (service as any).mergeMissingColumnsByTime(primary, fallback, "flux");

    expect(merged).not.toBe(primary);
    expect(readCsv(merged)).toEqual([
      { record_time: "2021-01-01 00:00:00", co2_flux: "1", rg_1_1_2: "100", ta_1_2_1: "10" },
      { record_time: "2021-01-01 00:30:00", co2_flux: "2", rg_1_1_2: "101", ta_1_2_1: "11" },
    ]);
  });

  it("目标站点已有指标列时不会用回退站点覆盖", () => {
    const service = new BEONBatchService({} as any, {} as any);
    const primary = createTempCsv("primary.csv", "record_time,co2_flux,rg_1_1_2\n2021-01-01 00:00:00,1,200\n");
    const fallback = createTempCsv("fallback.csv", "record_time,co2_flux,rg_1_1_2\n2021-01-01 00:00:00,9,100\n");

    const merged = (service as any).mergeMissingColumnsByTime(primary, fallback, "flux");

    expect(merged).toBe(primary);
    expect(readCsv(primary)).toEqual([{ record_time: "2021-01-01 00:00:00", co2_flux: "1", rg_1_1_2: "200" }]);
  });

  it("目标站点指标列整列为空时会用回退站点补值", () => {
    const service = new BEONBatchService({} as any, {} as any);
    const primary = createTempCsv("primary.csv", "record_time,co2_flux,rg_1_1_2\n2021-01-01 00:00:00,1,\n");
    const fallback = createTempCsv("fallback.csv", "record_time,co2_flux,rg_1_1_2\n2021-01-01 00:00:00,9,100\n");

    const merged = (service as any).mergeMissingColumnsByTime(primary, fallback, "flux");

    expect(merged).not.toBe(primary);
    expect(readCsv(merged)).toEqual([{ record_time: "2021-01-01 00:00:00", co2_flux: "1", rg_1_1_2: "100" }]);
  });
});
