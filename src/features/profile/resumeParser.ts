import { candidateProfileSchema, type CandidateProfile } from "../../domain/profile";
import { parseResumeEntries } from "./resumeEntries";

type Section = "identity" | "contact" | "links" | "education" | "experience" | "projects" | "skills";
export interface ResumeSuggestion {
  id: string;
  section: Section;
  label: string;
  values: Record<string, string>;
  source: string;
  needsReview: boolean;
}
export interface ResumeDraft { suggestions: ResumeSuggestion[]; warnings: string[] }
const collections = new Set<Section>(["education", "experience", "projects"]);
const fields: Record<Section, readonly string[]> = {
  identity: ["givenName", "familyName"], contact: ["email", "phoneCountryCode", "phoneNational", "city"],
  links: ["linkedin", "github", "portfolio"],
  education: ["institution", "degree", "fieldOfStudy", "startMonth", "endMonth", "grade"],
  experience: ["employer", "title", "location", "startMonth", "endMonth", "current", "summary"],
  projects: ["title", "url", "summary"], skills: ["items"],
};
const sensitive = /^(?:nationality|citizenship|date of birth|dob|gender|ethnicity|religion|marital status|disability|veteran|passport|national id|salary|expected salary|work auth\w*|sponsorship|needs? .*sponsorship)\b/i;

function heading(line: string): Section | "skip" | null {
  const value = line.replace(/[:\s]+$/, "").toLowerCase();
  if (/^(education|academic (background|qualifications)|qualifications)$/.test(value)) return "education";
  if (/^((work|professional|employment) (experience|history)|experience|employment)$/.test(value)) return "experience";
  if (/^((personal|selected|technical|academic) )?projects$/.test(value)) return "projects";
  if (/^((technical|core|key) )?skills(?:\s*(?:,|&|and)\s*(?:languages|interests|technologies))*$/.test(value)) return "skills";
  if (/^(personal (details|information)|references|interests|certifications|awards|languages|summary|profile|objective|achievements|volunteering)$/.test(value)) return "skip";
  return null;
}

export function parseResumeText(input: string): ResumeDraft {
  if (input.length > 100_000) throw new Error("Use at most 100,000 characters of resume text.");
  const text = input.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const lines = text.split("\n").map((line) => line.trim());
  const suggestions: ResumeSuggestion[] = [];
  const warnings = ["Local parsing uses English section headings and common layouts. Check all suggestions, especially name order, dates and grouped entries. Nothing is saved automatically."];
  const add = (section: Section, label: string, values: Record<string, string>, source: string, needsReview = true) => {
    if (!Object.values(values).some(Boolean)) return;
    suggestions.push({ id: `resume-${suggestions.length}`, section, label, values, source: source.slice(0, 2000), needsReview });
  };
  const firstHeading = lines.findIndex((line) => heading(line) || /^(?:(?:technical|core|key) )?skills:/i.test(line));
  const header = lines.slice(0, firstHeading < 0 ? 12 : firstHeading).filter((line) => !sensitive.test(line));
  const name = header.find((line) => /^(?:[\p{L}][\p{L}'’.-]*\s+){1,4}[\p{L}][\p{L}'’.-]*$/u.test(line) && !/resume|curriculum|vitae|engineer|developer|analyst|manager|contact|details|university|college|skills/i.test(line));
  if (name) {
    const parts = name.split(/\s+/);
    add("identity", "Name", { givenName: parts.slice(0, -1).join(" "), familyName: parts.at(-1)! }, name);
  }
  const contactText = header.join("\n");
  const emails = [...new Set(contactText.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi) ?? [])];
  if (emails[0]) add("contact", "Email", { email: emails[0] }, emails.join(" · "), emails.length > 1);
  const phone = contactText.match(/\+(65|852|1)[\s().-]*((?:\d[\s().-]*){7,10}\d)/);
  if (phone) {
    const national = phone[2].replace(/\D/g, "");
    if (national.length === (phone[1] === "1" ? 10 : 8)) add("contact", "Phone", { phoneCountryCode: `+${phone[1]}`, phoneNational: national }, phone[0], false);
  }
  const location = header.find((line) => /^Location:\s*\S/i.test(line));
  if (location) add("contact", "Location", { city: location.replace(/^Location:\s*/i, "") }, location);
  for (const match of contactText.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/)[\w./-]+|https:\/\/[^\s|<>]+/gi)) {
    const raw = match[0].replace(/[.,;)]+$/, "");
    try {
      const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      const host = url.hostname.replace(/^www\./, "");
      const field = host === "linkedin.com" ? "linkedin" : host === "github.com" ? "github" : "portfolio";
      if (!suggestions.some((item) => item.section === "links" && field in item.values)) add("links", field === "linkedin" ? "LinkedIn" : field === "github" ? "GitHub" : "Portfolio", { [field]: url.toString() }, raw, false);
    } catch { /* Only valid, visible HTTPS links are proposed. */ }
  }

  const groups: Partial<Record<Section, string[]>> = {};
  let section: Section | "skip" | null = null;
  for (const line of lines) {
    if (/^(?:languages|interests):/i.test(line)) { section = "skip"; continue; }
    const inlineSkills = /^(?:(?:technical|core|key) )?skills:\s*(.+)$/i.exec(line);
    if (inlineSkills) { section = "skills"; (groups.skills ??= []).push(inlineSkills[1]); continue; }
    const next = heading(line);
    if (next) { section = next; if (next !== "skip") (groups[next] ??= []).push(""); continue; }
    if (section && section !== "skip" && !sensitive.test(line)) {
      const group = (groups[section] ??= []);
      group.push(line);
    }
  }
  for (const kind of ["education", "experience", "projects"] as const) {
    const entries = parseResumeEntries(kind, groups[kind] ?? []);
    const limit = kind === "education" ? 5 : 10;
    if (entries.length > limit) warnings.push(`Only the first ${limit} ${kind} entries are suggested; add remaining entries manually.`);
    for (const entry of entries.slice(0, limit)) {
      if (entry.expected) warnings.push("An education end date is marked expected in the source, not proof of a completed qualification. Review the source before applying.");
      add(kind, kind === "education" ? "Education" : kind === "experience" ? "Experience" : "Project", entry.values, entry.source);
    }
  }
  const skills = [...new Set((groups.skills ?? []).flatMap((line) => line.replace(/^[•*-]\s*/, "").replace(/^[\w /&+-]{1,45}:\s*/, "").split(/[,;|•]/)).map((value) => value.trim()).filter((value) => value && value.length <= 200))];
  if (skills.length) add("skills", "Skills", { items: skills.slice(0, 100).join(", ") }, (groups.skills ?? []).join("\n"));
  if (!suggestions.length) warnings.push("No recognizable profile details found. Try clearer section headings or enter the information manually.");
  return { suggestions, warnings };
}

export function suggestionConflict(profile: CandidateProfile, item: ResumeSuggestion): boolean {
  if (collections.has(item.section) || item.section === "skills") return false;
  const current = profile[item.section] as Record<string, unknown>;
  return Object.entries(item.values).some(([key, value]) => Boolean(current[key]) && current[key] !== value);
}

export function applyResumeSuggestions(profile: CandidateProfile, items: readonly ResumeSuggestion[], replaceConflicts = false): CandidateProfile {
  const next = structuredClone(profile);
  for (const item of items) {
    if (!Object.hasOwn(fields, item.section)) throw new Error("Unsupported resume field.");
    const values: Record<string, string | boolean> = {};
    for (const [key, raw] of Object.entries(item.values)) {
      if (!fields[item.section].includes(key)) throw new Error("Unsupported resume field.");
      const value = raw.trim();
      if (value && (key === "startMonth" || key === "endMonth") && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("Use valid YYYY-MM dates, or clear uncertain dates before applying.");
      if (value) values[key] = key === "current" ? value === "true" : value;
    }
    if (item.section === "skills") {
      for (const skill of String(values.items ?? "").split(/[,;\n]/).map((value) => value.trim()).filter(Boolean)) {
        if (!next.skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) next.skills.push(skill);
      }
    } else if (item.section === "education" || item.section === "experience" || item.section === "projects") {
      const entries = next[item.section] as Array<Record<string, unknown>>;
      const same = (entry: Record<string, unknown>) => Object.keys(values).length === Object.keys(entry).length && Object.entries(values).every(([key, value]) => String(entry[key] ?? "").trim().toLowerCase() === String(value).toLowerCase());
      if (Object.keys(values).length && !entries.some(same)) entries.push(values);
    } else {
      const target = next[item.section] as Record<string, unknown>;
      for (const [key, value] of Object.entries(values)) if (!target[key] || target[key] === value || replaceConflicts) target[key] = value;
    }
  }
  const parsed = candidateProfileSchema.safeParse(next);
  if (!parsed.success) throw new Error("Review the selected values: email and HTTPS links must be valid. Profile limits are 5 education entries, 10 jobs, 10 projects and 100 skills; existing entries are never removed to make room.");
  return parsed.data;
}
