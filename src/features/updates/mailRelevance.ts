import type { MailEnvelope } from "../../integrations/mail/MailAdapter";

// Match newsletter channels, not entire employers (e.g. careers.bloomberg.com).
export function mailFilterReason(message: MailEnvelope): string | null {
  if (message.forwarded && mailFilterReason({ ...message, fromAddress: message.forwarded.fromAddress, fromName: undefined, subject: message.forwarded.subject, forwarded: undefined })) {
    return "Forwarded newsletter or non-recruiting message — not an application update.";
  }
  message = { ...message, subject: message.subject.replace(/^(?:(?:re|fw|fwd):\s*)+/i, "") };
  const address = message.fromAddress.trim().toLowerCase();
  const [local, domain = ""] = address.split("@");
  if (/^(?:news|newsletter|newsletters|digest|marketing)(?:\.|$)/i.test(domain)
    || /^(?:newsletter|newsletters|digest|marketing)(?:[.+_-]|$)/i.test(local)
    || /\b(?:news alert|must reads|daily digest|weekly digest)\b/i.test(message.fromName ?? "")) {
    return "Newsletter sender — not a candidate-specific recruiting message.";
  }
  if (/^(?:daily|weekly|monthly)\s+newsletter\b|^newsletter\s*(?:[:—–|\-]|$)|\b(?:news alert|daily digest|weekly digest|market briefing|trending articles?|subscription renewal|special intro offer|flash sale|job alerts?|recommended jobs)\b/i.test(message.subject)) {
    return "News, promotion or job-alert subject — not an application update.";
  }
  if (/\b(?:interview|assessment)\b.{0,45}\b(?:workshop|webinar|practice session|preparation|tips|coaching|course)\b/i.test(message.subject)
    || /\b(?:loan|mortgage|credit card|visa|university|admission)\s+application\b/i.test(message.subject)) {
    return "Non-recruiting subject — no job-application update identified.";
  }
  return null;
}

export function recruiterOutreach(message: MailEnvelope): boolean {
  const text = `${message.subject} ${message.excerpt}`;
  return /\b(?:recruit(?:er|ment|ing)|executive search|hiring|(?:senior |junior )?(?:consultant|engineer|analyst|developer|manager) (?:role|position|opportunity))\b/i.test(text)
    && /\b(?:reaching out|contacting you|came across your profile)\b/i.test(text)
    && /\byour (?:background|profile|experience)\b|\breaching out (?:regarding|about)\b.{0,120}\b(?:role|position|opportunity)\b/i.test(text)
    && /\b(?:opportunit(?:y|ies)|role|position)\b/i.test(text);
}

export function employmentOffer(text: string): boolean {
  if (/\b(?:cannot|can't|unable to|will not|won't|not able to|do not|don't)\b.{0,60}\boffer\b|\b(?:no|not an?)\s+(?:job |employment )?offer\b/i.test(text)) return false;
  return /\boffer(?:ing)?\s+you\b.{0,100}\b(?:position|role|employment|job|graduate program(?:me)?|internship)\b|\boffer(?:ing)?\s+(?:the |a )?(?:position|role|job)\b.{0,100}\bto you\b|\byour\s+(?:job |employment )?offer\s+(?:letter|of employment)\b|\b(?:job|employment)\s+offer\b.{0,40}\b(?:for you|your|attached|pleased|accept|letter)\b/i.test(text);
}

export function recruitingInvitation(text: string): boolean {
  if (/\b(?:interview|assessment)\b.{0,45}\b(?:workshop|webinar|practice session|tips|coaching|course)\b/i.test(text)) return false;
  return /\b(?:invite|inviting)\s+you\b|\byou(?:'re| are| have been)\s+invited\b|\byour\b.{0,100}\b(?:interview|assessment)\b|\binvitation\s+(?:to|for)\s+(?:an? |the |your )?(?:technical |online |numerical )?(?:interview|assessment)\b|\b(?:technical |online |numerical )?(?:interview|assessment)\s+invitation\b|\b(?:please )?complete\s+(?:the |your |our |an? )?(?:online |numerical |technical )?assessment\b/i.test(text);
}
