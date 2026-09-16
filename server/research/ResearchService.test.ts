import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchCache } from "./ResearchCache";
import { ResearchService } from "./ResearchService";
import type { ResearchSource } from "./ResearchSource";
import { release } from "./testFixtures";

describe("ResearchService", () => {
  let root: string;
  let cache: ResearchCache;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "job-buddy-research-service-"));
    cache = new ResearchCache({ root });
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("refreshes markets independently and preserves last-known-good lookup after a source failure", async () => {
    await cache.promote(release("sg-old"));
    const sg = { market: "SG", refresh: vi.fn().mockRejectedValue(new Error("offline")) } satisfies ResearchSource;
    const us = { market: "US", refresh: vi.fn().mockResolvedValue(release("us-new", "US")) } satisfies ResearchSource;
    const service = new ResearchService({ cache, sources: [sg, us] });

    expect(await service.refresh()).toEqual([
      { market: "SG", ok: false, error: "offline" },
      { market: "US", ok: true, releaseId: "us-new" },
    ]);
    expect(await service.lookup({ market: "SG", sourceOccupationCode: "2512" })).toMatchObject({ releaseId: "sg-old", benchmarks: [{ id: "sg-old-benchmark" }] });
    expect(await service.lookup({ market: "US", sourceOccupationCode: "15-1252" })).toMatchObject({ releaseId: "us-new" });
  });

  it("reports insufficient evidence when no active release supports the query", async () => {
    const service = new ResearchService({ cache, sources: [] });
    expect(await service.lookup({ market: "HK", sourceOccupationCode: "2" })).toEqual({ status: "insufficient_evidence" });
    expect(await service.status()).toHaveLength(3);
  });
});
