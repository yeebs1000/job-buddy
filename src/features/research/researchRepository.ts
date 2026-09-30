import { jobBuddyDb } from "../../db/database";
import {
  roleAliasOverrideSchema,
  salaryEstimateSnapshotSchema,
  salaryObservationSchema,
  type Market,
  type RoleAliasOverride,
  type SalaryEstimateSnapshot,
  type SalaryObservation,
} from "../../domain/research";

export const researchRepository = {
  async addObservation(input: SalaryObservation): Promise<SalaryObservation> {
    const observation = salaryObservationSchema.parse(input);
    await jobBuddyDb.salaryObservations.add(observation);
    return observation;
  },

  async listObservations(applicationId: string): Promise<SalaryObservation[]> {
    return jobBuddyDb.salaryObservations.where("applicationId").equals(applicationId).sortBy("observedAt");
  },

  async saveSnapshot(input: SalaryEstimateSnapshot): Promise<SalaryEstimateSnapshot> {
    const snapshot = salaryEstimateSnapshotSchema.parse(input);
    await jobBuddyDb.salaryEstimateSnapshots.add(snapshot);
    return snapshot;
  },

  async latestSnapshot(applicationId: string): Promise<SalaryEstimateSnapshot | undefined> {
    const snapshots = await this.listSnapshots(applicationId);
    return snapshots.at(-1);
  },

  async listSnapshots(applicationId: string): Promise<SalaryEstimateSnapshot[]> {
    return jobBuddyDb.salaryEstimateSnapshots.where("applicationId").equals(applicationId).sortBy("calculatedAt");
  },

  async saveRoleAlias(input: RoleAliasOverride): Promise<RoleAliasOverride> {
    const alias = roleAliasOverrideSchema.parse(input);
    await jobBuddyDb.roleAliasOverrides.put(alias);
    return alias;
  },

  async listRoleAliases(market?: Market): Promise<RoleAliasOverride[]> {
    return market
      ? jobBuddyDb.roleAliasOverrides.where("market").equals(market).sortBy("normalizedTitle")
      : jobBuddyDb.roleAliasOverrides.orderBy("normalizedTitle").toArray();
  },
};
