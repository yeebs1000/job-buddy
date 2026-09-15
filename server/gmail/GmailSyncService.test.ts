import { describe, expect, it } from "vitest";
import type { MailEnvelope } from "../../src/integrations/mail/MailAdapter";
import { GmailSyncError, GmailSyncService, initialGmailQuery, type GmailTransportPort } from "./GmailSyncService";
import { GmailTransportError } from "./GmailTransport";
import type { GmailMessage } from "./gmailTypes";

function envelope(id: string): MailEnvelope {
  return { providerMessageId: id, fromAddress: "recruiter@example.com", subject: "Update", receivedAt: "2026-09-15T06:00:00.000Z", excerpt: "Interview update", links: [] };
}

class FakeTransport implements GmailTransportPort {
  listQueries: string[] = [];
  listedPages = 0;
  historyPages = 0;
  historyError: GmailTransportError | null = null;
  messageIds = Array.from({ length: 501 }, (_, index) => `g-${index + 1}`);

  async listMessages(input: { query: string; pageToken?: string; maxResults: number }) {
    this.listQueries.push(input.query);
    this.listedPages += 1;
    const start = input.pageToken ? Number(input.pageToken) : 0;
    const ids = this.messageIds.slice(start, start + input.maxResults);
    const next = start + ids.length;
    return { messages: ids.map((id) => ({ id })), ...(next < this.messageIds.length ? { nextPageToken: String(next) } : {}) };
  }
  async listHistory(input: { startHistoryId: string; pageToken?: string }) {
    if (this.historyError) throw this.historyError;
    this.historyPages += 1;
    return input.pageToken
      ? { history: [{ messagesAdded: [{ message: { id: "g-2" } }, { message: { id: "g-3" } }, { message: { id: "g-ignored" } }] }], historyId: "184100" }
      : { history: [{ messagesAdded: [{ message: { id: "g-2" } }, { message: { id: "g-2" } }] }], historyId: "184050", nextPageToken: "history-page-2" };
  }
  async getMessage(id: string): Promise<GmailMessage> {
    return { id, labelIds: id === "g-ignored" ? ["CATEGORY_PROMOTIONS"] : ["INBOX"] };
  }
  async getProfile() { return { historyId: "184500" }; }
}

describe("GmailSyncService", () => {
  it("requires consent and caps the 90-day initial scan at 500 newest inbox messages", async () => {
    const transport = new FakeTransport();
    const sync = new GmailSyncService(transport, (message) => envelope(message.id!));

    await expect(sync.scan({ cursor: null, initialSyncConfirmed: false })).rejects.toMatchObject<Partial<GmailSyncError>>({ code: "initial-consent-required" });
    const result = await sync.scan({ cursor: null, initialSyncConfirmed: true });

    expect(result.messages).toHaveLength(500);
    expect(result.diagnostics.truncated).toBe(true);
    expect(result.nextCursor).toBe("184500");
    expect(transport.listQueries[0]).toBe(initialGmailQuery);
  });

  it("paginates messageAdded history, de-duplicates IDs and ignores messages outside INBOX", async () => {
    const transport = new FakeTransport();
    const sync = new GmailSyncService(transport, (message) => envelope(message.id!));

    const result = await sync.scan({ cursor: "184000", initialSyncConfirmed: false });

    expect(result.messages.map((message) => message.providerMessageId)).toEqual(["g-2", "g-3"]);
    expect(result.nextCursor).toBe("184100");
    expect(result.diagnostics.ignoredMessageCount).toBe(1);
    expect(transport.historyPages).toBe(2);
  });

  it("performs one bounded recovery scan after an expired history cursor", async () => {
    const transport = new FakeTransport();
    transport.historyError = new GmailTransportError(404);
    transport.messageIds = ["g-recovered"];
    const sync = new GmailSyncService(transport, (message) => envelope(message.id!));

    await expect(sync.scan({ cursor: "expired", initialSyncConfirmed: false })).resolves.toMatchObject({
      source: "gmail", nextCursor: "184500", diagnostics: { recoverySync: true, truncated: false },
    });
    expect(transport.listedPages).toBe(1);
  });

  it("counts malformed messages without exposing or aborting the remaining scan", async () => {
    const transport = new FakeTransport();
    const sync = new GmailSyncService(transport, (message) => message.id === "g-2" ? null : envelope(message.id!));

    const result = await sync.scan({ cursor: "184000", initialSyncConfirmed: false });

    expect(result.messages.map((message) => message.providerMessageId)).toEqual(["g-3"]);
    expect(result.diagnostics.ignoredMessageCount).toBe(2);
  });
});
