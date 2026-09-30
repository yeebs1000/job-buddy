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

it("recognizes consideration of submitted application details without claiming review progress", () => {
  expect(classifyMessage(mail({ subject: "Thank You for Your Application!", excerpt: "Thank you for your interest in the Equity Research – Analyst/Associate, Greater China Technology Hardware (Hong Kong) position. We will give careful consideration to your application by reviewing the details you provided against the position criteria. Kind Regards, Morgan Stanley Talent Acquisition." }))).toMatchObject({ proposedStage: "applied", requiresApproval: true, deadlines: [] });
});

it("does not mistake a pre-interview assessment reminder for an interview or invent its deadline", () => {
  const result = classifyMessage(mail({ subject: "BlackRock | Action Required: Complete Your Application", excerpt: "We noticed that you have not yet completed your application for 2027 Full-Time Analyst Program - Investments - Portfolio Management - Singapore. As a reminder, to complete your application you must submit your pre-interview assessment within 5 calendar days of receiving the invitation in order to be considered for this role." }));
  expect(result).toMatchObject({ proposedStage: "assessment", deadlines: [] });
  expect(result?.reasons).not.toContain("contradictory-stage-language");
});

it.each([
  "We have not yet received your application. Please apply by Friday.",
  "We have received your application for a credit card.",
  "Thank you for applying for a visa at the Singapore Embassy",
])("does not propose Applied for negated or non-employment evidence: %s", excerpt => {
  expect(classifyMessage(mail({ subject: "Application update", excerpt }))?.proposedStage).not.toBe("applied");
});

it("does not treat interest in a role as proof of an application", () => {
  expect(classifyMessage(mail({ subject: "Research Analyst role", excerpt: "Thank you for your interest in our Research Analyst role. Please submit your application on our careers site." }))?.proposedStage).not.toBe("applied");
});

it.each(["Software Engineer at Visa", "Credit Card Analyst at Example Bank"])("retains an employment confirmation for %s", role => {
  expect(classifyMessage(mail({ subject: `Thank you for applying for ${role}`, excerpt: "" }))).toMatchObject({ proposedStage: "applied", requiresApproval: true });
});

it.each([false, true])("recognizes a Workday-style confirmation (forwarded: %s) without inventing review progress", forwarded => {
  const subject = "Thank you for applying for Associate, APAC ETF Platform at Example Asset Management";
  const result = classifyMessage(mail({ subject: forwarded ? `Fwd: ${subject}` : subject,
    fromAddress: forwarded ? "candidate@example.test" : "employer@myworkday.com",
    excerpt: "Thanks for taking the time to apply for our Associate, APAC ETF Platform position! Our team will take a close look at the applicants for this role.",
    ...(forwarded ? { forwarded: { fromAddress: "employer@myworkday.com", subject } } : {}),
  }));
  expect(result).toMatchObject({ proposedStage: "applied", deadlines: [] });
  expect(result?.kind).toBeUndefined();
  if (forwarded) expect(result?.requiresApproval).toBe(true);
});

it.each(["Your loan application has been received", "Thank you for applying for a visa", "Job alert: Thank you for applying tips"])("does not classify non-job confirmation: %s", subject => {
  expect(classifyMessage(mail({ subject, excerpt: "" }))).toBeNull();
});

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
  it("recognizes the candidate-specific not-selected rejection", () => {
    expect(classifyMessage(mail({ subject: "Update on Your Application for Associate Analyst", excerpt: "Thank you for your interest in the Associate Analyst role. We regret to inform you that you were not selected to move to the next stage in the process." }))).toMatchObject({ proposedOutcome: "rejected", requiresApproval: true });
  });
  it.each(["You have not been selected for the position.", "We have decided not to proceed with your application.", "We will not be moving forward with your candidacy."])("recognizes candidate rejection: %s", excerpt => {
    expect(classifyMessage(mail({ excerpt }))).toMatchObject({ proposedOutcome: "rejected", requiresApproval: true });
  });
  it("labels personal recruiter outreach without inventing a stage", () => {
    const result = classifyMessage(mail({ subject: "Senior Consultant opportunity - Shanghai", excerpt: "I am Taylor from an executive search firm focused on strategy consulting recruitment. I am reaching out regarding a Shanghai-based Senior Consultant opportunity. Given your engineering background, I believe your profile could be a strong fit for this opportunity." }));
    expect(result).toMatchObject({ kind: "recruiter-outreach", requiresApproval: true, deadlines: [] });
    expect(result?.proposedStage).toBeUndefined();
    expect(result?.proposedOutcome).toBeUndefined();
  });
  it.each([
    { subject: "Senior Consultant job alert", excerpt: "Your profile could be a strong fit. We are reaching out about an opportunity. View recommended jobs." },
    { subject: "Business opportunity", excerpt: "I am reaching out about a business opportunity. Your profile could be a strong fit." },
    { subject: "News digest", excerpt: "The candidate was not selected to move to the next stage." },
  ])("does not confuse promotions or third-party rejection with candidate mail: $subject", sample => {
    expect(classifyMessage(mail(sample))).toBeNull();
  });
  it("requires approval for forwarded recruiting text", () => {
    expect(classifyMessage({ ...technicalInterviewMail, forwarded: { fromAddress: "recruiting@example.com", subject: "Interview invitation" } })).toMatchObject({ requiresApproval: true });
  });
  it.each([
    { fromAddress: "noreply@news.bloomberg.com", subject: "Exclusive: How a consulting deal protected secrets", excerpt: "Bloomberg News Alert. A consulting offer to a third party came with legal privilege." },
    { fromAddress: "account@seekingalpha.com", fromName: "Must Reads", subject: "Tesla: The Cybercab Failure Is Worse Than You Think", excerpt: "Read every article with Premium. Join now with a special intro offer." },
    { subject: "Beyond Nvidia: Finding Opportunity In The AI Buildout", excerpt: "Must Reads. Join now with a special intro offer. FREE TRENDING ARTICLE." },
    { subject: "Data Center Boom Accelerates: 3 Top AI Stocks", excerpt: "Read every article with Premium. Join now with a special intro offer." },
    { subject: "Subscription renewal", excerpt: "We are pleased to offer you a discounted subscription." },
    { subject: "Cash withdrawal confirmation", excerpt: "Your withdrawal has been processed." },
    { subject: "Daily newsletter: Technical interview invitation", excerpt: "We invite you to a technical interview workshop." },
    { fromAddress: "editor@news.bloomberg.com", subject: "Your employment offer", excerpt: "We are pleased to offer you the Engineer position." },
    { subject: "Interview preparation webinar", excerpt: "We invite you to a technical interview practice session." },
    { subject: "Loan application update", excerpt: "Your application has been rejected." },
    { subject: "Employment update", excerpt: "We cannot offer you the Engineer position." },
  ])("ignores non-application evidence: $subject", sample => {
    expect(classifyMessage(mail(sample))).toBeNull();
  });

  it.each(["recruiting@bloomberg.com", "talent@careers.bloomberg.com", "no-reply@myworkday.com"])("keeps genuine employer and ATS offers from %s", fromAddress => {
    expect(classifyMessage(mail({ fromAddress, subject: "Your offer for Software Engineer", excerpt: "We are pleased to offer you the Software Engineer position. Please review your employment offer letter." }))).toMatchObject({ proposedStage: "offer", requiresApproval: true });
  });

  it("does not let a promotional footer turn an interview into an offer", () => {
    expect(classifyMessage(mail({ subject: "Technical interview invitation", excerpt: "We invite you to a technical interview. Our benefits provider has a special offer for subscribers." }))).toMatchObject({ proposedStage: "interview", requiresApproval: false });
  });

  it("does not confuse a Newsletter Editor role with a newsletter", () => {
    expect(classifyMessage(mail({ subject: "Offer for Newsletter Editor", excerpt: "We are pleased to offer you the Newsletter Editor position." }))).toMatchObject({ proposedStage: "offer" });
  });
  it.each([
    { subject: "Invitation to interview for the Analyst role", excerpt: "Dear candidate, please select a time using the scheduling link.", stage: "interview" },
    { subject: "Offer of employment", excerpt: "We are pleased to offer the position of Analyst to you.", stage: "offer" },
    { subject: "Graduate programme offer", excerpt: "We are pleased to offer you a place on our graduate programme.", stage: "offer" },
    { subject: "Newsletter Editor - interview invitation", excerpt: "We invite you to a technical interview for the Newsletter Editor position.", stage: "interview" },
  ])("retains ordinary candidate wording: $subject", ({ subject, excerpt, stage }) => {
    expect(classifyMessage(mail({ subject, excerpt }))).toMatchObject({ proposedStage: stage });
  });
  it("extracts a technical interview, SGT time, and HTTPS meeting link", () => {
    // Catches an interview branch that loses subtype, UTC+8 conversion, or a valid meeting link.
    expect(classifyMessage(technicalInterviewMail)).toEqual({
      proposedStage: "interview",
      interviewSubtype: "technical",
      confidence: 0.95,
      reasons: ["technical-interview-invitation", "scheduled-time", "https-link"],
      evidenceExcerpt: "Circuit Harbour Ltd would like to invite you to a technical interview on 2026-09-13 at 2:00 PM SGT.",
      deadlines: [{
        id: "mail-interview-001-scheduled-time",
        label: "Technical interview",
        at: "2026-09-13T06:00:00.000Z",
        completed: false,
      }],
      links: ["https://meet.example/circuit-technical"],
      requiresApproval: false,
    });
  });

  it("extracts an assessment deadline in HKT", () => {
    // Catches a deadline branch that treats HKT as local time rather than UTC+8.
    expect(classifyMessage(assessmentMail)).toEqual({
      proposedStage: "assessment",
      confidence: 0.9,
      reasons: ["numerical-assessment-deadline", "scheduled-time", "https-link"],
      evidenceExcerpt: "Pine Street Capital: please complete the numerical assessment by 2026-09-14 at 10:00 AM HKT.",
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

  it("excludes marketing but retains an application acknowledgement for explicit review", () => {
    expect(classifyMessage(marketingMail)).toBeNull();
    expect(classifyMessage(mail({ subject: "Thank you for applying", excerpt: "We have received your application and will be in touch." }))).toMatchObject({ proposedStage: "applied", requiresApproval: true });
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

  it.each([
    ["Your technical interview has been cancelled.", "interview-cancellation"],
    ["You are not invited to the assessment.", "not-invited-language"],
  ])("surfaces a positive subject with negative body as informational review: %s", (excerpt, reason) => {
    // Catches a positive subject overriding explicit cancellation/not-invited evidence and auto-advancing the application.
    expect(classifyMessage(mail({
      subject: "Technical interview invitation",
      excerpt: `${excerpt} The webinar is scheduled for 2026-09-16 at 10:00 AM SGT.`,
    }))).toEqual({
      confidence: 0.95,
      reasons: [reason],
      evidenceExcerpt: excerpt,
      deadlines: [],
      links: [],
      requiresApproval: true,
    });
  });

  it.each([
    ["Technical interview invitation", "You have not been invited to the technical interview."],
    ["Assessment invitation", "You were not invited to the assessment."],
    ["Technical interview invitation", "We have not invited you to the technical interview."],
  ])("treats ordinary negative invitation grammar as informational review: %s / %s", (subject, excerpt) => {
    // Catches positive subjects auto-advancing when the body uses not-been-invited grammar instead of the shorter negation.
    expect(classifyMessage(mail({ subject, excerpt }))).toEqual({
      confidence: 0.95,
      reasons: ["not-invited-language"],
      evidenceExcerpt: excerpt,
      deadlines: [],
      links: [],
      requiresApproval: true,
    });
  });

  it("keeps explicit rejection authoritative over a positive interview subject", () => {
    // Catches informational negative handling that accidentally hides an explicit rejection outcome.
    expect(classifyMessage(mail({
      subject: "Technical interview invitation",
      excerpt: "Your technical interview has been cancelled. Your application has been rejected.",
    }))).toMatchObject({ proposedOutcome: "rejected", requiresApproval: true, deadlines: [] });
  });

  it("extracts an SGT deadline from the adjacent scheduling sentence", () => {
    // Catches date extraction limited to the invitation sentence when the immediately following sentence schedules it.
    expect(classifyMessage(mail({
      providerMessageId: "mail-adjacent-date-001",
      subject: "Application update",
      excerpt: "We would like to invite you to a technical interview. The technical interview is scheduled for 2026-09-16 at 10:00 AM SGT.",
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
      excerpt: "We would like to invite you to a technical interview. The technical interview is scheduled for 2026-02-30 at 10:00 AM SGT.",
    }))).toMatchObject({
      proposedStage: "interview",
      deadlines: [],
      reasons: expect.arrayContaining(["invalid-date"]),
    });
  });

  it.each([
    "It is scheduled for 2026-09-16 at 10:00 AM SGT.",
    "The webinar is scheduled for 2026-09-16 at 10:00 AM SGT.",
  ])("does not take an interview deadline from unrelated or pronoun-only adjacency: %s", (adjacent) => {
    // Catches adjacency logic that attaches any nearby scheduled event to the classified interview.
    expect(classifyMessage(mail({
      subject: "Application update",
      excerpt: `We would like to invite you to a technical interview. ${adjacent}`,
    }))).toMatchObject({ proposedStage: "interview", deadlines: [] });
  });
});
