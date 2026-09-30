import { z } from "zod";
import { isIP } from "node:net";
import { webSalaryQuerySchema, type WebSalaryQuery, type WebSalaryResponse } from "../../src/domain/webSalary";
import { tavilyKeySchema, type ResearchSearchStatus } from "../../src/domain/researchSearch";
import { isSafeExternalHttpsUrl } from "../../src/domain/jobUrl";
import type { SearchKeyStore } from "./TavilyKeyStore";
import type { SearchBudgetPort } from "./SearchBudgetStore";

const responseSchema = z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string(), published_date: z.string().nullish() })).max(100) });
const plain = (v: string, size: number) => v.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").slice(0, size);
export const searchErrorCodes = ["web-search-unconfigured", "web-search-invalid-key", "web-search-budget-exhausted", "web-search-busy", "web-search-rate-limited", "web-search-storage-unavailable", "web-search-configuration-changed", "web-search-unavailable", "web-search-failed"];

export class TavilySearchService {
  private generation = 0;
  private mutations: Promise<void> = Promise.resolve();
  private changing = 0;
  private active?: AbortController;
  private busy = false;
  private requests: number[] = [];
  private cache = new Map<string, { at: number; result: WebSalaryResponse }>();
  constructor(private options: { keys: SearchKeyStore; budget: SearchBudgetPort; fetchImpl?: typeof fetch; now?: () => number }) {}
  async status(): Promise<ResearchSearchStatus> {
    await this.mutations;
    const platformSupported = this.options.keys.isSupported();
    return { configured: platformSupported && Boolean(await this.options.keys.get()), platformSupported, usage: await this.options.budget.status() };
  }
  configure(input: string) { const key = tavilyKeySchema.parse(input); return this.mutate(() => this.options.keys.set(key)); }
  removeKey() { return this.mutate(() => this.options.keys.delete()); }
  private mutate(operation: () => Promise<void>) {
    this.generation++; this.changing++; this.active?.abort(); this.cache.clear();
    const result = this.mutations.then(operation).finally(() => { this.changing--; });
    this.mutations = result.catch(() => undefined);
    return result;
  }
  async search(input: WebSalaryQuery): Promise<WebSalaryResponse> {
    const query = webSalaryQuerySchema.parse(input);
    if (this.changing) throw new Error("web-search-configuration-changed");
    const generation = this.generation;
    const check = () => { if (generation !== this.generation) throw new Error("web-search-configuration-changed"); };
    const key = await this.options.keys.get(); check();
    if (!key) throw new Error("web-search-unconfigured");
    const now = (this.options.now ?? Date.now)();
    const normalize = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
    const cacheKey = JSON.stringify([query.company, query.role, query.location, query.purpose ?? "salary"].map(normalize));
    const cached = this.cache.get(cacheKey);
    if (cached && now >= cached.at && now - cached.at < 86400000) return structuredClone(cached.result);
    this.requests = this.requests.filter(at => now - at < 3600000);
    if (this.busy) throw new Error("web-search-busy");
    if (this.requests.length >= 20) throw new Error("web-search-rate-limited");
    this.busy = true;
    const controller = new AbortController(); this.active = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await this.options.budget.reserve(); check();
      this.requests.push(now);
      timeout = setTimeout(() => controller.abort(), 12000);
      const safe = (v: string) => v.replace(/[^\p{L}\p{N}\s&.,()-]/gu, " ");
      const suffix = query.purpose === "company-rating" ? "employee reviews overall company rating" : "salary range";
      const response = await (this.options.fetchImpl ?? fetch)("https://api.tavily.com/search", {
        method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query: `${safe(query.company)} ${safe(query.role)} ${safe(query.location)} ${suffix}`, search_depth: "basic", auto_parameters: false, include_answer: false, include_raw_content: false, include_images: false, max_results: 10, topic: "general" }),
        redirect: "error", signal: controller.signal,
      }).catch(() => { check(); throw new Error("web-search-unavailable"); });
      check();
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(response.status === 401 || response.status === 403 ? "web-search-invalid-key" : response.status === 429 ? "web-search-rate-limited" : [432, 433].includes(response.status) ? "web-search-budget-exhausted" : "web-search-failed");
      }
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) { await response.body?.cancel(); throw new Error("web-search-failed"); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("web-search-failed");
      let size = 0, text = ""; const decoder = new TextDecoder();
      try {
        while (true) { const part = await reader.read(); check(); if (part.done) break; size += part.value.byteLength; if (size > 512000) throw new Error("web-search-failed"); text += decoder.decode(part.value, { stream: true }); }
        text += decoder.decode();
      } finally { await reader.cancel().catch(() => undefined); }
      const parsed = responseSchema.parse(JSON.parse(text));
      const searchedAt = new Date(now).toISOString(), seen = new Set<string>();
      const results = parsed.results.filter(item => {
        if (!isSafeExternalHttpsUrl(item.url) || item.url.length > 2048 || seen.has(item.url)) return false;
        const host = new URL(item.url).hostname.replace(/^\[|\]$/g, "");
        if (isIP(host) || !host.includes(".") || /\.(localhost|local|internal)$/i.test(host)) return false;
        seen.add(item.url); return true;
      }).slice(0, 10).map(item => ({ url: item.url, title: plain(item.title, 300), excerpt: plain(item.content, 2000), retrievedAt: searchedAt, ...(item.published_date ? { pageDate: plain(item.published_date, 80) } : {}) }));
      check(); const result = { results, searchedAt };
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(cacheKey, { at: now, result });
      return structuredClone(result);
    } catch (error) {
      check(); const code = error instanceof Error ? error.message : "";
      throw new Error(searchErrorCodes.includes(code) ? code : controller.signal.aborted ? "web-search-unavailable" : "web-search-failed");
    } finally { clearTimeout(timeout); this.busy = false; if (this.active === controller) this.active = undefined; }
  }
}
