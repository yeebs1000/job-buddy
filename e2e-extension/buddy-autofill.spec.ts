import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("built Buddy fills approved safe fields and never submits", async ({ page }) => {
  await page.route("https://jobs.fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body>
    <h1>Software Engineer</h1><form><label for="first">First name</label><input id="first" name="first_name" autocomplete="given-name">
    <label for="salary">Expected annual salary (SGD)</label><input id="salary" name="salary_sgd">
    <label for="resume">Resume</label><input id="resume" name="resume" type="file"><button type="submit">Submit application</button></form>
  </body></html>` }));
  await page.addInitScript(() => {
    let submitClicks = 0;
    Object.defineProperty(window, "jobBuddySubmitClicks", { get: () => submitClicks });
    document.addEventListener("click", (event) => { if ((event.target as HTMLElement).matches('button[type="submit"]')) submitClicks += 1; });
    (window as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: async (message: { type: string }) => {
      if (message.type === "status") return { ok: true, type: "status", paired: true };
      if (message.type === "get-preferences") return { ok: true, type: "preferences", preferences: { mode: "approval", paused: false, enabledDomains: ["jobs.fixture.test"] } };
      if (message.type === "select-profile") return { ok: true, type: "profile-selection", selection: { "identity.givenName": "Alex", "preferences.salarySGDAnnual": 120000 } };
      if (message.type === "record-activity") return { ok: true, type: "recorded" };
      return { ok: false, error: "invalid-request" };
    } } };
  });
  await page.goto("https://jobs.fixture.test/apply");
  await page.addScriptTag({ path: resolve("dist-extension/content.js") });
  const buddy = page.locator("[data-job-buddy='panel']");
  await buddy.evaluate((host) => (host.shadowRoot!.querySelector('[aria-label="Open Job Buddy"]') as HTMLButtonElement).click());
  await buddy.evaluate((host) => (host.shadowRoot!.querySelector('input[value="first"]') as HTMLInputElement).click());
  await buddy.evaluate((host) => (host.shadowRoot!.querySelector("button[data-action='fill-approved']") as HTMLButtonElement).click());

  await expect(page.locator("#first")).toHaveValue("Alex");
  await expect(page.locator("#salary")).toHaveValue("");
  await expect(page.locator("#resume")).toHaveValue("");
  expect(await page.evaluate(() => (window as unknown as { jobBuddySubmitClicks: number }).jobBuddySubmitClicks)).toBe(0);
});
