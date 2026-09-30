import { useEffect, useId, useRef, useState } from "react";
import type { Application } from "../../domain/application";
import type { Currency } from "../../domain/research";
import { webSalaryEvidenceSchema, type WebSalaryEvidence, type WebSalaryQuery, type ResearchSearchResult } from "../../domain/webSalary";
import { webSalaryClient } from "./webSalaryClient";
import { webSalaryRepository } from "./webSalaryRepository";
import { blendWebSalary, suggestWebRange } from "./webSalary";
import { isWebMode } from "../../app/runtimeMode";

export function WebSalaryPanel({ application, initialSearch, embedded = false }: { application: Application; initialSearch?: ResearchSearchResult; embedded?: boolean }) {
  const heading = useId(), appliedRequest = useRef("");
  const [query, setQuery] = useState<WebSalaryQuery>({ company: application.company, role: application.role, location: [application.location.city, application.location.state, application.location.country].filter(Boolean).join(", ") });
  const [evidence, setEvidence] = useState<WebSalaryEvidence[]>([]);
  const [currency, setCurrency] = useState<Currency>(application.market === "HK" ? "HKD" : application.market === "US" ? "USD" : "SGD");
  const [basis, setBasis] = useState<"base" | "total">("base");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState<WebSalaryQuery>(query);
  useEffect(() => {
    let active = true;
    webSalaryRepository.get(application.id).then(saved => {
      if (!active) return;
      if (saved) { setEvidence(saved.evidence); setCurrency(saved.currency); setBasis(saved.basis); setQuery(saved.query); setSearchQuery(saved.query); setMessage("Saved locally. Review source dates before relying on this estimate."); }
      setLoaded(true);
    }).catch(() => { if (active) { setLoaded(true); setError("Saved web research could not be loaded. Retry before replacing it."); } });
    return () => { active = false; };
  }, [application.id]);
  useEffect(() => {
    if (!loaded || !initialSearch || appliedRequest.current === initialSearch.requestId) return;
    appliedRequest.current = initialSearch.requestId;
    setQuery(initialSearch.query); setError("");
    if (initialSearch.result.results.length) {
      setSearchQuery(initialSearch.query);
      setEvidence(initialSearch.result.results.map(item => ({ ...item, minimum: 0, maximum: 0, currency, period: "annual", basis: "base", match: "market-role", confirmed: false, ...suggestWebRange(item.excerpt) })));
      setMessage("Search complete. Detected figures are shown below; saved research stays unchanged until you confirm it.");
    } else setMessage("Not found in this search. Your saved salary research is unchanged.");
  }, [loaded, initialSearch, currency]);
  async function search() {
    if (isWebMode || busy || embedded || !loaded) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await webSalaryClient.search(query);
      setSearchQuery({ ...query });
      setEvidence(result.results.map(item => ({ ...item, minimum: 0, maximum: 0, currency, period: "annual", basis: "base", match: "market-role", confirmed: false, ...suggestWebRange(item.excerpt) })));
      setMessage(result.results.length ? "Search complete. Detected figures are shown below; saved research stays unchanged until you confirm it." : "No sources found. Try a broader role title or location. Your saved research is unchanged.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed."); }
    finally { setBusy(false); }
  }
  function change(index: number, update: Partial<WebSalaryEvidence>) {
    setMessage(""); setEvidence(items => items.map((item, i) => i === index ? { ...item, ...update, confirmed: "confirmed" in update ? update.confirmed! : false } : item));
  }
  const blend = blendWebSalary(evidence, currency, basis);
  const detected = evidence.filter(item => item.minimum > 0 && item.maximum >= item.minimum);
  const format = (value: number) => new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  async function save() {
    if (!blend) return;
    setBusy(true); setError("");
    try { await webSalaryRepository.save({ id: application.id, query: searchQuery, evidence: blend.included, currency, basis, savedAt: new Date().toISOString() }); setMessage("Saved locally. This range now appears in your Application Hub."); }
    catch { setError("Could not save research. Your previous saved estimate is unchanged."); }
    finally { setBusy(false); }
  }
  return <section className="web-salary" aria-labelledby={heading}>
    <header><h3 id={heading}>Find a salary range on the web</h3><p>{isWebMode ? "Live search is not available in this web build yet. You can still review and save your existing salary evidence." : "Tavily searches using only company, role and location. Your email and resume stay local."}</p></header>
    {!embedded && <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <fieldset disabled={busy || !loaded} className="web-salary__query"><legend className="sr-only">Public salary search</legend>
        {(["company", "role", "location"] as const).map(field => <label key={field}>{field[0].toUpperCase() + field.slice(1)}<input required minLength={2} maxLength={160} value={query[field]} onChange={event => setQuery({ ...query, [field]: event.target.value })} /></label>)}
        <button className="button button--primary" type="submit" disabled={isWebMode}>{busy ? "Working…" : "Search web salaries"}</button>
      </fieldset>
    </form>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {evidence.length > 0 && <>
      {!blend && (detected.length ? <section aria-label="Detected salary figures" className="web-salary__estimate">
        <strong>Detected pay figures · not yet verified</strong>
        <p>Limited evidence. These are separate source ranges, not a blended estimate for your role. Check location, seniority and base versus total pay before saving.</p>
        <ul>{detected.map((item, index) => <li key={`${index}:${item.url}`}><strong>{item.currency} {item.minimum.toLocaleString("en")}–{item.maximum.toLocaleString("en")} / {item.period === "monthly" ? "month" : "year"}</strong> · <a href={item.url} target="_blank" rel="noopener noreferrer">{new URL(item.url).hostname}</a></li>)}</ul>
      </section> : <p className="web-salary__notice">No usable salary figures were found in these search excerpts. Job listings without pay are not salary evidence. No estimate was generated; your saved research is unchanged.</p>)}
      <p className="web-salary__notice">Choose independent sources for the same location and seniority. Skip syndicated copies. Page dates are not salary reference dates. No inflation adjustment is assumed.</p>
      {evidence.map((item, index) => <details className="web-salary__source" key={`${index}:${item.url}`}>
        <summary>{item.confirmed ? "✓ Reviewed · " : "Review source · "}{item.title || new URL(item.url).hostname}</summary>
        <a href={item.url} target="_blank" rel="noopener noreferrer">Open {new URL(item.url).hostname}</a>
        <p className="web-salary__excerpt">{item.excerpt}</p><small>Retrieved {item.retrievedAt.slice(0, 10)} · Page date: {item.pageDate ?? "not provided"}</small>
        <fieldset disabled={busy} className="web-salary__fields"><legend>Verify the source before including it</legend>
          <label>Minimum<input type="number" min={1} value={item.minimum || ""} onChange={e => change(index, { minimum: Number(e.target.value) })} /></label>
          <label>Maximum<input type="number" min={item.minimum || 1} value={item.maximum || ""} onChange={e => change(index, { maximum: Number(e.target.value) })} /></label>
          <label>Currency<select value={item.currency} onChange={e => change(index, { currency: e.target.value as Currency })}>{["SGD", "HKD", "USD"].map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Period<select value={item.period} onChange={e => change(index, { period: e.target.value as "annual" | "monthly" })}><option value="annual">Annual</option><option value="monthly">Monthly</option></select></label>
          <label>Compensation<select value={item.basis} onChange={e => change(index, { basis: e.target.value as "base" | "total" })}><option value="base">Base salary</option><option value="total">Total compensation</option></select></label>
          <label>Source fit<select value={item.match} onChange={e => change(index, { match: e.target.value as "company-role" | "market-role" })}><option value="market-role">Similar role / market proxy</option><option value="company-role">Same company, role level & location</option></select></label>
          <label>Source type<select value={item.sourceType ?? "unknown"} onChange={e => change(index, { sourceType: e.target.value as WebSalaryEvidence["sourceType"] })}><option value="unknown">Unknown / search excerpt only</option><option value="employer">Employer pay disclosure</option><option value="recruiter-guide">Recruiter salary guide</option><option value="self-reported">Self-reported salaries</option></select></label>
          <label>Salary reference year (if stated)<input type="number" min={1990} max={new Date().getFullYear()} value={item.referenceYear ?? ""} onChange={e => change(index, { referenceYear: e.target.value ? Number(e.target.value) : undefined })} /></label>
        </fieldset>
        <label className="web-salary__confirm"><input type="checkbox" disabled={busy || !webSalaryEvidenceSchema.safeParse(item).success} checked={item.confirmed} onChange={e => change(index, { confirmed: e.target.checked })} />I checked the source, pay basis and role/location fit; this is not a syndicated duplicate.</label>
      </details>)}
      <div className="web-salary__fields"><label>Estimate currency<select value={currency} onChange={e => { setCurrency(e.target.value as Currency); setMessage(""); }}>{["SGD", "HKD", "USD"].map(c => <option key={c}>{c}</option>)}</select></label><label>Estimate basis<select value={basis} onChange={e => { setBasis(e.target.value as "base" | "total"); setMessage(""); }}><option value="base">Base salary</option><option value="total">Total compensation</option></select></label></div>
      {blend ? <div className="web-salary__estimate"><strong>{format(blend.minimum)}–{format(blend.maximum)} / year</strong><p>{blend.count > 1 ? "Blended estimate" : "Reported range"} · {basis === "base" ? "Base salary" : "Total compensation"} · {blend.confidence} confidence</p><p>{blend.explanation}</p><small>Equal-weight mean of {blend.count} publisher range{blend.count === 1 ? "" : "s"}; monthly amounts ×12; endpoints rounded down to 5,000. {blend.excluded} sources excluded (unreviewed, duplicate publisher or incompatible pay). An evidence grade, not a probability or guaranteed offer.</small><button className="button button--primary" disabled={busy} onClick={() => void save()}>Save range to dashboard</button></div> : <p>Review at least one valid, comparable range to save an estimate. Base salary, total compensation and different currencies are never mixed.</p>}
    </>}
  </section>;
}
