import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { applicationRepository, type PersistedApplication } from "../../db/applicationRepository";
import { DetailsConflictError, fromEditorDate, saveApplicationDetails, toEditorDate } from "./applicationDetails";

function draftOf(application: PersistedApplication) {
  return {
    recruiter: application.recruiter ?? "", notes: application.notes ?? "", followUpAt: toEditorDate(application.followUpAt),
    deadlines: application.deadlines.map(deadline => ({ ...deadline, at: toEditorDate(deadline.at) })),
  };
}

export function ApplicationDetailsEditor({ application, onSaved, onCancel }: {
  application: PersistedApplication;
  onSaved: (application: PersistedApplication) => void;
  onCancel: () => void;
}) {
  const [original, setOriginal] = useState(application);
  const [draft, setDraft] = useState(() => draftOf(application));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setConflict(false);
    try {
      const saved = await saveApplicationDetails(original, {
        ...draft, followUpAt: fromEditorDate(draft.followUpAt, original.followUpAt),
        deadlines: draft.deadlines.map(deadline => ({ ...deadline, at: fromEditorDate(deadline.at, original.deadlines.find(item => item.id === deadline.id)?.at) ?? "" })),
      });
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save details. Your draft is still here; try again.");
      setConflict(cause instanceof DetailsConflictError);
    } finally { setBusy(false); }
  }

  async function reload() {
    setBusy(true);
    try {
      const latest = await applicationRepository.get(original.id);
      if (!latest) throw new Error("This application no longer exists. Return to applications to continue.");
      setOriginal(latest); setDraft(draftOf(latest)); setConflict(false); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the latest details. Your draft is still here."); }
    finally { setBusy(false); }
  }

  return <form className="detail-editor detail-section" aria-labelledby="edit-details-title" onSubmit={event => void save(event)}>
    <h2 id="edit-details-title">Edit application details</h2>
    <p className="detail-meta" id="detail-editor-help">Saved only on this device. Dates below use SGT / HKT (UTC+08:00). Stage history and email evidence stay unchanged.</p>
    <fieldset disabled={busy} aria-describedby="detail-editor-help">
      <div className="detail-form-grid">
        <label>Contact / recruiter<input autoFocus value={draft.recruiter} maxLength={2000} onChange={event => setDraft({ ...draft, recruiter: event.target.value })} /></label>
        <div><label>Follow-up time<input type="datetime-local" aria-describedby="follow-up-help" value={draft.followUpAt} onChange={event => setDraft({ ...draft, followUpAt: event.target.value })} /></label><p className="detail-meta" id="follow-up-help">Optional. Clear to remove the reminder.</p></div>
      </div>
      <label>Notes<textarea rows={3} value={draft.notes} maxLength={20000} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      <div className="detail-section-heading"><h3>Deadlines & interviews</h3><Button variant="secondary" disabled={draft.deadlines.length >= 100} onClick={() => setDraft({ ...draft, deadlines: [...draft.deadlines, { id: crypto.randomUUID(), label: "", at: "", completed: false }] })}>Add deadline</Button></div>
      {!draft.deadlines.length && <p className="detail-meta">No deadlines yet. Add an interview, assessment or other next step.</p>}
      {draft.deadlines.map((deadline, index) => <div className="detail-editor-deadline" key={deadline.id}>
        <div className="detail-form-grid">
          <label>Deadline label {index + 1}<input required maxLength={300} value={deadline.label} onChange={event => setDraft({ ...draft, deadlines: draft.deadlines.map(item => item.id === deadline.id ? { ...item, label: event.target.value } : item) })} /></label>
          <label>Deadline time {index + 1}<input required type="datetime-local" value={deadline.at} onChange={event => setDraft({ ...draft, deadlines: draft.deadlines.map(item => item.id === deadline.id ? { ...item, at: event.target.value } : item) })} /></label>
        </div>
        <div className="detail-deadline-actions"><label className="detail-checkbox"><input type="checkbox" checked={deadline.completed} onChange={event => setDraft({ ...draft, deadlines: draft.deadlines.map(item => item.id === deadline.id ? { ...item, completed: event.target.checked } : item) })} />Completed deadline {index + 1}</label><Button variant="secondary" onClick={() => setDraft({ ...draft, deadlines: draft.deadlines.filter(item => item.id !== deadline.id) })}>Remove deadline {index + 1}</Button></div>
        {Boolean(deadline.links?.length) && <p className="detail-meta">Existing meeting links are kept when you save.</p>}
      </div>)}
      <p className="detail-meta">Completed deadlines leave your next-action list. Changes and removals take effect only when you save.</p>
      {error && <p role="alert" className="detail-editor-error">{error}</p>}
      <div className="detail-actions"><Button type="submit">Save details</Button><Button variant="secondary" onClick={onCancel}>Cancel edits</Button>{conflict && <Button variant="secondary" onClick={() => void reload()}>Discard draft and load latest</Button>}</div>
    </fieldset>
    <p role="status" className="detail-meta">{busy ? "Saving or loading details…" : ""}</p>
  </form>;
}
