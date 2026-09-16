import { z } from "zod";

const text = z.string().trim().min(1).max(2_000);
const shortText = z.string().trim().min(1).max(200);
const optionalText = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  text.optional(),
);
const optionalShortText = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  shortText.optional(),
);
const optionalEmail = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().email().max(320).optional(),
);
const optionalHttpsUrl = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().url().max(2_048).refine((value) => new URL(value).protocol === "https:", "https-required").optional(),
);

const identitySchema = z.object({
  givenName: optionalShortText,
  familyName: optionalShortText,
  preferredName: optionalShortText,
}).strict();

const contactSchema = z.object({
  email: optionalEmail,
  phoneCountryCode: optionalShortText,
  phoneNational: optionalShortText,
  addressLine1: optionalShortText,
  addressLine2: optionalShortText,
  city: optionalShortText,
  region: optionalShortText,
  postalCode: optionalShortText,
  country: optionalShortText,
}).strict();

const linksSchema = z.object({
  linkedin: optionalHttpsUrl,
  github: optionalHttpsUrl,
  portfolio: optionalHttpsUrl,
}).strict();

const educationSchema = z.object({
  institution: optionalShortText,
  degree: optionalShortText,
  fieldOfStudy: optionalShortText,
  startMonth: optionalShortText,
  endMonth: optionalShortText,
  grade: optionalShortText,
}).strict();

const experienceSchema = z.object({
  employer: optionalShortText,
  title: optionalShortText,
  location: optionalShortText,
  startMonth: optionalShortText,
  endMonth: optionalShortText,
  current: z.boolean().optional(),
  summary: optionalText,
}).strict();

const projectSchema = z.object({
  title: optionalShortText,
  url: optionalHttpsUrl,
  summary: optionalText,
}).strict();

const preferencesSchema = z.object({
  sgAuthorization: optionalShortText,
  hkAuthorization: optionalShortText,
  usAuthorization: optionalShortText,
  sgSponsorship: optionalShortText,
  hkSponsorship: optionalShortText,
  usSponsorship: optionalShortText,
  availabilityDate: optionalShortText,
  noticePeriod: optionalShortText,
  relocation: optionalShortText,
  workArrangement: z.enum(["onsite", "hybrid", "remote"]).optional(),
  salarySGDAnnual: z.number().int().positive().max(10_000_000).optional(),
  salaryHKDAnnual: z.number().int().positive().max(100_000_000).optional(),
  salaryUSDAnnual: z.number().int().positive().max(10_000_000).optional(),
}).strict();

const standardAnswerSchema = z.object({
  question: shortText,
  answer: text,
}).strict();

export const candidateProfileSchema = z.object({
  version: z.literal(1),
  identity: identitySchema,
  contact: contactSchema,
  links: linksSchema,
  education: educationSchema.array().max(5),
  experience: experienceSchema.array().max(10),
  projects: projectSchema.array().max(10),
  skills: shortText.array().max(100),
  preferences: preferencesSchema,
  standardAnswers: standardAnswerSchema.array().max(50),
  updatedAt: z.string().datetime().optional(),
}).strict();

export type CandidateProfile = z.infer<typeof candidateProfileSchema>;
export type ProfileValue = string | number | boolean | string[];

export const emptyCandidateProfile: CandidateProfile = {
  version: 1,
  identity: {},
  contact: {},
  links: {},
  education: [],
  experience: [],
  projects: [],
  skills: [],
  preferences: {},
  standardAnswers: [],
};

const staticPaths = new Set([
  "identity.givenName", "identity.familyName", "identity.preferredName",
  "contact.email", "contact.phoneCountryCode", "contact.phoneNational",
  "contact.addressLine1", "contact.addressLine2", "contact.city", "contact.region",
  "contact.postalCode", "contact.country",
  "links.linkedin", "links.github", "links.portfolio", "skills",
  "preferences.sgAuthorization", "preferences.hkAuthorization",
  "preferences.usAuthorization", "preferences.sgSponsorship", "preferences.hkSponsorship", "preferences.usSponsorship",
  "preferences.availabilityDate", "preferences.noticePeriod", "preferences.relocation",
  "preferences.workArrangement", "preferences.salarySGDAnnual", "preferences.salaryHKDAnnual",
  "preferences.salaryUSDAnnual",
] as const);

const collectionRules = {
  education: {
    limit: 5,
    fields: new Set(["institution", "degree", "fieldOfStudy", "startMonth", "endMonth", "grade"]),
  },
  experience: {
    limit: 10,
    fields: new Set(["employer", "title", "location", "startMonth", "endMonth", "current", "summary"]),
  },
  projects: {
    limit: 10,
    fields: new Set(["title", "url", "summary"]),
  },
  standardAnswers: {
    limit: 50,
    fields: new Set(["question", "answer"]),
  },
} as const;

type StaticProfilePath = typeof staticPaths extends Set<infer Path> ? Path : never;
type EducationPath = `education.${number}.${"institution" | "degree" | "fieldOfStudy" | "startMonth" | "endMonth" | "grade"}`;
type ExperiencePath = `experience.${number}.${"employer" | "title" | "location" | "startMonth" | "endMonth" | "current" | "summary"}`;
type ProjectPath = `projects.${number}.${"title" | "url" | "summary"}`;
type StandardAnswerPath = `standardAnswers.${number}.${"question" | "answer"}`;
export type ProfilePath = StaticProfilePath | EducationPath | ExperiencePath | ProjectPath | StandardAnswerPath;
export type ProfileSelection = Partial<Record<ProfilePath, ProfileValue>>;

export function parseProfilePath(input: string): ProfilePath {
  if (staticPaths.has(input as StaticProfilePath)) return input as StaticProfilePath;
  const match = /^(education|experience|projects|standardAnswers)\.(\d+)\.([a-zA-Z]+)$/.exec(input);
  if (!match) throw new Error("invalid-profile-path");
  const [collection, rawIndex, field] = match.slice(1) as [keyof typeof collectionRules, string, string];
  const rule = collectionRules[collection];
  const index = Number(rawIndex);
  if (!Number.isSafeInteger(index) || index < 0 || index >= rule.limit || !rule.fields.has(field as never)) {
    throw new Error("invalid-profile-path");
  }
  return input as ProfilePath;
}

function valueAt(profile: CandidateProfile, path: ProfilePath): ProfileValue | undefined {
  if (path === "skills") return profile.skills.length ? profile.skills : undefined;
  const parts = path.split(".");
  if (parts.length === 2) {
    const [section, field] = parts;
    const record = profile[section as "identity" | "contact" | "links" | "preferences"] as Record<string, unknown>;
    const value = record[field];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
  }
  const [collection, rawIndex, field] = parts;
  const entries = profile[collection as "education" | "experience" | "projects" | "standardAnswers"] as Array<Record<string, unknown>>;
  const value = entries[Number(rawIndex)]?.[field];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

export function selectProfilePaths(profile: CandidateProfile, paths: readonly string[]): ProfileSelection {
  const selection: ProfileSelection = {};
  for (const candidate of paths) {
    const path = parseProfilePath(candidate);
    const value = valueAt(profile, path);
    if (value !== undefined && (!(typeof value === "string") || value.length > 0)) selection[path] = value;
  }
  return selection;
}
