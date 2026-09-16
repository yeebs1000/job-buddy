import { useEffect, useState } from "react";
import type { Application } from "../../domain/application";
import type { PendingSalaryEvidence } from "../../domain/buddy";
import type { RoleAliasOverride, RoleMatch, SalaryEstimateSnapshot, SalaryObservation } from "../../domain/research";
import { applicationMarket } from "../../domain/filters";
import { isSafeExternalHttpsUrl } from "../../domain/jobUrl";
import { calculateEstimate } from "./calculateEstimate";
import { normalizeRoleTitle } from "./matchRole";
import { ObservationForm } from "./ObservationForm";
import { researchClient, type ResearchClient } from "./researchClient";
import { researchRepository } from "./researchRepository";
import { RoleMatchForm } from "./RoleMatchForm";
import { roundSalaryDown } from "./roundSalary";
import { buddyClient } from "../buddy/buddyClient";
import "./research.css";
import { CompanyResearchPanel } from "./CompanyResearchPanel";
import { CurrencyComparison } from "./CurrencyComparison";

interface SalaryEvidenceClient {
  listSalaryEvidence(): Promise<PendingSalaryEvidence[]>;
  deleteSalaryEvidence(id: string): Promise<void>;
}

export function ResearchPanel({ application, client = researchClient, salaryEvidenceClient = buddyClient, now = Date.now }: {
  application: Application;
  client?: ResearchClient;
  salaryEvidenceClient?: SalaryEvidenceClient;
  now?: () => number;
}) {
  const market = applicationMarket(application);
  const [roleMatch, setRoleMatch] = useState<RoleMatch>();
  const [roleAliases, setRoleAliases] = useState<RoleAliasOverride[]>([]);
  const [observations, setObservations] = useState<SalaryObservation[]>([]);
  const [snapshots, setSnapshots] = useState<SalaryEstimateSnapshot[]>([]);
  const [estimate, setEstimate] = useState<SalaryEstimateSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [pendingEvidence, setPendingEvidence] = useState<PendingSalaryEvidence[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      researchRepository.listObservations(application.id),
      researchRepository.listSnapshots(application.id),
      researchRepository.listRoleAliases(market),
    ]).then(([nextObservations, nextSnapshots, nextAliases]) => {
      if (!active) return;
      setObservations(nextObservations); setSnapshots(nextSnapshots); setEstimate(nextSnapshots.at(-1)); setRoleAliases(nextAliases);
    }).catch(() => { if (active) setError("Could not load saved salary research."); });
    return () => { active = false; };
  }, [application.id]);

  useEffect(() => {
    let active = true;
    salaryEvidenceClient.listSalaryEvidence()
      .then((items) => { if (active) setPendingEvidence(items.filter((item) => item.market === market)); })
      .catch(() => { /* The companion is optional; manual evidence remains available offline. */ });
    return () => { active = false; };
  }, [market, salaryEvidenceClient]);

  async function confirmRole(match: RoleMatch, reuse: boolean) {
    setRoleMatch(match); setError(""); setMessage("Role mapping confirmed.");
    if (reuse) {
      await researchRepository.saveRoleAlias({
        id: crypto.randomUUID(), market, normalizedTitle: normalizeRoleTitle(application.role),
        canonicalRole: match.canonicalRole, sourceOccupationCode: match.sourceOccupationCode,
        createdAt: new Date(now()).toISOString(),
      });
      setRoleAliases(await researchRepository.listRoleAliases(market));
    }
  }

  async function researchSalary() {
    if (!roleMatch) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const bundle = await client.lookup({ market, canonicalRole: roleMatch.canonicalRole, metroCode: application.location.metroCode, state: application.location.state });
      const result = calculateEstimate({
        snapshotId: crypto.randomUUID(), applicationId: application.id, benchmark: bundle.benchmark,
        roleMatch, geographyFallback: bundle.fallback, observations, cpiPoints: bundle.cpiPoints,
        calculatedAt: new Date(now()).toISOString(),
      });
      if ("status" in result) { setEstimate(undefined); setError("There is insufficient official evidence for this role and market."); return; }
      setEstimate(result);
      setFallbackMessage(bundle.fallback === "state" ? "State benchmark used because metro data was unavailable." : bundle.fallback === "national" ? "National benchmark used because local data was unavailable." : "");
      setMessage("Research ready. Review the sources and assumptions before saving.");
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      setError(code === "stale-cache" ? "There is insufficient official evidence in the local cache. Refresh official sources and try again." : "Salary research is unavailable. Check the local companion and try again.");
    } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setError("");
    try { await client.refresh(market); setMessage("Official sources refreshed."); await researchSalary(); }
    catch { setError("Could not refresh official sources. Previously saved research is unchanged."); setBusy(false); }
  }

  async function addObservation(observation: SalaryObservation) {
    await researchRepository.addObservation(observation);
    setObservations(await researchRepository.listObservations(application.id));
    setMessage("Salary evidence saved locally. Research again to include it.");
  }

  async function importSalaryEvidence(evidence: PendingSalaryEvidence) {
    if (!roleMatch || evidence.market !== market) return;
    await researchRepository.addObservation({
      id: evidence.id,
      applicationId: application.id,
      provenance: "job_posting",
      market: evidence.market,
      currency: evidence.currency,
      period: evidence.period,
      minimum: evidence.minimum,
      maximum: evidence.maximum,
      canonicalRole: roleMatch.canonicalRole,
      geographyLabel: [application.location.city, application.location.state].filter(Boolean).join(", "),
      observedAt: evidence.detectedAt,
      sourceUrl: evidence.sourceUrl,
      ...(evidence.evidenceExcerpt ? { evidenceExcerpt: evidence.evidenceExcerpt } : {}),
      reusable: true,
    });
    await salaryEvidenceClient.deleteSalaryEvidence(evidence.id);
    setPendingEvidence((items) => items.filter((item) => item.id !== evidence.id));
    setObservations(await researchRepository.listObservations(application.id));
    setMessage("Browser salary evidence imported. Research again to include it.");
  }

  async function saveSnapshot() {
    if (!estimate) return;
    await researchRepository.saveSnapshot(estimate);
    setSnapshots(await researchRepository.listSnapshots(application.id));
    setMessage("Research snapshot saved.");
  }

  const legacy = application.research?.salary;
  const nominal = estimate && {
    minimum: roundSalaryDown(estimate.exactNominalRange.minimum, estimate.currency, estimate.period),
    maximum: roundSalaryDown(estimate.exactNominalRange.maximum, estimate.currency, estimate.period),
  };
  return <div className="research-panel">
    <CompanyResearchPanel key={application.id} application={application} />
    {!estimate && !snapshots.length && legacy && <p className="research-legacy"><strong>{legacy.currency} {legacy.minimum.toLocaleString("en-US")}{legacy.maximum !== undefined ? `–${legacy.maximum.toLocaleString("en-US")}` : ""} / {legacy.period === "annual" ? "year" : "month"}</strong><span>Legacy saved salary — source unavailable</span></p>}
    <RoleMatchForm title={application.role} market={market} overrides={roleAliases} onConfirm={confirmRole} />
    {roleMatch && <div className="research-actions"><button disabled={busy} onClick={() => void researchSalary()}>Research salary</button><button disabled={busy} onClick={() => void refresh()}>Refresh official sources</button></div>}
    <p role="status" className="research-status">{busy ? "Researching official salary data…" : message}</p>
    {error && <p role="alert" className="research-error">{error}</p>}
    {roleMatch && pendingEvidence.length > 0 && <section aria-label="Pending browser salary evidence" className="research-result">
      <h3>Salary evidence from Buddy</h3>
      <p className="research-help">These ranges were reviewed in the browser. Import only evidence that belongs to this application.</p>
      <ul>{pendingEvidence.map((evidence) => <li key={evidence.id}>
        <span>{evidence.currency} {evidence.minimum.toLocaleString("en-US")}–{evidence.maximum.toLocaleString("en-US")} / {evidence.period === "annual" ? "year" : "month"}</span>{" "}
        <button type="button" onClick={() => void importSalaryEvidence(evidence)}>Import salary evidence</button>
      </li>)}</ul>
    </section>}
    {estimate && nominal && <section aria-label="Salary estimate" className="research-result">
      <p className="research-range">{estimate.currency} {nominal.minimum.toLocaleString("en-US")}–{nominal.maximum.toLocaleString("en-US")} / {estimate.period === "annual" ? "year" : "month"}</p>
      <CurrencyComparison currency={estimate.currency} minimum={estimate.exactNominalRange.minimum} maximum={estimate.exactNominalRange.maximum} period={estimate.period} />
      {fallbackMessage && <p>{fallbackMessage}</p>}
      {estimate.exactAdjustedRange && <p>Equivalent in {estimate.assumptions.find((item) => item.startsWith("Equivalent in"))?.match(/Equivalent in ([0-9-]+) prices/)?.[1] ?? "current"} prices: {estimate.currency} {estimate.displayRange.minimum.toLocaleString("en-US")}–{estimate.displayRange.maximum.toLocaleString("en-US")} / {estimate.period === "annual" ? "year" : "month"}. Purchasing-power adjustment only.</p>}
      <dl className="research-facts"><div><dt>Confidence</dt><dd>{estimate.confidence}</dd></div><div><dt>Official occupation</dt><dd>{estimate.roleMatch.sourceOccupationCode}</dd></div><div><dt>Local evidence</dt><dd>{estimate.evidenceSummary.eligible} eligible · {estimate.evidenceSummary.excluded} excluded</dd></div></dl>
      {estimate.confidenceConditions.length > 0 && <div><h3>Confidence conditions</h3><ul>{estimate.confidenceConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul></div>}
      <h3>Assumptions and exclusions</h3><ul>{estimate.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
      <details><summary>Exact calculation</summary><p>{estimate.currency} {estimate.exactNominalRange.minimum.toLocaleString("en-US", { maximumFractionDigits: 2 })}–{estimate.exactNominalRange.maximum.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>{estimate.exclusions.map((exclusion) => <p key={exclusion}>{exclusion}</p>)}</details>
      <p>Official benchmark: {isSafeExternalHttpsUrl(estimate.benchmarkSourceUrl)
        ? <a href={estimate.benchmarkSourceUrl} target="_blank" rel="noopener noreferrer">Open official salary source</a>
        : "Source link unavailable"} · {estimate.benchmarkId}</p>
      <button onClick={() => void saveSnapshot()}>Save research snapshot</button>
    </section>}
    {roleMatch && <ObservationForm applicationId={application.id} market={market} canonicalRole={roleMatch.canonicalRole} onAdd={addObservation} now={now} />}
    {snapshots.length > 0 && <details><summary>Saved research history ({snapshots.length})</summary><ol>{[...snapshots].reverse().map((snapshot) => <li key={snapshot.id}><time dateTime={snapshot.calculatedAt}>{snapshot.calculatedAt.slice(0, 10)}</time> · {snapshot.currency} {snapshot.displayRange.minimum.toLocaleString("en-US")}–{snapshot.displayRange.maximum.toLocaleString("en-US")} · {snapshot.confidence}</li>)}</ol></details>}
  </div>;
}
