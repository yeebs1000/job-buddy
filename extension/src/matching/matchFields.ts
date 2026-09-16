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

  const autocomplete = raw.autocomplete?.trim().toLowerCase().split(/\s+/).at(-1) ?? "";
  const autocompletePath = autocompletePaths[autocomplete];
  if (autocompletePath) return result(raw, autocompletePath, 1, riskForPath(autocompletePath), "standard-autocomplete");

  const normalizedName = normalize(raw.name ?? "");
  const namePath = exactAliases[normalizedName];
  if (namePath) return result(raw, namePath, 0.95, riskForPath(namePath), "known-field-alias");

  const normalizedLabel = normalize(raw.label);
  if (/salary|compensation|expected pay/.test(normalizedLabel)) {
    if (/sgd|singapore/.test(normalizedLabel)) return result(raw, "preferences.salarySGDAnnual", 0.9, "review", "market-salary-label");
    if (/hkd|hong kong/.test(normalizedLabel)) return result(raw, "preferences.salaryHKDAnnual", 0.9, "review", "market-salary-label");
  }
  if (/authori[sz](ed|ation).*singapore|right to work.*singapore/.test(normalizedLabel)) return result(raw, "preferences.sgAuthorization", 0.9, "review", "market-authorization-label");
  if (/authori[sz](ed|ation).*hong kong|right to work.*hong kong/.test(normalizedLabel)) return result(raw, "preferences.hkAuthorization", 0.9, "review", "market-authorization-label");

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
