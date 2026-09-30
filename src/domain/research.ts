import { z } from "zod";

export const marketSchema = z.enum(["SG", "HK", "US"]);
export type Market = z.infer<typeof marketSchema>;

export const currencySchema = z.enum(["SGD", "HKD", "USD"]);
export type Currency = z.infer<typeof currencySchema>;

export const payPeriodSchema = z.enum(["monthly", "annual"]);
export type PayPeriod = z.infer<typeof payPeriodSchema>;

export const roleMatchStrengthSchema = z.enum(["exact", "moderate", "limited"]);
export type RoleMatchStrength = z.infer<typeof roleMatchStrengthSchema>;

const identifier = z.string().trim().min(1).max(200);
const canonicalRole = z.string().trim().min(1).max(100);
const isoDateTime = z.string().datetime();
const salaryRangeSchema = z.object({
  minimum: z.number().finite().positive(),
  maximum: z.number().finite().positive(),
}).strict().superRefine((range, context) => {
  if (range.maximum < range.minimum) context.addIssue({ code: "custom", message: "inverted-range" });
});

export const salaryBenchmarkSchema = z.object({
  id: identifier,
  releaseId: identifier,
  market: marketSchema,
  currency: currencySchema,
  period: payPeriodSchema,
  sourceOccupationCode: z.string().trim().min(1).max(80),
  sourceOccupationLabel: z.string().trim().min(1).max(300),
  canonicalRole: canonicalRole.optional(),
  industry: z.string().trim().min(1).max(200).optional(),
  geographyLevel: z.enum(["market", "metro", "state", "national"]),
  geographyCode: z.string().trim().min(1).max(80),
  geographyLabel: z.string().trim().min(1).max(200),
  p25: z.number().finite().positive(),
  p50: z.number().finite().positive(),
  p75: z.number().finite().positive(),
  referencePeriod: z.string().trim().min(4).max(40),
  compensationScope: z.string().trim().min(1).max(300),
  sourceUrl: z.string().url().max(2_048),
  matchCeiling: roleMatchStrengthSchema.optional(),
}).strict().superRefine((benchmark, context) => {
  if (benchmark.p25 > benchmark.p50 || benchmark.p50 > benchmark.p75) {
    context.addIssue({ code: "custom", message: "inconsistent-percentiles" });
  }
});
export type SalaryBenchmark = z.infer<typeof salaryBenchmarkSchema>;

export const cpiPointSchema = z.object({
  id: identifier,
  source: z.string().trim().min(1).max(200),
  sourceUrl: z.string().url().max(2_048),
  market: marketSchema,
  period: z.string().trim().min(4).max(40),
  index: z.number().finite().positive(),
  baseLabel: z.string().trim().min(1).max(100),
  retrievedAt: isoDateTime,
}).strict();
export type CpiPoint = z.infer<typeof cpiPointSchema>;

export const roleMatchSchema = z.object({
  originalTitle: z.string().trim().min(1).max(300),
  normalizedTitle: z.string().trim().min(1).max(300),
  canonicalRole,
  sourceOccupationCode: z.string().trim().min(1).max(80),
  strength: roleMatchStrengthSchema,
  ruleId: identifier,
  overridden: z.boolean(),
}).strict();
export type RoleMatch = z.infer<typeof roleMatchSchema>;

export const roleAliasOverrideSchema = z.object({
  id: identifier,
  market: marketSchema,
  normalizedTitle: z.string().trim().min(1).max(300),
  canonicalRole,
  sourceOccupationCode: z.string().trim().min(1).max(80),
  createdAt: isoDateTime,
}).strict();
export type RoleAliasOverride = z.infer<typeof roleAliasOverrideSchema>;

export const salaryObservationSchema = z.object({
  id: identifier,
  applicationId: identifier,
  provenance: z.enum(["job_posting", "recruiter", "offer", "manual"]),
  market: marketSchema,
  currency: currencySchema,
  period: payPeriodSchema,
  minimum: z.number().finite().positive(),
  maximum: z.number().finite().positive().optional(),
  canonicalRole,
  geographyLabel: z.string().trim().min(1).max(200).optional(),
  observedAt: isoDateTime,
  sourceUrl: z.string().url().max(2_048).optional(),
  evidenceExcerpt: z.string().trim().min(1).max(500).optional(),
  reusable: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.maximum !== undefined && value.maximum < value.minimum) {
    context.addIssue({ code: "custom", message: "inverted-range" });
  }
});
export type SalaryObservation = z.infer<typeof salaryObservationSchema>;

export const salaryEstimateSnapshotSchema = z.object({
  id: identifier,
  applicationId: identifier,
  market: marketSchema,
  currency: currencySchema,
  period: payPeriodSchema,
  benchmarkId: identifier,
  benchmarkSourceUrl: z.string().url().max(2_048),
  inputReleaseIds: identifier.array().min(1).max(20),
  roleMatch: roleMatchSchema,
  geographyFallback: z.enum(["exact", "state", "national"]),
  exactNominalRange: salaryRangeSchema,
  exactAdjustedRange: salaryRangeSchema.optional(),
  displayRange: salaryRangeSchema,
  roundingRule: z.string().trim().min(1).max(100),
  evidenceIds: identifier.array().max(500),
  evidenceSummary: z.object({
    eligible: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    blendWeight: z.number().min(0).max(1),
  }).strict(),
  confidence: z.enum(["high", "moderate", "limited"]),
  confidenceConditions: z.string().trim().min(1).max(300).array().max(30),
  assumptions: z.string().trim().min(1).max(500).array().max(30),
  exclusions: z.string().trim().min(1).max(500).array().max(100),
  calculatedAt: isoDateTime,
}).strict();
export type SalaryEstimateSnapshot = z.infer<typeof salaryEstimateSnapshotSchema>;
