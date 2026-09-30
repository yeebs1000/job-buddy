import { build } from "esbuild";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(projectRoot, "extension");
const outputRoot = resolve(projectRoot, "dist-extension");
const manifestPath = resolve(sourceRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.manifest_version !== 3 || JSON.stringify(manifest.permissions) !== JSON.stringify(["storage", "activeTab", "scripting"])) throw new Error("Extension permissions changed unexpectedly");
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(["http://127.0.0.1:43117/*"])) throw new Error("Extension required host access must stay localhost-only");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await build({
  absWorkingDir: projectRoot,
  entryPoints: { "service-worker": "extension/src/service-worker.ts", content: "extension/src/content.ts" },
  outdir: outputRoot,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  sourcemap: false,
  minify: false,
  legalComments: "none"
});
await cp(manifestPath, resolve(outputRoot, "manifest.json"));
