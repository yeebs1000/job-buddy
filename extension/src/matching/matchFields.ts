import type { DetectedField, FieldRisk } from "../../../src/domain/buddy";
import type { ProfilePath } from "../../../src/domain/profile";

export interface RawField {
  id: string;
  label: string;
  kind: DetectedField["kind"];
  required: boolean;
  currentValuePresent: boolean;
  autocomplete?: string;
  name?: string;
  helpText?: string;
  inputType?: string;
}

const autocompletePaths: Record<string, ProfilePath> = {
  "given-name": "identity.givenName",
  "family-name": "identity.familyName",
  nickname: "identity.preferredName",
  email: "contact.email",
  "tel-country-code": "contact.phoneCountryCode",
  "tel-national": "contact.phoneNational",
  tel: "contact.phoneNational",
  "address-line1": "contact.addressLine1",
  "address-line2": "contact.addressLine2",
  "address-level2": "contact.city",
  "address-level1": "contact.region",
  "postal-code": "contact.postalCode",
  "country-name": "contact.country",
};

const exactAliases: Record<string, ProfilePath> = {
  "first name": "identity.givenName",
  firstname: "identity.givenName",
  "last name": "identity.familyName",
  lastname: "identity.familyName",
  "preferred name": "identity.preferredName",
  email: "contact.email",
  "email address": "contact.email",
  phone: "contact.phoneNational",
  "phone number": "contact.phoneNational",
  "linkedin url": "links.linkedin",
  linkedin: "links.linkedin",
  "github url": "links.github",
  github: "links.github",
  "portfolio url": "links.portfolio",
  portfolio: "links.portfolio",
  skills: "skills",
  "notice period": "preferences.noticePeriod",
  "available start date": "preferences.availabilityDate",
  "availability date": "preferences.availabilityDate",
  "willing to relocate": "preferences.relocation",
  "relocation preference": "preferences.relocation",
  "work arrangement": "preferences.workArrangement",
  "salary sgd": "preferences.salarySGDAnnual",
  "salary hkd": "preferences.salaryHKDAnnual",
  "work authorization sg": "preferences.sgAuthorization",
  "work authorisation sg": "preferences.sgAuthorization",
  "work authorization hk": "preferences.hkAuthorization",
  "work authorisation hk": "preferences.hkAuthorization",
};

const manualPattern = /\b(gender|race|ethnicity|veteran|disability|demographic|eeo|equal opportunity|captcha|password|passcode|one[- ]time|signature|attest|declaration|consent|upload|resume|cv|submit application)\b/i;

export function matchField(raw: RawField): DetectedField {
  const combined = `${raw.label} ${raw.name ?? ""} ${raw.helpText ?? ""}`;
  if (raw.kind === "file" || raw.inputType === "password" || raw.inputType === "submit" || manualPattern.test(combined)) {
    return result(raw, undefined, 1, "manual", "manual-only-field");
  }

  // These answers are not interchangeable. Resolve the visible question before aliases.
  const question = normalize(raw.label);
  const marketPaths = [
    { test: /\b(singapore|sg|sgd)\b/, auth: "preferences.sgAuthorization", sponsor: "preferences.sgSponsorship", salary: "preferences.salarySGDAnnual" },
    { test: /\b(hong kong|hk|hkd)\b/, auth: "preferences.hkAuthorization", sponsor: "preferences.hkSponsorship", salary: "preferences.salaryHKDAnnual" },
    { test: /\b(united states|usa|us|usd)\b/, auth: "preferences.usAuthorization", sponsor: "preferences.usSponsorship", salary: "preferences.salaryUSDAnnual" },
  ] as const;
  const markets = marketPaths.filter((market) => market.test.test(question));
  if (/sponsor|authori[sz]|right to work|salary|compensation|expected pay/.test(question)) {
    if (markets.length !== 1 || /\b(not|without|never|no longer)\b/.test(question)) return result(raw, undefined, 0, "review", "ambiguous-preference");
    const market = markets[0];
    if (/sponsor/.test(question)) return result(raw, market.sponsor, 0.9, "review", "market-sponsorship-label");
    if (/authori[sz]|right to work/.test(question)) return result(raw, market.auth, 0.9, "review", "market-authorization-label");
    if (/\b(annual|annually|year|yearly)\b/.test(question) && !/\b(hour|hourly|month|monthly|week|weekly)\b/.test(question)) return result(raw, market.salary, 0.9, "review", "market-salary-label");
    return result(raw, undefined, 0, "review", "unspecified-pay-period");
  }

  const autocomplete = raw.autocomplete?.trim().toLowerCase().split(/\s+/).at(-1) ?? "";
  const autocompletePath = autocompletePaths[autocomplete];
  if (autocompletePath) return result(raw, autocompletePath, 1, riskForPath(autocompletePath), "standard-autocomplete");

  const normalizedName = normalize(raw.name ?? "");
  const namePath = exactAliases[normalizedName];
  if (namePath && /salary|Authorization/.test(namePath)) return result(raw, undefined, 0, "review", "question-context-required");
  if (namePath) return result(raw, namePath, 0.95, riskForPath(namePath), "known-field-alias");

  const normalizedLabel = normalize(raw.label);

  const labelPath = exactAliases[normalizedLabel];
  if (labelPath) return result(raw, labelPath, 0.9, riskForPath(labelPath), "normalized-label-alias");
  return result(raw, undefined, 0, "review", "unresolved");
}

function result(raw: RawField, canonicalPath: ProfilePath | undefined, confidence: number, risk: FieldRisk, reason: string): DetectedField {
  return {
    id: raw.id,
    label: raw.label,
    kind: raw.kind,
    required: raw.required,
    currentValuePresent: raw.currentValuePresent,
    canonicalPath,
    confidence,
    risk,
    reason,
  };
}

function riskForPath(path: ProfilePath): FieldRisk {
  return path.startsWith("preferences.") || path.startsWith("standardAnswers.") ? "review" : "safe";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
