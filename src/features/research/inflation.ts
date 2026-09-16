import type { CpiPoint } from "../../domain/research";

export interface InflationAdjustment {
  amount: number;
  factor: number;
  referencePeriod: string;
  latestPeriod: string;
  label: string;
  referencePointId: string;
  latestPointId: string;
}

export function periodStart(period: string): Date | undefined {
  const match = period.match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!match) return undefined;
  const month = Number(match[2] ?? "01");
  if (month < 1 || month > 12) return undefined;
  return new Date(Date.UTC(Number(match[1]), month - 1, 1));
}

export function ageInDays(referencePeriod: string, calculatedAt: string): number | undefined {
  const reference = periodStart(referencePeriod);
  const calculated = new Date(calculatedAt);
  if (!reference || !Number.isFinite(calculated.getTime())) return undefined;
  return Math.floor((calculated.getTime() - reference.getTime()) / 86_400_000);
}

export function adjustForInflation(input: {
  amount: number;
  referencePeriod: string;
  calculatedAt: string;
  points: CpiPoint[];
}): InflationAdjustment | undefined {
  if (!Number.isFinite(input.amount) || input.amount < 0) return undefined;
  const age = ageInDays(input.referencePeriod, input.calculatedAt);
  if (age === undefined || age <= 365) return undefined;

  const reference = input.points.find((point) => point.period === input.referencePeriod);
  if (!reference) return undefined;
  const calculatedMonth = input.calculatedAt.slice(0, 7);
  const latest = input.points
    .filter((point) => point.market === reference.market && /^\d{4}-\d{2}$/.test(point.period) && point.period <= calculatedMonth)
    .sort((left, right) => right.period.localeCompare(left.period))[0];
  if (!latest || latest.period <= reference.period) return undefined;

  const factor = latest.index / reference.index;
  return {
    amount: input.amount * factor,
    factor,
    referencePeriod: reference.period,
    latestPeriod: latest.period,
    label: `Equivalent in ${latest.period} prices`,
    referencePointId: reference.id,
    latestPointId: latest.id,
  };
}
