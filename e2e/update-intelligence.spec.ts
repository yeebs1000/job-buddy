import { expect, test } from "@playwright/test";
import { seedTracker } from "./support/seedTracker";
import { FakeGmailApi, liveInterviewScan } from "./support/FakeGmailApi";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T00:00:00.000Z") });
  const gmail = new FakeGmailApi(page); await gmail.install();
  gmail.setStatus({ state: "connected", accountEmail: "test@example.com", platformSupported: true });
  gmail.queueScan(liveInterviewScan);
  await seedTracker(page);
});

test("scans fixture mail, reviews evidence, and updates an interview deadline", async ({ page }) => {
  // Mock Gmail transport exercises the real production mail path with explicit fixture applications.
  await expect(page.getByRole("heading", { name: "Application command center" })).toBeVisible();
  await page.getByRole("button", { name: "Scan last 90 days" }).click();
  await page.getByRole("link", { name: /review .*pending update/i }).click();

  const technicalInterview = page.getByRole("article").filter({ hasText: "Technical interview invitation — Software Engineer" });
  await expect(technicalInterview).toContainText("Circuit Harbour Ltd · Software Engineer");
  await expect(technicalInterview).toContainText("Taylor Ng");
  await expect(technicalInterview).toContainText("taylor.ng@circuitharbour.example");
  await expect(technicalInterview).toContainText("Circuit Harbour Ltd would like to invite you to a technical interview on 2026-09-13 at 2:00 PM SGT.");
  await expect(technicalInterview).toContainText("Match: Suggested application");
  await expect(technicalInterview).toContainText("Rule-based suggestion — not a measured probability.");
  await expect(technicalInterview).not.toContainText("confidence:");
  await expect(technicalInterview).toContainText("technical interview invitation");
  await technicalInterview.getByRole("button", { name: "Approve update" }).click();
  await expect(technicalInterview.getByText("Review result: Update applied.")).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  const circuit = page.getByTestId("application-row-app-circuit-review");
  await expect(circuit).toContainText("Stage: Interview");
  await expect(circuit).toContainText("Tomorrow: Technical interview · 2:00 PM SGT");
});
