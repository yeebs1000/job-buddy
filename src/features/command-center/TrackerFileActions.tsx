import { lazy, Suspense, useId, useRef, useState } from "react";
import { applicationRepository } from "../../db/applicationRepository";
const ImportPanel = lazy(() => import("../import-export/TrackerImportPanel").then(m => ({ default: m.TrackerImportPanel })));

export function TrackerFileActions({ onImported }: { onImported?: () => void | Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const exporting = useRef(false), title = useId();
  async function exportAll() {
    if (exporting.current) return;
    exporting.current = true; setBusy(true); setError("");
    try {
      const applications = await applicationRepository.list();
      if (!applications.length) { setError("Add or import an application before exporting."); return; }
      const { downloadTracker } = await import("../import-export/exportTracker");
      await downloadTracker(applications, "xlsx", "all");
    } catch { setError("Could not export Excel. Your saved applications are unchanged."); }
    finally { exporting.current = false; setBusy(false); }
  }
  return <>
    <button ref={trigger} className="button button--secondary" onClick={() => { setOpened(true); dialog.current?.showModal(); }}>Import Excel</button>
    <button className="button button--secondary" disabled={busy} onClick={() => void exportAll()}>{busy ? "Exporting…" : "Export all to Excel"}</button>
    {error && <p role="alert">{error}</p>}
    <dialog className="tracker-import-dialog" ref={dialog} aria-labelledby={title} onClose={() => trigger.current?.focus()}>
      <header><h2 id={title}>Import Excel</h2><button className="button button--secondary" onClick={() => dialog.current?.close()}>Close import</button></header>
      {opened && <Suspense fallback={<p role="status">Opening Excel tools…</p>}><ImportPanel onImported={onImported} /></Suspense>}
    </dialog>
  </>;
}
