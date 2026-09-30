import { z } from "zod";
import { discoveredJobSchema, type DiscoveredJob } from "../../domain/discovery";
import { jobBuddyDb } from "../../db/database";

const savedSchema = discoveredJobSchema.extend({ savedAt: z.string().datetime() });
export type SavedJob = z.infer<typeof savedSchema>;
const key = "discovery-shortlist:v1";
export const shortlistRepository = {
  async list(): Promise<SavedJob[]> {
    const row = await jobBuddyDb.metadata.get(key);
    if (!row) return [];
    return z.array(savedSchema).max(500).parse(JSON.parse(row.value));
  },
  async save(job: DiscoveredJob) {
    const valid = discoveredJobSchema.parse(job);
    await jobBuddyDb.transaction("rw", jobBuddyDb.metadata, async () => {
      const jobs = await shortlistRepository.list();
      if (jobs.some((item) => item.id === valid.id)) return;
      if (jobs.length >= 500) throw new Error("Shortlist is full. Remove a saved job first.");
      await jobBuddyDb.metadata.put({ key, value: JSON.stringify([...jobs, { ...valid, savedAt: new Date().toISOString() }]) });
    });
  },
  async remove(id: string) {
    await jobBuddyDb.transaction("rw", jobBuddyDb.metadata, async () => {
      const jobs = await shortlistRepository.list();
      await jobBuddyDb.metadata.put({ key, value: JSON.stringify(jobs.filter((job) => job.id !== id)) });
    });
  },
};
