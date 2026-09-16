import { describe, expect, it, vi } from "vitest";
import { DiscoveryService } from "./DiscoveryService";
import { parseBoardUrl } from "../../src/domain/discovery";
import { fetchPublicJson } from "../publicData/fetchJson";

const board = parseBoardUrl("https://job-boards.greenhouse.io/example/jobs/123");
const job = { id: 123, title: "Software Engineer", location: { name: "Singapore" }, absolute_url: "https://job-boards.greenhouse.io/example/jobs/123" };
const now = () => Date.parse("2026-09-16T12:00:00Z");
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

describe("public company postings", () => {
  it("loads and caches normalized jobs without declaring them applications", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ jobs: [job] }));
    const service = new DiscoveryService(fetcher, now);
    const results = await Promise.all([service.list(board), service.list(board)]);
    expect(results[0].jobs[0]).toEqual({ id: "greenhouse:global:example:123", board, title: "Software Engineer", location: "Singapore", market: "SG", url: job.absolute_url, salary: [], retrievedAt: "2026-09-16T12:00:00.000Z" });
    await service.list(board);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://boards-api.greenhouse.io/v1/boards/example/jobs", expect.objectContaining({ redirect: "error" }));
  });

  it("converts Greenhouse cents, preserves unknown periods, and discards invalid ranges", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ ...job, pay_input_ranges: [
      { min_cents: 10000000, max_cents: 15000000, currency_type: "USD", title: "New York" },
      { min_cents: 600000, max_cents: 800000, currency_type: "SGD", title: "Monthly base" },
      { min_cents: 900, max_cents: 500, currency_type: "USD", title: "Annual base" },
      { min_cents: 1000, max_cents: 2000, currency_type: "UNKNOWN", title: "Base" },
    ] }));
    expect(await new DiscoveryService(fetcher, now).salary({ board, postingId: "123" })).toEqual([
      { minimum: 100000, maximum: 150000, currency: "USD", period: "unspecified", label: "New York" },
      { minimum: 6000, maximum: 8000, currency: "SGD", period: "monthly", label: "Monthly base" },
    ]);
    expect(String(fetcher.mock.calls[0][0])).toBe("https://boards-api.greenhouse.io/v1/boards/example/jobs/123?pay_transparency=true");
  });

  it("reads Lever EU with its own origin and explicit salary interval", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response([{ id: "abc-123", text: "Developer", categories: { location: "Remote" }, country: "US", hostedUrl: "https://jobs.eu.lever.co/example/abc-123", salaryRange: { currency: "USD", interval: "per-year-salary", min: 80000, max: 110000 } }]));
    const result = await new DiscoveryService(fetcher, now).list(parseBoardUrl("https://jobs.eu.lever.co/example"));
    expect(result.jobs[0]).toMatchObject({ market: "US", salary: [{ currency: "USD", period: "annual", minimum: 80000, maximum: 110000 }] });
    expect(String(fetcher.mock.calls[0][0])).toBe("https://api.eu.lever.co/v0/postings/example?mode=json&limit=1000");
  });

  it.each(["https://evil.example/company", "https://jobs.lever.co.evil.example/company", "http://jobs.lever.co/company", "https://user:pass@jobs.lever.co/company", "https://jobs.lever.co/%2e%2e"])("rejects untrusted board input %s", (url) => {
    expect(() => parseBoardUrl(url)).toThrow();
  });

  it("fails closed for oversized, rate-limited, and malformed responses", async () => {
    await expect(fetchPublicJson("https://example.com", async () => new Response("123456"), 5)).rejects.toThrow("too-large");
    await expect(fetchPublicJson("https://example.com", async () => new Response("private detail", { status: 429 }))).rejects.toThrow("rate-limited");
    await expect(new DiscoveryService(async () => response({ jobs: [{ ...job, absolute_url: "javascript:alert(1)" }] })).list(board)).rejects.toThrow();
  });
});
