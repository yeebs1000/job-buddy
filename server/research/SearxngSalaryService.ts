import { z } from "zod";
import { webSalaryQuerySchema, type WebSalaryQuery, type WebSalaryResponse } from "../../src/domain/webSalary";
import { isSafeExternalHttpsUrl } from "../../src/domain/jobUrl";

const providerSchema = z.object({ results: z.array(z.object({
  title: z.string(), url: z.string(), content: z.string().nullish(), publishedDate: z.string().nullish(),
})).max(500), unresponsive_engines: z.array(z.unknown()).optional() });
const plain = (value: string, size: number) => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").slice(0, size);

function localEndpoint(baseUrl: string): URL | undefined {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") return undefined;
    return new URL("/search", url);
  } catch { return undefined; }
}

export class SearxngSalaryService {
  private cache = new Map<string, { at: number; value: WebSalaryResponse }>();
  private requests: number[] = [];
  private busy = false;
  constructor(private options: { baseUrl?: string; fetchImpl?: typeof fetch; now?: () => number } = {}) {}
  private endpoint() { return localEndpoint(this.options.baseUrl ?? "http://127.0.0.1:8088"); }
  // Configuration only; a successful search is required to establish engine availability.
  status() { return { configured: Boolean(this.endpoint()) }; }
  async search(input: WebSalaryQuery): Promise<WebSalaryResponse> {
    const query = webSalaryQuerySchema.parse(input);
    if (!this.status().configured) throw new Error("web-search-unconfigured");
    const now = (this.options.now ?? Date.now)();
    const cacheKey = JSON.stringify(query);
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.at < 86400000) return structuredClone(cached.value);
    this.requests = this.requests.filter(at => now - at < 3600000);
    if (this.busy || this.requests.length >= 20) throw new Error("web-search-rate-limited");
    this.busy = true; this.requests.push(now);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const url = this.endpoint()!;
      const safeText = (text: string) => text.replace(/[^\p{L}\p{N}\s&.,()-]/gu, " ");
      const bodyParams = new URLSearchParams({ q: `${safeText(query.company)} ${safeText(query.role)} ${safeText(query.location)} salary range`, format: "json", categories: "general", language: "en", safesearch: "1" });
      let response: Response;
      try {
        response = await (this.options.fetchImpl ?? fetch)(url, { method: "POST", body: bodyParams.toString(), headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, redirect: "error", signal: controller.signal });
      } catch { throw new Error("web-search-unavailable"); }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(response.status === 429 ? "web-search-rate-limited" : response.status === 403 ? "web-search-json-disabled" : "web-search-failed");
      }
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        await response.body?.cancel(); throw new Error("web-search-failed");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("web-search-failed");
      let size = 0; let text = ""; const decoder = new TextDecoder();
      try {
        while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 512000) throw new Error("web-search-failed"); text += decoder.decode(part.value, { stream: true }); }
        text += decoder.decode();
      } finally { await reader.cancel(); }
      const body = providerSchema.parse(JSON.parse(text));
      if (!body.results.length && body.unresponsive_engines?.length) throw new Error("web-search-engines-unavailable");
      const searchedAt = new Date(now).toISOString();
      const seen = new Set<string>();
      const results = body.results.filter(item => {
        if (!isSafeExternalHttpsUrl(item.url) || item.url.length > 2048 || seen.has(item.url)) return false;
        seen.add(item.url); return true;
      }).slice(0, 10).map(item => ({
        url: item.url, title: plain(item.title, 300), excerpt: plain(item.content ?? "", 2000),
        retrievedAt: searchedAt, ...(item.publishedDate ? { pageDate: plain(item.publishedDate, 80) } : {}),
      }));
      const value = { results, searchedAt };
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(cacheKey, { at: now, value });
      return structuredClone(value);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      throw new Error(["web-search-rate-limited", "web-search-unavailable", "web-search-json-disabled", "web-search-engines-unavailable"].includes(code) ? code : "web-search-failed");
    } finally { clearTimeout(timeout); this.busy = false; }
  }
}
