import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { StageRail } from "../../components/StageRail";
import type { PersistedApplication } from "../../db/applicationRepository";
import type { Deadline } from "../../domain/application";
import { applicationStages, type ApplicationOutcome, type ApplicationStage } from "../../domain/stage";
import type { UpdateProposal } from "../../domain/updateProposal";
import { proposalConflicts, updateRepository } from "./updateRepository";

const stageLabels = { applied: "Applied", review: "Review", assessment: "Assessment", interview: "Interview", final: "Final", offer: "Offer" };
const outcomeLabels: Record<ApplicationOutcome, string> = { rejected: "Rejected", withdrawn: "Withdrawn", expired: "Expired", offer_declined: "Offer declined", offer_accepted: "Offer accepted", hired: "Hired" };
const humanize = (value: string) => value.replaceAll("-", " ");
function validLink(link: string) {
  try { const url = new URL(link); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
function timeLabel(value: string) {
  if (!Number.isFinite(Date.parse(value))) return "Time unavailable";
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))} SGT / HKT (UTC+08:00)`;
}
function validDeadlineTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const date = value.slice(0, 10);
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

export function UpdateProposalRow({ proposal, applications, onReviewed }: {
  proposal: UpdateProposal; applications: PersistedApplication[]; onReviewed: (message: string) => void;
}) {
  const id = useId();
  const approveButton = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [applicationId, setApplicationId] = useState(proposal.match.applicationId ?? "");
  const [stage, setStage] = useState<ApplicationStage | "">(proposal.classification.proposedStage ?? "");
  const [outcome, setOutcome] = useState<ApplicationOutcome | "">(proposal.classification.proposedOutcome ?? "");
  const [deadlines, setDeadlines] = useState<Deadline[]>(proposal.classification.deadlines);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const reviewed = proposal.status === "approved" || proposal.status === "rejected";
  const application = applications.find((item) => item.id === (reviewed ? proposal.match.applicationId : applicationId));
  const manuallySelectedApplication = !reviewed && Boolean(applicationId) && applicationId !== proposal.match.applicationId;
  const closed = Boolean(application?.outcome);
  const displayedStage = reviewed ? proposal.classification.proposedStage : stage;
  const displayedOutcome = reviewed ? proposal.classification.proposedOutcome : outcome;
  const links = proposal.classification.links.filter(validLink);
  const currentConflicts = application && !reviewed ? proposalConflicts(application, {
    source: proposal.source,
    classification: { ...proposal.classification, proposedStage: stage || undefined, proposedOutcome: outcome || undefined },
  } as Pick<UpdateProposal, "classification" | "source">) : [];
  const requiresConfirmation = Boolean(outcome || stage === "offer" || currentConflicts.length);

  useEffect(() => { if (result) resultRef.current?.focus(); }, [result]);

  function editDeadline(index: number, patch: Partial<Deadline>) {
    setDeadlines(deadlines.map((deadline, position) => position === index ? { ...deadline, ...patch } : deadline));
    setConfirming(false);
  }
  function cancelConfirmation() { setConfirming(false); approveButton.current?.focus(); }
  async function review(action: "approve" | "reject" | "defer", confirmed = false) {
    setError("");
    if (action === "approve") {
      if (deadlines.some((deadline) => !deadline.label.trim() || !validDeadlineTime(deadline.at))) {
        setError("Enter a deadline label and valid ISO date and time with a timezone, such as 2026-09-20T14:00:00+08:00."); return;
      }
      if (!stage && !outcome && !deadlines.length) { setError("Choose a stage, outcome or deadline before approving."); return; }
      if (requiresConfirmation && !confirmed) { setConfirming(true); return; }
    }
    setBusy(true);
    try {
      if (action === "approve") {
        await updateRepository.approveProposal(proposal.id, { applicationId, expectedApplicationUpdatedAt: application?.updatedAt, proposedStage: stage || undefined, proposedOutcome: outcome || undefined,
          deadlines: deadlines.map((deadline) => ({ ...deadline, label: deadline.label.trim(), at: new Date(deadline.at).toISOString() })) });
        setResult("Review result: Update applied."); onReviewed("Update applied.");
      } else if (action === "reject") { await updateRepository.rejectProposal(proposal.id); setResult("Review result: Update rejected."); onReviewed("Update rejected."); }
      else { await updateRepository.deferProposal(proposal.id); setResult("Review result: Update deferred. You can review it later."); onReviewed("Update deferred. You can review it later."); }
      setConfirming(false);
    } catch (cause) { setError(cause instanceof Error && cause.message.includes("changed while you were reviewing") ? "This application changed while you were reviewing it. Review the current state and confirm again." : "This update could not be saved. Check the selected application and try again."); }
    finally { setBusy(false); }
  }

  return <article className="update-row" aria-labelledby={`${id}-subject`}>
    <div className="update-row__evidence">
      <p className="update-row__step">1 · Source evidence</p>
      <h2 id={`${id}-subject`}>{proposal.source.subject}</h2>
      <p><strong>{application ? `${application.company} · ${application.role}` : "Unmatched application"}</strong></p>
      {proposal.source.fromName && <p>{proposal.source.fromName}</p>}
      <p>{proposal.source.fromAddress}</p>
      <time dateTime={proposal.source.receivedAt}>{timeLabel(proposal.source.receivedAt)}</time>
      <blockquote>{proposal.source.excerpt.slice(0, 500)}{proposal.source.excerpt.length > 500 ? "…" : ""}</blockquote>
      {links.length > 0 && <ul aria-label="Validated HTTPS links">{links.map((link) => <li key={link}><a href={link} target="_blank" rel="noopener noreferrer">{link}</a></li>)}</ul>}
    </div>
    <div className="update-row__basis">
      <p className="update-row__step">2 · Match &amp; interpretation</p>
      <p>{manuallySelectedApplication ? "Original match confidence" : "Match confidence"}: {Math.round(proposal.match.confidence * 100)}%</p>
      <p>{manuallySelectedApplication ? "Original inference" : "Because"}: {proposal.match.reasons.map(humanize).join(", ") || "no matching evidence was found"}.</p>
      <p>Classification confidence: {Math.round(proposal.classification.confidence * 100)}%</p>
      <ul aria-label="Classification reasons">{proposal.classification.reasons.map((reason) => <li key={reason}>{humanize(reason)}</li>)}</ul>
      {proposal.match.conflicts.length > 0 ? <p className="update-row__conflict">Scan-time conflicts: {proposal.match.conflicts.map(humanize).join(", ")}. Review carefully.</p> : <p>No scan-time matching conflicts recorded.</p>}
      {application && <p>Current application stage: {application.stage ? stageLabels[application.stage] : "Not set"}.</p>}
      {currentConflicts.length > 0 && <p className="update-row__conflict">Current application conflicts: {currentConflicts.map(humanize).join(", ")}. Confirm approval to apply this change.</p>}
      <p>Status: <strong>{humanize(proposal.status)}</strong></p>
      <StageRail compact stage={displayedStage || null} outcome={displayedOutcome || null} rejectedAtStage={displayedOutcome === "rejected" ? displayedStage || application?.stage || undefined : undefined} />
    </div>
    <div className="update-row__proposal">
      <p className="update-row__step">3 · Review proposal</p>
      {reviewed ? <><p>Proposed stage: {proposal.classification.proposedStage ? stageLabels[proposal.classification.proposedStage] : "No change"}</p><p>Proposed outcome: {proposal.classification.proposedOutcome ? outcomeLabels[proposal.classification.proposedOutcome] : "No change"}</p>
        {proposal.status === "approved" && proposal.classification.deadlines.map((deadline) => <p key={deadline.id}>Saved deadline: {deadline.label}<br /><time dateTime={deadline.at}>{timeLabel(deadline.at)}</time><br /><small>{deadline.at}</small></p>)}
        {proposal.status === "rejected" && proposal.classification.deadlines.map((deadline) => <p key={deadline.id}>Extracted deadline — not applied: {deadline.label}<br /><time dateTime={deadline.at}>{timeLabel(deadline.at)}</time></p>)}</>
        : <fieldset disabled={busy} className="update-row__fields"><legend className="sr-only">Edit update for {proposal.source.subject}</legend>
          <label>Application<select value={applicationId} onChange={(event) => { setApplicationId(event.target.value); setConfirming(false); }}><option value="">Choose an application</option>{applications.filter((item) => !item.archived || item.id === applicationId).map((item) => <option key={item.id} value={item.id}>{item.company} · {item.role}{item.outcome ? " (closed)" : ""}</option>)}</select></label>
          <label>Proposed stage<select value={stage} onChange={(event) => { setStage(event.target.value as ApplicationStage | ""); setConfirming(false); }}><option value="">No stage change</option>{applicationStages.map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}</select></label>
          <label>Proposed outcome<select value={outcome} onChange={(event) => { setOutcome(event.target.value as ApplicationOutcome | ""); setConfirming(false); }}><option value="">No outcome change</option>{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {proposal.classification.interviewSubtype && <p>Interview type: {proposal.classification.interviewSubtype}</p>}
          <p id={`${id}-timezone`}>Deadline timezone: ISO date and time with Z (UTC) or an offset. SGT / HKT = UTC+08:00.</p>
          {deadlines.map((deadline, index) => <div key={deadline.id} className="update-row__deadline"><label>Deadline {index + 1} label<input value={deadline.label} onChange={(event) => editDeadline(index, { label: event.target.value })} /></label><label>Deadline {index + 1} date and time<input aria-describedby={`${id}-timezone`} value={deadline.at} onChange={(event) => editDeadline(index, { at: event.target.value })} /></label><p>Extracted time: {timeLabel(proposal.classification.deadlines.find((item) => item.id === deadline.id)?.at ?? deadline.at)}</p><Button variant="secondary" onClick={() => { setDeadlines(deadlines.filter((item) => item.id !== deadline.id)); setConfirming(false); }}>Remove deadline {index + 1}</Button></div>)}
          <Button variant="secondary" onClick={() => { setDeadlines([...deadlines, { id: crypto.randomUUID(), label: "", at: "", completed: false }]); setConfirming(false); }}>Add deadline</Button>
          {closed && <p className="update-row__conflict">This application is closed. Correct its history before approving an update.</p>}
          <div className="update-row__actions"><button ref={approveButton} className="button button--primary" disabled={!application || closed} onClick={() => void review("approve")}>Approve update</button><Button variant="secondary" onClick={() => void review("reject")}>Reject update</Button><Button variant="secondary" disabled={proposal.status === "deferred"} onClick={() => void review("defer")}>Defer update</Button></div>
          {confirming && <section role="alertdialog" aria-labelledby={`${id}-confirm`} aria-describedby={`${id}-confirm-description`} className="update-row__confirmation" onKeyDown={(event) => { if (event.key === "Escape") cancelConfirmation(); }}><h3 id={`${id}-confirm`}>{currentConflicts.length ? "Approve conflicting update?" : "Approve terminal update?"}</h3><p id={`${id}-confirm-description`}>{currentConflicts.length ? `Current conflicts: ${currentConflicts.map(humanize).join(", ")}. ` : ""}Approve {outcome ? outcomeLabels[outcome] : stage === "offer" ? "Offer" : "this update"} for {application?.company} · {application?.role}. This will change the application history.</p><Button autoFocus variant="secondary" onClick={cancelConfirmation}>Cancel</Button><Button onClick={() => void review("approve", true)}>Approve update</Button></section>}
        </fieldset>}
      {busy && <p role="status">Saving update…</p>}
      {result && <p ref={resultRef} role="status" tabIndex={-1}>{result}</p>}
      {error && <p role="alert" className="update-row__conflict">{error}</p>}
    </div>
  </article>;
}
