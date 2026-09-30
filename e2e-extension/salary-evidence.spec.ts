import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("built Buddy requires explicit confirmation for salary evidence in Automatic mode", async ({ page }) => {
  await page.route("https://jobs.fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body>
    <main data-location="United States"><h1>Software Engineer</h1><p>Salary: $120,000 to $165,000 a year</p><form></form></main>
  </body></html>` }));
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    Object.defineProperty(window, "jobBuddyMessages", { get: () => messages });
    (window as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: async (message: { type: string }) => {
      messages.push(message);
      if (message.type === "status") return { ok: true, type: "status", paired: true };
      if (message.type === "get-preferences") return { ok: true, type: "preferences", preferences: { mode: "automatic", paused: false, enabledDomains: ["jobs.fixture.test"] } };
      if (message.type === "queue-salary-evidence") return { ok: true, type: "salary-evidence-captured" };
      return { ok: true, type: "profile-selection", selection: {} };
    } } };
  });
  await page.goto("https://jobs.fixture.test/role?tracking=private");
  await page.addScriptTag({ path: resolve("dist-extension/content.js") });
  const buddy = page.locator("[data-job-buddy='panel']");
  await buddy.evaluate((host) => (host.shadowRoot!.querySelector('[aria-label="Open Job Buddy"]') as HTMLButtonElement).click());
  await expect.poll(() => buddy.evaluate((host) => host.shadowRoot!.textContent)).toContain("Salary found");
  expect(await salaryMessages(page)).toHaveLength(0);

  await buddy.evaluate((host) => (host.shadowRoot!.querySelector('button[data-action="add-salary-evidence"]') as HTMLButtonElement).click());
  await expect.poll(() => salaryMessages(page)).toHaveLength(1);
  const [message] = await salaryMessages(page) as Array<{ evidence: Record<string, unknown> }>;
  expect(message.evidence).toMatchObject({ market: "US", currency: "USD", minimum: 120_000, maximum: 165_000, period: "annual", sourceUrl: "https://jobs.fixture.test/role" });
  expect(JSON.stringify(message)).not.toMatch(/tracking|cookie|form|answer/i);
});

async function salaryMessages(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { jobBuddyMessages: Array<{ type: string }> }).jobBuddyMessages.filter((message) => message.type === "queue-salary-evidence"));
}
