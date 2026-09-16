import { useEffect, useRef, useState } from "react";
import { connectGmailPopup, GmailPopupError } from "./gmailPopup";
import type { GmailConnectionStatus } from "../../domain/mail";
import { GmailMailAdapter } from "../../integrations/mail/GmailMailAdapter";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import { runMailScan, type MailScanMode, type RunMailScanOptions } from "../updates/runMailScan";
import { updateRepository, type MailScanState } from "../updates/updateRepository";
import { GmailSettingsPanel } from "./GmailSettingsPanel";
import { BuddySettings } from "../buddy/BuddySettings";
import { buddyClient, type BuddyClient } from "../buddy/buddyClient";
import { gmailClient, type GmailSettingsClient } from "./gmailClient";
import { defaultGmailPreferences, gmailPreferences, type GmailPreferences, type GmailPreferencesStore } from "./gmailPreferences";
import "./settings.css";

export type { GmailSettingsClient } from "./gmailClient";

interface SettingsPageProps {
  client?: GmailSettingsClient;
  preferences?: GmailPreferencesStore;
  mailAdapter?: MailAdapter;
  scan?: (options: RunMailScanOptions) => Promise<MailScanState>;
  confirmAutomation?: () => boolean;
  confirmDisconnect?: () => boolean;
  buddy?: BuddyClient;
  confirmBuddyAutomatic?: () => boolean;
  confirmBuddyRevoke?: () => boolean;
}

const liveMail = new GmailMailAdapter();
const connectIntentKey = "job-buddy-gmail-connect-intent";

function clearConnectionCallback() {
  const url = new URL(window.location.href);
  url.searchParams.delete("gmail");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function SettingsPage({
  client = gmailClient,
  preferences: preferenceStore = gmailPreferences,
  mailAdapter = liveMail,
  scan = runMailScan,
  confirmAutomation = () => window.confirm("Allow Job Buddy to auto-apply high-confidence forward updates? Offers, rejections and conflicts will still require approval."),
  confirmDisconnect = () => window.confirm("Disconnect Gmail? Your existing applications and saved email evidence will stay in Job Buddy."),
  buddy = buddyClient,
  confirmBuddyAutomatic,
  confirmBuddyRevoke,
}: SettingsPageProps = {}) {
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [preference, setPreference] = useState<GmailPreferences | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);
  const popupAttempt = useRef<AbortController | null>(null);
  useEffect(() => () => popupAttempt.current?.abort(), []);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([client.status(), preferenceStore.get()]).then(([statusResult, preferenceResult]) => {
      if (!mounted) return;
      setStatus(statusResult.status === "fulfilled" ? statusResult.value : { state: "disconnected", platformSupported: true });
      setPreference(preferenceResult.status === "fulfilled" ? preferenceResult.value : { ...defaultGmailPreferences });
      if (statusResult.status === "rejected" || preferenceResult.status === "rejected") {
        setMessage({ tone: "error", text: "Could not load all Gmail settings. Start the local companion, then reload this page." });
      } else {
        const callback = new URLSearchParams(window.location.search).get("gmail");
        const intentAt = Number(sessionStorage.getItem(connectIntentKey) ?? 0);
        if (callback) sessionStorage.removeItem(connectIntentKey);
        if (callback === "connected" && statusResult.value.state === "connected") {
          if (intentAt > 0 && Date.now() - intentAt >= 0 && Date.now() - intentAt < 10 * 60_000) {
            void completeConnection(preferenceResult.value);
          } else setMessage({ tone: "status", text: "Gmail connected. Confirm the first scan when you are ready." });
        }
        if (callback === "error") setMessage({ tone: "error", text: "Google sign-in was cancelled or could not finish. Your existing tracker is unchanged. Try connecting again." });
      }
    });
    return () => { mounted = false; };
  }, [client, preferenceStore]);

  async function save(next: GmailPreferences) {
    await preferenceStore.save(next);
    setPreference(next);
  }

  async function connect() {
    if (!preference || popupAttempt.current) return;
    const controller = new AbortController();
    popupAttempt.current = controller;
    setBusy("connect"); setMessage({ tone: "status", text: "Complete Google sign-in in the popup. Your dashboard stays here." });
    try {
      await connectGmailPopup(client, {
        signal: controller.signal,
        prepare: async () => {
          // Consent may switch accounts. Pause scans before contacting Google;
          // cancellation leaves a manual first-scan action, never an old cursor.
          await save({ ...preference, initialSyncCompleted: false, dailyActiveScanEnabled: false });
          await updateRepository.saveScanState("gmail", { cursor: null });
        },
        onWindowClosed: () => setMessage({ tone: "status", text: "Waiting for Google confirmation. If you closed the sign-in window, stop waiting and try again." }),
        onConnected: async () => {
          const connected = await client.status();
          if (controller.signal.aborted) throw new GmailPopupError("stopped");
          if (connected.state !== "connected") throw new GmailPopupError("connection");
          setStatus(connected);
          await completeConnection(await preferenceStore.get());
        },
      });
    } catch (error) {
      const code = error instanceof GmailPopupError ? error.code : "connection";
      const text = {
        blocked: "Your browser blocked the Google sign-in window. Allow popups for Job Buddy, then click Connect Gmail again.",
        stopped: "Stopped waiting for Google. If you already approved access, reload Settings to check the connection; otherwise try again.",
        timeout: "Google sign-in timed out. Click Connect Gmail to start a new attempt.",
        authorization: "Google sign-in was cancelled or could not finish. Click Connect Gmail to try again.",
        connection: "Could not finish connecting Gmail. Check that the local companion is running and try again.",
      }[code];
      setMessage({ tone: "error", text });
    } finally {
      popupAttempt.current = null;
      setBusy(null);
    }
  }

  async function completeConnection(current: GmailPreferences) {
    setBusy("scan"); setMessage({ tone: "status", text: "Gmail connected. Checking your recent recruiting email…" });
    try {
      // A new consent flow may select a different account. Never reuse its predecessor's history cursor.
      await updateRepository.saveScanState("gmail", { cursor: null });
      await save({ ...current, initialSyncCompleted: false, dailyActiveScanEnabled: false, selectedSource: "gmail" });
      const result = await scan({ adapter: mailAdapter, mode: current.automationMode, initialSyncConfirmed: true });
      if (result.error) throw new Error();
      await save({ ...current, selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: true });
      clearConnectionCallback();
      setMessage({ tone: "status", text: "Gmail connected and recent updates were checked. New updates are ready in Updates." });
    } catch { setMessage({ tone: "error", text: "Gmail is connected, but the first scan did not finish. Retry Scan last 90 days below." }); }
    finally { setBusy(null); }
  }

  async function disconnect() {
    if (!preference || !confirmDisconnect()) return;
    setBusy("disconnect"); setMessage(null);
    try {
      await client.disconnect();
      await updateRepository.saveScanState("gmail", { cursor: null });
      await save({ ...preference, selectedSource: "simulated", initialSyncCompleted: false, dailyActiveScanEnabled: false });
      setStatus({ state: "disconnected", platformSupported: status?.platformSupported ?? true });
      setMessage({ tone: "status", text: "Gmail disconnected. Existing tracker evidence was kept." });
    } catch { setMessage({ tone: "error", text: "Gmail could not be disconnected. Try again." }); }
    finally { setBusy(null); }
  }

  async function initialScan() {
    if (!preference) return;
    setBusy("scan"); setMessage(null);
    try {
      const result = await scan({ adapter: mailAdapter, mode: preference.automationMode as MailScanMode, initialSyncConfirmed: true });
      if (result.error) throw new Error();
      await save({ ...preference, selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: true });
      clearConnectionCallback();
      setMessage({ tone: "status", text: result.diagnostics?.truncated ? "Gmail connected. The newest 500 messages were checked." : "Gmail connected and recent updates were checked." });
    } catch { setMessage({ tone: "error", text: "Gmail scan could not be completed. No live cursor was advanced." }); }
    finally { setBusy(null); }
  }

  async function changePreference(update: Partial<GmailPreferences>) {
    if (!preference) return;
    try { await save({ ...preference, ...update }); }
    catch { setMessage({ tone: "error", text: "This setting could not be saved." }); }
  }

  function changeMode(mode: GmailPreferences["automationMode"]) {
    if (mode === "unrestricted" && !confirmAutomation()) return;
    void changePreference({ automationMode: mode });
  }

  return <div className="settings-page">
    <header className="settings-page__header"><div><h1>Settings</h1><p>Control how Job Buddy reads email and updates your tracker.</p></div><span>Stored locally</span></header>
    {message && <p className={`settings-page__message settings-page__message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    {busy === "connect" && <button type="button" className="button button--secondary" onClick={() => popupAttempt.current?.abort()}>Stop waiting</button>}
    {!status || !preference
      ? <section className="gmail-settings gmail-settings--loading" aria-busy="true" aria-label="Loading Gmail settings"><div /><div /><div /></section>
      : <GmailSettingsPanel
          status={status} preferences={preference} busy={busy}
          onConnect={() => void connect()} onDisconnect={() => void disconnect()} onInitialScan={() => void initialScan()}
          onDailyChange={(enabled) => void changePreference({ dailyActiveScanEnabled: enabled })}
          onModeChange={changeMode}
          onSourceChange={(selectedSource) => void changePreference({ selectedSource })}
        />}
    <BuddySettings client={buddy} confirmAutomatic={confirmBuddyAutomatic} confirmRevoke={confirmBuddyRevoke} />
  </div>;
}
