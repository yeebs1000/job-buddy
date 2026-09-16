import { describe, expect, it } from "vitest";
import {
  candidateProfileSchema,
  emptyCandidateProfile,
  parseProfilePath,
  selectProfilePaths,
} from "./profile";

describe("candidate profile", () => {
  it("accepts partial factual data and rejects credential keys", () => {
    const profile = candidateProfileSchema.parse({
      ...emptyCandidateProfile,
      identity: { givenName: "Alex", familyName: "Tan" },
      contact: { email: "alex@example.com" },
    });

    expect(profile.identity.givenName).toBe("Alex");
    expect(candidateProfileSchema.safeParse({ ...profile, password: "secret" }).success).toBe(false);
  });

  it("rejects invalid email, insecure links, and oversized collections", () => {
    expect(candidateProfileSchema.safeParse({
      ...emptyCandidateProfile,
      contact: { email: "not-an-email" },
    }).success).toBe(false);
    expect(candidateProfileSchema.safeParse({
      ...emptyCandidateProfile,
      links: { portfolio: "http://example.com" },
    }).success).toBe(false);
    expect(candidateProfileSchema.safeParse({
      ...emptyCandidateProfile,
      education: Array.from({ length: 6 }, (_, index) => ({ institution: `School ${index}` })),
    }).success).toBe(false);
  });

  it("allows only bounded canonical collection paths", () => {
    expect(parseProfilePath("education.0.institution")).toBe("education.0.institution");
    expect(parseProfilePath("experience.9.title")).toBe("experience.9.title");
    expect(() => parseProfilePath("education.5.institution")).toThrow("invalid-profile-path");
    expect(() => parseProfilePath("experience.10.title")).toThrow("invalid-profile-path");
    expect(() => parseProfilePath("__proto__.polluted")).toThrow("invalid-profile-path");
  });

  it("selects only requested scalar and string-list values", () => {
    const profile = candidateProfileSchema.parse({
      ...emptyCandidateProfile,
      identity: { givenName: "Alex", familyName: "Tan" },
      skills: ["TypeScript", "React"],
      education: [{ institution: "HKU", degree: "MFin" }],
    });

    expect(selectProfilePaths(profile, [
      "identity.givenName",
      "skills",
      "education.0.institution",
      "contact.email",
    ])).toEqual({
      "identity.givenName": "Alex",
      skills: ["TypeScript", "React"],
      "education.0.institution": "HKU",
    });
  });

  it("normalizes whitespace without inventing missing values", () => {
    const profile = candidateProfileSchema.parse({
      ...emptyCandidateProfile,
      identity: { givenName: "  Alex  ", familyName: "Tan" },
      skills: [" TypeScript ", "React"],
    });

    expect(profile.identity.givenName).toBe("Alex");
    expect(profile.skills).toEqual(["TypeScript", "React"]);
    expect(selectProfilePaths(profile, ["contact.email"])).toEqual({});
  });
});
