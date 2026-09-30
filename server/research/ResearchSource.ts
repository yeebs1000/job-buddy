import { createHash } from "node:crypto";
import { z } from "zod";
import {
  cpiPointSchema,
  marketSchema,
  salaryBenchmarkSchema,
  type Market,
} from "../../src/domain/research";

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const SOURCE_TIMEOUT_MS = 30_000;
export const RESEARCH_USER_AGENT = "JobBuddy/1.0 (+https://github.com/job-buddy; official salary research)";

const httpsUrl = z.string().url().max(2_048).refine((value) => new URL(value).protocol === "https:", "https-required");
const sourceRecordSchema = z.object({
  kind: z.enum(["wages", "cpi"]),
  url: httpsUrl,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.string().datetime(),
}).strict();

const researchReleaseInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  market: marketSchema,
  retrievedAt: z.string().datetime(),
  sources: sourceRecordSchema.array().min(1).max(10),
  benchmarks: salaryBenchmarkSchema.array().max(100_000),
  cpiPoints: cpiPointSchema.array().max(5_000),
}).strict().superRefine((release, context) => {
  const expectedCurrency = release.market === "SG" ? "SGD" : release.market === "HK" ? "HKD" : "USD";
  const keys = new Set<string>();
  for (const [index, benchmark] of release.benchmarks.entries()) {
    if (benchmark.releaseId !== release.id || benchmark.market !== release.market || benchmark.currency !== expectedCurrency) {
      context.addIssue({ code: "custom", path: ["benchmarks", index], message: "release-benchmark-mismatch" });
    }
    if (!/^\d{4}(?:-\d{2})?$/.test(benchmark.referencePeriod)) {
      context.addIssue({ code: "custom", path: ["benchmarks", index, "referencePeriod"], message: "invalid-period" });
    }
    if (new URL(benchmark.sourceUrl).protocol !== "https:") {
      context.addIssue({ code: "custom", path: ["benchmarks", index, "sourceUrl"], message: "https-required" });
    }
    const key = [benchmark.sourceOccupationCode, benchmark.industry ?? "", benchmark.geographyLevel, benchmark.geographyCode, benchmark.period].join("\0");
    if (keys.has(key)) context.addIssue({ code: "custom", path: ["benchmarks", index], message: "duplicate-benchmark-key" });
    keys.add(key);
  }
  for (const [index, point] of release.cpiPoints.entries()) {
    if (point.market !== release.market || !/^\d{4}-\d{2}$/.test(point.period)) {
      context.addIssue({ code: "custom", path: ["cpiPoints", index], message: "release-cpi-mismatch" });
    }
  }
});

export type ResearchReleaseInput = z.infer<typeof researchReleaseInputSchema>;
export type ValidatedResearchRelease = ResearchReleaseInput & { normalizedSha256: string };

export interface ResearchSource {
  market: Market;
  refresh(): Promise<ResearchReleaseInput | ValidatedResearchRelease>;
}

export function validateResearchRelease(input: unknown): ValidatedResearchRelease {
  const candidate = input && typeof input === "object" && "normalizedSha256" in input
    ? Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([key]) => key !== "normalizedSha256"))
    : input;
  const release = researchReleaseInputSchema.parse(candidate);
  return { ...release, normalizedSha256: sha256(JSON.stringify(release)) };
}

export function parseValidatedResearchRelease(input: unknown): ValidatedResearchRelease {
  const parsed = z.object({
    ...researchReleaseInputSchema.shape,
    normalizedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().parse(input);
  const validated = validateResearchRelease(parsed);
  if (validated.normalizedSha256 !== parsed.normalizedSha256) throw new Error("normalized-checksum-mismatch");
  return parsed as ValidatedResearchRelease;
}

export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function fetchOfficialSource(url: string, options: {
  allowedHostname: string;
  accept?: string;
  maximumBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ bytes: Uint8Array; finalUrl: string; sha256: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maximumBytes = options.maximumBytes ?? MAX_SOURCE_BYTES;
  const timeoutMs = options.timeoutMs ?? SOURCE_TIMEOUT_MS;
  let currentUrl = validateSourceUrl(url, options.allowedHostname);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirectCount = 0; redirectCount <= 1; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": RESEARCH_USER_AGENT, accept: options.accept ?? "application/octet-stream" },
      });
      if (response.status >= 300 && response.status < 400) {
        if (redirectCount === 1) throw new Error("too-many-source-redirects");
        const location = response.headers.get("location");
        if (!location) throw new Error("invalid-source-redirect");
        currentUrl = validateSourceUrl(new URL(location, currentUrl).toString(), options.allowedHostname);
        continue;
      }
      if (!response.ok) throw new Error(`source-http-${response.status}`);
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error("source-response-too-large");
      const bytes = await readBounded(response, maximumBytes);
      return { bytes, finalUrl: validateSourceUrl(response.url || currentUrl, options.allowedHostname), sha256: sha256(bytes) };
    }
    throw new Error("too-many-source-redirects");
  } finally {
    clearTimeout(timeout);
  }
}

function validateSourceUrl(value: string, allowedHostname: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hostname !== allowedHostname) throw new Error("source-host-not-allowed");
  return parsed.toString();
}

async function readBounded(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) { await reader.cancel(); throw new Error("source-response-too-large"); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
