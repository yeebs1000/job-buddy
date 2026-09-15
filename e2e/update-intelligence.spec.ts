import { expect, test, type Page } from "@playwright/test";

async function clearJobBuddyDatabase(page: Page) {
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
  await page.clock.install({ time: new Date("2026-09-12T00:00:00.000Z") });
  await clearJobBuddyDatabase(page);
});

test("scans fixture mail, reviews evidence, and updates an interview deadline", async ({ page }) => {
  // Catches default demo fixtures that cannot match the Review-stage Circuit application, or a Command Center that hides the extracted appointment time.
  await expect(page.getByRole("heading", { name: "Application command center" })).toBeVisible();
  await page.getByRole("button", { name: /scan now/i }).click();
  await page.getByRole("link", { name: /review .*pending update/i }).click();

  const technicalInterview = page.getByRole("article").filter({ hasText: "Technical interview invitation — Software Engineer" });
  await expect(technicalInterview).toContainText("Circuit Harbour Ltd · Software Engineer");
  await expect(technicalInterview).toContainText("Match confidence: 100%");
  await expect(technicalInterview).toContainText("Classification confidence: 95%");
  await expect(technicalInterview).toContainText("technical interview invitation");
  await technicalInterview.getByRole("button", { name: "Approve update" }).click();
  await expect(technicalInterview.getByText("Review result: Update applied.")).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  const circuit = page.getByTestId("application-row-app-circuit-review");
  await expect(circuit).toContainText("Stage: Interview");
  await expect(circuit).toContainText(/Tomorrow: Technical interview.*2:00 PM/);
});
