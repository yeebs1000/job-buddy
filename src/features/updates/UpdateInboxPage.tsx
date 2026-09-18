import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { applicationRepository } from "../../db/applicationRepository";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { updateRepository } from "./updateRepository";
import { UpdateProposalRow } from "./UpdateProposalRow";
import { proposalFilterReason } from "./proposalRelevance";
import type { UpdateProposal } from "../../domain/updateProposal";
import "./updates.css";

function FilteredProposal({ proposal, onRestored }: { proposal: UpdateProposal; onRestored: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function restore() {
    setBusy(true); setError("");
    try { await updateRepository.restoreForManualReview(proposal.id); onRestored("Restored for manual review. Choose the correct stage or outcome before approving."); }
    catch { setError("Could not restore this item. Please try again."); }
    finally { setBusy(false); }
  }
  return <article className="updates__filtered-item">
    <h2>{proposal.source.subject}</h2>
    <p>{proposal.source.fromAddress}</p>
    <p><strong>Filtered:</strong> {proposalFilterReason(proposal)}</p>
    <details><summary>Show saved evidence</summary><blockquote>{proposal.source.excerpt}</blockquote></details>
    <Button variant="secondary" disabled={busy} onClick={() => void restore()}>{busy ? "Restoring…" : "Restore for manual review"}</Button>
    {error && <p role="alert">{error}</p>}
  </article>;
}

export function UpdateInboxPage() {
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showFiltered, setShowFiltered] = useState(false);
  const data = useLiveQuery(async () => {
    try {
      const [proposals, applications] = await Promise.all([updateRepository.list(), applicationRepository.list()]);
      return { proposals, applications, error: false };
    } catch { return { proposals: [], applications: [], error: true }; }
  }, [attempt]);
  const order = { pending: 0, deferred: 1, approved: 2, rejected: 3 };
  const filtered = data?.proposals.filter(proposal => proposalFilterReason(proposal)) ?? [];
  const proposals = data?.proposals.filter(proposal => !proposalFilterReason(proposal)).sort((a, b) => order[a.status] - order[b.status] || b.source.receivedAt.localeCompare(a.source.receivedAt));

  return <div className="updates">
    <header className="updates__header"><h1>Updates</h1><p>Review recruiter evidence before it changes your application tracker.</p><Link to="/">Open scan controls</Link></header>
    <p role="status" className="updates__feedback">{feedback}</p>
    {filtered.length > 0 && <div className="updates__filter-controls"><p>{filtered.length} saved item{filtered.length === 1 ? "" : "s"} filtered as unrelated or outdated. Nothing was deleted.</p><Button variant="secondary" aria-expanded={showFiltered} aria-controls="filtered-updates" onClick={() => setShowFiltered(!showFiltered)}>{showFiltered ? "Hide" : "Show"} filtered ({filtered.length})</Button></div>}
    {!data ? <section aria-label="Loading updates" aria-busy="true" className="updates__list">{[0, 1, 2].map((id) => <div className="updates__skeleton" data-testid="update-skeleton" key={id}><span /><span /><span /></div>)}</section>
      : data.error ? <section><p role="alert">Updates could not be loaded. Please try again.</p><Button onClick={() => setAttempt(attempt + 1)}>Retry loading updates</Button></section>
      : !proposals?.length ? <EmptyState title={filtered.length ? "No recruiting updates to review" : "No updates yet"}>{filtered.length ? "Saved items that did not pass the current relevance checks are available under Show filtered." : "Run a Gmail or demo scan from the command center to review message evidence here."}</EmptyState>
      : <><p className="updates__summary">{proposals.filter((proposal) => proposal.status === "pending").length} pending · {proposals.filter((proposal) => proposal.status === "deferred").length} deferred</p><section className="updates__list" aria-label="Mail update proposals">{proposals.map((proposal) => <UpdateProposalRow key={proposal.id} proposal={proposal} applications={data.applications} onReviewed={setFeedback} />)}</section></>}
    {showFiltered && filtered.length > 0 && <section id="filtered-updates" aria-label="Filtered saved updates" className="updates__list">{filtered.map(proposal => <FilteredProposal key={proposal.id} proposal={proposal} onRestored={setFeedback} />)}</section>}
  </div>;
}
