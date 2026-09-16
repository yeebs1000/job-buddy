import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { StageRail } from "../../components/StageRail";
import { applicationRepository } from "../../db/applicationRepository";
import { seedDemoData } from "../../db/seed";
import type { Application } from "../../domain/application";
import { applicationStages, deriveApplicationState } from "../../domain/stage";
import { isSafeExternalHttpsUrl } from "../../domain/jobUrl";
import { rankNextActions, summarizeStages } from "./commandCenterSelectors";
import { fixtureMessages } from "../../fixtures/mail/messages";
import { FixtureMailAdapter } from "../../integrations/mail/FixtureMailAdapter";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import { GmailMailAdapter } from "../../integrations/mail/GmailMailAdapter";
import type { GmailConnectionStatus } from "../../domain/mail";
import type { MailScanMode } from "../updates/runMailScan";
import { useMailScan } from "../updates/useMailScan";
import { gmailClient } from "../settings/gmailClient";
import { defaultGmailPreferences, gmailPreferences, type GmailPreferences } from "../settings/gmailPreferences";
import { PendingCaptures } from "../buddy/PendingCaptures";
import "./command-center.css";

const stageLabels = {
  applied: "Applied", review: "Review", assessment: "Assessment", interview: "Interview", final: "Final", offer: "Offer",
};

function salarySnapshot(application: Application): string {
  if (!application.research) return "Research unavailable";
  const { salary, companyRating } = application.research;
  const rating = companyRating ? `${companyRating.score}/${companyRating.outOf}` : "Company rating unavailable";
  if (!salary) return `Salary unavailable · ${rating}`;
  const currency = new Intl.NumberFormat(salary.currency === "SGD" ? "en-SG" : "en-HK", {
    style: "currency", currency: salary.currency, maximumFractionDigits: 0,
  });
  const range = salary.maximum ? `${currency.format(salary.minimum)}–${currency.format(salary.maximum)}` : currency.format(salary.minimum);
  return `${range} / ${salary.period} · ${rating}`;
}

const outcomeLabels = { rejected: "Rejected", withdrawn: "Withdrawn", expired: "Expired", offer_declined: "Offer declined", offer_accepted: "Offer accepted", hired: "Hired" } as const;

const simulatedMail = new FixtureMailAdapter(fixtureMessages);
const liveMail = new GmailMailAdapter();

function MailScanStatus({ adapter, onScanned, mode, onModeChange, gmailStatus, preferences }: {
  adapter: MailAdapter;
  onScanned: () => Promise<void>;
  mode: MailScanMode;
  onModeChange: (mode: MailScanMode) => void;
  gmailStatus: GmailConnectionStatus;
  preferences: GmailPreferences;
}) {
  const [failed, setFailed] = useState(false);
  const { state, pending, isScanning, scan } = useMailScan(adapter, mode);
  const live = adapter.source === "gmail";
  const connected = gmailStatus.state === "connected";
  async function startScan() {
    setFailed(false);
    try { const result = await scan(); if (!result.error) await onScanned(); else setFailed(true); }
    catch { setFailed(true); }
  }
  const sourceLabel = live ? "Live Gmail" : "Demo inbox";
  const scanLabel = live ? "Gmail" : "demo inbox";
  return <section aria-label={`${sourceLabel} scan`} className="command-center__scan" data-source={adapter.source}>
    <div><strong>{sourceLabel}</strong><p>{live ? connected ? `Read-only connection · ${gmailStatus.accountEmail ?? "Connected account"}` : "Live source selected · Reconnect from Settings to resume." : "Fictional messages · No credentials or live Gmail access."}</p><p>Last successful scan: {state?.lastSuccessfulScanAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }).format(new Date(state.lastSuccessfulScanAt)) + " SGT (UTC+08:00)" : "Never"}</p></div>
    <label>Scan mode<select value={mode} disabled={isScanning || (live && !connected)} onChange={(event) => onModeChange(event.target.value as MailScanMode)}><option value="approval">Approval</option><option value="unrestricted">Auto-apply safe updates</option></select></label>
    <Button disabled={isScanning || (live && !connected)} onClick={() => void startScan()}>{isScanning ? `Scanning ${scanLabel}…` : state?.error || failed ? `Retry ${live ? "Gmail" : "demo"} scan` : live ? "Scan Gmail now" : "Scan demo inbox"}</Button>
    <Link to="/updates">Review {pending.length} pending update{pending.length === 1 ? "" : "s"}</Link>
    {live && !connected && <Link to="/settings">Reconnect Gmail</Link>}
    {isScanning && <p role="status">Checking {live ? "Gmail" : "fictional messages"}…</p>}
    {mode === "unrestricted" && <p role="alert" className="command-center__scan-warning">Job Buddy may automatically apply high-confidence forward updates. Offers, terminal outcomes and conflicts still require approval.</p>}
    {state?.diagnostics?.truncated && <p role="status" className="command-center__scan-notice">Only the newest 500 matching Gmail messages were checked.</p>}
    {state?.diagnostics?.recoverySync && <p role="status" className="command-center__scan-notice">Gmail history expired, so Job Buddy completed a bounded recovery scan.</p>}
    {(state?.error || failed) && <p role="alert" className="command-center__scan-warning">{live ? "Gmail" : "Demo"} scan could not be completed. Please try again.</p>}
  </section>;
}

export function CommandCenterPage({ mailAdapter, gmailAdapter = liveMail, fixtureAdapter = simulatedMail, gmailStatus: suppliedStatus, initialPreferences }: {
  mailAdapter?: MailAdapter;
  gmailAdapter?: MailAdapter;
  fixtureAdapter?: MailAdapter;
  gmailStatus?: GmailConnectionStatus;
  initialPreferences?: GmailPreferences;
} = {}) {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState(false);
  const [integration, setIntegration] = useState<{ status: GmailConnectionStatus; preferences: GmailPreferences } | null>(() => {
    if (mailAdapter) return { status: { state: "disconnected", platformSupported: true }, preferences: { ...defaultGmailPreferences, selectedSource: mailAdapter.source } };
    if (suppliedStatus && initialPreferences) return { status: suppliedStatus, preferences: initialPreferences };
    return null;
  });

  useEffect(() => {
    if (mailAdapter || (suppliedStatus && initialPreferences)) return;
    let mounted = true;
    Promise.allSettled([gmailClient.status(), gmailPreferences.get()]).then(([status, preferences]) => {
      if (!mounted) return;
      setIntegration({
        status: status.status === "fulfilled" ? status.value : { state: "disconnected", platformSupported: true },
        preferences: preferences.status === "fulfilled" ? preferences.value : { ...defaultGmailPreferences },
      });
    });
    return () => { mounted = false; };
  }, [mailAdapter, suppliedStatus, initialPreferences]);

  async function setScanMode(mode: MailScanMode) {
    if (!integration) return;
    const preferences = { ...integration.preferences, automationMode: mode };
    setIntegration({ ...integration, preferences });
    if (!mailAdapter && !initialPreferences) await gmailPreferences.save(preferences);
  }

  async function readApplications() {
    await seedDemoData();
    return (await applicationRepository.list()).filter(application => !application.archived);
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
    const refresh = () => { void loadApplications(); };
    window.addEventListener("job-buddy-mail-updated", refresh);
    return () => window.removeEventListener("job-buddy-mail-updated", refresh);
  }, []);

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
    const selectedAdapter = mailAdapter ?? (integration?.preferences.selectedSource === "gmail" ? gmailAdapter : fixtureAdapter);
    return <section className="command-center"><EmptyState title="Start your tracker">Add your first application or load fictional sample data to see the workflow.</EmptyState><div className="command-center__actions"><Link className="button button--secondary" to="/import">Import tracker</Link><Link className="button button--secondary" to="/applications?new=1">Add application</Link><Button onClick={() => void loadApplications()}>Load sample data</Button></div>{integration && <MailScanStatus adapter={selectedAdapter} onScanned={loadApplications} mode={integration.preferences.automationMode} onModeChange={(mode) => void setScanMode(mode)} gmailStatus={integration.status} preferences={integration.preferences} />}<PendingCaptures onImported={loadApplications} /></section>;
  }

  const summary = summarizeStages(applications);
  const actions = rankNextActions(applications, applications.flatMap((application) => application.deadlines), new Date());

  return (
    <div className="command-center">
      <header className="command-center__header">
        <div><h1>Application command center</h1><p>See what needs your attention across Singapore, Hong Kong and the United States.</p></div>
        <div className="command-center__actions"><Link className="button button--secondary" to="/import">Import tracker</Link><Link className="button button--primary" to="/applications?new=1">Add application</Link></div>
      </header>

      {integration ? <MailScanStatus adapter={mailAdapter ?? (integration.preferences.selectedSource === "gmail" ? gmailAdapter : fixtureAdapter)} onScanned={loadApplications} mode={integration.preferences.automationMode} onModeChange={(mode) => void setScanMode(mode)} gmailStatus={integration.status} preferences={integration.preferences} /> : <section className="command-center__scan command-center__scan--loading" aria-label="Loading inbox source" aria-busy="true" />}

      <PendingCaptures onImported={loadApplications} />

      <section aria-labelledby="portfolio-overview" className="command-center__section">
        <div className="command-center__section-heading"><h2 id="portfolio-overview">Portfolio overview</h2><span>{applications.length} applications</span></div>
        <dl className="command-center__stage-summary">
          {applicationStages.map((stage) => <div key={stage}><dt>{stageLabels[stage]}</dt><dd>{summary[stage]}</dd></div>)}
        </dl>
      </section>

      <section aria-labelledby="attention-heading" className="command-center__section">
        <div className="command-center__section-heading"><h2 id="attention-heading">Applications requiring attention</h2><span>Ordered by deadline</span></div>
        <div className="command-center__rows">
          {actions.map((action) => {
            const { application, reason } = action;
            const state = deriveApplicationState(application.stageEvents);
            const railStage = state.stage;
            const statusLabel = state.outcome === "rejected"
              ? `Rejected at ${railStage ? stageLabels[railStage] : "unknown stage"}`
              : state.outcome
                ? `Outcome: ${outcomeLabels[state.outcome]}${railStage ? ` at ${stageLabels[railStage]}` : ""}`
              : `Stage: ${state.stage ? stageLabels[state.stage] : "Not started"}`;
            return <article className="command-center__application" data-outcome={state.outcome ?? undefined} data-testid={`application-row-${application.id}`} key={application.id}>
              <div className="command-center__identity"><h3>{application.company}</h3><p>{application.role} · {application.location.city}</p><span>Source: {application.source}</span></div>
              <p className="command-center__market">{salarySnapshot(application)}<br /><span>{application.research?.companyRating?.source}</span></p>
              <div className="command-center__progress"><StageRail compact outcome={state.outcome} rejectedAtStage={state.outcome === "rejected" ? railStage ?? undefined : undefined} stage={state.stage} /><span className="command-center__stage-label">{statusLabel}</span></div>
              <p className="command-center__next-action">{reason}{action.deadline?.links?.filter(isSafeExternalHttpsUrl).map((link) => <span key={link}> · <a href={link} target="_blank" rel="noopener noreferrer">Open meeting link</a></span>)}</p>
            </article>;
          })}
        </div>
      </section>

      <aside aria-label="Buddy prompt" className="command-center__buddy"><strong>Buddy prompt</strong><p>Set aside 15 minutes to prepare for your next interview.</p><Link className="button button--secondary" to="/prepare">Open preparation</Link></aside>
    </div>
  );
}
