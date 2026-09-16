import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { PendingCapture } from "../../domain/buddy";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { captureApplication } from "./captureApplication";

const pending: PendingCapture = {
  id: "capture-1",
  company: "Summit Pay",
  role: "Software Engineer",
  location: "Singapore",
  sourceUrl: "https://jobs.example/roles/42",
  platform: "greenhouse",
  detectedAt: "2026-09-16T02:00:00.000Z",
  completionId: "confirmation-1",
};

const edits = {
  company: "Summit Pay",
  role: "Software Engineer",
  country: "Singapore" as const,
  city: "Singapore",
  discipline: "software_it" as const,
  industry: "Technology",
  roleFamily: "software" as const,
  source: "Company careers",
  appliedDate: "2026-09-16",
};

describe("captureApplication", () => {
  afterEach(async () => { await jobBuddyDb.delete(); await jobBuddyDb.open(); });

  it("creates one applied application and one accepted Buddy event", async () => {
    const first = await captureApplication(pending, edits);
    const second = await captureApplication({ ...pending, id: "capture-2", completionId: "confirmation-2" }, edits);

    expect(first).toEqual({ applicationId: expect.any(String), created: true });
    expect(second).toEqual({ applicationId: first.applicationId, created: false });
    expect(await applicationRepository.eventsFor(first.applicationId)).toEqual([
      expect.objectContaining({ toStage: "applied", origin: "buddy", accepted: true }),
    ]);
  });

  it("rejects unsupported markets and incomplete metadata before writing", async () => {
    await expect(captureApplication(pending, { ...edits, country: "United States" as never })).rejects.toThrow("invalid-capture-metadata");
    expect(await applicationRepository.list()).toHaveLength(0);
  });
});
