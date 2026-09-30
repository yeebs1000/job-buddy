import { describe, expect, it } from "vitest";
import { emptyCandidateProfile, type CandidateProfile } from "../../src/domain/profile";
import type { ProfileVault } from "./ProfileVault";
import { ProfileService } from "./ProfileService";

describe("ProfileService", () => {
  it("returns only explicitly selected paths", async () => {
    const service = new ProfileService(new MemoryProfileVault({
      ...emptyCandidateProfile,
      identity: { givenName: "Alex", familyName: "Tan" },
      contact: { email: "alex@example.com" },
      skills: ["TypeScript"],
    }));

    expect(await service.select(["identity.givenName", "skills"])).toEqual({
      "identity.givenName": "Alex",
      skills: ["TypeScript"],
    });
  });

  it("rejects invalid replacements before changing the vault", async () => {
    const vault = new MemoryProfileVault(null);
    const service = new ProfileService(vault);

    await expect(service.replace({ version: 1, password: "secret" })).rejects.toMatchObject({ code: "invalid-profile" });
    expect(await vault.read()).toBeNull();
  });

  it("returns an empty profile without persisting it when none exists", async () => {
    const vault = new MemoryProfileVault(null);
    const service = new ProfileService(vault);

    expect(await service.read()).toEqual(emptyCandidateProfile);
    expect(await vault.read()).toBeNull();
  });

  it("reports support and profile presence without exposing values", async () => {
    const service = new ProfileService(new MemoryProfileVault(emptyCandidateProfile));

    expect(await service.status()).toEqual({ platformSupported: true, hasProfile: true });
  });
});

class MemoryProfileVault implements ProfileVault {
  constructor(private profile: CandidateProfile | null) {}
  isSupported() { return true; }
  async read() { return this.profile; }
  async replace(profile: CandidateProfile) { this.profile = structuredClone(profile); }
  async delete() { this.profile = null; }
}
