import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { applicationRepository } from "../../db/applicationRepository";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { updateRepository } from "./updateRepository";
import { UpdateProposalRow } from "./UpdateProposalRow";
import "./updates.css";

export function UpdateInboxPage() {
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState("");
  const data = useLiveQuery(async () => {
    try {
      const [proposals, applications] = await Promise.all([updateRepository.list(), applicationRepository.list()]);
      return { proposals, applications, error: false };
    } catch { return { proposals: [], applications: [], error: true }; }
  }, [attempt]);
  const order = { pending: 0, deferred: 1, approved: 2, rejected: 3 };
  const proposals = data?.proposals.slice().sort((a, b) => order[a.status] - order[b.status] || b.source.receivedAt.localeCompare(a.source.receivedAt));

  return <div className="updates">
    <header className="updates__header"><h1>Updates</h1><p>Simulated mail · Fictional messages, no credentials or live Gmail access.</p><Link to="/">Open scan controls</Link></header>
    <p role="status" className="updates__feedback">{feedback}</p>
    {!data ? <section aria-label="Loading updates" aria-busy="true" className="updates__list">{[0, 1, 2].map((id) => <div className="updates__skeleton" data-testid="update-skeleton" key={id}><span /><span /><span /></div>)}</section>
      : data.error ? <section><p role="alert">Updates could not be loaded. Please try again.</p><Button onClick={() => setAttempt(attempt + 1)}>Retry loading updates</Button></section>
      : !proposals?.length ? <EmptyState title="No updates yet">Run a simulated scan from the command center to review message evidence here.</EmptyState>
      : <><p className="updates__summary">{proposals.filter((proposal) => proposal.status === "pending").length} pending · {proposals.filter((proposal) => proposal.status === "deferred").length} deferred</p><section className="updates__list" aria-label="Mail update proposals">{proposals.map((proposal) => <UpdateProposalRow key={proposal.id} proposal={proposal} applications={data.applications} onReviewed={setFeedback} />)}</section></>}
  </div>;
}
