import type { CpiPoint, SalaryBenchmark } from "../../../src/domain/research";
import { roleCatalog } from "../../../src/features/research/roleCatalog";
import { fetchOfficialSource, validateResearchRelease, type ResearchSource, type ValidatedResearchRelease } from "../ResearchSource";
import { parseBoundedZip, parseDelimitedText } from "../parsers/tabular";
import { sourceHostnames, sourceManifest } from "../sourceManifest";

type SourceFetcher = typeof fetchOfficialSource;

export class UnitedStatesBlsAdapter implements ResearchSource {
  readonly market = "US" as const;
  private readonly fetchSource: SourceFetcher;
  private readonly now: () => number;

  constructor(options: { fetchSource?: SourceFetcher; now?: () => number } = {}) {
    this.fetchSource = options.fetchSource ?? fetchOfficialSource;
    this.now = options.now ?? Date.now;
  }

  async refresh(): Promise<ValidatedResearchRelease> {
    const [wages, cpi] = await Promise.all([
      this.fetchSource(sourceManifest.US.wages, { allowedHostname: sourceHostnames.US.wages, accept: "application/zip" }),
      this.fetchSource(sourceManifest.US.cpi, { allowedHostname: sourceHostnames.US.cpi, accept: "application/json" }),
    ]);
    const archive = parseBoundedZip(wages.bytes);
    const wageEntry = [...archive.entries()].find(([name]) => /(?:oes|all).+\.(?:txt|csv)$/i.test(name) || /\.(?:txt|csv)$/i.test(name));
    if (!wageEntry) throw new Error("missing-oews-table");
    const delimiter = wageEntry[0].toLocaleLowerCase("en").endsWith(".csv") ? "," : "\t";
    const referencePeriod = oewsReferencePeriod(wages.finalUrl);
    const releaseId = `us-bls-oews-${referencePeriod}`;
    const benchmarks = parseOewsRows(parseDelimitedText(new TextDecoder("utf-8", { fatal: true }).decode(wageEntry[1]), delimiter), releaseId, referencePeriod, wages.finalUrl);
    if (!benchmarks.length) throw new Error("no-supported-us-benchmarks");
    const retrievedAt = new Date(this.now()).toISOString();
    const cpiPoints = parseBlsCpi(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(cpi.bytes)), cpi.finalUrl, retrievedAt);
    return validateResearchRelease({
      id: releaseId,
      market: "US",
      retrievedAt,
      sources: [
        { kind: "wages", url: wages.finalUrl, sha256: wages.sha256, retrievedAt },
        { kind: "cpi", url: cpi.finalUrl, sha256: cpi.sha256, retrievedAt },
      ],
      benchmarks,
      cpiPoints,
    });
  }
}

export function parseOewsRows(rows: Record<string, string>[], releaseId: string, referencePeriod: string, sourceUrl: string): SalaryBenchmark[] {
  const allowedCodes = new Set(roleCatalog.map((entry) => entry.sourceCodes.US));
  return rows.flatMap((row, index) => {
    const sourceOccupationCode = field(row, "OCC_CODE");
    if (!allowedCodes.has(sourceOccupationCode)) return [];
    const values = [field(row, "A_PCT25"), field(row, "A_MEDIAN", "A_PCT50"), field(row, "A_PCT75")];
    if (values.some((value) => !value || /[*#]/.test(value))) return [];
    const [p25, p50, p75] = values.map((value) => Number(value.replace(/,/g, "")));
    if (![p25, p50, p75].every((value) => Number.isFinite(value) && value > 0) || p25 > p50 || p50 > p75) return [];
    const areaType = field(row, "AREA_TYPE");
    let geographyLevel: SalaryBenchmark["geographyLevel"];
    let geographyCode: string;
    if (areaType === "1") { geographyLevel = "national"; geographyCode = "US"; }
    else if (areaType === "2") { geographyLevel = "state"; geographyCode = field(row, "PRIM_STATE").toUpperCase(); }
    else { geographyLevel = "metro"; geographyCode = field(row, "AREA"); }
    if (!geographyCode) return [];
    return [{
      id: `${releaseId}-${sourceOccupationCode}-${geographyLevel}-${geographyCode}-${index}`,
      releaseId,
      market: "US" as const,
      currency: "USD" as const,
      period: "annual" as const,
      sourceOccupationCode,
      sourceOccupationLabel: field(row, "OCC_TITLE") || sourceOccupationCode,
      geographyLevel,
      geographyCode,
      geographyLabel: field(row, "AREA_TITLE") || geographyCode,
      p25, p50, p75,
      referencePeriod,
      compensationScope: "Annual occupational wage for employed workers",
      sourceUrl,
    }];
  });
}

export function parseBlsCpi(input: unknown, sourceUrl: string, retrievedAt: string): CpiPoint[] {
  if (!input || typeof input !== "object" || (input as { status?: unknown }).status !== "REQUEST_SUCCEEDED") throw new Error("bls-cpi-request-failed");
  const series = (input as { Results?: { series?: unknown[] } }).Results?.series;
  const cpi = series?.find((candidate) => candidate && typeof candidate === "object" && (candidate as { seriesID?: unknown }).seriesID === "CUUR0000SA0") as { data?: unknown[] } | undefined;
  if (!cpi || !Array.isArray(cpi.data)) throw new Error("missing-bls-cpi-series");
  return cpi.data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { year?: unknown; period?: unknown; value?: unknown };
    const year = String(row.year ?? "");
    const periodCode = String(row.period ?? "");
    const match = periodCode.match(/^M(0[1-9]|1[0-2])$/);
    const index = Number(row.value);
    if (!/^\d{4}$/.test(year) || !match || !Number.isFinite(index) || index <= 0) return [];
    const period = `${year}-${match[1]}`;
    return [{ id: `us-cpi-${period}`, source: "U.S. BLS CPI-U, all items, not seasonally adjusted", sourceUrl, market: "US" as const, period, index, baseLabel: "1982-84=100", retrievedAt }];
  });
}

function oewsReferencePeriod(url: string): string {
  const year = url.match(/oesm(\d{2})/i)?.[1];
  if (!year) throw new Error("missing-oews-reference-period");
  return `20${year}-05`;
}

function field(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) if (row[name] !== undefined) return row[name].trim();
  return "";
}
