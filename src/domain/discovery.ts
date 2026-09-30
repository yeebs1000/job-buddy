import { z } from "zod";
import { currencySchema, marketSchema } from "./research";
import { isSafeExternalHttpsUrl } from "./jobUrl";

export const boardSchema = z.object({
  provider: z.enum(["greenhouse", "lever"]),
  token: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  region: z.enum(["global", "eu"]).default("global"),
}).strict();
export type JobBoard = z.infer<typeof boardSchema>;
export const postingPaySchema = z.object({
  currency: currencySchema,
  minimum: z.number().finite().positive(),
  maximum: z.number().finite().positive(),
  period: z.enum(["annual", "monthly", "hourly", "unspecified"]),
  label: z.string().max(300),
}).strict().refine((range) => range.maximum >= range.minimum, "inverted-range");
export type PostingPay = z.infer<typeof postingPaySchema>;
export const discoveredJobSchema = z.object({
  id: z.string().min(1).max(250),
  board: boardSchema,
  title: z.string().min(1).max(500),
  location: z.string().max(500),
  market: marketSchema.optional(),
  url: z.string().max(2048).refine(isSafeExternalHttpsUrl),
  salary: postingPaySchema.array().max(30),
  retrievedAt: z.string().datetime(),
}).strict();
export type DiscoveredJob = z.infer<typeof discoveredJobSchema>;
export const discoveryResultSchema = z.object({
  jobs: discoveredJobSchema.array().max(1000),
  truncated: z.boolean(),
  retrievedAt: z.string().datetime(),
}).strict();
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;

export function parseBoardUrl(value: string): JobBoard {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Use an HTTPS Greenhouse or Lever board link.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) {
    return boardSchema.parse({ provider: "greenhouse", token: parts[0] });
  }
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) {
    return boardSchema.parse({ provider: "lever", token: parts[0], region: url.hostname === "jobs.eu.lever.co" ? "eu" : "global" });
  }
  throw new Error("Use the company's Greenhouse or Lever careers link.");
}

export function boardKey(board: JobBoard): string { return `${board.provider}:${board.region}:${board.token}`; }

export function inferPostingMarket(location: string, country?: string): DiscoveredJob["market"] {
  if (country === "SG" || /\bsingapore\b/i.test(location)) return "SG";
  if (country === "HK" || /\bhong kong\b/i.test(location)) return "HK";
  if (country === "US" || /\b(united states|usa|u\.s\.|new york|san francisco|seattle|boston|austin|chicago|los angeles)\b/i.test(location)) return "US";
  return undefined; // Remote and ambiguous locations are not assumed to be US.
}
