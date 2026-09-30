import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "./database";
import { seedDemoData } from "./seed";
import { applicationRepository } from "./applicationRepository";
import { prepareLiveWorkspace } from "./liveWorkspace";
import { sampleApplications } from "../fixtures/sampleApplications";
import { updateRepository } from "../features/updates/updateRepository";
import { fixtureMessages } from "../fixtures/mail/messages";

afterEach(async () => { vi.restoreAllMocks(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("removes untouched demos from live lists while preserving edited and real entries", async () => {
  await seedDemoData();
  await applicationRepository.update(sampleApplications[0].id, { notes: "My interview notes" });
  await applicationRepository.create({ ...sampleApplications[1], id: "real", company: "Actual Employer", stageEvents: [], research: undefined });
  await prepareLiveWorkspace();
  const apps = await applicationRepository.list();
  expect(apps.map(app => app.id).sort()).toEqual(["app-aurora-applied", "real"]);
  expect(apps.find(app => app.id === "app-aurora-applied")?.notes).toBe("My interview notes");
  expect(apps.find(app => app.id === "app-aurora-applied")?.research).toBeUndefined();
  expect(await jobBuddyDb.applications.count()).toBe(9); // Soft removal, no evidence destruction.
  expect(await applicationRepository.get("app-circuit-review")).toBeUndefined(); // Old bookmarks cannot edit invisible records.
  expect(await jobBuddyDb.metadata.get("live-workspace-backup:v1")).toBeDefined();
  await prepareLiveWorkspace();
  expect((await applicationRepository.list()).map(app => app.id).sort()).toEqual(["app-aurora-applied", "real"]);
});

it("retains a demo with new history or saved research instead of discarding the user's work", async () => {
  await seedDemoData();
  await jobBuddyDb.stageEvents.add({ id: "new-event", applicationId: sampleApplications[0].id, at: "2026-09-18T00:00:00Z", toStage: "review", origin: "manual", accepted: true });
  await jobBuddyDb.salaryObservations.add({ id: "evidence", applicationId: sampleApplications[1].id, market: "SG", currency: "SGD", period: "monthly", minimum: 6000, canonicalRole: "software-engineer", observedAt: "2026-09-18T00:00:00Z", provenance: "manual", reusable: false });
  await prepareLiveWorkspace();
  expect((await applicationRepository.list()).map(app => app.id).sort()).toEqual(["app-aurora-applied", "app-circuit-review"]);
  expect(await jobBuddyDb.stageEvents.get("new-event")).toBeDefined();
  expect(await jobBuddyDb.salaryObservations.get("evidence")).toBeDefined();
});

it("keeps Gmail proposals but removes simulated evidence from pending counts without erasing it", async () => {
  for (const mailSource of ["gmail", "simulated"] as const) await updateRepository.create({ id: mailSource, status: "pending", mailSource, createdAt: "2026-09-18T00:00:00Z", source: fixtureMessages[0],
    match: { applicationId: null, confidence: 0, reasons: ["unmatched"], conflicts: [] }, classification: { proposedStage: "interview", confidence: .9, reasons: [], evidenceExcerpt: fixtureMessages[0].excerpt, requiresApproval: true, deadlines: [], links: [] } });
  await prepareLiveWorkspace();
  expect((await updateRepository.listPending()).map(item => item.id)).toEqual(["gmail"]);
  expect((await updateRepository.list()).map(item => item.id)).toEqual(["gmail"]);
  expect(await jobBuddyDb.updateProposals.get("simulated")).toBeDefined();
});

it("starts new workspaces empty and disables later automatic demo seeding", async () => {
  await prepareLiveWorkspace();
  await seedDemoData();
  expect(await applicationRepository.list()).toEqual([]);
});

it("rolls back soft hiding and its recovery record if the migration cannot finish", async () => {
  await seedDemoData();
  const original = jobBuddyDb.metadata.put.bind(jobBuddyDb.metadata);
  vi.spyOn(jobBuddyDb.metadata, "put").mockImplementation(record => {
    if (record.key === "live-workspace:v1") throw new Error("storage-failure");
    return original(record);
  });
  await expect(prepareLiveWorkspace()).rejects.toThrow("storage-failure");
  expect(await applicationRepository.list()).toHaveLength(8);
  expect(await jobBuddyDb.metadata.get("live-workspace-backup:v1")).toBeUndefined();
});
