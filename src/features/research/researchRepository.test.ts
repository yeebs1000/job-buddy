import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { jobBuddyDb } from "../../db/database";
import type { RoleAliasOverride, SalaryEstimateSnapshot, SalaryObservation } from "../../domain/research";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { researchRepository } from "./researchRepository";

const observation: SalaryObservation = {
  id: "observation-1",
  applicationId: "a1",
  provenance: "job_posting",
  market: "US",
  currency: "USD",
  period: "annual",
  minimum: 120_000,
  maximum: 160_000,
  canonicalRole: "software-engineer",
  observedAt: "2026-09-16T00:00:00.000Z",
  sourceUrl: "https://jobs.example/1",
  reusable: true,
};

const snapshot: SalaryEstimateSnapshot = {
  id: "estimate-1",
  applicationId: "a1",
  market: "US",
  currency: "USD",
  period: "annual",
  benchmarkId: "benchmark-1",
  inputReleaseIds: ["release-1"],
  roleMatch: {
    originalTitle: "Software Engineer",
    normalizedTitle: "software engineer",
    canonicalRole: "software-engineer",
    sourceOccupationCode: "15-1252",
    strength: "exact",
    ruleId: "software-engineer",
    overridden: false,
  },
  geographyFallback: "exact",
  exactNominalRange: { minimum: 120_000, maximum: 160_000 },
  displayRange: { minimum: 120_000, maximum: 160_000 },
  roundingRule: "floor-usd-annual-5000",
  evidenceIds: [observation.id],
  evidenceSummary: { eligible: 1, excluded: 0, blendWeight: 0 },
  confidence: "high",
  confidenceConditions: [],
  assumptions: [],
  exclusions: [],
  calculatedAt: "2026-09-16T00:00:00.000Z",
};

describe("researchRepository", () => {
  afterEach(async () => {
    await jobBuddyDb.delete();
    await jobBuddyDb.open();
  });

  it("persists observations separately from immutable estimate snapshots", async () => {
    await researchRepository.addObservation(observation);
    await researchRepository.saveSnapshot(snapshot);

    expect(await researchRepository.listObservations("a1")).toEqual([observation]);
    expect(await researchRepository.latestSnapshot("a1")).toEqual(snapshot);
    expect(await researchRepository.listSnapshots("a1")).toEqual([snapshot]);
    await expect(researchRepository.saveSnapshot(snapshot)).rejects.toThrow();
  });

  it("stores a reusable market and normalized-title alias", async () => {
    const alias: RoleAliasOverride = {
      id: "alias-1",
      market: "US",
      normalizedTitle: "swe ii",
      canonicalRole: "software-engineer",
      sourceOccupationCode: "15-1252",
      createdAt: "2026-09-16T00:00:00.000Z",
    };

    await researchRepository.saveRoleAlias(alias);

    expect(await researchRepository.listRoleAliases("US")).toEqual([alias]);
  });

  it("upgrades a version 1 database without removing legacy application research", async () => {
    await jobBuddyDb.delete();
    const legacy = new Dexie("job-buddy");
    legacy.version(1).stores({
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
    const { stageEvents: _, ...application } = sampleApplications[0];
    await legacy.table("applications").add({ ...application, stage: "applied", outcome: null, updatedAt: "2026-09-16T00:00:00.000Z" });
    legacy.close();

    await jobBuddyDb.open();

    expect(await jobBuddyDb.applications.get(application.id)).toMatchObject({
      id: application.id,
      research: application.research,
    });
    expect(jobBuddyDb.verno).toBe(2);
  });
});
