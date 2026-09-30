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
import { GmailMailAdapter } from "../../integrations/mail/GmailMailAdapter";
import { GmailScanError } from "../../integrations/mail/gmailScanErrors";
import { vi } from "vitest";

const now = "2026-09-14T09:00:00.000Z";

it("clears a saved interruption when retrying without dropping resume progress", async () => {
  await updateRepository.saveScanState("gmail", { cursor: "old", error: "previous failure", errorCode: "gmail-timeout",
    continuationToken: "session:25", progress: { processed: 25, total: 50 } });
  const retry: MailAdapter = { source: "gmail", scan: async () => {
    const state = await updateRepository.getScanState("gmail");
    expect(state.error).toBeUndefined();
    expect(state.errorCode).toBeUndefined();
    expect(state.continuationToken).toBe("session:25");
    expect(state.progress?.processed).toBe(25);
    return { messages: [], nextCursor: "new", scannedAt: now };
  } };
  expect((await runMailScan({ adapter: retry, mode: "approval", now })).error).toBeUndefined();
});

it("recovers a previously ignored application receipt only on recheck and never creates an application automatically", async () => {
  const receipt = { ...mail, providerMessageId: "ignored-receipt", subject: "Thank You for Your Application!",
    excerpt: "Thank you for your interest in the Equity Research position. We will give careful consideration to your application by reviewing the details you provided against the position criteria.", fromAddress: "example@myworkday.com" };
  await jobBuddyDb.processedMessages.put({ id: receipt.providerMessageId, processedAt: now });
  await updateRepository.saveScanState("simulated", { cursor: "existing-cursor" });
  await runMailScan({ adapter: adapter([receipt]), mode: "unrestricted", now });
  expect(await updateRepository.list()).toHaveLength(0);
  const cursor = (await updateRepository.getScanState("simulated")).cursor;
  await runMailScan({ adapter: adapter([receipt]), mode: "unrestricted", recheck: true, now });
  expect(await updateRepository.list()).toMatchObject([{ status: "pending", classification: { proposedStage: "applied", requiresApproval: true } }]);
  expect(await jobBuddyDb.applications.count()).toBe(0);
  expect((await updateRepository.getScanState("simulated")).cursor).toBe(cursor);
  await runMailScan({ adapter: adapter([receipt]), mode: "unrestricted", recheck: true, now });
  expect(await updateRepository.list()).toHaveLength(1);
});

it("keeps matched recruiter outreach informational even in automatic mode and blocks stage approval", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter([{ ...mail, subject: "Senior Consultant opportunity", excerpt: "I am reaching out regarding a Senior Consultant opportunity. Your profile could be a strong fit." }]), mode: "unrestricted", now });
  const proposal = (await updateRepository.list())[0];
  expect(proposal).toMatchObject({ status: "pending", classification: { kind: "recruiter-outreach", requiresApproval: true } });
  await expect(approveProposal(proposal.id, { proposedStage: "interview" })).rejects.toThrow(/outreach/i);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
});

it("rechecks ignored messages without replacing existing proposals or advancing the history cursor", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const existing = (await updateRepository.list())[0];
  await updateRepository.rejectProposal(existing.id);
  const reviewed = await updateRepository.get(existing.id);
  const ignored = { ...mail, providerMessageId: "previously-ignored" };
  await jobBuddyDb.processedMessages.put({ id: ignored.providerMessageId, processedAt: now });
  const before = await applicationRepository.get("app-1");
  const calls: Array<string | null> = [];
  const recheckAdapter: MailAdapter = { source: "simulated", async scan(cursor, context) {
    calls.push(cursor); expect(context?.initialSyncConfirmed).toBe(true);
    return { messages: [mail, ignored], nextCursor: "new-cursor", scannedAt: now };
  } };
  await runMailScan({ adapter: recheckAdapter, mode: "unrestricted", recheck: true, now });
  expect(calls).toEqual([null]);
  expect(await updateRepository.get(existing.id)).toEqual(reviewed);
  expect(await updateRepository.list()).toHaveLength(2);
  expect((await updateRepository.listPending())[0]).toMatchObject({ classification: { requiresApproval: true } });
  expect(await applicationRepository.get("app-1")).toEqual(before);
  expect((await updateRepository.getScanState("simulated")).cursor).toBe("cursor-1");
  await runMailScan({ adapter: recheckAdapter, mode: "unrestricted", recheck: true, now });
  expect(await updateRepository.list()).toHaveLength(2);
});

it("persists recheck intent across a failed batch and resumes without auto-applying", async () => {
  await applicationRepository.create(application());
  await updateRepository.saveScanState("simulated", { cursor: "old" });
  let calls = 0;
  const recheckAdapter: MailAdapter = { source: "simulated", async scan(cursor, context) {
    expect(cursor).toBeNull(); expect(context?.initialSyncConfirmed).toBe(true);
    calls++;
    if (calls === 1) return { messages: [], nextCursor: "new", scannedAt: now, continuationToken: "token:25", progress: { processed: 25, total: 26 } };
    expect(context?.continuationToken).toBe("token:25");
    if (calls === 2) throw new Error("Temporary failure");
    return { messages: [mail], nextCursor: "new", scannedAt: now, progress: { processed: 26, total: 26 } };
  } };
  expect((await runMailScan({ adapter: recheckAdapter, mode: "unrestricted", recheck: true, now })).error).toBeDefined();
  expect(await updateRepository.getScanState("simulated")).toMatchObject({ cursor: "old", rechecking: true, continuationToken: "token:25" });
  const result = await runMailScan({ adapter: recheckAdapter, mode: "unrestricted", now });
  expect(result.error).toBeUndefined(); expect(result.cursor).toBe("old");
  expect(result.rechecking).toBeUndefined();
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  expect((await updateRepository.listPending())[0].classification.requiresApproval).toBe(true);
});

it("does not create application proposals from newsletter offers even with a matching recruiter", async () => {
  await applicationRepository.create(application());
  const result = await runMailScan({ adapter: adapter([{ ...mail, subject: "Newsletter: Special offer", excerpt: "Join now with a special intro offer." }]), mode: "unrestricted", now });
  expect(result.error).toBeUndefined();
  expect(await jobBuddyDb.processedMessages.count()).toBe(1);
  expect(await jobBuddyDb.updateProposals.count()).toBe(0);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
});

it("never auto-applies restored news and blocks direct approval before restoration", async () => {
  await applicationRepository.create(application());
  await updateRepository.create({ id: "old-news", status: "pending", mailSource: "gmail", createdAt: now,
    source: { ...mail, fromAddress: "noreply@news.bloomberg.com" },
    match: { applicationId: "app-1", confidence: 1, reasons: ["recruiter"], conflicts: [] },
    classification: { proposedStage: "interview", confidence: 1, reasons: ["interview-invitation"], evidenceExcerpt: mail.excerpt, deadlines: [], links: [], requiresApproval: false },
  });
  await expect(approveProposal("old-news")).rejects.toThrow(/restore filtered/i);
  await updateRepository.restoreForManualReview("old-news");
  await updateRepository.autoApproveProposal("old-news", now);
  expect((await updateRepository.get("old-news"))?.status).toBe("pending");
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
});

it("starts fresh history batches after a larger completed initial scan", async () => {
  await updateRepository.saveScanState("gmail", { cursor: "old", progress: { processed: 500, total: 500 }, lastSuccessfulScanAt: now });
  let calls = 0;
  const result = await runMailScan({ adapter: { source: "gmail", async scan() {
    calls++;
    return { messages: [], nextCursor: "new", scannedAt: now, progress: { processed: calls === 1 ? 25 : 30, total: 30 }, ...(calls === 1 ? { continuationToken: "session:25" } : {}) };
  } }, mode: "approval", now });
  expect(result).toMatchObject({ cursor: "new", progress: { processed: 30, total: 30 } });
  expect(result.error).toBeUndefined();
});

it("rejects an old-account response after an initial scan is reset to another null cursor", async () => {
  const result = await runMailScan({ adapter: { source: "gmail", async scan() {
    await updateRepository.saveScanState("gmail", { cursor: null });
    return { messages: [mail], nextCursor: "old-account", scannedAt: now };
  } }, mode: "approval", now, initialSyncConfirmed: true });
  expect(result.errorCode).toBe("gmail-scan-superseded");
  expect(await updateRepository.getScanState("gmail")).toEqual({ cursor: null });
  expect(await jobBuddyDb.processedMessages.count()).toBe(0);
});

it("returns a sanitized storage error even when metadata cannot be written", async () => {
  const put = vi.spyOn(jobBuddyDb.metadata, "put").mockRejectedValue(new Error("private QuotaExceededError"));
  const scan = vi.fn();
  try {
    const result = await runMailScan({ adapter: { source: "gmail", scan }, mode: "approval", now });
    expect(result.errorCode).toBe("gmail-local-save-failed");
    expect(result.error).not.toContain("private");
    expect(scan).not.toHaveBeenCalled();
  } finally { put.mockRestore(); }
});

it("clears an expired checkpoint but keeps saved evidence and the prior successful cursor", async () => {
  await updateRepository.saveScanState("gmail", { cursor: "old", lastSuccessfulScanAt: now, continuationToken: "expired:25", progress: { processed: 25, total: 50 } });
  await jobBuddyDb.processedMessages.add({ id: "saved", processedAt: now });
  const result = await runMailScan({ adapter: { source: "gmail", async scan() { throw new GmailScanError("gmail-scan-expired"); } }, mode: "approval", now });
  expect(result).toMatchObject({ cursor: "old", lastSuccessfulScanAt: now, errorCode: "gmail-scan-expired" });
  expect(result.continuationToken).toBeUndefined();
  expect(result.progress).toBeUndefined();
  expect(await jobBuddyDb.processedMessages.count()).toBe(1);
});

it("keeps an already committed batch when the next browser storage transaction fails", async () => {
  let calls = 0;
  const batchAdapter: MailAdapter = { source: "gmail", async scan() {
    calls++;
    return { messages: calls === 1 ? [mail] : [{ ...mail, providerMessageId: "bad" }], nextCursor: "new", scannedAt: now,
      progress: { processed: calls, total: 2 }, ...(calls === 1 ? { continuationToken: "session:25" } : {}) };
  } };
  const original = jobBuddyDb.processedMessages.add.bind(jobBuddyDb.processedMessages);
  const insert = vi.spyOn(jobBuddyDb.processedMessages, "add").mockImplementation((record) => {
    if (record.id === "bad") throw new Error("private browser storage failure");
    return original(record);
  });
  try {
    const result = await runMailScan({ adapter: batchAdapter, mode: "approval", now, initialSyncConfirmed: true });
    expect(result).toMatchObject({ cursor: null, continuationToken: "session:25", errorCode: "gmail-local-save-failed" });
    expect(result.lastSuccessfulScanAt).toBeUndefined();
    expect(await jobBuddyDb.processedMessages.count()).toBe(1);
    expect(await jobBuddyDb.updateProposals.count()).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private browser storage failure");
  } finally { insert.mockRestore(); }
});

it("commits batch evidence but not the final cursor, then resumes after a reload without duplicates", async () => {
  let fail = true;
  const seen: Array<string | undefined> = [];
  const batchAdapter: MailAdapter = { source: "gmail", async scan(_cursor, context) {
    seen.push(context?.continuationToken);
    if (context?.continuationToken && fail) throw new GmailScanError("gmail-timeout");
    return { messages: [mail], nextCursor: "finished", scannedAt: now, progress: { processed: context?.continuationToken ? 2 : 1, total: 2 }, ...(!context?.continuationToken ? { continuationToken: "session:25" } : {}) };
  } };
  const first = await runMailScan({ adapter: batchAdapter, mode: "approval", initialSyncConfirmed: true, now });
  expect(first).toMatchObject({ cursor: null, continuationToken: "session:25", progress: { processed: 1, total: 2 } });
  expect(first.lastSuccessfulScanAt).toBeUndefined();
  expect(await jobBuddyDb.processedMessages.count()).toBe(1);
  fail = false;
  const final = await runMailScan({ adapter: batchAdapter, mode: "approval", initialSyncConfirmed: true, now });
  expect(final).toMatchObject({ cursor: "finished", lastSuccessfulScanAt: now });
  expect(final.continuationToken).toBeUndefined();
  expect(seen).toEqual([undefined, "session:25", "session:25"]);
  expect(await jobBuddyDb.processedMessages.count()).toBe(1);
});

it("preserves the cursor and translates quota codes across the real scan adapter without persisting provider text", async () => {
  await updateRepository.saveScanState("gmail", { cursor: "old", lastSuccessfulScanAt: now });
  vi.stubGlobal("fetch", async () => Response.json({ error: { code: "gmail-rate-limited", message: "private message" } }, { status: 429 }));
  try {
    const result = await runMailScan({ adapter: new GmailMailAdapter(), mode: "approval", now });
    expect(result).toMatchObject({ cursor: "old", lastSuccessfulScanAt: now, errorCode: "gmail-rate-limited" });
    expect(result.error).toMatch(/Google.*limit.*wait/i);
    expect(JSON.stringify(await updateRepository.getScanState("gmail"))).not.toContain("private message");
  } finally { vi.unstubAllGlobals(); }
});
const mail: MailEnvelope = {
  providerMessageId: "mail-meridian-001", threadId: "thread-meridian-quant",
  fromName: "Meridian Quant Recruiting", fromAddress: "recruiting@meridianquant.example",
  subject: "Technical interview invitation — Quantitative Analyst", receivedAt: "2026-09-12T02:00:00.000Z",
  excerpt: "Meridian Quant would like to invite you to a technical interview on 2026-09-13 at 2:00 PM SGT.",
  links: ["https://meet.example/meridian-technical"],
};

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
  return { source: "simulated", async scan() { return { messages, nextCursor, scannedAt: now }; } };
}

async function approveProposal(id: string, edits: ProposalEdits = {}) {
  const proposal = await updateRepository.get(id);
  const applicationId = edits.applicationId ?? proposal?.match.applicationId;
  const expectedApplicationUpdatedAt = edits.expectedApplicationUpdatedAt ?? (applicationId ? (await applicationRepository.get(applicationId))?.updatedAt : undefined);
  return updateRepository.approveProposal(id, { ...edits, expectedApplicationUpdatedAt });
}

afterEach(async () => {
  await jobBuddyDb.delete();
  await jobBuddyDb.open();
});

it("keeps live and simulated cursors independent", async () => {
  await updateRepository.saveScanState("simulated", { cursor: "fixture-4" });
  await updateRepository.saveScanState("gmail", { cursor: "184000" });

  expect((await updateRepository.getScanState("simulated")).cursor).toBe("fixture-4");
  expect((await updateRepository.getScanState("gmail")).cursor).toBe("184000");
});

it("persists the adapter source on proposals and review activity", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();

  expect(proposal.mailSource).toBe("simulated");
  await approveProposal(proposal.id);
  expect(await jobBuddyDb.activityEntries.toArray()).toEqual([
    expect.objectContaining({ proposalId: proposal.id, mailSource: "simulated" }),
  ]);
});

it("hands first-sync consent to the adapter without changing the transactional cursor", async () => {
  let receivedContext: unknown;
  const gmailAdapter: MailAdapter = {
    source: "gmail",
    async scan(cursor, context) {
      expect(cursor).toBeNull();
      receivedContext = context;
      return { messages: [], nextCursor: "184100", scannedAt: now };
    },
  };

  await runMailScan({ adapter: gmailAdapter, mode: "approval", now, initialSyncConfirmed: true });

  expect(receivedContext).toEqual({ initialSyncConfirmed: true });
  expect((await updateRepository.getScanState("gmail")).cursor).toBe("184100");
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
  await Promise.all([approveProposal(proposal.id), approveProposal(proposal.id)]);
  expect(await updateRepository.get(proposal.id)).toMatchObject({ status: "approved" });
  expect(await applicationRepository.get("app-1")).toMatchObject({
    stage: "interview", interviewSubtype: "technical",
    deadlines: [{ label: "Technical interview", at: "2026-09-13T06:00:00.000Z" }],
  });
  expect(await jobBuddyDb.stageEvents.count()).toBe(2);
  expect(await jobBuddyDb.deadlines.toArray()).toEqual([expect.objectContaining({ applicationId: "app-1", proposalId: proposal.id, kind: "interview", interviewSubtype: "technical", links: ["https://meet.example/meridian-technical"] })]);
  expect(await jobBuddyDb.activityEntries.toArray()).toEqual([expect.objectContaining({ proposalId: proposal.id, automatic: false, action: "approved" })]);
});

it("rejects explicit approval when the reviewed application version is stale", async () => {
  // Catches a render-time conflict review being committed after another tab updates the selected application.
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  const reviewed = await applicationRepository.get("app-1");
  await applicationRepository.update("app-1", { notes: "Changed in another tab." });

  await expect(updateRepository.approveProposal(proposal.id, { expectedApplicationUpdatedAt: reviewed!.updatedAt }))
    .rejects.toThrow("changed while you were reviewing");
  expect((await updateRepository.get(proposal.id))?.status).toBe("pending");
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
});

it("does not allow explicit approval without a reviewed application version", async () => {
  // Catches an exported manual-approval path that silently bypasses optimistic review protection.
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();

  await expect(updateRepository.approveProposal(proposal.id)).rejects.toThrow("changed while you were reviewing");
  expect((await updateRepository.get(proposal.id))?.status).toBe("pending");
});

it("persists only credential-free HTTPS meeting links in the application deadline read model", async () => {
  // Catches valid meeting links being retained only in normalized records, or unsafe URLs leaking into the embedded read model.
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  await approveProposal(proposal.id, {
    expectedApplicationUpdatedAt: (await applicationRepository.get("app-1"))!.updatedAt,
    links: ["https://meet.example/safe", "http://meet.example/insecure", "https://user:password@meet.example/private"],
  });

  expect((await applicationRepository.get("app-1"))?.deadlines).toEqual([expect.objectContaining({ links: ["https://meet.example/safe"] })]);
  expect(await jobBuddyDb.deadlines.toArray()).toEqual([expect.objectContaining({ links: ["https://meet.example/safe"] })]);
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

it("keeps a distinct older reminder pending after the prior automatic stage event is undone", async () => {
  // Catches undo erasing only the original event, which lets a different older provider message silently reapply it.
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "unrestricted", now });
  const appliedEvent = (await applicationRepository.eventsFor("app-1")).find((event) => event.evidenceId);
  expect(appliedEvent).toBeDefined();
  await applicationRepository.undoEvent(appliedEvent!.id);

  await runMailScan({
    adapter: adapter([{ ...mail, providerMessageId: "older-reminder", receivedAt: "2026-09-11T02:00:00.000Z" }]),
    mode: "unrestricted",
    now: "2026-09-15T09:00:00.000Z",
  });

  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  expect((await updateRepository.listPending())[0].match.conflicts).toContain("manual-correction");
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
  await expect(approveProposal(pending[0].id)).rejects.toThrow("application");
  expect(await jobBuddyDb.activityEntries.count()).toBe(0);
});

it("preserves successful cursor and timestamp after adapter failure and hides raw provider errors", async () => {
  await runMailScan({ adapter: adapter([], "prior"), mode: "approval", now });
  const later = "2026-09-15T00:00:00.000Z";
  const result = await runMailScan({ adapter: { source: "simulated", async scan() { throw new Error("SECRET recruiter@example.test full private body"); } }, mode: "approval", now: later });
  expect(result.error).toBeTruthy();
  const state = await updateRepository.getScanState("simulated");
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
  expect(await updateRepository.getScanState("simulated")).toMatchObject({ cursor: "prior", lastSuccessfulScanAt: now });
  expect(await jobBuddyDb.processedMessages.count()).toBe(0);
  expect(await jobBuddyDb.updateProposals.count()).toBe(0);
  expect(await jobBuddyDb.stageEvents.count()).toBe(1);
  expect(await jobBuddyDb.deadlines.count()).toBe(0);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  await runMailScan({ adapter: adapter(), mode: "unrestricted", now });
  expect((await updateRepository.getScanState("simulated")).cursor).toBe("cursor-1");
  expect(await jobBuddyDb.stageEvents.count()).toBe(2);
  expect(await jobBuddyDb.activityEntries.count()).toBe(1);
});

it("rolls back an explicit approval completely when its activity write fails", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  const failWrite = () => { throw new Error("write failed"); };
  jobBuddyDb.activityEntries.hook("creating", failWrite);
  try { await expect(approveProposal(proposal.id)).rejects.toThrow(); }
  finally { jobBuddyDb.activityEntries.hook("creating").unsubscribe(failWrite); }
  expect((await updateRepository.get(proposal.id))?.status).toBe("pending");
  expect((await applicationRepository.get("app-1"))?.stage).toBe("applied");
  expect(await jobBuddyDb.deadlines.count()).toBe(0);
  expect(await jobBuddyDb.stageEvents.count()).toBe(1);
  await approveProposal(proposal.id);
  expect(await jobBuddyDb.activityEntries.count()).toBe(1);
});

it("allows explicit application/stage/deadline edits at approval and preserves rejected decisions on rescan", async () => {
  await applicationRepository.create(application());
  await runMailScan({ adapter: adapter([fixtureMessages[1], mail]), mode: "approval", now });
  const proposals = await updateRepository.listPending();
  const unmatched = proposals.find((proposal) => proposal.match.applicationId === null)!;
  const matched = proposals.find((proposal) => proposal.match.applicationId === "app-1")!;
  await approveProposal(unmatched.id, { applicationId: "app-1", proposedStage: "assessment", deadlines: [{ id: "corrected", label: "Edited deadline", at: "2026-09-20T00:00:00.000Z", completed: false }] });
  await updateRepository.rejectProposal(matched.id);
  await updateRepository.rejectProposal(matched.id);
  await runMailScan({ adapter: adapter([fixtureMessages[1], mail]), mode: "unrestricted", now });
  expect((await updateRepository.get(matched.id))?.status).toBe("rejected");
  await expect(approveProposal(matched.id)).rejects.toThrow();
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
  await approveProposal(proposal.id);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("interview");
  expect(await jobBuddyDb.activityEntries.count()).toBe(2);
});

it("does not report an idle hook while a second requested scan is still running", async () => {
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const second = new Promise<void>((resolve) => { finishSecond = resolve; });
  let scanNumber = 0;
  const slowAdapter: MailAdapter = { source: "simulated", async scan(cursor) {
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
  expect((await updateRepository.getScanState("simulated")).cursor).toBe("second");
});

it("retries from another tab's committed cursor rather than advancing a stale scan result", async () => {
  await runMailScan({ adapter: { source: "simulated", async scan() {
    await updateRepository.saveScanState("simulated", { cursor: "other-tab", lastSuccessfulScanAt: now });
    return { messages: [mail], nextCursor: "stale", scannedAt: now };
  } }, mode: "approval", now });
  expect((await updateRepository.getScanState("simulated")).cursor).toBe("other-tab");
  expect(await jobBuddyDb.processedMessages.count()).toBe(0);
  expect(await jobBuddyDb.updateProposals.count()).toBe(0);
});

it("makes explicit approval take effect after newer manual history instead of backdating it to the email", async () => {
  await applicationRepository.create(application("final", {
    stageEvents: [{ id: "future-correction", applicationId: "app-1", at: "2099-01-01T00:00:00.000Z", toStage: "final", accepted: true, origin: "manual" }],
  }));
  await runMailScan({ adapter: adapter(), mode: "approval", now });
  const [proposal] = await updateRepository.listPending();
  await approveProposal(proposal.id);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("interview");
  expect(await jobBuddyDb.stageEvents.get("future-correction")).toMatchObject({ accepted: true, toStage: "final" });
});

it("surfaces safe scan failure through the live hook and clears it on successful retry", async () => {
  let fail = true;
  const flakyAdapter: MailAdapter = { source: "simulated", async scan() {
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
  await updateRepository.saveScanState("simulated", { cursor: "prior", lastSuccessfulScanAt: now });
  let queued = false;
  let otherTabWrite: Promise<unknown> | undefined;
  const interleaveWrite = (record: { key: string; value: string }) => {
    if (record?.key === scanStateKey("simulated") && !queued) {
      queued = true;
      // Queue a real competing IndexedDB write exactly between the initial read
      // and attempt persistence. An atomic read/write must serialize this.
      otherTabWrite = Dexie.ignoreTransaction(() => jobBuddyDb.metadata.put({ key: scanStateKey("simulated"), value: JSON.stringify({ cursor: "other-tab", lastSuccessfulScanAt: now }) }));
    }
    return record;
  };
  jobBuddyDb.metadata.hook("reading", interleaveWrite);
  try {
    await runMailScan({ adapter: adapter([], "stale-result"), mode: "approval", now });
    await otherTabWrite;
  } finally { jobBuddyDb.metadata.hook("reading").unsubscribe(interleaveWrite); }
  expect((await updateRepository.getScanState("simulated")).cursor).toBe("other-tab");
});

it("applies the terminal outcome only on explicit approval while retaining the last stage", async () => {
  await applicationRepository.create(application("assessment"));
  await runMailScan({ adapter: adapter([{ ...mail, subject: "Quantitative Analyst application update", excerpt: "We will not be progressing your application." }]), mode: "unrestricted", now });
  const [proposal] = await updateRepository.listPending();
  expect((await applicationRepository.get("app-1"))?.outcome).toBeNull();
  await approveProposal(proposal.id);
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
  await approveProposal(proposal.id, { proposedStage: "assessment" });
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
  await approveProposal(proposal.id, edits);
  expect((await applicationRepository.eventsFor(edits.applicationId ?? "app-1")).find((event) => event.evidenceId === proposal.id)?.origin).toBe("system");
});

it.each<[string, ProposalEdits]>([
  ["explicitly clearing stage", { proposedStage: undefined }],
  ["explicitly clearing outcome", { proposedOutcome: undefined }],
  ["changing outcome", { proposedOutcome: "withdrawn" }],
])("records manual lifecycle provenance when %s", async (_name, edits) => {
  await applicationRepository.create(application());
  await updateRepository.create({
    id: "lifecycle-proposal", status: "pending", mailSource: "simulated", source: { ...mail, subject: "Assessment invitation update", excerpt: "Your application has been rejected after the assessment." },
    match: { applicationId: "app-1", confidence: 1, reasons: ["recruiter"], conflicts: [] },
    classification: {
      proposedStage: "assessment", proposedOutcome: "rejected", confidence: 0.95,
      reasons: ["rejection-language"], evidenceExcerpt: "Application rejected after assessment.",
      deadlines: [], links: [], requiresApproval: true,
    },
    createdAt: now,
  });
  await approveProposal("lifecycle-proposal", edits);
  expect((await applicationRepository.eventsFor("app-1")).find((event) => event.evidenceId === "lifecycle-proposal")?.origin).toBe("manual");
});
