import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import type { Application } from "../../domain/application";
import type { ApplicationStage } from "../../domain/stage";
import { fixtureMessages } from "../../fixtures/mail/messages";
import type { MailAdapter, MailEnvelope } from "../../integrations/mail/MailAdapter";
import { runMailScan } from "./runMailScan";
import { scanStateKey, updateRepository, type ProposalEdits } from "./updateRepository";
import { useMailScan } from "./useMailScan";

const now = "2026-09-14T09:00:00.000Z";
const mail = fixtureMessages[0];

function application(stage: ApplicationStage = "applied", overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1", company: "Meridian Quant", role: "Quantitative Analyst", recruiter: mail.fromAddress,
    discipline: "finance", location: { city: "Singapore", country: "Singapore" }, source: "manual",
    appliedAt: "2026-09-01T00:00:00.000Z", tags: [], deadlines: [],
    stageEvents: [{ id: "initial", applicationId: "app-1", toStage: stage, accepted: true, origin: "manual", at: "2026-09-01T00:00:00.000Z" }],
    ...overrides,
  };
}

function adapter(messages: MailEnvelope[] = [mail], nextCursor = "cursor-1"): MailAdapter {
  return { async scan() { return { messages, nextCursor, scannedAt: now }; } };
}

afterEach(async () => {
  await jobBuddyDb.delete();
  await jobBuddyDb.open();
});

it("deduplicates provider identifiers within and across scans without overriding a manual stage", async () => {
  await applicationRepository.create(application("final"));
  await runMailScan({ adapter: adapter([mail, mail]), mode: "unrestricted", now });
  await runMailScan({ adapter: adapter(), mode: "unrestricted", now });
  const pending = await updateRepository.listPending();
  expect(pending).toHaveLength(1);
  expect(pending[0].match.conflicts).toContain("stage-not-forward");
  expect(pending[0].classification.requiresApproval).toBe(true);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("final");
  expect(await jobBuddyDb.processedMessages.count()).toBe(1);
  expect(await jobBuddyDb.activityEntries.count()).toBe(0);
});

it("keeps approval-mode changes pending, then atomically approves history, interview, deadlines and activity only once", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  await Promise.all([updateRepository.approveProposal(proposal.id), updateRepository.approveProposal(proposal.id)]);
  expect(await updateRepository.get(proposal.id)).toMatchObject({ status: "approved" });
  expect(await applicationRepository.get("app-1")).toMatchObject({
    stage: "interview", interviewSubtype: "technical",
    deadlines: [{ label: "Technical interview", at: "2026-09-13T06:00:00.000Z" }],
  });
  expect(await jobBuddyDb.stageEvents.count()).toBe(2);
  expect(await jobBuddyDb.deadlines.toArray()).toEqual([expect.objectContaining({ applicationId: "app-1", proposalId: proposal.id, kind: "interview", interviewSubtype: "technical", links: ["https://meet.example/meridian-technical"] })]);
  expect(await jobBuddyDb.activityEntries.toArray()).toEqual([expect.objectContaining({ proposalId: proposal.id, automatic: false, action: "approved" })]);
});

it("auto-applies a confident forward update and never duplicates its accepted event on retry", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "unrestricted", now });
  await runMailScan({ adapter: adapter(), mode: "unrestricted", now });
  expect(await updateRepository.listPending()).toHaveLength(0);
  expect((await updateRepository.list())[0]).toMatchObject({ status: "approved" });
  expect((await applicationRepository.get("app-1"))?.stage).toBe("interview");
  expect(await jobBuddyDb.stageEvents.count()).toBe(2);
  expect(await jobBuddyDb.deadlines.count()).toBe(1);
  expect(await jobBuddyDb.activityEntries.toArray()).toEqual([expect.objectContaining({ automatic: true })]);
});

it.each([
  ["low match confidence", { fromAddress: "someone@other.example" }, "applied"],
  ["low classification confidence", { subject: "Online assessment invitation — Quantitative Analyst", excerpt: "Please complete the online assessment." }, "applied"],
  ["terminal rejection", { excerpt: "We will not be progressing your application on this occasion." }, "applied"],
  ["offer", { subject: "Offer for Quantitative Analyst", excerpt: "We are pleased to offer you the Quantitative Analyst position." }, "applied"],
  ["same stage", {}, "interview"],
] as const)("keeps %s pending in unrestricted mode", async (_name, overrides, stage) => {
  await applicationRepository.create(application(stage, _name === "low match confidence" ? { recruiter: "Meridian Quant Recruiting" } : {}));
  await runMailScan({ adapter: adapter([{ ...mail, ...overrides }]), mode: "unrestricted", now });
  expect(await updateRepository.listPending()).toHaveLength(1);
  expect((await applicationRepository.get("app-1"))?.stage).toBe(stage);
  expect(await jobBuddyDb.activityEntries.count()).toBe(0);
});

it("does not let older forward mail silently replace a newer manual correction", async () => {
  await applicationRepository.create(application("assessment"));
  await applicationRepository.appendEvent({ id: "correction", applicationId: "app-1", fromStage: "assessment", toStage: "review", origin: "manual", accepted: true, at: "2026-09-13T00:00:00.000Z" });
  await runMailScan({ adapter: adapter(), mode: "unrestricted", now });
  expect((await updateRepository.listPending())[0].match.conflicts).toContain("manual-correction");
  expect((await applicationRepository.get("app-1"))?.stage).toBe("review");
});

it("keeps ambiguous and unmatched classified mail pending and records irrelevant mail without a proposal", async () => {
  await applicationRepository.create(application());
  await applicationRepository.create(application("applied", { id: "app-2", stageEvents: [] }));
  await runMailScan({ adapter: adapter([mail, fixtureMessages[1], fixtureMessages[5]]), mode: "unrestricted", now });
  const pending = await updateRepository.listPending();
  expect(pending).toHaveLength(2);
  expect(pending.every((proposal) => proposal.match.applicationId === null)).toBe(true);
  expect(pending.find((proposal) => proposal.source.providerMessageId === mail.providerMessageId)?.match.conflicts).toContain("ambiguous");
  expect(pending.find((proposal) => proposal.source.providerMessageId === fixtureMessages[1].providerMessageId)?.match.reasons).toContain("unmatched");
  expect(await jobBuddyDb.processedMessages.count()).toBe(3);
  await expect(updateRepository.approveProposal(pending[0].id)).rejects.toThrow("application");
  expect(await jobBuddyDb.activityEntries.count()).toBe(0);
});

it("preserves successful cursor and timestamp after adapter failure and hides raw provider errors", async () => {
  await runMailScan({ adapter: adapter([], "prior"), mode: "approval", now });
  const later = "2026-09-15T00:00:00.000Z";
  const result = await runMailScan({ adapter: { async scan() { throw new Error("SECRET recruiter@example.test full private body"); } }, mode: "approval", now: later });
  expect(result.error).toBeTruthy();
  const state = await updateRepository.getScanState();
  expect(state).toMatchObject({ cursor: "prior", lastSuccessfulScanAt: now, lastAttemptedScanAt: later });
  expect(JSON.stringify(state)).not.toMatch(/SECRET|recruiter@example|private body/);
});

it("rolls back processed ids, proposals and automatic side effects when persistence fails, then retries cleanly", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter([], "prior"), mode: "approval", now });
  const failWrite = () => { throw new Error("sensitive storage failure"); };
  jobBuddyDb.activityEntries.hook("creating", failWrite);
  try {
    const failed = await runMailScan({ adapter: adapter(), mode: "unrestricted", now: "2026-09-15T00:00:00.000Z" });
    expect(failed.error).toBeTruthy();
  } finally { jobBuddyDb.activityEntries.hook("creating").unsubscribe(failWrite); }
  expect(await updateRepository.getScanState()).toMatchObject({ cursor: "prior", lastSuccessfulScanAt: now });
  expect(await jobBuddyDb.processedMessages.count()).toBe(0);
  expect(await jobBuddyDb.updateProposals.count()).toBe(0);
  expect(await jobBuddyDb.stageEvents.count()).toBe(1);
  expect(await jobBuddyDb.deadlines.count()).toBe(0);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  await runMailScan({ adapter: adapter(), mode: "unrestricted", now });
  expect((await updateRepository.getScanState()).cursor).toBe("cursor-1");
  expect(await jobBuddyDb.stageEvents.count()).toBe(2);
  expect(await jobBuddyDb.activityEntries.count()).toBe(1);
});

it("rolls back an explicit approval completely when its activity write fails", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  const failWrite = () => { throw new Error("write failed"); };
  jobBuddyDb.activityEntries.hook("creating", failWrite);
  try { await expect(updateRepository.approveProposal(proposal.id)).rejects.toThrow(); }
  finally { jobBuddyDb.activityEntries.hook("creating").unsubscribe(failWrite); }
  expect((await updateRepository.get(proposal.id))?.status).toBe("pending");
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  expect(await jobBuddyDb.deadlines.count()).toBe(0);
  expect(await jobBuddyDb.stageEvents.count()).toBe(1);
  await updateRepository.approveProposal(proposal.id);
  expect(await jobBuddyDb.activityEntries.count()).toBe(1);
});

it("allows explicit application/stage/deadline edits at approval and preserves rejected decisions on rescan", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter([fixtureMessages[1], mail]), mode: "approval", now });
  const proposals = await updateRepository.listPending();
  const unmatched = proposals.find((proposal) => proposal.match.applicationId === null)!;
  const matched = proposals.find((proposal) => proposal.match.applicationId === "app-1")!;
  await updateRepository.approveProposal(unmatched.id, { applicationId: "app-1", proposedStage: "assessment", deadlines: [{ id: "corrected", label: "Edited deadline", at: "2026-09-20T00:00:00.000Z", completed: false }] });
  await updateRepository.rejectProposal(matched.id);
  await updateRepository.rejectProposal(matched.id);
  await runMailScan({ adapter: adapter([fixtureMessages[1], mail]), mode: "unrestricted", now });
  expect((await updateRepository.get(matched.id))?.status).toBe("rejected");
  await expect(updateRepository.approveProposal(matched.id)).rejects.toThrow();
  expect(await applicationRepository.get("app-1")).toMatchObject({ stage: "assessment", deadlines: [{ label: "Edited deadline", at: "2026-09-20T00:00:00.000Z" }] });
  expect(await jobBuddyDb.activityEntries.count()).toBe(2);
});

it("defers without modifying the application and allows later approval without duplicate defer entries", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  await updateRepository.deferProposal(proposal.id);
  await updateRepository.deferProposal(proposal.id);
  expect((await updateRepository.get(proposal.id))?.status).toBe("deferred");
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  expect(await jobBuddyDb.stageEvents.count()).toBe(1);
  expect(await jobBuddyDb.deadlines.count()).toBe(0);
  expect(await jobBuddyDb.activityEntries.count()).toBe(1);
  await updateRepository.approveProposal(proposal.id);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("interview");
  expect(await jobBuddyDb.activityEntries.count()).toBe(2);
});

it("does not report an idle hook while a second requested scan is still running", async () => {
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const second = new Promise<void>((resolve) => { finishSecond = resolve; });
  let scanNumber = 0;
  const slowAdapter: MailAdapter = { async scan(cursor) {
    const current = ++scanNumber;
    await (current === 1 ? first : second);
    if (current === 2 && cursor !== "first") throw new Error("Second scan lost the committed cursor");
    return { messages: [], nextCursor: current === 1 ? "first" : "second", scannedAt: now };
  } };
  const { result, unmount } = renderHook(() => useMailScan(slowAdapter));
  let firstRun!: ReturnType<typeof result.current.scan>;
  let secondRun!: ReturnType<typeof result.current.scan>;
  act(() => { firstRun = result.current.scan(); secondRun = result.current.scan(); });
  try {
    await act(async () => { finishFirst(); await firstRun; });
    expect(result.current.isScanning).toBe(true);
  } finally {
    await act(async () => { finishSecond(); await secondRun; });
    unmount();
  }
  expect((await updateRepository.getScanState()).cursor).toBe("second");
});

it("retries from another tab's committed cursor rather than advancing a stale scan result", async () => {
  await runMailScan({ adapter: { async scan() {
    await updateRepository.saveScanState({ cursor: "other-tab", lastSuccessfulScanAt: now });
    return { messages: [mail], nextCursor: "stale", scannedAt: now };
  } }, mode: "approval", now });
  expect((await updateRepository.getScanState()).cursor).toBe("other-tab");
  expect(await jobBuddyDb.processedMessages.count()).toBe(0);
  expect(await jobBuddyDb.updateProposals.count()).toBe(0);
});

it("makes explicit approval take effect after newer manual history instead of backdating it to the email", async () => {
  await applicationRepository.create(application("final", {
    stageEvents: [{ id: "future-correction", applicationId: "app-1", at: "2099-01-01T00:00:00.000Z", toStage: "final", accepted: true, origin: "manual" }],
  }));
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  await updateRepository.approveProposal(proposal.id);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("interview");
  expect(await jobBuddyDb.stageEvents.get("future-correction")).toMatchObject({ accepted: true, toStage: "final" });
});

it("surfaces safe scan failure through the live hook and clears it on successful retry", async () => {
  let fail = true;
  const flakyAdapter: MailAdapter = { async scan() {
    if (fail) throw new Error("private provider error");
    return { messages: [], nextCursor: "recovered", scannedAt: now };
  } };
  const { result, unmount } = renderHook(() => useMailScan(flakyAdapter));
  try {
    await act(async () => { await result.current.scan(); });
    await waitFor(() => expect(result.current.state?.error).toBeTruthy());
    expect(result.current.state?.error).not.toContain("private provider error");
    expect(result.current.isScanning).toBe(false);
    fail = false;
    await act(async () => { await result.current.scan(); });
    await waitFor(() => expect(result.current.state?.cursor).toBe("recovered"));
    expect(result.current.state?.error).toBeUndefined();
  } finally { unmount(); }
});

it("cannot overwrite another tab's successful cursor while recording a scan attempt", async () => {
  await updateRepository.saveScanState({ cursor: "prior", lastSuccessfulScanAt: now });
  let queued = false;
  let otherTabWrite: Promise<unknown> | undefined;
  const interleaveWrite = (record: { key: string; value: string }) => {
    if (record?.key === scanStateKey && !queued) {
      queued = true;
      // Queue a real competing IndexedDB write exactly between the initial read
      // and attempt persistence. An atomic read/write must serialize this.
      otherTabWrite = Dexie.ignoreTransaction(() => jobBuddyDb.metadata.put({ key: scanStateKey, value: JSON.stringify({ cursor: "other-tab", lastSuccessfulScanAt: now }) }));
    }
    return record;
  };
  jobBuddyDb.metadata.hook("reading", interleaveWrite);
  try {
    await runMailScan({ adapter: adapter([], "stale-result"), mode: "approval", now });
    await otherTabWrite;
  } finally { jobBuddyDb.metadata.hook("reading").unsubscribe(interleaveWrite); }
  expect((await updateRepository.getScanState()).cursor).toBe("other-tab");
});

it("applies the terminal outcome only on explicit approval while retaining the last stage", async () => {
  await applicationRepository.create(application("assessment"));
  await runMailScan({ adapter: adapter([{ ...mail, subject: "Quantitative Analyst application update", excerpt: "We will not be progressing your application." }]), mode: "unrestricted", now });
  const [proposal] = await updateRepository.listPending();
  expect((await applicationRepository.get("app-1"))?.outcome).toBeNull();
  await updateRepository.approveProposal(proposal.id);
  expect(await applicationRepository.get("app-1")).toMatchObject({ stage: "assessment", outcome: "rejected" });
  expect((await applicationRepository.eventsFor("app-1"))).toContainEqual(expect.objectContaining({ outcome: "rejected", accepted: true, evidenceId: proposal.id }));
});

it("accepts both confidence thresholds at exactly 0.9", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter([{ ...mail,
    subject: "Numerical assessment deadline", excerpt: "Please complete the numerical assessment by 2026-09-20 at 10:00 AM SGT.",
  }]), mode: "unrestricted", now });
  expect((await updateRepository.list())[0]).toMatchObject({
    status: "approved", match: { confidence: 0.9 }, classification: { confidence: 0.9 },
  });
  expect((await applicationRepository.get("app-1"))?.stage).toBe("assessment");
});

it("preserves a user-corrected proposal stage when a different older forward message arrives", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  await updateRepository.approveProposal(proposal.id, { proposedStage: "assessment" });
  await runMailScan({ adapter: adapter([{ ...mail, providerMessageId: "older-distinct-interview", receivedAt: "2026-09-11T02:00:00.000Z" }]), mode: "unrestricted", now });

  expect((await applicationRepository.get("app-1"))?.stage).toBe("assessment");
  expect(await updateRepository.listPending()).toEqual([expect.objectContaining({
    source: expect.objectContaining({ providerMessageId: "older-distinct-interview" }),
    match: expect.objectContaining({ conflicts: ["manual-correction"] }),
  })]);
  expect((await applicationRepository.eventsFor("app-1")).find((event) => event.evidenceId === proposal.id)?.origin).toBe("manual");
});

it.each<[string, ProposalEdits]>([
  ["unchanged approval", {}],
  ["identical lifecycle values", { proposedStage: "interview", proposedOutcome: undefined }],
  ["application match only", { applicationId: "app-2" }],
  ["deadline and link only", { deadlines: [], links: ["https://example.test/edited"] }],
])("keeps source lifecycle provenance for %s", async (_name, edits) => {
  await applicationRepository.create(application());
  await applicationRepository.create(application("applied", { id: "app-2", company: "Other", role: "Other", recruiter: undefined, stageEvents: [] }));
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  await updateRepository.approveProposal(proposal.id, edits);
  expect((await applicationRepository.eventsFor(edits.applicationId ?? "app-1")).find((event) => event.evidenceId === proposal.id)?.origin).toBe("system");
});

it.each<[string, ProposalEdits]>([
  ["explicitly clearing stage", { proposedStage: undefined }],
  ["explicitly clearing outcome", { proposedOutcome: undefined }],
  ["changing outcome", { proposedOutcome: "withdrawn" }],
])("records manual lifecycle provenance when %s", async (_name, edits) => {
  await applicationRepository.create(application());
  await updateRepository.create({
    id: "lifecycle-proposal", status: "pending", source: mail,
    match: { applicationId: "app-1", confidence: 1, reasons: ["recruiter"], conflicts: [] },
    classification: {
      proposedStage: "assessment", proposedOutcome: "rejected", confidence: 0.95,
      reasons: ["rejection-language"], evidenceExcerpt: "Application rejected after assessment.",
      deadlines: [], links: [], requiresApproval: true,
    },
    createdAt: now,
  });
  await updateRepository.approveProposal("lifecycle-proposal", edits);
  expect((await applicationRepository.eventsFor("app-1")).find((event) => event.evidenceId === "lifecycle-proposal")?.origin).toBe("manual");
});
