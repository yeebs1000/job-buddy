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

function parseAmount(value: string): number {
  return Number(value.replaceAll(",", ""));
}
