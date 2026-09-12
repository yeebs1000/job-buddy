import type { Application, Deadline } from "../../domain/application";
import { applicationStages, deriveApplicationState, type ApplicationStage } from "../../domain/stage";

export type StageSummary = Record<ApplicationStage, number>;

export interface NextAction {
  application: Application;
  deadline?: Deadline;
  reason: string;
}

function dayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function deadlineReason(deadline: Deadline, now: Date): { priority: number; reason: string } {
  const due = dayStart(new Date(deadline.at));
  const today = dayStart(now);
  const daysAway = (due - today) / 86_400_000;

  if (daysAway < 0) return { priority: 0, reason: `Overdue: ${deadline.label}` };
  if (daysAway === 0) return { priority: 1, reason: `Today: ${deadline.label}` };
  if (daysAway === 1) return { priority: 2, reason: `Tomorrow: ${deadline.label}` };
  return { priority: 3, reason: `Due ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(deadline.at))}: ${deadline.label}` };
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
    const priority = deadline ? deadlineReason(deadline, now) : { priority: 4, reason: "No deadline scheduled" };
    return { application, deadline, ...priority };
  }).sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    const leftDate = left.deadline ? Date.parse(left.deadline.at) : Number.POSITIVE_INFINITY;
    const rightDate = right.deadline ? Date.parse(right.deadline.at) : Number.POSITIVE_INFINITY;
    return leftDate - rightDate || left.application.company.localeCompare(right.application.company);
  }).map(({ priority: _, ...action }) => action);
}
