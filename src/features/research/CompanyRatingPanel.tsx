import { useId, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Application } from "../../domain/application";
import type { ResearchSearchResult, WebSalaryResponse } from "../../domain/webSalary";
import { companyRatingEvidenceSchema, type CompanyRatingEvidence } from "../../domain/companyRating";
import { suggestCompanyRating } from "./companyRating";
import { companyRatingRepository } from "./companyRatingRepository";

function RatingSource({ source, application, company, saved }: { source: WebSalaryResponse["results"][number]; application: Application; company: string; saved?: CompanyRatingEvidence }) {
  const suggestion = suggestCompanyRating(source, company);
  const [score, setScore] = useState((saved?.score ?? suggestion?.score)?.toString() ?? "");
  const [outOf, setOutOf] = useState((saved?.outOf ?? suggestion?.outOf)?.toString() ?? "5");
  const [provider, setProvider] = useState(saved?.provider ?? new URL(source.url).hostname.replace(/^www\./, ""));
  const [count, setCount] = useState(saved?.reviewCount?.toString() ?? "");
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const evidence = { ...source, id: application.id, company, provider, score: score === "" ? NaN : Number(score), outOf: Number(outOf), ...(count ? { reviewCount: Number(count) } : {}), savedAt: new Date().toISOString(), confirmed: true as const };
  async function save() {
    if (!reviewed || busy || !companyRatingEvidenceSchema.safeParse(evidence).success) return;
    setBusy(true); setError("");
    try { await companyRatingRepository.save(evidence); setMessage("Company rating saved to the dashboard."); }
    catch { setError("The rating could not be saved. Your previous rating is unchanged."); }
    finally { setBusy(false); }
  }
  return <details className="web-salary__source" open={Boolean(saved || suggestion)}><summary>{saved ? "Saved rating · " : ""}{source.title || provider}</summary>
    <p>{source.excerpt}</p><a href={source.url} target="_blank" rel="noopener noreferrer">Original source</a><p>Retrieved {source.retrievedAt.slice(0, 10)} · Employer: {company}</p>
    <fieldset disabled={busy} className="web-salary__fields" onChange={() => { setReviewed(false); setMessage(""); }}><legend>Employee rating evidence</legend>
      <label>Rating provider<input value={provider} onChange={e => setProvider(e.target.value)} maxLength={160} /></label>
      <label>Rating score<input type="number" min={0} max={Number(outOf)} step="0.1" value={score} onChange={e => setScore(e.target.value)} /></label>
      <label>Rating scale<input type="number" min={1} max={10} value={outOf} onChange={e => setOutOf(e.target.value)} /></label>
      <label>Review count (if stated)<input type="number" min={1} value={count} onChange={e => setCount(e.target.value)} /></label>
    </fieldset>
    <label className="web-salary__confirm"><input type="checkbox" disabled={busy} checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I checked that this is an employee rating for {company}, with the stated provider and scale.</label>
    <button type="button" className="button button--secondary" disabled={busy || !reviewed || !companyRatingEvidenceSchema.safeParse(evidence).success} onClick={() => void save()}>Save company rating</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
export function CompanyRatingPanel({ application, initialSearch }: { application: Application; initialSearch?: ResearchSearchResult }) {
  const heading = useId();
  const stored = useLiveQuery(async () => {
    try { return { rating: await companyRatingRepository.get(application.id) }; }
    catch { return { failed: true }; }
  }, [application.id]);
  const saved = stored?.rating;
  return <section aria-labelledby={heading} className="company-rating-panel"><h3 id={heading}>Company employee rating</h3>
    <p>Source-specific employee reviews, not customer ratings. Review the evidence before saving; providers are never blended.</p>
    {stored?.failed && <p role="alert">Saved rating evidence could not be loaded. Retry before replacing it.</p>}
    {saved && <RatingSource key={`saved:${saved.savedAt}`} source={saved} saved={saved} application={application} company={saved.company} />}
    {!initialSearch ? !saved && <p>Refresh research to look for employee ratings.</p> : !initialSearch.result.results.length ? <p>Not found in this search. Any previously saved rating remains unchanged.</p> : initialSearch.result.results.filter(source => source.url !== saved?.url).map(source => <RatingSource key={`${initialSearch.requestId}:${source.url}`} source={source} application={application} company={initialSearch.query.company} />)}
  </section>;
}
