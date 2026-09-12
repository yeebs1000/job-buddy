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

    await applicationRepository.update(sampleApplications[0].id, { company: "Updated Aurora" });

    expect((await applicationRepository.get(sampleApplications[0].id))?.company).toBe("Updated Aurora");
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
