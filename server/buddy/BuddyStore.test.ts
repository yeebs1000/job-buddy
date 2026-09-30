import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BuddyActivityEntry, PendingCapture, PendingSalaryEvidence } from "../../src/domain/buddy";
import { BuddyStore } from "./BuddyStore";

const NOW = Date.parse("2026-09-16T02:00:00.000Z");

describe("BuddyStore", () => {
  let root: string;

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "job-buddy-store-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("serializes concurrent activity writes and retains only the newest 500", async () => {
    const store = new BuddyStore({ root, now: () => NOW });

    await Promise.all(Array.from({ length: 505 }, (_, index) => store.appendActivity(activity(index))));

    const entries = await store.listActivity();
    expect(entries).toHaveLength(500);
    expect(entries[0]?.id).toBe("activity-5");
    expect(entries.at(-1)?.id).toBe("activity-504");
    expect(await readFile(store.activityPath, "utf8")).not.toContain("alex@example.com");
  }, 30_000);

  it("expires captures after 30 days and deduplicates completion IDs", async () => {
    const store = new BuddyStore({ root, now: () => NOW });
    await store.addCapture(capture("recent", "2026-09-15T02:00:00.000Z"));
    await store.addCapture(capture("recent", "2026-09-15T02:00:00.000Z"));
    await store.addCapture(capture("expired", "2026-08-01T00:00:00.000Z"));

    expect((await store.listCaptures()).map((item) => item.completionId)).toEqual(["recent"]);
  });

  it("recovers malformed preference storage to safe defaults", async () => {
    const store = new BuddyStore({ root, now: () => NOW });
    await mkdir(dirname(store.preferencesPath), { recursive: true });
    await writeFile(store.preferencesPath, "not-json", "utf8");

    expect(await store.getPreferences()).toEqual({ mode: "approval", paused: false, enabledDomains: [] });
  });

  it("bounds, expires, and deduplicates salary evidence by id and normalized source URL", async () => {
    const store = new BuddyStore({ root, now: () => NOW });
    await store.addSalaryEvidence(salaryEvidence("salary-1", "https://jobs.example/role?tracking=1", "2026-09-15T02:00:00.000Z"));
    await store.addSalaryEvidence(salaryEvidence("salary-2", "https://jobs.example/role?tracking=2", "2026-09-15T02:00:00.000Z"));
    await store.addSalaryEvidence(salaryEvidence("expired", "https://jobs.example/old", "2026-08-01T00:00:00.000Z"));

    expect((await store.listSalaryEvidence()).map((item) => item.id)).toEqual(["salary-1"]);
    await store.deleteSalaryEvidence("salary-1");
    expect(await store.listSalaryEvidence()).toEqual([]);
  });

  it("clears activity without changing captures or preferences", async () => {
    const store = new BuddyStore({ root, now: () => NOW });
    await store.setPreferences({ mode: "automatic", paused: true, enabledDomains: ["jobs.example"] });
    await store.appendActivity(activity(1));
    await store.addCapture(capture("recent", "2026-09-15T02:00:00.000Z"));

    await store.clearActivity();

    expect(await store.listActivity()).toEqual([]);
    expect(await store.getPreferences()).toEqual({ mode: "automatic", paused: true, enabledDomains: ["jobs.example"] });
    expect(await store.listCaptures()).toHaveLength(1);
  });
});

function activity(index: number): BuddyActivityEntry {
  return {
    id: `activity-${index}`,
    fieldCategory: "contact",
    disposition: "filled",
    reason: "safe-high-confidence",
    mode: "automatic",
    adapter: "greenhouse",
    domain: "jobs.example",
    at: new Date(NOW + index).toISOString(),
  };
}

function capture(completionId: string, detectedAt: string): PendingCapture {
  return {
    id: `capture-${completionId}`,
    company: "Example Ltd",
    role: "Software Engineer",
    location: "Singapore",
    sourceUrl: "https://jobs.example/role",
    platform: "greenhouse",
    detectedAt,
    completionId,
  };
}

function salaryEvidence(id: string, sourceUrl: string, detectedAt: string): PendingSalaryEvidence {
  return { id, market: "US", currency: "USD", period: "annual", minimum: 120_000, maximum: 165_000, sourceUrl, detectedAt };
}
