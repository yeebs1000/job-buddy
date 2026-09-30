import type { ResearchReleaseInput } from "./ResearchSource";

export function release(id: string, market: "SG" | "HK" | "US" = "SG"): ResearchReleaseInput {
  const currency = market === "SG" ? "SGD" : market === "HK" ? "HKD" : "USD";
  const period = market === "US" ? "annual" : "monthly";
  return {
    id,
    market,
    retrievedAt: "2026-09-16T00:00:00.000Z",
    sources: [{
      kind: "wages",
      url: market === "US" ? "https://www.bls.gov/oes/" : market === "HK" ? "https://www.censtatd.gov.hk/wages" : "https://stats.mom.gov.sg/wages",
      sha256: "a".repeat(64),
      retrievedAt: "2026-09-16T00:00:00.000Z",
    }],
    benchmarks: [{
      id: `${id}-benchmark`, releaseId: id, market, currency, period,
      sourceOccupationCode: market === "US" ? "15-1252" : market === "SG" ? "2512" : "2",
      sourceOccupationLabel: "Software developers", canonicalRole: "software-engineer",
      geographyLevel: market === "US" ? "national" : "market", geographyCode: market, geographyLabel: market,
      p25: 5_000, p50: 7_000, p75: 9_000, referencePeriod: "2025-05", compensationScope: "Gross wage",
      sourceUrl: market === "US" ? "https://www.bls.gov/oes/" : market === "HK" ? "https://www.censtatd.gov.hk/wages" : "https://stats.mom.gov.sg/wages",
    }],
    cpiPoints: [],
  };
}
