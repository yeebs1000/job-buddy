import { useEffect, useRef, useState } from "react";
import { isWebMode } from "../../app/runtimeMode";
import { profileClient, type ProfileClient } from "../profile/profileClient";
import { backupByteLimit, decryptBackup, encryptBackup } from "./backupCrypto";
import { readWorkspaceBackup, restoreWorkspaceBackup } from "./workspaceBackup";
import { parseWorkspaceBackup, type WorkspaceBackup } from "./workspaceSchema";
import "./backup.css";

export function BackupControls({ client = profileClient }: { client?: ProfileClient }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WorkspaceBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profileFailed, setProfileFailed] = useState(false);
  const [trackerOnly, setTrackerOnly] = useState(false);
  const active = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "Could not complete this action. Your saved data is unchanged."); }
    finally { if (active.current) setBusy(false); }
  }
  async function download() {
    if (password !== confirmation) throw new Error("Passphrases must match.");
    if (password.length < 12 || password.length > 1024) throw new Error("Use a backup passphrase of 12–1024 characters.");
    let profile;
    if (!(profileFailed && trackerOnly)) {
      try {
        const response = await client.get();
        if (!response.platformSupported) throw new Error("Unsupported storage");
        profile = response.hasProfile ? response.profile : null;
      } catch {
        if (active.current) { setProfileFailed(true); setTrackerOnly(false); }
        throw new Error("Your profile could not be read. Retry, or explicitly choose a tracker-only backup below.");
      }
    }
    if (!active.current) return;
    const snapshot = await readWorkspaceBackup(profileFailed && trackerOnly ? null : isWebMode && client === profileClient ? undefined : profile ?? null);
    const bytes = await encryptBackup(snapshot, password);
    if (!active.current) return;
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const anchor = document.createElement("a");
    try {
      anchor.href = url; anchor.download = `job-buddy-${new Date().toISOString().slice(0, 10)}.jobbuddy`;
      document.body.append(anchor); anchor.click();
    } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    setPassword(""); setConfirmation("");
    setMessage(`Backup download started. ${snapshot.manifest.profileIncluded ? "Profile included." : "Tracker only — profile not included."} Keep the file and its passphrase safe.`);
  }
  function selectFile(next: File | null) {
    setPreview(null); setImportPassword(""); setError(""); setMessage(""); setFile(null);
    if (next && next.size > backupByteLimit) { setError("Backup is too large (maximum 50 MiB)."); return; }
    setFile(next);
  }
  async function review() {
    if (!file) throw new Error("Choose a backup file first.");
    const parsed = parseWorkspaceBackup(await decryptBackup(new Uint8Array(await file.arrayBuffer()), importPassword));
    if (active.current) { setPreview(parsed); setImportPassword(""); }
  }
  async function restore() {
    if (!preview) return;
    await restoreWorkspaceBackup(preview);
    if (!active.current) return;
    setPreview(null); setFile(null); setImportPassword("");
    if (fileInput.current) fileInput.current.value = "";
    setMessage("Workspace restored. Your applications and profile are ready in this browser. Gmail remains disconnected.");
    window.dispatchEvent(new Event("job-buddy-mail-updated"));
  }
  async function retainStorage() {
    if (!navigator.storage?.persist) { setMessage("This browser does not offer persistent storage. Keep a backup."); return; }
    const granted = await navigator.storage.persist();
    if (active.current) setMessage(granted ? "Browser persistence enabled. Clearing site data can still erase this workspace; keep a backup." : "The browser did not grant persistence. Saving still works; keep a backup.");
  }

  return <section className="backup-controls" aria-labelledby="backup-title">
    <header><h2 id="backup-title">Data and backup</h2><p>{isWebMode ? "Your tracker and profile stay in this browser, not in a cloud account." : "Transfer your local tracker and profile to the web app with an encrypted backup."} Clearing site data can erase browser records.</p></header>
    {error && <p role="alert" className="backup-controls__error">{error}</p>}
    {message && <p role="status">{message}</p>}
    <fieldset disabled={busy}><legend>Back up workspace</legend>
      <p>Includes saved email evidence and personal profile details. The file is encrypted; its passphrase cannot be recovered. Gmail credentials and original resume files are never included.</p>
      {!isWebMode && <p>The companion profile is captured separately from the tracker. Avoid editing it in another window during export.</p>}
      <div className="backup-controls__fields">
        <label>Backup passphrase<input type="password" autoComplete="new-password" maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>Confirm passphrase<input type="password" autoComplete="new-password" maxLength={1024} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      </div>
      {profileFailed && <label><input type="checkbox" checked={trackerOnly} onChange={e => setTrackerOnly(e.target.checked)} /> I accept a tracker-only backup without my profile</label>}
      <button className="button button--primary" type="button" onClick={() => void run(download)}>{busy ? "Working…" : "Download encrypted backup"}</button>
    </fieldset>
    {isWebMode && <fieldset disabled={busy}><legend>Restore to an empty workspace</legend>
      <p>Preview the file before restoring. Existing workspaces are never overwritten. Your original local data stays where it is.</p>
      <label>Backup file<input ref={fileInput} type="file" accept=".jobbuddy" onChange={e => selectFile(e.target.files?.[0] ?? null)} /></label>
      {!preview && <><label>Backup file passphrase<input type="password" autoComplete="off" maxLength={1024} value={importPassword} onChange={e => setImportPassword(e.target.value)} /></label><button className="button button--secondary" disabled={!file || !importPassword} onClick={() => void run(review)}>Preview backup</button></>}
      {preview && <div aria-label="Backup preview"><h3>Ready to review</h3><p>{preview.manifest.counts.applications} application{preview.manifest.counts.applications === 1 ? "" : "s"} · {preview.manifest.counts.stageEvents} history event{preview.manifest.counts.stageEvents === 1 ? "" : "s"} · {preview.manifest.counts.updateProposals} email update{preview.manifest.counts.updateProposals === 1 ? "" : "s"} · {preview.manifest.profileIncluded ? "Profile included" : "No profile"}</p>
        <details><summary>All record counts</summary><dl>{Object.entries(preview.manifest.counts).map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count}</dd></div>)}</dl></details>
        <p>Gmail must be reconnected. Automatic scans and auto-approval will be off.</p>
        <div className="backup-controls__actions"><button className="button button--primary" onClick={() => void run(restore)}>Restore workspace</button><button className="button button--secondary" onClick={() => { setPreview(null); setImportPassword(""); }}>Cancel preview</button></div>
      </div>}
    </fieldset>}
    {isWebMode && <button className="button button--secondary" disabled={busy} onClick={() => void run(retainStorage)}>Ask browser to retain data</button>}
  </section>;
}
