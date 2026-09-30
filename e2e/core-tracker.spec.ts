import { expect, test } from "@playwright/test";
import { trackerColumns } from "../src/features/import-export/trackerColumns";
import { seedTracker } from "./support/seedTracker";

type DownloadCapture = { mediaType: string; byteLength: number; text?: string };

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') { cell += character; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((values) => values.some(Boolean));
}

async function clearTrackerDatabase(page: import("@playwright/test").Page) {
  await seedTracker(page);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      if (object instanceof Blob) {
        const captures = ((window as Window & { jobBuddyDownloadCaptures?: DownloadCapture[] }).jobBuddyDownloadCaptures ??= []);
        const capture: DownloadCapture = { mediaType: object.type, byteLength: 0 };
        captures.push(capture);
        void object.text().then((text) => { capture.text = text; });
        void object.arrayBuffer().then((bytes) => { capture.byteLength = bytes.byteLength; });
      }
      return originalCreateObjectURL(object);
    };
  });
  await clearTrackerDatabase(page);
});

test("imports, filters, updates, undoes, and exports an application", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Application Hub" })).toBeVisible();
  await page.getByRole("button", { name: "Import Excel" }).click();
  await page.getByLabel("Tracker file").setInputFiles("e2e/fixtures/fresh-grad-tracker.csv");
  await expect(page.getByText("Cedarline Systems")).toBeVisible();
  await expect(page.getByRole("row", { name: /Cedarline Systems.*review/i })).toBeVisible();
  await page.getByRole("button", { name: /Confirm import/ }).click();
  await expect(page.getByRole("status")).toContainText("1 imported");
  await page.getByRole("button", { name: "Close import" }).click();

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
  const csvCaptureIndex = await page.evaluate(() => (window as Window & { jobBuddyDownloadCaptures?: DownloadCapture[] }).jobBuddyDownloadCaptures?.length ?? 0);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download tracker" }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^job-buddy-filtered-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(await csv.failure()).toBeNull();
  await expect.poll(() => page.evaluate((index) => (window as Window & { jobBuddyDownloadCaptures?: DownloadCapture[] }).jobBuddyDownloadCaptures?.[index]?.text ?? "", csvCaptureIndex)).toContain("Company");
  const csvCapture = await page.evaluate((index) => (window as Window & { jobBuddyDownloadCaptures?: DownloadCapture[] }).jobBuddyDownloadCaptures?.[index], csvCaptureIndex) as DownloadCapture;
  expect(csvCapture.mediaType).toContain("text/csv");
  expect(csvCapture.byteLength).toBeGreaterThan(0);
  const [headings, ...exportedRows] = parseCsv(csvCapture.text ?? "");
  expect(headings).toEqual(Object.values(trackerColumns));
  const marketColumn = headings.indexOf("Market");
  const roleFamilyColumn = headings.indexOf("Role Family");
  const companyColumn = headings.indexOf("Company");
  expect(exportedRows).not.toHaveLength(0);
  expect(exportedRows.every((row) => row[marketColumn] === "SG" && row[roleFamilyColumn] === "software")).toBe(true);
  expect(exportedRows.map((row) => row[companyColumn])).toContain("Cedarline Systems");
  expect(exportedRows.map((row) => row[companyColumn])).not.toEqual(expect.arrayContaining(["Aurora Ledger Pte Ltd", "Pine Street Capital"]));

  await page.getByLabel("Export format").selectOption("xlsx");
  const xlsxCaptureIndex = await page.evaluate(() => (window as Window & { jobBuddyDownloadCaptures?: DownloadCapture[] }).jobBuddyDownloadCaptures?.length ?? 0);
  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download tracker" }).click();
  const xlsx = await xlsxDownload;
  expect(xlsx.suggestedFilename()).toMatch(/^job-buddy-filtered-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(await xlsx.failure()).toBeNull();
  await expect.poll(() => page.evaluate((index) => (window as Window & { jobBuddyDownloadCaptures?: DownloadCapture[] }).jobBuddyDownloadCaptures?.[index]?.byteLength ?? 0, xlsxCaptureIndex)).toBeGreaterThan(0);
  const xlsxCapture = await page.evaluate((index) => (window as Window & { jobBuddyDownloadCaptures?: DownloadCapture[] }).jobBuddyDownloadCaptures?.[index], xlsxCaptureIndex) as DownloadCapture;
  expect(xlsxCapture.mediaType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect(xlsxCapture.byteLength).toBeGreaterThan(0);
});

test("keeps Application Hub attention actions readable without horizontal page overflow across responsive widths", async ({ page }) => {
  for (const width of [390, 768, 800, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
    await expect(page.locator(".command-center__next-action").first()).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator(".command-center__next-action").evaluateAll((elements) => elements.every((element) => {
      const box = element.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth && box.left >= 0 && box.right <= window.innerWidth;
    }))).toBe(true);
    if ([390, 800, 1440].includes(width)) await page.screenshot({ path: `test-results/final-fix-command-center-${width}.png`, fullPage: true });
  }
});
