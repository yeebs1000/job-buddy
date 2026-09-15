import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { createUpdateProposal } from "../../domain/updateProposal";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import { classifyMessage } from "./classifyMessage";
import { matchApplication } from "./matchApplication";
import { approvalTables, proposalConflicts, updateRepository, type MailScanState } from "./updateRepository";

export type MailScanMode = "approval" | "unrestricted";
export interface RunMailScanOptions {
  adapter: MailAdapter;
  mode: MailScanMode;
  now?: string;
}

const safeFailure = "Mail scan could not be completed. Please try again.";
let scanQueue: Promise<unknown> = Promise.resolve();

async function scan({ adapter, mode, now = new Date().toISOString() }: RunMailScanOptions): Promise<MailScanState> {
  const source = adapter.source;
  const prior = await jobBuddyDb.transaction("rw", jobBuddyDb.metadata, async () => {
    const state = await updateRepository.getScanState(source);
    await updateRepository.saveScanState(source, { ...state, lastAttemptedScanAt: now });
    return state;
  });
  try {
    const result = await adapter.scan(prior.cursor);
    return await jobBuddyDb.transaction("rw", [...approvalTables, jobBuddyDb.processedMessages, jobBuddyDb.metadata], async () => {
      // Another tab may have committed while the adapter was reading. Retry from
      // that cursor instead of committing an older page over its progress.
      if ((await updateRepository.getScanState(source)).cursor !== prior.cursor) throw new Error("Scan cursor changed");
      for (const message of result.messages) {
        if (await jobBuddyDb.processedMessages.get(message.providerMessageId)) continue;
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
            classification: { ...classification, requiresApproval: classification.requiresApproval || !match.applicationId || match.conflicts.length > 0 },
          });
          await updateRepository.create(proposal);
          if (mode === "unrestricted" && application) await updateRepository.autoApproveProposal(proposalId, now);
        }
        await jobBuddyDb.processedMessages.add({ id: message.providerMessageId, processedAt: now, proposalId });
      }
      const state: MailScanState = {
        cursor: result.nextCursor,
        lastAttemptedScanAt: now,
        lastSuccessfulScanAt: now,
        ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
      };
      await updateRepository.saveScanState(source, state);
      return state;
    });
  } catch {
    // Read current state so failure in another tab never rolls its successful
    // cursor back. Provider content and raw errors must not reach persisted UI.
    return jobBuddyDb.transaction("rw", jobBuddyDb.metadata, async () => {
      const current = await updateRepository.getScanState(source);
      const state = { ...current, lastAttemptedScanAt: now, error: safeFailure };
      await updateRepository.saveScanState(source, state);
      return state;
    });
  }
}

export function runMailScan(options: RunMailScanOptions): Promise<MailScanState> {
  const result = scanQueue.then(() => scan(options));
  scanQueue = result.catch(() => undefined);
  return result;
}
