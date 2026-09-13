import { useState } from "react";
import type { Application } from "../../domain/application";
import { downloadTracker, type ExportFormat } from "./exportTracker";
import "./import-export.css";

export function ExportControls({ applications, filtered }: { applications: Application[]; filtered: Application[] }) {
  const [scope, setScope] = useState<"all" | "filtered">("filtered");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [error, setError] = useState("");
  const chosen = scope === "all" ? applications : filtered;
  return <div className="tracker-export"><div className="application-toolbar">
    <label>Export scope<select value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="filtered">Current filtered set ({filtered.length})</option><option value="all">All applications, including archived ({applications.length})</option></select></label>
    <label>Export format<select value={format} onChange={e => setFormat(e.target.value as ExportFormat)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">UTF-8 CSV (.csv)</option></select></label>
    <button disabled={!chosen.length} onClick={() => { setError(""); try { downloadTracker(chosen, format, scope); } catch { setError("Could not generate this download. Try again."); } }}>Download tracker</button>
  </div>{error && <p role="alert">{error}</p>}</div>;
}
