import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, expect, it } from "vitest";
// @ts-expect-error Directly runnable ESM script.
import { packageExtension } from "./package-extension.mjs";

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "job-buddy-package-extension-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "dist-extension"));
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "job-buddy", version: "1.2.3-beta.4" }));
  await writeFile(join(directory, "dist-extension", "manifest.json"), JSON.stringify({
    manifest_version: 3,
    background: { service_worker: "service-worker.js" },
    content_scripts: [{ matches: ["https://example.com/*"], js: ["content.js"] }],
  }));
  await writeFile(join(directory, "dist-extension", "service-worker.js"), "console.log('worker')");
  await writeFile(join(directory, "dist-extension", "content.js"), "console.log('content')");
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it("creates a versioned ZIP containing only the built manifest and runtime files", async () => {
  const directory = await fixture();

  const result = await packageExtension(directory);
  const archive = unzipSync(new Uint8Array(await readFile(result.archivePath)));

  expect(result.archivePath).toMatch(/[\\/]release-artifacts[\\/]job-buddy-extension-1\.2\.3-beta\.4\.zip$/);
  expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(archive).sort()).toEqual(["content.js", "manifest.json", "service-worker.js"]);
});

it.each(["debug.log", "extra.js", "signing.pem", "packed.crx"])("rejects unexpected built artifact %s", async (name) => {
  const directory = await fixture();
  await writeFile(join(directory, "dist-extension", name), "must-not-ship");

  await expect(packageExtension(directory)).rejects.toThrow(new RegExp(name.replace(".", "\\."), "i"));
});

it.each([
  ["service-worker.js", "service-worker.js"],
  ["content.js", "content.js"],
])("rejects a package missing required runtime file %s", async (name, diagnostic) => {
  const directory = await fixture();
  await rm(join(directory, "dist-extension", name));

  await expect(packageExtension(directory)).rejects.toThrow(new RegExp(diagnostic.replace(".", "\\."), "i"));
});

it("rejects a package missing a manifest-declared asset", async () => {
  const directory = await fixture();
  await writeFile(join(directory, "dist-extension", "manifest.json"), JSON.stringify({
    manifest_version: 3,
    background: { service_worker: "service-worker.js" },
    icons: { 16: "icon.png" },
    content_scripts: [{ matches: ["https://example.com/*"], js: ["content.js"] }],
  }));

  await expect(packageExtension(directory)).rejects.toThrow(/icon\.png/i);
});
