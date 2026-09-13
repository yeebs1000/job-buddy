import { useMemo } from "react";
import { Link } from "react-router-dom";
import { flexRender, type SortingState } from "@tanstack/react-table";
import { useLegacyTable, getSortedRowModel, type LegacyColumnDef } from "@tanstack/react-table/legacy";
import { StageRail } from "../../components/StageRail";
import { priorities, type Application } from "../../domain/application";
import { applicationMarket, applicationRoleFamily, dateOnly, nextDeadline } from "../../domain/filters";
import { applicationStages, deriveApplicationState, type ApplicationStage } from "../../domain/stage";

export const standardColumns = [ ["role", "Role"], ["company", "Company"], ["stage", "Stage"], ["priority", "Priority"], ["market", "Market"], ["industry", "Industry"], ["roleFamily", "Role family"], ["location", "Location"], ["workArrangement", "Work arrangement"], ["outcome", "Outcome"], ["appliedAt", "Applied date"], ["lastActivity", "Last activity"], ["nextAction", "Next action"], ["deadline", "Deadline"], ["source", "Source"], ["salary", "Salary"], ["companyRating", "Company rating"], ["tags", "Tags"] ] as const;
export const defaultVisibleColumns = standardColumns.map(([id]) => id);
export const parseTags = (text: string) => [...new Set(text.split(",").map(tag => tag.trim()).filter(Boolean))];
type Patch = Partial<Pick<Application, "priority" | "tags" | "archived">>;
interface Props {
  applications: Application[];
  sorting: SortingState;
  onSort: (sorting: SortingState) => void;
  visibleColumns: string[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onUpdate: (ids: string[], patch: Patch) => Promise<void>;
  onStage: (ids: string[], stage: ApplicationStage) => Promise<void>;
  busy: boolean;
}

function nextAction(application: Application) {
  const deadline = nextDeadline(application);
  if (application.followUpAt && !deriveApplicationState(application.stageEvents).outcome
    && (!deadline || Date.parse(application.followUpAt) <= Date.parse(deadline.at))) {
    return { label: "Follow up", at: application.followUpAt };
  }
  return deadline;
}

export function ApplicationTable({ applications, sorting, onSort, visibleColumns, selected, onSelect, onUpdate, onStage, busy }: Props) {
  const columns = useMemo<LegacyColumnDef<Application>[]>(() => {
    const textValues: Record<string, (a: Application) => string | number> = {
      role: a => a.role, company: a => a.company, industry: a => a.industry ?? "Unknown", roleFamily: applicationRoleFamily, market: applicationMarket,
      location: a => a.location.city, workArrangement: a => a.workArrangement ?? "Unknown", stage: a => deriveApplicationState(a.stageEvents).stage ?? "", outcome: a => deriveApplicationState(a.stageEvents).outcome ?? "active",
      appliedAt: a => dateOnly(a.appliedAt), lastActivity: a => dateOnly([...a.stageEvents.filter(e => e.accepted).map(e => e.at), "updatedAt" in a && typeof a.updatedAt === "string" ? a.updatedAt : a.appliedAt].sort().at(-1)!),
      nextAction: a => nextAction(a)?.label ?? "—", deadline: a => nextAction(a) ? dateOnly(nextAction(a)!.at) : "—", source: a => a.source,
      salary: a => a.research ? `${a.research.salary.currency} ${a.research.salary.minimum.toLocaleString()}${a.research.salary.maximum ? `–${a.research.salary.maximum.toLocaleString()}` : ""} / ${a.research.salary.period}` : "Unavailable",
      companyRating: a => a.research ? `${a.research.companyRating.score}/${a.research.companyRating.outOf} · ${a.research.companyRating.source}` : "Unavailable",
      priority: a => a.priority ?? "normal", tags: a => a.tags.join(", "),
    };
    return standardColumns.map(([id, header]) => ({ id, header, sortDescFirst: false, sortUndefined: "last",
      accessorFn: a => id === "salary" ? a.research?.salary.minimum : id === "stage" ? applicationStages.indexOf(deriveApplicationState(a.stageEvents).stage as ApplicationStage) : id === "priority" ? priorities.indexOf(a.priority ?? "normal") : textValues[id](a),
      sortFn: id === "salary" ? (left, right) => {
        const a = left.original.research?.salary;
        const b = right.original.research?.salary;
        if (!a || !b) return 0;
        return a.currency.localeCompare(b.currency) || a.period.localeCompare(b.period) || a.minimum - b.minimum;
      } : "auto",
      cell: ({ row }) => {
      const a = row.original;
      if (id === "role") return <Link to={`/applications/${a.id}`}>{a.role}</Link>;
      if (id === "company") return <><strong>{a.company}</strong>{a.archived && <small>Archived</small>}</>;
      if (id === "stage") {
        const state = deriveApplicationState(a.stageEvents);
        return <div className="application-stage"><StageRail compact stage={state.stage} outcome={state.outcome} rejectedAtStage={state.stage ?? undefined} /><select aria-label={`Stage for ${a.company}`} value={state.stage ?? ""} disabled={busy || Boolean(state.outcome)} onChange={e => void onStage([a.id], e.target.value as ApplicationStage)}><option value="" disabled>Not started</option>{applicationStages.map(stage => <option key={stage}>{stage}</option>)}</select></div>;
      }
      if (id === "priority") return <select aria-label={`Priority for ${a.company}`} value={a.priority ?? "normal"} disabled={busy} onChange={e => void onUpdate([a.id], { priority: e.target.value as Application["priority"] })}>{priorities.map(priority => <option key={priority}>{priority}</option>)}</select>;
      if (id === "tags") return <input key={a.tags.join(",")} aria-label={`Tags for ${a.company}`} defaultValue={a.tags.join(", ")} disabled={busy} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = a.tags.join(", "); e.currentTarget.blur(); } }} onBlur={e => { const tags = parseTags(e.currentTarget.value); if (tags.join(",") !== a.tags.join(",")) void onUpdate([a.id], { tags }); }} />;
      return textValues[id](a);
    }}));
  }, [onUpdate, onStage, busy]);
  const visibility = Object.fromEntries(standardColumns.map(([id]) => [id, visibleColumns.includes(id)]));
  const table = useLegacyTable({ data: applications, columns, state: { sorting, columnVisibility: visibility }, onSortingChange: updater => onSort(typeof updater === "function" ? updater(sorting) : updater), getSortedRowModel: getSortedRowModel(), getRowId: row => row.id });
  const allSelected = applications.length > 0 && applications.every(a => selected.includes(a.id));
  return <div className="application-table-scroll" role="region" aria-label="Applications table, scroll horizontally for all columns" tabIndex={0}>
    <table className="application-table"><caption className="sr-only">Applications. Sort with column headers. Edit stage, priority and tags directly.</caption>
      <thead>{table.getHeaderGroups().map(group => <tr key={group.id}><th className="application-select"><input aria-label="Select all visible applications" type="checkbox" checked={allSelected} disabled={busy || !applications.length} onChange={e => onSelect(e.target.checked ? applications.map(a => a.id) : [])} /></th>{group.headers.map(header => <th key={header.id} data-column={header.column.id} aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none"}><button onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}</button></th>)}</tr>)}</thead>
      <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}><td className="application-select"><input aria-label={`Select ${row.original.company}`} type="checkbox" disabled={busy} checked={selected.includes(row.id)} onChange={e => onSelect(e.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} /></td>{row.getVisibleCells().map(cell => <td key={cell.id} data-column={cell.column.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
    </table>{!applications.length && <p className="application-table-empty">No applications match these filters.</p>}
  </div>;
}
