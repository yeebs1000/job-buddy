import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { StageRail } from "../../components/StageRail";
import { applicationRepository, type PersistedApplication } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { seedDemoData } from "../../db/seed";
import { compareStageEvents } from "../../domain/stage";
import { isSafeExternalHttpsUrl, isSafeExternalJobUrl } from "../../domain/jobUrl";
import { ManualStageUpdate, type ManualUpdate } from "./ManualStageUpdate";
import { formatDate, outcomeLabels, stageLabels, StageHistory } from "./StageHistory";
import { ResearchPanel } from "../research/ResearchPanel";
import "./application-detail.css";

export function ApplicationDetailPage({ applicationId }: { applicationId?: string }) {
  const params = useParams();
  const id = applicationId ?? params.id ?? "";
  const [application, setApplication] = useState<PersistedApplication>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(false); setApplication(undefined); setError(""); setMessage("");
    void seedDemoData().then(() => applicationRepository.get(id)).then(result => { if (active) setApplication(result); }, () => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setApplication(await applicationRepository.get(id)); setMessage(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this change. Try again."); return false; }
    finally { setBusy(false); }
  }
  async function update(change: ManualUpdate) {
    return run(() => jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
      const current = await applicationRepository.get(id);
      if (!current) throw new Error("Application no longer exists. Reload to continue.");
      if (current.outcome) throw new Error("This application is closed. Undo its latest outcome first.");
      if (current.stage !== application?.stage) throw new Error("Progress changed elsewhere. Reload before updating.");
      if (change.stage === current.stage) throw new Error("Choose a different stage to record a change.");
      const times = current.stageEvents.map(event => Date.parse(event.at)).filter(Number.isFinite);
      const at = new Date(Math.max(Date.now(), ...times.map(time => time + 1))).toISOString();
      await applicationRepository.appendEvent({ id: crypto.randomUUID(), applicationId: id, at, fromStage: current.stage ?? undefined, toStage: change.stage, outcome: change.outcome, note: change.note || undefined, origin: "manual", accepted: true });
    }), "Progress saved.");
  }

  const back = <a className="detail-back" href="/applications">Back to applications</a>;
  if (loading) return <section className="application-detail"><p role="status">Loading application…</p></section>;
  if (loadError) return <section className="application-detail">{back}<h1>Application unavailable</h1><p role="alert">Could not load this application. Try again.</p><Button onClick={() => setAttempt(value => value + 1)}>Retry loading</Button></section>;
  if (!application) return <section className="application-detail">{back}<h1>Application not found</h1><p>This application may have been removed, or the link may be incomplete.</p></section>;
  const accepted = application.stageEvents.filter(event => event.accepted && (event.toStage || event.outcome)).sort(compareStageEvents);
  const latest = accepted.at(-1);
  const canUndo = Boolean(latest);
  const rating = application.research?.companyRating;
  const evidence = application.stageEvents.filter(event => event.evidenceId).sort(compareStageEvents);
  async function undo() {
    if (!latest) return;
    await run(() => jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
      const events = await applicationRepository.eventsFor(id);
      const currentLatest = events.filter(event => event.accepted && (event.toStage || event.outcome)).sort(compareStageEvents).at(-1);
      if (currentLatest?.id !== latest.id) throw new Error("Progress changed elsewhere. Reload before undoing.");
      await applicationRepository.undoEvent(latest.id);
    }), "Change undone. The original record remains in history.");
  }
  const jobUrl = isSafeExternalJobUrl(application.jobUrl) ? application.jobUrl : undefined;
  return <article className="application-detail">
    {back}
    <header className="detail-heading"><p className="detail-company">{application.company}</p><h1>{application.role}</h1><p className="detail-meta">{application.location.city} · {application.workArrangement ?? "Work arrangement unavailable"} · {application.roleFamily ?? application.discipline.replace("_", " / ")}{application.archived && " · Archived"}</p></header>
    <section className="detail-progress" aria-label="Current progress"><p><strong>{application.outcome ? outcomeLabels[application.outcome] : "Active"}</strong> · {application.stage ? `${application.outcome ? "Reached" : "Current stage:"} ${stageLabels[application.stage]}` : "No stage recorded"}</p><StageRail stage={application.stage} outcome={application.outcome} rejectedAtStage={application.outcome === "rejected" ? application.stage ?? undefined : undefined} /></section>
    <p role="status" className="detail-status">{busy ? "Saving changes…" : message}</p>
    {error && <p className="detail-error" role="alert">{error}</p>}
    <div className="detail-layout"><div>
      <section className="detail-section" aria-labelledby="overview-title"><h2 id="overview-title">Overview</h2><dl className="detail-facts"><div><dt>Applied</dt><dd>{formatDate(application.appliedAt)}</dd></div><div><dt>Source</dt><dd>{application.source || "Unavailable"}{jobUrl && <> · <a href={jobUrl} target="_blank" rel="noopener noreferrer">Open job posting</a></>}</dd></div><div><dt>Industry</dt><dd>{application.industry ?? "Unavailable"}</dd></div><div><dt>Priority</dt><dd>{application.priority ?? "normal"}</dd></div></dl><p className="detail-meta">Tags: {application.tags.length ? application.tags.join(" · ") : "None"}</p></section>
      <ManualStageUpdate key={`${id}-${application.updatedAt}`} stage={application.stage} outcome={application.outcome} busy={busy} onUpdate={update} />
      <section className="detail-section" aria-labelledby="activity-title"><div className="detail-section-heading"><h2 id="activity-title">Activity</h2><Button variant="secondary" disabled={busy || !canUndo} onClick={() => void undo()}>Undo change</Button></div><p className="detail-meta">Oldest to newest. Undo reverts the latest applied change and preserves its record.</p><StageHistory events={application.stageEvents} /></section>
    </div><aside aria-label="Application context">
      <section className="detail-section" aria-labelledby="deadlines-title"><h2 id="deadlines-title">Deadlines & interviews</h2>{application.interviewSubtype && <p>Interview format: {application.interviewSubtype}</p>}{application.deadlines.length ? <ul className="detail-deadlines">{[...application.deadlines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)).map(deadline => <li key={deadline.id}><strong>{deadline.label}</strong><span className="detail-meta"><time dateTime={deadline.at}>{formatDate(deadline.at)}</time> · {deadline.completed ? "Completed" : "Open"}</span>{deadline.links?.filter(isSafeExternalHttpsUrl).map((link) => <a key={link} href={link} target="_blank" rel="noopener noreferrer">Open meeting link</a>)}</li>)}</ul> : <p className="detail-meta">No deadlines recorded.</p>}{application.followUpAt && <p>Follow up: <time dateTime={application.followUpAt}>{formatDate(application.followUpAt)}</time></p>}</section>
      <section className="detail-section" aria-labelledby="research-title"><h2 id="research-title">Salary & company</h2><ResearchPanel application={application} />{rating ? <p>Company rating: <strong>{rating.score} / {rating.outOf}</strong><span className="detail-meta"> · {rating.source}</span></p> : <p className="detail-meta">Company rating unavailable.</p>}</section>
      <section className="detail-section" aria-labelledby="contacts-title"><h2 id="contacts-title">Contacts</h2><p>{application.recruiter || "No contact recorded."}</p></section>
      <details className="detail-disclosure"><summary>Job description</summary><p>No job description is stored for this application.</p></details>
      <details className="detail-disclosure"><summary>Notes & documents</summary><p className="detail-note">{application.notes || "No notes recorded."}</p><p className="detail-meta">No documents attached.</p></details>
      <details className="detail-disclosure"><summary>Evidence</summary>{evidence.length ? evidence.map(event => <p className="detail-meta" key={event.id}>{event.evidenceId} · {formatDate(event.at)}</p>) : <p>No linked evidence. Manual updates keep their source and note in Activity.</p>}</details>
      <details className="detail-disclosure"><summary>Preparation</summary><p>No preparation sessions recorded for this application.</p></details>
    </aside></div>
  </article>;
}
