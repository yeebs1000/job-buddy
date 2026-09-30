import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("built Buddy fills split address components and preserves existing answers and custom selectors", async ({ page }) => {
  await page.route("https://oracle.fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: readFileSync(resolve("extension/fixtures/oracle-address.html"), "utf8") }));
  await page.addInitScript(() => {
    (window as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: async (message: { type: string }) => {
      if (message.type === "status") return { ok: true, type: "status", paired: true };
      if (message.type === "get-preferences") return { ok: true, type: "preferences", preferences: { mode: "approval", paused: false, enabledDomains: [] } };
      if (message.type === "select-profile") return { ok: true, type: "profile-selection", selection: {
        "identity.givenName": "Alex", "contact.phoneNational": "81234567", "contact.houseNumber": "12A", "contact.streetName": "Example Road", "contact.unitNumber": "#03-45", "contact.buildingName": "Example House", "contact.postalCode": "123456",
        "contact.addressLine1": "DO NOT USE FOR BLOCK", "contact.addressLine2": "DO NOT USE FOR STREET", "contact.country": "Hong Kong", "contact.city": "Hong Kong",
      } };
      if (message.type === "record-activity") return { ok: true, type: "recorded" };
      return { ok: false, error: "invalid-request" };
    } } };
    document.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("apply-flow-section button")) (window as unknown as { nextClicked: boolean }).nextClicked = true;
    });
  });
  await page.goto("https://oracle.fixture.test/apply");
  await page.locator("#addressLine1-22").fill("Keep existing block");
  await page.addScriptTag({ path: resolve("dist-extension/content.js") });
  const buddy = page.locator('[data-job-buddy="panel"]');
  await buddy.getByRole("button", { name: "Open Job Buddy", exact: true }).click();
  await expect(buddy.getByText(/Choose these dropdowns directly/)).toBeVisible();
  await buddy.getByRole("button", { name: "Select safe, empty fields" }).click();
  await buddy.getByRole("button", { name: "Fill approved fields" }).click();
  await expect(page.locator("#addressLine2-23")).toHaveValue("Example Road");
  await expect(page.locator("#addressLine3-24")).toHaveValue("#03-45");
  await expect(page.locator("#building-25")).toHaveValue("Example House");
  await expect(page.locator('input[type="tel"]')).toHaveValue("81234567");
  await expect(page.locator("#addressLine1-22")).toHaveValue("Keep existing block");
  await expect(page.locator("#country-20")).toHaveValue("Singapore");
  await expect(page.locator("#city-27")).toHaveValue("Singapore");
  await expect(page.locator("#country-codes-dropdownphoneNumber")).toHaveValue("");
  await buddy.locator('input[value="addressLine1-22"]').check();
  await buddy.getByRole("button", { name: "Fill approved fields" }).click();
  await expect(page.locator("#addressLine1-22")).toHaveValue("12A");
  expect(await page.evaluate(() => (window as unknown as { nextClicked?: boolean }).nextClicked)).not.toBe(true);
  await page.screenshot({ path: "test-results/oracle-address-beta15.png", fullPage: true });
});
