import { describe, expect, it } from "vitest";
import type { CpiPoint, RoleMatch, SalaryBenchmark, SalaryObservation } from "../../domain/research";
import { calculateEstimate, type CalculateEstimateInput } from "./calculateEstimate";

const roleMatch: RoleMatch = {
  originalTitle: "Software Engineer",
  normalizedTitle: "software engineer",
  canonicalRole: "software-engineer",
  sourceOccupationCode: "15-1252",
  strength: "exact",
  ruleId: "software-engineer",
  overridden: false,
};

const benchmark: SalaryBenchmark = {
  id: "benchmark-1",
  releaseId: "bls-2026",
  market: "US",
  currency: "USD",
  period: "annual",
  sourceOccupationCode: "15-1252",
  sourceOccupationLabel: "Software Developers",
  canonicalRole: "software-engineer",
  geographyLevel: "metro",
  geographyCode: "41860",
  geographyLabel: "San Francisco-Oakland",
  p25: 100_000,
  p50: 125_000,
  p75: 150_000,
  referencePeriod: "2026-05",
  compensationScope: "Annual wage",
  sourceUrl: "https://www.bls.gov/oes/",
};

let observationSequence = 0;
function observation(minimum: number, maximum: number, overrides: Partial<SalaryObservation> = {}): SalaryObservation {
  observationSequence += 1;
  return {
    id: `observation-${observationSequence}`,
    applicationId: "application-1",
    provenance: "job_posting",
    market: "US",
    currency: "USD",
    period: "annual",
    minimum,
    maximum,
    canonicalRole: "software-engineer",
    observedAt: "2026-08-01T00:00:00.000Z",
    sourceUrl: "https://jobs.example/1",
    reusable: true,
    ...overrides,
  };
}

function input(overrides: Partial<CalculateEstimateInput> = {}): CalculateEstimateInput {
  return {
    snapshotId: "estimate-1",
    applicationId: "application-1",
    benchmark,
    roleMatch,
    geographyFallback: "exact",
    observations: [],
    cpiPoints: [],
    calculatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("calculateEstimate", () => {
  it("does not blend fewer than three eligible observations", () => {
    const result = calculateEstimate(input({ observations: [observation(120_000, 140_000), observation(125_000, 145_000)] }));
    expect(result).toMatchObject({
      exactNominalRange: { minimum: 100_000, maximum: 150_000 },
      evidenceSummary: { eligible: 2, blendWeight: 0 },
    });
  });

  it("uses 20 percent at three observations and caps endpoint movement at 15 percent", () => {
    const result = calculateEstimate(input({ observations: [observation(200_000, 300_000), observation(210_000, 310_000), observation(220_000, 320_000)] }));
    expect(result).toMatchObject({
      exactNominalRange: { minimum: 115_000, maximum: 172_500 },
      displayRange: { minimum: 115_000, maximum: 170_000 },
      evidenceSummary: { eligible: 3, blendWeight: 0.2 },
      confidence: "limited",
    });
  });

  it("uses 30 percent from six observations and half-weights observations aged seven to twelve months", () => {
    const observations = [100, 110, 120, 130, 140, 150].map((value, index) => observation(value * 1_000, (value + 20) * 1_000, {
      observedAt: index < 3 ? "2026-08-01T00:00:00.000Z" : "2025-11-01T00:00:00.000Z",
    }));
    expect(calculateEstimate(input({ observations }))).toMatchObject({ evidenceSummary: { eligible: 6, blendWeight: 0.3 } });
  });

  it("widens moderate and limited role matches outward", () => {
    expect(calculateEstimate(input({ roleMatch: { ...roleMatch, strength: "moderate" } }))).toMatchObject({
      exactNominalRange: { minimum: 85_000, maximum: 172_500 },
      confidence: "moderate",
    });
    expect(calculateEstimate(input({ roleMatch: { ...roleMatch, strength: "limited" } }))).toMatchObject({
      exactNominalRange: { minimum: 75_000, maximum: 187_500 },
      confidence: "limited",
    });
  });

  it("excludes stale, mismatched, and private evidence", () => {
    const observations = [
      observation(140_000, 160_000, { reusable: false, provenance: "offer" }),
      observation(140_000, 160_000, { observedAt: "2025-01-01T00:00:00.000Z" }),
      observation(140_000, 160_000, { canonicalRole: "data-engineer" }),
    ];
    expect(calculateEstimate(input({ observations }))).toMatchObject({
      exactNominalRange: { minimum: 100_000, maximum: 150_000 },
      evidenceSummary: { eligible: 0, excluded: 3, blendWeight: 0 },
    });
  });

  it("cannot decrease an endpoint when every eligible observation increases", () => {
    const lower = calculateEstimate(input({ observations: [observation(100_000, 120_000), observation(110_000, 130_000), observation(120_000, 140_000)] }));
    const higher = calculateEstimate(input({ observations: [observation(110_000, 130_000), observation(120_000, 140_000), observation(130_000, 150_000)] }));
    if ("status" in lower || "status" in higher) throw new Error("unexpected insufficient evidence");
    expect(higher.exactNominalRange.minimum).toBeGreaterThanOrEqual(lower.exactNominalRange.minimum);
    expect(higher.exactNominalRange.maximum).toBeGreaterThanOrEqual(lower.exactNominalRange.maximum);
    expect(higher.exactNominalRange.minimum).toBeLessThanOrEqual(higher.exactNominalRange.maximum);
  });

  it("returns insufficient evidence when the official benchmark is older than three years", () => {
    expect(calculateEstimate(input({ benchmark: { ...benchmark, referencePeriod: "2023-01" } }))).toEqual({
      status: "insufficient_evidence",
      reasons: ["official-benchmark-older-than-three-years"],
    });
  });

  it("adds a purchasing-power equivalent when an exact dated CPI series is available", () => {
    const cpiPoints: CpiPoint[] = [
      { id: "cpi-old", source: "BLS CPI-U", sourceUrl: "https://www.bls.gov/cpi/", market: "US", period: "2025-05", index: 320, baseLabel: "1982-84=100", retrievedAt: "2026-09-16T00:00:00.000Z" },
      { id: "cpi-new", source: "BLS CPI-U", sourceUrl: "https://www.bls.gov/cpi/", market: "US", period: "2026-08", index: 331, baseLabel: "1982-84=100", retrievedAt: "2026-09-16T00:00:00.000Z" },
    ];
    const result = calculateEstimate(input({ benchmark: { ...benchmark, referencePeriod: "2025-05" }, cpiPoints }));
    expect(result).toMatchObject({
      exactAdjustedRange: { minimum: 103_437.5, maximum: 155_156.25 },
      assumptions: expect.arrayContaining(["Equivalent in 2026-08 prices; this is purchasing-power adjustment, not a wage forecast."]),
    });
  });
});
