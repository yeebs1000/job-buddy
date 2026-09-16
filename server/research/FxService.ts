import type { Currency } from "../../src/domain/research";
import { currencySchema } from "../../src/domain/research";
import { fxQuoteSchema, validFxDate, type FxQuote } from "../../src/domain/fx";
import { fetchPublicJson } from "../publicData/fetchJson";
import { z } from "zod";

export class FxService {
  private cache = new Map<string, FxQuote>();
  constructor(private fetcher: typeof fetch = fetch, private now = Date.now) {}
  async quote(base: Currency, quote: Currency): Promise<FxQuote> {
    currencySchema.parse(base); currencySchema.parse(quote);
    const key = `${base}:${quote}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - Date.parse(cached.retrievedAt) < 3_600_000 && validFxDate(cached.date, this.now())) return cached;
    if (base === quote) throw new Error("Select another currency");
    const raw = await fetchPublicJson(`https://api.frankfurter.dev/v2/providers/ecb/rate/${base}/${quote}`, this.fetcher, 16_000);
    const row = z.object({ base: z.literal(base), quote: z.literal(quote), rate: z.number().positive(), date: z.string() }).parse(raw);
    const result = fxQuoteSchema.parse({ ...row, retrievedAt: new Date(this.now()).toISOString(), sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" });
    if (!validFxDate(result.date, this.now())) throw new Error("Exchange rate is out of date");
    this.cache.set(key, result);
    return result;
  }
}
