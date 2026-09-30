import { expect, test } from "@playwright/test";
import { seedTracker } from "./support/seedTracker";

test("edits details locally, reloads them, cancels drafts and removes completed deadlines from next actions", async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
  await seedTracker(page);
  await page.getByRole("link", { name: "Aurora Ledger Pte Ltd", exact: true }).click();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByLabel("Contact / recruiter", { exact: true }).fill("Alex · alex@example.com");
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill("Ask about the team and the rotation programme.");
  await page.getByLabel("Follow-up time", { exact: true }).fill("2026-10-01T14:30");
  await page.getByLabel("Completed deadline 1", { exact: true }).check();
  await page.getByRole("button", { name: "Add deadline", exact: true }).click();
  await page.getByLabel("Deadline label 2", { exact: true }).fill("Send portfolio");
  await page.getByLabel("Deadline time 2", { exact: true }).fill("2026-09-29T09:00");

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator(".detail-editor input, .detail-editor textarea, .detail-editor button").evaluateAll(elements => elements.every(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth;
    }))).toBe(true);
    await page.locator(".detail-editor").screenshot({ path: `test-results/details-editor-${width}.png` });
  }
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByText("Details saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByLabel("Contact / recruiter", { exact: true })).toHaveValue("Alex · alex@example.com");
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("Ask about the team and the rotation programme.");
  await expect(page.getByLabel("Follow-up time", { exact: true })).toHaveValue("2026-10-01T14:30");
  await expect(page.getByLabel("Completed deadline 1", { exact: true })).toBeChecked();
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill("Do not save this draft");
  await page.getByRole("button", { name: "Remove deadline 2", exact: true }).click();
  await page.getByRole("button", { name: "Cancel edits", exact: true }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const row = page.getByTestId("application-row-app-aurora-applied");
  await expect(row).toContainText("Send portfolio");
  await page.getByRole("link", { name: "Aurora Ledger Pte Ltd", exact: true }).click();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("Ask about the team and the rotation programme.");
  await page.getByLabel("Completed deadline 2", { exact: true }).check();
  await page.getByLabel("Follow-up time", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByText("Details saved.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(row).toContainText("No deadline scheduled");
  await expect(row).toContainText("Stage: Applied");
});
