import { z } from "zod";

export const tavilyKeySchema = z.string().trim().min(8).max(512).regex(/^tvly-[A-Za-z0-9_-]+$/);
export const searchStatusSchema = z.object({
  configured: z.boolean(), platformSupported: z.boolean(),
  usage: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), used: z.number().int().min(0).max(1000), limit: z.literal(1000) }).strict(),
}).strict();
export type ResearchSearchStatus = z.infer<typeof searchStatusSchema>;

export function researchSearchError(code: unknown): string {
  switch (code) {
    case "web-search-unconfigured": return "Add your Tavily API key in Settings to enable research. Your saved research is unchanged.";
    case "web-search-invalid-key": return "Tavily did not accept this key. Replace it in Settings and try again.";
    case "web-search-budget-exhausted": return "The search allowance has been reached. Saved research is still available. Check usage in Settings and your Tavily account.";
    case "web-search-busy": return "Another research search is still running. Wait for it to finish; no additional search credit was used.";
    case "web-search-rate-limited": return "Search requests are temporarily rate limited. Try again later. This does not necessarily mean your monthly credits are exhausted.";
    case "web-search-storage-unavailable": return "Secure research settings or usage records could not be accessed. Restart Job Buddy and retry; nothing was sent to Tavily.";
    case "web-search-configuration-changed": return "The research key changed during this search. Please try again.";
    case "web-search-unavailable": return "Tavily could not be reached or timed out. Retry later; your saved research is unchanged.";
    default: return "Research could not be completed. Your saved research is unchanged. Please retry later.";
  }
}
