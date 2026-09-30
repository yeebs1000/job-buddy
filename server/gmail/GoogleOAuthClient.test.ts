import { describe, expect, it, vi } from "vitest";
import type { CompanionConfig } from "../config";
import { GoogleOAuthClient, GoogleOAuthError } from "./GoogleOAuthClient";
import { OAuthAttemptStore } from "./OAuthAttemptStore";

const google = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://127.0.0.1:43117/api/gmail/oauth/callback",
} satisfies NonNullable<CompanionConfig["google"]>;

describe("GoogleOAuthClient", () => {
  it("identifies the missing client_secret response without exposing provider text", async () => {
    const oauth = new GoogleOAuthClient({ clientId: "desktop-id", redirectUri: google.redirectUri }, async () => new Response(JSON.stringify({ error: "invalid_request", error_description: "client_secret is missing." }), { status: 400 }));
    await expect(oauth.exchangeCode({ code: "unused", codeVerifier: "verifier" })).rejects.toMatchObject({ code: "client-config" });
  });
  it("exchanges and refreshes desktop tokens using PKCE without a secret", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 })));
    const oauth = new GoogleOAuthClient({ clientId: "desktop-id", redirectUri: google.redirectUri }, fetcher);
    await oauth.exchangeCode({ code: "code", codeVerifier: "verifier" });
    await oauth.refreshAccessToken("refresh-token");
    const first = new URLSearchParams(String(fetcher.mock.calls[0][1]?.body));
    expect(first.get("code_verifier")).toBe("verifier");
    for (const [, request] of fetcher.mock.calls) {
      const body = new URLSearchParams(String(request?.body));
      expect(body.get("client_id")).toBe("desktop-id");
      expect(body.has("client_secret")).toBe(false);
    }
  });
  it("creates an offline, read-only, PKCE authorization request", () => {
    const oauth = new GoogleOAuthClient(google, vi.fn());
    const attempt = new OAuthAttemptStore().create("2026-09-15T08:00:00.000Z");
    const url = new URL(oauth.authorizationUrl(attempt));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(attempt.codeChallenge);
  });

  it("exchanges a code without putting the client secret in the URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const oauth = new GoogleOAuthClient(google, fetcher, () => 1_000);

    await expect(oauth.exchangeCode({ code: "oauth-code", codeVerifier: "verifier" })).resolves.toEqual({
      accessToken: "access-token", refreshToken: "refresh-token", expiresAt: 3_601_000,
    });
    const [url, request] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    expect(String(url)).not.toContain("client-secret");
    expect(String(request?.body)).toContain("client_secret=client-secret");
  });

  it("turns invalid_grant into a safe typed error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_grant", error_description: "private provider detail",
    }), { status: 400, headers: { "content-type": "application/json" } }));
    const oauth = new GoogleOAuthClient(google, fetcher);

    await expect(oauth.refreshAccessToken("revoked-refresh-token")).rejects.toMatchObject<Partial<GoogleOAuthError>>({ code: "invalid-grant" });
    await expect(oauth.refreshAccessToken("revoked-refresh-token")).rejects.not.toThrow("private provider detail");
  });
});
