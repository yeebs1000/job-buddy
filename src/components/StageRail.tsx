import { applicationStages, type ApplicationOutcome, type ApplicationStage } from "../domain/stage";

const labels: Record<ApplicationStage, string> = {
  applied: "Applied",
  review: "Review",
  assessment: "Assessment",
  interview: "Interview",
  final: "Final",
  offer: "Offer",
};
const outcomeLabels: Record<ApplicationOutcome, string> = {
  rejected: "Rejected", withdrawn: "Withdrawn", expired: "Expired", offer_declined: "Offer declined", offer_accepted: "Offer accepted", hired: "Hired",
};

interface StageRailProps {
  stage: ApplicationStage | null;
  outcome: ApplicationOutcome | null;
  rejectedAtStage?: ApplicationStage;
  compact?: boolean;
}

export function StageRail({ stage, outcome, rejectedAtStage, compact = false }: StageRailProps) {
  const currentIndex = stage ? applicationStages.indexOf(stage) : -1;
  const rejected = outcome === "rejected";
  const terminal = Boolean(outcome);
  const rejectionLabel = rejectedAtStage ? `Rejected during ${labels[rejectedAtStage]}` : "Rejected";
  const terminalLabel = stage ? `${outcomeLabels[outcome!]} after ${labels[stage]}` : outcomeLabels[outcome!];

  return (
    <div
      aria-label={rejected ? rejectionLabel : terminal ? terminalLabel : "Application progress"}
      className={`stage-rail${compact ? " stage-rail--compact" : ""}`}
      data-outcome={outcome ?? undefined}
      role="group"
    >
      <ol>
        {applicationStages.map((item, index) => {
          const state = rejected
            ? item === rejectedAtStage
              ? "rejected-at"
              : "rejected"
            : terminal
              ? item === stage
                ? "terminal-at"
                : "terminal"
            : index < currentIndex
              ? "complete"
              : item === stage
                ? "current"
                : "upcoming";
          const status = state === "rejected-at" ? `Rejected at ${labels[item]}` : state === "terminal-at" ? `${outcomeLabels[outcome!]} at ${labels[item]}` : state === "terminal" ? outcomeLabels[outcome!] : {
            complete: "Completed",
            current: "Current stage",
            upcoming: "Upcoming",
            rejected: "Rejected",
          }[state];

          return (
            <li data-state={state} key={item} style={{ "--stage-color": `var(--stage-${index + 1})` } as React.CSSProperties}>
              <span aria-hidden="true" className="stage-rail__mark" />
              <span aria-current={!terminal && item === stage ? "step" : undefined} className="stage-rail__label">
                {labels[item]}
                <span className="sr-only">, {status}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
