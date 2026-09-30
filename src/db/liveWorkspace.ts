import { jobBuddyDb } from "./database";
import { sampleApplications } from "../fixtures/sampleApplications";
import { deriveApplicationState } from "../domain/stage";

const migrationKey = "live-workspace:v1";
// Compare data rather than updatedAt: imports can change timestamps without edits.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))) : item);
}

export async function prepareLiveWorkspace(): Promise<void> {
  await jobBuddyDb.transaction("rw", [jobBuddyDb.applications, jobBuddyDb.stageEvents, jobBuddyDb.updateProposals,
    jobBuddyDb.salaryObservations, jobBuddyDb.salaryEstimateSnapshots, jobBuddyDb.metadata], async () => {
    if (await jobBuddyDb.metadata.get(migrationKey)) return;
    const applications = await jobBuddyDb.applications.toArray();
    const proposals = await jobBuddyDb.updateProposals.toArray();
    const sampleIds = new Set(sampleApplications.map(app => app.id));
    // Keep the originals locally before soft-removing anything; no mail/profile data is erased.
    await jobBuddyDb.metadata.put({ key: "live-workspace-backup:v1", value: JSON.stringify({ applications: applications.filter(app => sampleIds.has(app.id)), at: new Date().toISOString() }) });
    for (const sample of sampleApplications) {
      const existing = applications.find(app => app.id === sample.id);
      if (!existing) continue;
      const { updatedAt: _, ...content } = existing;
      const { stageEvents, ...baseline } = sample;
      const history = await jobBuddyDb.stageEvents.where("applicationId").equals(sample.id).sortBy("id");
      const changed = canonical(content) !== canonical({ ...baseline, ...deriveApplicationState(stageEvents) })
        || canonical(history) !== canonical([...stageEvents].sort((a, b) => a.id.localeCompare(b.id)))
        || await jobBuddyDb.salaryObservations.where("applicationId").equals(sample.id).count() > 0
        || await jobBuddyDb.salaryEstimateSnapshots.where("applicationId").equals(sample.id).count() > 0
        || proposals.some(proposal => proposal.mailSource === "gmail" && proposal.match.applicationId === sample.id);
      await jobBuddyDb.applications.update(sample.id, changed
        ? { demoState: "retained", ...(canonical(existing.research) === canonical(sample.research) ? { research: undefined } : {}) }
        : { demoState: "hidden" });
    }
    for (const proposal of proposals) if (proposal.mailSource === "simulated") await jobBuddyDb.updateProposals.update(proposal.id, { demoHidden: true });
    await jobBuddyDb.metadata.put({ key: "demo-seeded-v1", value: "true" });
    const preferences = await jobBuddyDb.metadata.get("gmail-preferences:v1");
    if (preferences) {
      let parsed: unknown;
      try { parsed = JSON.parse(preferences.value); } catch { /* Invalid preferences use the default live source. */ }
      if (parsed && typeof parsed === "object") await jobBuddyDb.metadata.put({ key: preferences.key, value: JSON.stringify({ ...parsed, selectedSource: "gmail" }) });
    }
    await jobBuddyDb.metadata.put({ key: migrationKey, value: "complete" });
  });
}
