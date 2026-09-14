import { describe, expect, it } from "vitest";
import { fixtureMessages } from "../../fixtures/mail/messages";
import type { MailEnvelope } from "../../integrations/mail/MailAdapter";
import { classifyMessage } from "./classifyMessage";

const technicalInterviewMail = fixtureMessages[0];
const assessmentMail = fixtureMessages[1];
const rejectionMail = fixtureMessages[2];
const offerMail = fixtureMessages[3];
const conflictingStatusMail = fixtureMessages[4];
const marketingMail = fixtureMessages[5];

function mail(overrides: Partial<MailEnvelope>): MailEnvelope {
  return {
    providerMessageId: "mail-test-001",
    fromAddress: "recruiting@example.test",
    subject: "Application update",
    receivedAt: "2026-09-12T09:00:00.000Z",
    excerpt: "",
    links: [],
    ...overrides,
  };
}

describe("classifyMessage", () => {
  it("extracts a technical interview, SGT time, and HTTPS meeting link", () => {
    // Catches an interview branch that loses subtype, UTC+8 conversion, or a valid meeting link.
    expect(classifyMessage(technicalInterviewMail)).toEqual({
      proposedStage: "interview",
      interviewSubtype: "technical",
      confidence: 0.95,
      reasons: ["technical-interview-invitation", "scheduled-time", "https-link"],
      evidenceExcerpt: "We would like to invite you to a technical interview on 2026-09-13 at 2:00 PM SGT.",
      deadlines: [{
        id: "mail-interview-001-scheduled-time",
        label: "Technical interview",
        at: "2026-09-13T06:00:00.000Z",
        completed: false,
      }],
      links: ["https://meet.example/meridian-technical"],
      requiresApproval: false,
    });
  });

  it("extracts an assessment deadline in HKT", () => {
    // Catches a deadline branch that treats HKT as local time rather than UTC+8.
    expect(classifyMessage(assessmentMail)).toEqual({
      proposedStage: "assessment",
      confidence: 0.9,
      reasons: ["numerical-assessment-deadline", "scheduled-time", "https-link"],
      evidenceExcerpt: "Please complete the numerical assessment by 2026-09-14 at 10:00 AM HKT.",
      deadlines: [{
        id: "mail-assessment-002-deadline",
        label: "Numerical assessment deadline",
        at: "2026-09-14T02:00:00.000Z",
        completed: false,
      }],
      links: ["https://assess.example/pine-risk"],
      requiresApproval: false,
    });
  });

  it("classifies rejection but never marks it auto-applicable", () => {
    // Catches a terminal-outcome branch that lets a rejection bypass approval.
    expect(classifyMessage(rejectionMail)).toMatchObject({
      proposedOutcome: "rejected",
      confidence: 0.95,
      requiresApproval: true,
    });
  });

  it("requires approval for an offer even when the signal is confident", () => {
    // Catches an offer branch that treats high confidence as permission to change the application automatically.
    expect(classifyMessage(offerMail)).toMatchObject({
      proposedStage: "offer",
      confidence: 0.95,
      requiresApproval: true,
    });
  });

  it("requires approval when interview and review language conflict", () => {
    // Catches a classifier that chooses the subject's interview signal and hides contradictory body evidence.
    expect(classifyMessage(conflictingStatusMail)).toMatchObject({
      proposedStage: "review",
      requiresApproval: true,
      reasons: expect.arrayContaining(["contradictory-stage-language"]),
    });
  });

  it("returns no proposal for marketing mail or a generic acknowledgement", () => {
    // Catches broad acknowledgement matching that turns non-updates into application proposals.
    expect(classifyMessage(marketingMail)).toBeNull();
    expect(classifyMessage(mail({ subject: "Thank you for applying", excerpt: "We have received your application and will be in touch." }))).toBeNull();
  });

  it("keeps only HTTPS links and does not guess an unknown or missing timezone", () => {
    // Catches unsafe link acceptance or a date parser that silently assumes a timezone it was not given.
    expect(classifyMessage(mail({
      providerMessageId: "mail-unknown-zone-001",
      subject: "Online assessment invitation",
      excerpt: "Please complete the assessment by 2026-09-15 at 9:00 AM PST.",
      links: ["http://assess.example/insecure", "https://assess.example/secure", "javascript:alert(1)"],
    }))).toEqual({
      proposedStage: "assessment",
      confidence: 0.85,
      reasons: ["assessment-invitation", "https-link", "unknown-timezone"],
      evidenceExcerpt: "Please complete the assessment by 2026-09-15 at 9:00 AM PST.",
      deadlines: [],
      links: ["https://assess.example/secure"],
      requiresApproval: false,
    });
    expect(classifyMessage(mail({
      providerMessageId: "mail-missing-zone-001",
      subject: "Online assessment invitation",
      excerpt: "Please complete the assessment by 2026-09-15 at 9:00 AM.",
    }))).toMatchObject({ deadlines: [], reasons: expect.arrayContaining(["unknown-timezone"]) });
  });

  it("requires approval for a withdrawal", () => {
    // Catches a terminal withdrawal being mistaken for a routine stage update.
    expect(classifyMessage(mail({
      providerMessageId: "mail-withdrawal-001",
      subject: "Application withdrawn",
      excerpt: "We confirm that your application has been withdrawn.",
    }))).toMatchObject({ proposedOutcome: "withdrawn", requiresApproval: true });
  });

  it("does not promote a negated technical interview invitation", () => {
    // Catches a positive interview matcher that ignores a recruiter saying they cannot invite the candidate.
    expect(classifyMessage(mail({
      subject: "Application update",
      excerpt: "We cannot invite you to a technical interview at this time.",
    }))).toBeNull();
  });

  it("does not combine invitation and interview words from different sentences", () => {
    // Catches a cross-sentence matcher that fabricates an interview proposal and cannot cite one supporting sentence.
    expect(classifyMessage(mail({
      subject: "Application update",
      excerpt: "We invite you to our careers webinar. Your technical interview process remains under review.",
    }))).toBeNull();
  });

  it("keeps an interview signal but rejects an impossible calendar date", () => {
    // Catches Date.UTC rollover that silently changes February 30 into a March deadline.
    expect(classifyMessage(mail({
      providerMessageId: "mail-invalid-date-001",
      subject: "Technical interview invitation",
      excerpt: "We would like to invite you to a technical interview on 2026-02-30 at 2:00 PM SGT.",
    }))).toMatchObject({
      proposedStage: "interview",
      deadlines: [],
      reasons: expect.arrayContaining(["invalid-date"]),
    });
  });

  it("suppresses a positive interview subject when the body negates that invitation", () => {
    // Catches a subject-only positive match that auto-applies despite a body sentence saying the interview cannot be offered.
    expect(classifyMessage(mail({
      subject: "Technical interview invitation",
      excerpt: "We cannot invite you to a technical interview at this time.",
    }))).toBeNull();
  });

  it("extracts an SGT deadline from the adjacent scheduling sentence", () => {
    // Catches date extraction limited to the invitation sentence when the immediately following sentence schedules it.
    expect(classifyMessage(mail({
      providerMessageId: "mail-adjacent-date-001",
      subject: "Application update",
      excerpt: "We would like to invite you to a technical interview. It is scheduled for 2026-09-16 at 10:00 AM SGT.",
    }))).toMatchObject({
      proposedStage: "interview",
      evidenceExcerpt: "We would like to invite you to a technical interview.",
      deadlines: [{
        id: "mail-adjacent-date-001-scheduled-time",
        label: "Technical interview",
        at: "2026-09-16T02:00:00.000Z",
        completed: false,
      }],
    });
  });

  it("reports an impossible date from the adjacent scheduling sentence", () => {
    // Catches an adjacent invalid date being ignored after a valid interview signal.
    expect(classifyMessage(mail({
      subject: "Application update",
      excerpt: "We would like to invite you to a technical interview. It is scheduled for 2026-02-30 at 10:00 AM SGT.",
    }))).toMatchObject({
      proposedStage: "interview",
      deadlines: [],
      reasons: expect.arrayContaining(["invalid-date"]),
    });
  });
});
