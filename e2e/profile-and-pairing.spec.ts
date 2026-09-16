import { expect, test } from "@playwright/test";

test("saves a local profile and creates a one-time browser pairing code", async ({ page }) => {
  let savedProfile: unknown = null;
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PUT") savedProfile = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().method() === "GET"
      ? { platformSupported: true, hasProfile: Boolean(savedProfile), profile: savedProfile }
      : { profile: savedProfile }) });
  });
  await page.route("**/api/buddy/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response = path.endsWith("/status") ? { paired: false }
      : path.endsWith("/preferences") ? { preferences: { mode: "approval", paused: false, enabledDomains: [] } }
      : path.endsWith("/activity") ? { activity: [] }
      : path.endsWith("/pairing/start") ? { code: "ABCDE-FGHJK", expiresAt: "2099-09-16T02:05:00.000Z" }
      : { captures: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });

  await page.goto("/profile");
  await page.getByLabel("First name").fill("Alex");
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved locally.")).toBeVisible();
  expect(savedProfile).toMatchObject({ identity: { givenName: "Alex" }, contact: { email: "alex@example.com" } });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Pair browser extension" }).click();
  await expect(page.getByText("ABCDE-FGHJK")).toBeVisible();
  await expect(page.getByText(/expires in under 5 minutes/i)).toBeVisible();
});
