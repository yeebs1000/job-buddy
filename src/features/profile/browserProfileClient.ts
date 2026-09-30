import { jobBuddyDb, type BrowserProfileKey, type BrowserProfileRecord } from "../../db/database";
import { candidateProfileSchema, emptyCandidateProfile, type CandidateProfile } from "../../domain/profile";
import type { ProfileClient } from "./profileClient";

const id = "candidate" as const;
const encoder = new TextEncoder();
const context = (revision: string) => encoder.encode(`job-buddy:browser-profile:v1:${revision}`);
const supported = () => Boolean(globalThis.crypto?.subtle);

async function snapshot() {
  return jobBuddyDb.transaction("r", jobBuddyDb.browserProfiles, jobBuddyDb.profileKeys, async () => ({
    record: await jobBuddyDb.browserProfiles.get(id), key: await jobBuddyDb.profileKeys.get(id),
  }));
}

async function decode({ record, key }: Awaited<ReturnType<typeof snapshot>>): Promise<CandidateProfile | null> {
  if (!record && !key) return null;
  if (!record || !key || record.version !== 1 || typeof record.revision !== "string"
    || record.iv?.byteLength !== 12 || !record.ciphertext || record.ciphertext.byteLength > 1_048_576
    || key.key?.algorithm.name !== "AES-GCM" || key.key.extractable) throw new Error("Profile storage is damaged. Your data has not been replaced.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv, additionalData: context(record.revision) }, key.key, record.ciphertext);
  return candidateProfileSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
}

/** Prepare outside an IndexedDB transaction; callers persist both records atomically. */
export async function prepareBrowserProfile(profile: CandidateProfile, existingKey?: BrowserProfileKey): Promise<{ record: BrowserProfileRecord; key: BrowserProfileKey }> {
  const valid = candidateProfileSchema.parse(profile);
  if (!supported()) throw new Error("Secure browser storage is unavailable.");
  const key = existingKey ?? { id, key: await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) };
  const revision = crypto.randomUUID();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context(revision) }, key.key, encoder.encode(JSON.stringify(valid)));
  return { record: { id, version: 1, revision, iv, ciphertext }, key };
}

export const browserProfileClient: ProfileClient = {
  async get() {
    if (!supported()) return { platformSupported: false, hasProfile: false, profile: structuredClone(emptyCandidateProfile) };
    const profile = await decode(await snapshot());
    return { platformSupported: true, hasProfile: profile !== null, profile: profile ?? structuredClone(emptyCandidateProfile) };
  },
  async replace(profile) {
    const valid = candidateProfileSchema.parse(profile);
    const previous = await snapshot();
    await decode(previous); // Never overwrite damaged or unreadable data.
    const prepared = await prepareBrowserProfile(valid, previous.key);
    await jobBuddyDb.transaction("rw", jobBuddyDb.browserProfiles, jobBuddyDb.profileKeys, async () => {
      const current = await snapshot();
      if (current.record?.revision !== previous.record?.revision || Boolean(current.key) !== Boolean(previous.key)) {
        throw new Error("Profile changed in another tab. Reload before saving.");
      }
      await jobBuddyDb.profileKeys.put(prepared.key);
      await jobBuddyDb.browserProfiles.put(prepared.record);
    });
    return { profile: valid };
  },
  async delete() {
    await jobBuddyDb.transaction("rw", jobBuddyDb.browserProfiles, jobBuddyDb.profileKeys, async () => {
      await jobBuddyDb.browserProfiles.delete(id);
      await jobBuddyDb.profileKeys.delete(id);
    });
  },
};
