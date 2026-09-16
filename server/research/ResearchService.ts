import type { Market } from "../../src/domain/research";
import { roleCatalog } from "../../src/features/research/roleCatalog";
import { ResearchCache, type ResearchCacheStatus } from "./ResearchCache";
import type { ResearchSource } from "./ResearchSource";

export class ResearchService {
  private readonly cache: ResearchCache;
  private readonly sources: ResearchSource[];

  constructor(options: { cache: ResearchCache; sources: ResearchSource[] }) {
    this.cache = options.cache;
    this.sources = options.sources;
  }

  async refresh(market?: Market): Promise<Array<{ market: Market; ok: true; releaseId: string } | { market: Market; ok: false; error: string }>> {
    const selected = this.sources.filter((source) => !market || source.market === market);
    return Promise.all(selected.map(async (source) => {
      try {
        const release = await this.cache.promote(await source.refresh());
        return { market: source.market, ok: true as const, releaseId: release.id };
      } catch (error) {
        return { market: source.market, ok: false as const, error: error instanceof Error ? error.message : "refresh-failed" };
      }
    }));
  }

  async status(): Promise<ResearchCacheStatus[]> {
    return Promise.all((["SG", "HK", "US"] as const).map((market) => this.cache.status(market)));
  }

  async lookup(query: { market: Market; sourceOccupationCode?: string; canonicalRole?: string; metroCode?: string; state?: string }) {
    const active = await this.cache.active(query.market);
    if (!active) return { status: "insufficient_evidence" as const };
    const catalogEntry = query.canonicalRole ? roleCatalog.find((entry) => entry.canonicalRole === query.canonicalRole) : undefined;
    const sourceOccupationCode = query.sourceOccupationCode ?? catalogEntry?.sourceCodes[query.market];
    if (!sourceOccupationCode) return { status: "insufficient_evidence" as const };
    const benchmarks = active.release.benchmarks.filter((benchmark) => benchmark.sourceOccupationCode === sourceOccupationCode
      && (!query.canonicalRole || !benchmark.canonicalRole || benchmark.canonicalRole === query.canonicalRole));
    if (!benchmarks.length) return { status: "insufficient_evidence" as const };
    if (query.canonicalRole) {
      let benchmark;
      let fallback: "exact" | "state" | "national" = "exact";
      if (query.market === "US") {
        benchmark = query.metroCode ? benchmarks.find((row) => row.geographyLevel === "metro" && row.geographyCode === query.metroCode) : undefined;
        if (!benchmark && query.state) { benchmark = benchmarks.find((row) => row.geographyLevel === "state" && row.geographyCode.toUpperCase() === query.state?.toUpperCase()); fallback = "state"; }
        if (!benchmark) { benchmark = benchmarks.find((row) => row.geographyLevel === "national" && row.geographyCode === "US"); fallback = "national"; }
      } else {
        benchmark = benchmarks.find((row) => (row.geographyLevel === "market" || row.geographyLevel === "national") && row.geographyCode === query.market);
      }
      if (!benchmark) return { status: "insufficient_evidence" as const };
      return { releaseId: active.release.id, benchmark, cpiPoints: active.release.cpiPoints, retrievedAt: active.release.retrievedAt, fallback };
    }
    return { releaseId: active.release.id, benchmarks, cpiPoints: active.release.cpiPoints, retrievedAt: active.release.retrievedAt };
  }
}
