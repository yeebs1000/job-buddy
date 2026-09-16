import { expect, test, type Page } from "@playwright/test";
import { FakeGmailApi, liveInterviewScan } from "./support/FakeGmailApi";

async function clearJobBuddyDatabase(page: Page) {
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("job-buddy");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("The test browser could not clear Job Buddy storage."));
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Circuit Harbour Ltd" })).toBeVisible();
}

test("connects, scans, survives revoked Gmail, and returns to demo", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T00:00:00.000Z") });
  const gmail = new FakeGmailApi(page);
  await gmail.install();
  await clearJobBuddyDatabase(page);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Gmail connector awaiting setup" })).toBeVisible();

  gmail.setStatus({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
  gmail.queueScan(liveInterviewScan);
  await page.goto("/settings?gmail=connected");
  await expect(page.getByText("user@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Scan last 90 days" }).click();
  await expect(page.getByRole("status")).toContainText(/recent updates were checked/i);

  await page.getByRole("link", { name: /Updates/ }).click();
  const interview = page.getByRole("article").filter({ hasText: "Technical interview invitation — Software Engineer" });
  await expect(interview.getByText("Gmail", { exact: true })).toBeVisible();
  await interview.getByRole("button", { name: "Approve update" }).click();
  await expect(interview.getByText("Review result: Update applied.")).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  const application = page.getByTestId("application-row-app-circuit-review");
  await expect(application).toContainText("Stage: Interview");
  await expect(application.getByRole("link", { name: "Open meeting link" })).toBeVisible();

  gmail.setStatus({ state: "reconnect-required", accountEmail: "user@example.com", platformSupported: true, lastError: "token-revoked" });
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Reconnect Gmail" })).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByTestId("application-row-app-circuit-review").getByRole("link", { name: "Open meeting link" })).toBeVisible();

  gmail.setStatus({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
  await page.goto("/settings");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("status")).toContainText(/evidence was kept/i);
  expect(gmail.disconnected).toBe(true);
  await page.getByRole("button", { name: "Use demo inbox" }).click();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("Demo inbox", { exact: true })).toBeVisible();
});

test("returns from an initiated consent flow directly to a completed first scan", async ({ page }) => {
  const gmail = new FakeGmailApi(page);
  await gmail.install();
  gmail.setStatus({ state: "disconnected", platformSupported: true });
  await page.route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Test-only consent screen</p>" }));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Connect Gmail", exact: true }).click();
  await expect(page).toHaveURL(/accounts.google.com/);
  gmail.setStatus({ state: "connected", platformSupported: true, accountEmail: "user@example.com" });
  gmail.queueScan(liveInterviewScan);
  await page.goto("/settings?gmail=connected");
  await expect(page.getByRole("status")).toContainText("New updates are ready in Updates");
  await expect(page.getByRole("checkbox", { name: /Daily active-session scan/i })).toBeChecked();
});
