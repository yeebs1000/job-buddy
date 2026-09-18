import type { Deadline } from "./application";
import type { MailSource } from "./mail";
import type { ApplicationOutcome, ApplicationStage } from "./stage";
import type { MailEnvelope } from "../integrations/mail/MailAdapter";

export type UpdateProposalStatus = "pending" | "approved" | "rejected" | "deferred";

export interface UpdateProposalSource {
  forwarded?: MailEnvelope["forwarded"];
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
  originalInference?: Pick<UpdateProposalMatch, "applicationId" | "confidence" | "reasons">;
}

type UnconflictedUpdateProposalMatch = Omit<UpdateProposalMatch, "conflicts"> & { conflicts: [] };

interface UpdateProposalClassificationFields {
  kind?: "recruiter-outreach";
  confidence: number;
  reasons: string[];
  evidenceExcerpt: string;
  proposedStage?: ApplicationStage;
  interviewSubtype?: "phone" | "video" | "technical" | "case" | "onsite" | "final";
  deadlines: Deadline[];
  links: string[];
}

export type ApprovalRequiredUpdateProposalClassification = UpdateProposalClassificationFields & {
  proposedOutcome?: ApplicationOutcome;
  requiresApproval: true;
};

export type AutoApplicableUpdateProposalClassification = UpdateProposalClassificationFields & {
  proposedOutcome?: never;
  requiresApproval: false;
};

export type UpdateProposalClassification = ApprovalRequiredUpdateProposalClassification | AutoApplicableUpdateProposalClassification;

export interface UpdateProposalClassificationInput extends UpdateProposalClassificationFields {
  proposedOutcome?: ApplicationOutcome;
  requiresApproval: boolean;
}

interface UpdateProposalFields<TClassification> {
  id: string;
  status: UpdateProposalStatus;
  mailSource: MailSource;
  source: UpdateProposalSource;
  match: UpdateProposalMatch;
  classification: TClassification;
  createdAt: string;
  reviewedAt?: string;
  relevanceOverride?: "manual-review";
}

export type UpdateProposal =
  | (UpdateProposalFields<AutoApplicableUpdateProposalClassification> & { match: UnconflictedUpdateProposalMatch })
  | UpdateProposalFields<ApprovalRequiredUpdateProposalClassification>;
export type UpdateProposalInput = UpdateProposalFields<UpdateProposalClassificationInput>;

export function createUpdateProposal(input: UpdateProposalInput): UpdateProposal {
  const { classification } = input;
  if (classification.requiresApproval) {
    return { ...input, classification: { ...classification, requiresApproval: true } };
  }

  if (classification.proposedOutcome) {
    throw new Error("Terminal outcomes require approval");
  }

  if (input.match.conflicts.length > 0) {
    throw new Error("Conflicting matches require approval");
  }

  const { proposedOutcome: _, ...nonTerminalClassification } = classification;
  return {
    ...input,
    match: { ...input.match, conflicts: [] },
    classification: { ...nonTerminalClassification, requiresApproval: false },
  };
}
