import { describe, expect, it } from "vitest";
import { blendWebSalary, suggestWebRange } from "./webSalary";
import type { WebSalaryEvidence } from "../../domain/webSalary";

const source = (url: string, low = 600000, high = 900000): WebSalaryEvidence => ({ url, title: "Associate salaries", excerpt: "HKD 600,000–900,000 annual base salary", retrievedAt: "2026-09-19T00:00:00.000Z", minimum: low, maximum: high, currency: "HKD", period: "annual", basis: "base", match: "company-role", sourceType: "employer", referenceYear: 2026, confirmed: true });
describe("web salary evidence", () => {
  it("only suggests explicit currency, range and period; never treats unrelated figures as pay", () => {
    expect(suggestWebRange("HKD 600,000–900,000 annual base salary")).toMatchObject({ minimum: 600000, maximum: 900000, currency: "HKD", period: "annual" });
    expect(suggestWebRange("$600k - $900k in annual revenue")).toBeUndefined();
    expect(suggestWebRange("HKD 600,000–900,000 salary")).toBeUndefined();
    expect(suggestWebRange("Salary HKD 600,000–USD 900,000 annual")).toBeUndefined();
  });
  it("annualizes monthly evidence and floors the blended endpoints", () => {
    const result = blendWebSalary([source("https://one.test/salary"), { ...source("https://two.test/salary", 51000, 71000), period: "monthly" }], "HKD", "base", 2026);
    expect(result).toMatchObject({ minimum: 605000, maximum: 875000, count: 2, confidence: "moderate" });
  });
  it("excludes unreviewed, mixed pay basis/currency and duplicate publishers", () => {
    const result = blendWebSalary([source("https://one.test/a"), source("https://www.one.test/b"), { ...source("https://two.test/a"), basis: "total" }, { ...source("https://three.test/a"), currency: "USD" }, { ...source("https://four.test/a"), confirmed: false }], "HKD", "base", 2026);
    expect(result).toMatchObject({ count: 1, confidence: "limited" });
  });
  it("does not call unknown-date, historical, or broad market evidence moderate confidence", () => {
    expect(blendWebSalary([source("https://glassdoor.com/a"), source("https://glassdoor.com.hk/b")], "HKD", "base", 2026)?.count).toBe(1);
    expect(blendWebSalary([source("https://one.test"), { ...source("https://two.test"), referenceYear: undefined }], "HKD", "base", 2026)?.confidence).toBe("limited");
    expect(blendWebSalary([source("https://one.test"), { ...source("https://two.test"), referenceYear: 2023 }], "HKD", "base", 2026)?.confidence).toBe("limited");
    expect(blendWebSalary([], "HKD", "base", 2026)).toBeNull();
    expect(blendWebSalary([source("https://one.test"), { ...source("https://two.test"), sourceType: "self-reported" }], "HKD", "base", 2026)?.confidence).toBe("limited");
  });
});
