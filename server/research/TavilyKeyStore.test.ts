import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { TavilyKeyStore } from "./TavilyKeyStore";
import { tavilyKeySchema, searchStatusSchema } from "../../src/domain/researchSearch";
import type { CommandRunner } from "../secrets/WindowsDpapi";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "job-buddy-tavily-test-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const run = vi.fn<CommandRunner["run"]>(async ({ stdin }) => ({ stdout: Buffer.from(Buffer.from(stdin, "base64").map(b => b ^ 0xa5)).toString("base64") }));
it("protects the key separately and never places it in process arguments", async () => {
  const store = new TavilyKeyStore({ root, runner: { run }, platform: "win32" });
  await mkdir(join(root, "secrets"));
  await writeFile(join(root, "secrets", "gmail-refresh-token.bin"), "gmail-canary");
  expect(await store.get()).toBeNull();
  await store.set("tvly-synthetic-one");
  expect(await store.get()).toBe("tvly-synthetic-one");
  expect(await readFile(join(root, "secrets", "tavily-key.bin"), "utf8")).not.toContain("tvly-synthetic-one");
  expect(run.mock.calls.flatMap(([v]) => v.args).join(" ")).not.toContain("tvly-synthetic-one");
  await store.set("tvly-synthetic-two");
  expect(await store.get()).toBe("tvly-synthetic-two");
  await store.delete(); await store.delete();
  expect(await store.get()).toBeNull();
  expect(await readFile(join(root, "secrets", "gmail-refresh-token.bin"), "utf8")).toBe("gmail-canary");
});
it("fails closed on unavailable protection and damaged stored credentials", async () => {
  const unsupported = new TavilyKeyStore({ root, platform: "linux" });
  await expect(unsupported.set("tvly-synthetic-one")).rejects.toThrow("web-search-storage-unavailable");
  const store = new TavilyKeyStore({ root, runner: { run }, platform: "win32" });
  await mkdir(join(root, "secrets"));
  await writeFile(join(root, "secrets", "tavily-key.bin"), "damaged");
  await expect(store.get()).rejects.toThrow("web-search-storage-unavailable");
});
it("rejects malformed keys before writing and public status cannot include a key", async () => {
  const store = new TavilyKeyStore({ root, runner: { run }, platform: "win32" });
  await expect(store.set("tvly-test\nAuthorization: injected")).rejects.toThrow();
  expect(await store.get()).toBeNull();
  expect(tavilyKeySchema.safeParse("tvly-test\nAuthorization: injected").success).toBe(false);
  expect(searchStatusSchema.safeParse({ configured: true, platformSupported: true, usage: { month: "2026-09", used: 0, limit: 1000 }, key: "tvly-test-only" }).success).toBe(false);
});
