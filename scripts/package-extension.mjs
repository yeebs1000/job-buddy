import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";

const SAFE_RUNTIME_FILE = /\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?)$/i;
const UNSAFE_FILE = /\.(?:pem|key|p12|pfx|crx|map)$/i;

function referencedRuntimeFiles(value, files = new Set()) {
  if (typeof value === "string" && SAFE_RUNTIME_FILE.test(value)) files.add(value.replace(/^\.\//, ""));
  else if (Array.isArray(value)) value.forEach((item) => referencedRuntimeFiles(item, files));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => referencedRuntimeFiles(item, files));
  return files;
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unsupported extension artifact: ${entry.name}`);
  }
  return files;
}

export async function packageExtension(projectRoot = resolve(import.meta.dirname, "..")) {
  const buildRoot = join(projectRoot, "dist-extension");
  const packageMetadata = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(buildRoot, "manifest.json"), "utf8"));
  const allowedFiles = referencedRuntimeFiles(manifest, new Set(["content.js"]));
  const archiveEntries = {};

  for (const absolutePath of await filesUnder(buildRoot)) {
    const archivePath = relative(buildRoot, absolutePath).split(sep).join("/");
    const isManifest = archivePath === "manifest.json";
    if (UNSAFE_FILE.test(archivePath) || (!isManifest && !allowedFiles.has(archivePath))) {
      throw new Error(`Unexpected extension artifact: ${archivePath}`);
    }
    archiveEntries[archivePath] = new Uint8Array(await readFile(absolutePath));
  }
  if (!archiveEntries["manifest.json"]) throw new Error("Built extension is missing manifest.json");

  const archive = Buffer.from(zipSync(archiveEntries, { level: 9 }));
  const releaseRoot = join(projectRoot, "release-artifacts");
  const archivePath = join(releaseRoot, `job-buddy-extension-${packageMetadata.version}.zip`);
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(archivePath, archive);
  return { archivePath, sha256: createHash("sha256").update(archive).digest("hex") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await packageExtension();
  console.log(`${basename(result.archivePath)} sha256 ${result.sha256}`);
}
