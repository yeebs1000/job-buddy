import {
  salaryEstimateSnapshotSchema,
  type CpiPoint,
  type RoleMatch,
  type SalaryBenchmark,
  type SalaryEstimateSnapshot,
  type SalaryObservation,
} from "../../domain/research";
import { adjustForInflation, ageInDays } from "./inflation";
import { roundSalaryDown, salaryRoundingRule } from "./roundSalary";

export interface CalculateEstimateInput {
  snapshotId: string;
  applicationId: string;
  benchmark: SalaryBenchmark;
  roleMatch: RoleMatch;
  geographyFallback: "exact" | "state" | "national";
  observations: SalaryObservation[];
  cpiPoints: CpiPoint[];
  calculatedAt: string;
}

export type EstimateResult = SalaryEstimateSnapshot | { status: "insufficient_evidence"; reasons: string[] };

interface WeightedValue { value: number; weight: number }

export function calculateEstimate(input: CalculateEstimateInput): EstimateResult {
  const officialAge = ageInDays(input.benchmark.referencePeriod, input.calculatedAt);
  if (officialAge === undefined) return { status: "insufficient_evidence", reasons: ["invalid-official-reference-period"] };
  if (officialAge > 1_095) return { status: "insufficient_evidence", reasons: ["official-benchmark-older-than-three-years"] };
  if (officialAge < 0) return { status: "insufficient_evidence", reasons: ["official-benchmark-from-the-future"] };

  const calculatedTime = Date.parse(input.calculatedAt);
  if (!Number.isFinite(calculatedTime)) return { status: "insufficient_evidence", reasons: ["invalid-calculation-time"] };

  const eligible = input.observations.flatMap((observation) => {
    const observedTime = Date.parse(observation.observedAt);
    const observationAge = Math.floor((calculatedTime - observedTime) / 86_400_000);
    const compatible = observation.reusable
      && observation.market === input.benchmark.market
      && observation.currency === input.benchmark.currency
      && observation.period === input.benchmark.period
      && observation.canonicalRole === input.roleMatch.canonicalRole
      && Number.isFinite(observedTime)
      && observationAge >= 0
      && observationAge <= 365;
    if (!compatible) return [];
    return [{ observation, weight: observationAge <= 183 ? 1 : 0.5 }];
  });

  const evidenceWeight = eligible.length >= 6 ? 0.3 : eligible.length >= 3 ? 0.2 : 0;
  const officialMinimum = input.benchmark.p25;
  const officialMaximum = input.benchmark.p75;
  let minimum = officialMinimum;
  let maximum = officialMaximum;
  let conflictingEvidence = false;

  if (evidenceWeight > 0) {
    const observedMinimum = weightedMedian(eligible.map(({ observation, weight }) => ({ value: observation.minimum, weight })));
    const observedMaximum = weightedMedian(eligible.map(({ observation, weight }) => ({ value: observation.maximum ?? observation.minimum, weight })));
    const blendedMinimum = officialMinimum * (1 - evidenceWeight) + observedMinimum * evidenceWeight;
    const blendedMaximum = officialMaximum * (1 - evidenceWeight) + observedMaximum * evidenceWeight;
    minimum = clamp(blendedMinimum, officialMinimum * 0.85, officialMinimum * 1.15);
    maximum = clamp(blendedMaximum, officialMaximum * 0.85, officialMaximum * 1.15);
    conflictingEvidence = minimum !== blendedMinimum || maximum !== blendedMaximum;
  }

  const effectiveStrength = input.benchmark.matchCeiling === "limited" ? "limited" : input.roleMatch.strength;
  const widening = effectiveStrength === "limited" ? 0.25 : effectiveStrength === "moderate" ? 0.15 : 0;
  minimum *= 1 - widening;
  maximum *= 1 + widening;
  minimum = preciseMoney(minimum);
  maximum = preciseMoney(maximum);
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];

  const inflationMinimum = adjustForInflation({ amount: minimum, referencePeriod: input.benchmark.referencePeriod, calculatedAt: input.calculatedAt, points: input.cpiPoints });
  const inflationMaximum = adjustForInflation({ amount: maximum, referencePeriod: input.benchmark.referencePeriod, calculatedAt: input.calculatedAt, points: input.cpiPoints });
  const exactAdjustedRange = inflationMinimum && inflationMaximum
    ? { minimum: inflationMinimum.amount, maximum: inflationMaximum.amount }
    : undefined;
  const displaySource = exactAdjustedRange ?? { minimum, maximum };

  const conditions: string[] = [];
  let materialFallbacks = 0;
  if (effectiveStrength === "moderate") { materialFallbacks += 1; conditions.push("Moderate role match"); }
  if (effectiveStrength === "limited") conditions.push("Limited role match");
  if (input.geographyFallback !== "exact") { materialFallbacks += 1; conditions.push(`${input.geographyFallback} geography fallback`); }
  if (officialAge > 365 && officialAge <= 730) { materialFallbacks += 1; conditions.push("Official benchmark is more than one year old"); }
  if (officialAge > 730) conditions.push("Official benchmark is more than two years old");
  if (conflictingEvidence) conditions.push("Observed salary evidence conflicts materially with the official range");

  const confidence = effectiveStrength === "limited" || officialAge > 730 || materialFallbacks > 1 || conflictingEvidence
    ? "limited"
    : materialFallbacks === 1 ? "moderate" : "high";
  const assumptions = [
    `Official ${input.benchmark.compensationScope.toLocaleLowerCase("en")} benchmark anchored at the 25th to 75th percentiles.`,
    ...(inflationMinimum ? [`${inflationMinimum.label}; this is purchasing-power adjustment, not a wage forecast.`] : []),
    ...(inflationMinimum?.referenceFallback ? [`Reference CPI uses the closest earlier published period ${inflationMinimum.referencePeriod} because ${inflationMinimum.requestedReferencePeriod} is unavailable; no interpolation was used.`] : []),
  ];
  const exclusions = input.observations
    .filter((observation) => !eligible.some((candidate) => candidate.observation.id === observation.id))
    .map((observation) => `Excluded ${observation.id}: incompatible, private, future-dated, or older than twelve months.`);
  const inputReleaseIds = [input.benchmark.releaseId, ...(inflationMinimum ? [inflationMinimum.referencePointId, inflationMinimum.latestPointId] : [])];

  return salaryEstimateSnapshotSchema.parse({
    id: input.snapshotId,
    applicationId: input.applicationId,
    market: input.benchmark.market,
    currency: input.benchmark.currency,
    period: input.benchmark.period,
    benchmarkId: input.benchmark.id,
    benchmarkSourceUrl: input.benchmark.sourceUrl,
    inputReleaseIds: [...new Set(inputReleaseIds)],
    roleMatch: input.roleMatch,
    geographyFallback: input.geographyFallback,
    exactNominalRange: { minimum, maximum },
    ...(exactAdjustedRange ? { exactAdjustedRange } : {}),
    displayRange: {
      minimum: roundSalaryDown(displaySource.minimum, input.benchmark.currency, input.benchmark.period),
      maximum: roundSalaryDown(displaySource.maximum, input.benchmark.currency, input.benchmark.period),
    },
    roundingRule: salaryRoundingRule(input.benchmark.currency, input.benchmark.period),
    evidenceIds: eligible.map(({ observation }) => observation.id),
    evidenceSummary: { eligible: eligible.length, excluded: input.observations.length - eligible.length, blendWeight: evidenceWeight },
    confidence,
    confidenceConditions: conditions,
    assumptions,
    exclusions,
    calculatedAt: input.calculatedAt,
  });
}

function weightedMedian(values: WeightedValue[]): number {
  const ordered = [...values].sort((left, right) => left.value - right.value);
  const half = ordered.reduce((total, item) => total + item.weight, 0) / 2;
  let cumulative = 0;
  for (const item of ordered) {
    cumulative += item.weight;
    if (cumulative >= half) return item.value;
  }
  return ordered.at(-1)?.value ?? 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function preciseMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
