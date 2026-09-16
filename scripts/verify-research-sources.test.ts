// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
// @ts-expect-error The production verifier is intentionally a directly runnable ESM script.
import { verifyResearchSources } from "./verify-research-sources.mjs";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "job-buddy-research-policy-")); temporaryDirectories.push(root);
  const dist = join(root, "dist"); const fixtures = join(root, "fixtures");
  await mkdir(dist); await mkdir(fixtures);
  const manifestPath = join(root, "sourceManifest.ts");
  await writeFile(manifestPath, [
    "https://stats.mom.gov.sg/a.xlsx", "https://tablebuilder.singstat.gov.sg/a", "https://www.censtatd.gov.hk/a.pdf",
    "https://www.bls.gov/a.zip", "https://api.bls.gov/a",
  ].join("\n"));
  await writeFile(join(dist, "app.js"), "console.log('salary research')");
  return { dist, fixtures, manifestPath };
}

it("accepts official attributed sources and normalized fixtures", async () => {
  const setup = await fixture();
  await writeFile(join(setup.fixtures, "sample.json"), JSON.stringify({ sourceUrl: "https://www.bls.gov/oes/" }));
  await expect(verifyResearchSources({ artifactDirs: [setup.dist], fixturesDir: setup.fixtures, manifestPath: setup.manifestPath })).resolves.toBeUndefined();
});

it("rejects commercial scraping targets and incomplete or insecure manifests", async () => {
  const commercial = await fixture();
  await writeFile(join(commercial.dist, "app.js"), "fetch('https://www.glassdoor.com/salaries')");
  await expect(verifyResearchSources({ artifactDirs: [commercial.dist], fixturesDir: commercial.fixtures, manifestPath: commercial.manifestPath })).rejects.toThrow(/commercial/i);

  const insecure = await fixture();
  await writeFile(insecure.manifestPath, "http://www.bls.gov/a");
  await expect(verifyResearchSources({ artifactDirs: [insecure.dist], fixturesDir: insecure.fixtures, manifestPath: insecure.manifestPath })).rejects.toThrow(/https|attribution/i);
});
