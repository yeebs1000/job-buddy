import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { fetchOfficialSource } from "../ResearchSource";
import { SingaporeMomAdapter } from "./SingaporeMomAdapter";

describe("SingaporeMomAdapter", () => {
  it("normalizes MOM full-time resident monthly P25/P50/P75 wages and all-items CPI", async () => {
    const rows = JSON.parse(await readFile(join(process.cwd(), "server/research/fixtures/sg-mom-wages.json"), "utf8")) as unknown[][];
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Table 4").addRows(rows);
    const wageBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const cpiBytes = new TextEncoder().encode(await readFile(join(process.cwd(), "server/research/fixtures/sg-singstat-cpi.json"), "utf8"));
    const adapter = new SingaporeMomAdapter({
      now: () => Date.parse("2026-09-16T00:00:00.000Z"),
      fetchSource: (async (url: string) => ({ bytes: url.includes("mom.gov") ? wageBytes : cpiBytes, finalUrl: url, sha256: url.includes("mom.gov") ? "a".repeat(64) : "b".repeat(64) })) as typeof fetchOfficialSource,
    });

    const release = await adapter.refresh();

    expect(release.benchmarks).toContainEqual(expect.objectContaining({
      market: "SG", currency: "SGD", period: "monthly", sourceOccupationCode: "2512",
      p25: 5200, p50: 6800, p75: 8900,
      compensationScope: "Gross monthly wage excluding bonuses for full-time resident employees",
    }));
    expect(release.benchmarks.some((row) => row.sourceOccupationCode === "9999")).toBe(false);
    expect(release.cpiPoints).toContainEqual(expect.objectContaining({ period: "2026-08", index: 118.1, baseLabel: "2019=100" }));
  });

  it("skips suppressed software rows and rejects a workbook with no supported occupations", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Table 4").addRows([
      ["Occupation Code", "Occupation", "25th Percentile", "Median", "75th Percentile", "Reference Period"],
      ["2512", "Software developers", "-", 6800, 8900, "2025-06"],
    ]);
    const wageBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const cpiBytes = new TextEncoder().encode(JSON.stringify({ Data: { metadata: { basePeriod: "2019=100" }, row: [{ rowText: "All Items", columns: [{ key: "2026 08", value: "118.1" }] }] } }));
    const adapter = new SingaporeMomAdapter({
      fetchSource: (async (url: string) => ({ bytes: url.includes("mom.gov") ? wageBytes : cpiBytes, finalUrl: url, sha256: "a".repeat(64) })) as typeof fetchOfficialSource,
    });

    await expect(adapter.refresh()).rejects.toThrow("no-supported-singapore-benchmarks");
  });
});
