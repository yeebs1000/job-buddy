import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { shortlistRepository } from "./shortlistRepository";
import { applicationRepository } from "../../db/applicationRepository";
import type { DiscoveredJob } from "../../domain/discovery";
afterEach(async () => { await jobBuddyDb.delete(); await jobBuddyDb.open(); });
const job: DiscoveredJob = { id: "lever:global:example:123", board: { provider: "lever", token: "example", region: "global" }, title: "Developer", location: "Singapore", market: "SG", url: "https://jobs.lever.co/example/123", salary: [], retrievedAt: "2026-09-16T00:00:00Z" };
it("deduplicates saved leads without polluting the application tracker", async () => {
  await Promise.all([shortlistRepository.save(job), shortlistRepository.save(job)]);
  expect(await shortlistRepository.list()).toHaveLength(1);
  expect(await applicationRepository.list()).toEqual([]);
  await jobBuddyDb.close(); await jobBuddyDb.open();
  expect((await shortlistRepository.list())[0].title).toBe("Developer");
  await shortlistRepository.remove(job.id);
  expect(await shortlistRepository.list()).toEqual([]);
});
it("does not replace a corrupt shortlist when saving", async () => {
  await jobBuddyDb.metadata.put({ key: "discovery-shortlist:v1", value: "broken" });
  await expect(shortlistRepository.save(job)).rejects.toThrow();
  expect((await jobBuddyDb.metadata.get("discovery-shortlist:v1"))?.value).toBe("broken");
});
