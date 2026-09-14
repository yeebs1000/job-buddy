import { describe, expect, it } from "vitest";
import { createUpdateProposal, type UpdateProposalInput } from "./updateProposal";

const input = (): UpdateProposalInput => ({
  id: "proposal-1",
  status: "pending",
  source: {
    providerMessageId: "mail-1",
    fromAddress: "recruiting@example.test",
    subject: "Application update",
    receivedAt: "2026-09-12T09:00:00.000Z",
    excerpt: "A short synthetic evidence excerpt.",
    links: [],
  },
  match: { applicationId: "application-1", confidence: 0.95, reasons: ["company"], conflicts: [] },
  classification: {
    confidence: 0.95,
    reasons: ["rejection-language"],
    evidenceExcerpt: "We will not be progressing your application.",
    proposedOutcome: "rejected",
    deadlines: [],
    links: [],
    requiresApproval: false,
  },
  createdAt: "2026-09-12T09:00:00.000Z",
});

describe("createUpdateProposal", () => {
  it("rejects a terminal outcome marked as not requiring approval", () => {
    // Catches a contract branch that lets a rejection bypass the required review queue.
    expect(() => createUpdateProposal(input())).toThrow("Terminal outcomes require approval");
  });

  it("rejects a conflicting match marked as not requiring approval", () => {
    // Catches a contract branch that lets an ambiguous application match bypass user review.
    const proposal = input();
    proposal.match.conflicts = ["role"];
    proposal.classification.proposedOutcome = undefined;

    expect(() => createUpdateProposal(proposal)).toThrow("Conflicting matches require approval");
  });
});
