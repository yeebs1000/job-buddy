import "fake-indexeddb/auto";
import { afterEach, it, expect } from "vitest";
import { suggestCompanyRating } from "./companyRating";
import { companyRatingEvidenceSchema } from "../../domain/companyRating";
import { companyRatingRepository } from "./companyRatingRepository";
import { jobBuddyDb } from "../../db/database";
import { portableMetadata } from "../backup/workspaceSchema";
afterEach(async () => { await jobBuddyDb.delete(); await jobBuddyDb.open(); });
const source = { title: "Acme employee reviews", url: "https://example.com/acme", excerpt: "Acme employee reviews: 4.2 out of 5", retrievedAt: "2026-09-26T00:00:00.000Z" };
it("suggests employee ratings only for the named employer", () => {
  expect(suggestCompanyRating(source, "Acme")).toEqual({ score: 4.2, outOf: 5 });
  expect(suggestCompanyRating({ ...source, excerpt: "Acme product customer rating 4.2 out of 5" }, "Acme")).toBeUndefined();
  expect(suggestCompanyRating(source, "Other")).toBeUndefined();
  expect(suggestCompanyRating({ ...source, excerpt: "Acme employee reviews: 8 out of 5" }, "Acme")).toBeUndefined();
});
it("stores reviewed evidence with provenance and permits only matching backup IDs", async () => {
  const evidence = { ...source, id: "app-1", company: "Acme", provider: "Example Reviews", score: 4.2, outOf: 5, confirmed: true as const, savedAt: source.retrievedAt };
  await companyRatingRepository.save(evidence);
  expect(await companyRatingRepository.get("app-1")).toEqual(evidence);
  expect(portableMetadata({ key: "company-rating:app-1", value: JSON.stringify(evidence) })).not.toBeNull();
  expect(() => portableMetadata({ key: "company-rating:other", value: JSON.stringify(evidence) })).toThrow();
  expect(portableMetadata({ key: "tavily-key", value: "tvly-synthetic" })).toBeNull();
  expect(companyRatingEvidenceSchema.safeParse({ ...evidence, score: 6 }).success).toBe(false);
  expect(companyRatingEvidenceSchema.safeParse({ ...evidence, confirmed: false }).success).toBe(false);
});
