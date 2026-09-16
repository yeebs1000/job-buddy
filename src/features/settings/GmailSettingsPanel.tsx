import { Button } from "../../components/Button";
import type { GmailConnectionStatus } from "../../domain/mail";
import type { GmailPreferences } from "./gmailPreferences";

interface GmailSettingsPanelProps {
  status: GmailConnectionStatus;
  preferences: GmailPreferences;
  busy: string | null;
  onConnect(): void;
  onDisconnect(): void;
  onInitialScan(): void;
  onDailyChange(enabled: boolean): void;
  onModeChange(mode: GmailPreferences["automationMode"]): void;
  onSourceChange(source: GmailPreferences["selectedSource"]): void;
}

function connectionCopy(status: GmailConnectionStatus): { title: string; detail: string } {
  if (!status.platformSupported) return { title: "Gmail unavailable on this device", detail: "Windows is required for persistent Gmail access in this version. The demo inbox remains available." };
  if (status.state === "unconfigured") return { title: "Gmail connector awaiting setup", detail: "This build does not yet include the Job Buddy Google connection. The maintainer must register and configure the connector before you can sign in." };
  if (status.state === "reconnect-required") return { title: "Reconnect Gmail", detail: "Google no longer accepts the saved authorization. Reconnecting checks up to 500 inbox messages from the last 90 days and resumes daily read-only checks while the app is open." };
  if (status.state === "connected") return { title: "Gmail connected", detail: "Job Buddy can read recruiting email only when you start a scan or an eligible daily check runs while the app is open." };
  return { title: "Gmail not connected", detail: "Sign in with Google to bring recruiter replies and interview details into your tracker. Connecting also checks up to 500 messages from the last 90 days, then enables daily checks while Job Buddy is open." };
}

const stateLabels: Record<GmailConnectionStatus["state"], string> = {
  unconfigured: "Setup needed",
  disconnected: "Not connected",
  connected: "Connected",
  "reconnect-required": "Reconnect needed",
};

export function GmailSettingsPanel(props: GmailSettingsPanelProps) {
  const { status, preferences, busy } = props;
  const copy = connectionCopy(status);
  const connected = status.state === "connected";
  return <section className="gmail-settings" aria-labelledby="gmail-settings-heading">
    <header className="gmail-settings__heading">
      <div><h2 id="gmail-settings-heading">Gmail connection</h2><p>Sign in through a secure Google popup. Your dashboard stays here.</p></div>
      <span className="gmail-settings__state" data-state={status.state}><span aria-hidden="true" />{stateLabels[status.state]}</span>
    </header>

    <div className="gmail-settings__row">
      <div><h3>{copy.title}</h3><p>{copy.detail}</p>{status.accountEmail && <p className="gmail-settings__account">{status.accountEmail}</p>}</div>
      <div className="gmail-settings__actions">
        {status.platformSupported && status.state !== "unconfigured" && !connected && <Button disabled={Boolean(busy)} onClick={props.onConnect}>{status.state === "reconnect-required" ? "Reconnect Gmail" : "Connect Gmail"}</Button>}
        {connected && <Button variant="secondary" disabled={Boolean(busy)} onClick={props.onDisconnect}>Disconnect</Button>}
      </div>
    </div>

    {status.state === "unconfigured" && <details><summary>Maintainer / self-host setup</summary><p>Copy .env.example to .env.local and configure a Google OAuth client, or distribute a build with the maintainer-owned Desktop client ID. Public Gmail access requires Google verification. No end-user API key is needed in a configured build.</p></details>}

    {connected && !preferences.initialSyncCompleted && <div className="gmail-settings__row">
      <div><h3>Bring in recent updates</h3><p>Review up to 500 inbox messages from the last 90 days. Promotions and social mail are excluded.</p></div>
      <Button disabled={Boolean(busy)} onClick={props.onInitialScan}>{busy === "scan" ? "Scanning Gmail…" : "Scan last 90 days"}</Button>
    </div>}

    <div className="gmail-settings__row">
      <div><h3>Automatic checks</h3><p>Check once per eligible day while Job Buddy is open. Nothing runs as a background service.</p></div>
      <label className="gmail-settings__check"><input type="checkbox" checked={preferences.dailyActiveScanEnabled} disabled={!connected || !preferences.initialSyncCompleted || Boolean(busy)} onChange={(event) => props.onDailyChange(event.target.checked)} /> Daily active-session scan</label>
    </div>

    <fieldset className="gmail-settings__row gmail-settings__mode" disabled={!connected || Boolean(busy)}>
      <legend><span>Update handling</span><small>Choose how confident, low-risk recruiter updates enter your tracker.</small></legend>
      <div className="gmail-settings__choice-group">
        <label><input type="radio" name="automation-mode" checked={preferences.automationMode === "approval"} onChange={() => props.onModeChange("approval")} /><span><strong>Approval required</strong><small>Review every suggested change.</small></span></label>
        <label><input type="radio" name="automation-mode" checked={preferences.automationMode === "unrestricted"} onChange={() => props.onModeChange("unrestricted")} /><span><strong>Auto-apply safe updates</strong><small>High-confidence forward changes only. Offers and rejections still wait for you.</small></span></label>
      </div>
    </fieldset>

    <div className="gmail-settings__row">
      <div><h3>Inbox source</h3><p>Switch to fictional messages anytime. Live scan failures never fall back automatically.</p></div>
      <div className="gmail-settings__source" role="group" aria-label="Inbox source">
        <Button disabled={Boolean(busy)} variant={preferences.selectedSource === "simulated" ? "primary" : "secondary"} onClick={() => props.onSourceChange("simulated")}>Use demo inbox</Button>
        {connected && preferences.initialSyncCompleted && <Button disabled={Boolean(busy)} variant={preferences.selectedSource === "gmail" ? "primary" : "secondary"} onClick={() => props.onSourceChange("gmail")}>Use live Gmail</Button>}
      </div>
    </div>
  </section>;
}
