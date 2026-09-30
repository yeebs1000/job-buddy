import { useState } from "react";
import type { Application } from "../../domain/application";
import { parseBoardUrl, type DiscoveryResult } from "../../domain/discovery";
import { discoveryClient } from "../discovery/discoveryClient";
import { PostingSalary } from "../discovery/PostingSalary";
import "../discovery/discovery.css";

export function CompanyResearchPanel({ application }: { application: Application }) {
  const [url, setUrl] = useState(application.jobUrl ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DiscoveryResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(event: React.FormEvent) {
    event.preventDefault(); if (!confirmed) return;
    setBusy(true); setError(""); setResult(undefined);
    try { setResult(await discoveryClient.list(parseBoardUrl(url))); }
    catch { setError("Company postings could not be loaded. Check the Greenhouse or Lever board link and try again."); }
    finally { setBusy(false); }
  }
  const jobs = result?.jobs.filter((job) => `${job.title} ${job.location}`.toLowerCase().includes(query.toLowerCase().trim())) ?? [];
  return <section className="company-research" aria-label="Company salary research">
    <h3>What {application.company} publishes</h3>
    <p className="research-help">Compare actual openings at this company. These advertised ranges are separate from the regional benchmark and do not predict your offer.</p>
    <form onSubmit={(event) => void load(event)}>
      <label>Company Greenhouse or Lever link<input type="url" required disabled={busy} value={url} onChange={(event) => { setUrl(event.target.value); setConfirmed(false); setResult(undefined); }} /></label>
      <label className="research-check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> This board belongs to {application.company}</label>
      <button type="submit" disabled={!confirmed || busy}>{busy ? "Loading company postings…" : "Find company salary evidence"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <>
      <label>Filter company roles or locations<input type="search" value={query} placeholder={application.role} onChange={(event) => setQuery(event.target.value)} /></label>
      <p className="research-help">{jobs.length} matching postings · Retrieved {new Date(result.retrievedAt).toLocaleString()}{result.truncated ? " · First 1,000 postings only" : ""}. Match role, seniority and location before comparing.</p>
      {jobs.length === 0 && <p>No matching company postings. Try a broader role or location.</p>}
      {jobs.slice(0, 20).map((job) => <details key={job.id}><summary>{job.title} · {job.location}</summary><p className="research-help">Source board: {job.board.token} · {job.board.provider}</p><a href={job.url} target="_blank" rel="noopener noreferrer">Open employer posting</a><PostingSalary job={job} /></details>)}
      {jobs.length > 20 && <p>Showing 20 roles. Use the filter to narrow the list.</p>}
    </>}
  </section>;
}
