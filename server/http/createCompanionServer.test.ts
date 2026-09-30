import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCandidateProfile } from "../../src/domain/profile";
import { defaultBuddyPreferences } from "../../src/domain/buddy";
import { createCompanionServer, type CompanionServerServices } from "./createCompanionServer";

const openServers: Array<ReturnType<typeof createCompanionServer>> = [];
const pairedToken = "paired-token-abcdefghijklmnopqrstuvwxyz";

it("keeps Tavily settings secret and requires exact protected routes", async () => {
  let configured = false;
  const status = async () => ({ configured, platformSupported: true, usage: { month: "2026-09", used: 0, limit: 1000 as const } });
  const base = await start(services({ webSalary: { status, configure: async () => { configured = true; }, removeKey: async () => { configured = false; }, search: vi.fn() } }));
  const request = (method: string, body?: unknown, origin: string | null = "http://127.0.0.1:5173", path = "key") => fetch(`${base}/api/research/web-salary/${path}`, { method, headers: { ...(origin === null ? {} : { origin }), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const origin of [null, "null", "https://evil.example"]) expect((await request("POST", { apiKey: "tvly-synthetic-only" }, origin)).status).toBe(403);
  expect((await request("POST", { apiKey: "tvly-synthetic-only", extra: true })).status).toBe(400);
  expect((await request("POST", { apiKey: "x".repeat(3000) })).status).toBe(413);
  const saved = await request("POST", { apiKey: "tvly-synthetic-only" });
  expect(saved.status).toBe(200); expect(saved.headers.get("cache-control")).toBe("no-store");
  expect(await saved.json()).toEqual(await status());
  expect(configured).toBe(true);
  expect((await request("GET", undefined, "http://127.0.0.1:5173", "other/status")).status).not.toBe(200);
  expect((await request("DELETE")).status).toBe(200); expect(configured).toBe(false);
});

it("allows extension preference reads by POST only with extension origin and bearer token", async () => {
  const service = services(); const base = await start(service);
  const origin = `chrome-extension://${"a".repeat(32)}`;
  const request = (headers: Record<string, string>) => fetch(base + "/api/buddy/preferences/read", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });
  expect((await request({ origin, authorization: `Bearer ${pairedToken}` })).status).toBe(200);
  expect((await request({ origin })).status).toBe(401);
  expect((await request({ authorization: `Bearer ${pairedToken}` })).status).toBe(403);
  expect((await request({ origin: "https://jobs.example", authorization: `Bearer ${pairedToken}` })).status).toBe(403);
  expect((await request({ origin: "http://127.0.0.1:5173", authorization: `Bearer ${pairedToken}` })).status).toBe(403);
  expect(service.buddy.readPreferences).toHaveBeenCalledExactlyOnceWith({ token: pairedToken, origin });
});

it("forwards validated batch checkpoints and rejects malformed ones", async () => {
  const service = services(); const base = await start(service);
  const token = `${"a".repeat(32)}:25`;
  const request = (body: unknown) => fetch(`${base}/api/gmail/scan`, { method: "POST", headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await request({ cursor: null, initialSyncConfirmed: true, batch: true, continuationToken: token })).status).toBe(200);
  expect(service.sync.scan).toHaveBeenCalledWith({ cursor: null, initialSyncConfirmed: true, batch: true, continuationToken: token });
  expect((await request({ cursor: null, initialSyncConfirmed: true, batch: true, continuationToken: "invalid" })).status).toBe(400);
  expect((await request({ cursor: null, initialSyncConfirmed: true, continuationToken: token })).status).toBe(400);
  expect(service.sync.scan).toHaveBeenCalledTimes(1);
});

it.each(["gmail-timeout", "gmail-network-error", "gmail-response-invalid", "gmail-normalization-failed", "gmail-scan-expired"])("exposes only the safe %s code", async code => {
  const base = await start(services({ sync: { scan: async () => { throw Object.assign(new Error("private mailbox detail"), { code }); } } }));
  const response = await fetch(`${base}/api/gmail/scan`, { method: "POST", headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" }, body: JSON.stringify({ cursor: null, initialSyncConfirmed: true }) });
  expect(response.ok).toBe(false);
  expect(await response.json()).toEqual({ error: { code } });
});

it.each(["disconnect", "oauth/start"])("invalidates scan checkpoints before %s", async action => {
  const service = services(); service.sync.reset = vi.fn();
  const base = await start(service);
  const response = await fetch(`${base}/api/gmail/${action}`, { method: "POST", headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" }, body: "{}" });
  expect(response.ok).toBe(true);
  expect(service.sync.reset).toHaveBeenCalledOnce();
});

it("returns a safe actionable quota code from scans without provider details", async () => {
  const base = await start(services({ sync: { scan: async () => { throw Object.assign(new Error("private mailbox detail"), { code: "gmail-rate-limited" }); } } }));
  const response = await fetch(`${base}/api/gmail/scan`, { method: "POST", headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" }, body: JSON.stringify({ cursor: null, initialSyncConfirmed: true }) });
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: { code: "gmail-rate-limited" } });
});

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
      listSalaryEvidence: vi.fn().mockResolvedValue([]),
      deleteSalaryEvidence: vi.fn().mockResolvedValue(undefined),
      addSalaryEvidence: vi.fn().mockImplementation(async (_auth, evidence) => evidence),
    },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("createCompanionServer", () => {
  it("accepts browser same-origin reads without Origin, but rejects cross-site and rebinding hosts", async () => {
    const base = await start(services());
    // Node fetch rewrites Host; use HTTP directly to exercise browser headers.
    const status = (path: string, headers: Record<string, string>, method = "GET") => new Promise<number>((resolve, reject) => {
      const request = httpRequest(base + path, { headers, method }, (response) => { response.resume(); resolve(response.statusCode!); });
      request.on("error", reject); request.end(method === "POST" ? "{}" : undefined);
    });
    const browserHeaders = { host: "127.0.0.1:5173", "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
    expect(await status("/api/buddy/status", browserHeaders)).toBe(200);
    expect(await status("/api/buddy/preferences", browserHeaders)).toBe(200);
    for (const headers of [{}, { ...browserHeaders, "sec-fetch-site": "cross-site" }, { ...browserHeaders, host: "evil.example" }, { ...browserHeaders, origin: "https://evil.example" }, { ...browserHeaders, "sec-fetch-mode": "navigate" }]) {
      expect(await status("/api/buddy/status", headers)).toBe(403);
    }
    expect(await status("/api/buddy/pairing/start", { ...browserHeaders, "content-type": "application/json" }, "POST")).toBe(403);
  });

  it("validates desktop setup and requires an explicit allowed Origin", async () => {
    let saved = "";
    const testServices = services();
    testServices.connection.configureDesktopClient = async (id: string) => { saved = id; };
    const base = await start(testServices);
    const send = (body: unknown, origin = "http://127.0.0.1:5173") => fetch(`${base}/api/gmail/setup`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await send({ clientId: "123-test.apps.googleusercontent.com" }, "https://evil.example")).status).toBe(403);
    expect((await send({ clientId: "invalid\nSETTING=bad" })).status).toBe(400);
    expect((await send({ clientId: "123-test.apps.googleusercontent.com", clientSecret: "invalid\nsecret" })).status).toBe(400);
    expect(saved).toBe("");
    expect((await send({ clientId: "123-test.apps.googleusercontent.com" })).status).toBe(204);
    expect(saved).toBe("123-test.apps.googleusercontent.com");
    testServices.connection.configureDesktopClient = async (id, secret) => { saved = `${id}:${secret}`; };
    const response = await send({ clientId: "123-test.apps.googleusercontent.com", clientSecret: "fixture-secret" });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(saved).toBe("123-test.apps.googleusercontent.com:fixture-secret");
  });

  it("returns only a safe credential error for the initiating popup", async () => {
    const testServices = services();
    testServices.connection.start = async () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=client-failure" });
    testServices.connection.complete = async () => { throw Object.assign(new Error("PRIVATE PROVIDER DETAIL"), { code: "client-config" }); };
    const base = await start(testServices);
    const headers = { origin: "http://127.0.0.1:5173", "content-type": "application/json" };
    const { popupId } = await (await fetch(`${base}/api/gmail/oauth/start`, { method: "POST", headers, body: '{"popup":true}' })).json() as { popupId: string };
    const callback = await (await fetch(`${base}/api/gmail/oauth/callback?state=client-failure&code=private-code`)).text();
    expect(callback).not.toContain("PRIVATE PROVIDER DETAIL");
    expect(callback).not.toContain("private-code");
    const receipt = await fetch(`${base}/api/gmail/oauth/popup-result`, { method: "POST", headers, body: JSON.stringify({ popupId }) });
    expect(await receipt.json()).toEqual({ state: "client-config" });
  });

  it("does not process duplicate popup callbacks while the first exchange is pending", async () => {
    const testServices = services();
    testServices.connection.start = async () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=one-use" });
    let finish!: () => void;
    let entered!: () => void;
    const exchanging = new Promise<void>((resolve) => { entered = resolve; });
    testServices.connection.complete = vi.fn(() => { entered(); return new Promise<void>((resolve) => { finish = resolve; }); });
    const base = await start(testServices);
    const headers = { origin: "http://127.0.0.1:5173", "content-type": "application/json" };
    const { popupId } = await (await fetch(`${base}/api/gmail/oauth/start`, { method: "POST", headers, body: '{"popup":true}' })).json() as { popupId: string };
    const callbackUrl = `${base}/api/gmail/oauth/callback?state=one-use&code=private-code`;
    const original = fetch(callbackUrl);
    await exchanging;
    try {
      expect(await (await fetch(callbackUrl)).text()).toContain("Sign-in is processing");
      expect(testServices.connection.complete).toHaveBeenCalledOnce();
    } finally { finish(); await original; }
    expect(await (await fetch(`${base}/api/gmail/oauth/popup-result`, { method: "POST", headers, body: JSON.stringify({ popupId }) })).json()).toEqual({ state: "connected" });
    expect(await (await fetch(callbackUrl)).text()).toContain("Gmail connected");
    expect(testServices.connection.complete).toHaveBeenCalledOnce();
  });

  it("invalidates pending popup receipts on disconnect", async () => {
    const testServices = services();
    testServices.connection.start = async () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=disconnected" });
    const base = await start(testServices);
    const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" }, body: JSON.stringify(body) });
    const { popupId } = await (await post("/api/gmail/oauth/start", { popup: true })).json() as { popupId: string };
    await post("/api/gmail/disconnect", {});
    expect(await (await post("/api/gmail/oauth/popup-result", { popupId })).json()).toEqual({ state: "error" });
    expect(await (await fetch(`${base}/api/gmail/oauth/callback?state=disconnected&code=old`)).text()).toContain("Sign-in did not finish");
  });

  it("completes a popup without redirecting the dashboard or exposing OAuth values", async () => {
    const testServices = services();
    testServices.connection.start = async () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=popup-state" });
    const base = await start(testServices);
    const post = (path: string, body: unknown, origin = "http://127.0.0.1:5173") => fetch(base + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    const started = await post("/api/gmail/oauth/start", { popup: true });
    const { popupId } = await started.json() as { popupId: string };
    expect(popupId).toMatch(/^[a-f0-9]{48}$/);
    expect(await (await post("/api/gmail/oauth/popup-result", { popupId })).json()).toEqual({ state: "pending" });
    const callback = await fetch(`${base}/api/gmail/oauth/callback?state=popup-state&code=private-code`, { redirect: "manual" });
    expect(callback.status).toBe(200);
    expect(callback.headers.get("location")).toBeNull();
    expect(callback.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await callback.text();
    expect(html).toContain("window.close()");
    expect(html).not.toContain("private-code");
    expect(html).not.toContain("popup-state");
    expect(await (await post("/api/gmail/oauth/popup-result", { popupId })).json()).toEqual({ state: "connected" });
    expect(await (await post("/api/gmail/oauth/popup-result", { popupId }, "http://127.0.0.1:43117")).json()).toEqual({ state: "expired" });
    expect((await post("/api/gmail/oauth/popup-result", { popupId }, "https://evil.example")).status).toBe(403);
  });

  it("reports cancelled or failed popup authorization without connecting", async () => {
    const testServices = services();
    testServices.connection.start = async () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=cancelled-state" });
    testServices.connection.complete = vi.fn().mockRejectedValue(new Error("private provider detail"));
    const base = await start(testServices);
    const headers = { origin: "http://127.0.0.1:5173", "content-type": "application/json" };
    const { popupId } = await (await fetch(`${base}/api/gmail/oauth/start`, { method: "POST", headers, body: '{"popup":true}' })).json() as { popupId: string };
    const callback = await fetch(`${base}/api/gmail/oauth/callback?state=cancelled-state&error=access_denied`);
    expect(await callback.text()).not.toContain("private provider detail");
    expect(await (await fetch(`${base}/api/gmail/oauth/popup-result`, { method: "POST", headers, body: JSON.stringify({ popupId }) })).json()).toEqual({ state: "error" });
  });
  it("restricts discovery and FX to dashboard POSTs with validated identifiers", async () => {
    const discovery = { list: vi.fn().mockResolvedValue({ jobs: [], truncated: false, retrievedAt: "2026-09-16T12:00:00Z" }), salary: vi.fn().mockResolvedValue([]) };
    const fx = { quote: vi.fn().mockResolvedValue({ base: "USD", quote: "SGD", date: "2026-09-16", rate: 1.27, retrievedAt: "2026-09-16T12:00:00Z", sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" }) };
    const base = await start(services({ discovery, fx }));
    const post = (path: string, body: unknown, origin = "http://127.0.0.1:5173") => fetch(base + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post("/api/discovery/jobs", { provider: "greenhouse", token: "example" }, "https://evil.example")).status).toBe(403);
    expect((await post("/api/discovery/jobs", { provider: "greenhouse", token: "../secret" })).status).toBe(400);
    expect((await post("/api/discovery/jobs", { provider: "greenhouse", token: "example" })).status).toBe(200);
    expect(discovery.list).toHaveBeenCalledWith({ provider: "greenhouse", token: "example", region: "global" });
    expect((await post("/api/research/fx", { base: "USD", quote: "XXX" })).status).toBe(400);
    expect((await post("/api/research/fx", { base: "USD", quote: "SGD" })).status).toBe(200);
    expect(fx.quote).toHaveBeenCalledWith("USD", "SGD");
  });
  it("keeps salary evidence behind the paired-extension and dashboard boundaries", async () => {
    const testServices = services();
    const base = await start(testServices);
    const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
    const evidence = { id: "salary-1", market: "US", currency: "USD", period: "annual", minimum: 120_000, maximum: 165_000,
      sourceUrl: "https://jobs.example/role", detectedAt: "2026-09-16T01:00:00.000Z" };

    const queued = await fetch(`${base}/api/buddy/salary-evidence`, {
      method: "POST", headers: { origin: extensionOrigin, authorization: `Bearer ${pairedToken}`, "content-type": "application/json" },
      body: JSON.stringify({ evidence }),
    });
    const listed = await fetch(`${base}/api/buddy/salary-evidence`, { headers: { origin: "http://127.0.0.1:5173" } });
    const denied = await fetch(`${base}/api/buddy/salary-evidence`, { headers: { origin: "https://evil.example" } });

    expect(queued.status).toBe(201);
    expect(testServices.buddy.addSalaryEvidence).toHaveBeenCalledWith({ token: pairedToken, origin: extensionOrigin }, evidence);
    expect(listed.status).toBe(200);
    expect(denied.status).toBe(403);
  });
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
it("protects web search with origin and strict public-field validation and hides provider errors", async () => {
  const search = vi.fn().mockResolvedValue({ results: [], searchedAt: "2026-09-19T00:00:00.000Z" });
  const base = await start(services({ webSalary: { status: () => ({ configured: true }), search } }));
  const query = { company: "Test Employer", role: "Analyst", location: "Hong Kong" };
  const post = (body: unknown, origin = "http://127.0.0.1:5173") => fetch(`${base}/api/research/web-salary/search`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await post(query, "https://evil.example")).status).toBe(403);
  expect((await post({ ...query, resume: "private" })).status).toBe(400);
  expect(search).not.toHaveBeenCalled();
  expect((await post(query)).status).toBe(200);
  expect(search).toHaveBeenCalledExactlyOnceWith(query);
  search.mockRejectedValue(new Error("secret-provider-detail"));
  const failed = await post(query);
  expect(await failed.json()).toEqual({ error: { code: "web-search-failed" } });
  for (const code of ["web-search-unavailable", "web-search-invalid-key", "web-search-storage-unavailable"]) {
    search.mockRejectedValue(new Error(code));
    const actionable = await post(query);
    expect(actionable.status).toBe(503);
    expect(await actionable.json()).toEqual({ error: { code } });
  }
});
