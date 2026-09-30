import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { createUpdateProposal } from "../../domain/updateProposal";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import { GmailScanError } from "../../integrations/mail/gmailScanErrors";
import { classifyMessage } from "./classifyMessage";
import { matchApplication } from "./matchApplication";
import { approvalTables, proposalConflicts, updateRepository, type MailScanState } from "./updateRepository";

export type MailScanMode = "approval" | "unrestricted";
export interface RunMailScanOptions {
  adapter: MailAdapter;
  mode: MailScanMode;
  now?: string;
  initialSyncConfirmed?: boolean;
  recheck?: boolean;
}

const safeFailure = "Mail scan could not be completed. Please try again.";
let scanQueue: Promise<unknown> = Promise.resolve();

async function scan({ adapter, mode, now = new Date().toISOString(), initialSyncConfirmed = false, recheck = false }: RunMailScanOptions): Promise<MailScanState> {
  const source = adapter.source;
  const attemptId = crypto.randomUUID();
  let prior: MailScanState = { cursor: null };
  let savingBatch = true;
  try {
    prior = await jobBuddyDb.transaction("rw", jobBuddyDb.metadata, async () => {
      const state = await updateRepository.getScanState(source);
      prior = state;
      const attempted = { ...state, error: undefined, errorCode: undefined, ...(recheck ? { rechecking: true as const, continuationToken: undefined, progress: undefined } : {}), attemptId, lastAttemptedScanAt: now };
      await updateRepository.saveScanState(source, attempted);
      return attempted;
    });
    savingBatch = false;
    for (;;) {
      const result = await adapter.scan(prior.rechecking ? null : prior.cursor, { initialSyncConfirmed: initialSyncConfirmed || Boolean(prior.rechecking), ...(prior.continuationToken ? { continuationToken: prior.continuationToken } : {}) });
      if (result.continuationToken && (!result.progress || result.progress.processed <= (prior.continuationToken ? prior.progress?.processed ?? 0 : 0)
        || result.continuationToken === prior.continuationToken)) throw new GmailScanError("gmail-response-invalid");
      savingBatch = true;
      const saved = await jobBuddyDb.transaction("rw", [...approvalTables, jobBuddyDb.processedMessages, jobBuddyDb.metadata], async () => {
        // Another tab may have committed while the adapter was reading. Retry from
        // that cursor instead of committing an older page over its progress.
        const current = await updateRepository.getScanState(source);
        if (current.attemptId !== attemptId || current.cursor !== prior.cursor || current.continuationToken !== prior.continuationToken) throw new GmailScanError("gmail-scan-superseded");
        for (const message of result.messages) {
          const processed = await jobBuddyDb.processedMessages.get(message.providerMessageId);
          if (processed && (!prior.rechecking || processed.proposalId)) continue;
          // Preserve all existing evidence and review decisions, even if a legacy
          // processed-message record is missing its proposal pointer.
          if (await jobBuddyDb.updateProposals.get(JSON.stringify(["mail-proposal", message.providerMessageId]))) continue;
          const classification = classifyMessage(message);
          let proposalId: string | undefined;
          if (classification) {
            const applications = await applicationRepository.list();
            const match = matchApplication(message, applications);
            const application = applications.find((candidate) => candidate.id === match.applicationId);
            if (!match.applicationId) match.reasons.push(match.conflicts.includes("ambiguous") ? "ambiguous-match" : "unmatched");
            if (application) match.conflicts.push(...proposalConflicts(application, { classification, source: message }));
            proposalId = JSON.stringify(["mail-proposal", message.providerMessageId]);
            const proposal = createUpdateProposal({
              id: proposalId, status: "pending", mailSource: source, source: message, match, createdAt: now,
              classification: { ...classification, requiresApproval: Boolean(prior.rechecking) || classification.requiresApproval || !match.applicationId || match.conflicts.length > 0 },
            });
            await updateRepository.create(proposal);
            if (mode === "unrestricted" && !prior.rechecking && application) await updateRepository.autoApproveProposal(proposalId, now);
          }
          const record = { id: message.providerMessageId, processedAt: now, proposalId };
          if (processed) await jobBuddyDb.processedMessages.put(record);
          else await jobBuddyDb.processedMessages.add(record);
        }
        const state: MailScanState = {
          attemptId,
          cursor: result.continuationToken || prior.rechecking ? prior.cursor ?? (result.continuationToken ? null : result.nextCursor) : result.nextCursor,
          lastAttemptedScanAt: now,
          ...(result.continuationToken ? { lastSuccessfulScanAt: prior.lastSuccessfulScanAt, continuationToken: result.continuationToken } : { lastSuccessfulScanAt: now }),
          ...(result.progress ? { progress: result.progress } : {}),
          ...(result.continuationToken && prior.rechecking ? { rechecking: true } : {}),
          ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
        };
        await updateRepository.saveScanState(source, state);
        return state;
      });
      savingBatch = false;
      if (!saved.continuationToken) return saved;
      prior = saved;
    }
  } catch (error) {
    // Read current state so failure in another tab never rolls its successful
    // cursor back. Provider content and raw errors must not reach persisted UI.
    const safeGmailError = source === "gmail" ? error instanceof GmailScanError ? error : savingBatch ? new GmailScanError("gmail-local-save-failed") : undefined : undefined;
    const failure = { lastAttemptedScanAt: now, error: safeGmailError?.message ?? safeFailure, errorCode: safeGmailError?.code };
    return jobBuddyDb.transaction("rw", jobBuddyDb.metadata, async () => {
      const current = await updateRepository.getScanState(source);
      // A reconnect or a newer tab owns this state now. Do not write our failure over it.
      if (current.attemptId !== attemptId) return { ...current, ...failure };
      const state = { ...current, ...failure };
      if (safeGmailError?.code === "gmail-scan-expired") { delete state.continuationToken; delete state.progress; }
      await updateRepository.saveScanState(source, state);
      return state;
    }).catch(() => ({ ...prior, ...failure }));
  }
}

export function runMailScan(options: RunMailScanOptions): Promise<MailScanState> {
  const result = scanQueue.then(() => scan(options));
  scanQueue = result.catch(() => undefined);
  return result;
}
