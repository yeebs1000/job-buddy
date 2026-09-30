import type { GmailConnectionStatus } from "../../domain/mail";

const setupErrors: Record<string, string> = {
  "setup-managed": "This client ID comes from the app environment or build. Update that configuration and restart the companion; this form cannot override it.",
  "disconnect-required": "Disconnect Gmail first, then save the replacement client ID. Your tracked applications will remain.",
  "connection-busy": "A Gmail connection operation is still finishing. Wait a moment, then retry.",
};
export class GmailSetupError extends Error {}

export interface GmailSettingsClient {
  configureDesktopClient(clientId: string, clientSecret?: string): Promise<void>;
  status(): Promise<GmailConnectionStatus>;
  start(): Promise<{ authorizationUrl: string }>;
  startPopup(signal?: AbortSignal): Promise<{ authorizationUrl: string; popupId: string }>;
  popupResult(popupId: string, signal?: AbortSignal): Promise<"pending" | "connected" | "error" | "expired" | "client-config">;
  disconnect(): Promise<{ revocationConfirmed: boolean }>;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("The local Gmail companion is not running");
  }
  if (!response.ok) {
    if (path === "/api/gmail/setup") {
      const payload = object(await response.json().catch(() => null));
      const error = object(payload?.error);
      const code = typeof error?.code === "string" ? error.code : "";
      if (Object.hasOwn(setupErrors, code)) throw new GmailSetupError(setupErrors[code]);
    }
    throw new Error("The local Gmail companion could not complete this request");
  }
  return response.status === 204 ? undefined : response.json().catch(() => { throw new Error("The local Gmail companion returned an invalid response"); });
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
  async configureDesktopClient(clientId, clientSecret) {
    await request("/api/gmail/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
  },
  async startPopup(signal) {
    const payload = object(await request("/api/gmail/oauth/start", { method: "POST", headers: { "content-type": "application/json" }, body: '{"popup":true}', signal }));
    if (!payload || typeof payload.authorizationUrl !== "string" || typeof payload.popupId !== "string" || !/^[a-f0-9]{48}$/.test(payload.popupId)) throw new Error("Invalid popup response");
    return { authorizationUrl: payload.authorizationUrl, popupId: payload.popupId };
  },
  async popupResult(popupId, signal) {
    const payload = object(await request("/api/gmail/oauth/popup-result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ popupId }), signal }));
    if (!payload || !["pending", "connected", "error", "expired", "client-config"].includes(String(payload.state))) throw new Error("Invalid popup result");
    return payload.state as "pending" | "connected" | "error" | "expired" | "client-config";
  },
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
