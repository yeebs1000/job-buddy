import { describe, expect, it } from "vitest";
import { emptyCandidateProfile } from "../../domain/profile";
import { applyResumeSuggestions, parseResumeText, suggestionConflict } from "./resumeParser";

const resume = `Alex Chen
alex.chen@example.com | +65 8123 4567
linkedin.com/in/alexchen | github.com/alexchen
Location: Singapore

EDUCATION
Example University
BSc Computer Science
Sep 2020 - Jun 2024

EXPERIENCE
Software Engineer | Example Labs
Jul 2024 - Present
Built payment APIs with TypeScript.

PROJECTS
Portfolio Tracker
https://example.com/tracker
Built a portfolio dashboard.

SKILLS
TypeScript, React, SQL, Python

PERSONAL DETAILS
Nationality: Singaporean
Salary: 100000
Needs no sponsorship`;

describe("local resume suggestions", () => {
  it("extracts reviewable facts without inferring application preferences", () => {
    const draft = parseResumeText(resume);
    const profile = applyResumeSuggestions(structuredClone(emptyCandidateProfile), draft.suggestions);
    expect(profile.identity).toMatchObject({ givenName: "Alex", familyName: "Chen" });
    expect(profile.contact).toMatchObject({ email: "alex.chen@example.com", phoneCountryCode: "+65", phoneNational: "81234567", city: "Singapore" });
    expect(profile.links).toMatchObject({ linkedin: "https://linkedin.com/in/alexchen", github: "https://github.com/alexchen" });
    expect(profile.education[0]).toMatchObject({ institution: "Example University", degree: "BSc Computer Science", startMonth: "2020-09", endMonth: "2024-06" });
    expect(profile.experience[0]).toMatchObject({ employer: "Example Labs", title: "Software Engineer", startMonth: "2024-07", current: true });
    expect(profile.projects[0]).toMatchObject({ title: "Portfolio Tracker", url: "https://example.com/tracker" });
    expect(profile.skills).toEqual(["TypeScript", "React", "SQL", "Python"]);
    expect(profile.preferences).toEqual({});
    expect(profile.standardAnswers).toEqual([]);
    expect(draft.suggestions.every((item) => item.source.length > 0)).toBe(true);
  });

  it("protects existing facts unless replacement is explicitly allowed", () => {
    const existing = { ...structuredClone(emptyCandidateProfile), contact: { email: "keep@example.com" }, skills: ["SQL"] };
    const draft = parseResumeText(resume);
    const email = draft.suggestions.find((item) => item.values.email)!;
    expect(suggestionConflict(existing, email)).toBe(true);
    expect(applyResumeSuggestions(existing, draft.suggestions).contact.email).toBe("keep@example.com");
    expect(applyResumeSuggestions(existing, [email], true).contact.email).toBe("alex.chen@example.com");
    expect(existing.contact.email).toBe("keep@example.com");
  });

  it("deduplicates collections and skills when the same resume is imported again", () => {
    const suggestions = parseResumeText(resume).suggestions;
    const once = applyResumeSuggestions(structuredClone(emptyCandidateProfile), suggestions);
    const twice = applyResumeSuggestions(once, suggestions);
    expect(twice.education).toHaveLength(1);
    expect(twice.experience).toHaveLength(1);
    expect(twice.projects).toHaveLength(1);
    expect(twice.skills).toEqual(once.skills);
  });

  it("does not invent months, country codes or names from headings", () => {
    const draft = parseResumeText("CURRICULUM VITAE\ncontact@example.com\n8123 4567\nEDUCATION\nExample University\nBSc Computing\n2020 - 2024");
    const profile = applyResumeSuggestions(structuredClone(emptyCandidateProfile), draft.suggestions);
    expect(profile.identity).toEqual({});
    expect(profile.contact.phoneCountryCode).toBeUndefined();
    expect(profile.education[0]?.startMonth).toBeUndefined();
  });

  it("reports unrecognized input and rejects oversized text", () => {
    expect(parseResumeText("An unstructured paragraph about my career.").suggestions).toEqual([]);
    expect(() => parseResumeText("x".repeat(100001))).toThrow(/100,000/);
  });

  it("does not treat education at the start as a person's name", () => {
    const result = parseResumeText("EDUCATION\nExample University\nBSc Computing\nEXPERIENCE\nProduct Specialist | Example Labs");
    expect(result.suggestions.some((item) => item.section === "identity")).toBe(false);
  });

  it("separates explicitly labelled jobs even without blank lines", () => {
    const result = parseResumeText("EXPERIENCE\nEngineer | Example Labs\nJan 2024 - Present\nBuilt APIs\nIntern | Example Bank\nJun 2023 - Dec 2023\nWrote tests");
    expect(result.suggestions.filter((item) => item.section === "experience")).toHaveLength(2);
  });

  it("rejects invalid edits and capacity overflow without changing the original", () => {
    const email = parseResumeText("a@example.com").suggestions[0];
    expect(() => applyResumeSuggestions(emptyCandidateProfile, [{ ...email, values: { email: "invalid" } }])).toThrow(/valid/);
    const full = { ...structuredClone(emptyCandidateProfile), education: Array.from({ length: 5 }, (_, index) => ({ institution: `University ${index}` })) };
    expect(() => applyResumeSuggestions(full, parseResumeText("EDUCATION\nNew University").suggestions)).toThrow(/limits/);
    expect(full.education).toHaveLength(5);
  });

  it("rejects edited dates that the Profile month controls cannot display", () => {
    const education = parseResumeText("EDUCATION\nExample University\nSep 2020 - Jun 2024").suggestions[0];
    for (const startMonth of ["Jan 2020", "2020-13", "2020-00"]) {
      expect(() => applyResumeSuggestions(emptyCandidateProfile, [{ ...education, values: { ...education.values, startMonth } }])).toThrow(/YYYY-MM/);
    }
    const applied = applyResumeSuggestions(emptyCandidateProfile, [{ ...education, values: { ...education.values, startMonth: "2020-01" } }]);
    expect(applied.education[0].startMonth).toBe("2020-01");
  });
});
