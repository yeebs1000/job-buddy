import { applicationRepository, type PersistedApplication } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import type { Application } from "../../domain/application";

export type ApplicationDetails = Pick<Application, "recruiter" | "notes" | "followUpAt" | "deadlines">;

export class DetailsConflictError extends Error {
  constructor() { super("This application changed while you were editing. Your draft has not been saved. Copy anything you want to keep before loading the latest details."); }
}

export function detailsOf(application: Application): ApplicationDetails {
  return { recruiter: application.recruiter, notes: application.notes, followUpAt: application.followUpAt, deadlines: application.deadlines };
}

// The dashboard uses SGT/HKT. Keep editor times explicit, independent of the device timezone.
const offset = 8 * 60 * 60 * 1000;
export function toEditorDate(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Date(Date.parse(value) + offset).toISOString().slice(0, 16);
}

export function fromEditorDate(value: string, original?: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid date and time.");
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.valueOf()) || toEditorDate(date.toISOString()) !== value) throw new Error("Enter a valid date and time.");
  // Editing an unrelated field must not discard seconds or change the stored offset.
  return original && toEditorDate(original) === value ? original : date.toISOString();
}

function validDate(value: string): boolean {
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  // Date.parse rolls February 30 forward; validate the calendar separately.
  return new Date(`${parts[1]}T00:00:00Z`).toISOString().slice(0, 10) === parts[1];
}

export async function saveApplicationDetails(original: PersistedApplication, draft: ApplicationDetails): Promise<PersistedApplication> {
  if ((draft.recruiter?.length ?? 0) > 2000 || (draft.notes?.length ?? 0) > 20000) throw new Error("Keep contacts under 2,000 characters and notes under 20,000 characters.");
  if (draft.followUpAt && !validDate(draft.followUpAt)) throw new Error("Enter a valid follow-up date and time.");
  if (draft.deadlines.length > 100 || new Set(draft.deadlines.map(item => item.id)).size !== draft.deadlines.length) throw new Error("Use at most 100 deadlines with unique identifiers.");
  for (const deadline of draft.deadlines) {
    if (!deadline.id || !deadline.label.trim() || deadline.label.length > 300) throw new Error("Give each deadline a label of 1–300 characters.");
    if (!validDate(deadline.at)) throw new Error("Enter a valid date and time for every deadline.");
  }
  return jobBuddyDb.transaction("rw", jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
    const current = await applicationRepository.get(original.id);
    if (!current) throw new Error("This application no longer exists. Return to applications to continue.");
    // Compare the values as well as the timestamp: two writes can share a millisecond.
    if (current.updatedAt !== original.updatedAt || JSON.stringify(detailsOf(current)) !== JSON.stringify(detailsOf(original)) || JSON.stringify(current.stageEvents) !== JSON.stringify(original.stageEvents)) throw new DetailsConflictError();
    const saved = await applicationRepository.update(original.id, {
      recruiter: draft.recruiter, notes: draft.notes, followUpAt: draft.followUpAt,
      deadlines: draft.deadlines.map(deadline => ({ ...deadline, label: deadline.label.trim() })),
    });
    if (!saved) throw new Error("This application no longer exists.");
    return saved;
  });
}
