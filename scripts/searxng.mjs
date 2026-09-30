import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const composeFile = resolve(import.meta.dirname, "../infra/searxng/compose.yaml");
const desktopDocker = "C:/Program Files/Docker/Docker/resources/bin/docker.exe";

export function manageSearxng(action, { run = spawnSync, report = console.log, env = process.env } = {}) {
  const actions = { start: ["up", "--detach"], stop: ["stop"], status: ["ps"] };
  if (!Object.hasOwn(actions, action)) { report("Use start, stop or status."); return 1; }
  const executable = process.platform === "win32" && existsSync(desktopDocker) ? desktopDocker : "docker";
  const runtime = run(executable, ["info", "--format", "{{.OSType}}"], { shell: false, windowsHide: true, encoding: "utf8", timeout: 15000, env });
  if (runtime.error || runtime.status !== 0) {
    report("Docker is not ready. Install/open Docker Desktop with WSL 2, wait for the engine, then retry. See docs/local-search.md. No system installation was attempted.");
    return 1;
  }
  if (runtime.stdout?.trim() !== "linux") { report("SearXNG needs Linux containers. Switch Docker Desktop to Linux containers and retry."); return 1; }
  // Per-start instance secret; never a provider API key and never written to the repo.
  const result = run(executable, ["compose", "--file", composeFile, ...actions[action]], {
    shell: false, windowsHide: true, stdio: "inherit", timeout: 180000,
    env: { ...env, SEARXNG_SECRET: randomBytes(32).toString("hex") },
  });
  if (result.error || result.status !== 0) { report("SearXNG command failed. Check Docker Compose, image download and port 8088 availability; existing research is unchanged."); return 1; }
  if (action === "start") report("SearXNG container started on http://127.0.0.1:8088. Allow it to initialize, then use Search web salaries in Job Buddy. Upstream search availability is checked on each uncached search.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = manageSearxng(process.argv[2]);
}
