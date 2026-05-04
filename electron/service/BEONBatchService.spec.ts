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
  it("有本地缓存时只拉取超过缓存最新时间的新增数据并更新缓存", async () => {
    const localDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beon-cache-"));
    const service = new BEONBatchService({} as any, {
      importTableByTimeRange: jest.fn().mockImplementation(async (_connection, _table, startTime, endTime) => ({
        success: true,
        data: {
          csvPath: createTempCsv("remote.csv", `record_time,co2_flux\n${startTime},2\n${endTime},3\n`),
          rowCount: 2,
        },
      })),
    } as any);
    const cacheDir = path.join(localDataDir, "profile_1");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "hanshiqiao_fluxs.csv"), "record_time,co2_flux\n2021-01-01 00:00:00,1\n", "utf-8");

    const result = await (service as any).importTableWithLocalCache(
      {},
      "hanshiqiao_fluxs",
      {
        connectionProfileId: 1,
        localDataDir,
        startTime: "2021-01-01 00:00:00",
        endTime: "2021-01-01 01:00:00",
      },
      {},
      [],
      jest.fn()
    );

    expect(readCsv(result.csvPath)).toEqual([
      { record_time: "2021-01-01 00:00:00", co2_flux: "1" },
      { record_time: "2021-01-01 01:00:00", co2_flux: "3" },
    ]);
    expect(readCsv(path.join(cacheDir, "hanshiqiao_fluxs.csv"))).toEqual([
      { record_time: "2021-01-01 00:00:00", co2_flux: "1" },
      { record_time: "2021-01-01 01:00:00", co2_flux: "3" },
    ]);
  });

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
