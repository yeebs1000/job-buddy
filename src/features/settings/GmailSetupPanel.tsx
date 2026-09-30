import { useState } from "react";
import { Button } from "../../components/Button";
import { GmailSetupError } from "./gmailClient";

export function GmailSetupPanel({ onSave, disabled = false }: { onSave(clientId: string, clientSecret?: string): Promise<void>; disabled?: boolean }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disabled) return;
    const normalized = clientId.trim();
    if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(normalized)) {
      setError("Enter a Desktop client ID ending in .apps.googleusercontent.com."); return;
    }
    setSaving(true); setError("");
    try { await onSave(normalized, clientSecret.trim() || undefined); setClientSecret(""); }
    catch (error) { setError(error instanceof GmailSetupError ? error.message : "Could not save setup. Check that the local companion is running, then retry. Your previous client ID has not been intentionally cleared."); }
    finally { setSaving(false); }
  }
  return <div className="gmail-setup" id="gmail-setup">
    <h3>Set up your local Gmail connector</h3>
    <p>Save or replace the client ID for this computer. Once configured, connecting an account only needs Google's sign-in popup.</p>
    <ol>
      <li>Create or select your Job Buddy project in Google Cloud and enable the Gmail API.</li>
      <li>Configure Google Auth branding and audience. Keep the app in Testing and add your Gmail address as a test user.</li>
      <li>Create an OAuth client with application type <strong>Desktop app</strong>, then paste its client ID and matching client secret below. You can find these in the client's downloaded JSON. A web client is not interchangeable.</li>
    </ol>
    <p>If Google shows <code>redirect_uri_mismatch</code>, check that you copied a <strong>Desktop app</strong> client ID, not a Web application client. Job Buddy uses a local loopback callback. The ID's text alone cannot confirm the client type.</p>
    <a className="button button--secondary" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Open Google Cloud ↗</a>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="desktop-client-id">Desktop client ID</label>
      <input id="desktop-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} autoFocus autoComplete="off" spellCheck={false} maxLength={200} required disabled={saving || disabled} aria-describedby="desktop-client-help" aria-invalid={Boolean(error)} />
      <p id="desktop-client-help">The client ID is a public identifier. Both values are saved on this computer, outside the repository. Saving does not access your inbox.</p>
      <label htmlFor="desktop-client-secret">Desktop client secret (if provided by Google)</label>
      <input id="desktop-client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" spellCheck={false} maxLength={512} disabled={saving || disabled} aria-describedby="desktop-secret-help" />
      <p id="desktop-secret-help">Google may require this even with PKCE. It is encrypted for your Windows account, never returned by the companion, and not stored in browser storage. Enter the secret matching this ID; leaving it blank saves an ID-only configuration and removes any previous saved secret. Never enter your Google password or paste this secret into chat.</p>
      {error && <p role="alert" className="gmail-setup__error">{error}</p>}
      <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : "Save client ID"}</Button>
    </form>
    <p>Google registration happens on Google's website; it cannot be completed inside Job Buddy. Public distribution still needs Google's applicable verification.</p>
  </div>;
}
