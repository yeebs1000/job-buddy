import { describe, expect, it } from "vitest";
import { normalizeGmailMessage } from "./GmailMessageNormalizer";
import type { GmailMessage, GmailMessagePart } from "./gmailTypes";
import { classifyMessage } from "../../src/features/updates/classifyMessage";

function encoded(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function message(parts: GmailMessagePart[]): GmailMessage {
  return {
    id: "gmail-1",
    threadId: "thread-1",
    internalDate: String(Date.parse("2026-09-15T06:00:00.000Z")),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Recruiter Name <recruiter@example.com>" },
        { name: "Subject", value: "Technical interview" },
      ],
      parts,
    },
  };
}

describe("normalizeGmailMessage", () => {
  it("consumes folded recipient headers after Subject while preserving an indented body", () => {
    const body = "  You were not selected to move to the next stage in the process.";
    const text = `From: Recruiter <recruiter@employer.example>\nDate: Yesterday\nSubject: Application update\nTo: Candidate <candidate@example.test>\nCc: team@example.test,\n${"  another.long.email.address@example.test,\n".repeat(20)}\n${body}`;
    const input = message([{ mimeType: "text/plain", body: { data: encoded(text) } }]);
    input.payload!.headers![1].value = "Fwd: Application update";
    const result = normalizeGmailMessage(input)!;
    expect(result.excerpt).toBe(body.trim());
    expect(classifyMessage(result)).toMatchObject({ proposedOutcome: "rejected", requiresApproval: true });
  });
  it("classifies an original forwarded subject even when the user changed the outer subject", () => {
    const input = message([{ mimeType: "text/plain", body: { data: encoded("From: Recruiter <recruiter@employer.example>\nDate: Yesterday\nSubject: Technical interview invitation\nTo: Candidate <candidate@example.test>\n\nDear candidate, please choose a suitable time at the following link.") } }]);
    input.payload!.headers![1].value = "Fwd: Application update";
    expect(classifyMessage(normalizeGmailMessage(input)!)).toMatchObject({ proposedStage: "interview", requiresApproval: true });
  });
  it("recognizes a long auto-forwarded recruiter approach within the stored excerpt bound", () => {
    const body = "External Mail. Dear Candidate, I hope you are doing well! I am Alex from Example Talent Asia, an executive search firm focused on strategy consulting recruitment. I am reaching out regarding a Shanghai-based Senior Consultant opportunity with a highly regarded international boutique strategy consulting firm, known for its entrepreneurial culture, close collaboration with Partners, and hands-on approach to solving strategic challenges. The firm is currently expanding its Advanced Industrials practice in China, advising leading companies across industrial technology, advanced manufacturing, mobility, energy transition, and other high-growth sectors. Given your engineering background and relevant experience in industrial products, I believe your profile could be a strong fit for this opportunity.";
    const input = message([{ mimeType: "text/plain", body: { data: encoded(body) } }]);
    input.payload!.headers![1].value = "Senior Consultant opportunity - Shanghai";
    const normalized = normalizeGmailMessage(input)!;
    expect(Array.from(normalized.excerpt).length).toBeLessThanOrEqual(600);
    expect(classifyMessage(normalized)).toMatchObject({ kind: "recruiter-outreach", requiresApproval: true });
  });
  it.each(["text/plain", "text/html"])("unwraps %s forwarding headers before the excerpt limit, without trusting the named sender", mimeType => {
    const headers = `---------- Forwarded message ---------\nFrom: Workday Notify <recruiting@myworkday.com>\nDate: Wed, 19 Aug 2026 15:29:45\nSubject: Update on Your Application for Associate Analyst\nTo: Candidate <candidate@university.example>\nCc: ${"another@example.test, ".repeat(40)}\n\n`;
    const body = "Dear Candidate, thank you for your interest in the Associate Analyst role. We regret to inform you that you were not selected to move to the next stage in the process.";
    const input = message([{ mimeType, body: { data: encoded(mimeType === "text/html" ? (headers + body).split("\n").map(line => `<div>${line.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</div>`).join("") : headers + body) } }]);
    input.payload!.headers![1].value = "Fwd: Application update";
    const result = normalizeGmailMessage(input);
    expect(result?.excerpt).toBe(body);
    expect(result?.fromAddress).toBe("recruiter@example.com");
    expect(result).toMatchObject({ forwarded: { fromAddress: "recruiting@myworkday.com", subject: "Update on Your Application for Associate Analyst" } });
  });

  it("keeps a normal auto-forwarded body intact", () => {
    const body = "I am reaching out regarding a Senior Consultant opportunity. Your background could be a strong fit.";
    expect(normalizeGmailMessage(message([{ mimeType: "text/plain", body: { data: encoded(body) } }]))?.excerpt).toBe(body);
  });

  it("does not unwrap ordinary reply history as the current message", () => {
    const body = "Your application is under review.\n\nFrom: Old Recruiter <old@example.com>\nSent: Yesterday\nTo: Candidate <candidate@example.test>\nSubject: Rejection\n\nYour application has been rejected.";
    const result = normalizeGmailMessage(message([{ mimeType: "text/plain", body: { data: encoded(body) } }]));
    expect(result?.excerpt).toMatch(/^Your application is under review/);
    expect(result).not.toHaveProperty("forwarded");
  });
  it("prefers plain text and emits bounded evidence", () => {
    const result = normalizeGmailMessage(message([
      { mimeType: "text/html", body: { data: encoded("<p>HTML should not win</p>") } },
      { mimeType: "text/plain", body: { data: encoded(`Plain invitation ${"🙂".repeat(700)}`) } },
    ]));

    expect(result).toMatchObject({
      providerMessageId: "gmail-1",
      threadId: "thread-1",
      fromName: "Recruiter Name",
      fromAddress: "recruiter@example.com",
      subject: "Technical interview",
      receivedAt: "2026-09-15T06:00:00.000Z",
    });
    expect(result?.excerpt).toMatch(/^Plain invitation/);
    expect(Array.from(result?.excerpt ?? "")).toHaveLength(600);
  });

  it("uses inert HTML fallback and retains at most ten unique credential-free HTTPS links", () => {
    const validLinks = Array.from({ length: 12 }, (_, index) => `https://jobs.example.com/step-${index}`);
    const html = `<style>secret style</style><script>secret script</script><p>Interview&nbsp;details &amp; next steps</p>${validLinks.map((url) => `<a href="${url}">${url}</a>`).join("")} https://user:password@example.com/private http://example.com/insecure`;

    const result = normalizeGmailMessage(message([{ mimeType: "text/html", body: { data: encoded(html) } }]));

    expect(result?.excerpt).toContain("Interview details & next steps");
    expect(result?.excerpt).not.toMatch(/secret style|secret script/);
    expect(result?.links).toEqual(validLinks.slice(0, 10));
  });

  it.each([
    ["invalid base64url", message([{ mimeType: "text/plain", body: { data: "%%%" } }])],
    ["missing sender", { ...message([]), payload: { ...message([]).payload!, headers: [{ name: "Subject", value: "Update" }] } }],
    ["impossible date", { ...message([]), internalDate: "not-a-date" }],
    ["oversized text", message([{ mimeType: "text/plain", body: { data: encoded("x"), size: 2_000_000 } }])],
  ])("isolates %s as an ignored message", (_name, input) => {
    expect(normalizeGmailMessage(input)).toBeNull();
  });

  it("rejects MIME nesting beyond the traversal bound", () => {
    const root = message([]);
    let part = root.payload!;
    for (let depth = 0; depth < 14; depth += 1) {
      const child: GmailMessagePart = { mimeType: "multipart/mixed", parts: [] };
      part.parts = [child];
      part = child;
    }
    part.parts = [{ mimeType: "text/plain", body: { data: encoded("too deep") } }];

    expect(normalizeGmailMessage(root)).toBeNull();
  });
});
