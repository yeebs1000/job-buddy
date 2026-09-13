import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { applicationStages, type ApplicationOutcome, type ApplicationStage } from "../../domain/stage";
import { outcomeLabels, stageLabels } from "./StageHistory";

export interface ManualUpdate { stage?: ApplicationStage; outcome?: ApplicationOutcome; note: string }
export function ManualStageUpdate({ stage, outcome, busy, onUpdate }: { stage: ApplicationStage | null; outcome: ApplicationOutcome | null; busy: boolean; onUpdate: (update: ManualUpdate) => Promise<boolean> }) {
  const [newStage, setNewStage] = useState<ApplicationStage>(stage ?? "applied");
  const [newOutcome, setNewOutcome] = useState<ApplicationOutcome | "">("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!newOutcome && stage === newStage) { setError("Choose a different stage to record a change."); return; }
    if (newOutcome) { setConfirming(true); return; }
    await onUpdate({ stage: newStage, note: note.trim() });
  }
  return <section className="detail-section" aria-labelledby="manual-update-title">
    <h2 id="manual-update-title">Update progress</h2>
    <p className="detail-meta">{outcome ? "This application is closed. Undo the latest change to revisit its progress." : "Record a stage change or close this application with an outcome."}</p>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={event => void submit(event)}>
      <fieldset disabled={busy || Boolean(outcome) || confirming}>
        <legend className="sr-only">Manual update</legend>
        <div className="detail-form-grid">
          <label>New stage<select value={newStage} disabled={Boolean(newOutcome)} onChange={event => { setNewStage(event.target.value as ApplicationStage); setError(""); }}>{applicationStages.map(value => <option value={value} key={value}>{stageLabels[value]}</option>)}</select></label>
          <label>Outcome<select value={newOutcome} onChange={event => { setNewOutcome(event.target.value as ApplicationOutcome | ""); setError(""); }}><option value="">Keep active</option>{Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <label>Update note<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={2} placeholder="Optional context for your history" /></label>
        <Button type="submit">{newOutcome ? "Record outcome" : "Update stage"}</Button>
      </fieldset>
    </form>
    {confirming && newOutcome && <div className="detail-confirmation" role="group" aria-label="Confirm outcome">
      <h3>Confirm {outcomeLabels[newOutcome]}</h3>
      <p>This closes the application and keeps its reached stage{stage ? `, ${stageLabels[stage]}` : ""}. You can undo this change from Activity.</p>
      <div className="detail-actions"><Button autoFocus disabled={busy} onClick={() => void onUpdate({ outcome: newOutcome, note: note.trim() }).then(saved => { if (saved) setConfirming(false); })}>Confirm {outcomeLabels[newOutcome]}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel outcome</Button></div>
    </div>}
  </section>;
}
