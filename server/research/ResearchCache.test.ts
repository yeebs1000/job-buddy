import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchOfficialSource } from "./ResearchSource";
import { ResearchCache } from "./ResearchCache";
import { release } from "./testFixtures";

describe("ResearchCache", () => {
  let root: string;
  let cache: ResearchCache;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "job-buddy-research-"));
    cache = new ResearchCache({ root, now: () => Date.parse("2026-09-16T00:00:00.000Z") });
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("promotes a valid staged release and retains the old release after an invalid refresh", async () => {
    await cache.promote(release("sg-2025"));
    await expect(cache.stage({ ...release("bad"), benchmarks: [{ ...release("bad").benchmarks[0], p25: 10_000, p50: 5_000 }] })).rejects.toThrow("invalid-research-release");

    expect((await cache.active("SG"))?.release.id).toBe("sg-2025");
    expect(await cache.status("SG")).toMatchObject({ activeReleaseId: "sg-2025", quarantineCount: 1 });
  });

  it("rejects duplicate benchmark keys, wrong market currencies, and non-HTTPS attribution", async () => {
    const valid = release("sg-2025");
    await expect(cache.stage({ ...valid, benchmarks: [...valid.benchmarks, valid.benchmarks[0]] })).rejects.toThrow("invalid-research-release");
    await expect(cache.stage({ ...valid, benchmarks: [{ ...valid.benchmarks[0], currency: "USD" }] })).rejects.toThrow("invalid-research-release");
    await expect(cache.stage({ ...valid, benchmarks: [{ ...valid.benchmarks[0], sourceUrl: "http://example.gov/wages" }] })).rejects.toThrow("invalid-research-release");
    expect((await cache.status("SG")).quarantineCount).toBe(3);
  });

  it("does not write raw source bodies into quarantine diagnostics", async () => {
    await expect(cache.stage({ ...release("bad"), rawBody: "private-source-body" })).rejects.toThrow();
    const status = await cache.status("SG");
    expect(status.quarantineCount).toBe(1);
    expect(await readFile(status.latestQuarantinePath!, "utf8")).not.toContain("private-source-body");
  });
});

describe("fetchOfficialSource", () => {
  it("allows one same-host redirect and sends bounded descriptive headers", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) return new Response(null, { status: 302, headers: { location: "https://www.bls.gov/file.zip" } });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-length": "3" } });
    };

    const result = await fetchOfficialSource("https://www.bls.gov/start", { allowedHostname: "www.bls.gov", accept: "application/zip", fetchImpl });

    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[0].init?.headers).get("user-agent")).toMatch(/JobBuddy/);
    expect(new Headers(calls[0].init?.headers).get("accept")).toBe("application/zip");
  });

  it("rejects redirect host changes, a second redirect, and oversized responses", async () => {
    await expect(fetchOfficialSource("https://www.bls.gov/start", {
      allowedHostname: "www.bls.gov",
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/file" } }),
    })).rejects.toThrow("source-host-not-allowed");
    let redirects = 0;
    await expect(fetchOfficialSource("https://www.bls.gov/start", {
      allowedHostname: "www.bls.gov",
      fetchImpl: async () => { redirects += 1; return new Response(null, { status: 302, headers: { location: `https://www.bls.gov/${redirects}` } }); },
    })).rejects.toThrow("too-many-source-redirects");
    await expect(fetchOfficialSource("https://www.bls.gov/start", {
      allowedHostname: "www.bls.gov",
      maximumBytes: 2,
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-length": "3" } }),
    })).rejects.toThrow("source-response-too-large");
  });
});
