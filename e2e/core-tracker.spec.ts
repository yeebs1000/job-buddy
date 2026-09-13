import { expect, test } from "@playwright/test";

async function clearTrackerDatabase(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("job-buddy");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("The test browser could not clear Job Buddy storage."));
  }));
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      if (object instanceof Blob) {
        void object.text().then((text) => { (window as Window & { jobBuddyDownloadText?: string }).jobBuddyDownloadText = text; });
        void object.arrayBuffer().then((bytes) => { (window as Window & { jobBuddyDownloadBytes?: number }).jobBuddyDownloadBytes = bytes.byteLength; });
      }
      return originalCreateObjectURL(object);
    };
  });
  await clearTrackerDatabase(page);
});

test("imports, filters, updates, undoes, and exports an application", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Application command center" })).toBeVisible();
  await page.getByRole("link", { name: "Import tracker" }).click();
  await page.getByLabel("Tracker file").setInputFiles("e2e/fixtures/fresh-grad-tracker.csv");
  await expect(page.getByText("Cedarline Systems")).toBeVisible();
  await expect(page.getByRole("row", { name: /Cedarline Systems.*review/i })).toBeVisible();
  await page.getByRole("button", { name: /Confirm import/ }).click();
  await expect(page.getByRole("status")).toContainText("1 imported");

  await page.getByRole("link", { name: "Applications", exact: true }).click();
  await expect(page.getByRole("link", { name: "Graduate Software Engineer" })).toBeVisible();
  await page.getByLabel("Market filter").selectOption("SG");
  await page.getByLabel("Role family filter").selectOption("software");
  await page.getByRole("link", { name: "Graduate Software Engineer" }).click();

  await expect(page.getByRole("group", { name: "Application progress" }).getByText("Review, Current stage", { exact: true }).first()).toHaveAttribute("aria-current", "step");
  await page.getByLabel("New stage").selectOption("interview");
  await page.getByRole("button", { name: "Update stage" }).click();
  await expect(page.getByRole("group", { name: "Application progress" }).getByText("Interview, Current stage", { exact: true }).first()).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("list", { name: "Stage history" })).toContainText("Changed to Interview");
  await page.getByRole("button", { name: "Undo change" }).click();
  await expect(page.getByRole("group", { name: "Application progress" }).getByText("Review, Current stage", { exact: true }).first()).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("list", { name: "Stage history" })).toContainText("Reverted / not applied");

  await page.getByRole("link", { name: "Back to applications" }).click();
  await page.getByLabel("Market filter").selectOption("SG");
  await page.getByLabel("Role family filter").selectOption("software");
  await page.getByLabel("Export format").selectOption("csv");
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download tracker" }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^job-buddy-filtered-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(await csv.failure()).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as Window & { jobBuddyDownloadText?: string }).jobBuddyDownloadText ?? "")).toContain("Company");
  const csvContent = await page.evaluate(() => (window as Window & { jobBuddyDownloadText?: string }).jobBuddyDownloadText ?? "");
  expect(csvContent).toContain("Company");
  expect(csvContent).toContain("Cedarline Systems");

  await page.getByLabel("Export format").selectOption("xlsx");
  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download tracker" }).click();
  const xlsx = await xlsxDownload;
  expect(xlsx.suggestedFilename()).toMatch(/^job-buddy-filtered-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(await xlsx.failure()).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as Window & { jobBuddyDownloadBytes?: number }).jobBuddyDownloadBytes ?? 0)).toBeGreaterThan(0);
});
