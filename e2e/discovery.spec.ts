import { expect, test } from "@playwright/test";

const board = { provider: "greenhouse", token: "example", region: "global" };
const retrievedAt = "2026-09-16T12:00:00.000Z";
test("discovers roles, saves a persistent shortlist, and compares posted pay without adding an application", async ({ page }) => {
  await page.clock.install({ time: new Date(retrievedAt) });
  await page.route("**/api/discovery/jobs", (route) => route.fulfill({ json: { retrievedAt, truncated: false, jobs: [
    { id: "greenhouse:global:example:123", board, title: "Graduate Software Engineer", location: "Singapore", market: "SG", url: "https://job-boards.greenhouse.io/example/jobs/123", salary: [], retrievedAt },
    { id: "greenhouse:global:example:456", board, title: "Backend Engineer", location: "New York", market: "US", url: "https://job-boards.greenhouse.io/example/jobs/456", salary: [], retrievedAt },
  ] } }));
  await page.route("**/api/discovery/salary", (route) => route.fulfill({ json: { salary: [{ currency: "SGD", minimum: 80000, maximum: 100000, period: "annual", label: "Singapore annual base" }] } }));
  await page.route("**/api/research/fx", (route) => route.fulfill({ json: { base: "SGD", quote: "USD", rate: 0.8, date: "2026-09-16", retrievedAt, sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" } }));
  await page.goto("/discover");
  await page.getByLabel("Company careers link").fill("https://job-boards.greenhouse.io/example");
  await page.getByRole("button", { name: "Find open roles" }).click();
  await expect(page.getByRole("heading", { name: "Backend Engineer" })).toBeVisible();
  await page.getByRole("combobox", { name: "Market", exact: true }).selectOption("SG");
  await expect(page.getByRole("heading", { name: "Backend Engineer" })).not.toBeVisible();
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved jobs (1)" })).toBeVisible();
  await page.getByText("Posted salary & currency comparison", { exact: true }).click();
  await page.getByRole("button", { name: "Check posted salary" }).click();
  await expect(page.getByText("SGD 80,000–100,000", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Compare currency", exact: true }).selectOption("USD");
  await expect(page.getByLabel("Converted salary")).toContainText("USD 60,000–80,000");
  await expect(page.getByText("SGD 80,000–100,000", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/discovery-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/discovery-mobile.png", fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Saved jobs (1)" }).click();
  await expect(page.getByRole("heading", { name: "Graduate Software Engineer" })).toBeVisible();
  await page.goto("/applications");
  await expect(page.getByText("Graduate Software Engineer", { exact: true })).toHaveCount(0);
});

test("recovers from a failed board lookup without inventing results", async ({ page }) => {
  await page.route("**/api/discovery/jobs", (route) => route.fulfill({ status: 502, json: { error: "board-unavailable" } }));
  await page.goto("/discover");
  await page.getByLabel("Company careers link").fill("https://jobs.lever.co/example");
  await page.getByRole("button", { name: "Find open roles" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not load this board");
  await expect(page.getByRole("button", { name: "Find open roles" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save job", exact: true })).toHaveCount(0);
});

test("keeps user-confirmed company postings separate from the regional estimate", async ({ page }) => {
  await page.route("**/api/discovery/jobs", (route) => route.fulfill({ json: { retrievedAt, truncated: false, jobs: [
    { id: "greenhouse:global:example:123", board, title: "Software Engineer", location: "Singapore", market: "SG", url: "https://job-boards.greenhouse.io/example/jobs/123", salary: [], retrievedAt },
  ] } }));
  await page.route("**/api/discovery/salary", (route) => route.fulfill({ json: { salary: [{ currency: "SGD", minimum: 80000, maximum: 100000, period: "unspecified", label: "Base salary" }] } }));
  await page.goto("/applications/app-circuit-review");
  const company = page.getByRole("region", { name: "Company salary research" });
  await company.getByLabel("Company Greenhouse or Lever link").fill("https://job-boards.greenhouse.io/example");
  await expect(company.getByRole("button", { name: "Find company salary evidence" })).toBeDisabled();
  await company.getByRole("checkbox").check();
  const checkBounds = await company.getByRole("checkbox").boundingBox();
  expect(checkBounds?.width).toBeLessThanOrEqual(24);
  expect(checkBounds?.height).toBeLessThanOrEqual(24);
  await company.getByRole("button", { name: "Find company salary evidence" }).click();
  await company.getByText("Software Engineer · Singapore", { exact: true }).click();
  await company.getByRole("button", { name: "Check posted salary" }).click();
  await expect(company).toContainText("Pay period not specified");
  await expect(company.getByRole("link", { name: "Open employer posting" })).toHaveAttribute("href", "https://job-boards.greenhouse.io/example/jobs/123");
  await expect(page.getByRole("region", { name: "Salary estimate" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/company-salary-desktop.png", fullPage: true });
});
