import { useLiveQuery } from "dexie-react-hooks";
import { researchRepository } from "../research/researchRepository";
import { webSalaryRepository } from "../research/webSalaryRepository";
import { blendWebSalary } from "../research/webSalary";
import type { Application } from "../../domain/application";
import { companyRatingRepository } from "../research/companyRatingRepository";
import { InlineResearchPanel } from "./InlineResearchPanel";

export function SalarySummary({ application }: { application: Application }) {
  const saved = useLiveQuery(async () => {
    try { return { official: await researchRepository.latestSnapshot(application.id), web: await webSalaryRepository.get(application.id), rating: await companyRatingRepository.get(application.id) }; }
    catch { return { failed: true }; }
  }, [application.id]);
  const web = saved?.web;
  const blend = web && blendWebSalary(web.evidence, web.currency, web.basis);
  const official = saved?.official;
  const useWeb = Boolean(blend && (!official || web!.savedAt >= official.calculatedAt));
  const imported = !useWeb && !official ? application.research?.salary : undefined;
  const currency = useWeb ? web!.currency : official?.currency ?? imported?.currency;
  const minimum = useWeb ? blend!.minimum : official?.displayRange.minimum ?? imported?.minimum;
  const maximum = useWeb ? blend!.maximum : official?.displayRange.maximum ?? imported?.maximum;
  const format = (value: number) => new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  const rating = saved?.rating ?? application.research?.companyRating;
  const normalize = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  const currentLocation = [application.location.city, application.location.state, application.location.country].filter(Boolean).join(", ");
  const staleQuery = useWeb && web && (normalize(web.query.company) !== normalize(application.company) || normalize(web.query.role) !== normalize(application.role) || normalize(web.query.location) !== normalize(currentLocation));
  return <div className="command-center__market">
    <div className="command-center__research-summary"><div><span className="command-center__research-label">Salary range</span>
      {currency && minimum !== undefined ? <><strong>{format(minimum)}–{format(maximum ?? minimum)}</strong><span>{useWeb ? ` / year · ${web!.basis === "base" ? "base salary" : "total compensation"}` : ` / ${official?.period ?? imported?.period}`}</span>
        <small>{imported ? "Imported / unverified · Pay basis not provided" : `${useWeb ? `${blend!.confidence} confidence · ${blend!.count} publisher${blend!.count === 1 ? "" : "s"}` : `${official!.confidence} confidence · saved benchmark`} · Saved ${(useWeb ? web!.savedAt : official!.calculatedAt).slice(0, 10)}`}</small></>
        : <span>{saved?.failed ? "Research could not be loaded" : "No saved salary range"}</span>}
      {staleQuery && <small className="research-warning">For previous application details—refresh needed.</small>}
    </div><div><span className="command-center__research-label">Employee rating</span>
      {rating ? <><strong>{rating.score} / {rating.outOf}</strong><small>{saved?.rating ? `${saved.rating.provider} · Reviewed ${saved.rating.savedAt.slice(0, 10)}${saved.rating.reviewCount ? ` · ${saved.rating.reviewCount.toLocaleString()} reviews` : ""}` : `${application.research!.companyRating!.source} · Imported / unverified`}</small>
        {saved?.rating && <a href={saved.rating.url} target="_blank" rel="noopener noreferrer">Rating source</a>}
        {saved?.rating && normalize(saved.rating.company) !== normalize(application.company) && <small className="research-warning">For previous company details—refresh needed.</small>}</> : <span>No saved company rating</span>}
    </div></div>
    <InlineResearchPanel key={`${application.id}:${application.company}:${application.role}:${currentLocation}`} application={application} />
  </div>;
}
