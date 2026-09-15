import type { CompanionConfig } from "../config";
import type { OAuthAttempt } from "./OAuthAttemptStore";

const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const profileEndpoint = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const revokeEndpoint = "https://oauth2.googleapis.com/revoke";

export interface GoogleTokens {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

export type GoogleOAuthErrorCode = "invalid-grant" | "request-failed" | "invalid-response";

export class GoogleOAuthError extends Error {
  constructor(readonly code: GoogleOAuthErrorCode) {
    super(code === "invalid-grant" ? "Google authorization must be renewed" : "Google authorization could not be completed");
    this.name = "GoogleOAuthError";
  }
}

type GoogleConfig = NonNullable<CompanionConfig["google"]>;
type Fetcher = typeof fetch;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export class GoogleOAuthClient {
  constructor(
    private readonly config: GoogleConfig,
    private readonly fetcher: Fetcher = fetch,
    private readonly nowMs: () => number = Date.now,
  ) {}

  authorizationUrl(attempt: OAuthAttempt): string {
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: gmailReadonlyScope,
      access_type: "offline",
      prompt: "consent",
      state: attempt.state,
      code_challenge: attempt.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  exchangeCode(input: { code: string; codeVerifier: string }): Promise<GoogleTokens> {
    return this.tokenRequest({
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
    });
  }

  refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    return this.tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  }

  async profile(accessToken: string): Promise<{ emailAddress: string }> {
    const response = await this.safeFetch(profileEndpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const payload = record(await response.json().catch(() => null));
    if (!response.ok || !payload || typeof payload.emailAddress !== "string" || !payload.emailAddress) {
      throw new GoogleOAuthError("invalid-response");
    }
    return { emailAddress: payload.emailAddress };
  }

  async revoke(token: string): Promise<boolean> {
    try {
      const response = await this.fetcher(revokeEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async tokenRequest(fields: Record<string, string>): Promise<GoogleTokens> {
    const response = await this.safeFetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...fields,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
    });
    const payload = record(await response.json().catch(() => null));
    if (!response.ok) {
      if (payload?.error === "invalid_grant") throw new GoogleOAuthError("invalid-grant");
      throw new GoogleOAuthError("request-failed");
    }
    if (!payload || typeof payload.access_token !== "string" || typeof payload.expires_in !== "number" || payload.expires_in <= 0) {
      throw new GoogleOAuthError("invalid-response");
    }
    return {
      accessToken: payload.access_token,
      expiresAt: this.nowMs() + payload.expires_in * 1_000,
      ...(typeof payload.refresh_token === "string" && payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
    };
  }

  private async safeFetch(input: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(input, init);
    } catch {
      throw new GoogleOAuthError("request-failed");
    }
  }
}
