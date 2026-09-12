# Job Buddy Regional Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source-backed Singapore and Hong Kong salary estimates and regional company-rating snapshots through deterministic, provider-neutral fixture adapters.

**Architecture:** Salary and company-review adapters return normalized snapshots with source, market, retrieval time, and sample metadata. Version 1 reads checked-in synthetic fixtures; application detail and filters consume persisted snapshots without knowing the provider.

**Tech Stack:** Existing React/TypeScript/IndexedDB/Vitest/Playwright stack and Zod.

**Spec:** `docs/superpowers/specs/2026-09-12-job-buddy-design.md`

## Global Constraints

- Complete the core tracker plan first.
- Singapore and Hong Kong data must remain separate and use SGD or HKD explicitly.
- Every estimate or rating displays source and retrieval date.
- Missing or stale data is labelled and never fabricated.
- Version 1 uses synthetic fixtures only; no unauthorized scraping is permitted.

---

## File map

- `src/integrations/research/SalaryAdapter.ts` — salary lookup contract.
- `src/integrations/research/CompanyReviewAdapter.ts` — company-review contract.
- `src/integrations/research/FixtureResearchAdapter.ts` — deterministic implementation.
- `src/features/research/normalizeResearch.ts` — validation and freshness.
- `src/features/research/ResearchPanel.tsx` — application-detail presentation.
- `src/features/research/refreshResearch.ts` — persistence orchestration.
- `src/fixtures/research/` — synthetic SG/HK sources.

---

### Task 1: Define provider-neutral research contracts and fixtures

**Files:**
- Create: `src/integrations/research/SalaryAdapter.ts`
- Create: `src/integrations/research/CompanyReviewAdapter.ts`
- Create: `src/integrations/research/FixtureResearchAdapter.ts`
- Create: `src/integrations/research/FixtureResearchAdapter.test.ts`
- Create: `src/fixtures/research/salary.ts`
- Create: `src/fixtures/research/companyReviews.ts`

**Interfaces:**
- Produces: `SalaryAdapter.lookup(query)`, `CompanyReviewAdapter.lookup(query)`, `SalaryResult`, and `CompanyReviewResult`.
- Consumes: role family, role title, company, and market.

- [ ] **Step 1: Write failing adapter tests**

```ts
it("keeps Singapore and Hong Kong salary results market-specific", async () => {
  const sg = await adapter.lookupSalary({ roleTitle: "Software Engineer", roleFamily: "software", market: "SG" });
  const hk = await adapter.lookupSalary({ roleTitle: "Software Engineer", roleFamily: "software", market: "HK" });
  expect(sg.currency).toBe("SGD");
  expect(hk.currency).toBe("HKD");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/integrations/research/FixtureResearchAdapter.test.ts`

Expected: FAIL because the contracts and adapter are missing.

- [ ] **Step 3: Implement validated fixture responses**

Salary results contain annual minimum, midpoint, maximum, currency, role/market match, sample size, source label, source URL, and retrieved time. Company results contain company, market, rating, review count, source label, source URL, and retrieved time. Use fictional provider names and clearly mark fixtures as synthetic.

- [ ] **Step 4: Verify and commit contracts**

Run: `npm test -- src/integrations/research/FixtureResearchAdapter.test.ts`

Expected: PASS for market separation, missing result, company-region separation, and fixture failure.

```bash
git add src/integrations/research src/fixtures/research
git commit -m "feat: define regional research adapters"
```

---

### Task 2: Normalize, persist, and mark stale research

**Files:**
- Create: `src/features/research/normalizeResearch.ts`
- Create: `src/features/research/normalizeResearch.test.ts`
- Create: `src/features/research/refreshResearch.ts`
- Create: `src/features/research/refreshResearch.test.ts`

**Interfaces:**
- Consumes: research adapters and `researchSnapshots` Dexie table.
- Produces: `normalizeSalary`, `normalizeCompanyReview`, `isResearchStale(snapshot, now)`, and `refreshResearch(applicationId)`.

- [ ] **Step 1: Write failing normalization and freshness tests**

```ts
it("rejects inverted salary ranges and currency-market mismatches", () => {
  expect(() => normalizeSalary({ min: 120000, max: 90000, currency: "SGD", market: "SG" })).toThrow();
  expect(() => normalizeSalary({ min: 90000, max: 120000, currency: "HKD", market: "SG" })).toThrow();
});

it("marks a snapshot stale after 30 days", () => {
  expect(isResearchStale(snapshotFrom("2026-08-01"), new Date("2026-09-12"))).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/research/normalizeResearch.test.ts`

Expected: FAIL because normalization is missing.

- [ ] **Step 3: Implement strict normalization and transactional refresh**

Validate rating `0–5`, non-negative review/sample counts, annual salary order, explicit currency, HTTPS source URLs, and ISO retrieval dates. Refresh salary and review independently; one provider failure must not delete or overwrite the other valid snapshot.

- [ ] **Step 4: Verify and commit persistence**

Run: `npm test -- src/features/research/normalizeResearch.test.ts src/features/research/refreshResearch.test.ts`

Expected: PASS for valid, invalid, missing, stale, partial-failure, and repeated-refresh cases.

```bash
git add src/features/research
git commit -m "feat: normalize regional job research"
```

---

### Task 3: Present regional research in application detail and filters

**Files:**
- Create: `src/features/research/ResearchPanel.tsx`
- Create: `src/features/research/ResearchPanel.test.tsx`
- Create: `src/features/research/research.css`
- Modify: `src/features/application-detail/ApplicationDetailPage.tsx`
- Modify: `src/features/applications/ApplicationFilters.tsx`

**Interfaces:**
- Consumes: persisted `ResearchSnapshot`, `refreshResearch`, and application market.
- Produces: accessible salary/rating presentation, stale state, unavailable state, source links, retrieval date, and simulated refresh.

- [ ] **Step 1: Write the failing panel test**

```tsx
it("shows market, currency, source, date, and stale state", () => {
  render(<ResearchPanel application={sgApplication} snapshots={[staleSalary, companyReview]} />);
  expect(screen.getByText(/SGD/)).toBeVisible();
  expect(screen.getByText(/Singapore/)).toBeVisible();
  expect(screen.getByText(/stale/i)).toBeVisible();
  expect(screen.getAllByRole("link", { name: /source/i })).not.toHaveLength(0);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/research/ResearchPanel.test.tsx`

Expected: FAIL because the panel is missing.

- [ ] **Step 3: Implement presentation and filter integration**

Show annual range and midpoint, explicit market/currency, company rating/review count, source, retrieval date, and stale/unavailable status. Do not imply certainty beyond the sample. Add salary/currency and company-rating filters using normalized snapshot fields.

- [ ] **Step 4: Verify and commit the UI**

Run: `npm test -- src/features/research/ResearchPanel.test.tsx src/domain/filters.test.ts && npm run typecheck`

Expected: PASS for valid, stale, unavailable, SG, HK, and source-link states.

```bash
git add src/features/research src/features/application-detail/ApplicationDetailPage.tsx src/features/applications/ApplicationFilters.tsx
git commit -m "feat: show regional salary and company insights"
```

---

### Task 4: Verify the regional-insights journey

**Files:**
- Create: `e2e/regional-insights.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all outputs from Tasks 1–3.
- Produces: deterministic SG/HK research behavior and documented provider boundary.

- [ ] **Step 1: Write the end-to-end market check**

```ts
test("keeps salary and company reviews regional", async ({ page }) => {
  await page.goto("/applications/sg-software");
  await expect(page.getByText(/SGD/)).toBeVisible();
  await expect(page.getByText(/Singapore/)).toBeVisible();
  await page.goto("/applications/hk-software");
  await expect(page.getByText(/HKD/)).toBeVisible();
  await expect(page.getByText(/Hong Kong/)).toBeVisible();
});
```

- [ ] **Step 2: Run the journey and fix only integration gaps**

Run: `npm run test:e2e -- e2e/regional-insights.spec.ts`

Expected: PASS without network access.

- [ ] **Step 3: Document source and legal boundaries**

README must state that version 1 values are synthetic, real providers require permitted adapters, estimates display source/date, and missing research never blocks tracking.

- [ ] **Step 4: Run the full verification gate and commit**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`

Expected: every test passes and the production build succeeds.

```bash
git add e2e/regional-insights.spec.ts README.md
git commit -m "test: verify regional insights workflow"
```

