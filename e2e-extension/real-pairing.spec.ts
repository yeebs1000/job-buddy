import { chromium, expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createCompanionServer, type CompanionServerServices } from "../server/http/createCompanionServer";
import { BuddyStore } from "../server/buddy/BuddyStore";
import { BuddyService } from "../server/buddy/BuddyService";
import { PairingService } from "../server/buddy/PairingService";
import { emptyCandidateProfile, selectProfilePaths } from "../src/domain/profile";

test("installed extension keeps pairing lifecycle and approved fill reliable", async ({}, testInfo) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "buddy-pairing-test-"));
  const extensionPath = join(root, "extension");
  const profileData = { ...emptyCandidateProfile, identity: { givenName: "Alex", familyName: "Tan" } };
  const profile = { status: async () => ({ platformSupported: true, hasProfile: true }), read: async () => profileData, replace: async () => profileData, select: async (paths: readonly string[]) => selectProfilePaths(profileData, paths), delete: async () => undefined };
  const store = new BuddyStore({ root });
  const forbidden = async (): Promise<never> => { throw new Error("No Gmail calls allowed in pairing test"); };
  const dashboardOrigin = "http://127.0.0.1:5173";
  const trace: Array<{ phase: "start" | "finish"; method?: string; path?: string; origin: "dashboard" | "extension" | "other"; status?: number; elapsedMs?: number }> = [];
  let buddy = createBuddy();
  let server = createServer();
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await test.step("start isolated companion and installed Edge extension", async () => {
      await listen(server, 0);
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      await cp(resolve("dist-extension"), extensionPath, { recursive: true });
      const manifest = JSON.parse(await readFile(join(extensionPath, "manifest.json"), "utf8"));
      manifest.host_permissions = [baseUrl + "/*"];
      manifest.content_scripts = [{ matches: ["https://jobs.fixture.test/*"], js: ["content.js"] }];
      await writeFile(join(extensionPath, "manifest.json"), JSON.stringify(manifest));
      const workerPath = join(extensionPath, "service-worker.js");
      await writeFile(workerPath, (await readFile(workerPath, "utf8")).replaceAll("http://127.0.0.1:43117", baseUrl));
      context = await chromium.launchPersistentContext(join(root, "browser"), { channel: process.platform === "win32" ? "msedge" : "chromium", headless: true, ignoreDefaultArgs: ["--disable-extensions"], args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
      await context.route("https://jobs.fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: '<h1>Test application</h1><label>First name<input autocomplete="given-name" id="first"></label>' }));
    });

    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const page = await context!.newPage();
    const panel = page.locator('[data-job-buddy="panel"]');
    await test.step("reject invalid pairing and accept a fresh valid code", async () => {
      await page.goto("https://jobs.fixture.test/apply");
      await panel.getByRole("button", { name: "Open Job Buddy", exact: true }).click();
      const pairing = await fetch(baseUrl + "/api/buddy/pairing/start", { method: "POST", headers: { origin: dashboardOrigin, "content-type": "application/json" }, body: "{}" });
      const { code } = await pairing.json();
      await panel.getByLabel("Pairing code").fill("INVALID-CODE");
      const invalidFinished = nextFinished("/api/buddy/pairing/complete", 400);
      await panel.getByRole("button", { name: "Pair Buddy", exact: true }).click();
      await invalidFinished;
      await expect(panel.getByRole("alert")).toContainText("code expired, was replaced");
      await panel.getByLabel("Pairing code").fill(code);
      const validFinished = nextFinished("/api/buddy/pairing/complete", 200);
      await panel.getByRole("button", { name: "Pair Buddy", exact: true }).click();
      await validFinished;
      await expect(panel.getByRole("heading", { name: "Choose fields to fill" })).toBeVisible();
    });

    await test.step("fill only the explicitly approved saved profile field", async () => {
      await panel.getByRole("button", { name: "Select safe, empty fields" }).click();
      const activityFinished = nextFinished("/api/buddy/activity", 204);
      await panel.getByRole("button", { name: "Fill approved fields" }).click();
      await activityFinished;
      await expect(page.locator("#first")).toHaveValue("Alex");
      expect((await buddy.status()).paired).toBe(true);
    });

    await test.step("persist pairing across page reload and companion restart", async () => {
      const reloadPreferences = nextFinished("/api/buddy/preferences/read", 200);
      const reloadProfile = nextFinished("/api/buddy/profile/select", 200);
      await page.reload();
      await Promise.all([reloadPreferences, reloadProfile]);
      await panel.getByRole("button", { name: "Open Job Buddy", exact: true }).click();
      await expect(panel.getByRole("heading", { name: "Choose fields to fill" })).toBeVisible();
      const port = (server.address() as AddressInfo).port;
      server.closeAllConnections();
      await close(server);
      buddy = createBuddy();
      server = createServer();
      await listen(server, port);
      const profileFinished = nextFinished("/api/buddy/profile/select", 200);
      await panel.getByRole("button", { name: "Scan this page again" }).click();
      await profileFinished;
      await expect(panel.getByRole("heading", { name: "Choose fields to fill" })).toBeVisible();
    });

    await test.step("revocation prevents later profile access and fill", async () => {
      await buddy.revoke();
      await page.locator("#first").fill("");
      const rejectedPreferences = nextFinished("/api/buddy/preferences/read", 401);
      await panel.getByRole("button", { name: "Scan this page again" }).click();
      await rejectedPreferences;
      await expect(panel.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
      await expect(page.locator("#first")).toHaveValue("");
    });
  } catch (error) {
    await testInfo.attach("companion-request-phases.json", { body: JSON.stringify(trace, null, 2), contentType: "application/json" });
    throw error;
  } finally {
    await context?.close();
    server.closeAllConnections();
    await close(server);
    await rm(root, { recursive: true, force: true });
  }

  function createBuddy() { return new BuddyService({ pairing: new PairingService({ store }), profile, store }); }
  function createServer() {
    const services: CompanionServerServices = { buddy, profile, connection: { status: forbidden, start: forbidden, complete: forbidden, disconnect: forbidden }, sync: { scan: forbidden } };
    const instance = createCompanionServer({ services, allowedOrigins: [dashboardOrigin], uiOrigin: dashboardOrigin });
    instance.on("request", (request, response) => {
      const startedAt = Date.now();
      const metadata = { method: request.method, path: request.url, origin: classifyOrigin(request.headers.origin) };
      trace.push({ phase: "start", ...metadata });
      response.on("finish", () => trace.push({ phase: "finish", ...metadata, status: response.statusCode, elapsedMs: Date.now() - startedAt }));
    });
    return instance;
  }
  function nextFinished(path: string, status: number): Promise<void> {
    return new Promise((done) => {
      const listener = (request: { url?: string }, response: { statusCode: number; once(event: "finish", callback: () => void): void }) => {
        if (request.url !== path) return;
        response.once("finish", () => { if (response.statusCode === status) { server.off("request", listener); done(); } });
      };
      server.on("request", listener);
    });
  }
  function classifyOrigin(origin: string | undefined): "dashboard" | "extension" | "other" { return origin === dashboardOrigin ? "dashboard" : origin?.startsWith("chrome-extension://") ? "extension" : "other"; }
});

function listen(server: Server, port: number): Promise<void> { return new Promise((done) => server.listen(port, "127.0.0.1", done)); }
function close(server: Server): Promise<void> { if (!server.listening) return Promise.resolve(); return new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
