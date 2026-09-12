import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { sampleApplications } from "../fixtures/sampleApplications";
import { jobBuddyDb } from "./database";
import { applicationRepository } from "./applicationRepository";
import { seedDemoData } from "./seed";
import { savedViewRepository } from "./viewRepository";

afterEach(async () => {
  await jobBuddyDb.delete();
  await jobBuddyDb.open();
});

describe("applicationRepository", () => {
  it("writes an event and derives the application state transactionally", async () => {
    await applicationRepository.create(sampleApplications[4]);

    await applicationRepository.appendEvent({
      id: "event-offer", applicationId: sampleApplications[4].id,
      at: "2026-09-12T08:00:00Z", fromStage: "final", toStage: "offer",
      origin: "manual", accepted: true,
    });

    expect((await applicationRepository.get(sampleApplications[4].id))?.stage).toBe("offer");
  });

  it("updates application fields without allowing lifecycle history to be patched", async () => {
    await applicationRepository.create(sampleApplications[0]);

    await (applicationRepository.update as (id: string, patch: unknown) => Promise<unknown>)(sampleApplications[0].id, {
      company: "Updated Aurora", stage: "offer", outcome: "hired", stageEvents: [],
    });

    expect(await applicationRepository.get(sampleApplications[0].id)).toMatchObject({
      company: "Updated Aurora", stage: "applied", outcome: null,
      stageEvents: [expect.objectContaining({ id: "e1" })],
    });
  });

  it("marks undone events unaccepted and restores the materialized state", async () => {
    await applicationRepository.create(sampleApplications[4]);
    await applicationRepository.appendEvent({
      id: "event-offer", applicationId: sampleApplications[4].id,
      at: "2026-09-12T08:00:00Z", fromStage: "final", toStage: "offer",
      origin: "manual", accepted: true,
    });

    await applicationRepository.undoEvent("event-offer");

    expect(await jobBuddyDb.stageEvents.get("event-offer")).toMatchObject({ accepted: false });
    expect((await applicationRepository.get(sampleApplications[4].id))?.stage).toBe("final");
  });

  it("rejects an accepted event whose fromStage conflicts with current state", async () => {
    await applicationRepository.create(sampleApplications[0]);

    await expect(applicationRepository.appendEvent({
      id: "event-conflict", applicationId: sampleApplications[0].id,
      at: "2026-09-12T08:00:00Z", fromStage: "final", toStage: "offer",
      origin: "manual", accepted: true,
    })).rejects.toThrow("fromStage");
    expect(await jobBuddyDb.stageEvents.get("event-conflict")).toBeUndefined();
  });

  it("validates fromStage using canonical ordering when an earlier event has an invalid timestamp", async () => {
    const application = {
      ...sampleApplications[0], id: "invalid-timestamp-ordering",
      stageEvents: [{
        ...sampleApplications[0].stageEvents[0], id: "invalid-applied", applicationId: "invalid-timestamp-ordering", at: "invalid",
      }],
    };
    await applicationRepository.create(application);

    await expect(applicationRepository.appendEvent({
      id: "valid-review", applicationId: application.id, at: "2026-09-01T00:00:00Z",
      fromStage: "applied", toStage: "review", origin: "manual", accepted: true,
    })).rejects.toThrow("fromStage");
    expect(await jobBuddyDb.stageEvents.get("valid-review")).toBeUndefined();
  });

  it("seeds demo data once without overwriting non-demo records", async () => {
    await applicationRepository.create({ ...sampleApplications[0], id: "my-application", company: "Mine", stageEvents: [] });
    await jobBuddyDb.stageEvents.add({
      ...sampleApplications[0].stageEvents[0], applicationId: "my-application",
    });

    await seedDemoData();
    await seedDemoData();

    expect(await applicationRepository.list()).toHaveLength(sampleApplications.length);
    expect((await applicationRepository.get("my-application"))?.company).toBe("Mine");
    expect(await jobBuddyDb.stageEvents.get("e1")).toMatchObject({ applicationId: "my-application" });
  });

  it("saves a reusable view", async () => {
    await savedViewRepository.save({
      id: "interviews", name: "Active Interviews", filters: { stages: ["interview"] },
      sort: { field: "updatedAt", direction: "desc" }, visibleColumns: ["company", "stage"],
    });

    expect(await savedViewRepository.get("interviews")).toMatchObject({ name: "Active Interviews" });
  });
});
