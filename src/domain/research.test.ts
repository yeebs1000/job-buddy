import { describe, expect, it } from "vitest";
import {
  marketSchema,
  salaryBenchmarkSchema,
  salaryEstimateSnapshotSchema,
  salaryObservationSchema,
} from "./research";

describe("salary research contracts", () => {
  it("keeps the three debut markets and rejects an inverted observation range", () => {
    expect(marketSchema.options).toEqual(["SG", "HK", "US"]);
    expect(() => salaryObservationSchema.parse({
      id: "o1",
      applicationId: "a1",
      provenance: "job_posting",
      market: "US",
      currency: "USD",
      period: "annual",
      minimum: 160_000,
      maximum: 120_000,
      canonicalRole: "software-engineer",
      observedAt: "2026-09-16T00:00:00.000Z",
      sourceUrl: "https://jobs.example/1",
      reusable: true,
    })).toThrow();
  });

  it("rejects unknown fields and inconsistent official percentiles", () => {
    expect(() => salaryBenchmarkSchema.parse({
      id: "us-15-1252-national-2025",
      releaseId: "bls-oe-2025",
      market: "US",
      currency: "USD",
      period: "annual",
      sourceOccupationCode: "15-1252",
      sourceOccupationLabel: "Software Developers",
      canonicalRole: "software-engineer",
      geographyLevel: "national",
      geographyCode: "US",
      geographyLabel: "United States",
      p25: 150_000,
      p50: 140_000,
      p75: 190_000,
      referencePeriod: "2025-05",
      compensationScope: "Annual mean wage",
      sourceUrl: "https://www.bls.gov/oes/",
      unexpected: true,
    })).toThrow();
  });

  it("requires an immutable snapshot to disclose evidence, assumptions, and confidence conditions", () => {
    const snapshot = salaryEstimateSnapshotSchema.parse({
      id: "estimate-1",
      applicationId: "a1",
      market: "US",
      currency: "USD",
      period: "annual",
      benchmarkId: "us-15-1252-national-2025",
      inputReleaseIds: ["bls-oe-2025", "bls-cpi-2026-08"],
      roleMatch: {
        originalTitle: "Software Engineer",
        normalizedTitle: "software engineer",
        canonicalRole: "software-engineer",
        sourceOccupationCode: "15-1252",
        strength: "exact",
        ruleId: "software-engineer",
        overridden: false,
      },
      geographyFallback: "national",
      exactNominalRange: { minimum: 120_000, maximum: 180_000 },
      exactAdjustedRange: { minimum: 124_000, maximum: 186_000 },
      displayRange: { minimum: 120_000, maximum: 185_000 },
      roundingRule: "floor-usd-annual-5000",
      evidenceIds: ["observation-1"],
      evidenceSummary: { eligible: 1, excluded: 0, blendWeight: 0 },
      confidence: "moderate",
      confidenceConditions: ["National geography fallback"],
      assumptions: ["Purchasing-power adjustment only"],
      exclusions: [],
      calculatedAt: "2026-09-16T00:00:00.000Z",
    });

    expect(snapshot.displayRange).toEqual({ minimum: 120_000, maximum: 185_000 });
  });
});
