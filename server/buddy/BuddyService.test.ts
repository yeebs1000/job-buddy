import { describe, expect, it } from "vitest";
import { parsePendingCapture } from "../../src/domain/buddy";
import { emptyCandidateProfile } from "../../src/domain/profile";
import { BuddyService } from "./BuddyService";

const AUTH = { token: "paired-token", origin: `chrome-extension://${"a".repeat(32)}` };

describe("BuddyService", () => {
  it("denies profile selection before invoking the profile service", async () => {
    let selected = false;
    const service = buddyService({ authorized: false, onSelect: () => { selected = true; } });

    await expect(service.selectProfile(AUTH, ["identity.givenName"])).rejects.toMatchObject({ code: "unauthorized" });
    expect(selected).toBe(false);
  });

  it("returns only selected profile fields to an authorized extension", async () => {
    const service = buddyService({ authorized: true });

    expect(await service.selectProfile(AUTH, ["identity.givenName"])).toEqual({ "identity.givenName": "Alex" });
  });

  it("requires explicit confirmation before automatic mode", async () => {
    const service = buddyService({ authorized: true });

    await expect(service.updateExtensionPreference(AUTH, { mode: "automatic" })).rejects.toMatchObject({ code: "confirmation-required" });
    expect(await service.updateExtensionPreference(AUTH, { mode: "automatic", automaticModeConfirmed: true })).toEqual({
      mode: "automatic",
      paused: false,
      enabledDomains: [],
    });
  });

  it("lets the extension change only its pause, mode, and current domain policy", async () => {
    const service = buddyService({ authorized: true });

    await expect(service.updateExtensionPreference(AUTH, { enabledDomains: ["evil.example"] } as never)).rejects.toMatchObject({ code: "invalid-preference" });
    expect(await service.updateExtensionPreference(AUTH, { domain: "jobs.example", domainEnabled: true })).toEqual({
      mode: "approval",
      paused: false,
      enabledDomains: ["jobs.example"],
    });
  });
});

function buddyService({ authorized, onSelect = () => undefined }: { authorized: boolean; onSelect?: () => void }) {
  let preferences = { mode: "approval" as const, paused: false, enabledDomains: [] as string[] };
  return new BuddyService({
    pairing: {
      start: () => ({ code: "ABCDE-FGHJK", expiresAt: "2026-09-16T02:05:00.000Z" }),
      complete: async () => ({ token: "paired-token" }),
      authorize: async () => authorized,
      revoke: async () => undefined,
      status: async () => authorized
        ? { paired: true as const, origin: AUTH.origin, pairedAt: "2026-09-16T02:00:00.000Z" }
        : { paired: false as const },
    },
    profile: {
      status: async () => ({ platformSupported: true, hasProfile: true }),
      read: async () => ({ ...emptyCandidateProfile, identity: { givenName: "Alex" } }),
      replace: async () => emptyCandidateProfile,
      select: async () => { onSelect(); return { "identity.givenName": "Alex" }; },
      delete: async () => undefined,
    },
    store: {
      getPreferences: async () => structuredClone(preferences),
      setPreferences: async (next) => { preferences = structuredClone(next) as typeof preferences; return structuredClone(preferences); },
      appendActivity: async () => undefined,
      listActivity: async () => [],
      clearActivity: async () => undefined,
      addCapture: async (input) => parsePendingCapture(input),
      listCaptures: async () => [],
      deleteCapture: async () => undefined,
    },
  });
}
