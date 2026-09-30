import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { researchDataRoot } from "./TavilyKeyStore";

export interface SearchBudget { month: string; used: number; limit: 1000 }
export interface SearchBudgetPort { status(): Promise<SearchBudget>; reserve(): Promise<SearchBudget> }
const schema = z.object({ version: z.literal(1), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), used: z.number().int().min(0).max(1000) }).strict();

export class SearchBudgetStore implements SearchBudgetPort {
  private readonly directory: string;
  constructor(private options: { root?: string; now?: () => number } = {}) { this.directory = join(options.root ?? researchDataRoot(), "research"); }
  status() { return this.access(false); }
  reserve() { return this.access(true); }
  private async access(reserve: boolean): Promise<SearchBudget> {
    const path = join(this.directory, "tavily-budget.json"), lockPath = join(this.directory, "tavily-budget.lock");
    let lock: FileHandle | undefined;
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.directory, { recursive: true });
      for (let attempt = 0; attempt < 20; attempt++) {
        try { lock = await open(lockPath, "wx", 0o600); break; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await delay(25); }
      }
      if (!lock) throw new Error();
      let saved: z.infer<typeof schema> | undefined;
      try { saved = schema.parse(JSON.parse(await readFile(path, "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const month = new Date((this.options.now ?? Date.now)()).toISOString().slice(0, 7);
      if (saved && month < saved.month) throw new Error();
      const used = saved?.month === month ? saved.used : 0;
      if (reserve && used >= 1000) throw new Error("web-search-budget-exhausted");
      const next = { version: 1 as const, month, used: used + Number(reserve) };
      if (reserve) {
        const file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(JSON.stringify(next)); await file.sync(); } finally { await file.close(); }
        await rename(temporary, path);
      }
      return { month, used: next.used, limit: 1000 };
    } catch (error) {
      throw new Error(error instanceof Error && error.message === "web-search-budget-exhausted" ? error.message : "web-search-storage-unavailable");
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (lock) { await lock.close(); await rm(lockPath, { force: true }); }
    }
  }
}
