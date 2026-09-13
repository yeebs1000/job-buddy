import type { Application } from "../../domain/application";
import { deriveApplicationState } from "../../domain/stage";
import { trackerColumns, type TrackerField } from "./trackerColumns";

export type ExportFormat = "xlsx" | "csv";
export async function exportTracker(applications: Application[], format: ExportFormat): Promise<ArrayBuffer> {
  const fields = Object.keys(trackerColumns) as TrackerField[];
  const rows = applications.map(a => {
    const { stage, outcome } = deriveApplicationState(a.stageEvents); const salary = a.research?.salary, rating = a.research?.companyRating;
    const values: Partial<Record<TrackerField, unknown>> = { ...a, city: a.location.city, market: a.market ?? (a.location.country === "Singapore" ? "SG" : "HK"), stage: stage ?? "Not started", outcome: outcome ?? "active", salary: salary?.minimum, salaryMax: salary?.maximum, currency: salary?.currency, period: salary?.period, rating: rating?.score, ratingOutOf: rating?.outOf, ratingSource: rating?.source, tags: a.tags.join(";"), deadlines: a.deadlines.length ? JSON.stringify(a.deadlines.map(({ label, at, completed }) => ({ label, at, completed }))) : "", escaped: format === "csv" ? "apostrophe-v1" : "" };
    return fields.map(field => values[field] ?? "");
  });
  const grid = [fields.map(field => trackerColumns[field]), ...rows];
  if (format === "csv") {
    const escape = (v: unknown) => { const s = String(v); const safe = /^(?:[\s]*[=+@\-]|[\t\r'])/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g, '""')}"`; };
    return new TextEncoder().encode("\uFEFF" + grid.map(row => row.map(escape).join(",")).join("\r\n")).buffer as ArrayBuffer;
  }
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(grid), "Applications");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
export async function downloadTracker(applications: Application[], format: ExportFormat, scope: "all" | "filtered") {
  const blob = new Blob([await exportTracker(applications, format)], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = `job-buddy-${scope}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
