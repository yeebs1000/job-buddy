import type { Deadline } from "../../domain/application";
import type { ApplicationOutcome, ApplicationStage } from "../../domain/stage";
import type { UpdateProposalClassification } from "../../domain/updateProposal";
import type { MailEnvelope } from "../../integrations/mail/MailAdapter";
import { employmentOffer, mailFilterReason, recruiterOutreach, recruitingInvitation } from "./mailRelevance";

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
    matches: employmentOffer,
  },
  {
    stage: "assessment",
    reason: "numerical-assessment-deadline",
    confidence: 0.9,
    matches: (text) => /\bnumerical assessment\b.{0,100}\b(?:by|deadline)\b/i.test(text),
  },
  {
    stage: "assessment",
    reason: "assessment-invitation",
    confidence: 0.85,
    matches: (text) => /\b(?:online |numerical )?assessment\b.{0,100}\b(?:invitation|invite|complete|by|deadline)\b/i.test(text),
  },
  {
    stage: "interview",
    reason: "technical-interview-invitation",
    confidence: 0.95,
    matches: (text) => /\b(?:invite|invitation)\b.{0,100}\btechnical interview\b|\btechnical interview\b.{0,100}\b(?:invite|invitation)\b/i.test(text),
  },
  {
    stage: "interview",
    reason: "interview-invitation",
    confidence: 0.9,
    matches: (text) => /\b(?:invite|invitation)\b.{0,100}\binterview\b|\binterview\b.{0,100}\b(?:invite|invitation|scheduled)\b/i.test(text),
  },
  {
    stage: "review",
    reason: "under-review-language",
    confidence: 0.8,
    matches: (text) => /\b(?:application|applications|candidacy|roles?)\b.{0,120}\b(?:is|are|remain) under review\b/i.test(text),
  },
  {
    stage: "applied",
    reason: "application-confirmation",
    confidence: 0.9,
    matches: applicationConfirmation,
  },
];

function applicationConfirmation(text: string): boolean {
  if (/\b(?:not|never|yet to|haven't|hasn't|isn't|wasn't)\b.{0,45}\b(?:receiv|submit)/i.test(text)) return false;
  // Match the type being applied for, not an employer (Visa) or role (Credit Card Analyst).
  if (/\b(?:application|applying)\s+for\s+(?:(?:a|an|the|your)\s+)?(?:loan|mortgage|credit card|visa|admission|scholarship|grant|membership|rental)(?=\s*(?:[.!?,;:]|$)|\s+(?:at|with|to|from)\b)|\b(?:loan|mortgage|credit card|visa|admission|scholarship|grant|membership|rental)\s+application\b/i.test(text)) return false;
  // Acknowledges submitted details, not a promise that review has already begun.
  if (/\bwe will give (?:careful )?consideration to your application by reviewing the details you provided against the (?:position|role|job) criteria\b/i.test(text)) return true;
  return /\bthank(?:s| you) for applying\b.{1,160}\bat\b|\bthank(?:s| you) for taking the time to apply\b.{0,160}\b(?:position|role|job)\b|\b(?:we have |we've |we )?received your (?:job |employment )?application\b|\byour (?:job |employment )?application (?:has been |was |is )?(?:received|submitted successfully)\b/i.test(text);
}

const terminalSignals: readonly { outcome: ApplicationOutcome; reason: string; matches: (text: string) => boolean }[] = [
  { outcome: "rejected", reason: "rejection-language", matches: (text) => /\b(?:will not be progressing|not progressing|application (?:has been )?rejected)\b|\byou (?:were not|have not been|were not being) selected\b.{0,100}\b(?:next stage|position|role|job)\b|\bnot (?:to |be )?(?:proceed|proceeding|moving forward) with your (?:application|candidacy)\b/i.test(text) },
  { outcome: "withdrawn", reason: "withdrawal-language", matches: (text) => /\b(?:application (?:has been )?withdrawn|withdrawal of your application|your application withdrawal)\b/i.test(text) },
];

const negativeInvitationSignals: readonly { reason: string; matches: (text: string) => boolean }[] = [
  { reason: "interview-cancellation", matches: (text) => /\b(?:interview|assessment)\b.{0,80}\b(?:cancelled|canceled)\b|\b(?:cancelled|canceled)\b.{0,80}\b(?:interview|assessment)\b/i.test(text) },
  { reason: "not-invited-language", matches: (text) => /\bnot(?:\s+been)? invited\b.{0,80}\b(?:interview|assessment)\b|\b(?:interview|assessment)\b.{0,80}\bnot(?:\s+been)? invited\b/i.test(text) },
];

function sentences(value: string): string[] {
  return value.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

interface MessageSentence {
  text: string;
  source: "excerpt" | "subject";
  index: number;
}

function messageSentences(message: MailEnvelope): MessageSentence[] {
  const excerptSentences = sentences(message.excerpt).map((text, index) => ({ text, source: "excerpt" as const, index }));
  const subject = (message.forwarded?.subject || message.subject).trim();
  return subject ? [...excerptSentences, { text: subject, source: "subject", index: 0 }] : excerptSentences;
}

function negatesInvitation(sentence: string): boolean {
  return /\b(?:cannot|can't|unable to|will not|won't|do not|don't|not able to)\b.{0,60}\binvit(?:e|ation)\b/i.test(sentence);
}

interface SignalMatch<T> {
  signal: T;
  evidenceExcerpt: string;
  context: MessageSentence;
}

function findSignal<T extends { matches: (text: string) => boolean }>(signals: readonly T[], contexts: readonly MessageSentence[], allow: (context: MessageSentence) => boolean = () => true): SignalMatch<T> | undefined {
  for (const signal of signals) {
    const context = contexts.find((candidate) => allow(candidate) && signal.matches(candidate.text));
    if (context) return { signal, evidenceExcerpt: context.text, context };
  }
  return undefined;
}

function negatesStageInvitation(context: MessageSentence, stage: ApplicationStage): boolean {
  const stageWord = stage === "interview" ? /\binterview\b/i : stage === "assessment" ? /\bassessment\b/i : undefined;
  return Boolean(stageWord && negatesInvitation(context.text) && stageWord.test(context.text));
}

function findStageSignal(signals: readonly StageSignal[], contexts: readonly MessageSentence[]): SignalMatch<StageSignal> | undefined {
  for (const signal of signals) {
    if (contexts.some((context) => negatesStageInvitation(context, signal.stage))) continue;
    const match = findSignal([signal], contexts, context => !["interview", "assessment"].includes(signal.stage) || recruitingInvitation(context.text));
    if (match) return match;
  }
  return undefined;
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
  invalidDate: boolean;
}

function extractTime(text: string, messageId: string, label: string, suffix: string): TimeExtraction {
  const dateTime = /\b(\d{4})-(\d{2})-(\d{2})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s+([A-Za-z]{2,4})\b)?/i.exec(text);
  if (!dateTime) return { unknownTimezone: false, invalidDate: false };

  const [, yearText, monthText, dayText, hourText, minuteText, meridiem, timezone] = dateTime;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour12 = Number(hourText);
  const minute = Number(minuteText);
  const hour = hour12 % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  const localTime = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const invalidDate = month < 1 || month > 12 || day < 1 || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59
    || Number.isNaN(localTime.getTime()) || localTime.getUTCFullYear() !== year || localTime.getUTCMonth() !== month - 1 || localTime.getUTCDate() !== day;
  if (invalidDate) return { unknownTimezone: !timezone || !/^(SGT|HKT)$/i.test(timezone), invalidDate: true };
  if (!timezone || !/^(SGT|HKT)$/i.test(timezone)) return { unknownTimezone: true, invalidDate: false };

  const at = new Date(localTime.getTime() - 8 * 60 * 60 * 1000);

  return {
    deadline: {
      id: `${messageId}-${suffix}`,
      label,
      at: at.toISOString(),
      completed: false,
    },
    unknownTimezone: false,
    invalidDate: false,
  };
}

function stageMentions(contexts: readonly MessageSentence[]): Set<ApplicationStage> {
  const mentions = new Set<ApplicationStage>();
  for (const context of contexts) {
    if (/\binterview\b/i.test(context.text.replace(/\bpre[- ]interview\s+assessment\b/gi, "assessment"))) mentions.add("interview");
    if (/\b(?:application|applications|candidacy|roles?)\b.{0,120}\b(?:is|are|remain) under review\b/i.test(context.text)) mentions.add("review");
    if (/\b(?:online |numerical )?assessment\b/i.test(context.text)) mentions.add("assessment");
    if (employmentOffer(context.text)) mentions.add("offer");
  }
  return mentions;
}

function hasExplicitSchedulingDate(context: MessageSentence): boolean {
  return /\b(?:scheduled|schedule|meeting|interview|assessment|deadline|by)\b/i.test(context.text)
    && /\b\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\b/i.test(context.text);
}

function mentionsStageEvent(context: MessageSentence, stage: ApplicationStage | undefined): boolean {
  if (!stage) return false;
  const noun = stage === "interview" ? "interview" : stage === "assessment" ? "assessment" : stage === "offer" ? "offer" : "review";
  return new RegExp(`\\b${noun}\\b`, "i").test(context.text);
}

function timeEvidence(contexts: readonly MessageSentence[], matched: MessageSentence, stage: ApplicationStage | undefined): string {
  if (/\b\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\b/i.test(matched.text)) return matched.text;

  const adjacent = contexts.filter((context) => context.source === "excerpt" && (
    matched.source === "excerpt" ? Math.abs(context.index - matched.index) === 1 : context.index === 0
  ));
  return adjacent.find((context) => hasExplicitSchedulingDate(context) && mentionsStageEvent(context, stage))?.text ?? matched.text;
}

function interviewSubtype(text: string): MessageClassification["interviewSubtype"] | undefined {
  for (const subtype of ["technical", "phone", "video", "case", "onsite", "final"] as const) {
    if (new RegExp(`\\b${subtype} interview\\b`, "i").test(text)) return subtype;
  }
  return undefined;
}

export function classifyMessage(message: MailEnvelope): MessageClassification | null {
  if (mailFilterReason(message)) return null;
  const contexts = messageSentences(message);
  const terminalMatch = findSignal(terminalSignals, contexts);
  const negativeInvitationMatch = findSignal(negativeInvitationSignals, contexts);
  const stageMatch = findStageSignal(stageSignals, contexts);
  const mentionedStages = stageMentions(contexts);
  const contradictory = mentionedStages.size > 1;

  if (!terminalMatch && negativeInvitationMatch) {
    return {
      confidence: 0.95,
      reasons: [negativeInvitationMatch.signal.reason],
      evidenceExcerpt: negativeInvitationMatch.evidenceExcerpt,
      deadlines: [],
      links: validHttpsLinks(message.links),
      requiresApproval: true,
    };
  }

  if (!terminalMatch && !stageMatch) {
    if (recruiterOutreach(message)) return { kind: "recruiter-outreach", confidence: 0.7, reasons: ["personal-recruiter-outreach"], evidenceExcerpt: message.excerpt,
      deadlines: [], links: validHttpsLinks(message.links), requiresApproval: true };
    return null;
  }

  const proposedStage = contradictory && mentionedStages.has("review") ? "review" : stageMatch?.signal.stage;
  const selectedMatch = findStageSignal(stageSignals.filter((signal) => signal.stage === proposedStage), contexts) ?? stageMatch;
  const selectedSignal = selectedMatch?.signal;
  const isOffer = proposedStage === "offer";
  const requiresApproval = Boolean(terminalMatch || isOffer || proposedStage === "applied" || contradictory || message.forwarded || /^\s*(?:fw|fwd):/i.test(message.subject));
  const subtype = proposedStage === "interview" ? interviewSubtype(selectedMatch?.evidenceExcerpt ?? "") : undefined;
  const label = proposedStage === "interview" ? `${subtype ? `${subtype[0].toUpperCase()}${subtype.slice(1)} ` : ""}interview` : proposedStage === "assessment" ? (selectedSignal?.reason === "numerical-assessment-deadline" ? "Numerical assessment deadline" : "Assessment") : "Application update";
  const evidenceExcerpt = terminalMatch?.evidenceExcerpt ?? selectedMatch?.evidenceExcerpt ?? "";
  const time = extractTime(timeEvidence(contexts, terminalMatch?.context ?? selectedMatch?.context ?? { text: evidenceExcerpt, source: "excerpt", index: 0 }, proposedStage), message.providerMessageId, label, proposedStage === "assessment" ? "deadline" : "scheduled-time");
  const links = validHttpsLinks(message.links);
  const reasons = [terminalMatch?.signal.reason ?? selectedSignal?.reason];
  if (contradictory) reasons.push("contradictory-stage-language");
  if (time.deadline) reasons.push("scheduled-time");
  if (links.length > 0) reasons.push("https-link");
  if (time.unknownTimezone) reasons.push("unknown-timezone");
  if (time.invalidDate) reasons.push("invalid-date");

  const classification = {
    ...(proposedStage ? { proposedStage } : {}),
    ...(subtype ? { interviewSubtype: subtype } : {}),
    confidence: terminalMatch ? 0.95 : selectedSignal?.confidence ?? 0.8,
    reasons: reasons.filter((reason): reason is string => Boolean(reason)),
    evidenceExcerpt,
    deadlines: time.deadline ? [time.deadline] : [],
    links,
  };

  if (requiresApproval) {
    return { ...classification, ...(terminalMatch ? { proposedOutcome: terminalMatch.signal.outcome } : {}), requiresApproval: true };
  }

  return { ...classification, requiresApproval: false };
}
