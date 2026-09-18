import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailTransport, GmailTransportError } from "./GmailTransport";

describe("GmailTransport", () => {
  it.each(["TimeoutError", "TypeError"])("retries transient %s failures before returning mail", async name => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(Object.assign(new Error("private"), { name })).mockImplementation(async () => Response.json({ historyId: "123" }));
    const result = new GmailTransport({ getAccessToken: async () => "secret" }, fetcher).getProfile().catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ historyId: "123" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds network retries and distinguishes timeouts without leaking the raw error", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error("private"), { name: "TimeoutError" }));
    const result = new GmailTransport({ getAccessToken: async () => "secret" }, fetcher).getProfile().catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ code: "gmail-timeout", operation: "profile" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(await result)).not.toContain("private");
  });
  afterEach(() => vi.useRealTimers());

  it("paces requests and retries Google's quota response without exposing provider content", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: "private detail", errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 }))
      .mockImplementation(async () => Response.json({ historyId: "123" }));
    const transport = new GmailTransport({ getAccessToken: async () => "secret" }, fetcher);
    const result = transport.getProfile().catch(error => error);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ historyId: "123" });
    const next = transport.getProfile();
    await vi.advanceTimersByTimeAsync(249);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
    await expect(next).resolves.toEqual({ historyId: "123" });
  });

  it("stops retrying a sustained quota failure and returns an allowlisted error", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ error: { errors: [{ reason: "userRateLimitExceeded" }], message: "private detail" } }, { status: 403 }));
    const result = new GmailTransport({ getAccessToken: async () => "secret" }, fetcher).getProfile().catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ code: "gmail-rate-limited", status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(JSON.stringify(await result)).not.toContain("private detail");
  });
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
