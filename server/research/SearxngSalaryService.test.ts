import { describe, expect, it, vi } from "vitest";
import { SearxngSalaryService } from "./SearxngSalaryService";

const query = { company: "Example Employer", role: "Analyst", location: "Hong Kong" };
const json = (body: unknown) => Response.json(body);
const service = (options: { baseUrl?: string; fetchImpl?: typeof fetch; now?: () => number } = {}) =>
  new SearxngSalaryService(options);

describe("local SearXNG salary search", () => {
  it("posts only public search fields to loopback JSON search without a paid API key", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ query: "test", results: [
      { title: "Salary <b>guide</b>", url: "https://example.com/pay", content: "HKD 600000–900000 annual base salary", publishedDate: "2026-01-01", engines: ["bing", "google"] },
      { title: "unsafe", url: "javascript:alert(1)", content: "no" },
    ], unresponsive_engines: [] }));
    const search = service({ fetchImpl: fetcher });
    const result = await search.search(query);
    expect(result.results).toEqual([{ title: "Salary guide", url: "https://example.com/pay", excerpt: "HKD 600000–900000 annual base salary", pageDate: "2026-01-01", retrievedAt: result.searchedAt }]);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8088/search");
    expect(options.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({ q: "Example Employer Analyst Hong Kong salary range", format: "json", categories: "general", language: "en", safesearch: "1" });
    expect(options.headers).toEqual({ accept: "application/json", "content-type": "application/x-www-form-urlencoded" });
    expect(options.redirect).toBe("error");
    expect(await search.search(query)).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["https://public.example", "http://192.168.1.2:8088", "http://127.0.0.1:8088/?q=private", "http://user:password@127.0.0.1:8088", "http://127.0.0.1:8088/other", "not-a-url"])("refuses non-local or ambiguous endpoint %s before any request", async baseUrl => {
    const fetcher = vi.fn();
    const search = service({ baseUrl, fetchImpl: fetcher });
    expect(search.status().configured).toBe(false);
    await expect(search.search(query)).rejects.toThrow("web-search-unconfigured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects private payload fields before network access", async () => {
    const fetcher = vi.fn();
    await expect(service({ fetchImpl: fetcher }).search({ ...query, email: "private" } as typeof query)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [403, "web-search-json-disabled"], [429, "web-search-rate-limited"], [500, "web-search-failed"],
  ])("returns a safe actionable error for status %s", async (status, code) => {
    await expect(service({ fetchImpl: vi.fn().mockResolvedValue(new Response("private upstream diagnostics", { status: status as number })) }).search(query)).rejects.toThrow(code as string);
  });

  it("reports offline connections without exposing low-level details", async () => {
    await expect(service({ fetchImpl: vi.fn().mockRejectedValue(new Error("private socket diagnostic")) }).search(query)).rejects.toThrow("web-search-unavailable");
  });

  it.each([new Response("x".repeat(600000), { headers: { "content-type": "application/json" } }), json({ unexpected: [] }), new Response("<html>login</html>")])("rejects oversized, malformed or non-JSON responses", async response => {
    await expect(service({ fetchImpl: vi.fn().mockResolvedValue(response) }).search(query)).rejects.toThrow("web-search-failed");
  });

  it("distinguishes failing engines from a successful zero-result search", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ results: [], unresponsive_engines: [["bing", "CAPTCHA"]] })).mockResolvedValueOnce(json({ results: [], unresponsive_engines: [] }));
    const search = service({ fetchImpl: fetcher });
    await expect(search.search(query)).rejects.toThrow("web-search-engines-unavailable");
    expect((await search.search(query)).results).toEqual([]);
  });

  it("limits requests but lets cached evidence remain available", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({ results: [] })));
    const search = service({ fetchImpl: fetcher, now: () => 1800000000000 });
    for (let index = 0; index < 20; index++) await search.search({ ...query, company: `Employer ${index}` });
    await expect(search.search(query)).rejects.toThrow("web-search-rate-limited");
    expect((await search.search({ ...query, company: "Employer 0" })).results).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(20);
  });
});
