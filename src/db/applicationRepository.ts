import type { Application } from "../domain/application";
import { compareStageEvents, deriveApplicationState, type StageEvent } from "../domain/stage";
import { jobBuddyDb, type StoredApplication } from "./database";

export type PersistedApplication = StoredApplication & { stageEvents: StageEvent[] };
type ApplicationPatch = Partial<Omit<Application, "id" | "stageEvents">>;
type UnsafeApplicationPatch = ApplicationPatch & Partial<StoredApplication> & { stageEvents?: unknown };

function stored(input: Application, events: StageEvent[] = input.stageEvents): StoredApplication {
  const { stageEvents: _, ...application } = input;
  return { ...application, ...deriveApplicationState(events), updatedAt: new Date().toISOString() };
}

async function materialize(application: StoredApplication): Promise<PersistedApplication> {
  return { ...application, stageEvents: await jobBuddyDb.stageEvents.where("applicationId").equals(application.id).toArray() };
}

export const applicationRepository = {
  async list(): Promise<PersistedApplication[]> {
    return Promise.all((await jobBuddyDb.applications.orderBy("updatedAt").reverse().toArray()).map(materialize));
  },

  async get(id: string): Promise<PersistedApplication | undefined> {
    const application = await jobBuddyDb.applications.get(id);
    return application && materialize(application);
  },

  async create(input: Application): Promise<PersistedApplication> {
    const application = stored(input);
    await jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
      await jobBuddyDb.applications.add(application);
      if (input.stageEvents.length) await jobBuddyDb.stageEvents.bulkAdd(input.stageEvents);
    });
    return materialize(application);
  },

  async update(id: string, patch: ApplicationPatch): Promise<PersistedApplication | undefined> {
    const current = await jobBuddyDb.applications.get(id);
    if (!current) return undefined;
    const { id: _id, stage: _stage, outcome: _outcome, stageEvents: _events, ...safePatch } = patch as UnsafeApplicationPatch;
    const next = { ...current, ...safePatch, id, updatedAt: new Date().toISOString() };
    await jobBuddyDb.applications.put(next);
    return materialize(next);
  },

  async eventsFor(applicationId: string): Promise<StageEvent[]> {
    return jobBuddyDb.stageEvents.where("applicationId").equals(applicationId).toArray();
  },

  async appendEvent(event: StageEvent): Promise<void> {
    await jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
      const application = await jobBuddyDb.applications.get(event.applicationId);
      if (!application) throw new Error(`Application ${event.applicationId} does not exist`);

      const events = await jobBuddyDb.stageEvents.where("applicationId").equals(event.applicationId).toArray();
      if (event.accepted && event.fromStage) {
        const ordered = [...events.filter((item) => item.accepted), event]
          .sort(compareStageEvents);
        const eventIndex = ordered.findIndex((item) => item.id === event.id);
        if (deriveApplicationState(ordered.slice(0, eventIndex)).stage !== event.fromStage) {
          throw new Error("Event fromStage conflicts with the application state");
        }
      }

      await jobBuddyDb.stageEvents.add(event);
      await jobBuddyDb.applications.update(event.applicationId, {
        ...deriveApplicationState([...events, event]),
        updatedAt: new Date().toISOString(),
      });
    });
  },

  async undoEvent(eventId: string): Promise<void> {
    await jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
      const event = await jobBuddyDb.stageEvents.get(eventId);
      if (!event) return;
      await jobBuddyDb.stageEvents.update(eventId, { accepted: false });
      const events = await jobBuddyDb.stageEvents.where("applicationId").equals(event.applicationId).toArray();
      const correctionId = JSON.stringify(["manual-correction", eventId]);
      if (!events.some((candidate) => candidate.id === correctionId)) {
        await jobBuddyDb.stageEvents.add({
          id: correctionId,
          applicationId: event.applicationId,
          at: new Date().toISOString(),
          origin: "manual",
          accepted: true,
          revertsEventId: eventId,
          note: "Manual correction: reverted a prior change.",
        });
      }
      const updatedEvents = await jobBuddyDb.stageEvents.where("applicationId").equals(event.applicationId).toArray();
      await jobBuddyDb.applications.update(event.applicationId, {
        ...deriveApplicationState(updatedEvents),
        updatedAt: new Date().toISOString(),
      });
    });
  },
};
