import { describe, expect, it, vi } from "vitest";
import type { CompanionConfig } from "../config";
import type { GmailConnectionMetadata } from "../secrets/ConnectionMetadataStore";
import type { SecretKey, SecretStore } from "../secrets/SecretStore";
import { GmailConnectionService } from "./GmailConnectionService";

const config: CompanionConfig = {
  host: "127.0.0.1", port: 43117,
  google: { clientId: "client-id", clientSecret: "client-secret", redirectUri: "http://127.0.0.1:43117/api/gmail/oauth/callback" },
  uiOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:43117"],
};

class MemorySecrets implements SecretStore {
  value: string | null = null;
  isSupported() { return true; }
  async get(_key: SecretKey) { return this.value; }
  async set(_key: SecretKey, value: string) { this.value = value; }
  async delete(_key: SecretKey) { this.value = null; }
}

class MemoryMetadata {
  value: GmailConnectionMetadata | null = null;
  async get() { return this.value; }
  async set(value: GmailConnectionMetadata) { this.value = value; }
  async delete() { this.value = null; }
}

describe("GmailConnectionService", () => {
  it("reports missing configuration without attempting a provider request", async () => {
    const unconfigured = { ...config, google: null };
    const service = new GmailConnectionService({
      config: unconfigured, secrets: new MemorySecrets(), metadata: new MemoryMetadata(), fetcher: vi.fn(),
    });

    await expect(service.status()).resolves.toEqual({ state: "unconfigured", platformSupported: true, lastError: "missing-config" });
    await expect(service.start()).rejects.toMatchObject({ code: "missing-config" });
  });

  it("persists only the refresh token and safe profile metadata after callback completion", async () => {
    const secrets = new MemorySecrets();
    const metadata = new MemoryMetadata();
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 }), { status: 200 });
      if (url.includes("gmail.googleapis.com/gmail/v1/users/me/profile")) return new Response(JSON.stringify({ emailAddress: "graduate@example.com" }), { status: 200 });
      throw new Error("Unexpected URL");
    });
    const service = new GmailConnectionService({ config, secrets, metadata, fetcher, nowMs: () => Date.parse("2026-09-15T08:00:00.000Z") });
    const { authorizationUrl } = await service.start("2026-09-15T08:00:00.000Z");
    const state = new URL(authorizationUrl).searchParams.get("state")!;

    await service.complete({ code: "oauth-code", state, now: "2026-09-15T08:01:00.000Z" });

    expect(secrets.value).toBe("refresh-token");
    expect(metadata.value).toEqual({ accountEmail: "graduate@example.com", connectedAt: "2026-09-15T08:01:00.000Z", state: "connected" });
    await expect(service.getAccessToken()).resolves.toBe("access-token");
    await expect(service.status()).resolves.toMatchObject({ state: "connected", accountEmail: "graduate@example.com", platformSupported: true });
  });

  it("persists nothing when Google does not return an offline refresh token", async () => {
    const secrets = new MemorySecrets();
    const metadata = new MemoryMetadata();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), { status: 200 }));
    const service = new GmailConnectionService({ config, secrets, metadata, fetcher });
    const state = new URL((await service.start()).authorizationUrl).searchParams.get("state")!;

    await expect(service.complete({ code: "oauth-code", state })).rejects.toThrow("offline access");
    expect(secrets.value).toBeNull();
    expect(metadata.value).toBeNull();
  });

  it("marks a revoked refresh token as reconnect-required without exposing Google detail", async () => {
    const secrets = new MemorySecrets();
    secrets.value = "revoked-token";
    const metadata = new MemoryMetadata();
    metadata.value = { accountEmail: "graduate@example.com", connectedAt: "2026-09-15T08:00:00.000Z", state: "connected" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", error_description: "private provider detail" }), { status: 400 }));
    const service = new GmailConnectionService({ config, secrets, metadata, fetcher });

    await expect(service.getAccessToken()).rejects.not.toThrow("private provider detail");
    await expect(service.status()).resolves.toMatchObject({ state: "reconnect-required", lastError: "token-revoked" });
  });

  it("revokes the refresh token and clears local connection state on disconnect", async () => {
    const secrets = new MemorySecrets();
    secrets.value = "refresh-token";
    const metadata = new MemoryMetadata();
    metadata.value = { accountEmail: "graduate@example.com", connectedAt: "2026-09-15T08:00:00.000Z", state: "connected" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const service = new GmailConnectionService({ config, secrets, metadata, fetcher });

    await expect(service.disconnect()).resolves.toEqual({ revocationConfirmed: true });
    expect(secrets.value).toBeNull();
    expect(metadata.value).toBeNull();
    expect(String(fetcher.mock.calls[0][1]?.body)).toBe("token=refresh-token");
  });
});
