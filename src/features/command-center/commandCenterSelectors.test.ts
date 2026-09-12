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
