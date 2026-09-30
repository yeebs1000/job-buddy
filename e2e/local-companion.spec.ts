import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { createCompanionServer } from "../server/http/createCompanionServer";
import { readCompanionConfig } from "../server/config";
import { DesktopClientStore } from "../server/gmail/DesktopClientStore";
import { GmailConnectionService } from "../server/gmail/GmailConnectionService";
import { GmailSyncService } from "../server/gmail/GmailSyncService";
import { GmailTransport } from "../server/gmail/GmailTransport";
import { WindowsDpapiSecretStore } from "../server/secrets/WindowsDpapiSecretStore";
import { ConnectionMetadataStore } from "../server/secrets/ConnectionMetadataStore";
import { WindowsDpapiProfileVault } from "../server/profile/WindowsDpapiProfileVault";
import { ProfileService } from "../server/profile/ProfileService";
import { BuddyStore } from "../server/buddy/BuddyStore";
import { PairingService } from "../server/buddy/PairingService";
import { BuddyService } from "../server/buddy/BuddyService";
import { pdf } from "./support/pdf";

for (const hostname of ["127.0.0.1", "localhost"]) {
  test(`real companion serves settings, saves setup and pairs on ${hostname}`, async ({ page }, testInfo) => {
    test.skip(process.platform !== "win32", "Local Gmail setup uses Windows DPAPI support");
    const root = await mkdtemp(join(tmpdir(), "job-buddy-browser-"));
    const config = readCompanionConfig({});
    const desktop = new DesktopClientStore(root);
    let providerCalls = 0;
    const connection = new GmailConnectionService({ config, secrets: new WindowsDpapiSecretStore({ root }), metadata: new ConnectionMetadataStore(root), saveDesktopClientId: (id, secret) => desktop.save(id, secret), fetcher: async () => { providerCalls++; throw new Error("No Google requests permitted in setup test"); } });
    const store = new BuddyStore({ root });
    const profile = new ProfileService(new WindowsDpapiProfileVault({ root }));
    const allowedOrigins: string[] = [];
    const server = createCompanionServer({ services: { connection, sync: new GmailSyncService(new GmailTransport(connection)), profile, buddy: new BuddyService({ pairing: new PairingService({ store }), profile, store }) }, allowedOrigins, uiOrigin: "http://127.0.0.1:43117", staticDir: resolve("dist") });
    try {
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const origin = `http://${hostname}:${(server.address() as AddressInfo).port}`;
      allowedOrigins.push(origin);
      await page.goto(origin + "/settings");
      await expect(page.getByRole("radio", { name: /^Approval mode/ })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Pair browser extension" })).toBeEnabled();
      await expect(page.getByText(/Buddy settings are unavailable/)).toHaveCount(0);
      await page.getByRole("button", { name: "Set up Gmail" }).click();
      await expect(page.getByRole("link", { name: /Open Google Cloud/ })).toBeVisible();
      await page.getByLabel("Desktop client ID").fill("123-browser-test.apps.googleusercontent.com");
      await page.screenshot({ path: testInfo.outputPath("gmail-setup-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const option of await page.locator(".gmail-settings__choice-group label").all()) {
        expect((await option.boundingBox())!.height).toBeLessThan(180);
      }
      await page.screenshot({ path: testInfo.outputPath("gmail-setup-mobile.png"), fullPage: true });
      await page.getByRole("button", { name: "Save client ID" }).click();
      await expect(page.getByRole("button", { name: /^Connect Gmail$/ })).toBeEnabled();
      expect(JSON.parse(await readFile(desktop.path, "utf8"))).toEqual({ clientId: "123-browser-test.apps.googleusercontent.com" });
      expect(providerCalls).toBe(0);
      await page.reload();
      await expect(page.getByRole("button", { name: /^Connect Gmail$/ })).toBeEnabled();
      const oldAttempt = await (await page.request.post(origin + "/api/gmail/oauth/start", { headers: { origin }, data: { popup: true } })).json();
      await page.getByRole("button", { name: "Change client ID" }).click();
      await expect(page.getByRole("button", { name: /^Connect Gmail$/ })).toBeDisabled();
      await page.getByLabel("Desktop client ID").fill("456-corrected.apps.googleusercontent.com");
      await page.getByLabel(/Desktop client secret/).fill("fixture-browser-secret");
      await page.getByRole("button", { name: "Save client ID" }).click();
      await expect(page.getByLabel("Desktop client ID")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Connect Gmail$/ })).toBeEnabled();
      const savedCredentials = await readFile(desktop.path, "utf8");
      expect(JSON.parse(savedCredentials)).toMatchObject({ clientId: "456-corrected.apps.googleusercontent.com", protectedClientSecret: expect.any(String) });
      expect(savedCredentials).not.toContain("fixture-browser-secret");
      expect(await new DesktopClientStore(root).getCredentials()).toEqual({ clientId: "456-corrected.apps.googleusercontent.com", clientSecret: "fixture-browser-secret" });
      const receipt = await page.request.post(origin + "/api/gmail/oauth/popup-result", { headers: { origin }, data: { popupId: oldAttempt.popupId } });
      expect(await receipt.json()).toEqual({ state: "error" });
      const staleState = new URL(oldAttempt.authorizationUrl).searchParams.get("state")!;
      const staleCallback = await page.request.get(origin + "/api/gmail/oauth/callback?code=unused&state=" + encodeURIComponent(staleState));
      expect(staleCallback.status()).toBe(200);
      expect(await staleCallback.text()).toContain("Sign-in did not finish");
      const fresh = await (await page.request.post(origin + "/api/gmail/oauth/start", { headers: { origin }, data: {} })).json();
      expect(new URL(fresh.authorizationUrl).searchParams.get("client_id")).toBe("456-corrected.apps.googleusercontent.com");
      expect(providerCalls).toBe(0);
      await page.screenshot({ path: testInfo.outputPath("gmail-corrected-mobile.png"), fullPage: true });
      await page.getByRole("button", { name: "Pair browser extension" }).click();
      const code = await page.locator(".buddy-settings__pairing strong").innerText();
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      const paired = await page.request.post(origin + "/api/buddy/pairing/complete", { headers: { origin: `chrome-extension://${"a".repeat(32)}` }, data: { code } });
      expect(paired.status()).toBe(200);
      await page.getByRole("button", { name: "Refresh connection" }).click();
      await expect(page.getByRole("button", { name: "Revoke extension" })).toBeVisible();
      await expect(page.getByText(/Paired locally on/)).toBeVisible();
      // Exercise resume import -> real HTTP -> Windows encryption -> reload.
      // This server uses an isolated temporary vault, never the user's profile.
      await page.goto(origin + "/profile");
      await page.getByRole("button", { name: "Import resume", exact: true }).click();
      await page.getByLabel("Choose resume file").setInputFiles({
        name: "synthetic-resume.pdf", mimeType: "application/pdf",
        buffer: pdf(["Alex Chen", "alex@example.com", "EDUCATION", "Example University", "Bachelor of Science, Computing", "Sep 2020 - Jun 2024", "EXPERIENCE", "Engineer | Example Labs", "Jul 2024 - Present", "Built payment APIs.", "SKILLS", "TypeScript, SQL"]),
      });
      await expect(page.getByRole("checkbox", { name: "Include Experience", exact: true })).toBeChecked();
      await page.getByRole("button", { name: "Apply selected details" }).click();
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      const saved = page.locator("footer").getByRole("status");
      await expect(saved).toHaveText("Profile saved locally.");
      await expect(saved).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("profile-saved-mobile.png") });
      await page.reload();
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue("alex@example.com");
      await expect(page.getByLabel("Employer 1", { exact: true })).toHaveValue("Example Labs");
      const stored = await new WindowsDpapiProfileVault({ root }).read();
      expect(stored?.education).toHaveLength(1);
      expect(stored?.experience).toHaveLength(1);
    } finally {
      await page.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
