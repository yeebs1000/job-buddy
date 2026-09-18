import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
// @ts-expect-error Directly runnable ESM script.
import { verifyPublicTree } from "./verify-public-tree.mjs";

const exec = promisify(execFile);
const temporaryDirectories: string[] = [];

async function repository(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "job-buddy-public-tree-"));
  temporaryDirectories.push(directory);
  await exec("git", ["init", "--quiet"], { cwd: directory });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  await exec("git", ["config", "user.name", "Public Tree Test"], { cwd: directory });
  return directory;
}

async function commitAll(directory: string, message: string): Promise<void> {
  await exec("git", ["add", "."], { cwd: directory });
  await exec("git", ["commit", "--quiet", "-m", message], { cwd: directory });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it("rejects a tracked private-key marker without exposing its content", async () => {
  const directory = await repository();
  const marker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  await writeFile(join(directory, "accidental.txt"), `${marker}\nprivate-canary`, "utf8");
  await commitAll(directory, "add fixture");

  let error: Error | undefined;
  try { await verifyPublicTree(directory); } catch (caught) { error = caught as Error; }

  expect(error?.message).toMatch(/accidental\.txt/);
  expect(error?.message).toMatch(/private key/i);
  expect(error?.message).not.toContain(marker);
  expect(error?.message).not.toContain("private-canary");
});

it("ignores an ignored local signing key", async () => {
  const directory = await repository();
  await writeFile(join(directory, ".gitignore"), "*.pem\n", "utf8");
  await writeFile(join(directory, "local-signing.pem"), `${["-----BEGIN", "PRIVATE KEY-----"].join(" ")}\nprivate-canary`, "utf8");
  await commitAll(directory, "ignore local key");

  await expect(verifyPublicTree(directory)).resolves.toMatchObject({ findings: [] });
});

it("rejects private-key material removed from the current tree but retained in reachable history", async () => {
  const directory = await repository();
  await writeFile(join(directory, "removed.txt"), `${["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ")}\nhistory-canary`, "utf8");
  await commitAll(directory, "add accidental key");
  await rm(join(directory, "removed.txt"));
  await commitAll(directory, "remove accidental key");

  let error: Error | undefined;
  try { await verifyPublicTree(directory); } catch (caught) { error = caught as Error; }

  expect(error?.message).toMatch(/removed\.txt/);
  expect(error?.message).toMatch(/reachable history/i);
  expect(error?.message).not.toContain("history-canary");
});

it("accepts normal tracked and untracked public files", async () => {
  const directory = await repository();
  await writeFile(join(directory, "README.md"), "Public documentation", "utf8");
  await commitAll(directory, "add public docs");
  await writeFile(join(directory, "release-notes.md"), "Normal candidate file", "utf8");

  await expect(verifyPublicTree(directory)).resolves.toMatchObject({ findings: [] });
});
