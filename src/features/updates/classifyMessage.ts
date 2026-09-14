import type { Deadline } from "../../domain/application";
import type { ApplicationOutcome, ApplicationStage } from "../../domain/stage";
import type { UpdateProposalClassification } from "../../domain/updateProposal";
import type { MailEnvelope } from "../../integrations/mail/MailAdapter";

export type MessageClassification = UpdateProposalClassification;

type StageSignal = {
  stage: ApplicationStage;
  reason: string;
  confidence: number;
  matches: (text: string) => boolean;
};

const stageSignals: readonly StageSignal[] = [
  {
    stage: "offer",
    reason: "offer-language",
    confidence: 0.95,
    matches: (text) => /\b(?:pleased to )?offer(?: you)?\b/i.test(text),
  },
  {
    stage: "assessment",
    reason: "numerical-assessment-deadline",
    confidence: 0.9,
    matches: (text) => /\bnumerical assessment\b[\s\S]{0,100}\b(?:by|deadline)\b/i.test(text),
  },
  {
    stage: "assessment",
    reason: "assessment-invitation",
    confidence: 0.85,
    matches: (text) => /\b(?:online |numerical )?assessment\b[\s\S]{0,100}\b(?:invitation|invite|complete|by|deadline)\b/i.test(text),
  },
  {
    stage: "interview",
    reason: "technical-interview-invitation",
    confidence: 0.95,
    matches: (text) => /\b(?:invite|invitation)\b[\s\S]{0,100}\btechnical interview\b|\btechnical interview\b[\s\S]{0,100}\b(?:invite|invitation)\b/i.test(text),
  },
  {
    stage: "interview",
    reason: "interview-invitation",
    confidence: 0.9,
    matches: (text) => /\b(?:invite|invitation)\b[\s\S]{0,100}\binterview\b|\binterview\b[\s\S]{0,100}\b(?:invite|invitation|scheduled)\b/i.test(text),
  },
  {
    stage: "review",
    reason: "under-review-language",
    confidence: 0.8,
    matches: (text) => /\b(?:application|applications|candidacy|roles?)\b[\s\S]{0,120}\b(?:is|are|remain) under review\b/i.test(text),
  },
];

const terminalSignals: readonly { outcome: ApplicationOutcome; reason: string; matches: (text: string) => boolean }[] = [
  { outcome: "rejected", reason: "rejection-language", matches: (text) => /\b(?:will not be progressing|not progressing|application (?:has been )?rejected)\b/i.test(text) },
  { outcome: "withdrawn", reason: "withdrawal-language", matches: (text) => /\b(?:application (?:has been )?withdrawn|withdrawal)\b/i.test(text) },
];

function sentences(value: string): string[] {
  return value.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

function sentenceEvidence(message: MailEnvelope, matcher: (text: string) => boolean): string {
  return sentences(message.excerpt).find(matcher) ?? (message.excerpt.trim() || message.subject.trim());
}

function validHttpsLinks(links: readonly string[]): string[] {
  return links.filter((link) => {
    try {
      return new URL(link).protocol === "https:";
    } catch {
      return false;
    }
  });
}

interface TimeExtraction {
  deadline?: Deadline;
  unknownTimezone: boolean;
}

function extractTime(message: MailEnvelope, label: string, suffix: string): TimeExtraction {
  const text = `${message.subject}\n${message.excerpt}`;
  const dateTime = /\b(\d{4})-(\d{2})-(\d{2})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s+([A-Za-z]{2,4})\b)?/i.exec(text);
  if (!dateTime) return { unknownTimezone: false };

  const [, yearText, monthText, dayText, hourText, minuteText, meridiem, timezone] = dateTime;
  if (!timezone || !/^(SGT|HKT)$/i.test(timezone)) return { unknownTimezone: true };

  const hour = Number(hourText) % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  const at = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), hour - 8, Number(minuteText)));
  if (Number.isNaN(at.getTime())) return { unknownTimezone: true };

  return {
    deadline: {
      id: `${message.providerMessageId}-${suffix}`,
      label,
      at: at.toISOString(),
      completed: false,
    },
    unknownTimezone: false,
  };
}

function stageMentions(text: string): Set<ApplicationStage> {
  const mentions = new Set<ApplicationStage>();
  if (/\binterview\b/i.test(text)) mentions.add("interview");
  if (/\b(?:application|applications|candidacy|roles?)\b[\s\S]{0,120}\b(?:is|are|remain) under review\b/i.test(text)) mentions.add("review");
  if (/\b(?:online |numerical )?assessment\b/i.test(text)) mentions.add("assessment");
  if (/\boffer\b/i.test(text)) mentions.add("offer");
  return mentions;
}

function interviewSubtype(text: string): MessageClassification["interviewSubtype"] | undefined {
  for (const subtype of ["technical", "phone", "video", "case", "onsite", "final"] as const) {
    if (new RegExp(`\\b${subtype} interview\\b`, "i").test(text)) return subtype;
  }
  return undefined;
}

export function classifyMessage(message: MailEnvelope): MessageClassification | null {
  const text = `${message.subject}\n${message.excerpt}`;
  const terminal = terminalSignals.find((signal) => signal.matches(text));
  const stageSignal = stageSignals.find((signal) => signal.matches(text));
  const mentionedStages = stageMentions(text);
  const contradictory = mentionedStages.size > 1;

  if (!terminal && !stageSignal) return null;

  const proposedStage = contradictory && mentionedStages.has("review") ? "review" : stageSignal?.stage;
  const selectedSignal = stageSignals.find((signal) => signal.stage === proposedStage && signal.matches(text)) ?? stageSignal;
  const isOffer = proposedStage === "offer";
  const requiresApproval = Boolean(terminal || isOffer || contradictory);
  const subtype = proposedStage === "interview" ? interviewSubtype(text) : undefined;
  const label = proposedStage === "interview" ? `${subtype ? `${subtype[0].toUpperCase()}${subtype.slice(1)} ` : ""}interview` : proposedStage === "assessment" ? (selectedSignal?.reason === "numerical-assessment-deadline" ? "Numerical assessment deadline" : "Assessment") : "Application update";
  const time = extractTime(message, label, proposedStage === "assessment" ? "deadline" : "scheduled-time");
  const links = validHttpsLinks(message.links);
  const reasons = [terminal?.reason ?? selectedSignal?.reason];
  if (contradictory) reasons.push("contradictory-stage-language");
  if (time.deadline) reasons.push("scheduled-time");
  if (links.length > 0) reasons.push("https-link");
  if (time.unknownTimezone) reasons.push("unknown-timezone");

  const classification = {
    ...(proposedStage ? { proposedStage } : {}),
    ...(subtype ? { interviewSubtype: subtype } : {}),
    confidence: terminal ? 0.95 : selectedSignal?.confidence ?? 0.8,
    reasons: reasons.filter((reason): reason is string => Boolean(reason)),
    evidenceExcerpt: sentenceEvidence(message, (value) => terminal?.matches(value) || selectedSignal?.matches(value) || /\bunder review\b/i.test(value)),
    deadlines: time.deadline ? [time.deadline] : [],
    links,
  };

  if (requiresApproval) {
    return { ...classification, ...(terminal ? { proposedOutcome: terminal.outcome } : {}), requiresApproval: true };
  }

  return { ...classification, requiresApproval: false };
}
