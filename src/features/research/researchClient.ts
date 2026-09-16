import { z } from "zod";
import { cpiPointSchema, marketSchema, salaryBenchmarkSchema, type Market } from "../../domain/research";

const statusResponseSchema = z.object({
  markets: z.array(z.object({
    market: marketSchema,
    activeReleaseId: z.string().optional(),
    activatedAt: z.string().datetime().optional(),
    quarantineCount: z.number().int().nonnegative(),
  }).strict()),
}).strict();

const refreshResponseSchema = z.object({
  results: z.array(z.union([
    z.object({ market: marketSchema, ok: z.literal(true), releaseId: z.string() }).strict(),
    z.object({ market: marketSchema, ok: z.literal(false), error: z.string() }).strict(),
  ])),
}).strict();

const lookupResponseSchema = z.object({
  releaseId: z.string().min(1),
  benchmark: salaryBenchmarkSchema,
  cpiPoints: z.array(cpiPointSchema),
  retrievedAt: z.string().datetime(),
  fallback: z.enum(["exact", "state", "national"]),
}).strict();

export type ResearchClientErrorCode = "offline" | "unavailable" | "stale-cache" | "invalid-response" | "request-failed";

export class ResearchClientError extends Error {
  constructor(readonly code: ResearchClientErrorCode, options?: ErrorOptions) { super(code, options); }
}

export interface ResearchLookupQuery {
  market: Market;
  canonicalRole: string;
  metroCode?: string;
  state?: string;
}

export function createResearchClient(fetchImpl: typeof fetch = fetch) {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetchImpl(path, init); }
    catch (error) { throw new ResearchClientError("offline", { cause: error }); }
    let body: unknown;
    try { body = await response.json(); }
    catch (error) { throw new ResearchClientError("invalid-response", { cause: error }); }
    if (!response.ok) {
      const serverCode = body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" && "code" in body.error ? body.error.code : undefined;
      if (serverCode === "research-unavailable") throw new ResearchClientError("unavailable");
      if (serverCode === "insufficient-evidence") throw new ResearchClientError("stale-cache");
      throw new ResearchClientError("request-failed");
    }
    return body;
  }

  function parse<T>(schema: z.ZodType<T>, input: unknown): T {
    try { return schema.parse(input); }
    catch (error) { throw new ResearchClientError("invalid-response", { cause: error }); }
  }

  return {
    async status() {
      return parse(statusResponseSchema, await request("/api/research/status", { headers: { accept: "application/json" } })).markets;
    },
    async refresh(market?: Market) {
      const body = market ? { market } : {};
      return parse(refreshResponseSchema, await request("/api/research/refresh", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
      })).results;
    },
    async lookup(query: ResearchLookupQuery) {
      return parse(lookupResponseSchema, await request("/api/research/lookup", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(query),
      }));
    },
  };
}

export const researchClient = createResearchClient();
