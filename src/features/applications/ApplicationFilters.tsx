import type { Application } from "../../domain/application";
import { priorities, roleFamilies, workArrangements } from "../../domain/application";
import type { ApplicationFilterState } from "../../domain/filters";
import { applicationStages } from "../../domain/stage";

export function ApplicationFilters({ applications, filters, onChange }: { applications: Application[]; filters: ApplicationFilterState; onChange: (filters: ApplicationFilterState) => void }) {
  const update = (key: keyof ApplicationFilterState, value: unknown) => onChange({ ...filters, [key]: value });
  const unique = (values: (string | undefined)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
  const select = (label: string, key: keyof ApplicationFilterState, options: readonly string[]) => <label key={key}>{label}<select aria-label={`${label} filter`} multiple size={2} value={(filters[key] as string[] | undefined) ?? []} onChange={event => update(key, Array.from(event.currentTarget.selectedOptions, option => option.value))}>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
  const input = (label: string, key: keyof ApplicationFilterState, type = "date") => <label key={key}>{label}<input type={type} min={type === "number" ? 0 : undefined} value={(filters[key] as string | number | undefined) ?? ""} onChange={event => update(key, event.target.value === "" ? undefined : type === "number" ? Number(event.target.value) : event.target.value)} /></label>;
  return <section className="application-filters" aria-label="Application filters">
    <div className="application-filters__primary">
      <label className="application-filters__search">Search<input aria-label="Search applications" type="search" placeholder="Role, company, tags, recruiter…" value={filters.search ?? ""} onChange={e => update("search", e.target.value)} /></label>
      {select("Market", "markets", ["SG", "HK"])}
      {select("Role family", "roleFamilies", roleFamilies)}
      {select("Stage", "stages", applicationStages)}
      <button type="button" onClick={() => onChange({})}>Reset filters</button>
    </div>
    <details><summary>More filters</summary><p className="application-help">Filters combine. Hold Ctrl / Command to choose multiple values. All selected tags must match. Salary filters match overlapping ranges in the selected currency and period; no currency conversion.</p><div className="application-filters__extra">
      {select("Outcome", "outcomes", ["active", "rejected", "withdrawn", "expired", "offer_declined", "offer_accepted", "hired"])}
      {select("Industry", "industries", unique(applications.map(a => a.industry)))}
      {select("Work arrangement", "workArrangements", workArrangements)}
      {select("Company", "companies", unique(applications.map(a => a.company)))}
      {select("Source", "sources", unique(applications.map(a => a.source)))}
      {select("Priority", "priorities", priorities)}
      {select("Tags", "tags", unique(applications.flatMap(a => a.tags)))}
      {input("Applied from", "appliedFrom")}{input("Applied through", "appliedTo")}
      {input("Deadline from", "deadlineFrom")}{input("Deadline through", "deadlineTo")}
      {input("Salary minimum", "salaryMin", "number")}{input("Salary maximum", "salaryMax", "number")}
      <label>Currency<select value={filters.currency ?? ""} onChange={e => update("currency", e.target.value)}><option value="">Any currency</option><option>SGD</option><option>HKD</option></select></label>
      <label>Salary period<select value={filters.salaryPeriod ?? ""} onChange={e => update("salaryPeriod", e.target.value)}><option value="">Any period</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
      {([ ["Unread update", "unreadUpdate"], ["Missing data", "missingData"], ["Follow-up due", "followUpDue"] ] as const).map(([label, key]) => <label key={key}>{label}<select value={filters[key] === undefined ? "" : String(filters[key])} onChange={e => update(key, e.target.value === "" ? undefined : e.target.value === "true")}><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
      <label className="application-checkbox"><input type="checkbox" checked={Boolean(filters.includeArchived)} onChange={e => update("includeArchived", e.target.checked)} />Include archived</label>
    </div><p className="application-help">Missing data: unavailable research, industry, work arrangement or source, or a record flagged as incomplete.</p></details>
  </section>;
}
