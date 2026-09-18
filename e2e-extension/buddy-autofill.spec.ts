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

test("built Buddy survives reinjection and fills a second step while keeping salary review available", async ({ page }) => {
  await page.route("https://jobs.fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body>
    <h1>Software Engineer</h1><p>Salary: SGD 120,000 to 165,000 a year</p>
    <form id="application"><label>Full name<input id="full" autocomplete="name"></label>
    <label>Email<input id="email" autocomplete="email" value="chosen@example.com"></label>
    <label>Expected annual salary (SGD)<input id="salary"></label>
    <button type="button" id="next">Next step</button><button type="submit">Submit application</button></form>
    <script>document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); window.submitted = true });
    document.querySelector('#next').addEventListener('click', () => {
      document.querySelector('#application').innerHTML = '<label>City *<input id="city"></label><label>Country<select id="country"><option value="">Choose</option><option>Singapore</option></select></label><button type="submit">Submit application</button>';
    });</script></body></html>` }));
  await page.addInitScript(() => {
    (window as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: async (message: { type: string }) => {
      if (message.type === "status") return { ok: true, type: "status", paired: true };
      if (message.type === "get-preferences") return { ok: true, type: "preferences", preferences: { mode: "approval", paused: false, enabledDomains: [] } };
      if (message.type === "select-profile") return { ok: true, type: "profile-selection", selection: { "identity.fullName": "Alex Tan", "contact.email": "alex@example.com", "contact.city": "Singapore", "contact.country": "Singapore", "preferences.salarySGDAnnual": 120000 } };
      if (message.type === "record-activity") return { ok: true, type: "recorded" };
      return { ok: false, error: "invalid-request" };
    } } };
  });
  await page.goto("https://jobs.fixture.test/apply");
  await page.addScriptTag({ path: resolve("dist-extension/content.js") });
  await page.addScriptTag({ path: resolve("dist-extension/content.js") });
  const buddy = page.locator('[data-job-buddy="panel"]');
  await expect(buddy).toHaveCount(1);
  await buddy.getByRole("button", { name: "Open Job Buddy", exact: true }).click();
  await buddy.getByRole("button", { name: "Select safe, empty fields" }).click();
  await buddy.getByRole("button", { name: "Fill approved fields" }).click();
  await expect(page.locator("#full")).toHaveValue("Alex Tan");
  await expect(page.locator("#email")).toHaveValue("chosen@example.com");
  await expect(page.locator("#salary")).toHaveValue("");
  await buddy.getByRole("button", { name: "Review salary found on this page" }).click();
  await expect(buddy.getByRole("heading", { name: "Salary found" })).toBeVisible();
  await buddy.getByRole("button", { name: "Scan this page again" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(buddy.locator('input[value="city"]')).toBeVisible();
  await buddy.getByRole("button", { name: "Select safe, empty fields" }).click();
  await buddy.getByRole("button", { name: "Fill approved fields" }).click();
  await expect(page.locator("#city")).toHaveValue("Singapore");
  await expect(page.locator("#country")).toHaveValue("Singapore");
  expect(await page.evaluate(() => (window as unknown as { submitted?: boolean }).submitted)).not.toBe(true);
  await page.screenshot({ path: "test-results/buddy-autofill-beta13.png", fullPage: true });
});
