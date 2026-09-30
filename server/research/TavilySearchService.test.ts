import { it, expect, vi } from "vitest";
import { TavilySearchService } from "./TavilySearchService";
const query = { company: "Example Employer", role: "Analyst", location: "Hong Kong" };
const record = { title: "Salary <b>guide</b>", url: "https://example.com/pay", content: "HKD 600000–900000 annual base salary" };
function setup(fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ results: [record] }))) {
  let key: string | null = "tvly-synthetic-only";
  const keys = { isSupported: () => true, get: vi.fn(async () => key), set: vi.fn(async (v: string) => { key = v; }), delete: vi.fn(async () => { key = null; }) };
  const usage = { month: "2026-09", used: 0, limit: 1000 as const };
  const budget = { status: async () => usage, reserve: vi.fn(async () => ({ ...usage, used: ++usage.used })) };
  let now = Date.UTC(2026, 8, 26);
  return { service: new TavilySearchService({ keys, budget, fetchImpl, now: () => now }), keys, budget, fetchImpl, advance: (ms: number) => { now += ms; } };
}
it("sends only public fields and caches normalized queries without spending again", async () => {
  const s = setup();
  expect((await s.service.search(query)).results[0]).toMatchObject({ title: "Salary guide", excerpt: record.content });
  const [url, init] = s.fetchImpl.mock.calls[0];
  expect(url).toBe("https://api.tavily.com/search");
  expect(JSON.parse(init!.body as string)).toEqual({ query: "Example Employer Analyst Hong Kong salary range", search_depth: "basic", auto_parameters: false, include_answer: false, include_raw_content: false, include_images: false, max_results: 10, topic: "general" });
  expect(init!.redirect).toBe("error");
  await s.service.search({ ...query, company: " example   employer " });
  expect((await s.service.status()).usage.used).toBe(1);
  await s.service.search({ ...query, purpose: "company-rating" });
  expect((await s.service.status()).usage.used).toBe(2);
  s.advance(86400001); await s.service.search(query);
  expect((await s.service.status()).usage.used).toBe(3);
});
it("refuses extra private fields and missing keys without a request", async () => {
  const s = setup();
  await expect(s.service.search({ ...query, email: "private" } as typeof query)).rejects.toThrow();
  await s.service.removeKey();
  await expect(s.service.search(query)).rejects.toThrow("web-search-unconfigured");
  expect(s.fetchImpl).not.toHaveBeenCalled();
});
it.each([[401,"web-search-invalid-key"],[403,"web-search-invalid-key"],[429,"web-search-rate-limited"],[432,"web-search-budget-exhausted"],[500,"web-search-failed"]])("sanitizes provider status %s", async (status, code) => {
  const s = setup(vi.fn<typeof fetch>().mockResolvedValue(new Response("private diagnostic", { status: status as number })));
  await expect(s.service.search(query)).rejects.toThrow(code as string);
  expect((await s.service.status()).usage.used).toBe(1);
});
it("never dispatches when a durable credit reservation fails", async () => {
  const s = setup(); s.budget.reserve.mockRejectedValue(new Error("web-search-budget-exhausted"));
  await expect(s.service.search(query)).rejects.toThrow("web-search-budget-exhausted");
  expect(s.fetchImpl).not.toHaveBeenCalled();
});
it("filters unsafe links and rejects oversized or malformed results", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ results: [record, { ...record, url: "https://127.0.0.1/x" }, { ...record, url: "javascript:alert(1)" }, record] }))
    .mockResolvedValueOnce(new Response("x".repeat(512001), { headers: { "content-type": "application/json" } }))
    .mockResolvedValueOnce(Response.json({ unexpected: true }));
  const s = setup(fetcher);
  expect((await s.service.search(query)).results).toHaveLength(1);
  await expect(s.service.search({ ...query, role: "Other" })).rejects.toThrow("web-search-failed");
  await expect(s.service.search({ ...query, role: "Another" })).rejects.toThrow("web-search-failed");
});
it("discards responses from a removed key and never caches them", async () => {
  let resolve!: (response: Response) => void;
  const s = setup(vi.fn<typeof fetch>().mockImplementation(() => new Promise(r => { resolve = r; })));
  const pending = s.service.search(query);
  const failure = expect(pending).rejects.toThrow("web-search-configuration-changed");
  await vi.waitFor(() => expect(s.fetchImpl).toHaveBeenCalledTimes(1));
  await s.service.removeKey(); resolve(Response.json({ results: [record] })); await failure;
  await s.service.configure("tvly-replacement");
  s.fetchImpl.mockResolvedValue(Response.json({ results: [] }));
  expect((await s.service.search(query)).results).toEqual([]);
  expect(s.fetchImpl).toHaveBeenCalledTimes(2);
});
it("blocks stale work if the key changes during reservation", async () => {
  const s = setup(); let release!: () => void;
  s.budget.reserve.mockImplementationOnce(() => new Promise(r => { release = () => r({ month: "2026-09", used: 1, limit: 1000 }); }));
  const pending = s.service.search(query); const failure = expect(pending).rejects.toThrow("web-search-configuration-changed");
  await vi.waitFor(() => expect(s.budget.reserve).toHaveBeenCalledTimes(1));
  await s.service.configure("tvly-replacement"); release(); await failure;
  expect(s.fetchImpl).not.toHaveBeenCalled();
});
it("enforces hourly throttling while retaining cached results", async () => {
  const s = setup();
  for (let i = 0; i < 20; i++) await s.service.search({ ...query, company: `Employer ${i}` });
  await expect(s.service.search(query)).rejects.toThrow("web-search-rate-limited");
  expect((await s.service.search({ ...query, company: "Employer 0" })).results).toHaveLength(1);
});

it("reports a local concurrent search separately from a provider rate limit without spending credits", async () => {
  let resolve!: (response: Response) => void;
  const s = setup(vi.fn<typeof fetch>().mockImplementation(() => new Promise(r => { resolve = r; })));
  const first = s.service.search(query);
  await vi.waitFor(() => expect(s.fetchImpl).toHaveBeenCalledTimes(1));
  await expect(s.service.search({ ...query, purpose: "company-rating" })).rejects.toThrow("web-search-busy");
  resolve(Response.json({ results: [record] })); await first;
  expect((await s.service.status()).usage.used).toBe(1);
});
