import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DesktopClientStore } from "./DesktopClientStore";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function setup() { const root = await mkdtemp(join(tmpdir(), "job-buddy-oauth-setup-")); roots.push(root); return new DesktopClientStore(root); }

it("persists only a validated public client ID and restores it on restart", async () => {
  const store = await setup();
  expect(await store.get()).toBeNull();
  await store.save("123-test.apps.googleusercontent.com");
  expect(JSON.parse(await readFile(store.path, "utf8"))).toEqual({ clientId: "123-test.apps.googleusercontent.com" });
  expect(await new DesktopClientStore(roots[0]).get()).toBe("123-test.apps.googleusercontent.com");
  await expect(store.save("bad\nSECRET=bad")).rejects.toThrow();
  expect(await store.get()).toBe("123-test.apps.googleusercontent.com");
});

it("fails closed for malformed saved configuration", async () => {
  const store = await setup();
  await writeFile(store.path, JSON.stringify({ clientId: "123-test.apps.googleusercontent.com", clientSecret: "must-not-load" }));
  await expect(store.get()).rejects.toThrow();
});
