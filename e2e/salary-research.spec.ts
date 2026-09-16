import { expect, test, type Page } from "@playwright/test";

test("researches SG, HK, and US software applications without crossing markets", async ({ page }) => {
  await page.route("**/api/buddy/salary-evidence", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ evidence: [] }) }));
  await page.route("**/api/research/lookup", async (route) => {
    const query = route.request().postDataJSON() as { market: "SG" | "HK" | "US"; canonicalRole: string };
    const values = query.market === "SG"
      ? { currency: "SGD", period: "monthly", p25: 6_000, p50: 8_000, p75: 10_000, code: "MOM-PMETS", ceiling: undefined }
      : query.market === "HK"
        ? { currency: "HKD", period: "monthly", p25: 25_000, p50: 36_000, p75: 50_000, code: "HK-PROF", ceiling: "limited" }
        : { currency: "USD", period: "annual", p25: 120_000, p50: 145_000, p75: 165_000, code: "15-1243", ceiling: undefined };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      releaseId: `${query.market}-2026`, retrievedAt: "2026-09-16T00:00:00.000Z", fallback: "exact",
      benchmark: {
        id: `${query.market}-${query.canonicalRole}`, releaseId: `${query.market}-2026`, market: query.market,
        currency: values.currency, period: values.period, sourceOccupationCode: values.code, sourceOccupationLabel: query.canonicalRole,
        canonicalRole: query.canonicalRole, geographyLevel: "national", geographyCode: query.market, geographyLabel: query.market,
        p25: values.p25, p50: values.p50, p75: values.p75, referencePeriod: "2026-05",
        compensationScope: "Occupational earnings", sourceUrl: officialUrl(query.market),
        ...(values.ceiling ? { matchCeiling: values.ceiling } : {}),
      },
      cpiPoints: [],
    }) });
  });

  await research(page, "/applications/app-circuit-review");
  await expect(page.getByRole("region", { name: "Salary estimate" })).toContainText(/SGD 6,000–10,000 \/ month/);

  await research(page, "/applications/app-lantern-withdrawn");
  await expect(page.getByRole("region", { name: "Salary estimate" })).toContainText(/HKD 18,500–62,500 \/ month/);
  await expect(page.getByRole("region", { name: "Salary estimate" })).toContainText("limited");

  await research(page, "/applications/app-moon-interview");
  const result = page.getByRole("region", { name: "Salary estimate" });
  await expect(result).toContainText(/USD 100,000–185,000 \/ year/);
  await expect(result.getByRole("link", { name: "Open official salary source" })).toHaveAttribute("href", "https://www.bls.gov/oes/");
  await result.getByRole("button", { name: "Save research snapshot" }).click();
  await expect(page.getByText("Research snapshot saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Saved research history (1)")).toBeVisible();
});

async function research(page: Page, path: string) {
  await page.goto(path);
  await page.getByLabel("I confirm this role mapping").check();
  await page.getByRole("button", { name: "Confirm role mapping" }).click();
  await page.getByRole("button", { name: "Research salary" }).click();
}

function officialUrl(market: "SG" | "HK" | "US") {
  return market === "SG" ? "https://stats.mom.gov.sg/" : market === "HK" ? "https://www.censtatd.gov.hk/" : "https://www.bls.gov/oes/";
}
