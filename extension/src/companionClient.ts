import {
  buddyActivityEntrySchema,
  buddyPreferencesSchema,
  parsePendingCapture,
  parsePendingSalaryEvidence,
  type BuddyActivityEntry,
  type BuddyPreferences,
  type PendingCapture,
  type PendingSalaryEvidence,
} from "../../src/domain/buddy";
import { parseProfilePath, type ProfileSelection } from "../../src/domain/profile";

export interface TokenStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export interface CompanionClientOptions {
  fetcher?: typeof fetch;
  storage?: TokenStorage;
  baseUrl?: string;
}

export class CompanionClientError extends Error {
  constructor(readonly code: "unpaired" | "companion-offline" | "request-failed" | "invalid-pairing" | "origin-not-allowed") { super(code); }
}

const chromeTokenStorage: TokenStorage = {
  async getToken() {
    const result = await chrome.storage.local.get("buddyToken");
    return typeof result.buddyToken === "string" ? result.buddyToken : null;
  },
  async setToken(token) { await chrome.storage.local.set({ buddyToken: token }); },
  async clearToken() { await chrome.storage.local.remove("buddyToken"); },
};

export class CompanionClient {
  private readonly fetcher: typeof fetch;
  private readonly storage: TokenStorage;
  private readonly baseUrl: string;

  constructor(options: CompanionClientOptions = {}) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.storage = options.storage ?? chromeTokenStorage;
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:43117";
  }

  async status(): Promise<{ paired: boolean }> {
    if (!await this.storage.getToken()) return { paired: false };
    try { await this.getPreferences(); return { paired: true }; }
    catch (error) {
      if (error instanceof CompanionClientError && error.code === "unpaired") return { paired: false };
      throw error;
    }
  }

  async pair(code: string): Promise<{ paired: true }> {
    const body = await this.sendJson("/api/buddy/pairing/complete", { method: "POST", body: { code }, authenticated: false });
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).token !== "string") throw new CompanionClientError("request-failed");
    await this.storage.setToken((body as { token: string }).token);
    return { paired: true };
  }

  async selectProfile(paths: readonly string[]): Promise<ProfileSelection> {
    const validatedPaths = paths.map(parseProfilePath);
    const body = await this.sendJson("/api/buddy/profile/select", { method: "POST", body: { paths: validatedPaths } });
    if (!body || typeof body !== "object" || !("selection" in body) || !body.selection || typeof body.selection !== "object") throw new CompanionClientError("request-failed");
    const selection: ProfileSelection = {};
    for (const [rawPath, value] of Object.entries(body.selection as Record<string, unknown>)) {
      const path = parseProfilePath(rawPath);
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value) && value.every((item) => typeof item === "string")) selection[path] = value;
      else throw new CompanionClientError("request-failed");
    }
    return selection;
  }

  async getPreferences(): Promise<BuddyPreferences> {
    // Privileged Chromium extension GETs can omit Origin; POST preserves the
    // browser-controlled origin required by the companion's authentication gate.
    const body = await this.sendJson("/api/buddy/preferences/read", { method: "POST", body: {} });
    if (!body || typeof body !== "object" || !("preferences" in body)) throw new CompanionClientError("request-failed");
    return buddyPreferencesSchema.parse(body.preferences);
  }

  async updatePreferences(patch: unknown): Promise<BuddyPreferences> {
    const body = await this.sendJson("/api/buddy/preferences", { method: "PUT", body: patch });
    if (!body || typeof body !== "object" || !("preferences" in body)) throw new CompanionClientError("request-failed");
    return buddyPreferencesSchema.parse(body.preferences);
  }

  async recordActivity(activity: BuddyActivityEntry): Promise<void> {
    await this.sendJson("/api/buddy/activity", { method: "POST", body: { activity: buddyActivityEntrySchema.parse(activity) }, expectJson: false });
  }

  async queueCapture(capture: PendingCapture): Promise<void> {
    await this.sendJson("/api/buddy/captures", { method: "POST", body: { capture: parsePendingCapture(capture) } });
  }

  async queueSalaryEvidence(evidence: PendingSalaryEvidence): Promise<void> {
    await this.sendJson("/api/buddy/salary-evidence", { method: "POST", body: { evidence: parsePendingSalaryEvidence(evidence) } });
  }

  private async sendJson(path: string, options: { method: "GET" | "POST" | "PUT"; body?: unknown; authenticated?: boolean; expectJson?: boolean }): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.authenticated !== false) {
      const token = await this.storage.getToken();
      if (!token) throw new CompanionClientError("unpaired");
      headers.authorization = `Bearer ${token}`;
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: options.method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new CompanionClientError("companion-offline");
    }
    if (response.status === 401) {
      await this.storage.clearToken();
      throw new CompanionClientError("unpaired");
    }
    if (!response.ok) {
      let code: unknown;
      try { code = (await response.json())?.error?.code; } catch { /* Never expose arbitrary response text. */ }
      throw new CompanionClientError(code === "invalid-pairing" || code === "origin-not-allowed" ? code : "request-failed");
    }
    if (options.expectJson === false || response.status === 204) return undefined;
    try { return await response.json(); }
    catch { throw new CompanionClientError("request-failed"); }
  }
}

export const companionClient = new CompanionClient();
