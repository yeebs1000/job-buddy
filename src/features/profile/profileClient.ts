import { z } from "zod";
import { candidateProfileSchema, emptyCandidateProfile, type CandidateProfile } from "../../domain/profile";
import { isWebMode } from "../../app/runtimeMode";
import { browserProfileClient } from "./browserProfileClient";

const rawProfileResponseSchema = z.object({
  platformSupported: z.boolean(),
  hasProfile: z.boolean(),
  profile: candidateProfileSchema.nullable(),
}).strict();

const replaceResponseSchema = z.object({ profile: candidateProfileSchema }).strict();

export interface ProfileResponse {
  platformSupported: boolean;
  hasProfile: boolean;
  profile: CandidateProfile;
}

export interface ProfileClient {
  get(): Promise<ProfileResponse>;
  replace(profile: CandidateProfile): Promise<{ profile: CandidateProfile }>;
  delete(): Promise<void>;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error("profile-request-failed");
  return response.json();
}

export const companionProfileClient: ProfileClient = {
  async get() {
    const parsed = rawProfileResponseSchema.parse(await readJson(await fetch("/api/profile", {
      headers: { accept: "application/json" },
    })));
    return { ...parsed, profile: parsed.profile ?? structuredClone(emptyCandidateProfile) };
  },

  async replace(profile) {
    return replaceResponseSchema.parse(await readJson(await fetch("/api/profile", {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(profile),
    })));
  },

  async delete() {
    const response = await fetch("/api/profile", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error("profile-request-failed");
  },
};

export const profileClient = isWebMode ? browserProfileClient : companionProfileClient;
