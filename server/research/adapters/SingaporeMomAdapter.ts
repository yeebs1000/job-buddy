import { roleCatalog } from "../../../src/features/research/roleCatalog";
import type { CpiPoint, SalaryBenchmark } from "../../../src/domain/research";
import {
  fetchOfficialSource,
  validateResearchRelease,
  type ResearchSource,
  type ValidatedResearchRelease,
} from "../ResearchSource";
import { sourceHostnames, sourceManifest } from "../sourceManifest";
import { readValuesOnlyWorkbook } from "../parsers/excel";

type SourceFetcher = typeof fetchOfficialSource;

export class SingaporeMomAdapter implements ResearchSource {
  readonly market = "SG" as const;
  private readonly fetchSource: SourceFetcher;
  private readonly now: () => number;

  constructor(options: { fetchSource?: SourceFetcher; now?: () => number } = {}) {
    this.fetchSource = options.fetchSource ?? fetchOfficialSource;
    this.now = options.now ?? Date.now;
  }

  async refresh(): Promise<ValidatedResearchRelease> {
    const [wages, cpi] = await Promise.all([
      this.fetchSource(sourceManifest.SG.wages, { allowedHostname: sourceHostnames.SG.wages, accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      this.fetchSource(sourceManifest.SG.cpi, { allowedHostname: sourceHostnames.SG.cpi, accept: "application/json" }),
    ]);
    const worksheets = await readValuesOnlyWorkbook(wages.bytes);
    const provisional = parseMomBenchmarks(worksheets.flatMap((sheet) => sheet.rows), wages.finalUrl);
    if (!provisional.length) throw new Error("no-supported-singapore-benchmarks");
    const referencePeriod = provisional[0].referencePeriod;
    const releaseId = `sg-mom-${referencePeriod}`;
    const benchmarks = provisional.map((benchmark, index) => ({ ...benchmark, id: `${releaseId}-${benchmark.sourceOccupationCode}-${index}`, releaseId }));
    const cpiPoints = parseSingStatCpi(JSON.parse(new TextDecoder().decode(cpi.bytes)), cpi.finalUrl, new Date(this.now()).toISOString());
    const retrievedAt = new Date(this.now()).toISOString();
    return validateResearchRelease({
      id: releaseId,
      market: "SG",
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

type ProvisionalBenchmark = Omit<SalaryBenchmark, "id" | "releaseId">;

export function parseMomBenchmarks(rows: unknown[][], sourceUrl: string): ProvisionalBenchmark[] {
  const headerIndex = rows.findIndex((row) => {
    const headings = row.map(normalizeHeading);
    return headings.includes("occupation code") && headings.some((value) => value.includes("25th")) && headings.some((value) => value === "median") && headings.some((value) => value.includes("75th"));
  });
  if (headerIndex < 0) return [];
  const headings = rows[headerIndex].map(normalizeHeading);
  const column = (matcher: (value: string) => boolean) => headings.findIndex(matcher);
  const codeColumn = column((value) => value === "occupation code");
  const labelColumn = column((value) => value === "occupation" || value === "occupation title");
  const industryColumn = column((value) => value === "industry");
  const p25Column = column((value) => value.includes("25th"));
  const p50Column = column((value) => value === "median" || value.includes("50th"));
  const p75Column = column((value) => value.includes("75th"));
  const periodColumn = column((value) => value.includes("reference period") || value === "period");
  const allowedCodes = new Set(roleCatalog.map((entry) => entry.sourceCodes.SG));
  const results: ProvisionalBenchmark[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const code = text(row[codeColumn]);
    if (!allowedCodes.has(code)) continue;
    const p25 = number(row[p25Column]);
    const p50 = number(row[p50Column]);
    const p75 = number(row[p75Column]);
    const referencePeriod = normalizePeriod(text(row[periodColumn]));
    if (!p25 || !p50 || !p75 || p25 > p50 || p50 > p75 || !referencePeriod) continue;
    results.push({
      market: "SG", currency: "SGD", period: "monthly", sourceOccupationCode: code,
      sourceOccupationLabel: text(row[labelColumn]) || code,
      ...(industryColumn >= 0 && text(row[industryColumn]) ? { industry: text(row[industryColumn]) } : {}),
      geographyLevel: "market", geographyCode: "SG", geographyLabel: "Singapore",
      p25, p50, p75, referencePeriod,
      compensationScope: "Gross monthly wage excluding bonuses for full-time resident employees",
      sourceUrl,
    });
  }
  return results;
}

export function parseSingStatCpi(input: unknown, sourceUrl: string, retrievedAt: string): CpiPoint[] {
  if (!input || typeof input !== "object") return [];
  const data = (input as { Data?: unknown }).Data;
  if (!data || typeof data !== "object") return [];
  const record = data as { metadata?: { basePeriod?: unknown }; row?: unknown[] };
  const baseLabel = text(record.metadata?.basePeriod) || "Official SingStat base";
  const allItems = record.row?.find((item) => item && typeof item === "object" && /^all\s+items$/i.test(text((item as { rowText?: unknown }).rowText)));
  if (!allItems || typeof allItems !== "object") return [];
  const columns = (allItems as { columns?: unknown[] }).columns;
  if (!Array.isArray(columns)) return [];
  return columns.flatMap((column, index) => {
    if (!column || typeof column !== "object") return [];
    const value = column as { key?: unknown; value?: unknown };
    const period = normalizePeriod(text(value.key));
    const cpi = number(value.value);
    if (!period || !cpi) return [];
    return [{ id: `sg-cpi-${period}-${index}`, source: "Singapore Department of Statistics All Items CPI", sourceUrl, market: "SG" as const, period, index: cpi, baseLabel, retrievedAt }];
  });
}

const text = (value: unknown) => String(value ?? "").trim();
const normalizeHeading = (value: unknown) => text(value).toLocaleLowerCase("en").replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
const number = (value: unknown) => {
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const normalizePeriod = (value: string) => {
  const match = value.match(/^(\d{4})(?:[\s\-/](\d{1,2}))?$/);
  if (!match) return undefined;
  const month = match[2] ? Number(match[2]) : 1;
  return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, "0")}` : undefined;
};
