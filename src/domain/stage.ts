export const applicationStages = ["applied", "review", "assessment", "interview", "final", "offer"] as const;

export type ApplicationStage = (typeof applicationStages)[number];
export type ApplicationOutcome = "rejected" | "withdrawn" | "expired" | "offer_declined" | "offer_accepted" | "hired";
export type EventOrigin = "manual" | "import" | "buddy" | "gmail" | "system";

export interface StageEvent {
  id: string;
  applicationId: string;
  at: string;
  fromStage?: ApplicationStage;
  toStage?: ApplicationStage;
  outcome?: ApplicationOutcome;
  origin: EventOrigin;
  accepted: boolean;
  evidenceId?: string;
  confidence?: number;
  note?: string;
  revertsEventId?: string;
}

export interface ApplicationState {
  stage: ApplicationStage | null;
  outcome: ApplicationOutcome | null;
}

export function compareStageEvents(left: StageEvent, right: StageEvent): number {
  const leftTime = Date.parse(left.at);
  const rightTime = Date.parse(right.at);
  const leftInvalid = Number.isNaN(leftTime);
  const rightInvalid = Number.isNaN(rightTime);

  if (leftInvalid || rightInvalid) {
    return leftInvalid === rightInvalid ? left.id.localeCompare(right.id) : leftInvalid ? 1 : -1;
  }

  return leftTime - rightTime || left.id.localeCompare(right.id);
}

export function deriveApplicationState(events: StageEvent[]): ApplicationState {
  let stage: ApplicationStage | null = null;
  let outcome: ApplicationOutcome | null = null;

  for (const event of events.filter((event) => event.accepted).sort(compareStageEvents)) {
    if (outcome) break;
    if (event.toStage) stage = event.toStage;
    if (event.outcome) outcome = event.outcome;
  }

  return { stage, outcome };
}

export function canAutoApply(event: StageEvent): boolean {
  return !event.outcome && event.origin !== "manual" && (event.confidence ?? 0) >= 0.9;
}
