import Dexie, { type EntityTable } from "dexie";
import type { Application, Deadline } from "../domain/application";
import type { ApplicationOutcome, ApplicationStage, StageEvent } from "../domain/stage";
import type { UpdateProposal } from "../domain/updateProposal";

// Keep the existing v1 state index while exposing the domain's status field.
export type StoredUpdateProposal = UpdateProposal & { state: UpdateProposal["status"] };

export interface ProcessedMessageRecord {
  id: string;
  processedAt: string;
  proposalId?: string;
}

export interface StoredDeadline extends Deadline {
  applicationId: string;
  proposalId: string;
  kind: "deadline" | "interview";
  interviewSubtype?: Application["interviewSubtype"];
  links: string[];
}

export interface ActivityEntry {
  id: string;
  proposalId: string;
  applicationId: string | null;
  at: string;
  action: "approved" | "rejected" | "deferred";
  automatic: boolean;
}

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
  deadlines!: EntityTable<StoredDeadline, "id">;
  researchSnapshots!: EntityTable<IdentifiedRecord, "id">;
  savedViews!: EntityTable<SavedView, "id">;
  updateProposals!: EntityTable<StoredUpdateProposal, "id">;
  processedMessages!: EntityTable<ProcessedMessageRecord, "id">;
  prepSessions!: EntityTable<IdentifiedRecord, "id">;
  profileFields!: EntityTable<IdentifiedRecord, "id">;
  activityEntries!: EntityTable<ActivityEntry, "id">;
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
