import type { Application } from "../../domain/application";
import type { MailEnvelope } from "../../integrations/mail/MailAdapter";

export interface ApplicationMatch {
  applicationId: string | null;
  confidence: number;
  reasons: string[];
  conflicts: string[];
}

const legalSuffixes = new Set(["ag", "bv", "co", "company", "corp", "corporation", "gmbh", "inc", "incorporated", "limited", "llc", "ltd", "plc", "pte", "pty", "sarl"]);
const titleKeywords = new Set(["analyst", "architect", "associate", "consultant", "designer", "developer", "director", "engineer", "intern", "manager", "researcher", "scientist", "specialist"]);
const minimumConfidence = 0.75;
const requiredMargin = 0.15;

function words(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function companyTokens(company: string): string[] {
  const tokens = words(company);
  while (legalSuffixes.has(tokens.at(-1) ?? "")) tokens.pop();
  return tokens;
}

function normalizedIdentity(value: string): string {
  return words(value).join("");
}

function senderDomain(address: string): string {
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  return domain.split(".")[0].replace(/[^\p{L}\p{N}]+/gu, "");
}

function matchesRecruiter(application: Application, message: MailEnvelope): boolean {
  if (!application.recruiter) return false;

  const recruiter = normalizedIdentity(application.recruiter);
  if (!recruiter) return false;

  return [message.fromName, message.fromAddress]
    .filter((identity): identity is string => Boolean(identity))
    .some((identity) => normalizedIdentity(identity) === recruiter);
}

interface CandidateMatch {
  applicationId: string;
  confidence: number;
  reasons: string[];
  roleMismatch: boolean;
}

function explicitRoleTokens(message: MailEnvelope): Set<string> {
  const titles: string[] = [];
  const subjectTitle = /[—–]\s*([^.!?]{2,80})$/.exec(message.subject)?.[1];
  if (subjectTitle && words(subjectTitle).some((token) => titleKeywords.has(token))) titles.push(subjectTitle);
  for (const text of [message.subject, message.excerpt]) {
    for (const match of text.matchAll(/\b(?:for|regarding)\s+(?:the\s+)?([^.!?]{2,80}?)\s+(?:role|position)\b/gi)) titles.push(match[1]);
    for (const match of text.matchAll(/\b(?:role|job title)\s*:\s*([^.!?\n]{2,80})/gi)) titles.push(match[1]);
  }
  return new Set(words(titles.join(" ")));
}

function score(message: MailEnvelope, application: Application): CandidateMatch {
  const contentTokens = new Set(words([message.fromName, message.subject, message.excerpt].filter(Boolean).join(" ")));
  const company = companyTokens(application.company);
  const companyIdentity = company.join("");
  const role = words(application.role);
  const namedRole = explicitRoleTokens(message);
  const reasons: string[] = [];
  let confidence = 0;

  if (matchesRecruiter(application, message)) {
    confidence += 0.45;
    reasons.push("recruiter");
  }
  if (companyIdentity !== "" && senderDomain(message.fromAddress) === companyIdentity) {
    confidence += 0.25;
    reasons.push("sender-domain");
  }
  if (company.length > 0 && company.every((token) => contentTokens.has(token))) {
    confidence += 0.2;
    reasons.push("company");
  }
  if (role.length > 0 && role.every((token) => contentTokens.has(token))) {
    confidence += 0.1;
    reasons.push("role");
  }

  return {
    applicationId: application.id,
    confidence: Number(confidence.toFixed(2)),
    reasons,
    roleMismatch: namedRole.size > 0 && !role.some((token) => namedRole.has(token)),
  };
}

export function matchApplication(message: MailEnvelope, applications: readonly Application[]): ApplicationMatch {
  const candidates = applications.map((application) => score(message, application)).sort((left, right) => right.confidence - left.confidence);
  const compatibleCandidates = candidates.filter((candidate) => !candidate.roleMismatch);
  const best = compatibleCandidates[0];
  if (!best && candidates[0]?.roleMismatch) {
    return { applicationId: null, confidence: candidates[0].confidence, reasons: candidates[0].reasons, conflicts: ["role-mismatch"] };
  }
  if (!best) return { applicationId: null, confidence: 0, reasons: [], conflicts: [] };

  const nextBest = compatibleCandidates[1];
  const ambiguous = best.confidence >= minimumConfidence && nextBest !== undefined && best.confidence - nextBest.confidence < requiredMargin;
  if (best.confidence < minimumConfidence || ambiguous) {
    return { applicationId: null, confidence: best.confidence, reasons: best.reasons, conflicts: ambiguous ? ["ambiguous"] : [] };
  }

  return { applicationId: best.applicationId, confidence: best.confidence, reasons: best.reasons, conflicts: [] };
}
