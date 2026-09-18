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

test("filters news by sender, title and offer context while retaining recruiting evidence", async ({ page }) => {
  const gmail = new FakeGmailApi(page); await gmail.install();
  gmail.setStatus({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
  const base = liveInterviewScan.messages[0];
  gmail.queueScan({ ...liveInterviewScan, messages: [base,
    { ...base, providerMessageId: "news-domain", fromAddress: "noreply@news.bloomberg.com", subject: "A consulting deal", excerpt: "A consulting offer was made to a third party." },
    { ...base, providerMessageId: "news-promo", fromName: "Must Reads", fromAddress: "account@seekingalpha.com", subject: "Beyond Nvidia: AI stocks", excerpt: "Join now with a special intro offer." },
    { ...base, providerMessageId: "news-title", subject: "Daily newsletter: Technical interview invitation", excerpt: "We invite you to a technical interview workshop." },
    { ...base, providerMessageId: "real-offer", fromAddress: "recruiting@bloomberg.com", subject: "Your Software Engineer offer", excerpt: "We are pleased to offer you the Software Engineer position." },
  ] });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Scan last 90 days" }).click();
  await expect(page.locator(".settings-page__message")).toContainText("recent updates were checked");
  await page.getByRole("link", { name: /Updates/ }).click();
  await expect(page.getByRole("heading", { name: base.subject })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Software Engineer offer" })).toBeVisible();
  for (const title of ["A consulting deal", "Beyond Nvidia: AI stocks", "Daily newsletter: Technical interview invitation"]) {
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  }
  await expect(page.getByText(/classification confidence:.*%/i)).toHaveCount(0);

  // Simulate an old persisted false positive in this isolated test browser only.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("job-buddy");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("updateProposals", "readwrite");
      const store = tx.objectStore("updateProposals");
      const rows = store.getAll();
      rows.onsuccess = () => {
        const existing = rows.result.find(row => row.source.providerMessageId === "real-offer");
        store.put({ ...existing, id: "legacy-news", status: "pending", state: "pending", source: { ...existing.source, providerMessageId: "legacy-news", fromAddress: "noreply@news.bloomberg.com", subject: "Saved news false positive", excerpt: "A consulting offer to a third party." } });
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  await page.reload();
  await page.getByRole("button", { name: "Show filtered (1)" }).click();
  const filtered = page.getByRole("region", { name: "Filtered saved updates" });
  await expect(filtered.getByRole("heading", { name: "Saved news false positive" })).toBeVisible();
  await expect(filtered).toContainText("Newsletter sender");
  await expect(filtered.getByRole("button", { name: "Approve update" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await filtered.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/beta11-filtered-mobile.png" });
  await filtered.getByRole("button", { name: "Restore for manual review" }).click();
  const restored = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Saved news false positive" }) });
  await expect(restored.getByLabel("Proposed stage")).toHaveValue("");
  await expect(restored).toContainText("Manually restored");
  await page.reload();
  await expect(restored.getByLabel("Proposed stage")).toHaveValue("");
});

test("saves partial Gmail progress, survives reload, and resumes without duplicate evidence", async ({ page }) => {
  const gmail = new FakeGmailApi(page); await gmail.install();
  gmail.setStatus({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
  const token = `${"a".repeat(32)}:25`;
  let requestNumber = 0;
  await page.route("**/api/gmail/scan", async route => {
    const input = route.request().postDataJSON(); requestNumber++;
    expect(input.batch).toBe(true);
    expect(input.cursor).toBeNull();
    if (requestNumber === 1) {
      expect(input.continuationToken).toBeUndefined();
      return route.fulfill({ json: { ...liveInterviewScan, progress: { processed: 25, total: 30 }, continuationToken: token } });
    }
    expect(input.continuationToken).toBe(token);
    if (requestNumber === 2) return route.fulfill({ status: 503, json: { error: { code: "gmail-timeout", message: "private provider text" } } });
    return route.fulfill({ json: { ...liveInterviewScan, progress: { processed: 30, total: 30 } } });
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Scan last 90 days" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Google took too long" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Gmail messages checked" })).toHaveAttribute("value", "25");
  await page.reload();
  await page.getByRole("button", { name: "Resume Gmail scan" }).click();
  await expect(page.locator(".settings-page__message")).toContainText("recent updates were checked");
  await expect(page.getByRole("progressbar", { name: "Gmail messages checked" })).toHaveAttribute("value", "30");
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("region", { name: "Live Gmail scan" })).not.toContainText("Last successful scan: Never");
  await page.getByRole("link", { name: /Updates/ }).click();
  await expect(page.getByRole("article").filter({ hasText: "Technical interview invitation — Software Engineer" })).toHaveCount(1);
  expect(requestNumber).toBe(3);
});

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

test("connects through a popup and scans without navigating the dashboard", async ({ page }) => {
  const gmail = new FakeGmailApi(page);
  await gmail.install();
  gmail.setStatus({ state: "disconnected", platformSupported: true });
  await page.context().route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Test-only consent screen</p>" }));
  await page.goto("/settings");
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Connect Gmail", exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL(/accounts.google.com/);
  await expect(page).toHaveURL(/\/settings$/);
  gmail.setStatus({ state: "connected", platformSupported: true, accountEmail: "user@example.com" });
  gmail.queueScan(liveInterviewScan);
  // The provider's isolated window returns to the local callback, whose own
  // script closes it. A dashboard window cannot reliably close a COOP popup.
  await page.context().route("**/api/gmail/oauth/callback?*", async (route) => {
    gmail.completePopup("connected");
    await route.fulfill({ contentType: "text/html", body: '<script>history.replaceState(null,"","/api/gmail/oauth/callback");window.close();</script>' });
  });
  await popup.goto(new URL("/api/gmail/oauth/callback?state=fake&code=fake", page.url()).href, { waitUntil: "commit" });
  await expect(page.getByRole("status")).toContainText("New updates are ready in Updates");
  await expect(page.getByRole("checkbox", { name: /Daily active-session scan/i })).toBeChecked();
  await expect.poll(() => popup.isClosed()).toBe(true);
  expect(gmail.scanRequests).toBe(1);
});

test("a blocked popup is retryable and never scans", async ({ page }) => {
  const gmail = new FakeGmailApi(page);
  await gmail.install();
  gmail.setStatus({ state: "disconnected", platformSupported: true });
  await page.addInitScript(() => { window.open = () => null; });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Connect Gmail", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /allow popups/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Gmail", exact: true })).toBeEnabled();
  expect(gmail.scanRequests).toBe(0);
});

test("denied consent and a manually closed popup leave scan controls safe", async ({ page }) => {
  const gmail = new FakeGmailApi(page);
  await gmail.install();
  gmail.setStatus({ state: "disconnected", platformSupported: true });
  await page.context().route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Test-only consent screen</p>" }));
  await page.goto("/settings");
  const deniedPopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Connect Gmail", exact: true }).click();
  await expect(await deniedPopup).toHaveURL(/accounts.google.com/);
  gmail.completePopup("error");
  await expect(page.getByRole("alert").filter({ hasText: /Google sign-in could not finish/i })).toBeVisible();
  const closedPopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Connect Gmail", exact: true }).click();
  const popup = await closedPopup;
  await expect(popup).toHaveURL(/accounts.google.com/);
  await popup.close();
  await page.getByRole("button", { name: "Stop waiting" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /stopped waiting/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Daily active-session scan/i })).not.toBeChecked();
  expect(gmail.scanRequests).toBe(0);
  await expect(page).toHaveURL(/\/settings$/);
});
