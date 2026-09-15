import { describe, expect, it } from "vitest";
import { readCompanionConfig } from "./config";

describe("readCompanionConfig", () => {
  it("reports missing OAuth configuration without returning secret values", () => {
    expect(readCompanionConfig({})).toEqual({
      host: "127.0.0.1",
      port: 43117,
      google: null,
      uiOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:43117"],
    });
  });

  it("rejects a configured non-loopback OAuth redirect", () => {
    expect(() => readCompanionConfig({
      GOOGLE_OAUTH_CLIENT_ID: "client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
      GOOGLE_OAUTH_REDIRECT_URI: "https://example.com/api/gmail/oauth/callback",
    })).toThrow("loopback");
  });
});
