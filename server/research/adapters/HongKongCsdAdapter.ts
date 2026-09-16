import type { CpiPoint } from "../../../src/domain/research";
import { fetchOfficialSource, validateResearchRelease, type ResearchSource, type ValidatedResearchRelease } from "../ResearchSource";
import { extractPdfText } from "../parsers/pdfText";
import { sourceHostnames, sourceManifest } from "../sourceManifest";

type SourceFetcher = typeof fetchOfficialSource;
type PdfExtractor = typeof extractPdfText;

export class HongKongCsdAdapter implements ResearchSource {
  readonly market = "HK" as const;
  private readonly fetchSource: SourceFetcher;
  private readonly extractText: PdfExtractor;
  private readonly now: () => number;

  constructor(options: { fetchSource?: SourceFetcher; extractText?: PdfExtractor; now?: () => number } = {}) {
    this.fetchSource = options.fetchSource ?? fetchOfficialSource;
    this.extractText = options.extractText ?? extractPdfText;
    this.now = options.now ?? Date.now;
  }

  async refresh(): Promise<ValidatedResearchRelease> {
    const [earningsSource, cpiSource] = await Promise.all([
      this.fetchSource(sourceManifest.HK.wages, { allowedHostname: sourceHostnames.HK.wages, accept: "application/pdf" }),
      this.fetchSource(sourceManifest.HK.cpi, { allowedHostname: sourceHostnames.HK.cpi, accept: "application/pdf" }),
    ]);
    const [earningsText, cpiText] = await Promise.all([
      this.extractText(earningsSource.bytes, { sourceUrl: earningsSource.finalUrl, allowedHostname: sourceHostnames.HK.wages }),
      this.extractText(cpiSource.bytes, { sourceUrl: cpiSource.finalUrl, allowedHostname: sourceHostnames.HK.cpi }),
    ]);
    const distribution = parseEarningsTable69(earningsText);
    const retrievedAt = new Date(this.now()).toISOString();
    const referencePeriod = parseReferencePeriod(earningsText);
    const releaseId = `hk-csd-${referencePeriod}`;
    const benchmarks = ["2", "3"].map((sourceOccupationCode) => ({
      id: `${releaseId}-${sourceOccupationCode}`,
      releaseId,
      market: "HK" as const,
      currency: "HKD" as const,
      period: "monthly" as const,
      sourceOccupationCode,
      sourceOccupationLabel: "Managers, professionals and associate professionals",
      geographyLevel: "market" as const,
      geographyCode: "HK",
      geographyLabel: "Hong Kong",
      p25: distribution.p25,
      p50: distribution.p50,
      p75: distribution.p75,
      referencePeriod,
      compensationScope: "Monthly employment earnings of full-time employees",
      sourceUrl: earningsSource.finalUrl,
      matchCeiling: "limited" as const,
    }));
    const cpiPoints = parseCompositeCpi(cpiText, cpiSource.finalUrl, retrievedAt);
    return validateResearchRelease({
      id: releaseId,
      market: "HK",
      retrievedAt,
      sources: [
        { kind: "wages", url: earningsSource.finalUrl, sha256: earningsSource.sha256, retrievedAt },
        { kind: "cpi", url: cpiSource.finalUrl, sha256: cpiSource.sha256, retrievedAt },
      ],
      benchmarks,
      cpiPoints,
    });
  }
}

export function parseEarningsTable69(text: string): { p25: number; p50: number; p75: number } {
  const tableIndex = text.search(/Table\s*6\.9\b/i);
  if (tableIndex < 0) throw new Error("missing-hk-table-6-9");
  const section = text.slice(tableIndex, tableIndex + 10_000);
  const row = section.match(/Managers\s*,?\s*professionals\s+and\s+associate\s+professionals([^\r\n]*)/i)?.[1];
  if (!row) throw new Error("missing-hk-professional-row");
  const numbers = [...row.matchAll(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g)].map((match) => Number(match[0].replace(/,/g, "")));
  if (numbers.length < 6 || numbers.slice(0, 3).some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("invalid-hk-full-time-percentiles");
  const [p25, p50, p75] = numbers;
  if (p25 > p50 || p50 > p75) throw new Error("invalid-hk-full-time-percentiles");
  return { p25, p50, p75 };
}

export function parseCompositeCpi(text: string, sourceUrl: string, retrievedAt: string): CpiPoint[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => /^Composite CPI\b/i.test(line));
  if (start < 0 || /CPI\s*\([ABC]\)/i.test(lines[start])) throw new Error("missing-hk-composite-cpi");
  const baseLabel = lines[start].match(/\(([^)]+=\s*100)\)/i)?.[1]?.trim();
  if (!baseLabel) throw new Error("missing-hk-cpi-base");
  const points: CpiPoint[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(?:CPI\s*\([ABC]\)|Underlying)/i.test(line)) break;
    const match = line.match(/^(\d{4})\s+(\d{1,2})\s+(\d+(?:\.\d+)?)$/);
    if (!match) continue;
    const month = Number(match[2]);
    const index = Number(match[3]);
    if (month < 1 || month > 12 || !Number.isFinite(index) || index <= 0) continue;
    const period = `${match[1]}-${String(month).padStart(2, "0")}`;
    points.push({ id: `hk-cpi-${period}`, source: "Hong Kong C&SD Composite CPI", sourceUrl, market: "HK", period, index, baseLabel, retrievedAt });
  }
  if (!points.length) throw new Error("missing-hk-composite-cpi-levels");
  return points;
}

function parseReferencePeriod(text: string): string {
  const match = text.match(/Reference\s+period\s*:\s*(\d{4})(?:[\s\-/](\d{1,2}))?/i);
  if (!match) throw new Error("missing-hk-reference-period");
  return `${match[1]}-${String(Number(match[2] ?? "1")).padStart(2, "0")}`;
}
