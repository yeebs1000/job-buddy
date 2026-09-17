import type { CompanionConfig } from "../config";
import type { GmailConnectionMetadata } from "../secrets/ConnectionMetadataStore";
import type { SecretStore } from "../secrets/SecretStore";
import type { GmailConnectionStatus } from "../../src/domain/mail";
import { GoogleOAuthClient, GoogleOAuthError, type GoogleTokens } from "./GoogleOAuthClient";
import { OAuthAttemptStore } from "./OAuthAttemptStore";
import { desktopClientIdSchema } from "./DesktopClientStore";

interface ConnectionMetadataPort {
  get(): Promise<GmailConnectionMetadata | null>;
  set(value: GmailConnectionMetadata): Promise<void>;
  delete(): Promise<void>;
}

interface GmailConnectionServiceOptions {
  config: CompanionConfig;
  secrets: SecretStore;
  metadata: ConnectionMetadataPort;
  fetcher?: typeof fetch;
  nowMs?: () => number;
  attempts?: OAuthAttemptStore;
  saveDesktopClientId?: (clientId: string) => Promise<void>;
}

export class GmailConnectionError extends Error {
  constructor(readonly code: "missing-config" | "platform-unsupported" | "invalid-state" | "offline-access-required" | "reconnect-required" | "request-failed" | "already-configured") {
    const messages = {
      "missing-config": "Google OAuth is not configured",
      "platform-unsupported": "Persistent Gmail connection requires Windows",
      "invalid-state": "This Gmail connection attempt expired or was already used",
      "offline-access-required": "Google did not grant offline access; reconnect and approve access again",
      "reconnect-required": "Gmail authorization must be renewed",
      "request-failed": "Gmail connection could not be completed",
      "already-configured": "Gmail client setup is already configured or in progress",
    } as const;
    super(messages[code]);
    this.name = "GmailConnectionError";
  }
}

export class GmailConnectionService {
  private oauth: GoogleOAuthClient | null;
  private configuring = false;
  private readonly attempts: OAuthAttemptStore;
  private readonly nowMs: () => number;
  private access: GoogleTokens | null = null;

  constructor(private readonly options: GmailConnectionServiceOptions) {
    this.nowMs = options.nowMs ?? Date.now;
    this.attempts = options.attempts ?? new OAuthAttemptStore();
    this.oauth = options.config.google ? new GoogleOAuthClient(options.config.google, options.fetcher, this.nowMs) : null;
  }

  async status(): Promise<GmailConnectionStatus> {
    const platformSupported = this.options.secrets.isSupported();
    if (!this.options.config.google) return { state: "unconfigured", platformSupported, lastError: "missing-config" };
    if (!platformSupported) return { state: "disconnected", platformSupported, lastError: "platform-unsupported" };
    const metadata = await this.options.metadata.get();
    if (!metadata) return { state: "disconnected", platformSupported };
    if (metadata.state === "reconnect-required") {
      return { state: "reconnect-required", accountEmail: metadata.accountEmail, platformSupported, lastError: "token-revoked" };
    }
    const refreshToken = await this.options.secrets.get("gmail-refresh-token").catch(() => null);
    if (!refreshToken) return { state: "disconnected", platformSupported };
    return { state: "connected", accountEmail: metadata.accountEmail, platformSupported };
  }

  async configureDesktopClient(input: string): Promise<void> {
    const clientId = desktopClientIdSchema.parse(input);
    if (this.oauth || this.configuring) throw new GmailConnectionError("already-configured");
    if (!this.options.secrets.isSupported()) throw new GmailConnectionError("platform-unsupported");
    if (!this.options.saveDesktopClientId) throw new GmailConnectionError("missing-config");
    this.configuring = true;
    try {
      await this.options.saveDesktopClientId(clientId);
      this.options.config.google = { clientId, redirectUri: "http://127.0.0.1:43117/api/gmail/oauth/callback" };
      this.oauth = new GoogleOAuthClient(this.options.config.google, this.options.fetcher, this.nowMs);
    } finally { this.configuring = false; }
  }

  async start(now = new Date(this.nowMs()).toISOString()): Promise<{ authorizationUrl: string }> {
    const oauth = this.requireOAuth();
    if (!this.options.secrets.isSupported()) throw new GmailConnectionError("platform-unsupported");
    const attempt = this.attempts.create(now);
    return { authorizationUrl: oauth.authorizationUrl(attempt) };
  }

  async complete(input: { code: string; state: string; now?: string }): Promise<void> {
    const oauth = this.requireOAuth();
    if (!this.options.secrets.isSupported()) throw new GmailConnectionError("platform-unsupported");
    const now = input.now ?? new Date(this.nowMs()).toISOString();
    const attempt = this.attempts.consume(input.state, now);
    if (!attempt || !input.code) throw new GmailConnectionError("invalid-state");
    let tokens: GoogleTokens;
    try {
      tokens = await oauth.exchangeCode({ code: input.code, codeVerifier: attempt.codeVerifier });
    } catch {
      throw new GmailConnectionError("request-failed");
    }
    if (!tokens.refreshToken) throw new GmailConnectionError("offline-access-required");
    let profile: { emailAddress: string };
    try {
      profile = await oauth.profile(tokens.accessToken);
    } catch {
      throw new GmailConnectionError("request-failed");
    }
    await this.options.secrets.set("gmail-refresh-token", tokens.refreshToken);
    try {
      await this.options.metadata.set({ accountEmail: profile.emailAddress, connectedAt: now, state: "connected" });
    } catch (error) {
      await this.options.secrets.delete("gmail-refresh-token");
      throw error;
    }
    this.access = tokens;
  }

  async getAccessToken(): Promise<string> {
    const oauth = this.requireOAuth();
    if (this.access && this.access.expiresAt > this.nowMs() + 30_000) return this.access.accessToken;
    const refreshToken = await this.options.secrets.get("gmail-refresh-token");
    if (!refreshToken) throw new GmailConnectionError("reconnect-required");
    try {
      this.access = await oauth.refreshAccessToken(refreshToken);
      return this.access.accessToken;
    } catch (error) {
      if (error instanceof GoogleOAuthError && error.code === "invalid-grant") {
        const metadata = await this.options.metadata.get();
        if (metadata) await this.options.metadata.set({ ...metadata, state: "reconnect-required" });
        await this.options.secrets.delete("gmail-refresh-token");
        this.access = null;
        throw new GmailConnectionError("reconnect-required");
      }
      throw new GmailConnectionError("request-failed");
    }
  }

  async disconnect(): Promise<{ revocationConfirmed: boolean }> {
    const oauth = this.oauth;
    const refreshToken = this.options.secrets.isSupported()
      ? await this.options.secrets.get("gmail-refresh-token").catch(() => null)
      : null;
    const revocationConfirmed = Boolean(oauth && refreshToken && await oauth.revoke(refreshToken));
    if (this.options.secrets.isSupported()) await this.options.secrets.delete("gmail-refresh-token");
    await this.options.metadata.delete();
    this.access = null;
    return { revocationConfirmed };
  }

  private requireOAuth(): GoogleOAuthClient {
    if (!this.oauth) throw new GmailConnectionError("missing-config");
    return this.oauth;
  }
}
