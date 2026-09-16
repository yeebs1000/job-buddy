import { describe, expect, it } from "vitest";
import type { RoleMatch, SalaryBenchmark } from "../../domain/research";
import { resolveBenchmark } from "./resolveBenchmark";

const roleMatch: RoleMatch = {
  originalTitle: "Software Engineer",
  normalizedTitle: "software engineer",
  canonicalRole: "software-engineer",
  sourceOccupationCode: "15-1252",
  strength: "exact",
  ruleId: "software-engineer",
  overridden: false,
};

function benchmark(input: Partial<SalaryBenchmark> & Pick<SalaryBenchmark, "id" | "market" | "currency" | "geographyLevel" | "geographyCode">): SalaryBenchmark {
  return {
    releaseId: `${input.market.toLowerCase()}-2025`,
    period: input.market === "US" ? "annual" : "monthly",
    sourceOccupationCode: input.market === "US" ? "15-1252" : input.market === "SG" ? "2512" : "2",
    sourceOccupationLabel: "Software developers",
    canonicalRole: "software-engineer",
    geographyLabel: input.geographyCode,
    p25: 100_000,
    p50: 140_000,
    p75: 180_000,
    referencePeriod: "2025",
    compensationScope: "Gross wage",
    sourceUrl: "https://example.gov/salaries",
    ...input,
  };
}

describe("resolveBenchmark", () => {
  const benchmarks: SalaryBenchmark[] = [
    benchmark({ id: "metro", market: "US", currency: "USD", geographyLevel: "metro", geographyCode: "41860" }),
    benchmark({ id: "state", market: "US", currency: "USD", geographyLevel: "state", geographyCode: "CA" }),
    benchmark({ id: "national", market: "US", currency: "USD", geographyLevel: "national", geographyCode: "US" }),
    benchmark({ id: "wrong-market", market: "SG", currency: "SGD", geographyLevel: "market", geographyCode: "SG" }),
  ];

  it("falls back metro then state then national without crossing markets", () => {
    expect(resolveBenchmark({ market: "US", roleMatch, metroCode: "41860", state: "CA", benchmarks })).toMatchObject({ benchmark: { id: "metro" }, fallback: "exact" });
    expect(resolveBenchmark({ market: "US", roleMatch, metroCode: "missing", state: "CA", benchmarks })).toMatchObject({ benchmark: { id: "state" }, fallback: "state" });
    expect(resolveBenchmark({ market: "US", roleMatch, metroCode: "missing", state: "WA", benchmarks })).toMatchObject({ benchmark: { id: "national" }, fallback: "national" });
  });

  it("rejects currency mismatches and missing official occupation support", () => {
    const wrongCurrency = benchmark({ id: "wrong-currency", market: "US", currency: "SGD", geographyLevel: "national", geographyCode: "US" });
    expect(resolveBenchmark({ market: "US", roleMatch, benchmarks: [wrongCurrency] })).toEqual({ status: "insufficient_evidence" });
    expect(resolveBenchmark({ market: "US", roleMatch: { ...roleMatch, sourceOccupationCode: "15-1212" }, benchmarks })).toEqual({ status: "insufficient_evidence" });
  });

  it("uses only national/market geography for Singapore and Hong Kong", () => {
    const sgMatch = { ...roleMatch, sourceOccupationCode: "2512" };
    const hkMatch = { ...roleMatch, sourceOccupationCode: "2", strength: "limited" as const };
    const sg = benchmark({ id: "sg", market: "SG", currency: "SGD", geographyLevel: "market", geographyCode: "SG" });
    const hk = benchmark({ id: "hk", market: "HK", currency: "HKD", geographyLevel: "market", geographyCode: "HK", matchCeiling: "limited" });

    expect(resolveBenchmark({ market: "SG", roleMatch: sgMatch, city: "Singapore", benchmarks: [sg, ...benchmarks] })).toMatchObject({ benchmark: { id: "sg" }, fallback: "exact" });
    expect(resolveBenchmark({ market: "HK", roleMatch: hkMatch, city: "Hong Kong", benchmarks: [hk, ...benchmarks] })).toMatchObject({ benchmark: { id: "hk", matchCeiling: "limited" }, fallback: "exact" });
  });
});
