import { useEffect, useState } from "react";
import type { BuddyActivityEntry, BuddyPreferences } from "../../domain/buddy";
import { buddyClient, type BuddyClient, type BuddyStatus } from "./buddyClient";

interface BuddySettingsProps {
  client?: BuddyClient;
  confirmAutomatic?: () => boolean;
  confirmRevoke?: () => boolean;
}

export function BuddySettings({
  client = buddyClient,
  confirmAutomatic = () => window.confirm("Automatic fill changes only empty, safe, high-confidence fields. Salary, authorization, legal, EEO, uploads, and Submit always remain under your control."),
  confirmRevoke = () => window.confirm("Revoke this browser extension? It will immediately lose profile access."),
}: BuddySettingsProps = {}) {
  const [status, setStatus] = useState<BuddyStatus | null>(null);
  const [preferences, setPreferences] = useState<BuddyPreferences | null>(null);
  const [activity, setActivity] = useState<BuddyActivityEntry[]>([]);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    let active = true;
    setBusy("load"); setMessage(null);
    Promise.all([client.status(), client.getPreferences(), client.listActivity()]).then(([nextStatus, nextPreferences, nextActivity]) => {
      if (!active) return;
      setStatus(nextStatus);
      setPreferences(nextPreferences);
      setActivity(nextActivity);
    }).catch(() => {
      if (!active) return;
      setStatus({ paired: false });
      setPreferences(null);
      setMessage({ tone: "error", text: "Buddy settings are unavailable. Start the app with npm.cmd run dev, then retry the connection." });
    }).finally(() => { if (active) setBusy(null); });
    return () => { active = false; };
  }, [client, reload]);

  async function startPairing() {
    setBusy("pair"); setMessage(null); setPairing(null);
    try {
      setPairing(await client.startPairing());
      setMessage({ tone: "status", text: "Enter this one-time code in the browser Buddy." });
    } catch { setMessage({ tone: "error", text: "A pairing code could not be created. Retry the connection and check that the app is open on localhost or 127.0.0.1, port 5173 or 43117." }); }
    finally { setBusy(null); }
  }

  async function save(next: BuddyPreferences) {
    setBusy("preferences"); setMessage(null);
    try {
      setPreferences(await client.savePreferences(next));
      setMessage({ tone: "status", text: "Buddy preferences saved." });
    } catch { setMessage({ tone: "error", text: "Buddy preferences could not be saved." }); }
    finally { setBusy(null); }
  }

  function changeMode(mode: BuddyPreferences["mode"]) {
    if (!preferences) return;
    if (mode === "automatic" && !confirmAutomatic()) return;
    void save({ ...preferences, mode });
  }

  async function revoke() {
    if (!confirmRevoke()) return;
    setBusy("revoke"); setMessage(null);
    try {
      await client.revoke();
      setStatus({ paired: false });
      setPairing(null);
      setMessage({ tone: "status", text: "Browser extension revoked." });
    } catch { setMessage({ tone: "error", text: "The extension could not be revoked." }); }
    finally { setBusy(null); }
  }

  async function clearActivity() {
    setBusy("activity");
    try { await client.clearActivity(); setActivity([]); setMessage({ tone: "status", text: "Buddy activity cleared." }); }
    catch { setMessage({ tone: "error", text: "Buddy activity could not be cleared." }); }
    finally { setBusy(null); }
  }

  return <section className="buddy-settings" aria-labelledby="buddy-settings-heading">
    <header className="buddy-settings__heading">
      <div><h2 id="buddy-settings-heading">Browser Buddy</h2><p>Pair the local extension, choose its guardrails, and review metadata-only activity.</p></div>
      <span className="buddy-settings__state" data-state={status?.paired ? "paired" : "unpaired"}><span aria-hidden="true" />{busy === "load" ? "Checking…" : !preferences ? "Unavailable" : status?.paired ? "Paired" : "Not paired"}</span>
    </header>

    {message && <p className={`buddy-settings__message buddy-settings__message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}

    <div className="buddy-settings__row">
      <div><h3>Local extension</h3><p>{status?.paired ? `Paired locally on ${new Date(status.pairedAt).toLocaleDateString()}.` : "No browser extension is paired."}</p></div>
      <div className="buddy-settings__actions">
        {!status?.paired && <button className="button button--primary" disabled={!preferences || Boolean(busy)} onClick={() => void startPairing()} type="button">Pair browser extension</button>}
        <button className="button button--secondary" type="button" onClick={() => setShowGuide(!showGuide)} aria-expanded={showGuide} aria-controls="buddy-install-guide">Installation guide</button>
        <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => setReload((value) => value + 1)}>{message?.tone === "error" ? "Retry connection" : "Refresh connection"}</button>
        {status?.paired && <button className="button button--secondary" disabled={Boolean(busy)} onClick={() => void revoke()} type="button">Revoke extension</button>}
      </div>
    </div>

    {showGuide && <div className="buddy-settings__guide" id="buddy-install-guide">
      <strong>Install Browser Buddy in Chrome or Edge</strong>
      <ol>
        <li>In your Job Buddy project, run <code>npm.cmd run build:extension</code> once to create the <code>dist-extension</code> folder.</li>
        <li>Open <code>chrome://extensions</code> or <code>edge://extensions</code>, enable Developer mode, choose Load unpacked, and select <code>dist-extension</code>. Browser installation requires your confirmation; a webpage cannot do this for you.</li>
        <li>Click Pair browser extension here. Open the installed Job Buddy extension from your browser toolbar and enter the one-time code.</li>
        <li>Click Refresh connection here to verify pairing. The local companion must remain running.</li>
      </ol>
    </div>}

    {pairing && <div className="buddy-settings__pairing" role="status">
      <span>One-time pairing code</span><strong>{pairing.code}</strong><small>Expires in under 5 minutes. It is never placed in a URL or log.</small>
    </div>}

    <fieldset className="buddy-settings__row buddy-settings__mode" disabled={!preferences || Boolean(busy)}>
      <legend><span>Autofill mode</span><small>Buddy never clicks final Submit in either mode.</small></legend>
      <div className="buddy-settings__choices">
        <label><input checked={preferences?.mode === "approval"} name="buddy-mode" onChange={() => changeMode("approval")} type="radio" /><span><strong>Approval mode</strong><small>Review every proposed field.</small></span></label>
        <label><input checked={preferences?.mode === "automatic"} name="buddy-mode" onChange={() => changeMode("automatic")} type="radio" /><span><strong>Automatic fill</strong><small>Safe, empty, high-confidence fields only.</small></span></label>
      </div>
    </fieldset>

    <div className="buddy-settings__row">
      <div><h3>Emergency pause</h3><p>Blocks profile reads and form fills until you turn Buddy back on.</p></div>
      <label className="buddy-settings__check"><input checked={preferences?.paused ?? false} disabled={!preferences || Boolean(busy)} onChange={(event) => preferences && void save({ ...preferences, paused: event.currentTarget.checked })} type="checkbox" /> Pause Buddy everywhere</label>
    </div>

    <div className="buddy-settings__row buddy-settings__activity">
      <div><h3>Recent activity</h3><p>Only field category, decision, reason, adapter, domain, and time are stored—never the filled value.</p></div>
      <button className="button button--secondary" disabled={!activity.length || Boolean(busy)} onClick={() => void clearActivity()} type="button">Clear activity</button>
      {activity.length > 0 && <ol>{activity.slice(-5).reverse().map((entry) => <li key={entry.id}><strong>{entry.disposition}</strong><span>{entry.fieldCategory} · {entry.domain}</span><time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time></li>)}</ol>}
    </div>

    {preferences?.enabledDomains.length ? <div className="buddy-settings__domains"><h3>Enabled sites</h3><ul>{preferences.enabledDomains.map((domain) => <li key={domain}>{domain}</li>)}</ul></div> : null}
  </section>;
}
