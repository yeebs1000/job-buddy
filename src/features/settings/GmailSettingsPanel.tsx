import { Button } from "../../components/Button";
import { useState } from "react";
import { GmailSetupPanel } from "./GmailSetupPanel";
import { RecheckMailControl } from "../updates/RecheckMailControl";
import type { GmailConnectionStatus } from "../../domain/mail";
import type { GmailPreferences } from "./gmailPreferences";

interface GmailSettingsPanelProps {
  status: GmailConnectionStatus;
  preferences: GmailPreferences;
  busy: string | null;
  resumable?: boolean;
  onConnect(): void;
  onDisconnect(): void;
  onInitialScan(): void;
  onRecheck(): void;
  onDailyChange(enabled: boolean): void;
  onModeChange(mode: GmailPreferences["automationMode"]): void;
  onSourceChange(source: GmailPreferences["selectedSource"]): void;
  onSetup(clientId: string, clientSecret?: string): Promise<void>;
}

function connectionCopy(status: GmailConnectionStatus): { title: string; detail: string } {
  if (!status.platformSupported) return { title: "Gmail unavailable on this device", detail: "Windows is required for persistent Gmail access in this version. The demo inbox remains available." };
  if (status.state === "unconfigured") return { title: "Gmail connector awaiting setup", detail: "Set up your local Google client once, then connect your Gmail account from this page." };
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
  const [showSetup, setShowSetup] = useState(false);
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
        {status.platformSupported && !connected && <Button variant="secondary" disabled={Boolean(busy)} aria-expanded={showSetup} aria-controls="gmail-setup" onClick={() => setShowSetup(!showSetup)}>{showSetup ? "Hide setup" : status.state === "unconfigured" ? "Set up Gmail" : "Change client ID"}</Button>}
        {status.platformSupported && status.state !== "unconfigured" && !connected && <Button disabled={Boolean(busy) || showSetup} onClick={props.onConnect}>{status.state === "reconnect-required" ? "Reconnect Gmail" : "Connect Gmail"}</Button>}
        {(connected || status.state === "reconnect-required" || status.accountEmail || (showSetup && status.state !== "unconfigured")) && <Button variant="secondary" disabled={Boolean(busy)} onClick={props.onDisconnect}>Disconnect</Button>}
      </div>
    </div>

    {busy === "connect" && <p className="gmail-settings__row">To change your client ID, choose Stop waiting first.</p>}
    {connected && <p className="gmail-settings__row">To change your client ID, disconnect Gmail first. Your tracked applications stay here.</p>}
    {!connected && showSetup && <GmailSetupPanel disabled={Boolean(busy)} onSave={async (clientId, clientSecret) => { await props.onSetup(clientId, clientSecret); setShowSetup(false); }} />}

    {connected && (!preferences.initialSyncCompleted || props.resumable) && <div className="gmail-settings__row">
      <div><h3>Bring in recent updates</h3><p>Review up to 500 inbox messages from the last 90 days. Promotions and social mail are excluded.</p></div>
      <Button disabled={Boolean(busy)} onClick={props.onInitialScan}>{busy === "scan" ? "Scanning Gmail…" : props.resumable ? "Resume Gmail scan" : "Scan last 90 days"}</Button>
    </div>}

    <div className="gmail-settings__row">
      <div><h3>Automatic checks</h3><p>Check once per eligible day while Job Buddy is open. Nothing runs as a background service.</p></div>
      <div><label className="gmail-settings__check"><input type="checkbox" aria-describedby="daily-scan-help" checked={preferences.dailyActiveScanEnabled} disabled={!connected || Boolean(busy)} onChange={(event) => props.onDailyChange(event.target.checked)} /> Daily active-session scan</label><p id="daily-scan-help">{!connected ? "Connect Gmail to enable daily checks." : !preferences.initialSyncCompleted ? "You can set this now. Daily checks begin after the first scan succeeds." : "Runs while Job Buddy is open, no more than once every 24 hours."}</p></div>
    </div>

    {connected && <div className="gmail-settings__row"><RecheckMailControl disabled={Boolean(busy) || Boolean(props.resumable)} onRecheck={props.onRecheck} /></div>}

    <fieldset className="gmail-settings__row gmail-settings__mode" disabled={!connected || Boolean(busy)}>
      <legend><span>Update handling</span><small>Choose how confident, low-risk recruiter updates enter your tracker.</small></legend>
      <div className="gmail-settings__choice-group">
        <label><input type="radio" name="automation-mode" checked={preferences.automationMode === "approval"} onChange={() => props.onModeChange("approval")} /><span><strong>Approval required</strong><small>Review every suggested change.</small></span></label>
        <label><input type="radio" name="automation-mode" checked={preferences.automationMode === "unrestricted"} onChange={() => props.onModeChange("unrestricted")} /><span><strong>Auto-apply safe updates</strong><small>High-confidence forward changes only. Offers and rejections still wait for you.</small></span></label>
      </div>
    </fieldset>

    <div className="gmail-settings__row">
      <div><h3>Real mail only</h3><p>Your inbox contains Gmail updates only. Demo messages are excluded; disconnecting never substitutes fictional data.</p></div>
    </div>
  </section>;
}
