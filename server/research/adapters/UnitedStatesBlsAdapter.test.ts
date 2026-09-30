// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { fetchOfficialSource } from "../ResearchSource";
import { UnitedStatesBlsAdapter, parseBlsCpi, parseOewsRows } from "./UnitedStatesBlsAdapter";
import { createZipFixture, parseDelimitedText } from "../parsers/tabular";

describe("UnitedStatesBlsAdapter", () => {
  it("normalizes software developer metro, state, and national annual percentiles", async () => {
    const oewsText = (await readFile(join(process.cwd(), "server/research/fixtures/us-oews.txt"), "utf8")).replace(/\\t/g, "\t");
    const cpiText = await readFile(join(process.cwd(), "server/research/fixtures/us-cpi.json"), "utf8");
    const wageBytes = createZipFixture({ "oesm25all.txt": oewsText });
    const cpiBytes = new TextEncoder().encode(cpiText);
    const adapter = new UnitedStatesBlsAdapter({
      now: () => Date.parse("2026-09-16T00:00:00.000Z"),
      fetchSource: (async (url: string) => ({ bytes: url.includes("special-requests") ? wageBytes : cpiBytes, finalUrl: url, sha256: url.includes("special-requests") ? "a".repeat(64) : "b".repeat(64) })) as typeof fetchOfficialSource,
    });

    const release = await adapter.refresh();
    const software = release.benchmarks.filter((row) => row.sourceOccupationCode === "15-1252");

    expect(software.map((row) => row.geographyLevel)).toEqual(expect.arrayContaining(["metro", "state", "national"]));
    expect(software.find((row) => row.geographyLevel === "metro")).toMatchObject({ geographyCode: "41860", p25: 145_000, p50: 185_000, p75: 230_000 });
    expect(software.some((row) => row.geographyCode === "35620")).toBe(false);
    expect(release.benchmarks.some((row) => row.sourceOccupationCode === "13-2051")).toBe(false);
    expect(release.cpiPoints.map((point) => point.period)).toEqual(["2026-08", "2026-07", "2025-09"]);
  });

  it("filters unsupported SOC codes and suppressed annual estimates", async () => {
    const oewsText = (await readFile(join(process.cwd(), "server/research/fixtures/us-oews.txt"), "utf8")).replace(/\\t/g, "\t");
    const benchmarks = parseOewsRows(parseDelimitedText(oewsText, "\t"), "release", "2025-05", "https://www.bls.gov/oes/");
    expect(benchmarks).toHaveLength(3);
    expect(benchmarks.every((row) => row.currency === "USD" && row.period === "annual")).toBe(true);
  });

  it("rejects BLS API errors and discards annual pseudo-months", () => {
    const failed = { status: "REQUEST_FAILED", message: ["bad request"] };
    expect(() => parseBlsCpi(failed, "https://api.bls.gov/cpi", "2026-09-16T00:00:00.000Z")).toThrow("bls-cpi-request-failed");
    const parsed = parseBlsCpi({ status: "REQUEST_SUCCEEDED", Results: { series: [{ seriesID: "CUUR0000SA0", data: [{ year: "2025", period: "M13", value: "2.9" }] }] } }, "https://api.bls.gov/cpi", "2026-09-16T00:00:00.000Z");
    expect(parsed).toEqual([]);
  });
});
