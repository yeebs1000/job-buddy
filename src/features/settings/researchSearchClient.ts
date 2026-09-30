import { researchSearchError, searchStatusSchema, tavilyKeySchema } from "../../domain/researchSearch";
async function request(method: string, apiKey?: string) {
  let response: Response;
  try { response = await fetch(`/api/research/web-salary/${method === "GET" ? "status" : "key"}`, {
    method, headers: { "content-type": "application/json" }, cache: "no-store",
    ...(apiKey === undefined ? {} : { body: JSON.stringify({ apiKey: tavilyKeySchema.parse(apiKey) }) }), signal: AbortSignal.timeout(20000),
  }); } catch { throw new Error("Research settings could not be reached. Keep Job Buddy running and retry."); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.code === "invalid-research-key" ? "Enter a valid Tavily API key." : researchSearchError(body?.error?.code));
  const parsed = searchStatusSchema.safeParse(body);
  if (!parsed.success) throw new Error("Research settings are unavailable. Restart Job Buddy and retry.");
  return parsed.data;
}
export const researchSearchClient = { status: () => request("GET"), saveKey: (key: string) => request("POST", key), removeKey: () => request("DELETE") };
