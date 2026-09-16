import { describe, expect, it, vi } from "vitest";
import { CompanionClient, type TokenStorage } from "./companionClient";

describe("CompanionClient", () => {
  it("keeps the pairing token in extension storage and never returns it", async () => {
    const storage = memoryTokenStorage();
    const fetcher = vi.fn().mockResolvedValue(response({ token: "private-paired-token-abcdefghijklmnopqrstuvwxyz" }));
    const client = new CompanionClient({ fetcher, storage });

    const result = await client.pair("ABCDE-FGHJK");

    expect(result).toEqual({ paired: true });
    expect(await storage.getToken()).toBe("private-paired-token-abcdefghijklmnopqrstuvwxyz");
    expect(JSON.stringify(result)).not.toContain("private-paired-token");
  });

  it("adds the bearer token only to authenticated companion requests", async () => {
    const storage = memoryTokenStorage("private-paired-token-abcdefghijklmnopqrstuvwxyz");
    const fetcher = vi.fn().mockResolvedValue(response({ selection: { "identity.givenName": "Alex" } }));
    const client = new CompanionClient({ fetcher, storage });

    expect(await client.selectProfile(["identity.givenName"])).toEqual({ "identity.givenName": "Alex" });
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:43117/api/buddy/profile/select", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer private-paired-token-abcdefghijklmnopqrstuvwxyz" }),
      body: JSON.stringify({ paths: ["identity.givenName"] }),
    }));
  });

  it("clears a rejected token and returns an unpaired error", async () => {
    const storage = memoryTokenStorage("private-paired-token-abcdefghijklmnopqrstuvwxyz");
    const client = new CompanionClient({ fetcher: vi.fn().mockResolvedValue(response({ error: { code: "unauthorized" } }, 401)), storage });

    await expect(client.getPreferences()).rejects.toMatchObject({ code: "unpaired" });
    expect(await storage.getToken()).toBeNull();
  });

  it("queues only validated salary evidence through the authenticated endpoint", async () => {
    const storage = memoryTokenStorage("private-paired-token-abcdefghijklmnopqrstuvwxyz");
    const fetcher = vi.fn().mockResolvedValue(response({ evidence: {} }, 201));
    const client = new CompanionClient({ fetcher, storage });
    const evidence = { id: "salary-1", market: "US" as const, currency: "USD" as const, period: "annual" as const,
      minimum: 120_000, maximum: 165_000, sourceUrl: "https://jobs.example/role", detectedAt: "2026-09-16T01:00:00.000Z" };

    await client.queueSalaryEvidence(evidence);

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:43117/api/buddy/salary-evidence", expect.objectContaining({
      method: "POST", body: JSON.stringify({ evidence }),
      headers: expect.objectContaining({ authorization: "Bearer private-paired-token-abcdefghijklmnopqrstuvwxyz" }),
    }));
  });
});

function memoryTokenStorage(initial: string | null = null): TokenStorage {
  let token = initial;
  return {
    async getToken() { return token; },
    async setToken(value) { token = value; },
    async clearToken() { token = null; },
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
