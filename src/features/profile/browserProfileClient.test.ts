// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { emptyCandidateProfile } from "../../domain/profile";
import { browserProfileClient } from "./browserProfileClient";

const profile = { ...emptyCandidateProfile, identity: { givenName: "Synthetic Person" } };
beforeEach(async () => { await Promise.all(jobBuddyDb.tables.map(table => table.clear())); });
afterEach(() => vi.restoreAllMocks());

it("persists an encrypted profile across reads without uploading it", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
  expect((await browserProfileClient.get()).hasProfile).toBe(false);
  await browserProfileClient.replace(profile);
  expect((await browserProfileClient.get()).profile.identity.givenName).toBe("Synthetic Person");
  const record = await jobBuddyDb.browserProfiles.get("candidate");
  expect(new TextDecoder().decode(record!.ciphertext)).not.toContain("Synthetic Person");
  const key = (await jobBuddyDb.profileKeys.get("candidate"))!.key;
  expect(key.extractable).toBe(false);
  await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("never replaces an unreadable profile after its key is lost", async () => {
  await browserProfileClient.replace(profile);
  const original = await jobBuddyDb.browserProfiles.get("candidate");
  await jobBuddyDb.profileKeys.clear();
  await expect(browserProfileClient.get()).rejects.toThrow();
  await expect(browserProfileClient.replace(emptyCandidateProfile)).rejects.toThrow();
  expect(await jobBuddyDb.browserProfiles.get("candidate")).toEqual(original);
});

it("rejects modified ciphertext without writing a fallback", async () => {
  await browserProfileClient.replace(profile);
  const record = (await jobBuddyDb.browserProfiles.get("candidate"))!;
  const bytes = new Uint8Array(record.ciphertext);
  bytes[0] ^= 1;
  await jobBuddyDb.browserProfiles.put({ ...record, ciphertext: bytes.buffer });
  await expect(browserProfileClient.get()).rejects.toThrow();
  await expect(browserProfileClient.replace(profile)).rejects.toThrow();
  expect(await jobBuddyDb.browserProfiles.count()).toBe(1);
});

it("does not write invalid profiles", async () => {
  await expect(browserProfileClient.replace({ ...profile, contact: { email: "not-email" } })).rejects.toThrow();
  expect(await jobBuddyDb.browserProfiles.count()).toBe(0);
  expect(await jobBuddyDb.profileKeys.count()).toBe(0);
});

it("rolls back the key when storing the profile fails", async () => {
  const fail = () => { throw new DOMException("Full", "QuotaExceededError"); };
  jobBuddyDb.browserProfiles.hook("creating", fail);
  try {
    await expect(browserProfileClient.replace(profile)).rejects.toThrow();
    expect(await jobBuddyDb.profileKeys.count()).toBe(0);
    expect(await jobBuddyDb.browserProfiles.count()).toBe(0);
  } finally { jobBuddyDb.browserProfiles.hook("creating").unsubscribe(fail); }
});

it("deletes only the profile and key, then generates a fresh key", async () => {
  await jobBuddyDb.metadata.put({ key: "keep", value: "tracker state" });
  await browserProfileClient.replace(profile);
  const originalKey = (await jobBuddyDb.profileKeys.get("candidate"))!.key;
  await browserProfileClient.delete();
  expect(await jobBuddyDb.browserProfiles.count()).toBe(0);
  expect(await jobBuddyDb.profileKeys.count()).toBe(0);
  expect(await jobBuddyDb.metadata.get("keep")).toEqual({ key: "keep", value: "tracker state" });
  await browserProfileClient.replace(profile);
  const record = (await jobBuddyDb.browserProfiles.get("candidate"))!;
  await expect(crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv, additionalData: new TextEncoder().encode(`job-buddy:browser-profile:v1:${record.revision}`) }, originalKey, record.ciphertext)).rejects.toThrow();
  expect((await browserProfileClient.get()).profile).toEqual(profile);
});

it("does not resurrect a profile deleted while encryption was in progress", async () => {
  await browserProfileClient.replace(profile);
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
    await browserProfileClient.delete();
    return encrypt(...args);
  });
  await expect(browserProfileClient.replace({ ...profile, identity: { givenName: "Stale draft" } })).rejects.toThrow(/changed/i);
  expect(await jobBuddyDb.browserProfiles.count()).toBe(0);
  expect(await jobBuddyDb.profileKeys.count()).toBe(0);
});
