import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, it, expect } from "vitest";
import { SearchBudgetStore } from "./SearchBudgetStore";
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "job-buddy-budget-test-")); await mkdir(join(root, "research")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const now = () => Date.UTC(2026, 8, 26);
const seed = (value: unknown) => writeFile(join(root, "research", "tavily-budget.json"), JSON.stringify(value));
it("reserves the last credit once across instances and persists after restart", async () => {
  await seed({ version: 1, month: "2026-09", used: 999 });
  const a = new SearchBudgetStore({ root, now }), b = new SearchBudgetStore({ root, now });
  const results = await Promise.allSettled([a.reserve(), b.reserve()]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((await new SearchBudgetStore({ root, now }).status()).used).toBe(1000);
  await expect(a.reserve()).rejects.toThrow("web-search-budget-exhausted");
});
it("resets only for a forward UTC month and rejects clock rollback", async () => {
  const a = new SearchBudgetStore({ root, now });
  expect((await a.reserve()).used).toBe(1);
  const next = new SearchBudgetStore({ root, now: () => Date.UTC(2026, 9, 1) });
  expect((await next.reserve()).used).toBe(1);
  await expect(a.reserve()).rejects.toThrow("web-search-storage-unavailable");
});
it("fails closed on corruption or an existing lock without deleting the lock", async () => {
  await seed({ used: -1 });
  const a = new SearchBudgetStore({ root, now });
  await expect(a.reserve()).rejects.toThrow("web-search-storage-unavailable");
  await writeFile(join(root, "research", "tavily-budget.lock"), "other-owner");
  await expect(a.reserve()).rejects.toThrow("web-search-storage-unavailable");
  expect(await readFile(join(root, "research", "tavily-budget.lock"), "utf8")).toBe("other-owner");
});
it("does not authorize dispatch if the ledger cannot be replaced", async () => {
  await mkdir(join(root, "research", "tavily-budget.json"));
  await expect(new SearchBudgetStore({ root, now }).reserve()).rejects.toThrow("web-search-storage-unavailable");
});
