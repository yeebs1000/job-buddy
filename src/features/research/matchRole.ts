import type { Market, RoleAliasOverride, RoleMatch } from "../../domain/research";
import { roleCatalog } from "./roleCatalog";

export function normalizeRoleTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchRole(input: {
  title: string;
  market: Market;
  overrides?: RoleAliasOverride[];
  overrideCode?: string;
}): RoleMatch {
  const normalizedTitle = normalizeRoleTitle(input.title);
  if (!normalizedTitle) throw new Error("unsupported-role");

  if (input.overrideCode) {
    const corrected = roleCatalog.find((entry) => entry.sourceCodes[input.market] === input.overrideCode);
    if (!corrected) throw new Error("unsupported-role-code");
    return result(input.title, normalizedTitle, corrected.canonicalRole, input.overrideCode, "exact", `code:${input.overrideCode}`, true);
  }

  const alias = input.overrides?.find((candidate) => candidate.market === input.market
    && normalizeRoleTitle(candidate.normalizedTitle) === normalizedTitle);
  if (alias) {
    return result(input.title, normalizedTitle, alias.canonicalRole, alias.sourceOccupationCode, "exact", `alias:${alias.id}`, true);
  }

  const candidates = roleCatalog.flatMap((entry) => entry.aliases.map((rule) => ({ entry, rule, normalizedAlias: normalizeRoleTitle(rule.value) })))
    .filter(({ normalizedAlias }) => normalizedTitle === normalizedAlias
      || normalizedTitle.startsWith(`${normalizedAlias} `)
      || normalizedTitle.endsWith(` ${normalizedAlias}`))
    .sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);
  const selected = candidates[0];
  if (!selected) throw new Error("unsupported-role");

  return result(
    input.title,
    normalizedTitle,
    selected.entry.canonicalRole,
    selected.entry.sourceCodes[input.market],
    input.market === "HK" ? "limited" : selected.rule.strength,
    selected.entry.id,
    false,
  );
}

function result(
  originalTitle: string,
  normalizedTitle: string,
  canonicalRole: string,
  sourceOccupationCode: string,
  strength: RoleMatch["strength"],
  ruleId: string,
  overridden: boolean,
): RoleMatch {
  return { originalTitle: originalTitle.trim(), normalizedTitle, canonicalRole, sourceOccupationCode, strength, ruleId, overridden };
}
