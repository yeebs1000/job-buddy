import { useEffect, useId, useRef, useState } from "react";
import { tavilyKeySchema, type ResearchSearchStatus } from "../../domain/researchSearch";
import { researchSearchClient } from "./researchSearchClient";

export function ResearchSearchSettings({ client = researchSearchClient }: { client?: typeof researchSearchClient }) {
  const [status, setStatus] = useState<ResearchSearchStatus>();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(false), pending = useRef(false);
  const heading = useId();
  useEffect(() => {
    let active = true;
    mounted.current = true;
    client.status().then(value => { if (active) { setStatus(value); setError(""); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Research settings unavailable."); });
    return () => { active = false; mounted.current = false; };
  }, [client]);
  async function change(remove: boolean) {
    if (pending.current) return;
    if (!remove && !tavilyKeySchema.safeParse(key).success) { setError("Enter a valid Tavily API key beginning with tvly-."); return; }
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const value = await (remove ? client.removeKey() : client.saveKey(key));
      if (!mounted.current) return;
      setStatus(value); setKey(""); setMessage(remove ? "Research key removed. Saved research is unchanged." : "Key saved securely, not yet verified. Run research from the dashboard to check it.");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Research settings could not be saved."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="gmail-settings research-settings" aria-labelledby={heading}>
    <header className="gmail-settings__heading"><div><h2 id={heading}>Research search</h2><p>Salary and employee-rating sources, powered by Tavily. No Docker required.</p></div><span>{status?.configured ? "Key saved" : "Not configured"}</span></header>
    <div className="research-settings__body">
      {!status && !error && <p role="status">Loading research settings…</p>}
      {status && !status.platformSupported && <p>Secure storage is unavailable on this platform. Research key entry requires the local Windows companion.</p>}
      {status?.platformSupported && <form onSubmit={event => { event.preventDefault(); void change(false); }}>
        <label>Tavily API key<input type="password" autoComplete="new-password" spellCheck={false} maxLength={512} value={key} disabled={busy} onChange={event => setKey(event.target.value)} placeholder={status.configured ? "Enter a replacement key" : "tvly-…"} /></label>
        <div className="research-settings__actions"><button className="button button--primary" disabled={busy || !key.trim()}>Save key</button><button type="button" className="button button--secondary" disabled={busy || !status.configured} onClick={() => void change(true)}>Remove key</button><a href="https://app.tavily.com/" target="_blank" rel="noopener noreferrer">Get a Tavily key</a></div>
      </form>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {status && <p>{status.usage.used} / {status.usage.limit} search requests used by this installation · {status.usage.month} (UTC). Cached searches do not count.</p>}
      <p className="research-settings__help">Only company, role and location are sent to Tavily. Your key is encrypted for this Windows user and excluded from exports and backups. Saving does not run a paid search.</p>
      <p className="research-settings__help">Use Tavily’s free plan and keep paid usage disabled in your Tavily account. Other apps can use the same account allowance; Job Buddy’s local limit cannot prevent those charges.</p>
    </div>
  </section>;
}
