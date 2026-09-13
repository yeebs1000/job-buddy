import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { applicationRepository } from "../../db/applicationRepository";
import type { ImportPreview, NormalizedApplication } from "../../domain/import";
import { parseTracker } from "./parseTracker";
import { confirmImport } from "./confirmImport";
import { trackerColumns, type TrackerField } from "./trackerColumns";
import "./import-export.css";

function RowFields({ application: a }: { application: NormalizedApplication }) {
  const salary = a.research?.salary, rating = a.research?.companyRating;
  const yesNo = (v?: boolean) => v === undefined ? "Unavailable" : v ? "Yes" : "No";
  const fields: [string, string | undefined][] = [
    ["Industry", a.industry], ["Role family", a.roleFamily], ["Discipline", a.discipline?.replace("_", " / ")], ["Location", a.location.city], ["Work arrangement", a.workArrangement], ["Source", a.source], ["Priority", a.priority], ["Contact", a.recruiter], ["Job link", a.jobUrl], ["Tags", a.tags.join(" · ")],
    ["Salary", salary ? `${salary.currency} ${salary.minimum.toLocaleString("en-US")}${salary.maximum !== undefined ? `–${salary.maximum.toLocaleString("en-US")}` : ""} / ${salary.period}` : undefined], ["Company rating", rating ? `${rating.score} / ${rating.outOf} · ${rating.source}` : undefined], ["Follow up", a.followUpAt], ["Interview type", a.interviewSubtype], ["Target stage", a.targetStage], ["Archived", yesNo(a.archived)], ["Unread update", yesNo(a.unreadUpdate)], ["Missing data", yesNo(a.missingData)], ["Deadlines", a.deadlines.map(d => `${d.label}: ${d.at} (${d.completed ? "completed" : "open"})`).join("\n")], ["Notes", a.notes],
  ];
  return <dl className="tracker-row-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Unavailable"}</dd></div>)}</dl>;
}

export function ImportTrackerPage() {
  const [preview, setPreview] = useState<ImportPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const rows = preview?.rows ?? [];
  const valid = rows.filter(row => !row.errors.length).length;
  const included = rows.filter(row => row.included && !row.errors.length && row.result !== "imported").length;
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setPreview(undefined); setConfirmed(false); setExpanded([]);
    try { setPreview(await parseTracker(file, await applicationRepository.list())); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not preview this tracker. Try again."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview || !included || busy) return;
    setBusy(true); setError("");
    try { setPreview(await confirmImport(preview)); setConfirmed(true); }
    catch { setError("Import could not finish. Review the row results before retrying."); }
    finally { setBusy(false); }
  }
  return <section className="tracker-workspace" aria-busy={busy}>
    <header className="tracker-heading"><div><h1>Import tracker</h1><p>Bring your applications over from Excel. Review every row before saving.</p></div><Link to="/applications">Back to applications</Link></header>
    <div className="tracker-upload">
      <label htmlFor="tracker-file">Tracker file</label>
      <input id="tracker-file" type="file" accept=".xlsx,.csv" disabled={busy} aria-describedby="tracker-file-help" onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
      <p id="tracker-file-help">Local .xlsx or UTF-8 .csv · Up to 5 MB and 2,000 rows. Use values only; workbook formulas and macros are not supported.</p>
      <details><summary>Preparing your spreadsheet</summary><p>Include Company, Role (or Title), Stage, Date Applied, Market and Role Family (or Discipline). Use SG/Singapore or HK/Hong Kong. Dates use YYYY-MM-DD or DD/MM/YYYY. For rejected or withdrawn applications, keep the reached Stage and add an Outcome column.</p><p>Salary needs SGD/HKD and a monthly/annual Pay Period. Optional fields stay unavailable when absent. Unmapped columns are omitted; rename headings in your file to match before importing.</p></details>
    </div>
    {error && <p role="alert" className="tracker-error">{error}</p>}
    <p role="status" className="tracker-status">{busy ? "Working locally…" : confirmed ? `${rows.filter(row => row.result === "imported").length} imported · ${rows.filter(row => row.result === "failed").length} failed. Review results below.` : preview ? `Preview ready: ${preview.filename}. Nothing has been saved.` : "Choose a file to preview. Nothing is saved until you confirm."}</p>
    {preview && <>
      <details className="tracker-mapping"><summary>Column mapping · {preview.mapping.filter(m => m.field).length} recognized</summary><dl>{preview.mapping.map((m, i) => <div key={i}><dt>{m.source || "Blank heading"}</dt><dd>{m.field ? trackerColumns[m.field as TrackerField] : "Not imported"}</dd></div>)}</dl></details>
      {preview.warnings.map(w => <p key={w} className="tracker-warning">{w}</p>)}
      <div className="tracker-review-heading"><h2>Review applications</h2><p>{valid} valid · {rows.length - valid} invalid · {rows.filter(row => row.duplicateReasons.length).length} duplicates · {included} included</p></div>
      <p className="tracker-guidance">Duplicates start excluded. Check Include to keep both intentionally. Correct invalid rows in your file and upload it again.</p>
      <div className="tracker-preview-scroll" role="region" aria-label="Import preview, scroll horizontally for all columns" tabIndex={0}>
        <table className="tracker-preview"><caption className="sr-only">Normalized applications with inclusion controls, validation and import results</caption><thead><tr><th>Include</th><th>Application</th><th>Stage / outcome</th><th>Market / applied</th><th>All fields</th><th>Review / result</th></tr></thead>
          <tbody>{rows.map(row => <Fragment key={row.sourceRow}><tr>
            <td><label><input type="checkbox" aria-label={`Include row ${row.sourceRow}`} checked={row.included} disabled={busy || Boolean(row.errors.length) || row.result === "imported"} onChange={event => setPreview({ ...preview, rows: rows.map(item => item.sourceRow === row.sourceRow ? { ...item, included: event.target.checked } : item) })} />Row {row.sourceRow}</label></td>
            <td><strong>{row.normalized.company || "Company missing"}</strong><span>{row.normalized.role || "Role missing"}</span></td>
            <td>{row.normalized.stage ?? (row.errors.length ? "Stage missing" : "Not started")}<span>{row.normalized.outcome ?? "Active"}</span></td>
            <td>{row.normalized.market ?? "Market missing"}<span>{row.normalized.appliedAt.slice(0, 10) || "Date missing"}</span></td>
            <td><button className="tracker-fields-toggle" aria-expanded={expanded.includes(row.sourceRow)} aria-controls={`tracker-row-${row.sourceRow}-fields`} onClick={() => setExpanded(expanded.includes(row.sourceRow) ? expanded.filter(n => n !== row.sourceRow) : [...expanded, row.sourceRow])}>View row {row.sourceRow} fields</button></td>
            <td>{row.result === "imported" ? <><strong>Imported</strong><Link to={`/applications/${row.applicationId}`}>Open application</Link></> : <>{row.errors.map(e => <p className="tracker-error-text" key={e}>{e}</p>)}{row.duplicateReasons.map(r => <p key={r}>{r}</p>)}{row.warnings.map(w => <p key={w}>{w}</p>)}{row.importError && <p className="tracker-error-text">Failed: {row.importError}</p>}{!row.errors.length && !row.duplicateReasons.length && !row.warnings.length && !row.importError && "Ready to import"}</>}</td>
          </tr>{expanded.includes(row.sourceRow) && <tr id={`tracker-row-${row.sourceRow}-fields`}><td colSpan={6}><RowFields application={row.normalized} /></td></tr>}</Fragment>)}</tbody>
        </table>
      </div>
    </>}
    <div className="tracker-confirm"><button className="tracker-primary" disabled={busy || !included} onClick={() => void confirm()}>Confirm import{included ? ` (${included})` : ""}</button><p>Only included, valid rows are saved to this browser.</p></div>
    <details className="tracker-standard-fields"><summary>Standard import and export fields</summary><p>{Object.values(trackerColumns).filter(label => label !== "Text Escaping").join(" · ")}</p><p>Exports keep ISO dates, explicit currency and pay period, archive state, and semicolon-separated tags. Deadlines JSON preserves multiple dates, labels and completion state. CSV text escaping protects formula-like text and is reversed when reimported here. Internal event history and identifiers are excluded.</p></details>
  </section>;
}
