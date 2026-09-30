import {
  candidateProfileSchema,
  emptyCandidateProfile,
  selectProfilePaths,
  type CandidateProfile,
  type ProfileSelection,
} from "../../src/domain/profile";
import type { ProfileVault } from "./ProfileVault";

class ProfileInputError extends Error {
  readonly code = "invalid-profile";

  constructor() {
    super("Candidate profile is invalid");
  }
}

export class ProfileService {
  constructor(private readonly vault: ProfileVault) {}

  async status(): Promise<{ platformSupported: boolean; hasProfile: boolean }> {
    if (!this.vault.isSupported()) return { platformSupported: false, hasProfile: false };
    return { platformSupported: true, hasProfile: (await this.vault.read()) !== null };
  }

  async read(): Promise<CandidateProfile> {
    const profile = await this.vault.read();
    return profile ?? structuredClone(emptyCandidateProfile);
  }

  async replace(input: unknown): Promise<CandidateProfile> {
    const result = candidateProfileSchema.safeParse(input);
    if (!result.success) throw new ProfileInputError();
    await this.vault.replace(result.data);
    return result.data;
  }

  async select(paths: readonly string[]): Promise<ProfileSelection> {
    return selectProfilePaths(await this.read(), paths);
  }

  async delete(): Promise<void> {
    await this.vault.delete();
  }
}
