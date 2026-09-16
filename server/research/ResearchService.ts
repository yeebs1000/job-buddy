import type { Market } from "../../src/domain/research";
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

  async lookup(query: { market: Market; sourceOccupationCode: string }) {
    const active = await this.cache.active(query.market);
    if (!active) return { status: "insufficient_evidence" as const };
    const benchmarks = active.release.benchmarks.filter((benchmark) => benchmark.sourceOccupationCode === query.sourceOccupationCode);
    if (!benchmarks.length) return { status: "insufficient_evidence" as const };
    return { releaseId: active.release.id, benchmarks, cpiPoints: active.release.cpiPoints, retrievedAt: active.release.retrievedAt };
  }
}
