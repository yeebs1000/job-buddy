import type { Currency, Market, PayPeriod } from "../../../src/domain/research";

export interface DetectedSalary {
  currency: Currency;
  minimum: number;
  maximum: number;
  period: PayPeriod;
  evidenceExcerpt: string;
}

const numberSource = String.raw`(\d{1,3}(?:,\d{3})+|\d{4,9})(?:\.\d{1,2})?`;

export function detectSalary(text: string, input: { market: Market }): DetectedSalary | undefined {
  const bounded = text.slice(0, 200_000);
  const currency = input.market === "SG" ? "SGD" : input.market === "HK" ? "HKD" : "USD";
  const marker = input.market === "SG" ? String.raw`(?:SGD|S\$)`
    : input.market === "HK" ? String.raw`(?:HKD|HK\$)`
      : String.raw`(?:USD|US\$|\$)`;
  const expression = new RegExp(
    String.raw`${marker}\s*${numberSource}\s*(?:-|–|—|to)\s*(?:${marker}\s*)?${numberSource}\s*(?:\/|per\s+|a\s+)?(month(?:ly)?|year(?:ly)?|annual(?:ly)?)`,
    "iu",
  );
  const match = expression.exec(bounded);
  if (!match) return undefined;
  const minimum = parseAmount(match[1]);
  const maximum = parseAmount(match[2]);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum) return undefined;
  const period: PayPeriod = /^month/iu.test(match[3]) ? "monthly" : "annual";
  return { currency, minimum, maximum, period, evidenceExcerpt: match[0].trim().slice(0, 300) };
}

export function detectSalaryJsonLd(text: string, input: { market: Market }): DetectedSalary | undefined {
  if (text.length > 100_000) return undefined;
  let root: unknown;
  try { root = JSON.parse(text); } catch { return undefined; }
  const expectedCurrency: Currency = input.market === "SG" ? "SGD" : input.market === "HK" ? "HKD" : "USD";
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < 5_000) {
    const current = queue.shift()!; visited += 1;
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      if (current.depth < 12) for (const value of current.value) queue.push({ value, depth: current.depth + 1 });
      continue;
    }
    const record = current.value as Record<string, unknown>;
    const result = structuredSalary(record.baseSalary, expectedCurrency);
    if (result) return result;
    if (current.depth < 12) for (const value of Object.values(record)) queue.push({ value, depth: current.depth + 1 });
  }
  return undefined;
}

function structuredSalary(input: unknown, expectedCurrency: Currency): DetectedSalary | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const salary = input as Record<string, unknown>;
  if (String(salary.currency ?? "").toLocaleUpperCase("en") !== expectedCurrency) return undefined;
  const value = salary.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const range = value as Record<string, unknown>;
  const minimum = Number(range.minValue);
  const maximum = Number(range.maxValue);
  const unit = String(range.unitText ?? range.unitCode ?? "").toLocaleUpperCase("en");
  const period: PayPeriod | undefined = /^(?:MONTH|MONTHLY|MON)$/u.test(unit) ? "monthly"
    : /^(?:YEAR|YEARLY|ANNUAL|ANN)$/u.test(unit) ? "annual" : undefined;
  if (!period || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum) return undefined;
  return { currency: expectedCurrency, minimum, maximum, period, evidenceExcerpt: `Structured salary: ${expectedCurrency} ${minimum}-${maximum} ${period}` };
}

function parseAmount(value: string): number {
  return Number(value.replaceAll(",", ""));
}
