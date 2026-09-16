import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { roleFamilies } from "../../domain/application";
import type { PendingCapture } from "../../domain/buddy";
import { buddyClient, type BuddyClient } from "./buddyClient";
import { captureApplication, type CaptureEdits } from "./captureApplication";
import "./pending-captures.css";

interface PendingCapturesProps {
  client?: BuddyClient;
  capture?: typeof captureApplication;
  onImported?: () => Promise<void> | void;
}

export function PendingCaptures({ client = buddyClient, capture = captureApplication, onImported }: PendingCapturesProps = {}) {
  const [captures, setCaptures] = useState<PendingCapture[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    let active = true;
    client.listCaptures().then((items) => { if (active) setCaptures(items); }).catch(() => { if (active) setCaptures([]); });
    return () => { active = false; };
  }, [client]);

  async function add(event: FormEvent<HTMLFormElement>, pending: PendingCapture) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const edits: CaptureEdits = {
      company: value("company"), role: value("role"), country: value("country") as CaptureEdits["country"],
      city: value("city"), discipline: value("discipline") as CaptureEdits["discipline"],
      industry: value("industry"), roleFamily: value("roleFamily") as CaptureEdits["roleFamily"],
      source: value("source"), appliedDate: value("appliedDate"),
    };
    setBusy(pending.id); setError(null);
    try {
      await capture(pending, edits);
      await client.deleteCapture(pending.id);
      setCaptures((items) => items?.filter((item) => item.id !== pending.id) ?? []);
      setImported(true);
      await onImported?.();
    } catch {
      setError("This application could not be added. Check the details and try again.");
    } finally { setBusy(null); }
  }

  if (captures === null) return null;
  if (!captures.length) return imported ? <p className="pending-captures__success" role="status">Application added. Scan Gmail now above to check for recruiter updates.</p> : null;

  return <section aria-labelledby="pending-captures-title" className="pending-captures">
    <div className="pending-captures__heading"><div><h2 id="pending-captures-title">Completed applications</h2><p>Review what Buddy detected before it enters your tracker.</p></div><span>{captures.length} pending</span></div>
    {error && <p role="alert" className="pending-captures__error">{error}</p>}
    <div className="pending-captures__list">
      {captures.map((pending) => {
        const hongKong = /hong\s*kong|\bhk\b/i.test(pending.location);
        const country = hongKong ? "Hong Kong" : "Singapore";
        return <form className="pending-captures__card" key={pending.id} onSubmit={(event) => void add(event, pending)}>
          <div className="pending-captures__source"><strong>{pending.platform}</strong><a href={pending.sourceUrl} target="_blank" rel="noopener noreferrer">Review job page</a></div>
          <label>Company<input name="company" required maxLength={300} defaultValue={pending.company} /></label>
          <label>Role<input name="role" required maxLength={300} defaultValue={pending.role} /></label>
          <label>Market<select name="country" defaultValue={country}><option>Singapore</option><option>Hong Kong</option></select></label>
          <label>City<input name="city" required maxLength={300} defaultValue={country} /></label>
          <label>Discipline<select name="discipline" defaultValue="software_it"><option value="software_it">Software &amp; IT</option><option value="finance">Finance</option></select></label>
          <label>Industry<input name="industry" required maxLength={160} defaultValue="Technology" /></label>
          <label>Role family<select name="roleFamily" defaultValue="software">{roleFamilies.map((family) => <option key={family} value={family}>{family}</option>)}</select></label>
          <label>Source<input name="source" required maxLength={160} defaultValue="Company careers" /></label>
          <label>Applied date<input name="appliedDate" required type="date" defaultValue={pending.detectedAt.slice(0, 10)} /></label>
          <Button disabled={busy === pending.id} type="submit">{busy === pending.id ? "Adding…" : "Add to tracker"}</Button>
        </form>;
      })}
    </div>
  </section>;
}
