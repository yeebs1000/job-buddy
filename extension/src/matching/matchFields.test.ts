import { describe, expect, it } from "vitest";
import { matchField } from "./matchFields";

describe("matchField", () => {
  it.each([
    ["Are you legally authorized to work in the United States?", "preferences.usAuthorization"],
    ["Will you now or in the future require sponsorship to work in the US?", "preferences.usSponsorship"],
    ["Do you require visa sponsorship in Singapore?", "preferences.sgSponsorship"],
    ["Do you require visa sponsorship in Hong Kong?", "preferences.hkSponsorship"],
    ["Expected annual salary (USD)", "preferences.salaryUSDAnnual"],
    ["Notice period", "preferences.noticePeriod"],
    ["Available start date", "preferences.availabilityDate"],
    ["Willing to relocate", "preferences.relocation"],
  ])("requires review for the saved answer to %s", (label, canonicalPath) => {
    expect(matchField(raw({ label }))).toMatchObject({ canonicalPath, risk: "review" });
  });

  it.each([
    ["Expected monthly salary (SGD)", "salary_sgd"],
    ["Expected hourly salary (USD)", "salary_usd"],
    ["Expected salary (SGD)", "salary_sgd"],
    ["Are you NOT authorized to work in Singapore?", "work_authorization_sg"],
    ["Are you authorized to work in Singapore or Hong Kong?", ""],
    ["Will you require sponsorship?", "work_authorization_sg"],
    ["Are you authorized to work?", ""],
  ])("does not guess an answer for %s", (label, name) => {
    expect(matchField(raw({ label, name })).canonicalPath).toBeUndefined();
  });
  it("uses exact autocomplete before a conflicting nearby label", () => {
    expect(matchField({
      id: "candidate-email",
      label: "Recruiter email",
      kind: "email",
      required: true,
      currentValuePresent: false,
      autocomplete: "email",
      name: "contact",
      helpText: "",
    })).toMatchObject({ canonicalPath: "contact.email", confidence: 1, risk: "safe", reason: "standard-autocomplete" });
  });

  it("maps explicit aliases conservatively", () => {
    expect(matchField(raw({ label: "First name", name: "first_name" }))).toMatchObject({ canonicalPath: "identity.givenName", confidence: 0.95, risk: "safe" });
    expect(matchField(raw({ label: "LinkedIn profile", name: "linkedin_url", kind: "url" }))).toMatchObject({ canonicalPath: "links.linkedin", confidence: 0.95, risk: "safe" });
  });

  it("classifies salary and authorization as review-required", () => {
    expect(matchField(raw({ label: "Expected annual salary (SGD)", name: "salary_sgd" }))).toMatchObject({ canonicalPath: "preferences.salarySGDAnnual", risk: "review" });
    expect(matchField(raw({ label: "Are you authorised to work in Singapore?", name: "work_authorization_sg" }))).toMatchObject({ canonicalPath: "preferences.sgAuthorization", risk: "review" });
  });

  it("keeps EEO, files, credentials, and submit controls manual", () => {
    expect(matchField(raw({ label: "Gender", name: "gender" }))).toMatchObject({ risk: "manual" });
    expect(matchField(raw({ label: "Upload resume", name: "resume", kind: "file" }))).toMatchObject({ risk: "manual" });
    expect(matchField(raw({ label: "Account password", name: "password", inputType: "password" }))).toMatchObject({ risk: "manual" });
    expect(matchField(raw({ label: "Submit application", name: "submit", inputType: "submit", kind: "other" }))).toMatchObject({ risk: "manual" });
  });

  it("leaves an ambiguous or fuzzy label unresolved", () => {
    expect(matchField(raw({ label: "Tell us something", name: "something" }))).toMatchObject({ canonicalPath: undefined, confidence: 0, risk: "review", reason: "unresolved" });
  });
});

function raw(overrides: Record<string, unknown>) {
  return {
    id: "field-1", label: "Unknown", kind: "text" as const, required: false,
    currentValuePresent: false, autocomplete: "", name: "", helpText: "", inputType: "text",
    ...overrides,
  };
}
