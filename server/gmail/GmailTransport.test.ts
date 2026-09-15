import { describe, expect, it, vi } from "vitest";
import { GmailTransport, GmailTransportError } from "./GmailTransport";

describe("GmailTransport", () => {
  it("uses a fresh bearer token and typed query parameters for Gmail requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      messages: [{ id: "g-1", threadId: "t-1" }], nextPageToken: "page-2",
    }), { status: 200 }));
    const getAccessToken = vi.fn().mockResolvedValue("access-token");
    const transport = new GmailTransport({ getAccessToken }, fetcher);

    await expect(transport.listMessages({ query: "in:inbox", maxResults: 100 })).resolves.toMatchObject({ nextPageToken: "page-2" });
    const [input, init] = fetcher.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    expect(url.searchParams.get("q")).toBe("in:inbox");
    expect(url.searchParams.get("maxResults")).toBe("100");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("returns only a safe status code when Gmail rejects a request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private mailbox detail", { status: 404 }));
    const transport = new GmailTransport({ getAccessToken: async () => "access-token" }, fetcher);

    await expect(transport.listHistory({ startHistoryId: "expired" })).rejects.toMatchObject<Partial<GmailTransportError>>({ status: 404 });
    await expect(transport.listHistory({ startHistoryId: "expired" })).rejects.not.toThrow("private mailbox detail");
  });
});
