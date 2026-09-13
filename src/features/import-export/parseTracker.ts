import * as XLSX from "xlsx";
import { z } from "zod";
import { priorities, roleFamilies, workArrangements, type Application } from "../../domain/application";
import type { ImportPreview, ImportRow, NormalizedApplication } from "../../domain/import";
import { applicationStages, type ApplicationOutcome, type ApplicationStage } from "../../domain/stage";
import { mapHeading, type TrackerField } from "./trackerColumns";

const MAX_ROWS = 2000;
const MAX_COLUMNS = 80;
const text = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => text(value).toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
const outcomes: ApplicationOutcome[] = ["rejected", "withdrawn", "expired", "offer_declined", "offer_accepted", "hired"];
const stageAliases: Record<string, ApplicationStage> = { submitted: "applied", "application submitted": "applied", "in review": "review", "under review": "review", "recruiter review": "review", screening: "review", "online assessment": "assessment", test: "assessment", interviewing: "interview", "first interview": "interview", "final interview": "final", "final round": "final", "offer received": "offer" };
const outcomeAliases: Record<string, ApplicationOutcome> = { unsuccessful: "rejected", declined: "offer_declined", accepted: "offer_accepted", "offer declined": "offer_declined", "offer accepted": "offer_accepted" };
function stage(value: unknown) { const s = key(value); return applicationStages.find(v => v === s) ?? stageAliases[s] ?? null; }
function outcome(value: unknown) { const s = key(value); return outcomes.find(v => key(v) === s) ?? outcomeAliases[s] ?? null; }

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read this local file.")); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(file); });
}
// Explicit quote handling preserves UTF-8, embedded newlines and source row positions.
function readCsv(input: string): unknown[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let closed = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) { if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') { quoted = false; closed = true; } else cell += c; }
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; closed = false; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && input[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; closed = false; }
    else { if (closed && c.trim()) throw new Error("Malformed CSV quoting."); cell += c; }
    if (row.length > MAX_COLUMNS || rows.length > MAX_ROWS + 1) throw new Error("Use at most 2,000 rows and 80 columns per file.");
  }
  if (quoted) throw new Error("Malformed CSV: an unclosed quoted field.");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function date(value: unknown, label: string, errors: string[], required = false): string | undefined {
  if (value === undefined || text(value) === "") { if (required) errors.push(`${label} is required.`); return undefined; }
  let result: string | undefined;
  if (typeof value === "number" && value > 0 && value < 2958466) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts) result = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}T${String(parts.H).padStart(2, "0")}:${String(parts.M).padStart(2, "0")}:${String(parts.S).padStart(2, "0")}Z`;
  } else {
    const raw = text(value);
    if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw)) result = raw.length === 10 ? `${raw}T00:00:00Z` : raw;
    const local = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (local) result = `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}T00:00:00Z`;
  }
  if (result && Number.isFinite(Date.parse(result))) {
    const [y, m, d] = result.slice(0, 10).split("-").map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d) return new Date(result).toISOString();
  }
  errors.push(`${label} is invalid. Use YYYY-MM-DD or DD/MM/YYYY.`); return undefined;
}
function boolean(value: unknown, label: string, errors: string[]): boolean | undefined {
  if (text(value) === "") return undefined;
  if (["true", "yes", "1", "y"].includes(key(value))) return true;
  if (["false", "no", "0", "n"].includes(key(value))) return false;
  errors.push(`${label} must be yes/no or true/false.`); return undefined;
}
const schema = z.object({ company: z.string().min(1, "Company is required."), role: z.string().min(1, "Role is required."), discipline: z.enum(["finance", "software_it"]), market: z.enum(["SG", "HK"]), stage: z.enum(applicationStages).nullable(), roleFamily: z.enum(roleFamilies).optional(), workArrangement: z.enum(workArrangements).optional(), priority: z.enum(priorities).optional() });
function normalize(values: Partial<Record<TrackerField, unknown>>, sourceRow: number): ImportRow {
  const errors: string[] = [], warnings: string[] = [];
  const get = (field: TrackerField) => {
    const raw = String(values[field] ?? "");
    const restored = values.escaped === "apostrophe-v1" && /^'(?:[\s]*[=+@\-]|[\t\r'])/.test(raw) ? raw.slice(1) : raw;
    return field === "notes" ? restored : restored.trim();
  };
  const marketKey = key(values.market || values.city);
  const market = ["sg", "singapore"].includes(marketKey) ? "SG" : ["hk", "hong kong", "hongkong"].includes(marketKey) ? "HK" : undefined;
  const rawFamily = key(values.roleFamily);
  const roleFamily = (rawFamily === "it" ? "IT" : rawFamily === "software engineering" ? "software" : rawFamily || undefined) as Application["roleFamily"];
  const discipline = (get("discipline") || (roleFamily ? roleFamily === "finance" ? "finance" : "software_it" : "")) as Application["discipline"];
  const currentStage = stage(values.stage);
  const currentOutcome = outcome(values.outcome) ?? outcome(values.stage);
  if (get("outcome") && key(values.outcome) !== "active" && !outcome(values.outcome)) errors.push("Outcome is not recognized.");
  if (!currentStage && key(values.stage) !== "not started") errors.push("Stage is required; use Not started when no stage was reached. Terminal statuses also need the reached stage in a separate Stage column.");
  const normalized: NormalizedApplication = { company: get("company"), role: get("role"), discipline, market, location: { city: get("city"), country: market === "SG" ? "Singapore" : "Hong Kong" }, source: get("source"), appliedAt: date(values.appliedAt, "Applied date", errors, true) ?? "", stage: currentStage, outcome: currentOutcome, tags: [...new Set(get("tags").split(/[;,]/).map(v => v.trim()).filter(Boolean))], deadlines: [] };
  if (!market) errors.push("Market is required: SG/Singapore or HK/Hong Kong.");
  if (!discipline) errors.push("Role Family or Discipline is required (finance, software, data, cybersecurity, cloud or IT).");
  if (roleFamily) normalized.roleFamily = roleFamily;
  for (const field of ["industry", "workArrangement", "priority", "recruiter", "notes", "interviewSubtype"] as const) if (get(field)) Object.assign(normalized, { [field]: ["workArrangement", "priority", "interviewSubtype"].includes(field) ? key(get(field)) : get(field) });
  for (const field of ["archived", "unreadUpdate", "missingData"] as const) { const v = boolean(values[field], field, errors); if (v !== undefined) normalized[field] = v; }
  const followUpAt = date(values.followUpAt, "Follow up", errors); if (followUpAt) normalized.followUpAt = followUpAt;
  if (get("targetStage")) { const target = stage(values.targetStage); if (target) normalized.targetStage = target; else errors.push("Target stage is invalid."); }
  if (normalized.interviewSubtype && !["phone", "video", "technical", "case", "onsite", "final"].includes(normalized.interviewSubtype)) errors.push("Interview type is invalid.");
  if (get("jobUrl")) { try { const url = new URL(get("jobUrl")); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(); normalized.jobUrl = get("jobUrl"); } catch { warnings.push("Link is not a valid http/https URL and will be omitted."); } }
  const salaryText = get("salary");
  if (["salary", "salaryMax", "currency", "period"].some(f => get(f as TrackerField))) {
    const range = salaryText.toUpperCase().replace(/SGD|HKD|S\$|HK\$/g, "").replace(/,/g, "").trim().split(/\s*[–—-]\s*/);
    const minimum = range[0] ? Number(range[0]) : NaN;
    const maxText = get("salaryMax") || range[1]; const maximum = maxText ? Number(maxText.replace(/,/g, "")) : undefined;
    const currency = (get("currency").toUpperCase() || (salaryText.match(/SGD|HKD/i)?.[0].toUpperCase()) || (salaryText.includes("HK$") ? "HKD" : salaryText.includes("S$") ? "SGD" : "")) as "SGD" | "HKD";
    const periodKey = key(values.period); const period = (["yearly", "year", "per year"].includes(periodKey) ? "annual" : ["month", "per month"].includes(periodKey) ? "monthly" : periodKey) as "monthly" | "annual";
    if (!Number.isFinite(minimum) || minimum < 0 || (maximum !== undefined && (!Number.isFinite(maximum) || maximum < minimum)) || range.length > 2) errors.push("Salary must be a non-negative amount or ascending range.");
    else if (!["SGD", "HKD"].includes(currency) || !["monthly", "annual"].includes(period)) errors.push("Salary needs an explicit SGD/HKD currency and monthly/annual pay period.");
    else normalized.research = { salary: { minimum, ...(maximum !== undefined ? { maximum } : {}), currency, period } };
  }
  if (["rating", "ratingOutOf", "ratingSource"].some(f => get(f as TrackerField))) {
    const score = Number(get("rating")), outOf = Number(get("ratingOutOf"));
    if (!get("rating") || !Number.isFinite(score) || score < 0 || !Number.isFinite(outOf) || outOf <= 0 || score > outOf || !get("ratingSource")) errors.push("Company rating needs a valid score, scale and source.");
    else normalized.research = { ...normalized.research, companyRating: { score, outOf, source: get("ratingSource") } };
  }
  if (get("deadlines")) {
    try {
      const parsed: unknown = JSON.parse(get("deadlines"));
      const deadlineSchema = z.array(z.object({ label: z.string().min(1), at: z.string(), completed: z.boolean() })).max(100);
      const validated = deadlineSchema.parse(parsed);
      normalized.deadlines = validated.map(d => ({ ...d, id: crypto.randomUUID(), at: date(d.at, "Deadline", errors, true) ?? "" }));
    } catch { errors.push("Deadlines JSON must contain dates, labels and completed booleans."); }
  } else if (get("deadline")) { const at = date(values.deadline, "Deadline", errors); if (at) normalized.deadlines = [{ id: crypto.randomUUID(), label: get("deadlineLabel") || "Deadline", at, completed: false }]; }
  const validation = schema.safeParse(normalized);
  if (!validation.success) errors.push(...validation.error.issues.map(i => `${i.path.join(" ")}: ${i.message}`));
  return { sourceRow, normalized, errors: [...new Set(errors)], warnings, duplicateReasons: [], included: errors.length === 0 };
}
export const duplicateKey = (application: Pick<Application, "company" | "role" | "appliedAt">) => [key(application.company), key(application.role), application.appliedAt.slice(0, 10)].join("\u0000");

export async function parseTracker(file: File, existing: Pick<Application, "company" | "role" | "appliedAt">[] = []): Promise<ImportPreview> {
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Choose a local .xlsx or UTF-8 .csv file.");
  if (!file.size) throw new Error("The file is empty.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Use a file smaller than 5 MB.");
  const bytes = new Uint8Array(await readFile(file)); let grid: unknown[][]; const warnings: string[] = []; let date1904 = false;
  if (/\.csv$/i.test(file.name)) {
    let content: string; try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("CSV must use UTF-8 encoding."); }
    grid = readCsv(content.replace(/^\uFEFF/, ""));
  } else {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This is not a valid .xlsx workbook.");
    let book: XLSX.WorkBook;
    try { book = XLSX.read(bytes, { type: "array", cellFormula: true, bookVBA: true, cellHTML: false, bookDeps: false }); } catch { throw new Error("Could not read this .xlsx workbook."); }
    if (book.vbaraw) throw new Error("Macro content is not supported. Export a values-only workbook.");
    date1904 = Boolean(book.Workbook?.WBProps?.date1904);
    for (const sheet of Object.values(book.Sheets)) {
      for (const [address, cell] of Object.entries(sheet)) if (!address.startsWith("!") && cell && typeof cell === "object" && "f" in cell) throw new Error("Workbook formulas are not supported. Export values only.");
      if (sheet["!ref"]) { const range = XLSX.utils.decode_range(sheet["!ref"]); if (range.e.r >= MAX_ROWS + 1 || range.e.c >= MAX_COLUMNS) throw new Error("Use at most 2,000 rows and 80 columns per sheet."); }
    }
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) throw new Error("The workbook is empty.");
    if (book.SheetNames.length > 1) warnings.push(`Only the first worksheet (${book.SheetNames[0]}) is previewed.`);
    grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true, range: 0 });
  }
  const headerIndex = grid.findIndex(row => row.some(v => text(v)));
  if (headerIndex < 0) throw new Error("The file is empty.");
  const headers = grid[headerIndex].map(text);
  const mapping = headers.map(source => ({ source, field: mapHeading(source) }));
  const mapped = mapping.flatMap(m => m.field ? [m.field] : []);
  if (new Set(mapped).size !== mapped.length) throw new Error("Multiple columns map to the same field. Rename or remove duplicate headings before importing.");
  if (!mapped.includes("company") || !mapped.includes("role")) throw new Error("Include Company and Role (or Title) column headings.");
  if (mapping.some(m => m.source && !m.field)) warnings.push("Unmapped columns will be omitted. Review the mapping below.");
  const rows = grid.slice(headerIndex + 1).flatMap((cells, index) => {
    if (!cells.some(v => text(v))) return [];
    const values: Partial<Record<TrackerField, unknown>> = {};
    mapping.forEach((m, column) => { if (m.field) values[m.field] = date1904 && ["appliedAt", "followUpAt", "deadline"].includes(m.field) && typeof cells[column] === "number" ? cells[column] + 1462 : cells[column]; });
    return [normalize(values, headerIndex + index + 2)];
  });
  if (!rows.length) throw new Error("No application rows were found below the headings.");
  if (rows.length > MAX_ROWS || headers.length > MAX_COLUMNS) throw new Error("Use at most 2,000 rows and 80 columns per file.");
  const known = new Set(existing.map(duplicateKey)), seen = new Map<string, number>();
  for (const row of rows) {
    const k = duplicateKey(row.normalized);
    if (known.has(k)) row.duplicateReasons.push("Matches an existing application (company, role and applied date).");
    if (seen.has(k)) row.duplicateReasons.push(`Matches row ${seen.get(k)} in this file (company, role and applied date).`);
    else seen.set(k, row.sourceRow);
    if (row.duplicateReasons.length) row.included = false;
  }
  return { filename: file.name, mapping, warnings, rows };
}
