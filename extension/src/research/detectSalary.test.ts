import { expect, it } from "vitest";
import { detectSalary, detectSalaryJsonLd } from "./detectSalary";

it.each([
  ["Salary: SGD 5,000 - 7,000 per month", "SG", { currency: "SGD", minimum: 5_000, maximum: 7_000, period: "monthly" }],
  ["HK$35,000–45,000 monthly", "HK", { currency: "HKD", minimum: 35_000, maximum: 45_000, period: "monthly" }],
  ["$120,000 to $165,000 a year", "US", { currency: "USD", minimum: 120_000, maximum: 165_000, period: "annual" }],
] as const)("detects %s", (text, market, expected) => {
  expect(detectSalary(text, { market })).toEqual(expect.objectContaining(expected));
});

it("does not infer USD from an unqualified dollar sign outside a confirmed U.S. market", () => {
  expect(detectSalary("$5,000 - $7,000 per month", { market: "SG" })).toBeUndefined();
});

it("requires two bounds and an explicit period", () => {
  expect(detectSalary("Salary up to SGD 7,000", { market: "SG" })).toBeUndefined();
  expect(detectSalary("SGD 5,000 - 7,000", { market: "SG" })).toBeUndefined();
});

it("detects bounded Schema.org baseSalary JSON-LD", () => {
  expect(detectSalaryJsonLd(JSON.stringify({
    "@type": "JobPosting",
    baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { "@type": "QuantitativeValue", minValue: 130_000, maxValue: 170_000, unitText: "YEAR" } },
  }), { market: "US" })).toMatchObject({ currency: "USD", minimum: 130_000, maximum: 170_000, period: "annual" });
});
