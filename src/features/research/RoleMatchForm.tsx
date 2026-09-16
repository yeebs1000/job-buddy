import { useMemo, useState, type FormEvent } from "react";
import type { Market, RoleAliasOverride, RoleMatch } from "../../domain/research";
import { roleCatalog } from "./roleCatalog";
import { matchRole, normalizeRoleTitle } from "./matchRole";

export function RoleMatchForm({ title, market, overrides = [], onConfirm }: {
  title: string;
  market: Market;
  overrides?: RoleAliasOverride[];
  onConfirm: (match: RoleMatch, reuse: boolean) => void | Promise<void>;
}) {
  const proposed = useMemo(() => {
    try { return matchRole({ title, market, overrides }); } catch { return undefined; }
  }, [market, overrides, title]);
  const [canonicalRole, setCanonicalRole] = useState(proposed?.canonicalRole ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [reuse, setReuse] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const entry = roleCatalog.find((candidate) => candidate.canonicalRole === canonicalRole);
    if (!entry || !confirmed) return;
    const match: RoleMatch = proposed?.canonicalRole === canonicalRole ? proposed : {
      originalTitle: title.trim(),
      normalizedTitle: normalizeRoleTitle(title),
      canonicalRole,
      sourceOccupationCode: entry.sourceCodes[market],
      strength: market === "HK" ? "limited" : "exact",
      ruleId: `manual:${entry.id}`,
      overridden: true,
    };
    void onConfirm(match, reuse);
  }

  return <form className="research-role" onSubmit={submit}>
    <fieldset><legend>Role mapping</legend>
      <p className="research-help">Confirm the official software/IT occupation used for salary research.</p>
      <label>Official role match<select value={canonicalRole} onChange={(event) => { setCanonicalRole(event.target.value); setConfirmed(false); }}>
        <option value="">Choose a supported role</option>
        {roleCatalog.map((entry) => <option key={entry.id} value={entry.canonicalRole}>{entry.canonicalRole.replaceAll("-", " ")}</option>)}
      </select></label>
      <label className="research-check"><input type="checkbox" checked={confirmed} disabled={!canonicalRole} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this role mapping</label>
      <label className="research-check"><input type="checkbox" checked={reuse} onChange={(event) => setReuse(event.target.checked)} />Use this title mapping for future applications</label>
      <button type="submit" disabled={!canonicalRole || !confirmed}>Confirm role mapping</button>
    </fieldset>
  </form>;
}
