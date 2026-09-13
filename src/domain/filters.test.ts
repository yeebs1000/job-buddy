import { describe, expect, it } from "vitest";
import { sampleApplications } from "../fixtures/sampleApplications";
import { matchesApplicationFilters, type ApplicationFilterState } from "./filters";

const application = { ...sampleApplications[0], market: "SG" as const, roleFamily: "software" as const, industry: "Technology", workArrangement: "hybrid" as const, priority: "high" as const, tags: ["priority", "graduate"], unreadUpdate: true, followUpAt: "2026-09-12", notes: "Interested in platform team", recruiter: "Alex", stageEvents: [{ id: "test-event", applicationId: sampleApplications[0].id, at: "2026-09-02", toStage: "interview" as const, accepted: true, origin: "manual" as const }] };
const now = new Date("2026-09-13T12:00:00Z");

describe("matchesApplicationFilters", () => {
  it("ANDs dimensions while ORing choices within a dimension", () => {
    const filters = { markets: ["SG"], roleFamilies: ["software"], stages: ["interview"], tags: ["priority"] } satisfies ApplicationFilterState;
    expect(matchesApplicationFilters(application, filters, now)).toBe(true);
    expect(matchesApplicationFilters({ ...application, market: "HK", roleFamily: "finance" }, filters, now)).toBe(false);
    expect(matchesApplicationFilters(application, { markets: ["HK", "SG"] }, now)).toBe(true);
    expect(matchesApplicationFilters(application, { tags: ["priority", "missing"] }, now)).toBe(false);
  });

  it.each<[ApplicationFilterState, boolean]>([
    [{ search: "PLATFORM" }, true], [{ search: "alex" }, true], [{ search: "unknown" }, false],
    [{ outcomes: ["active"] }, true], [{ outcomes: ["rejected"] }, false],
    [{ industries: ["Technology"] }, true], [{ industries: ["Finance"] }, false],
    [{ workArrangements: ["hybrid"] }, true], [{ workArrangements: ["remote"] }, false],
    [{ companies: ["Aurora Ledger Pte Ltd"] }, true], [{ companies: ["Other"] }, false],
    [{ sources: ["LinkedIn"] }, true], [{ sources: ["Referral"] }, false],
    [{ appliedFrom: "2026-09-01", appliedTo: "2026-09-01" }, true], [{ appliedFrom: "2026-09-02" }, false],
    [{ deadlineFrom: "2026-09-15", deadlineTo: "2026-09-15" }, true], [{ deadlineTo: "2026-09-14" }, false],
    [{ salaryMin: 4800, salaryMax: 6200, currency: "SGD", salaryPeriod: "monthly" }, true],
    [{ salaryMin: 7000 }, false], [{ currency: "HKD" }, false], [{ salaryPeriod: "annual" }, false],
    [{ priorities: ["high"] }, true], [{ priorities: ["low"] }, false],
    [{ unreadUpdate: true }, true], [{ unreadUpdate: false }, false],
    [{ missingData: true }, false], [{ missingData: false }, true],
    [{ followUpDue: true }, true], [{ followUpDue: false }, false],
  ])("applies %j => %s", (filters, expected) => {
    expect(matchesApplicationFilters(application, filters, now)).toBe(expected);
  });

  it("does not invent research, count completed deadlines, or include archived records by default", () => {
    expect(matchesApplicationFilters({ ...application, research: undefined }, { salaryMin: 0 }, now)).toBe(false);
    expect(matchesApplicationFilters({ ...application, research: undefined }, { missingData: true }, now)).toBe(true);
    expect(matchesApplicationFilters({ ...application, deadlines: application.deadlines.map(d => ({ ...d, completed: true })) }, { deadlineTo: "2026-10-01" }, now)).toBe(false);
    expect(matchesApplicationFilters({ ...application, archived: true }, {}, now)).toBe(false);
    expect(matchesApplicationFilters({ ...application, archived: true }, { includeArchived: true }, now)).toBe(true);
  });

  it("reads legacy market and discipline without overriding canonical values", () => {
    expect(matchesApplicationFilters({ ...sampleApplications[1], market: undefined, roleFamily: undefined }, { markets: ["SG"], roleFamilies: ["software"] }, now)).toBe(true);
    expect(matchesApplicationFilters(application, { roleFamilies: ["finance"] }, now)).toBe(false);
  });
});
