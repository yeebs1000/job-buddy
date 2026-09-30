import type { Currency } from "../../domain/research";
import { webSalaryEvidenceSchema, type WebSalaryEvidence } from "../../domain/webSalary";
import { roundSalaryDown } from "./roundSalary";

// Suggestions are deliberately narrow; they never become evidence without review.
export function suggestWebRange(text: string): Partial<WebSalaryEvidence> | undefined {
  if (!/\b(salary|salaries|pay|compensation)\b/i.test(text)) return;
  const range = text.match(/\b(HKD|SGD|USD)\s*([\d,]+(?:\.\d+)?)(k)?\s*[-–—]\s*(HKD|SGD|USD)?\s*([\d,]+(?:\.\d+)?)(k)?\s*(?:per\s+|\/\s*)?(annual(?:ly)?|year(?:ly)?|month(?:ly)?)/i);
  if (!range) return;
  if (range[4] && range[4].toUpperCase() !== range[1].toUpperCase()) return;
  const minimum = Number(range[2].replaceAll(",", "")) * (range[3] ? 1000 : 1);
  const maximum = Number(range[5].replaceAll(",", "")) * (range[6] ? 1000 : 1);
  if (!minimum || minimum > maximum) return;
  return { minimum, maximum, currency: range[1].toUpperCase() as Currency, period: /month/i.test(range[7]) ? "monthly" : "annual" };
}

export function blendWebSalary(evidence: WebSalaryEvidence[], currency: Currency, basis: "base" | "total", year = new Date().getFullYear()) {
  const publishers = new Set<string>();
  const included = evidence.filter(item => {
    if (!webSalaryEvidenceSchema.safeParse(item).success || !item.confirmed || item.currency !== currency || item.basis !== basis || (item.referenceYear ?? year) > year) return false;
    // Conservative publisher grouping: subdomains and reposts on the same site get one vote.
    const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    const root = parts.slice(/\.(com|co|org)\.[a-z]{2}$/.test(host) ? -3 : -2).join(".");
    // Country mirrors of the same publisher should not increase evidence confidence.
    const publisher = root.split(".")[0];
    if (publishers.has(publisher)) return false;
    publishers.add(publisher); return true;
  });
  if (!included.length) return null;
  const lower = included.map(item => item.minimum * (item.period === "monthly" ? 12 : 1));
  const upper = included.map(item => item.maximum * (item.period === "monthly" ? 12 : 1));
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const comparable = included.every(item => item.match === "company-role" && item.referenceYear !== undefined && year - item.referenceYear <= 1);
  const quality = included.every(item => item.sourceType === "employer" || item.sourceType === "recruiter-guide");
  const dispersed = Math.max(...lower) > Math.min(...upper);
  return {
    minimum: roundSalaryDown(sum(lower), currency, "annual"), maximum: roundSalaryDown(sum(upper), currency, "annual"),
    count: included.length, included, excluded: evidence.length - included.length,
    confidence: included.length >= 2 && comparable && quality && !dispersed ? "moderate" as const : "limited" as const,
    explanation: included.length < 2 ? "One publisher: a reported range, not a blend." : !quality ? "Includes self-reported or unknown-quality sources; treat this as an exploratory range." : !comparable ? "Includes a market proxy or old/unknown salary reference year." : dispersed ? "Sources disagree: their ranges do not overlap." : "Multiple reviewed employer/recruiter sources for this company and role, with recent salary reference years and overlapping ranges. Not independently verified.",
  };
}
