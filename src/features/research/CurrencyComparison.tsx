import { useEffect, useState } from "react";
import type { Currency } from "../../domain/research";
import { validFxDate, type FxQuote } from "../../domain/fx";
import { discoveryClient } from "../discovery/discoveryClient";
import { roundSalaryDown } from "./roundSalary";

export function CurrencyComparison({ currency, minimum, maximum, period }: {
  currency: Currency; minimum: number; maximum: number; period: "annual" | "monthly" | "hourly" | "unspecified";
}) {
  const [target, setTarget] = useState<Currency>(currency);
  const [quote, setQuote] = useState<FxQuote>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setQuote(undefined); setError("");
    if (target === currency) { setBusy(false); return; }
    setBusy(true);
    discoveryClient.fx(currency, target).then((value) => {
      if (!active) return;
      if (value.base !== currency || value.quote !== target || !validFxDate(value.date, Date.now())) throw new Error();
      setQuote(value);
    }).catch(() => { if (active) setError("Currency comparison unavailable. The original salary is unchanged."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [currency, target]);
  function rounded(value: number) {
    return (period === "annual" || period === "monthly" ? roundSalaryDown(value, target, period) : Math.floor(value * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return <div className="currency-comparison">
    <label>Compare currency<select value={target} onChange={(event) => setTarget(event.target.value as Currency)}>{(["SGD", "HKD", "USD"] as const).map((code) => <option key={code}>{code}</option>)}</select></label>
    {busy && <p role="status">Getting reference exchange rate…</p>}
    {error && <p role="status">{error}</p>}
    {quote && quote.base === currency && quote.quote === target && target !== currency && <div aria-label="Converted salary">
      <strong>≈ {target} {rounded(minimum * quote.rate)}–{rounded(maximum * quote.rate)} · {period === "unspecified" ? "pay period not specified" : period}</strong>
      <p className="research-help">1 {currency} = {quote.rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} {target} · {quote.date} · <a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">ECB reference rate</a> via Frankfurter. Rounded down; excludes fees, taxes and cost-of-living differences.</p>
    </div>}
  </div>;
}
