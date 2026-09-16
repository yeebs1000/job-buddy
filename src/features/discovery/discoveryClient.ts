import { z } from "zod";
import { discoveryResultSchema, postingPaySchema, type JobBoard } from "../../domain/discovery";
import { fxQuoteSchema } from "../../domain/fx";
import type { Currency } from "../../domain/research";

export async function publicDataRequest(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Source unavailable. Check the company board link and try again.");
  return response.json();
}
export const discoveryClient = {
  async list(board: JobBoard) { return discoveryResultSchema.parse(await publicDataRequest("/api/discovery/jobs", board)); },
  async salary(board: JobBoard, postingId: string) { return z.object({ salary: postingPaySchema.array().max(30) }).parse(await publicDataRequest("/api/discovery/salary", { board, postingId })).salary; },
  async fx(base: Currency, quote: Currency) { return fxQuoteSchema.parse(await publicDataRequest("/api/research/fx", { base, quote })); },
};
