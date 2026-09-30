// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { applicationRepository } from "../../db/applicationRepository";
import { emptyCandidateProfile } from "../../domain/profile";
import { browserProfileClient } from "../profile/browserProfileClient";
import { readWorkspaceBackup, restoreWorkspaceBackup } from "./workspaceBackup";
import { parseWorkspaceBackup } from "./workspaceSchema";

vi.mock("../../app/runtimeMode", () => ({ isWebMode: true }));
const at = "2026-09-25T00:00:00.000Z";
const clear = () => Promise.all(jobBuddyDb.tables.map(table => table.clear()));
beforeEach(clear);
async function seed() {
  await applicationRepository.create({ id: "app", company: "Synthetic", role: "Analyst", discipline: "finance", location: { city: "Singapore", country: "Singapore" }, source: "Manual", appliedAt: at, tags: ["priority"], notes: "Keep notes", deadlines: [{ id: "deadline", label: "Follow up", at, completed: false }], stageEvents: [{ id: "stage", applicationId: "app", at, origin: "manual", accepted: true, toStage: "applied" }] });
  await jobBuddyDb.metadata.put({ key: "oauth-state", value: "never-export" });
  await jobBuddyDb.metadata.put({ key: "mail-scan:gmail", value: JSON.stringify({ cursor: "secret-cursor" }) });
  await jobBuddyDb.metadata.put({ key: "gmail-preferences:v1", value: JSON.stringify({ selectedSource: "gmail", automationMode: "unrestricted", initialSyncCompleted: true, dailyActiveScanEnabled: true }) });
}
it("round-trips a workspace and profile while excluding connection state", async () => {
  await seed();
  await browserProfileClient.replace({ ...emptyCandidateProfile, identity: { givenName: "Local fixture" } });
  const backup = await readWorkspaceBackup();
  expect(JSON.stringify(backup)).not.toMatch(/never-export|secret-cursor|ciphertext/);
  expect(await jobBuddyDb.metadata.get("oauth-state")).toBeDefined();
  await clear();
  await restoreWorkspaceBackup(backup);
  expect((await applicationRepository.get("app"))?.notes).toBe("Keep notes");
  expect((await applicationRepository.get("app"))?.stageEvents[0].toStage).toBe("applied");
  expect((await browserProfileClient.get()).profile.identity.givenName).toBe("Local fixture");
  expect(JSON.parse((await jobBuddyDb.metadata.get("gmail-preferences:v1"))!.value)).toMatchObject({ dailyActiveScanEnabled: false, initialSyncCompleted: false, automationMode: "approval" });
});
it("refuses occupied destinations without changing either workspace", async () => {
  await seed();
  const backup = await readWorkspaceBackup();
  await expect(restoreWorkspaceBackup(backup)).rejects.toThrow(/empty|occupied/i);
  expect(await jobBuddyDb.applications.count()).toBe(1);
  expect(await jobBuddyDb.metadata.get("oauth-state")).toBeDefined();
});
it("preserves legacy view sorting and existing HTTP job links", async () => {
  await seed();
  await jobBuddyDb.applications.update("app", { jobUrl: "http://jobs.example.org/role" });
  await jobBuddyDb.savedViews.put({ id: "legacy", name: "Legacy view", filters: {}, sort: { field: "updatedAt", direction: "desc" }, visibleColumns: ["company"] });
  const backup = await readWorkspaceBackup();
  await clear();
  await restoreWorkspaceBackup(backup);
  expect((await jobBuddyDb.applications.get("app"))?.jobUrl).toBe("http://jobs.example.org/role");
  expect((await jobBuddyDb.savedViews.get("legacy"))?.sort).toEqual({ field: "updatedAt", direction: "desc" });
});
it("round-trips every supported record class, outreach and research metadata", async () => {
  await seed();
  const backup = await readWorkspaceBackup(null);
  backup.tables.updateProposals.push({ id: "proposal", status: "approved", state: "approved", mailSource: "gmail", createdAt: at,
    source: { providerMessageId: "message", fromAddress: "recruiter@example.org", subject: "An opportunity", receivedAt: at, excerpt: "Synthetic outreach", links: [] },
    match: { applicationId: "app", confidence: 1, reasons: [], conflicts: [] },
    classification: { kind: "recruiter-outreach", confidence: 1, reasons: [], evidenceExcerpt: "Synthetic outreach", deadlines: [], links: [], requiresApproval: true },
    opportunity: { title: "Analyst", company: "Synthetic", location: "Singapore", savedAt: at } });
  backup.tables.deadlines.push({ id: "separate-deadline", applicationId: "app", proposalId: "proposal", kind: "deadline", label: "Reply", at, completed: false, links: [] });
  backup.tables.activityEntries.push({ id: "activity", proposalId: "proposal", applicationId: "app", at, action: "approved", automatic: false, mailSource: "gmail" });
  backup.tables.processedMessages.push({ id: "message", proposalId: "proposal", processedAt: at });
  backup.tables.savedViews.push({ id: "view", name: "My view", filters: {}, sort: [], visibleColumns: ["company"] });
  backup.tables.roleAliasOverrides.push({ id: "alias", market: "SG", normalizedTitle: "analyst", canonicalRole: "financial-analyst", sourceOccupationCode: "1", createdAt: at });
  backup.tables.salaryObservations.push({ id: "observation", applicationId: "app", provenance: "manual", market: "SG", currency: "SGD", period: "annual", minimum: 60000, canonicalRole: "financial-analyst", observedAt: at, reusable: false, sourceUrl: "https://example.org/salary" });
  backup.tables.salaryEstimateSnapshots.push({ id: "estimate", applicationId: "app", market: "SG", currency: "SGD", period: "annual", benchmarkId: "benchmark", benchmarkSourceUrl: "https://example.org/benchmark", inputReleaseIds: ["release"],
    roleMatch: { originalTitle: "Analyst", normalizedTitle: "analyst", canonicalRole: "financial-analyst", sourceOccupationCode: "1", strength: "exact", ruleId: "rule", overridden: false },
    geographyFallback: "exact", exactNominalRange: { minimum: 60000, maximum: 80000 }, displayRange: { minimum: 60000, maximum: 80000 }, roundingRule: "fixture", evidenceIds: ["observation"], evidenceSummary: { eligible: 1, excluded: 0, blendWeight: 0 }, confidence: "limited", confidenceConditions: [], assumptions: [], exclusions: [], calculatedAt: at });
  backup.metadata.push({ key: "discovery-board:v1", value: "https://jobs.lever.co/example" },
    { key: "discovery-shortlist:v1", value: JSON.stringify([{ id: "job", board: { provider: "lever", token: "example", region: "global" }, title: "Analyst", location: "Singapore", url: "https://jobs.lever.co/example/job", salary: [], retrievedAt: at, savedAt: at }]) },
    { key: "web-salary:app", value: JSON.stringify({ id: "app", query: { company: "Synthetic", role: "Analyst", location: "Singapore" }, savedAt: at, currency: "SGD", basis: "base", evidence: [{ url: "https://example.org/pay", title: "Pay", excerpt: "Fixture", retrievedAt: at, minimum: 60000, maximum: 80000, currency: "SGD", period: "annual", basis: "base", match: "company-role", confirmed: true }] }) });
  for (const name of Object.keys(backup.tables) as (keyof typeof backup.tables)[]) backup.manifest.counts[name] = backup.tables[name].length;
  const validated = parseWorkspaceBackup(backup);
  await clear();
  await restoreWorkspaceBackup(validated);
  const restored = await readWorkspaceBackup(null);
  expect(restored.tables).toEqual(validated.tables);
  expect(restored.metadata).toEqual(expect.arrayContaining(validated.metadata));
});
it("rolls back every restored record when one table fails", async () => {
  await seed();
  const backup = await readWorkspaceBackup();
  await clear();
  const fail = () => { throw new Error("Disk full"); };
  jobBuddyDb.stageEvents.hook("creating", fail);
  try {
    await expect(restoreWorkspaceBackup(backup)).rejects.toThrow();
    expect(await jobBuddyDb.applications.count()).toBe(0);
    expect(await jobBuddyDb.metadata.count()).toBe(0);
  } finally { jobBuddyDb.stageEvents.hook("creating").unsubscribe(fail); }
});
it("does not silently omit unsupported populated stores", async () => {
  await jobBuddyDb.prepSessions.put({ id: "keep-me" });
  await expect(readWorkspaceBackup()).rejects.toThrow(/unsupported/i);
  expect(await jobBuddyDb.prepSessions.count()).toBe(1);
});
it("refuses profile export if browser cryptography becomes unavailable", async () => {
  await browserProfileClient.replace({ ...emptyCandidateProfile, identity: { givenName: "Must keep" } });
  vi.stubGlobal("crypto", {});
  try { await expect(readWorkspaceBackup()).rejects.toThrow(); }
  finally { vi.unstubAllGlobals(); }
});
it("rejects duplicate IDs, missing references, dangerous links and manifest mismatch", async () => {
  await seed();
  const backup = await readWorkspaceBackup();
  const mutate = (fn: (copy: typeof backup) => void) => { const copy = structuredClone(backup); fn(copy); return () => parseWorkspaceBackup(copy); };
  expect(mutate(b => b.tables.applications.push(b.tables.applications[0]))).toThrow();
  expect(mutate(b => { b.tables.stageEvents[0].applicationId = "missing"; })).toThrow();
  expect(mutate(b => { b.tables.applications[0].jobUrl = "javascript:alert(1)"; })).toThrow();
  expect(mutate(b => { b.manifest.counts.applications = 2; })).toThrow();
  expect(() => parseWorkspaceBackup({ ...backup, unexpected: "data" })).toThrow();
  expect(() => parseWorkspaceBackup(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
});
it("rechecks destination occupancy after asynchronous profile encryption", async () => {
  const backup = await readWorkspaceBackup({ ...emptyCandidateProfile, identity: { givenName: "Imported" } });
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
    await seed();
    return encrypt(...args);
  });
  try {
    await expect(restoreWorkspaceBackup(backup)).rejects.toThrow(/empty|occupied/i);
    expect(await jobBuddyDb.browserProfiles.count()).toBe(0);
    expect(await jobBuddyDb.applications.count()).toBe(1);
  } finally { spy.mockRestore(); }
});
