import { deriveApplicationState } from "../domain/stage";
import { sampleApplications } from "../fixtures/sampleApplications";
import { jobBuddyDb, type StoredApplication } from "./database";

const demoSeedKey = "demo-seeded-v1";

function asStoredApplication(input: (typeof sampleApplications)[number]): StoredApplication {
  const { stageEvents: _, ...application } = input;
  return { ...application, ...deriveApplicationState(input.stageEvents), updatedAt: input.appliedAt };
}

export async function seedDemoData(): Promise<void> {
  await jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, jobBuddyDb.metadata, async () => {
    if (await jobBuddyDb.metadata.get(demoSeedKey)) return;

    for (const application of sampleApplications) {
      const hasExistingEvent = (await Promise.all(application.stageEvents.map((event) => jobBuddyDb.stageEvents.get(event.id))))
        .some(Boolean);
      if (await jobBuddyDb.applications.get(application.id) || hasExistingEvent) continue;
      await jobBuddyDb.applications.add(asStoredApplication(application));
      await jobBuddyDb.stageEvents.bulkAdd(application.stageEvents);
    }

    await jobBuddyDb.metadata.add({ key: demoSeedKey, value: "true" });
  });
}
