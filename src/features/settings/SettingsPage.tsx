import { useEffect, useState } from "react";
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
  navigateExternal?: (url: string) => void;
  confirmAutomation?: () => boolean;
  confirmDisconnect?: () => boolean;
  buddy?: BuddyClient;
  confirmBuddyAutomatic?: () => boolean;
  confirmBuddyRevoke?: () => boolean;
}

const liveMail = new GmailMailAdapter();

export function SettingsPage({
  client = gmailClient,
  preferences: preferenceStore = gmailPreferences,
  mailAdapter = liveMail,
  scan = runMailScan,
  navigateExternal = (url) => window.location.assign(url),
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
        if (callback === "connected") setMessage({ tone: "status", text: "Gmail connected. Confirm the first scan when you are ready." });
        if (callback === "error") setMessage({ tone: "error", text: "Gmail connection could not be completed. Check the OAuth setup and try again." });
      }
    });
    return () => { mounted = false; };
  }, [client, preferenceStore]);

  async function save(next: GmailPreferences) {
    await preferenceStore.save(next);
    setPreference(next);
  }

  async function connect() {
    setBusy("connect"); setMessage(null);
    try { navigateExternal((await client.start()).authorizationUrl); }
    catch { setMessage({ tone: "error", text: "Gmail connection could not start. Check your local OAuth setup and try again." }); setBusy(null); }
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
