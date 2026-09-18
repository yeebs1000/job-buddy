import { describe, expect, it, vi } from "vitest";
import { GmailMailAdapter, type GmailCompanionClient } from "./GmailMailAdapter";

describe("GmailMailAdapter", () => {
  it("preserves forwarded context without replacing the real sender", async () => {
    const adapter = new GmailMailAdapter(async () => ({ source: "gmail", messages: [{ providerMessageId: "fwd-1", fromAddress: "owner@example.com", subject: "Fwd: Application update", receivedAt: "2026-09-17T00:00:00Z", excerpt: "You were not selected for the role.", links: [], forwarded: { fromAddress: "recruiting@myworkday.com", subject: "Application update" } }], nextCursor: "new", scannedAt: "2026-09-17T00:00:00Z", diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 } }));
    expect((await adapter.scan(null)).messages[0]).toMatchObject({ fromAddress: "owner@example.com", forwarded: { fromAddress: "recruiting@myworkday.com" } });
  });
  it("preserves a validated batch checkpoint and progress", async () => {
    const token = `${"a".repeat(32)}:25`;
    const client = vi.fn<GmailCompanionClient>().mockResolvedValue({ source: "gmail", messages: [], nextCursor: "new", scannedAt: "2026-09-17T00:00:00Z",
      diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 }, progress: { processed: 25, total: 50 }, continuationToken: token });
    expect(await new GmailMailAdapter(client).scan(null, { initialSyncConfirmed: true, continuationToken: token })).toMatchObject({ continuationToken: token, progress: { processed: 25, total: 50 } });
    expect(client).toHaveBeenCalledWith({ cursor: null, initialSyncConfirmed: true, batch: true, continuationToken: token });
  });

  it.each([
    { progress: { processed: 1, total: 2 } },
    { progress: { processed: 2, total: 1 } },
    { progress: { processed: -1, total: 2 } },
    { progress: { processed: 25, total: 50 }, continuationToken: "invalid" },
    { progress: { processed: 50, total: 50 }, continuationToken: `${"a".repeat(32)}:50` },
  ])("rejects inconsistent batch metadata", async batch => {
    const adapter = new GmailMailAdapter(async () => ({ source: "gmail", messages: [], nextCursor: "new", scannedAt: "2026-09-17T00:00:00Z",
      diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 }, ...batch }));
    await expect(adapter.scan(null)).rejects.toMatchObject({ code: "gmail-response-invalid" });
  });
  it("maps a live scan response and requests resumable batches without credentials", async () => {
    const client = vi.fn<GmailCompanionClient>().mockResolvedValue({
      source: "gmail",
      messages: [],
      nextCursor: "184100",
      scannedAt: "2026-09-15T08:00:00.000Z",
      diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 },
    });
    const adapter = new GmailMailAdapter(client);

    expect(adapter.source).toBe("gmail");
    await expect(adapter.scan(null, { initialSyncConfirmed: true })).resolves.toMatchObject({ nextCursor: "184100" });
    expect(client).toHaveBeenCalledWith({ cursor: null, initialSyncConfirmed: true, batch: true });
  });

  it("rejects malformed companion responses instead of advancing the cursor", async () => {
    const adapter = new GmailMailAdapter(vi.fn().mockResolvedValue({ nextCursor: "unsafe" }));
    await expect(adapter.scan("184000")).rejects.toThrow("Gmail scan");
  });
});
