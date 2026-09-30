import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { StageRail } from "../../components/StageRail";
import { applicationRepository } from "../../db/applicationRepository";
import type { Application } from "../../domain/application";
import { applicationStages, deriveApplicationState } from "../../domain/stage";
import { isSafeExternalHttpsUrl } from "../../domain/jobUrl";
import { rankNextActions, summarizeStages } from "./commandCenterSelectors";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import { GmailMailAdapter } from "../../integrations/mail/GmailMailAdapter";
import { gmailScanErrorMessage } from "../../integrations/mail/gmailScanErrors";
import type { GmailConnectionStatus } from "../../domain/mail";
import type { MailScanMode } from "../updates/runMailScan";
import { useMailScan } from "../updates/useMailScan";
import { MailScanProgress } from "../updates/MailScanProgress";
import { RecheckMailControl } from "../updates/RecheckMailControl";
import { gmailClient } from "../settings/gmailClient";
import { defaultGmailPreferences, gmailPreferences, type GmailPreferences } from "../settings/gmailPreferences";
import { PendingCaptures } from "../buddy/PendingCaptures";
import { MailOpportunities } from "./MailOpportunities";
import { SalarySummary } from "./SalarySummary";
import { TrackerFileActions } from "./TrackerFileActions";
import "./command-center.css";
import { isWebMode } from "../../app/runtimeMode";
import { WebIntegrationNotice } from "../../components/WebIntegrationNotice";

const stageLabels = {
  applied: "Applied", review: "Review", assessment: "Assessment", interview: "Interview", final: "Final", offer: "Offer",
};

const outcomeLabels = { rejected: "Rejected", withdrawn: "Withdrawn", expired: "Expired", offer_declined: "Offer declined", offer_accepted: "Offer accepted", hired: "Hired" } as const;

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
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const { state, pending, isScanning, scan } = useMailScan(adapter, mode);
  const live = adapter.source === "gmail";
  const connected = gmailStatus.state === "connected";
  const firstScan = live && !state?.cursor && !preferences.initialSyncCompleted;
  async function startScan(recheck = false) {
    setFailed(false);
    setFailureMessage(null);
    try {
      const result = await scan(firstScan || recheck, recheck);
      if (!result.error) {
        if (live) {
          const current = await gmailPreferences.get();
          await gmailPreferences.save({ ...current, initialSyncCompleted: true });
        }
        await onScanned();
      } else { setFailed(true); if (live && result.errorCode) setFailureMessage(gmailScanErrorMessage(result.errorCode)); }
    }
    catch { setFailed(true); }
  }
  const sourceLabel = live ? "Live Gmail" : "Demo inbox";
  const scanLabel = live ? "Gmail" : "demo inbox";
  if (live && !connected) return <section aria-label="Gmail connection" className="command-center__scan">
    <div><strong>Live Gmail</strong><p>Connect your inbox to find application confirmations, recruiter replies and interviews. Review updates before they change your dashboard.</p></div>
    <Link className="button button--primary" to="/settings">{gmailStatus.state === "reconnect-required" ? "Reconnect Gmail" : "Connect Gmail"}</Link>
  </section>;
  return <section aria-label={`${sourceLabel} scan`} className="command-center__scan" data-source={adapter.source}>
    <div><strong>{sourceLabel}</strong><p>{live ? connected ? `Read-only connection · ${gmailStatus.accountEmail ?? "Connected account"}` : "Live source selected · Reconnect from Settings to resume." : "Fictional messages · No credentials or live Gmail access."}</p><p>Last successful scan: {state?.lastSuccessfulScanAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }).format(new Date(state.lastSuccessfulScanAt)) + " SGT (UTC+08:00)" : "Never"}</p></div>
    <label>Scan mode<select value={mode} disabled={isScanning || (live && !connected)} onChange={(event) => onModeChange(event.target.value as MailScanMode)}><option value="approval">Approval</option><option value="unrestricted">Auto-apply safe updates</option></select></label>
    <Button disabled={isScanning || (live && !connected)} onClick={() => void startScan()}>{isScanning ? `Scanning ${scanLabel}…` : state?.continuationToken ? "Resume Gmail scan" : firstScan ? "Scan last 90 days" : state?.error || failed ? `Retry ${live ? "Gmail" : "demo"} scan` : live ? "Scan Gmail now" : "Scan demo inbox"}</Button>
    {live && <MailScanProgress state={state} />}
    {live && connected && <RecheckMailControl disabled={isScanning || Boolean(state?.continuationToken)} onRecheck={() => void startScan(true)} />}
    {firstScan && <p>Checks up to 500 inbox messages from the last 90 days. The first scan can take a few minutes; keep Job Buddy open.</p>}
    <Link to="/updates">Review {pending.length} pending update{pending.length === 1 ? "" : "s"}</Link>
    {live && !connected && <Link to="/settings">Reconnect Gmail</Link>}
    {isScanning && <p role="status">{live ? "Checking Gmail at a paced rate. This can take a few minutes; temporary Google limits are retried automatically." : "Checking fictional messages…"}</p>}
    {mode === "unrestricted" && <p role="alert" className="command-center__scan-warning">Job Buddy may automatically apply high-confidence forward updates. Offers, terminal outcomes and conflicts still require approval.</p>}
    {state?.diagnostics?.truncated && <p role="status" className="command-center__scan-notice">Only the newest 500 matching Gmail messages were checked.</p>}
    {state?.diagnostics?.recoverySync && <p role="status" className="command-center__scan-notice">Gmail history expired, so Job Buddy completed a bounded recovery scan.</p>}
    {!isScanning && (state?.error || failed) && <p role="alert" className="command-center__scan-warning">{failureMessage ?? (live && state?.errorCode ? gmailScanErrorMessage(state.errorCode) : `${live ? "Gmail" : "Demo"} scan could not be completed. Please try again.`)}</p>}
  </section>;
}

export function CommandCenterPage({ mailAdapter, gmailAdapter = liveMail, gmailStatus: suppliedStatus, initialPreferences }: {
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
    if (isWebMode || mailAdapter || (suppliedStatus && initialPreferences)) return;
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
    const persisted = !mailAdapter && !initialPreferences;
    const current = persisted ? await gmailPreferences.get() : integration.preferences;
    const preferences = { ...current, automationMode: mode };
    if (persisted) await gmailPreferences.save(preferences);
    setIntegration(current => current && ({ ...current, preferences }));
  }

  async function readApplications() {
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
    return <section className="command-center"><EmptyState title="Could not load your tracker">Your saved records have not been changed. Retry loading them.</EmptyState><Button onClick={() => void loadApplications()}>Retry loading tracker</Button></section>;
  }

  if (!applications.length) {
    const selectedAdapter = mailAdapter ?? gmailAdapter;
    return <section className="command-center">
      {!isWebMode && <>
        <header className="command-center__header"><div><h1>Application command center</h1><p>Start with your inbox. Scan Gmail, review the evidence, and keep your applications up to date.</p></div></header>
        {integration ? <MailScanStatus adapter={selectedAdapter} onScanned={loadApplications} mode={integration.preferences.automationMode} onModeChange={(mode) => void setScanMode(mode)} gmailStatus={integration.status} preferences={integration.preferences} /> : <section className="command-center__scan command-center__scan--loading" aria-label="Loading inbox source" aria-busy="true" />}
        <MailOpportunities />
      </>}
      <EmptyState title="Start your tracker">{isWebMode ? "Add an application or import your tracker. Your data stays in this browser." : "Prefer to add something yourself? Manual entry and spreadsheet import are available alongside Gmail updates."}</EmptyState>
      <div className="command-center__actions"><TrackerFileActions onImported={loadApplications} /><Link className={`button button--${isWebMode ? "primary" : "secondary"}`} to="/applications?new=1">Add application</Link></div>
      {isWebMode ? <><WebIntegrationNotice name="Gmail" /><MailOpportunities /></> : <PendingCaptures onImported={loadApplications} />}
    </section>;
  }

  const summary = summarizeStages(applications);
  const actions = rankNextActions(applications, applications.flatMap((application) => application.deadlines), new Date());

  return (
    <div className="command-center">
      <header className="command-center__header">
        <div><h1>Application command center</h1><p>{isWebMode ? "See what needs your attention across Singapore, Hong Kong and the United States." : "Scan Gmail, review recruiter updates, and see what needs your attention."}</p></div>
        <div className="command-center__actions"><TrackerFileActions onImported={loadApplications} /><Link className={`button button--${isWebMode ? "primary" : "secondary"}`} to="/applications?new=1">Add application</Link></div>
      </header>

      {isWebMode ? <WebIntegrationNotice name="Gmail" /> : integration ? <MailScanStatus adapter={mailAdapter ?? gmailAdapter} onScanned={loadApplications} mode={integration.preferences.automationMode} onModeChange={(mode) => void setScanMode(mode)} gmailStatus={integration.status} preferences={integration.preferences} /> : <section className="command-center__scan command-center__scan--loading" aria-label="Loading inbox source" aria-busy="true" />}

      {!isWebMode && <PendingCaptures onImported={loadApplications} />}

      <section aria-labelledby="portfolio-overview" className="command-center__section">
        <div className="command-center__section-heading"><h2 id="portfolio-overview">Your pipeline</h2><span>{applications.length} applications · {applications.filter(app => !deriveApplicationState(app.stageEvents).outcome).length} active</span></div>
        <dl className="command-center__stage-summary">
          {applicationStages.map((stage) => <div key={stage}><dt>{stageLabels[stage]}</dt><dd>{summary[stage]}</dd></div>)}
        </dl>
      </section>

      <section aria-labelledby="attention-heading" className="command-center__section">
        <div className="command-center__section-heading"><h2 id="attention-heading">Applications</h2><span>Ordered by deadline</span></div>
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
              <div className="command-center__identity"><h3><Link to={`/applications/${encodeURIComponent(application.id)}`}>{application.company}</Link></h3><p>{application.role} · {application.location.city}</p><span>Source: {application.source}</span>{application.demoState === "retained" && <small className="command-center__retained">Kept from an edited or older sample. Review its details.</small>}</div>
              <div className="command-center__progress"><StageRail compact outcome={state.outcome} rejectedAtStage={state.outcome === "rejected" ? railStage ?? undefined : undefined} stage={state.stage} /><span className="command-center__stage-label">{statusLabel}</span></div>
              <p className="command-center__next-action">{reason}{action.deadline?.links?.filter(isSafeExternalHttpsUrl).map((link) => <span key={link}> · <a href={link} target="_blank" rel="noopener noreferrer">Open meeting link</a></span>)}</p>
              <SalarySummary application={application} />
            </article>;
          })}
        </div>
      </section>

      <MailOpportunities />
    </div>
  );
}
