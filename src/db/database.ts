import Dexie, { type EntityTable } from "dexie";
import type { Application, Deadline } from "../domain/application";
import type { ApplicationOutcome, ApplicationStage, StageEvent } from "../domain/stage";
import type { UpdateProposal } from "../domain/updateProposal";
import type { MailSource } from "../domain/mail";
import type { RoleAliasOverride, SalaryEstimateSnapshot, SalaryObservation } from "../domain/research";

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
  mailSource: MailSource;
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

export interface BrowserProfileRecord {
  id: "candidate";
  version: 1;
  revision: string;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}

export interface BrowserProfileKey {
  id: "candidate";
  key: CryptoKey;
}

class JobBuddyDb extends Dexie {
  applications!: EntityTable<StoredApplication, "id">;
  stageEvents!: EntityTable<StageEvent, "id">;
  deadlines!: EntityTable<StoredDeadline, "id">;
  researchSnapshots!: EntityTable<IdentifiedRecord, "id">;
  salaryObservations!: EntityTable<SalaryObservation, "id">;
  salaryEstimateSnapshots!: EntityTable<SalaryEstimateSnapshot, "id">;
  roleAliasOverrides!: EntityTable<RoleAliasOverride, "id">;
  savedViews!: EntityTable<SavedView, "id">;
  updateProposals!: EntityTable<StoredUpdateProposal, "id">;
  processedMessages!: EntityTable<ProcessedMessageRecord, "id">;
  prepSessions!: EntityTable<IdentifiedRecord, "id">;
  profileFields!: EntityTable<IdentifiedRecord, "id">;
  activityEntries!: EntityTable<ActivityEntry, "id">;
  metadata!: EntityTable<MetadataRecord, "key">;
  browserProfiles!: EntityTable<BrowserProfileRecord, "id">;
  profileKeys!: EntityTable<BrowserProfileKey, "id">;

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
    this.version(2).stores({
      applications: "id, stage, outcome, market, roleFamily, updatedAt",
      stageEvents: "id, applicationId",
      deadlines: "id",
      researchSnapshots: "id",
      salaryObservations: "id, applicationId, market, canonicalRole, observedAt",
      salaryEstimateSnapshots: "id, applicationId, calculatedAt",
      roleAliasOverrides: "id, [market+normalizedTitle]",
      savedViews: "id",
      updateProposals: "id, state",
      processedMessages: "id",
      prepSessions: "id",
      profileFields: "id",
      activityEntries: "id",
      metadata: "key",
    });
    this.version(3).stores({ browserProfiles: "id", profileKeys: "id" });
  }
}

export const jobBuddyDb = new JobBuddyDb();
