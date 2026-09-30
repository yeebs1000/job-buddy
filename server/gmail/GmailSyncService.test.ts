import { describe, expect, it, vi } from "vitest";
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
  it("recovers transient message failures serially without refetching successful peers", async () => {
    const transport = new FakeTransport(); transport.messageIds = transport.messageIds.slice(0, 10);
    const fetched: string[] = []; let active = 0; let serialPeak = 0;
    transport.getMessage = async id => {
      fetched.push(id); active++;
      if (fetched.length > 5) serialPeak = Math.max(serialPeak, active);
      await Promise.resolve(); active--;
      if (id === "g-2" && fetched.filter(value => value === id).length === 1) throw new GmailTransportError(503, "gmail-network-error");
      return { id };
    };
    const result = await new GmailSyncService(transport, message => envelope(message.id!)).scan({ cursor: null, initialSyncConfirmed: true, batch: true });
    expect(result.messages.map(message => message.providerMessageId)).toEqual(transport.messageIds);
    expect(fetched.filter(id => id === "g-1")).toHaveLength(1);
    expect(fetched.filter(id => id === "g-2")).toHaveLength(2);
    expect(serialPeak).toBe(1);
  });

  it("bounds serial recovery and preserves successful peers for a later resume", async () => {
    const transport = new FakeTransport(); transport.messageIds = ["g-1", "g-2", "g-3", "g-4", "g-5"];
    const fetched: string[] = []; let offline = true;
    transport.getMessage = async id => {
      fetched.push(id);
      if (id === "g-2" && offline) throw new GmailTransportError(503, "gmail-timeout");
      if (id === "g-3") throw new GmailTransportError(404);
      return { id };
    };
    const service = new GmailSyncService(transport, message => envelope(message.id!));
    const input = { cursor: null, initialSyncConfirmed: true, batch: true };
    await expect(service.scan(input)).rejects.toMatchObject({ code: "gmail-timeout" });
    expect(fetched.filter(id => id === "g-2")).toHaveLength(2);
    offline = false;
    const result = await service.scan(input);
    expect(result.messages.map(message => message.providerMessageId)).toEqual(["g-1", "g-2", "g-4", "g-5"]);
    expect(result.diagnostics.ignoredMessageCount).toBe(1);
    expect(fetched.filter(id => id === "g-4")).toHaveLength(1);
    expect(result.nextCursor).toBe("184500");
  });

  it("fetches bounded parallel groups while preserving message order", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FakeTransport(); transport.messageIds = transport.messageIds.slice(0, 25);
      let active = 0; let peak = 0;
      transport.getMessage = async id => {
        peak = Math.max(peak, ++active);
        await new Promise(resolve => setTimeout(resolve, id === "g-1" ? 100 : 50));
        active--;
        return { id };
      };
      const start = Date.now();
      const pending = new GmailSyncService(transport, message => envelope(message.id!))
        .scan({ cursor: null, initialSyncConfirmed: true, batch: true });
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(peak).toBe(5);
      expect(Date.now() - start).toBe(300);
      expect(result.messages.map(message => message.providerMessageId)).toEqual(transport.messageIds);
      expect(result.progress).toEqual({ processed: 25, total: 25 });
    } finally { vi.useRealTimers(); }
  });

  it("drains a failed group before unlocking and retries without skipping messages", async () => {
    const transport = new FakeTransport(); transport.messageIds = transport.messageIds.slice(0, 10);
    let release!: () => void;
    let fail = true;
    const fetched: string[] = [];
    transport.getMessage = async id => {
      fetched.push(id);
      if (fail && id === "g-1") throw new GmailTransportError(503);
      if (fail && id === "g-2") await new Promise<void>(resolve => { release = resolve; });
      return { id };
    };
    const service = new GmailSyncService(transport, message => envelope(message.id!));
    const input = { cursor: null, initialSyncConfirmed: true, batch: true };
    const pending = service.scan(input).catch(error => error);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(service.scan(input)).rejects.toMatchObject({ code: "gmail-scan-busy" });
    expect(fetched).toEqual(["g-1", "g-2", "g-3", "g-4", "g-5"]);
    release();
    expect(await pending).toMatchObject({ status: 503 });
    fail = false;
    const result = await service.scan(input);
    expect(result.messages.map(message => message.providerMessageId)).toEqual(transport.messageIds);
    expect(result.diagnostics.ignoredMessageCount).toBe(0);
  });

  it("expires resume tokens and refuses unissued offsets", async () => {
    const transport = new FakeTransport(); transport.messageIds = transport.messageIds.slice(0, 60);
    const service = new GmailSyncService(transport, message => envelope(message.id!));
    const first = await service.scan({ cursor: null, initialSyncConfirmed: true, batch: true });
    const input = { cursor: null, initialSyncConfirmed: true, batch: true, continuationToken: first.continuationToken };
    await expect(service.scan({ ...input, continuationToken: first.continuationToken!.replace(/:25$/, ":50") })).rejects.toMatchObject({ code: "gmail-scan-expired" });
    const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31 * 60_000);
    try { await expect(service.scan(input)).rejects.toMatchObject({ code: "gmail-scan-expired" }); }
    finally { clock.mockRestore(); }
  });

  it("does not reuse a completed scan when Gmail's cursor stays unchanged", async () => {
    const transport = new FakeTransport();
    transport.listHistory = async () => { transport.historyPages++; return { history: [], historyId: "same" }; };
    const service = new GmailSyncService(transport);
    const input = { cursor: "same", initialSyncConfirmed: false, batch: true };
    await service.scan(input); await service.scan(input);
    expect(transport.historyPages).toBe(2);
  });

  it("invalidates an in-flight batch when the account connection changes", async () => {
    const transport = new FakeTransport(); transport.messageIds = ["g-1"];
    let release!: (message: GmailMessage) => void;
    transport.getMessage = () => new Promise(resolve => { release = resolve; });
    const service = new GmailSyncService(transport, message => envelope(message.id!));
    const pending = service.scan({ cursor: null, initialSyncConfirmed: true, batch: true });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    service.reset(); release({ id: "g-1" });
    await expect(pending).rejects.toMatchObject({ code: "gmail-scan-expired" });
  });
  it("resumes a failed batch without refetching committed batches and replays a lost response", async () => {
    const transport = new FakeTransport(); transport.messageIds = transport.messageIds.slice(0, 30);
    const fetched: string[] = []; let fail = true;
    transport.getMessage = async id => { fetched.push(id); if (id === "g-26" && fail) throw new GmailTransportError(503); return { id }; };
    const service = new GmailSyncService(transport, message => envelope(message.id!));
    const first = await service.scan({ cursor: null, initialSyncConfirmed: true, batch: true });
    expect(first.messages).toHaveLength(25);
    expect(first.progress).toEqual({ processed: 25, total: 30 });
    expect(first.continuationToken).toEqual(expect.any(String));
    expect(await service.scan({ cursor: null, initialSyncConfirmed: true, batch: true })).toEqual(first);
    const next = { cursor: null, initialSyncConfirmed: true, batch: true, continuationToken: first.continuationToken };
    await expect(service.scan(next)).rejects.toMatchObject({ status: 503 });
    fail = false;
    const final = await service.scan(next);
    expect(final.messages).toHaveLength(5);
    expect(final.continuationToken).toBeUndefined();
    expect(final.nextCursor).toBe("184500");
    expect(fetched.filter(id => id === "g-1")).toHaveLength(1);
    expect(await service.scan(next)).toEqual(final);
    service.reset();
    await expect(service.scan(next)).rejects.toMatchObject({ code: "gmail-scan-expired" });
  });

  it("ignores deleted messages without treating a message 404 as expired history", async () => {
    const transport = new FakeTransport();
    transport.getMessage = async id => { if (id === "g-2") throw new GmailTransportError(404); return { id, labelIds: ["INBOX"] }; };
    const result = await new GmailSyncService(transport, message => envelope(message.id!)).scan({ cursor: "184000", initialSyncConfirmed: false });
    expect(result.nextCursor).toBe("184100");
    expect(result.diagnostics.ignoredMessageCount).toBe(1);
    expect(transport.listedPages).toBe(0);
  });
  it("rejects overlapping scans and releases the lock after completion", async () => {
    const transport = new FakeTransport();
    transport.messageIds = [];
    let finish!: (value: { historyId: string }) => void;
    transport.getProfile = () => new Promise(resolve => { finish = resolve; });
    const service = new GmailSyncService(transport);
    const first = service.scan({ cursor: null, initialSyncConfirmed: true });
    await expect(service.scan({ cursor: null, initialSyncConfirmed: true })).rejects.toMatchObject({ code: "gmail-scan-busy" });
    finish({ historyId: "123" });
    await expect(first).resolves.toMatchObject({ nextCursor: "123" });
    transport.getProfile = async () => ({ historyId: "124" });
    await expect(service.scan({ cursor: null, initialSyncConfirmed: true })).resolves.toMatchObject({ nextCursor: "124" });
  });
  it("does not start another parallel group after one message fails", async () => {
    const transport = new FakeTransport();
    const fetched: string[] = [];
    transport.getMessage = async id => { fetched.push(id); throw new GmailTransportError(403); };
    await expect(new GmailSyncService(transport).scan({ cursor: null, initialSyncConfirmed: true })).rejects.toBeInstanceOf(GmailTransportError);
    expect(fetched).toEqual(["g-1", "g-2", "g-3", "g-4", "g-5"]);
  });
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
