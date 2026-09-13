import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { StageRail } from "../../components/StageRail";
import { applicationRepository } from "../../db/applicationRepository";
import { seedDemoData } from "../../db/seed";
import type { Application } from "../../domain/application";
import { applicationStages, deriveApplicationState } from "../../domain/stage";
import { rankNextActions, summarizeStages } from "./commandCenterSelectors";
import "./command-center.css";

const stageLabels = {
  applied: "Applied", review: "Review", assessment: "Assessment", interview: "Interview", final: "Final", offer: "Offer",
};

function salarySnapshot(application: Application): string {
  if (!application.research) return "Research unavailable";
  const { salary, companyRating } = application.research;
  const currency = new Intl.NumberFormat(salary.currency === "SGD" ? "en-SG" : "en-HK", {
    style: "currency", currency: salary.currency, maximumFractionDigits: 0,
  });
  const range = salary.maximum ? `${currency.format(salary.minimum)}–${currency.format(salary.maximum)}` : currency.format(salary.minimum);
  return `${range} / ${salary.period} · ${companyRating.score}/${companyRating.outOf}`;
}

function rejectedAtStage(application: Application) {
  return [...application.stageEvents].filter((event) => event.accepted && event.toStage).at(-1)?.toStage;
}

export function CommandCenterPage() {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState(false);

  async function readApplications() {
    await seedDemoData();
    return applicationRepository.list();
  }

  async function loadApplications() {
    setError(false);
    try {
      setApplications(await readApplications());
    } catch {
      setError(true);
      setApplications([]);
    }
  }

  useEffect(() => {
    let mounted = true;
    void readApplications().then(
      (next) => { if (mounted) setApplications(next); },
      () => { if (mounted) { setError(true); setApplications([]); } },
    );
    return () => { mounted = false; };
  }, []);

  if (applications === null) {
    return <div className="command-center"><header className="command-center__header"><div><h1 aria-label="Your application journey">Application command center</h1><p>See what needs your attention across Singapore and Hong Kong.</p></div></header><section aria-busy="true" aria-label="Loading applications"><div className="command-center__skeleton" data-testid="loading-skeleton" /><div className="command-center__skeleton" data-testid="loading-skeleton" /><div className="command-center__skeleton" data-testid="loading-skeleton" /></section></div>;
  }

  if (error) {
    return <section className="command-center"><EmptyState title="Could not load your tracker">Try loading the sample data again.</EmptyState><Button onClick={() => void loadApplications()}>Load sample data</Button></section>;
  }

  if (!applications.length) {
    return <section className="command-center"><EmptyState title="Start your tracker">Add your first application or load fictional sample data to see the workflow.</EmptyState><div className="command-center__actions"><Link className="button button--secondary" to="/import">Import tracker</Link><Link className="button button--secondary" to="/applications?new=1">Add application</Link><Button onClick={() => void loadApplications()}>Load sample data</Button></div></section>;
  }

  const summary = summarizeStages(applications);
  const actions = rankNextActions(applications, applications.flatMap((application) => application.deadlines), new Date());

  return (
    <div className="command-center">
      <header className="command-center__header">
        <div><h1>Application command center</h1><p>See what needs your attention across Singapore and Hong Kong.</p></div>
        <div className="command-center__actions"><Link className="button button--secondary" to="/import">Import tracker</Link><Link className="button button--primary" to="/applications?new=1">Add application</Link></div>
      </header>

      <section aria-labelledby="portfolio-overview" className="command-center__section">
        <div className="command-center__section-heading"><h2 id="portfolio-overview">Portfolio overview</h2><span>{applications.length} applications</span></div>
        <dl className="command-center__stage-summary">
          {applicationStages.map((stage) => <div key={stage}><dt>{stageLabels[stage]}</dt><dd>{summary[stage]}</dd></div>)}
        </dl>
      </section>

      <section aria-labelledby="attention-heading" className="command-center__section">
        <div className="command-center__section-heading"><h2 id="attention-heading">Applications requiring attention</h2><span>Ordered by deadline</span></div>
        <div className="command-center__rows">
          {actions.map(({ application, reason }) => {
            const state = deriveApplicationState(application.stageEvents);
            const railStage = rejectedAtStage(application) ?? state.stage;
            const statusLabel = state.outcome === "rejected"
              ? `Rejected at ${railStage ? stageLabels[railStage] : "unknown stage"}`
              : `Stage: ${state.stage ? stageLabels[state.stage] : "Not started"}`;
            return <article className="command-center__application" data-outcome={state.outcome ?? undefined} data-testid={`application-row-${application.id}`} key={application.id}>
              <div className="command-center__identity"><h3>{application.company}</h3><p>{application.role} · {application.location.city}</p><span>Source: {application.source}</span></div>
              <p className="command-center__market">{salarySnapshot(application)}<br /><span>{application.research?.companyRating.source}</span></p>
              <div className="command-center__progress"><StageRail compact outcome={state.outcome} rejectedAtStage={railStage ?? undefined} stage={state.stage} /><span className="command-center__stage-label">{statusLabel}</span></div>
              <p className="command-center__next-action">{reason}</p>
            </article>;
          })}
        </div>
      </section>

      <aside aria-label="Buddy prompt" className="command-center__buddy"><strong>Buddy prompt</strong><p>Set aside 15 minutes to prepare for your next interview.</p><Link className="button button--secondary" to="/prepare">Open preparation</Link></aside>
    </div>
  );
}
