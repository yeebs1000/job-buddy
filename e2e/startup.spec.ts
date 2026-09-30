import { expect, test } from "@playwright/test";

// Startup must remain usable without the optional local companion.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
});

test("opens a lightweight tracker and loads secondary pages when requested", async ({ page }) => {
  const scripts: Promise<number>[] = [];
  page.on("response", response => {
    if (response.request().resourceType() === "script") scripts.push(response.body().then(bytes => bytes.length));
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start your tracker" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const initialBytes = (await Promise.all(scripts)).reduce((sum, size) => sum + size, 0);
  await test.info().attach("startup-javascript-bytes", { body: String(initialBytes), contentType: "text/plain" });
  // Budget the whole startup JS graph, not only the entry file.
  expect(initialBytes).toBeLessThan(700_000);
  const initialRequests = scripts.length;
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  expect(scripts.length).toBeGreaterThan(initialRequests);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start your tracker" })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/startup-${width}.png`, fullPage: true });
  }
});

test("keeps navigation usable when a secondary page is slow or cannot load", async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/ProfilePage-*.js", async route => { await waiting; await route.abort(); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start your tracker" })).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Opening page…");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "This page could not be opened" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload page" })).toBeEnabled();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start your tracker" })).toBeVisible();
});
