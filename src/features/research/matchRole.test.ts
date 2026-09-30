import { describe, expect, it } from "vitest";
import type { RoleAliasOverride } from "../../domain/research";
import { matchRole, normalizeRoleTitle } from "./matchRole";

describe("matchRole", () => {
  it.each([
    ["Backend Software Engineer", "software-engineer", "15-1252", "exact"],
    ["Site Reliability Engineer", "site-reliability-engineer", "15-1252", "moderate"],
    ["Cybersecurity Analyst", "cybersecurity-analyst", "15-1212", "exact"],
    ["IT Support Specialist", "it-support-specialist", "15-1232", "exact"],
  ] as const)("maps %s deterministically", (title, canonicalRole, usCode, strength) => {
    expect(matchRole({ title, market: "US" })).toMatchObject({ canonicalRole, sourceOccupationCode: usCode, strength });
  });

  it("normalizes Unicode, punctuation, case, and whitespace before matching", () => {
    expect(normalizeRoleTitle("  Ｓｏｆｔｗａｒｅ—Engineer (Backend)  ")).toBe("software engineer backend");
    expect(matchRole({ title: "  Ｓｏｆｔｗａｒｅ—Engineer (Backend)  ", market: "SG" })).toMatchObject({
      canonicalRole: "software-engineer",
      sourceOccupationCode: "2512",
    });
  });

  it("uses an explicit reusable alias before the built-in catalogue", () => {
    const overrides: RoleAliasOverride[] = [{
      id: "alias-1",
      market: "US",
      normalizedTitle: "platform wizard",
      canonicalRole: "site-reliability-engineer",
      sourceOccupationCode: "15-1252",
      createdAt: "2026-09-16T00:00:00.000Z",
    }];

    expect(matchRole({ title: "Platform Wizard", market: "US", overrides })).toMatchObject({
      canonicalRole: "site-reliability-engineer",
      sourceOccupationCode: "15-1252",
      overridden: true,
      ruleId: "alias:alias-1",
    });
  });

  it("supports an explicit source-code correction without persisting it", () => {
    expect(matchRole({ title: "Software Engineer", market: "US", overrideCode: "15-1253" })).toMatchObject({
      canonicalRole: "software-quality-assurance",
      sourceOccupationCode: "15-1253",
      overridden: true,
    });
  });

  it("does not fabricate a salary occupation for an unsupported discipline", () => {
    expect(() => matchRole({ title: "Investment Banking Analyst", market: "US" })).toThrow("unsupported-role");
  });
});
