import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".svg", ".txt"]);
const builtInCanaries = ["refresh-token-canary", "access-token-canary", "paired-token-abcdefghijklmnopqrstuvwxyz", "ABCDE-FGHJK", "alex@example.com"];

async function textFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...await textFiles(root, path));
    else if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

function rules(canaries) {
  const configuredValues = [
    ["configured Google OAuth client ID", process.env.GOOGLE_OAUTH_CLIENT_ID],
    ["configured Google OAuth client secret", process.env.GOOGLE_OAUTH_CLIENT_SECRET],
    ["configured Brave Search API key", process.env.JOB_BUDDY_BRAVE_SEARCH_API_KEY],
  ].filter(([, value]) => typeof value === "string" && value.trim().length >= 8);
  return [
    ...builtInCanaries.map((value) => ["token test canary", value]),
    ...canaries.filter((value) => typeof value === "string" && value.length > 0).map((value) => ["explicit secret canary", value]),
    ...configuredValues,
  ];
}

export async function verifyClientArtifacts(directory, canaries = []) {
  const root = resolve(directory);
  if (!(await stat(root)).isDirectory()) throw new Error("Client artifact directory is not a directory.");
  const findings = [];
  for (const file of await textFiles(root)) {
    if (extname(file).toLowerCase() === ".map") findings.push(`${relative(root, file)} (source map)`);
    const contents = await readFile(file, "utf8");
    for (const [rule, value] of rules(canaries)) {
      if (contents.includes(value)) findings.push(`${relative(root, file)} (${rule})`);
    }
  }
  const manifestPath = resolve(root, "manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.manifest_version === 3) {
      if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(["http://127.0.0.1:43117/*"])) findings.push("manifest.json (required host permissions exceed localhost)");
      if ((manifest.content_scripts ?? []).some((script) => (script.matches ?? []).includes("https://*/*"))) findings.push("manifest.json (global HTTPS content script)");
    }
  } catch { /* Web app artifacts do not contain an extension manifest. */ }
  if (findings.length) {
    throw new Error(`Secret material was found in client artifacts:\n${[...new Set(findings)].join("\n")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  Promise.all((process.argv.slice(2).length ? process.argv.slice(2) : ["dist"]).map((directory) => verifyClientArtifacts(directory))).then(
    () => process.stdout.write("Client artifact secret check passed.\n"),
    (error) => { process.stderr.write(`${error instanceof Error ? error.message : "Client artifact secret check failed."}\n`); process.exitCode = 1; },
  );
}
