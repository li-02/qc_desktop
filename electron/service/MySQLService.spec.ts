const mockExecute = jest.fn();
const mockQuery = jest.fn();
const mockEnd = jest.fn();

jest.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => false),
    encryptString: jest.fn(),
    decryptString: jest.fn(),
  },
}));

jest.mock("mysql2/promise", () => ({
  createConnection: jest.fn(() =>
    Promise.resolve({
      execute: mockExecute,
      query: mockQuery,
      end: mockEnd,
    })
  ),
}));

jest.mock("../core/DatabaseManager", () => ({
  DatabaseManager: {
    getInstance: jest.fn(() => ({
      getDatabase: jest.fn(() => ({
        prepare: jest.fn(() => ({
          all: jest.fn(),
          get: jest.fn(),
          run: jest.fn(),
        })),
        transaction: jest.fn((fn: Function) => fn),
      })),
    })),
  },
}));

import { MySQLService } from "./MySQLService";
import { MySQLConnectionConfig } from "@shared/types/mysqlInterface";

const config: MySQLConnectionConfig = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "secret",
  database: "qc",
};

describe("MySQLService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue([[{ cnt: 2 }]]);
    mockQuery.mockResolvedValue([[{ id: 1, name: "miyun" }]]);
  });

  it("预览表数据时不使用 LIMIT 绑定参数，避免部分 MySQL 服务端执行失败", async () => {
    const service = new MySQLService();

    const result = await service.getTablePreview(config, "my`table", 20.9);

    expect(result.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith("SELECT COUNT(*) as cnt FROM `my``table`");
    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM `my``table` LIMIT 20");
    expect(mockExecute).not.toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), expect.any(Array));
    expect(result.data).toEqual({
      columns: ["id", "name"],
      rows: [[1, "miyun"]],
      totalCount: 2,
    });
  });

  it("预览行数会被限制在安全范围内", async () => {
    const service = new MySQLService();

    await service.getTablePreview(config, "miyun_aqis", 5000);

    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM `miyun_aqis` LIMIT 1000");
  });
  it("会按多个表的时间列对齐所选列后导入一个数据集", async () => {
    const importDataset = jest.fn().mockResolvedValue({ success: true });
    const service = new MySQLService({ importDataset } as any);
    mockQuery
      .mockResolvedValueOnce([
        [
          { __time: "2026-01-01 00:00:00", c0: 1 },
          { __time: "2026-01-01 01:00:00", c0: 2 },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { __time: "2026-01-01 01:00:00", c0: 10 },
          { __time: "2026-01-01 02:00:00", c0: 20 },
        ],
      ]);

    const result = await service.importTable(
      {
        categoryId: "cat-1",
        datasetName: "joined",
        dataType: "flux",
        connection: config,
        table: "fluxs",
        startTime: "2026-01-01 00:00:00",
        endTime: "2026-01-01 02:00:00",
        selectedTables: [
          { table: "fluxs", timeColumn: "record_time", columns: ["nee"] },
          { table: "aqis", timeColumn: "record_time", columns: ["co"] },
        ],
        missingValueTypes: [],
      },
      null
    );

    expect(result.success).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("BETWEEN ? AND ?"),
      ["2026-01-01 00:00:00", "2026-01-01 02:00:00"]
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("BETWEEN ? AND ?"),
      ["2026-01-01 00:00:00", "2026-01-01 02:00:00"]
    );
    expect(importDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetName: "joined",
        rows: 3,
        columns: ["record_time", "nee", "co"],
      })
    );
  });
});
