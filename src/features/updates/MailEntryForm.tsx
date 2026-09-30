import { useState, type FormEvent } from "react";
import type { UpdateProposal } from "../../domain/updateProposal";
import { Button } from "../../components/Button";
import { createApplicationForMail, saveMailOpportunity, suggestedMailApplication, type MailApplicationDetails } from "./mailReviewActions";

export function MailEntryForm({ proposal, onSaved, onCancel }: { proposal: UpdateProposal; onSaved(applicationId?: string): void; onCancel(): void }) {
  const outreach = proposal.classification.kind === "recruiter-outreach";
  const [details, setDetails] = useState(() => ({
    title: (proposal.source.forwarded?.subject || proposal.source.subject).slice(0, 200), location: "", city: "", country: "",
    discipline: "", appliedDate: proposal.source.receivedAt.slice(0, 10), ...suggestedMailApplication(proposal) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function field(key: keyof typeof details, value: string) { setDetails(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (outreach) { await saveMailOpportunity(proposal.id, details); onSaved(); }
      else { const app = await createApplicationForMail(proposal.id, details as MailApplicationDetails); onSaved(app.id); }
    } catch (cause) { setError(cause instanceof Error && /already|matching application/.test(cause.message) ? cause.message : "Could not save. Check the details and try again."); }
    finally { setBusy(false); }
  }
  return <form className="update-row__entry-form" onSubmit={submit}>
    <fieldset disabled={busy} className="update-row__fields">
      <legend>{outreach ? "Save an opportunity" : "Create an application from this email"}</legend>
      <p>{outreach ? "Not applied. Keep the employer unknown if the recruiter has not named them. Location can be anywhere." : "Check these details. The application starts with no stage; review and approve the email next."}</p>
      {outreach ? <label>Opportunity title<input required maxLength={200} value={details.title} onChange={event => field("title", event.target.value)} /></label>
        : <label>Job title<input required maxLength={200} value={details.role} onChange={event => field("role", event.target.value)} /></label>}
      <label>{outreach ? "Employer (optional)" : "Company"}<input required={!outreach} maxLength={200} value={details.company} onChange={event => field("company", event.target.value)} /></label>
      {outreach ? <label>Opportunity location<input maxLength={200} value={details.location} onChange={event => field("location", event.target.value)} placeholder="For example, Shanghai, China" /></label> : <>
        <label>Country / market<select required value={details.country} onChange={event => field("country", event.target.value)}><option value="">Choose a country</option>{["Singapore", "Hong Kong", "United States"].map(country => <option key={country}>{country}</option>)}</select></label>
        <label>City<input required maxLength={200} value={details.city} onChange={event => field("city", event.target.value)} /></label>
        <label>Role discipline<select required value={details.discipline} onChange={event => field("discipline", event.target.value)}><option value="">Choose a discipline</option><option value="software_it">Software / IT</option><option value="finance">Finance</option></select></label>
        <label>Applied date<input required type="date" value={details.appliedDate} onChange={event => field("appliedDate", event.target.value)} /></label><p>Defaults to the email receipt date. Correct it if you applied earlier.</p>
      </>}
      <div className="update-row__actions"><button className="button button--primary" type="submit">{busy ? "Saving…" : outreach ? "Save opportunity" : "Save application & review update"}</button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}
