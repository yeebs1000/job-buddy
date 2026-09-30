import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { detailsOf, fromEditorDate, saveApplicationDetails, toEditorDate } from "./applicationDetails";

afterEach(async () => { await jobBuddyDb.delete(); await jobBuddyDb.open(); });

async function createApplication() {
  return applicationRepository.create({ ...sampleApplications[0], id: "edit-test", notes: "Original note", recruiter: "Original contact", followUpAt: "2026-10-01T03:15:22.123Z",
    deadlines: [{ id: "gmail-deadline", label: "Interview", at: "2026-10-02T02:30:15.456Z", completed: false, links: ["https://meet.example/interview"] }],
    stageEvents: [{ id: "gmail-event", applicationId: "edit-test", at: "2026-09-01T00:00:00Z", toStage: "interview", origin: "gmail", accepted: true, evidenceId: "mail-42" }],
  });
}

it("saves editable details without changing stage history, evidence, links or untouched timestamp precision", async () => {
  const original = await createApplication();
  await saveApplicationDetails(original, { ...detailsOf(original), notes: "Updated note", recruiter: "Alex at recruiting", deadlines: [
    { ...original.deadlines[0], completed: true },
    { id: "new-deadline", label: "Send portfolio", at: "2026-10-03T04:00:00.000Z", completed: false },
  ] });
  const saved = await applicationRepository.get(original.id);
  expect(saved).toMatchObject({ notes: "Updated note", recruiter: "Alex at recruiting", stage: "interview", followUpAt: "2026-10-01T03:15:22.123Z",
    deadlines: [{ id: "gmail-deadline", label: "Interview", at: "2026-10-02T02:30:15.456Z", completed: true, links: ["https://meet.example/interview"] }, { id: "new-deadline", label: "Send portfolio", completed: false }] });
  expect(saved?.stageEvents).toEqual(original.stageEvents);
  expect(saved?.research).toEqual(original.research);
});

it("rejects a stale draft even when another deadline update has the same updatedAt timestamp", async () => {
  const original = await createApplication();
  await jobBuddyDb.applications.update(original.id, { deadlines: [...original.deadlines, { id: "new-mail", label: "New interview", at: "2026-10-04T00:00:00Z", completed: false }] });
  await expect(saveApplicationDetails(original, { ...detailsOf(original), notes: "Stale note" })).rejects.toThrow(/changed/);
  expect((await applicationRepository.get(original.id))?.deadlines).toHaveLength(2);
  expect((await applicationRepository.get(original.id))?.notes).toBe("Original note");
});

it("rejects newer Gmail stage history and simultaneous editor saves without losing either record", async () => {
  const original = await createApplication();
  await applicationRepository.appendEvent({ id: "new-stage", applicationId: original.id, at: "2026-09-02T00:00:00Z", fromStage: "interview", toStage: "final", origin: "gmail", accepted: true });
  await expect(saveApplicationDetails(original, { ...detailsOf(original), notes: "Stale" })).rejects.toThrow(/changed/);
  const fresh = (await applicationRepository.get(original.id))!;
  const results = await Promise.allSettled(["First", "Second"].map(notes => saveApplicationDetails(fresh, { ...detailsOf(fresh), notes })));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect((await applicationRepository.get(original.id))?.stage).toBe("final");
  expect(await applicationRepository.eventsFor(original.id)).toHaveLength(2);
});

it.each(["", "not a date", "2026-02-30T00:00:00Z"])("rejects invalid deadline %s without partial writes", async at => {
  const original = await createApplication();
  await expect(saveApplicationDetails(original, { ...detailsOf(original), notes: "Should not save", deadlines: [{ ...original.deadlines[0], at }] })).rejects.toThrow(/date/i);
  expect((await applicationRepository.get(original.id))?.notes).toBe("Original note");
});

it("validates deadline labels and duplicate identifiers and clears optional details intentionally", async () => {
  const original = await createApplication();
  await expect(saveApplicationDetails(original, { ...detailsOf(original), deadlines: [{ ...original.deadlines[0], label: " " }] })).rejects.toThrow(/label/i);
  await expect(saveApplicationDetails(original, { ...detailsOf(original), deadlines: [original.deadlines[0], original.deadlines[0]] })).rejects.toThrow(/deadline/i);
  await saveApplicationDetails(original, { recruiter: "", notes: "", followUpAt: undefined, deadlines: [] });
  expect(await applicationRepository.get(original.id)).toMatchObject({ recruiter: "", notes: "", followUpAt: undefined, deadlines: [] });
});

it("does not recreate an application removed while editing", async () => {
  const original = await createApplication();
  await jobBuddyDb.applications.delete(original.id);
  await expect(saveApplicationDetails(original, detailsOf(original))).rejects.toThrow(/no longer/);
  expect(await jobBuddyDb.applications.get(original.id)).toBeUndefined();
});

it("converts editor times as explicit SGT/HKT, preserves unchanged precision, and rejects rolled dates", () => {
  expect(toEditorDate("2026-09-30T18:30:15.456Z")).toBe("2026-10-01T02:30");
  expect(fromEditorDate("2026-10-01T02:30")).toBe("2026-09-30T18:30:00.000Z");
  expect(fromEditorDate("2026-10-01T02:30", "2026-09-30T18:30:15.456Z")).toBe("2026-09-30T18:30:15.456Z");
  expect(fromEditorDate("")).toBeUndefined();
  expect(() => fromEditorDate("2026-02-30T12:00")).toThrow(/date/i);
});
