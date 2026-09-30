import type { Application, Deadline } from "../../domain/application";
import { applicationStages, deriveApplicationState, type ApplicationStage } from "../../domain/stage";

export type StageSummary = Record<ApplicationStage, number>;

export interface NextAction {
  application: Application;
  deadline?: Deadline;
  followUpAt?: string;
  reason: string;
}

function dayStart(date: Date): number {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Singapore", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return Date.UTC(value("year"), value("month") - 1, value("day"));
}

function singaporeTime(value: string): string {
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value))} SGT`;
}

function deadlineReason(action: Pick<Deadline, "at" | "label">, now: Date): { priority: number; reason: string } {
  const due = dayStart(new Date(action.at));
  const today = dayStart(now);
  const daysAway = (due - today) / 86_400_000;

  if (daysAway < 0) return { priority: 0, reason: `Overdue: ${action.label} · ${singaporeTime(action.at)}` };
  if (daysAway === 0) return { priority: 1, reason: `Today: ${action.label} · ${singaporeTime(action.at)}` };
  if (daysAway === 1) return { priority: 2, reason: `Tomorrow: ${action.label} · ${singaporeTime(action.at)}` };
  return { priority: 3, reason: `Due ${new Intl.DateTimeFormat("en", { timeZone: "Asia/Singapore", month: "short", day: "numeric" }).format(new Date(action.at))}: ${action.label} · ${singaporeTime(action.at)}` };
}

export function summarizeStages(applications: Application[]): StageSummary {
  const summary = Object.fromEntries(applicationStages.map((stage) => [stage, 0])) as StageSummary;

  for (const application of applications) {
    const { outcome, stage } = deriveApplicationState(application.stageEvents);
    if (!outcome && stage) summary[stage] += 1;
  }

  return summary;
}

export function rankNextActions(applications: Application[], deadlines: Deadline[], now: Date): NextAction[] {
  return applications.map((application) => {
    const deadline = deadlines
      .filter((candidate) => application.deadlines.some((nested) => nested.id === candidate.id && !nested.completed) && !candidate.completed)
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))[0];
    const followUpAt = application.followUpAt && !deriveApplicationState(application.stageEvents).outcome ? application.followUpAt : undefined;
    const earliest = [
      ...(deadline ? [{ at: deadline.at, label: deadline.label, deadline }] : []),
      ...(followUpAt ? [{ at: followUpAt, label: "Follow up", followUpAt }] : []),
    ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at))[0];
    const priority = earliest ? deadlineReason(earliest, now) : { priority: 4, reason: "No deadline scheduled" };
    return { application, deadline: earliest?.deadline, followUpAt: earliest?.followUpAt, ...priority };
  }).sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    const leftDate = left.deadline ? Date.parse(left.deadline.at) : left.followUpAt ? Date.parse(left.followUpAt) : Number.POSITIVE_INFINITY;
    const rightDate = right.deadline ? Date.parse(right.deadline.at) : right.followUpAt ? Date.parse(right.followUpAt) : Number.POSITIVE_INFINITY;
    return leftDate - rightDate || left.application.company.localeCompare(right.application.company);
  }).map(({ priority: _, ...action }) => action);
}
