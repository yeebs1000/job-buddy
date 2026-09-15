import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanionServer, type CompanionServerServices } from "./createCompanionServer";

const openServers: Array<ReturnType<typeof createCompanionServer>> = [];

async function start(services: CompanionServerServices) {
  const server = createCompanionServer({
    services,
    allowedOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:43117"],
    uiOrigin: "http://127.0.0.1:5173",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  openServers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function services(overrides: Partial<CompanionServerServices> = {}): CompanionServerServices {
  return {
    connection: {
      status: async () => ({ state: "connected", accountEmail: "user@example.com", platformSupported: true, accessToken: "must-not-leak" }) as never,
      start: async () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?safe=1" }),
      complete: async () => undefined,
      disconnect: async () => ({ revocationConfirmed: true }),
    },
    sync: { scan: vi.fn().mockResolvedValue({ source: "gmail", messages: [], nextCursor: "184100", scannedAt: "2026-09-15T08:00:00.000Z", diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 } }) },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("createCompanionServer", () => {
  it("rejects state-changing requests from an unknown origin", async () => {
    const testServices = services();
    const base = await start(testServices);
    const response = await fetch(`${base}/api/gmail/scan`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ cursor: null, initialSyncConfirmed: true }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(testServices.sync.scan).not.toHaveBeenCalled();
  });

  it("never returns token or credential fields from status", async () => {
    const base = await start(services());
    const response = await fetch(`${base}/api/gmail/status`, { headers: { origin: "http://127.0.0.1:5173" } });

    expect(await response.json()).toEqual({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
  });

  it("requires a small JSON body and forwards only typed scan input", async () => {
    const testServices = services();
    const base = await start(testServices);
    const wrongType = await fetch(`${base}/api/gmail/scan`, { method: "POST", headers: { origin: "http://127.0.0.1:5173", "content-type": "text/plain" }, body: "{}" });
    const valid = await fetch(`${base}/api/gmail/scan`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: JSON.stringify({ cursor: "184000", initialSyncConfirmed: false, refreshToken: "must-ignore" }),
    });

    expect(wrongType.status).toBe(415);
    expect(valid.status).toBe(200);
    expect(testServices.sync.scan).toHaveBeenCalledWith({ cursor: "184000", initialSyncConfirmed: false });
  });

  it("redirects OAuth callbacks to a fixed UI result without reflecting query values", async () => {
    const base = await start(services());
    const response = await fetch(`${base}/api/gmail/oauth/callback?code=private-code&state=private-state`, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:5173/settings?gmail=connected");
    expect(response.headers.get("location")).not.toMatch(/private-code|private-state/);
  });
});
