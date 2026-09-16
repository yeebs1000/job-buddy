import { expect, it } from "vitest";
import { roundSalaryDown } from "./roundSalary";

it.each([
  [5_299, "SGD", "monthly", 5_200],
  [34_999, "HKD", "monthly", 34_500],
  [166_480, "USD", "annual", 165_000],
  [67_999, "SGD", "annual", 65_000],
  [12_349, "USD", "monthly", 12_300],
] as const)("floors %i %s %s", (amount, currency, period, expected) => {
  expect(roundSalaryDown(amount, currency, period)).toBe(expected);
});

it("rejects non-finite and negative salary amounts", () => {
  expect(() => roundSalaryDown(Number.NaN, "USD", "annual")).toThrow("invalid-salary");
  expect(() => roundSalaryDown(-1, "USD", "annual")).toThrow("invalid-salary");
});
