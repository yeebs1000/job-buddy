import { canAutoApply, deriveApplicationState } from "./stage";

it("derives the latest accepted stage without losing history", () => {
  const state = deriveApplicationState([
    { id: "e1", applicationId: "a1", at: "2026-09-01T08:00:00Z", toStage: "applied", origin: "manual", accepted: true },
    { id: "e2", applicationId: "a1", at: "2026-09-05T08:00:00Z", fromStage: "applied", toStage: "interview", origin: "gmail", accepted: true },
  ]);

  expect(state).toMatchObject({ stage: "interview", outcome: null });
});

it("keeps rejection terminal and records the stage where it occurred", () => {
  const state = deriveApplicationState([
    { id: "e1", applicationId: "a1", at: "2026-09-01T08:00:00Z", toStage: "assessment", origin: "manual", accepted: true },
    { id: "e2", applicationId: "a1", at: "2026-09-06T08:00:00Z", fromStage: "assessment", outcome: "rejected", origin: "gmail", accepted: true },
  ]);

  expect(state).toMatchObject({ stage: "assessment", outcome: "rejected" });
});

it("orders accepted events by timestamp and identifier", () => {
  const state = deriveApplicationState([
    { id: "b", applicationId: "a1", at: "2026-09-02T08:00:00Z", toStage: "interview", origin: "gmail", accepted: true },
    { id: "a", applicationId: "a1", at: "2026-09-02T08:00:00Z", toStage: "review", origin: "gmail", accepted: true },
    { id: "ignored", applicationId: "a1", at: "2026-09-03T08:00:00Z", toStage: "offer", origin: "gmail", accepted: false },
  ]);

  expect(state).toMatchObject({ stage: "interview", outcome: null });
});

it("orders ISO timestamps by instant when their UTC offsets differ", () => {
  const state = deriveApplicationState([
    { id: "later", applicationId: "a1", at: "2026-09-01T08:00:00-04:00", toStage: "interview", origin: "gmail", accepted: true },
    { id: "earlier", applicationId: "a1", at: "2026-09-01T11:00:00Z", toStage: "review", origin: "gmail", accepted: true },
  ]);

  expect(state).toMatchObject({ stage: "interview", outcome: null });
});

it("orders invalid timestamps after valid timestamps by identifier", () => {
  const state = deriveApplicationState([
    { id: "invalid", applicationId: "a1", at: "0000-invalid", toStage: "interview", origin: "gmail", accepted: true },
    { id: "valid", applicationId: "a1", at: "2026-09-01T11:00:00Z", toStage: "review", origin: "gmail", accepted: true },
  ]);

  expect(state).toMatchObject({ stage: "interview", outcome: null });
});

it("only auto-applies confident non-terminal non-manual events", () => {
  expect(canAutoApply({ id: "e1", applicationId: "a1", at: "2026-09-01T08:00:00Z", toStage: "review", origin: "gmail", accepted: false, confidence: 0.9 })).toBe(true);
  expect(canAutoApply({ id: "e2", applicationId: "a1", at: "2026-09-01T08:00:00Z", outcome: "rejected", origin: "gmail", accepted: false, confidence: 1 })).toBe(false);
  expect(canAutoApply({ id: "e3", applicationId: "a1", at: "2026-09-01T08:00:00Z", toStage: "review", origin: "manual", accepted: false, confidence: 1 })).toBe(false);
  expect(canAutoApply({ id: "e4", applicationId: "a1", at: "2026-09-01T08:00:00Z", toStage: "review", origin: "gmail", accepted: false, confidence: 0.89 })).toBe(false);
});
