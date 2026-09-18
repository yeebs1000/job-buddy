import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const PRIVATE_KEY_MARKER = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;
const UNSAFE_PATH = /(?:^|[/\\])(?:[^/\\]+\.(?:pem|key|p12|pfx|crx))$/i;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

async function git(repository, args, encoding = "utf8") {
  return exec("git", args, { cwd: repository, encoding, maxBuffer: 64 * 1024 * 1024 });
}

function reasonFor(path, content) {
  if (UNSAFE_PATH.test(path)) return "private signing key or browser package path";
  if (content && PRIVATE_KEY_MARKER.test(content)) return "private key marker";
  return undefined;
}

async function inspectWorktree(repository, path) {
  const absolutePath = resolve(repository, path);
  let metadata;
  try { metadata = await stat(absolutePath); }
  catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  const pathReason = reasonFor(path);
  if (pathReason || metadata.size > MAX_TEXT_BYTES) return pathReason;
  const content = await readFile(absolutePath);
  if (content.includes(0)) return undefined;
  return reasonFor(path, content.toString("utf8"));
}

async function indexedMarkerPaths(repository) {
  const markerPattern = "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----";
  try {
    const { stdout } = await git(repository, ["grep", "--cached", "-I", "-l", "-E", "-e", markerPattern, "--"]);
    return stdout.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error?.code === 1) return [];
    throw error;
  }
}

export async function verifyPublicTree(repository = resolve(import.meta.dirname, "..")) {
  const findings = [];
  const { stdout: indexed } = await git(repository, ["ls-files", "--cached", "-z"]);
  for (const path of indexed.split("\0").filter(Boolean)) {
    const reason = reasonFor(path);
    if (reason) findings.push({ scope: "Git index", path, reason });
  }
  for (const path of await indexedMarkerPaths(repository)) {
    findings.push({ scope: "Git index", path, reason: "private key marker" });
  }
  const { stdout: candidates } = await git(repository, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  for (const path of candidates.split("\0").filter(Boolean)) {
    const reason = await inspectWorktree(repository, path);
    if (reason) findings.push({ scope: "public tree", path, reason });
  }

  const { stdout: historicalPaths } = await git(repository, ["log", "--all", "--format=", "--name-only"]);
  for (const path of new Set(historicalPaths.split(/\r?\n/).filter(Boolean))) {
    const reason = reasonFor(path);
    if (reason) findings.push({ scope: "reachable history", path, reason });
  }
  const markerPattern = "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----";
  const { stdout: markerPaths } = await git(repository, ["log", "--all", "--format=", "--name-only", "-G", markerPattern]);
  for (const path of new Set(markerPaths.split(/\r?\n/).filter(Boolean))) {
    findings.push({ scope: "reachable history", path, reason: "private key marker" });
  }

  if (findings.length) {
    const diagnostics = findings.map(({ scope, path, reason }) => `- ${scope}: ${path} (${reason})`).join("\n");
    throw new Error(`Public-tree verification failed:\n${diagnostics}`);
  }
  return { findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyPublicTree();
  console.log("Public-tree verification passed (current candidates and reachable Git history).");
}
