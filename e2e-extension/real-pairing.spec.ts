import { chromium, expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { createCompanionServer, type CompanionServerServices } from "../server/http/createCompanionServer";
import { BuddyStore } from "../server/buddy/BuddyStore";
import { BuddyService } from "../server/buddy/BuddyService";
import { PairingService } from "../server/buddy/PairingService";
import { emptyCandidateProfile, selectProfilePaths } from "../src/domain/profile";

test("installed extension pairs with the real HTTP companion and reads its saved profile", async () => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "buddy-pairing-test-"));
  const extensionPath = join(root, "extension");
  const profileData = { ...emptyCandidateProfile, identity: { givenName: "Alex", familyName: "Tan" } };
  const profile = {
    status: async () => ({ platformSupported: true, hasProfile: true }),
    read: async () => profileData,
    replace: async () => profileData,
    select: async (paths: readonly string[]) => selectProfilePaths(profileData, paths),
    delete: async () => undefined,
  };
  const store = new BuddyStore({ root });
  const buddy = new BuddyService({ pairing: new PairingService({ store }), profile, store });
  const forbidden = async (): Promise<never> => { throw new Error("No Gmail calls allowed in pairing test"); };
  const services: CompanionServerServices = { buddy, profile, connection: { status: forbidden, start: forbidden, complete: forbidden, disconnect: forbidden }, sync: { scan: forbidden } };
  const dashboardOrigin = "http://127.0.0.1:5173";
  const server = createCompanionServer({ services, allowedOrigins: [dashboardOrigin], uiOrigin: dashboardOrigin });
  const trace: Array<{ method?: string; path?: string; origin?: string; status: number }> = [];
  server.on("request", (request, response) => { response.on("finish", () => { trace.push({ method: request.method, path: request.url, origin: request.headers.origin, status: response.statusCode }); }); });
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Isolate the test from the user's running companion: only substitute its port.
    await cp(resolve("dist-extension"), extensionPath, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extensionPath, "manifest.json"), "utf8"));
    manifest.host_permissions = [baseUrl + "/*"];
    manifest.content_scripts = [{ matches: ["https://jobs.fixture.test/*"], js: ["content.js"] }];
    await writeFile(join(extensionPath, "manifest.json"), JSON.stringify(manifest));
    const workerPath = join(extensionPath, "service-worker.js");
    await writeFile(workerPath, (await readFile(workerPath, "utf8")).replaceAll("http://127.0.0.1:43117", baseUrl));
    context = await chromium.launchPersistentContext(join(root, "browser"), {
      channel: process.platform === "win32" ? "msedge" : "chromium", headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await context.route("https://jobs.fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: '<h1>Test application</h1><label>First name<input autocomplete="given-name" id="first"></label>' }));
    const page = await context.newPage();
    await page.goto("https://jobs.fixture.test/apply");
    const panel = page.locator('[data-job-buddy="panel"]');
    await panel.getByRole("button", { name: "Open Job Buddy", exact: true }).click();
    const pairing = await fetch(baseUrl + "/api/buddy/pairing/start", { method: "POST", headers: { origin: dashboardOrigin, "content-type": "application/json" }, body: "{}" });
    const { code } = await pairing.json();
    await panel.getByLabel("Pairing code").fill("INVALID-CODE");
    await panel.getByRole("button", { name: "Pair Buddy", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("code expired, was replaced");
    await panel.getByLabel("Pairing code").fill(code);
    await panel.getByRole("button", { name: "Pair Buddy", exact: true }).click();
    try { await expect(panel.getByRole("heading", { name: "Choose fields to fill" })).toBeVisible({ timeout: 15000 }); }
    catch { throw new Error(`Pairing HTTP trace: ${JSON.stringify(trace)}`); }
    await panel.getByRole("button", { name: "Select safe, empty fields" }).click();
    await panel.getByRole("button", { name: "Fill approved fields" }).click();
    await expect(page.locator("#first")).toHaveValue("Alex");
    expect((await buddy.status()).paired).toBe(true);
    await page.reload();
    await panel.getByRole("button", { name: "Open Job Buddy", exact: true }).click();
    try { await expect(panel.getByRole("heading", { name: "Choose fields to fill" })).toBeVisible({ timeout: 15000 }); }
    catch { throw new Error(`Reconnect HTTP trace: ${JSON.stringify(trace)}; fixture panel: ${await panel.locator(".body").innerText()}`); }
  } finally {
    await context?.close();
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    // Only the unique test directory, never the user's browser/profile directories.
    await rm(root, { recursive: true, force: true });
  }
});
