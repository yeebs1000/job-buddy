import type { Market, RoleMatchStrength } from "../../domain/research";

export interface RoleAliasRule {
  value: string;
  strength: RoleMatchStrength;
}

export interface RoleCatalogEntry {
  id: string;
  canonicalRole: string;
  aliases: RoleAliasRule[];
  sourceCodes: Record<Market, string>;
}

// v1 deliberately covers software and IT only. Every mapping is explicit and
// traceable; title matching never guesses via fuzzy distance or an LLM.
export const roleCatalog: readonly RoleCatalogEntry[] = [
  {
    id: "software-engineer",
    canonicalRole: "software-engineer",
    aliases: [
      { value: "backend software engineer", strength: "exact" },
      { value: "frontend software engineer", strength: "exact" },
      { value: "full stack software engineer", strength: "exact" },
      { value: "software engineer backend", strength: "exact" },
      { value: "software developer", strength: "exact" },
      { value: "software engineer", strength: "exact" },
      { value: "product engineer", strength: "moderate" },
    ],
    sourceCodes: { SG: "2512", HK: "2", US: "15-1252" },
  },
  {
    id: "site-reliability-engineer",
    canonicalRole: "site-reliability-engineer",
    aliases: [
      { value: "site reliability engineer", strength: "moderate" },
      { value: "sre", strength: "moderate" },
    ],
    sourceCodes: { SG: "2523", HK: "2", US: "15-1252" },
  },
  {
    id: "devops-engineer",
    canonicalRole: "devops-engineer",
    aliases: [
      { value: "devops engineer", strength: "moderate" },
      { value: "platform engineer", strength: "moderate" },
    ],
    sourceCodes: { SG: "2523", HK: "2", US: "15-1252" },
  },
  {
    id: "data-engineer",
    canonicalRole: "data-engineer",
    aliases: [
      { value: "data engineer", strength: "moderate" },
      { value: "database architect", strength: "exact" },
    ],
    sourceCodes: { SG: "2521", HK: "2", US: "15-1243" },
  },
  {
    id: "cybersecurity-analyst",
    canonicalRole: "cybersecurity-analyst",
    aliases: [
      { value: "cybersecurity analyst", strength: "exact" },
      { value: "information security analyst", strength: "exact" },
      { value: "security analyst", strength: "moderate" },
    ],
    sourceCodes: { SG: "2524", HK: "2", US: "15-1212" },
  },
  {
    id: "cloud-engineer",
    canonicalRole: "cloud-engineer",
    aliases: [
      { value: "cloud infrastructure engineer", strength: "moderate" },
      { value: "cloud engineer", strength: "moderate" },
    ],
    sourceCodes: { SG: "2523", HK: "2", US: "15-1244" },
  },
  {
    id: "software-quality-assurance",
    canonicalRole: "software-quality-assurance",
    aliases: [
      { value: "software quality assurance analyst", strength: "exact" },
      { value: "quality assurance engineer", strength: "exact" },
      { value: "qa engineer", strength: "exact" },
      { value: "test engineer", strength: "moderate" },
    ],
    sourceCodes: { SG: "2519", HK: "2", US: "15-1253" },
  },
  {
    id: "systems-analyst",
    canonicalRole: "systems-analyst",
    aliases: [
      { value: "computer systems analyst", strength: "exact" },
      { value: "systems analyst", strength: "exact" },
      { value: "business systems analyst", strength: "moderate" },
    ],
    sourceCodes: { SG: "2511", HK: "2", US: "15-1211" },
  },
  {
    id: "network-engineer",
    canonicalRole: "network-engineer",
    aliases: [
      { value: "computer network architect", strength: "exact" },
      { value: "network engineer", strength: "moderate" },
    ],
    sourceCodes: { SG: "2523", HK: "2", US: "15-1241" },
  },
  {
    id: "database-administrator",
    canonicalRole: "database-administrator",
    aliases: [
      { value: "database administrator", strength: "exact" },
      { value: "database engineer", strength: "moderate" },
      { value: "dba", strength: "exact" },
    ],
    sourceCodes: { SG: "2521", HK: "2", US: "15-1242" },
  },
  {
    id: "it-support-specialist",
    canonicalRole: "it-support-specialist",
    aliases: [
      { value: "it support specialist", strength: "exact" },
      { value: "it support analyst", strength: "exact" },
      { value: "computer support specialist", strength: "exact" },
      { value: "help desk specialist", strength: "moderate" },
    ],
    sourceCodes: { SG: "3512", HK: "3", US: "15-1232" },
  },
] as const;
