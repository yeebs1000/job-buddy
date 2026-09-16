import { z } from "zod";
import { parseProfilePath, type ProfilePath, type ProfileSelection } from "./profile";

export const buddyModeSchema = z.enum(["approval", "automatic"]);
export type BuddyMode = z.infer<typeof buddyModeSchema>;

const domainSchema = z.string().trim().min(1).max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);

export const buddyPreferencesSchema = z.object({
  mode: buddyModeSchema,
  paused: z.boolean(),
  enabledDomains: domainSchema.array().max(100),
}).strict();
export type BuddyPreferences = z.infer<typeof buddyPreferencesSchema>;

export const defaultBuddyPreferences: BuddyPreferences = {
  mode: "approval",
  paused: false,
  enabledDomains: [],
};

export const adapterIdSchema = z.enum(["generic", "greenhouse", "workday", "oracle", "lever"]);
export type AdapterId = z.infer<typeof adapterIdSchema>;

export const fieldRiskSchema = z.enum(["safe", "review", "manual"]);
export type FieldRisk = z.infer<typeof fieldRiskSchema>;

export const detectedFieldSchema = z.object({
  id: z.string().trim().min(1).max(300),
  label: z.string().trim().min(1).max(500),
  kind: z.enum(["text", "email", "tel", "url", "textarea", "select", "radio", "checkbox", "file", "other"]),
  required: z.boolean(),
  currentValuePresent: z.boolean(),
  canonicalPath: z.string().transform((value, context) => {
    try { return parseProfilePath(value); }
    catch { context.addIssue({ code: "custom", message: "invalid-profile-path" }); return z.NEVER; }
  }).optional(),
  confidence: z.number().min(0).max(1),
  risk: fieldRiskSchema,
  reason: z.string().trim().min(1).max(200),
}).strict();
export type DetectedField = z.infer<typeof detectedFieldSchema>;

export const fillDecisionSchema = z.object({
  fieldId: z.string().trim().min(1).max(300),
  action: z.enum(["fill", "review", "manual", "skip", "blocked"]),
  reason: z.string().trim().min(1).max(200),
}).strict();
export type FillDecision = z.infer<typeof fillDecisionSchema>;

export const buddyActivityEntrySchema = z.object({
  id: z.string().trim().min(1).max(200),
  fieldCategory: z.enum(["identity", "contact", "links", "education", "experience", "projects", "skills", "preferences", "standardAnswers", "unknown"]),
  disposition: z.enum(["filled", "review", "manual", "skipped", "blocked"]),
  reason: z.string().trim().min(1).max(200),
  mode: buddyModeSchema,
  adapter: adapterIdSchema,
  domain: domainSchema,
  at: z.string().datetime(),
}).strict();
export type BuddyActivityEntry = z.infer<typeof buddyActivityEntrySchema>;

export const pendingCaptureSchema = z.object({
  id: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(300),
  role: z.string().trim().min(1).max(300),
  location: z.string().trim().min(1).max(300),
  sourceUrl: z.string().url().max(2_048),
  platform: adapterIdSchema,
  detectedAt: z.string().datetime(),
  completionId: z.string().trim().min(1).max(300),
}).strict();
export type PendingCapture = z.infer<typeof pendingCaptureSchema>;

export function parsePendingCapture(input: unknown): PendingCapture {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    const raw = input as Record<string, unknown>;
    if (typeof raw.sourceUrl !== "string") throw new Error();
    const url = new URL(raw.sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return pendingCaptureSchema.parse({ ...raw, sourceUrl: `${url.origin}${url.pathname}` });
  } catch {
    throw new Error("invalid-capture");
  }
}

const profilePathSchema = z.string().transform((value, context) => {
  try { return parseProfilePath(value); }
  catch { context.addIssue({ code: "custom", message: "invalid-profile-path" }); return z.NEVER; }
});

const extensionPreferencePatchSchema = z.object({
  paused: z.boolean().optional(),
  mode: buddyModeSchema.optional(),
  domain: domainSchema.optional(),
  domainEnabled: z.boolean().optional(),
  automaticModeConfirmed: z.literal(true).optional(),
}).strict();

export const extensionRequestSchema = z.discriminatedUnion("type", [
  z.object({ version: z.literal(1), type: z.literal("status") }).strict(),
  z.object({ version: z.literal(1), type: z.literal("pair"), code: z.string().trim().min(8).max(32) }).strict(),
  z.object({ version: z.literal(1), type: z.literal("select-profile"), paths: profilePathSchema.array().max(100) }).strict(),
  z.object({ version: z.literal(1), type: z.literal("get-preferences") }).strict(),
  z.object({ version: z.literal(1), type: z.literal("update-preferences"), patch: extensionPreferencePatchSchema }).strict(),
  z.object({ version: z.literal(1), type: z.literal("record-activity"), activity: buddyActivityEntrySchema }).strict(),
  z.object({ version: z.literal(1), type: z.literal("queue-capture"), capture: pendingCaptureSchema }).strict(),
]);
export type ExtensionRequest = z.infer<typeof extensionRequestSchema>;

export type ExtensionResponse =
  | { ok: true; type: "status"; paired: boolean }
  | { ok: true; type: "paired" }
  | { ok: true; type: "profile-selection"; selection: ProfileSelection }
  | { ok: true; type: "preferences"; preferences: BuddyPreferences }
  | { ok: true; type: "recorded" | "captured" }
  | { ok: false; error: "invalid-request" | "unpaired" | "companion-offline" | "request-failed" };

export function fieldCategory(path: ProfilePath | undefined): BuddyActivityEntry["fieldCategory"] {
  if (!path) return "unknown";
  return path.split(".")[0] as BuddyActivityEntry["fieldCategory"];
}
