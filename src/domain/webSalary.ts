import { z } from "zod";
import { isSafeExternalHttpsUrl } from "./jobUrl";
import { currencySchema, payPeriodSchema } from "./research";

const publicText = z.string().trim().min(2).max(160).refine(text => !/[\r\n\x00-\x1f@]/.test(text));
export const webSalaryQuerySchema = z.object({ company: publicText, role: publicText, location: publicText, purpose: z.enum(["salary", "company-rating"]).optional() }).strict();
export type WebSalaryQuery = z.infer<typeof webSalaryQuerySchema>;
export const webSalarySourceSchema = z.object({
  url: z.string().max(2048).refine(isSafeExternalHttpsUrl), title: z.string().max(300), excerpt: z.string().max(2000),
  retrievedAt: z.string().datetime(), pageDate: z.string().max(80).optional(),
}).strict();
export const webSalaryResponseSchema = z.object({ results: z.array(webSalarySourceSchema).max(10), searchedAt: z.string().datetime() }).strict();
export type WebSalaryResponse = z.infer<typeof webSalaryResponseSchema>;
export interface ResearchSearchResult { requestId: string; query: WebSalaryQuery; result: WebSalaryResponse }
export const webSalaryEvidenceSchema = webSalarySourceSchema.extend({
  minimum: z.number().positive().max(100000000), maximum: z.number().positive().max(100000000),
  currency: currencySchema, period: payPeriodSchema, basis: z.enum(["base", "total"]),
  match: z.enum(["company-role", "market-role"]), referenceYear: z.number().int().min(1990).max(2100).optional(),
  sourceType: z.enum(["employer", "recruiter-guide", "self-reported", "unknown"]).optional(),
  confirmed: z.boolean(),
}).strict().refine(value => value.minimum <= value.maximum);
export type WebSalaryEvidence = z.infer<typeof webSalaryEvidenceSchema>;
export const webSalarySnapshotSchema = z.object({
  id: z.string(), query: webSalaryQuerySchema, savedAt: z.string().datetime(), currency: currencySchema,
  basis: z.enum(["base", "total"]), evidence: z.array(webSalaryEvidenceSchema).min(1).max(10),
}).strict();
export type WebSalarySnapshot = z.infer<typeof webSalarySnapshotSchema>;
