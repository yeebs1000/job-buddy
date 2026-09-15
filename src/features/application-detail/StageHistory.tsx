import { compareStageEvents, type ApplicationOutcome, type ApplicationStage, type StageEvent } from "../../domain/stage";

export const stageLabels: Record<ApplicationStage, string> = { applied: "Applied", review: "Review", assessment: "Assessment", interview: "Interview", final: "Final", offer: "Offer" };
export const outcomeLabels: Record<ApplicationOutcome, string> = { rejected: "Rejected", withdrawn: "Withdrawn", expired: "Expired", offer_declined: "Offer declined", offer_accepted: "Offer accepted", hired: "Hired" };
const originLabels = { manual: "Manual", import: "Import", buddy: "Buddy", gmail: "Gmail", system: "System" };
export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date unavailable" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function StageHistory({ events }: { events: StageEvent[] }) {
  if (!events.length) return <p>No activity recorded yet.</p>;
  return <ol className="detail-history" aria-label="Stage history">
    {[...events].sort(compareStageEvents).map(event => <li key={event.id}>
      <div className="detail-history__action"><strong>{event.revertsEventId ? "Undo recorded" : event.outcome ? `Recorded ${outcomeLabels[event.outcome]}` : event.toStage ? `Changed to ${stageLabels[event.toStage]}` : "Activity recorded"}</strong>{!event.accepted && <span className="detail-reverted">Reverted / not applied</span>}</div>
      <p className="detail-meta"><span>{originLabels[event.origin]}</span> · <time dateTime={event.at}>{formatDate(event.at)}</time></p>
      {event.fromStage && <p className="detail-meta">{event.outcome ? "Reached" : "From"} {stageLabels[event.fromStage]}</p>}
      {event.note && <p className="detail-note">{event.note}</p>}
      {event.evidenceId && <p className="detail-meta">Evidence: {event.evidenceId}</p>}
    </li>)}
  </ol>;
}
