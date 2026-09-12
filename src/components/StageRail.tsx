import { applicationStages, type ApplicationOutcome, type ApplicationStage } from "../domain/stage";

const labels: Record<ApplicationStage, string> = {
  applied: "Applied",
  review: "Review",
  assessment: "Assessment",
  interview: "Interview",
  final: "Final",
  offer: "Offer",
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
  const rejectionLabel = rejectedAtStage ? `Rejected during ${labels[rejectedAtStage]}` : "Rejected";

  return (
    <div
      aria-label={rejected ? rejectionLabel : "Application progress"}
      className={`stage-rail${compact ? " stage-rail--compact" : ""}`}
      data-outcome={rejected ? "rejected" : undefined}
      role="group"
    >
      <ol>
        {applicationStages.map((item, index) => {
          const state = rejected
            ? item === rejectedAtStage
              ? "rejected-at"
              : "rejected"
            : index < currentIndex
              ? "complete"
              : item === stage
                ? "current"
                : "upcoming";
          const status = state === "rejected-at" ? `Rejected at ${labels[item]}` : {
            complete: "Completed",
            current: "Current stage",
            upcoming: "Upcoming",
            rejected: "Rejected",
          }[state];

          return (
            <li data-state={state} key={item} style={{ "--stage-color": `var(--stage-${index + 1})` } as React.CSSProperties}>
              <span aria-hidden="true" className="stage-rail__mark" />
              <span aria-current={!rejected && item === stage ? "step" : undefined} className="stage-rail__label">
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
