import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const bannedCommercialHosts = ["glassdoor.com", "levels.fyi", "jobstreet.com", "jobsdb.com"];
const requiredOfficialHosts = ["stats.mom.gov.sg", "tablebuilder.singstat.gov.sg", "censtatd.gov.hk", "bls.gov", "api.bls.gov"];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".ts", ".txt"]);
const rawSourceExtensions = new Set([".xlsx", ".xls", ".pdf", ".zip", ".csv", ".tsv"]);

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) output.push(...await files(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

function urls(contents) {
  return contents.match(/https?:\/\/[^\s"'`<>\\)]+/giu) ?? [];
}

function commercialUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase("en");
    return bannedCommercialHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export async function verifyResearchSources({
  artifactDirs = ["dist", "dist-extension"],
  manifestPath = "server/research/sourceManifest.ts",
  fixturesDir = "server/research/fixtures",
} = {}) {
  const findings = [];
  const manifestFile = resolve(manifestPath);
  const manifest = await readFile(manifestFile, "utf8");
  const manifestUrls = urls(manifest);
  if (manifestUrls.some((value) => !value.startsWith("https://"))) findings.push("source manifest contains a non-HTTPS URL");
  for (const host of requiredOfficialHosts) {
    if (!manifestUrls.some((value) => { try { const name = new URL(value).hostname; return name === host || name.endsWith(`.${host}`); } catch { return false; } })) {
      findings.push(`source manifest is missing government attribution for ${host}`);
    }
  }
  if (manifestUrls.some(commercialUrl)) findings.push("source manifest contains a commercial scraping target");

  for (const directory of artifactDirs.map((value) => resolve(value))) {
    if (!(await stat(directory)).isDirectory()) throw new Error(`Research artifact directory is not a directory: ${directory}`);
    for (const file of await files(directory)) {
      const extension = extname(file).toLocaleLowerCase("en");
      if (rawSourceExtensions.has(extension)) findings.push(`${relative(directory, file)} contains a raw downloaded source body`);
      if (!textExtensions.has(extension)) continue;
      const contents = await readFile(file, "utf8");
      if (urls(contents).some(commercialUrl)) findings.push(`${relative(directory, file)} contains a commercial scraping target`);
      if (/\b(?:sk-[A-Za-z0-9_-]{20,}|api[_-]?key\s*[:=]\s*["'][^"']{12,})/iu.test(contents)) findings.push(`${relative(directory, file)} contains secret-like material`);
    }
  }

  const fixtureRoot = resolve(fixturesDir);
  if ((await stat(fixtureRoot)).isDirectory()) {
    for (const file of await files(fixtureRoot)) {
      if (!textExtensions.has(extname(file).toLocaleLowerCase("en"))) continue;
      const contents = await readFile(file, "utf8");
      if (urls(contents).some(commercialUrl)) findings.push(`${relative(fixtureRoot, file)} fixture contains a commercial scraping target`);
    }
  }
  if (findings.length) throw new Error(`Research source policy failed:\n${[...new Set(findings)].join("\n")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyResearchSources({ artifactDirs: process.argv.slice(2).length ? process.argv.slice(2) : ["dist", "dist-extension"] }).then(
    () => process.stdout.write("Research source policy check passed.\n"),
    (error) => { process.stderr.write(`${error instanceof Error ? error.message : "Research source policy failed."}\n`); process.exitCode = 1; },
  );
}
