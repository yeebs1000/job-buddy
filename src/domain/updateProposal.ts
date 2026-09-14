import type { Deadline } from "./application";
import type { ApplicationOutcome, ApplicationStage } from "./stage";

export type UpdateProposalStatus = "pending" | "approved" | "rejected" | "deferred";

export interface UpdateProposalSource {
  providerMessageId: string;
  threadId?: string;
  fromName?: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  excerpt: string;
  links: string[];
}

export interface UpdateProposalMatch {
  applicationId: string | null;
  confidence: number;
  reasons: string[];
  conflicts: string[];
}

export interface UpdateProposalClassification {
  confidence: number;
  reasons: string[];
  evidenceExcerpt: string;
  proposedStage?: ApplicationStage;
  proposedOutcome?: ApplicationOutcome;
  interviewSubtype?: "phone" | "video" | "technical" | "case" | "onsite" | "final";
  deadlines: Deadline[];
  links: string[];
  requiresApproval: boolean;
}

export interface UpdateProposal {
  id: string;
  status: UpdateProposalStatus;
  source: UpdateProposalSource;
  match: UpdateProposalMatch;
  classification: UpdateProposalClassification;
  createdAt: string;
  reviewedAt?: string;
}
