import { expect, test } from "@playwright/test";
import { normalizeGmailMessage } from "../server/gmail/GmailMessageNormalizer";
import { FakeGmailApi, liveInterviewScan } from "./support/FakeGmailApi";

test("recovers forwarded rejection and outreach, preserving reviewed evidence on repeated rechecks", async ({ page }, testInfo) => {
  const gmail = new FakeGmailApi(page); await gmail.install();
  gmail.setStatus({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
  const rejection = normalizeGmailMessage({ id: "ignored-rejection", internalDate: String(Date.parse("2026-09-17T01:00:00Z")), payload: {
    mimeType: "text/plain", headers: [{ name: "From", value: "Owner <owner@university.example>" }, { name: "Subject", value: "Fwd: Analyst application update" }],
    body: { data: Buffer.from(`From: Workday Notify <recruiting@myworkday.com>\nDate: Yesterday\nSubject: Associate Analyst application update\nTo: Candidate <candidate@university.example>\nCc: ${"another@example.test, ".repeat(40)}\n\nThank you for your interest in the Associate Analyst role. We regret to inform you that you were not selected to move to the next stage in the process.`).toString("base64url") },
  } })!;
  const outreach = { ...liveInterviewScan.messages[0], providerMessageId: "ignored-outreach", fromAddress: "alex@exampletalent.test", subject: "Senior Consultant opportunity - Shanghai", excerpt: "I am from an executive search firm focused on strategy consulting recruitment. I am reaching out regarding a Shanghai-based Senior Consultant opportunity. Your background could be a strong fit.", links: [] };
  let requests = 0;
  await page.route("**/api/gmail/scan", route => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ cursor: null, initialSyncConfirmed: true });
    return route.fulfill({ json: requests === 1 ? liveInterviewScan : { ...liveInterviewScan, nextCursor: "recheck-new-history", messages: [...liveInterviewScan.messages, rejection, outreach] } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Circuit Harbour Ltd" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Scan last 90 days" }).click();
  await expect(page.locator(".settings-page__message")).toContainText("recent updates were checked");
  await page.getByRole("link", { name: /Updates/ }).click();
  const interview = page.getByRole("article").filter({ hasText: "Technical interview invitation — Software Engineer" });
  await interview.getByRole("button", { name: "Approve update" }).click();
  await expect(interview).toContainText("Review result: Update applied.");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("job-buddy");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction("processedMessages", "readwrite");
      for (const id of ["ignored-rejection", "ignored-outreach"]) tx.objectStore("processedMessages").put({ id, processedAt: "2026-09-17T00:00:00Z" });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  await page.getByRole("link", { name: "Overview" }).click();
  await page.getByText("Missing an older email?", { exact: true }).click();
  await page.getByRole("button", { name: "Recheck recent emails" }).click();
  await expect(page.getByRole("link", { name: "Review 2 pending updates" })).toBeVisible();
  await page.getByRole("link", { name: /Updates/, exact: false }).first().click();
  const rejected = page.getByRole("article").filter({ hasText: "Fwd: Analyst application update" });
  await expect(rejected.getByLabel("Proposed outcome")).toHaveValue("rejected");
  await expect(rejected).toContainText("original sender (unverified)");
  const approached = page.getByRole("article").filter({ hasText: outreach.subject });
  await expect(approached).toContainText("Recruiter outreach");
  await expect(approached.getByLabel("Proposed stage")).toHaveCount(0);
  await expect(approached.getByRole("button", { name: "Approve update" })).toHaveCount(0);
  await expect(interview).toHaveCount(1);
  await expect(interview).toContainText("Status: approved");
  await page.setViewportSize({ width: 390, height: 844 });
  await approached.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("recruiter-outreach-mobile.png") });
  await approached.getByRole("button", { name: "Dismiss outreach" }).click();
  await expect(approached).toContainText("Status: dismissed");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByText("Missing an older email?", { exact: true }).click();
  await page.getByRole("button", { name: "Recheck recent emails" }).click();
  await expect(page.locator(".settings-page__message")).toContainText("recent updates were checked");
  await page.getByRole("link", { name: /Updates/ }).click();
  await expect(approached).toContainText("Status: dismissed");
  await expect(rejected).toHaveCount(1);
  await expect(interview).toHaveCount(1);
  expect(requests).toBe(3);
});
