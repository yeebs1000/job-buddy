import type { CandidateProfile } from "../../src/domain/profile";

export interface ProfileVault {
  isSupported(): boolean;
  read(): Promise<CandidateProfile | null>;
  replace(profile: CandidateProfile): Promise<void>;
  delete(): Promise<void>;
}
