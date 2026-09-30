import { expect, test } from "@playwright/test";
import { seedTracker } from "./support/seedTracker";

test("a new workspace is empty, live-only, and stays empty after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start your tracker" })).toBeVisible();
  await expect(page.getByText("Aurora Ledger Pte Ltd")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load sample data" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Start your tracker" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Use demo inbox" })).toHaveCount(0);
});

test("reviews web evidence, saves a blend and restores it in the dashboard", async ({ page }, testInfo) => {
  await page.route("**/api/gmail/status", route => route.fulfill({ json: { state: "disconnected", platformSupported: true } }));
  await page.route("**/api/research/web-salary/search", async route => {
    expect(Object.keys(route.request().postDataJSON()).sort()).toEqual(["company", "location", "purpose", "role"]);
    if (route.request().postDataJSON().purpose === "company-rating") { await route.fulfill({ json: { searchedAt: "2026-09-19T00:00:00.000Z", results: [] } }); return; }
    await route.fulfill({ json: { searchedAt: "2026-09-19T00:00:00.000Z", results: [
      { title: "Employer pay disclosure", url: "https://employer.example/salary", excerpt: "SGD 60,000–90,000 annual base salary", retrievedAt: "2026-09-19T00:00:00.000Z" },
      { title: "Independent salary survey", url: "https://survey.example/salary", excerpt: "SGD 70,000–100,000 annual base salary", retrievedAt: "2026-09-19T00:00:00.000Z" },
    ] } });
  });
  await seedTracker(page);
  await page.getByTestId("application-row-app-aurora-applied").getByRole("button", { name: "Refresh research" }).click();
  const web = page.getByRole("region", { name: "Find a salary range on the web" });
  await expect(web.getByRole("button", { name: "Search web salaries" })).toHaveCount(0);
  for (const title of ["Employer pay disclosure", "Independent salary survey"]) {
    const source = web.locator("details").filter({ has: page.locator("summary").filter({ hasText: title }) });
    await source.locator("summary").click();
    await source.getByLabel("Source fit").selectOption("company-role");
    await source.getByLabel("Source type").selectOption(title === "Employer pay disclosure" ? "employer" : "recruiter-guide");
    await source.getByLabel("Salary reference year (if stated)").fill("2026");
    await source.getByRole("checkbox").check();
    const box = await source.getByRole("checkbox").boundingBox();
    expect(box?.width).toBeLessThanOrEqual(24);
    expect(box?.height).toBeLessThanOrEqual(24);
  }
  await expect(web).toContainText("moderate confidence");
  await expect(web).toContainText("65,000");
  await web.getByRole("button", { name: "Save range to dashboard" }).click();
  await expect(web.getByRole("status")).toContainText("Saved locally");
  await web.screenshot({ path: testInfo.outputPath("web-salary-review.png") });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const row = page.getByTestId("application-row-app-aurora-applied");
  await expect(row).toContainText("65,000");
  await expect(row).toContainText("2 publishers");
  await page.reload();
  await expect(row.getByRole("button", { name: "Review sources" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: true });
  await row.getByRole("button", { name: "Review sources" }).click();
  await page.route("**/api/research/web-salary/search", route => route.fulfill({ status: 503, json: { error: { code: "web-search-unavailable" } } }));
  await row.getByRole("button", { name: "Refresh research" }).click();
  await expect(page.getByRole("alert")).toContainText("Tavily could not be reached");
  await expect(page.getByRole("region", { name: "Find a salary range on the web" })).toContainText("65,000");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.reload();
  await expect(row).toContainText("65,000");
});
