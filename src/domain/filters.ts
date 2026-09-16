import type { Application } from "./application";
import { deriveApplicationState, type ApplicationOutcome, type ApplicationStage } from "./stage";

export interface ApplicationFilterState {
  search?: string;
  markets?: string[];
  roleFamilies?: string[];
  industries?: string[];
  workArrangements?: string[];
  companies?: string[];
  sources?: string[];
  stages?: ApplicationStage[];
  outcomes?: (ApplicationOutcome | "active")[];
  priorities?: string[];
  tags?: string[];
  appliedFrom?: string;
  appliedTo?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryPeriod?: string;
  unreadUpdate?: boolean;
  missingData?: boolean;
  followUpDue?: boolean;
  includeArchived?: boolean;
}

export const applicationMarket = (application: Application) => application.market
  ?? (application.location.country === "Singapore" ? "SG" : application.location.country === "Hong Kong" ? "HK" : "US");
export const applicationRoleFamily = (application: Application) => application.roleFamily ?? (application.discipline === "finance" ? "finance" : "software");
export const nextDeadline = (application: Application) => application.deadlines.filter(d => !d.completed).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
export const dateOnly = (value: string) => value.slice(0, 10);

export function matchesApplicationFilters(application: Application, filters: ApplicationFilterState, now = new Date()): boolean {
  if (application.archived && !filters.includeArchived) return false;
  const state = deriveApplicationState(application.stageEvents);
  const choices: [string[] | undefined, string][] = [
    [filters.markets, applicationMarket(application)], [filters.roleFamilies, applicationRoleFamily(application)],
    [filters.industries, application.industry ?? ""], [filters.workArrangements, application.workArrangement ?? ""],
    [filters.companies, application.company], [filters.sources, application.source], [filters.stages, state.stage ?? ""],
    [filters.outcomes, state.outcome ?? "active"], [filters.priorities, application.priority ?? "normal"],
  ];
  if (choices.some(([selected, value]) => selected?.length && !selected.includes(value))) return false;
  if (filters.tags?.some(tag => !application.tags.includes(tag))) return false;
  const searchText = [application.company, application.role, application.industry, applicationRoleFamily(application), applicationMarket(application), application.location.city, application.source, application.recruiter, application.notes, ...application.tags].join(" ").toLowerCase();
  if (filters.search?.trim() && !searchText.includes(filters.search.trim().toLowerCase())) return false;
  const inRange = (value: string, from?: string, to?: string) => (!from || dateOnly(value) >= from) && (!to || dateOnly(value) <= to);
  if (!inRange(application.appliedAt, filters.appliedFrom, filters.appliedTo)) return false;
  if ((filters.deadlineFrom || filters.deadlineTo) && !application.deadlines.some(d => !d.completed && inRange(d.at, filters.deadlineFrom, filters.deadlineTo))) return false;
  const salary = application.research?.salary;
  if (filters.salaryMin !== undefined || filters.salaryMax !== undefined || filters.currency || filters.salaryPeriod) {
    if (!salary || (filters.currency && salary.currency !== filters.currency) || (filters.salaryPeriod && salary.period !== filters.salaryPeriod)) return false;
    if (filters.salaryMin !== undefined && (salary.maximum ?? salary.minimum) < filters.salaryMin) return false;
    if (filters.salaryMax !== undefined && salary.minimum > filters.salaryMax) return false;
  }
  const missing = application.missingData || !application.research || !application.industry || !application.workArrangement || !application.source;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const followUpDue = !state.outcome && (Boolean(application.followUpAt && dateOnly(application.followUpAt) <= today) || application.deadlines.some(d => !d.completed && /follow.?up/i.test(d.label) && dateOnly(d.at) <= today));
  return (filters.unreadUpdate === undefined || Boolean(application.unreadUpdate) === filters.unreadUpdate)
    && (filters.missingData === undefined || Boolean(missing) === filters.missingData)
    && (filters.followUpDue === undefined || followUpDue === filters.followUpDue);
}
