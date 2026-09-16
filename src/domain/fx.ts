import { z } from "zod";
import { currencySchema } from "./research";

export const fxQuoteSchema = z.object({
  base: currencySchema,
  quote: currencySchema,
  rate: z.number().finite().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date),
  retrievedAt: z.string().datetime(),
  sourceUrl: z.literal("https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"),
}).strict();
export type FxQuote = z.infer<typeof fxQuoteSchema>;

export function validFxDate(date: string, now: number): boolean {
  const age = now - Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(age) && age >= -86_400_000 && age <= 7 * 86_400_000;
}
