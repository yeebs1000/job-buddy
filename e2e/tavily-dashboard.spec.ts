import { expect, test } from "@playwright/test";
import { seedTracker } from "./support/seedTracker";

test("Tavily settings never read back the key and backups stay advanced", async ({ page }, testInfo) => {
  let configured = false, searches = 0;
  const status = () => ({ configured, platformSupported: true, usage: { month: "2026-09", used: 8, limit: 1000 } });
  await page.route("**/api/gmail/status", route => route.fulfill({ json: { state: "disconnected", platformSupported: true } }));
  await page.route("**/api/research/web-salary/status", route => route.fulfill({ json: status() }));
  await page.route("**/api/research/web-salary/key", async route => {
    configured = route.request().method() === "POST";
    if (configured) expect(route.request().postDataJSON()).toEqual({ apiKey: "tvly-synthetic-browser-only" });
    await route.fulfill({ json: status() });
  });
  await page.route("**/api/research/web-salary/search", route => { searches++; return route.abort(); });
  await page.goto("/settings");
  const key = page.getByLabel("Tavily API key");
  await expect(key).toHaveAttribute("type", "password");
  await key.fill("tvly-synthetic-browser-only");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(key).toHaveValue("");
  await expect(page.getByText(/not yet verified/)).toBeVisible();
  expect(searches).toBe(0);
  await expect(page.getByLabel("Backup passphrase", { exact: true })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("region", { name: "Research search", exact: true }).screenshot({ path: testInfo.outputPath(`research-settings-${width}.png`) });
  }
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await page.getByText("Advanced · encrypted backup and restore", { exact: true }).click();
  await expect(page.getByLabel("Backup passphrase", { exact: true })).toBeVisible();
});

test("refreshes and saves employee rating inline, retains evidence after reload and failure", async ({ page }, testInfo) => {
  const requests: string[] = [];
  await page.route("**/api/gmail/status", route => route.fulfill({ json: { state: "disconnected", platformSupported: true } }));
  await page.route("**/api/research/web-salary/search", async route => {
    const query = route.request().postDataJSON();
    expect(Object.keys(query).sort()).toEqual(["company", "location", "purpose", "role"]);
    requests.push(query.purpose);
    await route.fulfill({ json: { searchedAt: "2026-09-26T00:00:00.000Z", results: query.purpose === "salary" ? [] : [{ title: "Employer review survey", url: "https://reviews.example/employer", excerpt: `${query.company} employee reviews: 4.2 out of 5 from 321 reviews.`, retrievedAt: "2026-09-26T00:00:00.000Z" }] } });
  });
  await seedTracker(page);
  expect(requests).toEqual([]);
  const row = page.getByTestId("application-row-app-aurora-applied");
  await row.getByRole("button", { name: "Refresh research" }).click();
  const rating = row.getByRole("region", { name: "Company employee rating" });
  await expect(rating.getByLabel("Rating score")).toHaveValue("4.2");
  expect(requests).toEqual(["salary", "company-rating"]);
  await rating.getByRole("checkbox").check();
  await rating.getByRole("button", { name: "Save company rating" }).click();
  await expect(row.getByRole("link", { name: "Rating source" })).toHaveAttribute("href", "https://reviews.example/employer");
  await page.reload();
  await row.getByRole("button", { name: "Review sources" }).click();
  await expect(rating.getByText(/4.2 out of 5 from 321 reviews/)).toBeVisible();
  expect(requests).toHaveLength(2);
  await page.route("**/api/research/web-salary/search", route => route.fulfill({ status: 429, json: { error: { code: "web-search-budget-exhausted" } } }));
  await row.getByRole("button", { name: "Refresh research" }).click();
  await expect(row.getByRole("alert")).toContainText("allowance has been reached");
  await expect(rating.getByLabel("Rating score")).toHaveValue("4.2");
  await row.getByRole("button", { name: "Hide research" }).click();
  await page.screenshot({ path: testInfo.outputPath("inline-dashboard.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("inline-dashboard-mobile.png"), fullPage: true });
});
