import type { WebSalaryResponse } from "../../domain/webSalary";
export function suggestCompanyRating(source: WebSalaryResponse["results"][number], company: string) {
  if (!company.trim() || !source.excerpt.toLowerCase().includes(company.trim().toLowerCase())) return;
  if (!/employee(?:s)?\s+(?:reviews?|ratings?)/i.test(source.excerpt) || /\b(customer|product|shopper)\s+(reviews?|ratings?)\b/i.test(source.excerpt)) return;
  const match = source.excerpt.match(/\b([0-9](?:\.[0-9]+)?)\s*(?:\/|out of)\s*(5|10)\b/i);
  if (!match || Number(match[1]) > Number(match[2])) return;
  return { score: Number(match[1]), outOf: Number(match[2]) };
}
