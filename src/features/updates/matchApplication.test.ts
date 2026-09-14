import { describe, expect, it } from "vitest";
import type { Application } from "../../domain/application";
import type { MailEnvelope } from "../../integrations/mail/MailAdapter";
import { fixtureMessages } from "../../fixtures/mail/messages";
import { matchApplication } from "./matchApplication";

const application = (overrides: Partial<Application>): Application => ({
  id: "app-meridian-quant",
  company: "Meridian Quant Pte. Ltd.",
  role: "Quantitative Analyst",
  discipline: "finance",
  location: { city: "Singapore", country: "Singapore" },
  source: "Company careers",
  appliedAt: "2026-09-01T00:00:00.000Z",
  tags: [],
  deadlines: [],
  stageEvents: [],
  ...overrides,
});

const meridianMail = fixtureMessages[0];

describe("matchApplication", () => {
  it("matches a mail when normalized recruiter, domain, company, and role evidence all identify one application", () => {
    // Catches a matcher that misses punctuation, legal suffix, casing, or whitespace and loses a certain match.
    const result = matchApplication(meridianMail, [application({ recruiter: " RECRUITING@MERIDIANQUANT.EXAMPLE " })]);

    expect(result).toEqual({
      applicationId: "app-meridian-quant",
      confidence: 1,
      reasons: ["recruiter", "sender-domain", "company", "role"],
      conflicts: [],
    });
  });

  it("does not award sender-domain evidence to a lookalike domain label", () => {
    // Catches substring domain matching that treats notmeridianquant.example as Meridian Quant's domain.
    const message: MailEnvelope = {
      ...meridianMail,
      fromAddress: "recruiting@notmeridianquant.example",
    };

    expect(matchApplication(message, [application({ recruiter: "Meridian Quant Recruiting" })])).toEqual({
      applicationId: "app-meridian-quant",
      confidence: 0.75,
      reasons: ["recruiter", "company", "role"],
      conflicts: [],
    });
  });

  it("awards sender-domain evidence to an exact two-letter company domain", () => {
    // Catches a length guard that removes the mandated domain signal for a legitimate short company name.
    const message: MailEnvelope = {
      providerMessageId: "mail-ai-001",
      fromName: "AI Recruiting",
      fromAddress: "recruiting@ai.example",
      subject: "Interview invitation for Researcher",
      receivedAt: "2026-09-12T09:00:00.000Z",
      excerpt: "AI would like to discuss the Researcher role.",
      links: [],
    };

    expect(matchApplication(message, [application({ id: "app-ai", company: "AI Ltd.", role: "Researcher", recruiter: "AI Recruiting" })])).toEqual({
      applicationId: "app-ai",
      confidence: 1,
      reasons: ["recruiter", "sender-domain", "company", "role"],
      conflicts: [],
    });
  });

  it("returns no match when two applications have the same high-confidence evidence", () => {
    // Catches a tie-break branch that silently assigns one of two equally plausible applications.
    const message: MailEnvelope = {
      ...meridianMail,
      subject: "Interview update for Quantitative Analyst and Graduate Analyst roles",
    };
    const applications = [
      application({ recruiter: "recruiting@meridianquant.example" }),
      application({ id: "app-meridian-graduate", role: "Graduate Analyst", recruiter: "recruiting@meridianquant.example" }),
    ];

    expect(matchApplication(message, applications)).toEqual({
      applicationId: null,
      confidence: 1,
      reasons: ["recruiter", "sender-domain", "company", "role"],
      conflicts: ["ambiguous"],
    });
  });

  it("returns no match when company and role mentions do not reach the confidence threshold", () => {
    // Catches a missing threshold guard that promotes a weak textual mention into an application update.
    const message: MailEnvelope = {
      ...meridianMail,
      fromName: "General Careers Team",
      fromAddress: "updates@career-portal.example",
      subject: "Meridian Quant update for Quantitative Analyst",
    };

    expect(matchApplication(message, [application({})])).toEqual({
      applicationId: null,
      confidence: 0.3,
      reasons: ["company", "role"],
      conflicts: [],
    });
  });

  it("returns an empty unmatched result for unrelated mail", () => {
    // Catches a tie branch that labels two zero-evidence candidates as an ambiguity instead of leaving marketing mail unmatched.
    expect(matchApplication(fixtureMessages[5], [application({}), application({ id: "app-unrelated", company: "Cobalt Cloud Works", role: "Product Engineer" })])).toEqual({
      applicationId: null,
      confidence: 0,
      reasons: [],
      conflicts: [],
    });
  });
});
