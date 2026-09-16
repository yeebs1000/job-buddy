import { expect, it } from "vitest";
import type { CpiPoint } from "../../domain/research";
import { adjustForInflation } from "./inflation";

const cpi = (period: string, index: number): CpiPoint => ({
  id: `cpi-${period}`,
  source: "Official CPI",
  sourceUrl: "https://example.gov/cpi",
  market: "US",
  period,
  index,
  baseLabel: "1982-84=100",
  retrievedAt: "2026-09-16T00:00:00.000Z",
});

it("adjusts dated data with exact CPI periods but calls it purchasing power", () => {
  expect(adjustForInflation({
    amount: 120_000,
    referencePeriod: "2025-05",
    calculatedAt: "2026-09-16T00:00:00.000Z",
    points: [cpi("2025-05", 320), cpi("2026-08", 331)],
  })).toMatchObject({ amount: 124_125, latestPeriod: "2026-08", label: "Equivalent in 2026-08 prices" });
});

it("does not adjust recent data or interpolate a missing reference period", () => {
  expect(adjustForInflation({ amount: 120_000, referencePeriod: "2026-05", calculatedAt: "2026-09-16T00:00:00.000Z", points: [cpi("2026-05", 329), cpi("2026-08", 331)] })).toBeUndefined();
  expect(adjustForInflation({ amount: 120_000, referencePeriod: "2025-05", calculatedAt: "2026-09-16T00:00:00.000Z", points: [cpi("2025-04", 319), cpi("2026-08", 331)] })).toBeUndefined();
});
