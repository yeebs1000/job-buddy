import { webSalaryQuerySchema, webSalaryResponseSchema, type WebSalaryQuery } from "../../domain/webSalary";
import { researchSearchError } from "../../domain/researchSearch";

export const webSalaryClient = {
  async search(query: WebSalaryQuery, signal?: AbortSignal) {
    let response: Response;
    try {
      response = await fetch("/api/research/web-salary/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(webSalaryQuerySchema.parse(query)), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
    } catch { throw new Error("The local companion could not be reached. Start Job Buddy and retry."); }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code = body?.error?.code;
      throw new Error(researchSearchError(code));
    }
    return webSalaryResponseSchema.parse(body);
  },
};
