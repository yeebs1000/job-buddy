import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { Application } from "../../domain/application";
import type { ResearchSearchResult } from "../../domain/webSalary";
import { webSalaryClient } from "../research/webSalaryClient";
import { isWebMode } from "../../app/runtimeMode";
import "../research/research.css";
const SalaryPanel = lazy(() => import("../research/WebSalaryPanel").then(m => ({ default: m.WebSalaryPanel })));
const RatingPanel = lazy(() => import("../research/CompanyRatingPanel").then(m => ({ default: m.CompanyRatingPanel })));

export function InlineResearchPanel({ application }: { application: Application }) {
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false);
  const [salary, setSalary] = useState<ResearchSearchResult>(), [rating, setRating] = useState<ResearchSearchResult>();
  const [errors, setErrors] = useState<string[]>([]);
  const pending = useRef<AbortController | null>(null);
  const id = useId();
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  async function refresh() {
    if (pending.current || isWebMode) return;
    const controller = new AbortController(); pending.current = controller;
    setExpanded(true); setBusy(true); setErrors([]);
    const query = { company: application.company, role: application.role, location: [application.location.city, application.location.state, application.location.country].filter(Boolean).join(", ") };
    try {
      for (const purpose of ["salary", "company-rating"] as const) {
        if (controller.signal.aborted) break;
        try {
          const result = await webSalaryClient.search({ ...query, purpose }, controller.signal);
          if (controller.signal.aborted) break;
          const value = { requestId: crypto.randomUUID(), query, result };
          if (purpose === "salary") setSalary(value); else setRating(value);
        } catch (cause) { if (!controller.signal.aborted) setErrors(items => [...new Set([...items, cause instanceof Error ? cause.message : "Research failed. Saved information is unchanged."])]); }
      }
    } finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <div className="inline-research">
    <div className="inline-research__actions"><button type="button" className="button button--secondary" disabled={busy || isWebMode} onClick={() => void refresh()}>{busy ? "Researching…" : "Refresh research"}</button><button type="button" className="button button--secondary" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(v => !v)}>{expanded ? "Hide research" : "Review sources"}</button></div>
    {isWebMode && <small>Live research needs the local companion. Saved sources remain available.</small>}
    {errors.map(error => <p role="alert" key={error}>{error}</p>)}
    {expanded && <div id={id} className="inline-research__evidence" aria-busy={busy}>
      <p>Search results are evidence to review, not verified estimates. Your saved figures stay visible above until you save changes.</p>
      <Suspense fallback={<p role="status">Opening research tools…</p>}><SalaryPanel application={application} initialSearch={salary} embedded /><RatingPanel application={application} initialSearch={rating} /></Suspense>
    </div>}
  </div>;
}
