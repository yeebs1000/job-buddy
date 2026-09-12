import Dexie, { type EntityTable } from "dexie";
import type { Application } from "../domain/application";
import type { ApplicationOutcome, ApplicationStage, StageEvent } from "../domain/stage";

export type StoredApplication = Omit<Application, "stageEvents"> & {
  stage: ApplicationStage | null;
  outcome: ApplicationOutcome | null;
  updatedAt: string;
};

export interface SavedView {
  id: string;
  name: string;
  filters: unknown;
  sort: unknown;
  visibleColumns: string[];
}

interface MetadataRecord {
  key: string;
  value: string;
}

interface IdentifiedRecord {
  id: string;
}

class JobBuddyDb extends Dexie {
  applications!: EntityTable<StoredApplication, "id">;
  stageEvents!: EntityTable<StageEvent, "id">;
  deadlines!: EntityTable<IdentifiedRecord, "id">;
  researchSnapshots!: EntityTable<IdentifiedRecord, "id">;
  savedViews!: EntityTable<SavedView, "id">;
  updateProposals!: EntityTable<IdentifiedRecord & { state?: string }, "id">;
  processedMessages!: EntityTable<IdentifiedRecord, "id">;
  prepSessions!: EntityTable<IdentifiedRecord, "id">;
  profileFields!: EntityTable<IdentifiedRecord, "id">;
  activityEntries!: EntityTable<IdentifiedRecord, "id">;
  metadata!: EntityTable<MetadataRecord, "key">;

  constructor() {
    super("job-buddy");
    this.version(1).stores({
      applications: "id, stage, outcome, market, roleFamily, updatedAt",
      stageEvents: "id, applicationId",
      deadlines: "id",
      researchSnapshots: "id",
      savedViews: "id",
      updateProposals: "id, state",
      processedMessages: "id",
      prepSessions: "id",
      profileFields: "id",
      activityEntries: "id",
      metadata: "key",
    });
  }
}

export const jobBuddyDb = new JobBuddyDb();
