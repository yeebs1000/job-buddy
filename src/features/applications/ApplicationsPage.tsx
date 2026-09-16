import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SortingState } from "@tanstack/react-table";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb, type SavedView } from "../../db/database";
import { seedDemoData } from "../../db/seed";
import { savedViewRepository } from "../../db/viewRepository";
import { priorities, roleFamilies, workArrangements, type Application } from "../../domain/application";
import type { Market } from "../../domain/research";
import { matchesApplicationFilters, type ApplicationFilterState } from "../../domain/filters";
import { applicationStages, deriveApplicationState, type ApplicationStage } from "../../domain/stage";
import { ApplicationFilters } from "./ApplicationFilters";
import { ExportControls } from "../import-export/ExportControls";
import { ApplicationTable, defaultVisibleColumns, parseTags, standardColumns } from "./ApplicationTable";
import "./applications.css";

const defaultViews: SavedView[] = [
  { id: "default-active-interviews", name: "Active Interviews", filters: { stages: ["interview", "final"], outcomes: ["active"] }, sort: [{ id: "deadline", desc: false }], visibleColumns: defaultVisibleColumns },
  { id: "default-singapore-software", name: "Singapore Software", filters: { markets: ["SG"], roleFamilies: ["software"] }, sort: [], visibleColumns: defaultVisibleColumns },
  { id: "default-hong-kong-finance", name: "Hong Kong Finance", filters: { markets: ["HK"], roleFamilies: ["finance"] }, sort: [], visibleColumns: defaultVisibleColumns },
  { id: "default-follow-up", name: "Follow Up", filters: { followUpDue: true }, sort: [{ id: "deadline", desc: false }], visibleColumns: defaultVisibleColumns },
  { id: "default-rejected", name: "Rejected", filters: { outcomes: ["rejected"] }, sort: [], visibleColumns: defaultVisibleColumns },
];

async function initialize() {
  await seedDemoData();
  await jobBuddyDb.transaction("rw", jobBuddyDb.savedViews, async () => {
    for (const view of defaultViews) if (!await savedViewRepository.get(view.id)) await savedViewRepository.save(view);
  });
  return { applications: await applicationRepository.list(), views: await savedViewRepository.list() };
}

function NewApplication({ onSave, onCancel, busy }: { onSave: (application: Application) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const [error, setError] = useState("");
  const today = new Date().toLocaleDateString("en-CA");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    if (["company", "role", "industry", "source", "appliedAt"].some(key => !value(key))) { setError("Fill in company, role, industry, source and applied date."); return; }
    const id = crypto.randomUUID();
    const market = value("market") as Market;
    const roleFamily = value("roleFamily") as Application["roleFamily"];
    const appliedAt = new Date(`${value("appliedAt")}T00:00:00Z`).toISOString();
    const country = market === "SG" ? "Singapore" : market === "HK" ? "Hong Kong" : "United States";
    const city = value("city") || (market === "SG" ? "Singapore" : market === "HK" ? "Hong Kong" : "");
    const state = value("state");
    if (!city || (market === "US" && !state)) { setError("Add a city and state for U.S. applications."); return; }
    setError("");
    await onSave({ id, company: value("company"), role: value("role"), industry: value("industry"), market, roleFamily, discipline: roleFamily === "finance" ? "finance" : "software_it", workArrangement: value("workArrangement") as Application["workArrangement"], location: { city, country, ...(state ? { state } : {}) }, source: value("source"), appliedAt, priority: value("priority") as Application["priority"], tags: parseTags(value("tags")), deadlines: [], stageEvents: [{ id: crypto.randomUUID(), applicationId: id, at: appliedAt, toStage: value("stage") as ApplicationStage, origin: "manual", accepted: true }] });
  }
  return <form aria-label="New application" className="application-create" onSubmit={event => void submit(event)}>
    <h2>New application</h2><p>Start with the essentials. Research and deadlines can be added later.</p>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={busy}><legend className="sr-only">Application details</legend><div className="application-form-grid">
      <label>Company<input name="company" required autoFocus maxLength={160} /></label><label>Role<input name="role" required maxLength={160} /></label>
      <label>Market<select name="market"><option>SG</option><option>HK</option><option>US</option></select></label>
      <label>City<input name="city" maxLength={100} placeholder="Auto-filled for SG/HK" /></label>
      <label>State / region<input name="state" maxLength={100} placeholder="Required for U.S." /></label>
      <label>Industry<input name="industry" required maxLength={100} /></label>
      <label>Role family<select name="roleFamily">{roleFamilies.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Work arrangement<select name="workArrangement">{workArrangements.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Source<input name="source" required maxLength={160} /></label><label>Applied date<input name="appliedAt" type="date" required max={today} defaultValue={today} /></label>
      <label>Stage<select name="stage">{applicationStages.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Priority<select name="priority" defaultValue="normal">{priorities.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Tags<input name="tags" placeholder="Comma-separated tags" maxLength={500} /></label>
    </div><div className="application-toolbar"><button className="application-primary" type="submit">Create application</button><button type="button" onClick={onCancel}>Cancel creation</button></div></fieldset>
  </form>;
}

export function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<ApplicationFilterState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewId, setViewId] = useState("");
  const [viewName, setViewName] = useState("");
  const [bulkStage, setBulkStage] = useState<ApplicationStage>("review");
  const [bulkPriority, setBulkPriority] = useState<Application["priority"]>("high");
  const [bulkTag, setBulkTag] = useState("");
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    let active = true;
    void initialize().then(result => { if (active) { setApplications(result.applications); setViews(result.views); setLoading(false); } }, () => { if (active) { setError("Could not load applications. Reload to try again."); setLoading(false); } });
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => applications.filter(a => matchesApplicationFilters(a, filters)), [applications, filters]);
  const selectedVisible = selected.filter(id => filtered.some(a => a.id === id));
  const changeFilters = (next: ApplicationFilterState) => { setFilters(next); setSelected([]); setViewId(""); };
  const run = useCallback(async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setApplications(await applicationRepository.list()); setMessage(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes. Try again."); return false; }
    finally { setBusy(false); }
  }, []);
  const update = useCallback(async (ids: string[], patch: Partial<Pick<Application, "priority" | "tags" | "archived">>) => {
    await run(() => jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => { for (const id of ids) await applicationRepository.update(id, patch); }), `${ids.length} application${ids.length === 1 ? "" : "s"} updated.`);
  }, [run]);
  const changeStage = useCallback(async (ids: string[], stage: ApplicationStage) => {
    await run(() => jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
      for (const id of ids) {
        const application = await applicationRepository.get(id);
        if (!application) throw new Error("An application no longer exists. Reload to continue.");
        const state = deriveApplicationState(application.stageEvents);
        if (state.outcome) throw new Error("Closed applications cannot change stage. Select active applications only.");
        if (state.stage === stage) continue;
        const at = new Date(Math.max(Date.now(), ...application.stageEvents.filter(e => e.accepted).map(e => Date.parse(e.at) + 1))).toISOString();
        await applicationRepository.appendEvent({ id: crypto.randomUUID(), applicationId: id, at, fromStage: state.stage ?? undefined, toStage: stage, accepted: true, origin: "manual" });
      }
    }), "Stage updated.");
  }, [run]);
  const closeCreate = () => { const next = new URLSearchParams(params); next.delete("new"); setParams(next, { replace: true }); };
  async function saveView() {
    if (!viewName.trim()) return;
    if (await run(async () => { await savedViewRepository.save({ id: crypto.randomUUID(), name: viewName.trim(), filters, sort: sorting, visibleColumns }); setViews(await savedViewRepository.list()); }, "View saved.")) setViewName("");
  }
  function restoreView(id: string) {
    setViewId(id); setSelected([]);
    const view = views.find(v => v.id === id);
    if (!view) { setFilters({}); setSorting([]); setVisibleColumns(defaultVisibleColumns); return; }
    setFilters((view.filters ?? {}) as ApplicationFilterState);
    setSorting(Array.isArray(view.sort) ? view.sort as SortingState : []);
    setVisibleColumns([...new Set(["role", "company", ...view.visibleColumns.filter(id => defaultVisibleColumns.includes(id as typeof defaultVisibleColumns[number]))])]);
  }
  return <section className="applications-workspace">
    <header className="applications-heading"><div><h1>Applications</h1><p>Your job search, one working table.</p></div><button className="application-primary" disabled={loading || busy} onClick={() => { const next = new URLSearchParams(params); next.set("new", "1"); setParams(next); }}>Add application</button></header>
    {error && <p role="alert" className="application-error">{error}</p>}
    <p className="application-status" role="status">{loading ? "Loading applications…" : message}</p>
    {params.get("new") === "1" && <NewApplication busy={busy} onCancel={closeCreate} onSave={async application => { if (await run(() => applicationRepository.create(application), "Application created.")) { changeFilters({}); closeCreate(); } }} />}
    {!loading && <>
      <div className="application-toolbar"><Link to="/import">Import tracker</Link></div>
      <ExportControls applications={applications} filtered={filtered} />
      <div className="application-toolbar application-views">
        <label>Saved view<select aria-label="Saved view" value={viewId} onChange={e => restoreView(e.target.value)}><option value="">All applications / custom</option>{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
        <label>View name<input maxLength={80} value={viewName} onChange={e => setViewName(e.target.value)} placeholder="Name this setup" /></label><button disabled={busy || !viewName.trim()} onClick={() => void saveView()}>Save view</button>
        <details className="application-columns"><summary>Columns</summary><div>{standardColumns.map(([id, label]) => <label className="application-checkbox" key={id}><input type="checkbox" checked={visibleColumns.includes(id)} disabled={id === "role" || id === "company"} onChange={e => { setVisibleColumns(e.target.checked ? [...visibleColumns, id] : visibleColumns.filter(v => v !== id)); setViewId(""); }} />{label}</label>)}</div></details>
      </div>
      <ApplicationFilters applications={applications} filters={filters} onChange={changeFilters} />
      <div className="application-toolbar application-count"><strong>{filtered.length} of {applications.length} applications</strong><span>Tags: Enter to save · Escape to cancel</span></div>
      {selectedVisible.length > 0 && <fieldset className="application-bulk" disabled={busy}><legend>{selectedVisible.length} selected</legend><div className="application-toolbar">
        <label>Bulk stage<select value={bulkStage} onChange={e => setBulkStage(e.target.value as ApplicationStage)}>{applicationStages.map(s => <option key={s}>{s}</option>)}</select></label><button onClick={() => void changeStage(selectedVisible, bulkStage)}>Set stage</button>
        <label>Bulk priority<select value={bulkPriority} onChange={e => setBulkPriority(e.target.value as Application["priority"])}>{priorities.map(s => <option key={s}>{s}</option>)}</select></label><button onClick={() => void update(selectedVisible, { priority: bulkPriority })}>Set priority</button>
        <label>Bulk tag<input value={bulkTag} onChange={e => setBulkTag(e.target.value)} /></label><button disabled={!bulkTag.trim()} onClick={() => void run(() => jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => { for (const id of selectedVisible) { const a = await applicationRepository.get(id); if (a) await applicationRepository.update(id, { tags: [...new Set([...a.tags, ...parseTags(bulkTag)])] }); } }), "Tags added.")}>Add tag</button>
        <button onClick={() => void update(selectedVisible, { archived: true })}>Archive selected</button><button onClick={() => setSelected([])}>Clear selection</button>
      </div></fieldset>}
      <ApplicationTable applications={filtered} sorting={sorting} onSort={next => { setSorting(next); setViewId(""); }} visibleColumns={visibleColumns} selected={selectedVisible} onSelect={setSelected} onUpdate={update} onStage={changeStage} busy={busy} />
    </>}
  </section>;
}
