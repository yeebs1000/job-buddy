import { expect, it } from "vitest";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { deriveApplicationState } from "../../domain/stage";
import { rankNextActions, summarizeStages } from "./commandCenterSelectors";

it("counts active applications by stage and excludes terminal outcomes", () => {
  expect(summarizeStages(sampleApplications).offer).toBe(1);
  expect(Object.values(summarizeStages(sampleApplications)).reduce((total, count) => total + count, 0))
    .toBe(sampleApplications.filter((application) => !deriveApplicationState(application.stageEvents).outcome).length);
});

it("ranks overdue and near-term deadlines before passive applications", () => {
  const deadlines = sampleApplications.flatMap((application) => application.deadlines);
  const ranked = rankNextActions(sampleApplications, deadlines, new Date("2026-09-12T00:00:00Z"));

  expect(ranked[0].reason).toMatch(/overdue|today|tomorrow/i);
  expect(ranked.at(-1)?.reason).toMatch(/no deadline/i);
});

it("associates supplied deadlines through the nested deadline id", () => {
  const deadline = { ...sampleApplications[0].deadlines[0], label: "Updated follow-up" };
  const ranked = rankNextActions(sampleApplications, [deadline], new Date("2026-09-12T00:00:00Z"));

  expect(ranked[0]).toMatchObject({ application: { id: sampleApplications[0].id }, deadline });
});

it("uses the most urgent matching deadline when an application has several", () => {
  const later = { id: "later", label: "Later", at: "2026-09-20T00:00:00Z", completed: false };
  const today = { id: "today", label: "Today", at: "2026-09-12T00:00:00Z", completed: false };
  const application = { ...sampleApplications[0], deadlines: [later, today] };

  expect(rankNextActions([application], [later, today], new Date("2026-09-12T00:00:00Z"))[0].deadline).toEqual(today);
});

it("uses an active follow-up as the earliest next action across overdue, today, and tomorrow", () => {
  const application = { ...sampleApplications[0], deadlines: [], followUpAt: "2026-09-11T15:30:00Z" };

  expect(rankNextActions([application], [], new Date("2026-09-12T00:00:00Z"))[0].reason).toBe("Overdue: Follow up · 11:30 PM SGT");
  expect(rankNextActions([{ ...application, followUpAt: "2026-09-12T04:00:00Z" }], [], new Date("2026-09-12T00:00:00Z"))[0].reason).toBe("Today: Follow up · 12:00 PM SGT");
  expect(rankNextActions([{ ...application, followUpAt: "2026-09-13T04:00:00Z" }], [], new Date("2026-09-12T00:00:00Z"))[0].reason).toBe("Tomorrow: Follow up · 12:00 PM SGT");
});

it("chooses the earliest action when an active follow-up competes with a deadline", () => {
  const deadline = { id: "deadline", label: "Portfolio", at: "2026-09-14T04:00:00Z", completed: false };
  const application = { ...sampleApplications[0], deadlines: [deadline], followUpAt: "2026-09-13T04:00:00Z" };

  expect(rankNextActions([application], [deadline], new Date("2026-09-12T00:00:00Z"))[0]).toMatchObject({ reason: "Tomorrow: Follow up · 12:00 PM SGT", deadline: undefined, followUpAt: "2026-09-13T04:00:00Z" });
  expect(rankNextActions([{ ...application, followUpAt: "2026-09-15T04:00:00Z" }], [deadline], new Date("2026-09-12T00:00:00Z"))[0]).toMatchObject({ reason: "Due Sep 14: Portfolio · 12:00 PM SGT", deadline, followUpAt: undefined });
});

it("uses Singapore calendar days across the UTC midnight boundary", () => {
  const application = { ...sampleApplications[0], deadlines: [{ id: "sg-midnight", label: "SG midnight", at: "2026-09-12T16:30:00Z", completed: false }] };

  expect(rankNextActions([application], application.deadlines, new Date("2026-09-12T15:30:00Z"))[0].reason).toBe("Tomorrow: SG midnight · 12:30 AM SGT");
  expect(rankNextActions([{ ...application, deadlines: [{ ...application.deadlines[0], at: "2026-09-12T15:30:00Z" }] }], [{ ...application.deadlines[0], at: "2026-09-12T15:30:00Z" }], new Date("2026-09-12T16:30:00Z"))[0].reason).toBe("Overdue: SG midnight · 11:30 PM SGT");
});
