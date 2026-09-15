import { describe, expect, it, vi } from "vitest";
import { GmailMailAdapter, type GmailCompanionClient } from "./GmailMailAdapter";

describe("GmailMailAdapter", () => {
  it("maps a live scan response to the mail contract and sends only cursor and confirmation", async () => {
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
    expect(client).toHaveBeenCalledWith({ cursor: null, initialSyncConfirmed: true });
  });

  it("rejects malformed companion responses instead of advancing the cursor", async () => {
    const adapter = new GmailMailAdapter(vi.fn().mockResolvedValue({ nextCursor: "unsafe" }));
    await expect(adapter.scan("184000")).rejects.toThrow("Gmail scan");
  });
});
