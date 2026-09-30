import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { jobBuddyDb } from "../../db/database";
import { Button } from "../../components/Button";
import { removeMailOpportunity } from "../updates/mailReviewActions";

export function MailOpportunities() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const saved = useLiveQuery(() => jobBuddyDb.updateProposals.filter(proposal => !proposal.demoHidden && Boolean(proposal.opportunity) && proposal.classification.kind === "recruiter-outreach").toArray());
  async function remove(id: string) {
    setBusy(id); setError("");
    try { await removeMailOpportunity(id); }
    catch { setError("Could not remove this opportunity. Please try again."); }
    finally { setBusy(null); }
  }
  if (!saved?.length) return null;
  return <section id="opportunities" aria-labelledby="opportunities-heading" className="command-center__section">
    <h2 id="opportunities-heading">Opportunities — not applied</h2>
    <p>Saved recruiter outreach. These do not count as applications or change your progress.</p>
    {saved.map(proposal => <article key={proposal.id} className="command-center__opportunity">
      <h3>{proposal.opportunity!.title}</h3>
      <p>{proposal.opportunity!.company || "Employer not specified"}</p>
      {proposal.opportunity!.location && <p>{proposal.opportunity!.location}</p>}
      <p>Recruiter: {proposal.source.fromName || proposal.source.fromAddress}</p>
      <div className="command-center__actions"><Link to="/updates">Review email evidence</Link><Button variant="secondary" disabled={busy !== null} onClick={() => void remove(proposal.id)}>{busy === proposal.id ? "Removing…" : "Remove from Application Hub"}</Button></div>
    </article>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
