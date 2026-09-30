import { z } from "zod";
import { boardKey, boardSchema, discoveredJobSchema, inferPostingMarket, postingPaySchema, type DiscoveryResult, type JobBoard, type PostingPay } from "../../src/domain/discovery";
import { fetchPublicJson } from "../publicData/fetchJson";

const ghJob = z.object({ id: z.number().int().positive(), title: z.string(), location: z.object({ name: z.string() }), absolute_url: z.string(), pay_input_ranges: z.array(z.unknown()).optional() });
const leverJob = z.object({ id: z.string().regex(/^[a-zA-Z0-9-]+$/), text: z.string(), categories: z.object({ location: z.string().optional() }).optional(), country: z.string().nullable().optional(), hostedUrl: z.string(), salaryRange: z.unknown().optional() });

export class DiscoveryService {
  private cache = new Map<string, { at: number; data: DiscoveryResult }>();
  private pending = new Map<string, Promise<DiscoveryResult>>();
  constructor(private fetcher: typeof fetch = fetch, private now = Date.now) {}

  list(input: JobBoard): Promise<DiscoveryResult> {
    const board = boardSchema.parse(input);
    const key = boardKey(board);
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < 5 * 60_000) return Promise.resolve(cached.data);
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 3) return Promise.reject(new Error("Too many board requests"));
    const result = this.load(board).then((data) => {
      if (this.cache.size >= 20) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { at: this.now(), data });
      return data;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, result);
    return result;
  }

  private async load(board: JobBoard): Promise<DiscoveryResult> {
    const retrievedAt = new Date(this.now()).toISOString();
    const base = board.provider === "greenhouse"
      ? `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs`
      : `https://${board.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${board.token}`;
    const payload = await fetchPublicJson(board.provider === "lever" ? `${base}?mode=json&limit=1000` : base, this.fetcher);
    const rawJobs = board.provider === "greenhouse" ? z.object({ jobs: z.array(z.unknown()) }).parse(payload).jobs : z.array(z.unknown()).parse(payload);
    const jobs = rawJobs.slice(0, 1000).map((raw) => {
      if (board.provider === "greenhouse") {
        const job = ghJob.parse(raw);
        return discoveredJobSchema.parse({ id: `${boardKey(board)}:${job.id}`, board, title: job.title, location: job.location.name, market: inferPostingMarket(job.location.name), url: job.absolute_url, salary: [], retrievedAt });
      }
      const job = leverJob.parse(raw);
      const location = job.categories?.location ?? "Location not specified";
      return discoveredJobSchema.parse({ id: `${boardKey(board)}:${job.id}`, board, title: job.text, location, market: inferPostingMarket(location, job.country ?? undefined), url: job.hostedUrl, salary: leverPay(job.salaryRange), retrievedAt });
    });
    return { jobs, truncated: rawJobs.length >= 1000, retrievedAt };
  }

  async salary(input: { board: JobBoard; postingId: string }): Promise<PostingPay[]> {
    const board = boardSchema.parse(input.board);
    const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/).parse(input.postingId);
    if (board.provider === "lever") {
      return (await this.list(board)).jobs.find((job) => job.id === `${boardKey(board)}:${id}`)?.salary ?? [];
    }
    if (!/^\d+$/.test(id)) throw new Error("invalid-posting-id");
    const job = ghJob.parse(await fetchPublicJson(`https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs/${id}?pay_transparency=true`, this.fetcher));
    return (job.pay_input_ranges ?? []).flatMap((raw) => {
      const row = z.object({ min_cents: z.number(), max_cents: z.number(), currency_type: z.string(), title: z.string(), blurb: z.string().optional() }).safeParse(raw);
      if (!row.success) return [];
      const text = `${row.data.title} ${row.data.blurb ?? ""}`;
      // Greenhouse does not specify a period in its structured pay range; never assume annual.
      const period = /\b(hour|hourly|per hour)\b/i.test(text) ? "hourly" : /\b(month|monthly)\b/i.test(text) ? "monthly" : /\b(annual|annually|year|yearly|per annum)\b/i.test(text) ? "annual" : "unspecified";
      const pay = postingPaySchema.safeParse({ currency: row.data.currency_type, minimum: row.data.min_cents / 100, maximum: row.data.max_cents / 100, period, label: row.data.title.slice(0, 300) });
      return pay.success ? [pay.data] : [];
    }).slice(0, 30);
  }
}

function leverPay(raw: unknown): PostingPay[] {
  const row = z.object({ currency: z.string(), interval: z.string(), min: z.number(), max: z.number() }).safeParse(raw);
  if (!row.success) return [];
  const intervals: Record<string, PostingPay["period"]> = { "per-year-salary": "annual", "per-month-salary": "monthly", "per-hour-wage": "hourly", yearly: "annual", monthly: "monthly", hourly: "hourly" };
  const period = intervals[row.data.interval] ?? "unspecified";
  const pay = postingPaySchema.safeParse({ currency: row.data.currency.toUpperCase(), minimum: row.data.min, maximum: row.data.max, period, label: "Employer-posted range" });
  return pay.success ? [pay.data] : [];
}
