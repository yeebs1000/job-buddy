import type { UpdateProposal } from "../../domain/updateProposal";
import { classifyMessage } from "./classifyMessage";
import { mailFilterReason } from "./mailRelevance";

// Re-evaluate saved, unreviewed evidence without mutating history or deleting it.
export function proposalFilterReason(proposal: UpdateProposal): string | null {
  if (proposal.status === "approved" || proposal.status === "rejected" || proposal.relevanceOverride === "manual-review") return null;
  const reason = mailFilterReason(proposal.source);
  if (reason) return reason;
  const current = classifyMessage(proposal.source);
  if (!current) return "No candidate-specific recruiting update found in the saved subject and message.";
  if (current.proposedStage !== proposal.classification.proposedStage || current.proposedOutcome !== proposal.classification.proposedOutcome) {
    return "The earlier interpretation no longer matches the current rules. Restore only for manual review.";
  }
  return null;
}
