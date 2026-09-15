import { applicationRepository, type PersistedApplication } from "../../db/applicationRepository";
import { jobBuddyDb, type StoredUpdateProposal } from "../../db/database";
import { applicationStages } from "../../domain/stage";
import { createUpdateProposal, type UpdateProposal, type UpdateProposalClassificationInput } from "../../domain/updateProposal";

export interface MailScanState {
  cursor: string | null;
  lastAttemptedScanAt?: string;
  lastSuccessfulScanAt?: string;
  error?: string;
}

export type ProposalEdits = Partial<Pick<UpdateProposalClassificationInput, "proposedStage" | "proposedOutcome" | "interviewSubtype" | "deadlines" | "links">> & {
  applicationId?: string;
};

export const scanStateKey = "mail-scan-state";

export function proposalConflicts(application: PersistedApplication, proposal: Pick<UpdateProposal, "classification" | "source">): string[] {
  const { proposedStage } = proposal.classification;
  const conflicts: string[] = [];
  if (application.outcome) conflicts.push("application-closed");
  if (proposedStage && application.stage && applicationStages.indexOf(proposedStage) <= applicationStages.indexOf(application.stage)) {
    conflicts.push("stage-not-forward");
  }
  if (application.stageEvents.some((event) => event.accepted && event.origin === "manual"
    && (!Number.isFinite(Date.parse(event.at)) || Date.parse(event.at) >= Date.parse(proposal.source.receivedAt))
    && (event.outcome || (event.toStage && event.toStage !== proposedStage)))) {
    conflicts.push("manual-correction");
  }
  return conflicts;
}

export function canAutomaticallyApprove(proposal: UpdateProposal, application: PersistedApplication): boolean {
  return !proposal.classification.requiresApproval && !proposal.classification.proposedOutcome
    && proposal.classification.proposedStage !== "offer"
    && Boolean(proposal.classification.proposedStage || proposal.classification.deadlines.length)
    && proposal.match.confidence >= 0.9 && proposal.classification.confidence >= 0.9
    && proposal.match.conflicts.length === 0 && proposalConflicts(application, proposal).length === 0;
}

export const approvalTables = [jobBuddyDb.updateProposals, jobBuddyDb.applications, jobBuddyDb.stageEvents, jobBuddyDb.deadlines, jobBuddyDb.activityEntries];

async function getScanState(): Promise<MailScanState> {
  const record = await jobBuddyDb.metadata.get(scanStateKey);
  return record ? JSON.parse(record.value) as MailScanState : { cursor: null };
}

async function saveScanState(state: MailScanState): Promise<void> {
  await jobBuddyDb.metadata.put({ key: scanStateKey, value: JSON.stringify(state) });
}

async function create(proposal: UpdateProposal): Promise<void> {
  await jobBuddyDb.updateProposals.add({ ...createUpdateProposal(proposal), state: proposal.status });
}

// Shared by explicit review and scanning. Nested Dexie transactions join the scan
// transaction, so the cursor cannot commit separately from an automatic action.
async function approve(id: string, edits: ProposalEdits, at: string, automatic: boolean): Promise<StoredUpdateProposal> {
  return jobBuddyDb.transaction("rw", approvalTables, async () => {
    const existing = await jobBuddyDb.updateProposals.get(id);
    if (!existing) throw new Error("Update proposal does not exist");
    if (existing.status === "approved") return existing;
    if (existing.status === "rejected") throw new Error("Rejected proposals cannot be approved");
    const { applicationId: editedApplicationId, ...classificationEdits } = edits;
    const applicationId = editedApplicationId ?? existing.match.applicationId;
    if (!applicationId) throw new Error("Choose an application before approving this update");
    const application = await applicationRepository.get(applicationId);
    if (!application) throw new Error("Selected application does not exist");
    if (automatic && !canAutomaticallyApprove(existing, application)) return existing;
    if (application.outcome) throw new Error("This application is closed; correct its history before approving an update");

    const classification = { ...existing.classification, ...classificationEdits };
    const lifecycleCorrected = !automatic && (
      classification.proposedStage !== existing.classification.proposedStage
      || classification.proposedOutcome !== existing.classification.proposedOutcome
    );
    if (!classification.proposedStage && !classification.proposedOutcome && !classification.deadlines.length) {
      throw new Error("The proposal must contain a stage, outcome or deadline");
    }
    if (classification.proposedStage && !applicationStages.includes(classification.proposedStage)) throw new Error("Invalid application stage");
    if (classification.deadlines.some((deadline) => !deadline.id || !deadline.label.trim() || !Number.isFinite(Date.parse(deadline.at)))) {
      throw new Error("Invalid deadline");
    }
    // Review occurs now, not at the historic email timestamp. A later decision
    // must follow accepted history, including a correction made after the email.
    const historyTimes = application.stageEvents.filter((event) => event.accepted).map((event) => Date.parse(event.at));
    if (!Number.isFinite(Date.parse(at)) || historyTimes.some((time) => !Number.isFinite(time))) throw new Error("Invalid history timestamp");
    const eventAt = new Date(Math.max(Date.parse(at), ...historyTimes.map((time) => time + 1))).toISOString();
    if (classification.proposedStage || classification.proposedOutcome) {
      await applicationRepository.appendEvent({
        id: JSON.stringify(["mail-stage", id]), applicationId, at: eventAt,
        fromStage: application.stage ?? undefined, toStage: classification.proposedStage,
        outcome: classification.proposedOutcome, origin: lifecycleCorrected ? "manual" : "system", accepted: true,
        evidenceId: id, confidence: classification.confidence,
        note: automatic ? "Automatically accepted simulated mail update" : "Approved mail update",
      });
    }
    const deadlines = classification.deadlines.map((deadline) => ({
      ...deadline, id: JSON.stringify(["mail-deadline", id, deadline.id]),
      applicationId, proposalId: id,
      kind: classification.proposedStage === "interview" ? "interview" as const : "deadline" as const,
      interviewSubtype: classification.interviewSubtype,
      links: classification.links.filter((link) => { try { return new URL(link).protocol === "https:"; } catch { return false; } }),
    }));
    if (deadlines.length) await jobBuddyDb.deadlines.bulkAdd(deadlines);
    await jobBuddyDb.applications.update(applicationId, {
      deadlines: [...application.deadlines, ...deadlines.map(({ id: deadlineId, label, at: deadlineAt, completed }) => ({ id: deadlineId, label, at: deadlineAt, completed }))],
      ...(classification.interviewSubtype ? { interviewSubtype: classification.interviewSubtype } : {}),
      unreadUpdate: true, updatedAt: at,
    });
    const approved = createUpdateProposal({
      ...existing, status: "approved", reviewedAt: at,
      match: { ...existing.match, applicationId },
      classification: { ...classification, requiresApproval: existing.classification.requiresApproval || !automatic },
    });
    const record: StoredUpdateProposal = { ...approved, state: "approved" };
    await jobBuddyDb.updateProposals.put(record);
    await jobBuddyDb.activityEntries.add({
      id: JSON.stringify(["mail-action", id, "approved"]), proposalId: id, applicationId,
      at, action: "approved", automatic,
    });
    return record;
  });
}

async function setReviewStatus(id: string, status: "rejected" | "deferred"): Promise<void> {
  await jobBuddyDb.transaction("rw", jobBuddyDb.updateProposals, jobBuddyDb.activityEntries, async () => {
    const proposal = await jobBuddyDb.updateProposals.get(id);
    if (!proposal) throw new Error("Update proposal does not exist");
    if (proposal.status === status) return;
    if (proposal.status === "approved" || proposal.status === "rejected") throw new Error("Reviewed proposals cannot be changed");
    const at = new Date().toISOString();
    await jobBuddyDb.updateProposals.update(id, { status, state: status, reviewedAt: at });
    await jobBuddyDb.activityEntries.add({ id: JSON.stringify(["mail-action", id, status]), proposalId: id, applicationId: proposal.match.applicationId, at, action: status, automatic: false });
  });
}

export const updateRepository = {
  getScanState, saveScanState, create,
  get: (id: string) => jobBuddyDb.updateProposals.get(id),
  list: () => jobBuddyDb.updateProposals.toArray(),
  listPending: () => jobBuddyDb.updateProposals.where("state").equals("pending").toArray(),
  approveProposal: (id: string, edits: ProposalEdits = {}) => approve(id, edits, new Date().toISOString(), false),
  autoApproveProposal: (id: string, at: string) => approve(id, {}, at, true),
  rejectProposal: (id: string) => setReviewStatus(id, "rejected"),
  deferProposal: (id: string) => setReviewStatus(id, "deferred"),
};
