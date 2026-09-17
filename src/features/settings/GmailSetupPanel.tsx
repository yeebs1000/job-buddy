import { useState } from "react";
import { Button } from "../../components/Button";

export function GmailSetupPanel({ onSave }: { onSave(clientId: string): Promise<void> }) {
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const normalized = clientId.trim();
    if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(normalized)) {
      setError("Enter a Desktop client ID ending in .apps.googleusercontent.com."); return;
    }
    setSaving(true); setError("");
    try { await onSave(normalized); }
    catch { setError("Could not save setup. Check that the local companion is running, then retry. If setup was already saved, reload Settings."); }
    finally { setSaving(false); }
  }
  return <div className="gmail-setup" id="gmail-setup">
    <h3>Set up your local Gmail connector</h3>
    <p>This is one-time owner setup. Once configured, connecting an account only needs Google's sign-in popup.</p>
    <ol>
      <li>Create or select your Job Buddy project in Google Cloud and enable the Gmail API.</li>
      <li>Configure Google Auth branding and audience. Keep the app in Testing and add your Gmail address as a test user.</li>
      <li>Create an OAuth client with application type <strong>Desktop app</strong>, then paste its client ID below. A web client is not interchangeable.</li>
    </ol>
    <a className="button button--secondary" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Open Google Cloud ↗</a>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="desktop-client-id">Desktop client ID</label>
      <input id="desktop-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} autoFocus autoComplete="off" spellCheck={false} maxLength={200} required disabled={saving} aria-describedby="desktop-client-help" aria-invalid={Boolean(error)} />
      <p id="desktop-client-help">This public identifier is saved on this computer, outside the repository. Do not paste a client secret, password, or token. Saving does not access your inbox.</p>
      {error && <p role="alert" className="gmail-setup__error">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save client ID"}</Button>
    </form>
    <p>Google registration happens on Google's website; it cannot be completed inside Job Buddy. Public distribution still needs Google's applicable verification.</p>
  </div>;
}
