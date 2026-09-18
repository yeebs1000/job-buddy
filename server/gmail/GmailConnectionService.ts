import type { CompanionConfig } from "../config";
import type { GmailConnectionMetadata } from "../secrets/ConnectionMetadataStore";
import type { SecretStore } from "../secrets/SecretStore";
import type { GmailConnectionStatus } from "../../src/domain/mail";
import { GoogleOAuthClient, GoogleOAuthError, type GoogleTokens } from "./GoogleOAuthClient";
import { OAuthAttemptStore } from "./OAuthAttemptStore";
import { desktopClientIdSchema, desktopClientSecretSchema } from "./DesktopClientStore";

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
  saveDesktopClientId?: (clientId: string, clientSecret?: string) => Promise<void>;
  allowDesktopClientChanges?: boolean;
}

export class GmailConnectionError extends Error {
  constructor(readonly code: "missing-config" | "platform-unsupported" | "invalid-state" | "offline-access-required" | "reconnect-required" | "request-failed" | "setup-managed" | "disconnect-required" | "connection-busy" | "client-config") {
    const messages = {
      "missing-config": "Google OAuth is not configured",
      "platform-unsupported": "Persistent Gmail connection requires Windows",
      "invalid-state": "This Gmail connection attempt expired or was already used",
      "offline-access-required": "Google did not grant offline access; reconnect and approve access again",
      "reconnect-required": "Gmail authorization must be renewed",
      "request-failed": "Gmail connection could not be completed",
      "setup-managed": "This client ID is managed by the app environment or build",
      "disconnect-required": "Disconnect Gmail before changing the client ID",
      "connection-busy": "Wait for the current Gmail connection operation to finish",
      "client-config": "Google rejected the OAuth client credentials; check the matching Desktop client ID and secret",
    } as const;
    super(messages[code]);
    this.name = "GmailConnectionError";
  }
}

export class GmailConnectionService {
  private oauth: GoogleOAuthClient | null;
  private configuring = false;
  private completing = false;
  private readonly editable: boolean;
  private readonly attempts: OAuthAttemptStore;
  private readonly nowMs: () => number;
  private access: GoogleTokens | null = null;
  private generation = 0;
  private disconnecting = 0;
  private mutations: Promise<unknown> = Promise.resolve();

  private mutate<T>(action: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(action);
    this.mutations = result.catch(() => undefined);
    return result;
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new GmailConnectionError("invalid-state");
  }

  constructor(private readonly options: GmailConnectionServiceOptions) {
    this.nowMs = options.nowMs ?? Date.now;
    this.editable = options.allowDesktopClientChanges ?? !options.config.google;
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

  async configureDesktopClient(input: string, secretInput?: string): Promise<void> {
    const clientId = desktopClientIdSchema.parse(input);
    const clientSecret = desktopClientSecretSchema.optional().parse(secretInput);
    if (!this.editable) throw new GmailConnectionError("setup-managed");
    if (this.configuring || this.completing || this.disconnecting) throw new GmailConnectionError("connection-busy");
    if (!this.options.secrets.isSupported()) throw new GmailConnectionError("platform-unsupported");
    if (!this.options.saveDesktopClientId) throw new GmailConnectionError("missing-config");
    this.configuring = true;
    try {
      if (await this.options.secrets.get("gmail-refresh-token") || await this.options.metadata.get()) {
        throw new GmailConnectionError("disconnect-required");
      }
      await this.options.saveDesktopClientId(clientId, clientSecret);
      this.options.config.google = { clientId, ...(clientSecret ? { clientSecret } : {}), redirectUri: "http://127.0.0.1:43117/api/gmail/oauth/callback" };
      this.oauth = new GoogleOAuthClient(this.options.config.google, this.options.fetcher, this.nowMs);
      this.attempts.clear();
      this.access = null;
    } finally { this.configuring = false; }
  }

  async start(now = new Date(this.nowMs()).toISOString()): Promise<{ authorizationUrl: string }> {
    const oauth = this.requireOAuth();
    if (!this.options.secrets.isSupported()) throw new GmailConnectionError("platform-unsupported");
    const attempt = this.attempts.create(now);
    return { authorizationUrl: oauth.authorizationUrl(attempt) };
  }

  async complete(input: { code: string; state: string; now?: string }): Promise<void> {
    if (this.configuring || this.completing) throw new GmailConnectionError("connection-busy");
    this.completing = true;
    try { await this.completeAttempt(input); }
    finally { this.completing = false; }
  }

  private async completeAttempt(input: { code: string; state: string; now?: string }): Promise<void> {
    const oauth = this.requireOAuth();
    const generation = this.generation;
    if (!this.options.secrets.isSupported()) throw new GmailConnectionError("platform-unsupported");
    const now = input.now ?? new Date(this.nowMs()).toISOString();
    const attempt = this.attempts.consume(input.state, now);
    if (!attempt || !input.code) throw new GmailConnectionError("invalid-state");
    let tokens: GoogleTokens;
    try {
      tokens = await oauth.exchangeCode({ code: input.code, codeVerifier: attempt.codeVerifier });
    } catch (error) {
      if (error instanceof GoogleOAuthError && error.code === "client-config") throw new GmailConnectionError("client-config");
      throw new GmailConnectionError("request-failed");
    }
    if (!tokens.refreshToken) throw new GmailConnectionError("offline-access-required");
    let profile: { emailAddress: string };
    try {
      profile = await oauth.profile(tokens.accessToken);
    } catch {
      throw new GmailConnectionError("request-failed");
    }
    await this.mutate(async () => {
      this.assertCurrent(generation);
      await this.options.secrets.set("gmail-refresh-token", tokens.refreshToken!);
      try {
        this.assertCurrent(generation);
        await this.options.metadata.set({ accountEmail: profile.emailAddress, connectedAt: now, state: "connected" });
        this.assertCurrent(generation);
      } catch (error) {
        await this.options.secrets.delete("gmail-refresh-token");
        throw error;
      }
      this.access = tokens;
    });
  }

  async getAccessToken(): Promise<string> {
    const oauth = this.requireOAuth();
    const generation = this.generation;
    if (this.access && this.access.expiresAt > this.nowMs() + 30_000) return this.access.accessToken;
    const refreshToken = await this.options.secrets.get("gmail-refresh-token");
    if (!refreshToken) throw new GmailConnectionError("reconnect-required");
    try {
      const tokens = await oauth.refreshAccessToken(refreshToken);
      this.assertCurrent(generation);
      this.access = tokens;
      return this.access.accessToken;
    } catch (error) {
      if (error instanceof GoogleOAuthError && error.code === "invalid-grant") {
        await this.mutate(async () => {
          this.assertCurrent(generation);
          const metadata = await this.options.metadata.get();
          this.assertCurrent(generation);
          if (metadata) await this.options.metadata.set({ ...metadata, state: "reconnect-required" });
          await this.options.secrets.delete("gmail-refresh-token");
          this.access = null;
        });
        throw new GmailConnectionError("reconnect-required");
      }
      throw new GmailConnectionError("request-failed");
    }
  }

  async disconnect(): Promise<{ revocationConfirmed: boolean }> {
    this.generation += 1;
    this.attempts.clear();
    this.access = null;
    this.disconnecting += 1;
    const oauth = this.oauth;
    try {
      const refreshToken = await this.mutate(async () => {
        const token = this.options.secrets.isSupported() ? await this.options.secrets.get("gmail-refresh-token").catch(() => null) : null;
        if (this.options.secrets.isSupported()) await this.options.secrets.delete("gmail-refresh-token");
        await this.options.metadata.delete();
        return token;
      });
      const revocationConfirmed = Boolean(oauth && refreshToken && await oauth.revoke(refreshToken));
      return { revocationConfirmed };
    } finally { this.disconnecting -= 1; }
  }

  private requireOAuth(): GoogleOAuthClient {
    if (this.configuring || this.disconnecting) throw new GmailConnectionError("connection-busy");
    if (!this.oauth) throw new GmailConnectionError("missing-config");
    return this.oauth;
  }
}
