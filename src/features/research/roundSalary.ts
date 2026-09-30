import type { Currency, PayPeriod } from "../../domain/research";

export function salaryRoundingStep(currency: Currency, period: PayPeriod): number {
  if (period === "annual") return 5_000;
  if (currency === "HKD") return 500;
  return 100;
}

export function salaryRoundingRule(currency: Currency, period: PayPeriod): string {
  return `floor-${currency.toLowerCase()}-${period}-${salaryRoundingStep(currency, period)}`;
}

export function roundSalaryDown(amount: number, currency: Currency, period: PayPeriod): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("invalid-salary");
  const step = salaryRoundingStep(currency, period);
  return Math.floor(amount / step) * step;
}
