import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const spawnedPids = new Set();

afterEach(() => {
  if (process.platform === "win32") {
    for (const pid of spawnedPids) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  }
  spawnedPids.clear();
});

describe.runIf(process.platform === "win32")("development launcher lifecycle", () => {
  it("stops descendants when one development service exits", async () => {
    const root = await mkdtemp(join(tmpdir(), "job-buddy-dev-lifecycle-"));
    const runner = join(root, "fake-npm.mjs");
    const pidsPath = join(root, "pids.txt");
    await writeFile(runner, `
      import { appendFileSync } from "node:fs";
      import { spawn } from "node:child_process";
      const service = process.argv.at(-1);
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      appendFileSync(process.env.JOB_BUDDY_TEST_PIDS, child.pid + "\\n");
      if (service === "dev:web") setTimeout(() => process.exit(23), 100);
      else setInterval(() => {}, 1000);
    `);
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) if (key.toLowerCase() === "npm_execpath") delete environment[key];
    environment.npm_execpath = runner;
    environment.JOB_BUDDY_TEST_PIDS = pidsPath;
    const launcher = spawn(process.execPath, [resolve("scripts/dev.mjs")], {
      cwd: resolve("."), stdio: "ignore",
      env: environment,
    });
    try {
      const pids = await waitForPids(pidsPath, 2);
      for (const pid of pids) spawnedPids.add(pid);
      await new Promise((done, reject) => {
        const timer = setTimeout(() => reject(new Error("launcher did not exit")), 5000);
        launcher.once("exit", () => { clearTimeout(timer); done(); });
      });
      await expect.poll(() => pids.filter(isRunning), { timeout: 5000 }).toEqual([]);
    } finally {
      if (launcher.exitCode === null) launcher.kill();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});

async function waitForPids(path, count) {
  let pids = [];
  await expect.poll(async () => {
    try { pids = (await readFile(path, "utf8")).trim().split(/\s+/).filter(Boolean).map(Number); }
    catch { pids = []; }
    return pids.length;
  }, { timeout: 5000 }).toBe(count);
  return pids;
}

function isRunning(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}
