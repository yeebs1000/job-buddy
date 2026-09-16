import { useState } from "react";
import type { DiscoveredJob, PostingPay } from "../../domain/discovery";
import { discoveryClient } from "./discoveryClient";
import { CurrencyComparison } from "../research/CurrencyComparison";

export function PostingSalary({ job }: { job: DiscoveredJob }) {
  const [salary, setSalary] = useState<PostingPay[]>(job.salary);
  const [status, setStatus] = useState(job.board.provider === "lever" ? "loaded" : "idle");
  async function load() {
    setStatus("loading");
    try { setSalary(await discoveryClient.salary(job.board, job.id.split(":").at(-1)!)); setStatus("loaded"); }
    catch { setStatus("error"); }
  }
  return <div className="posting-salary">
    {(status === "idle" || status === "loading" || status === "error") && <button type="button" className="button button--secondary" disabled={status === "loading"} onClick={() => void load()}>{status === "loading" ? "Checking salary…" : status === "error" ? "Retry posted salary" : "Check posted salary"}</button>}
    {status === "error" && <p role="alert">Could not check this posting. Try again.</p>}
    {status === "loaded" && !salary.length && <p className="research-help">No structured SGD, HKD or USD salary published through this API. Check the original posting.</p>}
    {salary.map((range, index) => <div key={index}>
      <p><strong>{range.currency} {range.minimum.toLocaleString("en-US")}–{range.maximum.toLocaleString("en-US")}</strong> · {range.period === "unspecified" ? "Pay period not specified" : range.period}</p>
      <p className="research-help">{range.label} · Employer-posted range; check the location and compensation terms.</p>
      <CurrencyComparison {...range} />
    </div>)}
  </div>;
}
