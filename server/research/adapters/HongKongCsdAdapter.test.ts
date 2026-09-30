import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { fetchOfficialSource } from "../ResearchSource";
import type { extractPdfText } from "../parsers/pdfText";
import { HongKongCsdAdapter, parseCompositeCpi, parseEarningsTable69 } from "./HongKongCsdAdapter";

describe("HongKongCsdAdapter", () => {
  it("uses the full-time professional distribution as a limited Hong Kong benchmark", async () => {
    const earnings = await readFile(join(process.cwd(), "server/research/fixtures/hk-earnings-table-6-9.txt"), "utf8");
    const cpi = await readFile(join(process.cwd(), "server/research/fixtures/hk-composite-cpi.txt"), "utf8");
    const adapter = new HongKongCsdAdapter({
      now: () => Date.parse("2026-09-16T00:00:00.000Z"),
      fetchSource: (async (url: string) => ({ bytes: new Uint8Array([1]), finalUrl: url, sha256: url.includes("B105") ? "a".repeat(64) : "b".repeat(64) })) as typeof fetchOfficialSource,
      extractText: (async (_bytes: Uint8Array, options: { sourceUrl: string }) => options.sourceUrl.includes("B105") ? earnings : cpi) as typeof extractPdfText,
    });

    const release = await adapter.refresh();

    expect(release.benchmarks).toContainEqual(expect.objectContaining({
      market: "HK", currency: "HKD", period: "monthly", sourceOccupationCode: "2",
      p25: 22_400, p50: 33_000, p75: 47_500, matchCeiling: "limited",
    }));
    expect(release.cpiPoints).toContainEqual(expect.objectContaining({ period: "2026-08", index: 108.2, baseLabel: "October 2019 - September 2020 = 100" }));
  });

  it("finds Table 6.9 despite whitespace but rejects missing tables and suppressed cells", async () => {
    const earnings = await readFile(join(process.cwd(), "server/research/fixtures/hk-earnings-table-6-9.txt"), "utf8");
    expect(parseEarningsTable69(earnings.replace(/ /g, "  "))).toMatchObject({ p25: 22_400, p50: 33_000, p75: 47_500 });
    expect(() => parseEarningsTable69(earnings.replace("Table 6.9", "Table 7.1"))).toThrow("missing-hk-table-6-9");
    expect(() => parseEarningsTable69(earnings.replace("22,400", "-"))).toThrow("invalid-hk-full-time-percentiles");
  });

  it("parses only Composite CPI index levels", async () => {
    const cpi = await readFile(join(process.cwd(), "server/research/fixtures/hk-composite-cpi.txt"), "utf8");
    expect(parseCompositeCpi(cpi, "https://www.censtatd.gov.hk/cpi.pdf", "2026-09-16T00:00:00.000Z")).toHaveLength(3);
    expect(() => parseCompositeCpi(cpi.replace("Composite CPI", "CPI(A)"), "https://www.censtatd.gov.hk/cpi.pdf", "2026-09-16T00:00:00.000Z")).toThrow("missing-hk-composite-cpi");
  });
});
