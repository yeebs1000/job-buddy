import { z } from "zod";
import { webSalarySourceSchema } from "./webSalary";
export const companyRatingEvidenceSchema = webSalarySourceSchema.extend({
  id: z.string().min(1).max(2048), company: z.string().trim().min(1).max(160), provider: z.string().trim().min(1).max(160),
  score: z.number().finite().min(0).max(10), outOf: z.number().int().min(1).max(10), reviewCount: z.number().int().positive().optional(),
  savedAt: z.string().datetime(), confirmed: z.literal(true),
}).strict().refine(value => value.score <= value.outOf);
export type CompanyRatingEvidence = z.infer<typeof companyRatingEvidenceSchema>;
