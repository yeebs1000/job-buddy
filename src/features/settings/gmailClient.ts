import type { GmailConnectionStatus } from "../../domain/mail";

export interface GmailSettingsClient {
  status(): Promise<GmailConnectionStatus>;
  start(): Promise<{ authorizationUrl: string }>;
  disconnect(): Promise<{ revocationConfirmed: boolean }>;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error("The local Gmail companion is not running");
  }
  if (!response.ok) throw new Error("The local Gmail companion could not complete this request");
  return response.json().catch(() => { throw new Error("The local Gmail companion returned an invalid response"); });
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseStatus(value: unknown): GmailConnectionStatus {
  const item = object(value);
  const states = ["unconfigured", "disconnected", "connected", "reconnect-required"];
  const errors = ["missing-config", "token-revoked", "platform-unsupported"];
  if (!item || typeof item.state !== "string" || !states.includes(item.state)
    || typeof item.platformSupported !== "boolean"
    || (item.accountEmail !== undefined && typeof item.accountEmail !== "string")
    || (item.lastError !== undefined && (typeof item.lastError !== "string" || !errors.includes(item.lastError)))) {
    throw new Error("The local Gmail companion returned an invalid status");
  }
  return {
    state: item.state as GmailConnectionStatus["state"],
    platformSupported: item.platformSupported,
    ...(typeof item.accountEmail === "string" ? { accountEmail: item.accountEmail } : {}),
    ...(typeof item.lastError === "string" ? { lastError: item.lastError as NonNullable<GmailConnectionStatus["lastError"]> } : {}),
  };
}

export const gmailClient: GmailSettingsClient = {
  async status() { return parseStatus(await request("/api/gmail/status")); },
  async start() {
    const payload = object(await request("/api/gmail/oauth/start", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    if (!payload || typeof payload.authorizationUrl !== "string") throw new Error("The local Gmail companion returned an invalid authorization link");
    const url = new URL(payload.authorizationUrl);
    if (url.protocol !== "https:" || url.hostname !== "accounts.google.com") throw new Error("The local Gmail companion returned an invalid authorization link");
    return { authorizationUrl: url.toString() };
  },
  async disconnect() {
    const payload = object(await request("/api/gmail/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    if (!payload || typeof payload.revocationConfirmed !== "boolean") throw new Error("The local Gmail companion returned an invalid disconnect result");
    return { revocationConfirmed: payload.revocationConfirmed };
  },
};
