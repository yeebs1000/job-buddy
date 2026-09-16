import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCandidateProfile } from "../../src/domain/profile";
import { defaultBuddyPreferences } from "../../src/domain/buddy";
import { createCompanionServer, type CompanionServerServices } from "./createCompanionServer";

const openServers: Array<ReturnType<typeof createCompanionServer>> = [];
const pairedToken = "paired-token-abcdefghijklmnopqrstuvwxyz";

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
    profile: {
      status: vi.fn().mockResolvedValue({ platformSupported: true, hasProfile: false }),
      read: vi.fn().mockResolvedValue(emptyCandidateProfile),
      replace: vi.fn().mockResolvedValue(emptyCandidateProfile),
      select: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    buddy: {
      pairStart: vi.fn().mockReturnValue({ code: "ABCDE-FGHJK", expiresAt: "2026-09-16T02:05:00.000Z" }),
      pairComplete: vi.fn().mockResolvedValue({ token: pairedToken }),
      revoke: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ paired: false }),
      getPreferences: vi.fn().mockResolvedValue(defaultBuddyPreferences),
      setPreferences: vi.fn().mockResolvedValue(defaultBuddyPreferences),
      listActivity: vi.fn().mockResolvedValue([]),
      clearActivity: vi.fn().mockResolvedValue(undefined),
      listCaptures: vi.fn().mockResolvedValue([]),
      deleteCapture: vi.fn().mockResolvedValue(undefined),
      selectProfile: vi.fn().mockResolvedValue({ "identity.givenName": "Alex" }),
      readPreferences: vi.fn().mockResolvedValue(defaultBuddyPreferences),
      updateExtensionPreference: vi.fn().mockResolvedValue(defaultBuddyPreferences),
      appendActivity: vi.fn().mockResolvedValue(undefined),
      addCapture: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("createCompanionServer", () => {
  it("keeps research endpoints dashboard-only and validates lookup requests", async () => {
    const research = {
      status: vi.fn().mockResolvedValue([{ market: "US", activeReleaseId: "us-2025", quarantineCount: 0, latestQuarantinePath: "C:/private/cache.json" }]),
      refresh: vi.fn().mockResolvedValue([{ market: "US", ok: true, releaseId: "us-2025" }]),
      lookup: vi.fn().mockResolvedValue({ releaseId: "us-2025", benchmark: { id: "benchmark" }, cpiPoints: [], retrievedAt: "2026-09-16T00:00:00.000Z", fallback: "exact" }),
    };
    const base = await start(services({ research }));
    const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;

    const denied = await fetch(`${base}/api/research/status`, { headers: { origin: extensionOrigin } });
    const status = await fetch(`${base}/api/research/status`, { headers: { origin: "http://127.0.0.1:5173" } });
    const invalid = await fetch(`${base}/api/research/lookup`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: JSON.stringify({ market: "CA", canonicalRole: "software-engineer" }),
    });
    const lookup = await fetch(`${base}/api/research/lookup`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: JSON.stringify({ market: "US", canonicalRole: "software-engineer", metroCode: "41860", state: "CA" }),
    });

    expect(denied.status).toBe(403);
    const statusBody = await status.json();
    expect(statusBody).toEqual({ markets: [{ market: "US", activeReleaseId: "us-2025", quarantineCount: 0 }] });
    expect(JSON.stringify(statusBody)).not.toContain("private");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: { code: "invalid-research-query" } });
    expect(lookup.status).toBe(200);
    expect(research.lookup).toHaveBeenCalledWith({ market: "US", canonicalRole: "software-engineer", metroCode: "41860", state: "CA" });
    expect(JSON.stringify(await lookup.json())).not.toContain("sourceBytes");
  });

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

  it("returns profile status and values only to the dashboard origin", async () => {
    const profile = {
      status: vi.fn().mockResolvedValue({ platformSupported: true, hasProfile: true }),
      read: vi.fn().mockResolvedValue({ ...emptyCandidateProfile, identity: { givenName: "Alex" } }),
      replace: vi.fn(),
      select: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
    };
    const base = await start(services({ profile }));

    const denied = await fetch(`${base}/api/profile`, { headers: { origin: "https://evil.example" } });
    const allowed = await fetch(`${base}/api/profile`, { headers: { origin: "http://127.0.0.1:5173" } });

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({
      platformSupported: true,
      hasProfile: true,
      profile: { ...emptyCandidateProfile, identity: { givenName: "Alex" } },
    });
  });

  it("accepts a validated profile replacement only from the dashboard origin", async () => {
    const profile = {
      status: vi.fn().mockResolvedValue({ platformSupported: true, hasProfile: false }),
      read: vi.fn().mockResolvedValue(emptyCandidateProfile),
      replace: vi.fn().mockResolvedValue({ ...emptyCandidateProfile, identity: { givenName: "Alex" } }),
      select: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
    };
    const base = await start(services({ profile }));
    const next = { ...emptyCandidateProfile, identity: { givenName: "Alex" } };

    const denied = await fetch(`${base}/api/profile`, {
      method: "PUT",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    const allowed = await fetch(`${base}/api/profile`, {
      method: "PUT",
      headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: JSON.stringify(next),
    });

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ profile: { ...emptyCandidateProfile, identity: { givenName: "Alex" } } });
    expect(profile.replace).toHaveBeenCalledWith(next);
  });

  it("deletes only the profile and enforces the larger profile body cap", async () => {
    const testServices = services();
    const base = await start(testServices);
    const deleted = await fetch(`${base}/api/profile`, {
      method: "DELETE",
      headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: "{}",
    });
    const oversized = await fetch(`${base}/api/profile`, {
      method: "PUT",
      headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(129 * 1024) }),
    });

    expect(deleted.status).toBe(204);
    expect(testServices.profile.delete).toHaveBeenCalledOnce();
    expect(oversized.status).toBe(413);
    expect(testServices.profile.replace).not.toHaveBeenCalled();
  });

  it("starts pairing from the dashboard and completes it only from an extension origin", async () => {
    const testServices = services();
    const base = await start(testServices);
    const dashboardStart = await fetch(`${base}/api/buddy/pairing/start`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: "{}",
    });
    const deniedComplete = await fetch(`${base}/api/buddy/pairing/complete`, {
      method: "POST",
      headers: { origin: "https://jobs.example", "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCDE-FGHJK" }),
    });
    const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
    const completed = await fetch(`${base}/api/buddy/pairing/complete`, {
      method: "POST",
      headers: { origin: extensionOrigin, "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCDE-FGHJK" }),
    });

    expect(dashboardStart.status).toBe(200);
    expect(await dashboardStart.json()).toEqual({ code: "ABCDE-FGHJK", expiresAt: "2026-09-16T02:05:00.000Z" });
    expect(deniedComplete.status).toBe(403);
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ token: pairedToken });
    expect(testServices.buddy.pairComplete).toHaveBeenCalledWith({ code: "ABCDE-FGHJK", origin: extensionOrigin });
  });

  it("requires paired extension origin and bearer token for selected profile reads", async () => {
    const testServices = services();
    const base = await start(testServices);
    const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
    const missing = await fetch(`${base}/api/buddy/profile/select`, {
      method: "POST",
      headers: { origin: extensionOrigin, "content-type": "application/json" },
      body: JSON.stringify({ paths: ["identity.givenName"] }),
    });
    const allowed = await fetch(`${base}/api/buddy/profile/select`, {
      method: "POST",
      headers: { origin: extensionOrigin, authorization: `Bearer ${pairedToken}`, "content-type": "application/json" },
      body: JSON.stringify({ paths: ["identity.givenName"], profile: "must-ignore" }),
    });

    expect(missing.status).toBe(401);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ selection: { "identity.givenName": "Alex" } });
    expect(testServices.buddy.selectProfile).toHaveBeenCalledWith({ token: pairedToken, origin: extensionOrigin }, ["identity.givenName"]);
  });

  it("answers extension CORS preflight without opening non-Buddy routes", async () => {
    const base = await start(services());
    const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
    const allowed = await fetch(`${base}/api/buddy/profile/select`, {
      method: "OPTIONS",
      headers: {
        origin: extensionOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    const denied = await fetch(`${base}/api/gmail/status`, {
      method: "OPTIONS",
      headers: { origin: extensionOrigin, "access-control-request-method": "GET" },
    });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    expect(allowed.headers.get("access-control-allow-methods")).toContain("POST");
    expect(allowed.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
    expect(denied.status).toBe(404);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps activity listing dashboard-only while allowing authenticated extension appends", async () => {
    const testServices = services();
    const base = await start(testServices);
    const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
    const deniedList = await fetch(`${base}/api/buddy/activity`, { headers: { origin: extensionOrigin, authorization: `Bearer ${pairedToken}` } });
    const appended = await fetch(`${base}/api/buddy/activity`, {
      method: "POST",
      headers: { origin: extensionOrigin, authorization: `Bearer ${pairedToken}`, "content-type": "application/json" },
      body: JSON.stringify({ activity: { id: "activity-1" } }),
    });
    const dashboardList = await fetch(`${base}/api/buddy/activity`, { headers: { origin: "http://127.0.0.1:5173" } });

    expect(deniedList.status).toBe(403);
    expect(appended.status).toBe(204);
    expect(dashboardList.status).toBe(200);
    expect(await dashboardList.json()).toEqual({ activity: [] });
  });
});
