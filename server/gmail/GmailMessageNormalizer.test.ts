import { describe, expect, it } from "vitest";
import { normalizeGmailMessage } from "./GmailMessageNormalizer";
import type { GmailMessage, GmailMessagePart } from "./gmailTypes";

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
