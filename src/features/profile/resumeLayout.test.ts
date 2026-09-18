import { describe, expect, it } from "vitest";
import { parseResumeText } from "./resumeParser";
import { reconstructPdfText } from "./resumeText";

// Fictional content, reproducing Word's organisation/date columns and wrapped bullets.
export const realisticResume = `Alex Chen
EDUCATION
Example University (EU)\tAug 2026 – Expected Jul 2027
Master of Finance — Specialising in Corporate Finance

Sample Institute of Technology\tAug 2019 – May 2023
Bachelor of Engineering (Honours), Materials Science & Engineering; Minor in Business Management
PROFESSIONAL EXPERIENCE
Example Labs Pte Ltd\tSept 2025 – Present
Strategy & Operations Manager\tSingapore
• Lead regional initiatives and coordinate
cross-functional delivery.
• Automate reporting with Python.

Sample Consulting\tApr 2025 – Aug 2025
Consulting Intern\tHong Kong
• Reviewed operational controls.

Example Engineering Company\tJune 2023 – Mar 2025
Planning Executive\tSingapore
• Built schedules with teams at partner organisations.

Sample Lighting\tDec 2021 – May 2022
Proposal Management Intern\tSingapore
• Designed lighting solutions.

Example Hall — Student Committee\tMay 2020 – Aug 2022
President (2021–22); Finance Director (2020–21)\tSingapore
• Managed student programmes.
PERSONAL PROJECTS
• Trading simulator (Python, SQL) — evaluates signals
with bounded risk in paper trading.
• Research assistant — searches public reports
and organises notes.
• Local inference node — runs on a home server.
SKILLS, LANGUAGES & INTERESTS
Technical: Python, SQL, Excel & VBA, Power BI
Languages: English and Mandarin
Interests: Tennis and chess`;

describe("realistic resume layout", () => {
  it("keeps bullets under named projects instead of treating them as project titles", () => {
    const projects = parseResumeText("PROJECTS\nPortfolio Tracker\n• Built a dashboard.\n• Added charts.\n\nWeather Dashboard\n• Added forecasts.").suggestions;
    expect(projects).toHaveLength(2);
    expect(projects[0].values).toMatchObject({ title: "Portfolio Tracker", summary: "• Built a dashboard.\n• Added charts." });
    expect(projects[1].values).toMatchObject({ title: "Weather Dashboard", summary: "• Added forecasts." });
  });
  it("recognises a role-first dated header without reversing the employer", () => {
    const jobs = parseResumeText("EXPERIENCE\nSoftware Engineer\tJan 2024 - Present\nExample Labs\n• Built APIs.").suggestions;
    expect(jobs[0].values).toMatchObject({ employer: "Example Labs", title: "Software Engineer", startMonth: "2024-01", current: "true", summary: "• Built APIs." });
  });
  it("keeps organisation, dates and qualification together", () => {
    const result = parseResumeText(realisticResume).suggestions.filter((item) => item.section === "education");
    expect(result).toHaveLength(2);
    expect(result[0].values).toMatchObject({ institution: "Example University (EU)", degree: "Master of Finance", fieldOfStudy: "Corporate Finance", startMonth: "2026-08", endMonth: "2027-07" });
    expect(result[1].values).toMatchObject({ institution: "Sample Institute of Technology", degree: "Bachelor of Engineering (Honours)", fieldOfStudy: "Materials Science & Engineering; Minor in Business Management" });
    expect(parseResumeText(realisticResume).warnings.join(" ")).toMatch(/expected/i);
  });
  it("keeps five jobs with attached bullets rather than consuming the entry limit", () => {
    const result = parseResumeText(realisticResume).suggestions.filter((item) => item.section === "experience");
    expect(result).toHaveLength(5);
    expect(result[0].values).toMatchObject({ employer: "Example Labs Pte Ltd", title: "Strategy & Operations Manager", location: "Singapore", startMonth: "2025-09", current: "true" });
    expect(result[0].values.summary).toContain("coordinate cross-functional delivery.");
    expect(result[1].values).toMatchObject({ employer: "Sample Consulting", title: "Consulting Intern", location: "Hong Kong", startMonth: "2025-04", endMonth: "2025-08" });
    expect(result[4].values).toMatchObject({ employer: "Example Hall — Student Committee", title: "President (2021–22); Finance Director (2020–21)", startMonth: "2020-05", endMonth: "2022-08" });
  });
  it("joins project continuations and stops before skills/languages/interests", () => {
    const draft = parseResumeText(realisticResume);
    const projects = draft.suggestions.filter((item) => item.section === "projects");
    expect(projects).toHaveLength(3);
    expect(projects[0].values.summary).toContain("with bounded risk in paper trading.");
    expect(draft.suggestions.find((item) => item.section === "skills")?.values.items).toBe("Python, SQL, Excel & VBA, Power BI");
  });
  it("does not promote orphan bullets or continuation lines to jobs", () => {
    expect(parseResumeText("EXPERIENCE\n• Led regional planning\nacross departments.").suggestions).toEqual([]);
  });
  it("does not turn an achievement year into a new employer", () => {
    const text = "EXPERIENCE\nExample Labs\tJan 2024 - Present\nSoftware Engineer\tSingapore\n• Delivered the 2025-2026 platform roadmap.\nWorked with teams at partner companies.";
    const jobs = parseResumeText(text).suggestions.filter((item) => item.section === "experience");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].values.summary).toContain("2025-2026 platform roadmap");
  });
  it("reconstructs Word empty EOL markers once, retains columns and joins word fragments", () => {
    const item = (str: string, x: number, y: number, width: number, hasEOL = false) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL });
    const text = reconstructPdfText([
      item("Example University", 50, 700, 120), item("Aug 2026 – Jul 2027", 400, 700, 100),
      item("", 50, 688, 0, true), item("Master of Finance", 50, 688, 90),
      item("", 50, 676, 0, true), item("F", 50, 676, 5), item("inancial", 55, 676, 35), item("modelling", 95, 676, 45),
    ]);
    expect(text).toBe("Example University\tAug 2026 – Jul 2027\nMaster of Finance\nFinancial modelling");
  });
});
