import type { Currency, Market, RoleMatch, SalaryBenchmark } from "../../domain/research";

type BenchmarkResolution =
  | { benchmark: SalaryBenchmark; fallback: "exact" | "state" | "national" }
  | { status: "insufficient_evidence" };

const marketCurrency: Record<Market, Currency> = { SG: "SGD", HK: "HKD", US: "USD" };

export function resolveBenchmark(input: {
  market: Market;
  roleMatch: RoleMatch;
  city?: string;
  state?: string;
  metroCode?: string;
  benchmarks: SalaryBenchmark[];
}): BenchmarkResolution {
  const supported = input.benchmarks.filter((benchmark) => benchmark.market === input.market
    && benchmark.currency === marketCurrency[input.market]
    && benchmark.sourceOccupationCode === input.roleMatch.sourceOccupationCode
    && (!benchmark.canonicalRole || benchmark.canonicalRole === input.roleMatch.canonicalRole));

  if (input.market === "US") {
    const metro = input.metroCode && supported.find((benchmark) => benchmark.geographyLevel === "metro" && benchmark.geographyCode === input.metroCode);
    if (metro) return { benchmark: metro, fallback: "exact" };

    const normalizedState = input.state?.trim().toUpperCase();
    const state = normalizedState && supported.find((benchmark) => benchmark.geographyLevel === "state" && benchmark.geographyCode.toUpperCase() === normalizedState);
    if (state) return { benchmark: state, fallback: "state" };

    const national = supported.find((benchmark) => benchmark.geographyLevel === "national" && benchmark.geographyCode.toUpperCase() === "US");
    return national ? { benchmark: national, fallback: "national" } : { status: "insufficient_evidence" };
  }

  const marketWide = supported.find((benchmark) => (benchmark.geographyLevel === "market" || benchmark.geographyLevel === "national")
    && benchmark.geographyCode.toUpperCase() === input.market);
  return marketWide ? { benchmark: marketWide, fallback: "exact" } : { status: "insufficient_evidence" };
}
