import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { boardKey, parseBoardUrl, type DiscoveryResult } from "../../domain/discovery";
import { discoveryClient } from "./discoveryClient";
import { shortlistRepository } from "./shortlistRepository";
import { PostingSalary } from "./PostingSalary";
import { jobBuddyDb } from "../../db/database";
import "./discovery.css";

export function DiscoveryPage() {
  const [boardUrl, setBoardUrl] = useState("");
  const [result, setResult] = useState<DiscoveryResult>();
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const saved = useLiveQuery(() => shortlistRepository.list().catch(() => { setError("Saved jobs could not be loaded. Your stored shortlist has not been replaced."); return []; }), []);
  useEffect(() => { void jobBuddyDb.metadata.get("discovery-board:v1").then((row) => { if (row) setBoardUrl(row.value); }).catch(() => setError("Could not restore the last company link. You can enter it again.")); }, []);
  async function search(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true); setResult(undefined); setSavedOnly(false);
    try {
      const board = parseBoardUrl(boardUrl);
      const next = await discoveryClient.list(board);
      setResult(next);
      await jobBuddyDb.metadata.put({ key: "discovery-board:v1", value: boardUrl });
    } catch { setError("Could not load this board. Use a Greenhouse or Lever careers URL, and check that the companion is running."); }
    finally { setBusy(false); }
  }
  const jobs = (savedOnly ? saved ?? [] : result?.jobs ?? []).filter((job) => (!market || (market === "unknown" ? !job.market : job.market === market)) && `${job.title} ${job.location}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="discovery-page">
    <header><h1>Discover jobs</h1><p>Explore a company’s open roles. Save the ones worth applying to.</p></header>
    <form className="discovery-search" onSubmit={(event) => void search(event)}>
      <label>Company careers link<input required type="url" value={boardUrl} onChange={(event) => setBoardUrl(event.target.value)} placeholder="https://job-boards.greenhouse.io/company" /></label>
      <button className="button button--primary" disabled={busy}>{busy ? "Loading jobs…" : "Find open roles"}</button>
    </form>
    <p className="research-help">Supports public Greenhouse and Lever boards, including Lever EU. This searches a company board, not every job on the internet. Listings and availability can change.</p>
    <div className="discovery-toolbar">
      <label>Search roles or location<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Software engineer, graduate, Singapore…" /></label>
      <label>Market<select value={market} onChange={(event) => setMarket(event.target.value)}><option value="">All locations</option><option value="SG">Singapore</option><option value="HK">Hong Kong</option><option value="US">United States</option><option value="unknown">Other / unspecified</option></select></label>
      <button type="button" className="button button--secondary" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>{savedOnly ? "Show search results" : `Saved jobs (${saved?.length ?? 0})`}</button>
    </div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {busy && <p role="status">Loading current postings from the employer’s board…</p>}
    <p className="research-help">Saved jobs are a shortlist. They do not count as applications. After applying, use Browser Buddy or Add application in your tracker.</p>
    {result && !savedOnly && <p>{jobs.length} matching roles · Retrieved {new Date(result.retrievedAt).toLocaleString()}{result.truncated ? " · First 1,000 postings only" : ""}</p>}
    {!busy && !jobs.length && <div className="discovery-empty"><h2>{savedOnly ? "Your next opportunity can start here" : result ? "No roles match these filters" : "Start with a company you’re interested in"}</h2><p>{savedOnly ? "Save interesting roles from the results. Your shortlist stays on this device." : "Paste its Greenhouse or Lever careers link above. You can narrow the results by role or location."}</p></div>}
    <ul className="discovery-list">{jobs.slice(0, 100).map((job) => {
      const isSaved = saved?.some((item) => item.id === job.id);
      return <li key={job.id}>
        <div className="discovery-job-heading"><div><h2><a href={job.url} target="_blank" rel="noopener noreferrer">{job.title}</a></h2><p>{job.location} · {job.board.token} · {job.board.provider}</p></div>
          <button type="button" className="button button--secondary" onClick={() => void (isSaved ? shortlistRepository.remove(job.id) : shortlistRepository.save(job)).then(() => setMessage(isSaved ? "Removed from saved jobs." : "Saved to your shortlist."), () => setError("Could not update your shortlist. Try again."))}>{isSaved ? "Remove saved job" : "Save job"}</button>
        </div>
        <details><summary>Posted salary & currency comparison</summary><PostingSalary key={`${boardKey(job.board)}:${job.id}`} job={job} /></details>
        {savedOnly && <p className="research-help">Last retrieved {new Date(job.retrievedAt).toLocaleDateString()}. Open the employer’s link to confirm the role is still open.</p>}
      </li>;
    })}</ul>
    {jobs.length > 100 && <p>Showing the first 100 matches. Narrow the search to see a smaller set.</p>}
  </div>;
}
