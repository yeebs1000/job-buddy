import { afterEach, describe, expect, it, vi } from "vitest";
import { createResearchClient, ResearchClientError } from "./researchClient";

afterEach(() => vi.restoreAllMocks());

describe("researchClient", () => {
  it("returns a validated lookup bundle without raw source bodies", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      releaseId: "us-2025",
      benchmark: {
        id: "benchmark-1", releaseId: "us-2025", market: "US", currency: "USD", period: "annual",
        sourceOccupationCode: "15-1252", sourceOccupationLabel: "Software Developers", canonicalRole: "software-engineer",
        geographyLevel: "metro", geographyCode: "41860", geographyLabel: "San Francisco",
        p25: 120000, p50: 160000, p75: 200000, referencePeriod: "2025-05",
        compensationScope: "Annual wage", sourceUrl: "https://www.bls.gov/oes/",
      },
      cpiPoints: [], retrievedAt: "2026-09-16T00:00:00.000Z", fallback: "exact",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createResearchClient(fetchImpl);

    const result = await client.lookup({ market: "US", canonicalRole: "software-engineer", metroCode: "41860", state: "CA" });

    expect(result).toMatchObject({ benchmark: { geographyLevel: "metro" }, cpiPoints: [] });
    expect(JSON.stringify(result)).not.toContain("sourceBytes");
  });

  it("distinguishes offline, unavailable, stale-cache, and invalid response failures", async () => {
    const offline = createResearchClient(vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(offline.status()).rejects.toMatchObject({ code: "offline" });

    const unavailable = createResearchClient(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "research-unavailable" } }), { status: 503 })));
    await expect(unavailable.status()).rejects.toMatchObject({ code: "unavailable" });

    const stale = createResearchClient(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "insufficient-evidence" } }), { status: 404 })));
    await expect(stale.lookup({ market: "HK", canonicalRole: "software-engineer" })).rejects.toMatchObject({ code: "stale-cache" });

    const invalid = createResearchClient(vi.fn().mockResolvedValue(new Response(JSON.stringify({ releaseId: "bad" }), { status: 200 })));
    await expect(invalid.lookup({ market: "US", canonicalRole: "software-engineer" })).rejects.toBeInstanceOf(ResearchClientError);
    await expect(invalid.lookup({ market: "US", canonicalRole: "software-engineer" })).rejects.toMatchObject({ code: "invalid-response" });
  });
});
