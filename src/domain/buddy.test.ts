import { describe, expect, it } from "vitest";
import {
  buddyActivityEntrySchema,
  defaultBuddyPreferences,
  extensionRequestSchema,
  parsePendingCapture,
} from "./buddy";

const capture = {
  id: "capture-1",
  company: "Example Ltd",
  role: "Software Engineer",
  location: "Singapore",
  sourceUrl: "https://jobs.example/role",
  platform: "greenhouse" as const,
  detectedAt: "2026-09-16T01:00:00.000Z",
  completionId: "completion-1",
};

describe("Buddy contracts", () => {
  it("rejects executable and unknown extension messages", () => {
    expect(extensionRequestSchema.safeParse({
      version: 1,
      type: "select-profile",
      paths: ["identity.givenName"],
    }).success).toBe(true);
    expect(extensionRequestSchema.safeParse({ version: 1, type: "eval", code: "alert(1)" }).success).toBe(false);
    expect(extensionRequestSchema.safeParse({
      version: 2,
      type: "select-profile",
      paths: ["identity.givenName"],
    }).success).toBe(false);
  });

  it("strips capture query strings and fragments", () => {
    expect(parsePendingCapture({
      ...capture,
      sourceUrl: "https://jobs.example/role?token=private#apply",
    }).sourceUrl).toBe("https://jobs.example/role");
  });

  it("rejects insecure or credential-bearing capture URLs", () => {
    expect(() => parsePendingCapture({ ...capture, sourceUrl: "http://jobs.example/role" })).toThrow("invalid-capture");
    expect(() => parsePendingCapture({ ...capture, sourceUrl: "https://user:pass@jobs.example/role" })).toThrow("invalid-capture");
  });

  it("keeps approval mode and pause as safe defaults", () => {
    expect(defaultBuddyPreferences).toEqual({ mode: "approval", paused: false, enabledDomains: [] });
  });

  it("rejects activity entries that contain values or arbitrary keys", () => {
    const valid = {
      id: "activity-1",
      fieldCategory: "contact",
      disposition: "filled",
      reason: "safe-high-confidence",
      mode: "automatic",
      adapter: "greenhouse",
      domain: "jobs.example",
      at: "2026-09-16T01:00:00.000Z",
    };

    expect(buddyActivityEntrySchema.safeParse(valid).success).toBe(true);
    expect(buddyActivityEntrySchema.safeParse({ ...valid, value: "alex@example.com" }).success).toBe(false);
  });
});
