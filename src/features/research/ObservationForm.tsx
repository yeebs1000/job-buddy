import { useState, type FormEvent } from "react";
import { salaryObservationSchema, type Market, type SalaryObservation } from "../../domain/research";

export function ObservationForm({ applicationId, market, canonicalRole, onAdd, now = Date.now }: {
  applicationId: string;
  market: Market;
  canonicalRole: string;
  onAdd: (observation: SalaryObservation) => Promise<void> | void;
  now?: () => number;
}) {
  const [provenance, setProvenance] = useState<SalaryObservation["provenance"]>("job_posting");
  const [reusable, setReusable] = useState(true);
  const [error, setError] = useState("");
  const currency = market === "SG" ? "SGD" : market === "HK" ? "HKD" : "USD";
  const period = market === "US" ? "annual" : "monthly";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const minimum = Number(value("minimum"));
    const maximumText = value("maximum");
    const observedDate = value("observedAt");
    const candidate = {
      id: crypto.randomUUID(), applicationId, provenance, market, currency, period, minimum,
      ...(maximumText ? { maximum: Number(maximumText) } : {}), canonicalRole,
      observedAt: new Date(`${observedDate}T00:00:00.000Z`).toISOString(),
      ...(value("sourceUrl") ? { sourceUrl: value("sourceUrl") } : {}),
      ...(value("evidenceExcerpt") ? { evidenceExcerpt: value("evidenceExcerpt") } : {}),
      reusable,
    };
    const parsed = salaryObservationSchema.safeParse(candidate);
    if (!parsed.success) { setError("Check the salary range, date, and optional source URL."); return; }
    setError("");
    await onAdd(parsed.data);
    form.reset();
  }

  return <form className="research-observation" onSubmit={(event) => void submit(event)}>
    <fieldset><legend>Add salary evidence</legend>
      {error && <p role="alert">{error}</p>}
      <label>Evidence type<select value={provenance} onChange={(event) => {
        const next = event.target.value as SalaryObservation["provenance"];
        setProvenance(next); setReusable(next !== "offer");
      }}><option value="job_posting">Job posting</option><option value="recruiter">Recruiter</option><option value="offer">Private offer</option><option value="manual">Manual research</option></select></label>
      <div className="research-grid"><label>Minimum salary<input name="minimum" type="number" min="1" required /></label><label>Maximum salary<input name="maximum" type="number" min="1" /></label></div>
      <p className="research-help">{currency} / {period === "annual" ? "year" : "month"}. Currencies are never converted.</p>
      <label>Observed date<input name="observedAt" type="date" required defaultValue={new Date(now()).toISOString().slice(0, 10)} /></label>
      <label>Source URL<input name="sourceUrl" type="url" placeholder="https://…" /></label>
      <label>Evidence excerpt<textarea name="evidenceExcerpt" maxLength={500} /></label>
      <label className="research-check"><input type="checkbox" checked={reusable} onChange={(event) => setReusable(event.target.checked)} />Reuse in market estimates</label>
      <button type="submit">Add salary evidence</button>
    </fieldset>
  </form>;
}
