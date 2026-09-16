import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
// @ts-expect-error The production verifier is intentionally a directly runnable ESM script.
import { verifyClientArtifacts } from "./verify-client-secrets.mjs";

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "job-buddy-client-artifacts-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "assets"));
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it("fails without echoing a secret when a client bundle contains a canary", async () => {
  const directory = await fixture();
  await writeFile(join(directory, "assets", "app.js"), "window.value='client-secret-canary'", "utf8");

  let error: Error | undefined;
  try { await verifyClientArtifacts(directory, ["client-secret-canary"]); }
  catch (caught) { error = caught as Error; }

  expect(error?.message).toMatch(/secret material/i);
  expect(error?.message).toMatch(/assets[\\/]app\.js/);
  expect(error?.message).not.toContain("client-secret-canary");
});

it("ignores binary artifacts and accepts a clean client build", async () => {
  const directory = await fixture();
  await writeFile(join(directory, "assets", "app.js"), "console.log('Job Buddy')", "utf8");
  await writeFile(join(directory, "assets", "logo.png"), Buffer.from([0, 1, 2, 3]));

  await expect(verifyClientArtifacts(directory, ["client-secret-canary"])).resolves.toBeUndefined();
});

it("rejects source maps and extension-wide required HTTPS access", async () => {
  const sourceMapDirectory = await fixture();
  await writeFile(join(sourceMapDirectory, "assets", "app.js.map"), "{}", "utf8");
  await expect(verifyClientArtifacts(sourceMapDirectory)).rejects.toThrow(/source map/i);

  const manifestDirectory = await fixture();
  await writeFile(join(manifestDirectory, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    host_permissions: ["https://*/*"],
    content_scripts: [{ matches: ["https://*/*"], js: ["content.js"] }],
  }), "utf8");
  await expect(verifyClientArtifacts(manifestDirectory)).rejects.toThrow(/host permissions|global HTTPS/i);
});
