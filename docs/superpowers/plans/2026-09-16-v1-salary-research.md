# Job Buddy v1 Salary Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship source-backed, local-first salary research for software and IT applications in Singapore, Hong Kong, and the United States, including confirmed job-posting evidence, grounded CPI adjustment, transparent confidence, and public-beta hardening.

**Architecture:** Pure TypeScript domain modules perform role matching, benchmark resolution, estimation, inflation adjustment, confidence labelling, and display rounding. The local companion service downloads and atomically caches validated official releases through one adapter per market; the React app persists observations and immutable estimate snapshots in Dexie. The browser extension detects explicit salary bands but requires confirmation before sending salary evidence to the paired local service.

**Tech Stack:** React 19, TypeScript, Zod, Dexie/IndexedDB, Node HTTP companion service, Chrome/Edge MV3 extension, Vitest, Testing Library, Playwright, ExcelJS, fflate, and pdfjs-dist.

**Spec:** `docs/superpowers/specs/2026-09-16-v1-salary-research-design.md`

## Global Constraints

- Debut markets are exactly Singapore (`SG`), Hong Kong (`HK`), and United States (`US`).
- The first supported disciplines are software and IT; no finance-role salary catalogue is added in this slice.
- Official government data anchors every primary estimate; missing official support returns `insufficient_evidence`.
- Singapore, Hong Kong, and U.S. currencies and pay periods remain separate; no cross-currency conversion is performed.
- U.S. geographic resolution is metropolitan/nonmetropolitan area, then state, then national.
- Job-posting evidence and private/manual evidence require explicit user confirmation and remain local.
- A private offer affects general market estimates only when the user explicitly opts it in.
- Commercial sites are not scraped and commercial datasets are not bundled.
- CPI adjustment means purchasing-power equivalence, never wage forecasting.
- Official benchmarks older than three years are not used as a primary estimate.
- Display values round downward: SGD monthly to 100, HKD monthly to 500, USD annual to 5,000, other monthly values to 100, and other annual values to 5,000.
- Existing application tracking, Gmail scanning, import/export, candidate profile, and autofill behavior must remain functional.
- Use TDD for every production change and keep commits scoped to one task.

---

## File Structure

### Shared domain and persistence

- `src/domain/research.ts` — Zod schemas and stable salary-research contracts shared by UI, server, and extension.
- `src/domain/research.test.ts` — schema boundary and invalid-input tests.
- `src/domain/application.ts` — expands application market/location types to the United States while retaining the legacy saved salary field.
- `src/db/database.ts` — Dexie version 2 schema for observations and immutable estimate snapshots.
- `src/features/research/researchRepository.ts` — local observation/snapshot persistence only; official release data stays in the companion cache.
- `src/features/research/roleCatalog.ts` — deterministic software/IT alias and official-code catalogue.
- `src/features/research/matchRole.ts` — role matching and explicit user override behavior.
- `src/features/research/resolveBenchmark.ts` — market/geography resolution, including U.S. fallback order.
- `src/features/research/inflation.ts` — CPI period selection and purchasing-power adjustment.
- `src/features/research/calculateEstimate.ts` — observation eligibility, blending, widening, confidence, assumptions, and exact result.
- `src/features/research/roundSalary.ts` — market/period-specific display flooring.

### Companion service and official sources

- `server/research/ResearchSource.ts` — official adapter and cache contracts.
- `server/research/ResearchCache.ts` — staged validation, checksum, atomic promotion, quarantine, and last-known-good reads.
- `server/research/ResearchService.ts` — refresh/status/lookup orchestration across three market adapters.
- `server/research/sourceManifest.ts` — allowlisted official source URLs and release metadata.
- `server/research/adapters/SingaporeMomAdapter.ts` — MOM XLSX and SingStat CPI normalization.
- `server/research/adapters/HongKongCsdAdapter.ts` — C&SD earnings/CPI PDF normalization.
- `server/research/adapters/UnitedStatesBlsAdapter.ts` — BLS OEWS ZIP/TXT and CPI-U API normalization.
- `server/research/parsers/excel.ts` — server-side values-only workbook reader with explicit limits.
- `server/research/parsers/pdfText.ts` — bounded PDF text extraction for the two allowlisted C&SD reports.
- `server/research/parsers/tabular.ts` — bounded ZIP/TXT/CSV parsing.
- `server/start.ts` — constructs the research service.
- `server/http/createCompanionServer.ts` — exposes dashboard-only research endpoints and paired-extension salary-evidence endpoints.

### React application

- `src/features/research/researchClient.ts` — validates companion research responses.
- `src/features/research/ResearchPanel.tsx` — application salary workflow and evidence/source disclosure.
- `src/features/research/RoleMatchForm.tsx` — proposed match and user correction.
- `src/features/research/ObservationForm.tsx` — manual/recruiter/offer evidence entry.
- `src/features/research/research.css` — accessible, responsive panel styles using existing tokens.
- `src/features/application-detail/ApplicationDetailPage.tsx` — replaces the legacy static salary block with `ResearchPanel` while retaining a legacy fallback.

### Browser extension

- `extension/src/research/detectSalary.ts` — deterministic visible-page salary detection.
- `extension/src/research/detectSalary.test.ts` — currency, range, period, and false-positive tests.
- `extension/src/content.ts` — queues a candidate for review without automatic approval.
- `extension/src/ui/BuddyPanel.ts` — editable salary confirmation state.
- `extension/src/companionClient.ts` and `extension/src/service-worker.ts` — authenticated salary-evidence transport.
- `src/domain/buddy.ts`, `server/buddy/BuddyService.ts`, and `server/buddy/BuddyStore.ts` — shared salary-evidence schema and bounded local queue.

### Release hardening

- `src/features/import-export/excelWorkbook.ts` — ExcelJS-based values-only import/export boundary.
- `src/features/import-export/parseTracker.ts` and `exportTracker.ts` — remove vulnerable SheetJS usage.
- `scripts/verify-research-sources.mjs` — rejects commercial URLs and missing source attribution from release artifacts.
- `e2e/salary-research.spec.ts` — three-market, stale-data, failure, and persistence journeys.
- `e2e-extension/salary-evidence.spec.ts` — built-extension confirmation journey.
- `README.md`, `SECURITY.md`, and `package.json` — public-beta setup, source/legal boundaries, security posture, and `1.0.0-beta.1` version.

---

### Task 1: Add research contracts, U.S. applications, and Dexie v2 persistence

**Files:**
- Create: `src/domain/research.ts`
- Create: `src/domain/research.test.ts`
- Modify: `src/domain/application.ts`
- Modify: `src/db/database.ts`
- Create: `src/features/research/researchRepository.ts`
- Create: `src/features/research/researchRepository.test.ts`
- Modify: `src/features/buddy/captureApplication.ts`
- Modify: `src/features/buddy/PendingCaptures.tsx`
- Modify: `src/features/applications/ApplicationsPage.tsx`
- Modify: `src/features/applications/ApplicationFilters.tsx`
- Modify: `src/domain/filters.ts`
- Modify: `src/features/import-export/parseTracker.ts`
- Modify: `src/fixtures/sampleApplications.ts`
- Modify: `src/features/buddy/captureApplication.test.ts`
- Modify: `src/features/buddy/PendingCaptures.test.tsx`
- Modify: `src/features/applications/ApplicationsPage.test.tsx`
- Modify: `src/domain/filters.test.ts`
- Modify: `src/features/import-export/parseTracker.test.ts`

**Interfaces:**
- Produces: `Market`, `Currency`, `PayPeriod`, `SalaryBenchmark`, `CpiPoint`, `RoleMatch`, `RoleAliasOverride`, `SalaryObservation`, `SalaryEstimateSnapshot`, `salaryObservationSchema`, and `salaryEstimateSnapshotSchema`.
- Produces: `researchRepository.addObservation`, `listObservations`, `saveSnapshot`, `latestSnapshot`, `listSnapshots`, `saveRoleAlias`, and `listRoleAliases`.
- Preserves: existing `Application.research` as read-only legacy data until Task 9 replaces its presentation.

- [ ] **Step 1: Write failing schema and repository tests**

```ts
it("keeps the three debut markets and rejects an inverted range", () => {
  expect(marketSchema.options).toEqual(["SG", "HK", "US"]);
  expect(() => salaryObservationSchema.parse({
    id: "o1", applicationId: "a1", provenance: "job_posting", market: "US",
    currency: "USD", period: "annual", minimum: 160_000, maximum: 120_000,
    canonicalRole: "software-engineer", observedAt: "2026-09-16T00:00:00.000Z",
    sourceUrl: "https://jobs.example/1", reusable: true,
  })).toThrow();
});

it("persists observations separately from immutable estimate snapshots", async () => {
  await researchRepository.addObservation(observation);
  await researchRepository.saveSnapshot(snapshot);
  expect(await researchRepository.listObservations("a1")).toEqual([observation]);
  expect(await researchRepository.latestSnapshot("a1")).toEqual(snapshot);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm.cmd test -- src/domain/research.test.ts src/features/research/researchRepository.test.ts`

Expected: FAIL because the research contracts, tables, and repository do not exist.

- [ ] **Step 3: Implement strict shared schemas and application market expansion**

```ts
export const marketSchema = z.enum(["SG", "HK", "US"]);
export const currencySchema = z.enum(["SGD", "HKD", "USD"]);
export const payPeriodSchema = z.enum(["monthly", "annual"]);
export const salaryObservationSchema = z.object({
  id: z.string().min(1).max(200),
  applicationId: z.string().min(1).max(200),
  provenance: z.enum(["job_posting", "recruiter", "offer", "manual"]),
  market: marketSchema,
  currency: currencySchema,
  period: payPeriodSchema,
  minimum: z.number().finite().positive(),
  maximum: z.number().finite().positive().optional(),
  canonicalRole: z.string().min(1).max(100),
  observedAt: z.string().datetime(),
  sourceUrl: z.string().url().max(2_048).optional(),
  evidenceExcerpt: z.string().trim().min(1).max(500).optional(),
  reusable: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.maximum !== undefined && value.maximum < value.minimum) context.addIssue({ code: "custom", message: "inverted-range" });
});
```

Expand `Application.market` to `Market`, expand `location.country` to include `United States`, and add optional `state` and `metroCode`. Update capture metadata so U.S. applications require a state while SG/HK continue to require only city/country.

Define `SalaryBenchmark` with `id`, `releaseId`, market/currency/period, source occupation code/label, optional canonical role and industry, geography level/code/label, P25/P50/P75, reference period, compensation scope, source URL, and optional match ceiling. Define `CpiPoint` with source, market, period, positive index, base label, and retrieval time. Define `RoleMatch` with original title, canonical role, source occupation code, strength, rule ID, and override state. Define `RoleAliasOverride` with `id`, market, normalized title, canonical role, source occupation code, and creation time. Define `SalaryEstimateSnapshot` with immutable input IDs, exact nominal/adjusted ranges, display range, evidence summary, confidence conditions, assumptions, exclusions, and calculation time.

- [ ] **Step 4: Add Dexie version 2 and the repository**

Use `salaryObservations: "id, applicationId, market, canonicalRole, observedAt"`, `salaryEstimateSnapshots: "id, applicationId, calculatedAt"`, and `roleAliasOverrides: "id, [market+normalizedTitle]"`. Keep every version 1 table in the version 2 `stores` call. Do not mutate or delete the legacy `research` field during upgrade. Repository snapshot writes use `add`, not `put`, so an existing snapshot ID cannot be overwritten.

- [ ] **Step 5: Run focused and application regression tests**

Run: `npm.cmd test -- src/domain/research.test.ts src/features/research/researchRepository.test.ts src/db/applicationRepository.test.ts src/features/buddy/captureApplication.test.ts`

Expected: PASS, including opening a version 1 database and retaining applications.

- [ ] **Step 6: Commit**

```bash
git add src/domain src/db src/features/research src/features/buddy src/fixtures
git commit -m "feat: add salary research domain storage"
```

---

### Task 2: Implement deterministic role matching and benchmark resolution

**Files:**
- Create: `src/features/research/roleCatalog.ts`
- Create: `src/features/research/matchRole.ts`
- Create: `src/features/research/matchRole.test.ts`
- Create: `src/features/research/resolveBenchmark.ts`
- Create: `src/features/research/resolveBenchmark.test.ts`

**Interfaces:**
- Consumes: `Market`, `SalaryBenchmark`, and `RoleMatch` from Task 1.
- Produces: `matchRole(input: { title: string; market: Market; overrides?: RoleAliasOverride[]; overrideCode?: string }): RoleMatch`.
- Produces: `resolveBenchmark(input: { market: Market; roleMatch: RoleMatch; city?: string; state?: string; metroCode?: string; benchmarks: SalaryBenchmark[] }): { benchmark: SalaryBenchmark; fallback: "exact" | "state" | "national" } | { status: "insufficient_evidence" }`.

- [ ] **Step 1: Write failing matcher and U.S. fallback tests**

```ts
it.each([
  ["Backend Software Engineer", "software-engineer", "15-1252", "strong"],
  ["Site Reliability Engineer", "site-reliability-engineer", "15-1252", "moderate"],
  ["Cybersecurity Analyst", "cybersecurity-analyst", "15-1212", "strong"],
])("maps %s deterministically", (title, canonicalRole, usCode, strength) => {
  expect(matchRole({ title, market: "US" })).toMatchObject({ canonicalRole, sourceOccupationCode: usCode, strength });
});

it("falls back metro then state then national without crossing markets", () => {
  expect(resolveBenchmark({ market: "US", roleMatch, metroCode: "41860", state: "CA", benchmarks })).toMatchObject({ benchmark: { geographyLevel: "metro" }, fallback: "exact" });
  expect(resolveBenchmark({ market: "US", roleMatch, metroCode: "missing", state: "CA", benchmarks })).toMatchObject({ benchmark: { geographyLevel: "state" }, fallback: "state" });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm.cmd test -- src/features/research/matchRole.test.ts src/features/research/resolveBenchmark.test.ts`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement the catalogue and normalized-title matcher**

The catalogue contains only approved software/IT roles and explicit aliases. Normalize Unicode, lowercase, collapse whitespace, and remove punctuation; do not use fuzzy edit distance or an LLM. Store market-specific source codes for MOM, C&SD group, and BLS SOC. `matchRole` checks passed reusable aliases before the built-in catalogue, but never persists an alias itself.

- [ ] **Step 4: Implement market resolution**

Require currency-market consistency. For U.S. benchmarks, select `metroCode`, then state code, then `US`; for SG/HK accept only their national geography. When Hong Kong resolves only the broad `Managers, professionals and associate professionals` distribution, return match strength `limited`.

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- src/features/research/matchRole.test.ts src/features/research/resolveBenchmark.test.ts`

Expected: PASS for aliases, overrides, unknown roles, three U.S. levels, SG/HK separation, and broad Hong Kong matches.

- [ ] **Step 6: Commit**

```bash
git add src/features/research
git commit -m "feat: resolve salary roles and markets"
```

---

### Task 3: Implement inflation, evidence blending, confidence, and conservative rounding

**Files:**
- Create: `src/features/research/inflation.ts`
- Create: `src/features/research/inflation.test.ts`
- Create: `src/features/research/roundSalary.ts`
- Create: `src/features/research/roundSalary.test.ts`
- Create: `src/features/research/calculateEstimate.ts`
- Create: `src/features/research/calculateEstimate.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts and Task 2 resolved benchmark output.
- Produces: `adjustForInflation(input): InflationAdjustment | undefined`.
- Produces: `roundSalaryDown(amount, currency, period): number`.
- Produces: `calculateEstimate(input): SalaryEstimateSnapshot | { status: "insufficient_evidence"; reasons: string[] }`.

- [ ] **Step 1: Write failing inflation and rounding tests**

```ts
it("adjusts dated data with exact CPI periods but calls it purchasing power", () => {
  expect(adjustForInflation({ amount: 120_000, referencePeriod: "2025-05", calculatedAt: "2026-09-16T00:00:00Z", points: [
    cpi("2025-05", 320), cpi("2026-08", 331),
  ] })).toMatchObject({ amount: 124_125, latestPeriod: "2026-08", label: "Equivalent in 2026-08 prices" });
});

it.each([
  [5_299, "SGD", "monthly", 5_200],
  [34_999, "HKD", "monthly", 34_500],
  [166_480, "USD", "annual", 165_000],
])("floors %i %s %s", (amount, currency, period, expected) => {
  expect(roundSalaryDown(amount, currency, period)).toBe(expected);
});
```

- [ ] **Step 2: Write failing evidence-blending tests**

```ts
it("does not blend fewer than three eligible observations", () => {
  expect(calculateEstimate(input({ observations: [observation(120_000, 140_000), observation(125_000, 145_000)] }))).toMatchObject({ exactNominal: { minimum: 100_000, maximum: 150_000 } });
});

it("uses 20 percent at three observations and caps endpoint movement at 15 percent", () => {
  const result = calculateEstimate(input({ observations: [observation(200_000, 300_000), observation(210_000, 310_000), observation(220_000, 320_000)] }));
  expect(result).toMatchObject({ exactNominal: { minimum: 115_000, maximum: 172_500 }, evidence: { eligibleCount: 3, weight: 0.2 } });
});
```

- [ ] **Step 3: Verify failure**

Run: `npm.cmd test -- src/features/research/inflation.test.ts src/features/research/roundSalary.test.ts src/features/research/calculateEstimate.test.ts`

Expected: FAIL with missing functions.

- [ ] **Step 4: Implement pure calculation functions**

Use exact arithmetic until final display flooring. Observation eligibility is full weight through six months, half weight from seven through twelve months, and zero afterward. Three-to-five eligible observations contribute 20%; six or more contribute 30%. Calculate weighted medians, cap each endpoint to ±15% of its official endpoint, then widen moderate matches outward 15% or limited matches outward 25%.

The overall confidence rules are exact: strong requires exact role/geography and age ≤365 days; moderate covers one material fallback or age 366–730 days; limited covers limited roles, age 731–1,095 days, multiple fallbacks, or conflicting evidence. Older official data return insufficient evidence.

- [ ] **Step 5: Run focused tests and property-style invariants**

Add table tests proving `minimum <= maximum`, increasing an observation cannot decrease its weighted median, a single outlier cannot move an endpoint beyond 15%, and private `reusable: false` offers never enter the calculation.

Run: `npm.cmd test -- src/features/research/inflation.test.ts src/features/research/roundSalary.test.ts src/features/research/calculateEstimate.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/research
git commit -m "feat: calculate grounded salary estimates"
```

---

### Task 4: Build the official-data cache and adapter contract

**Files:**
- Create: `server/research/ResearchSource.ts`
- Create: `server/research/ResearchCache.ts`
- Create: `server/research/ResearchCache.test.ts`
- Create: `server/research/ResearchService.ts`
- Create: `server/research/ResearchService.test.ts`
- Create: `server/research/sourceManifest.ts`

**Interfaces:**
- Consumes: shared `SalaryBenchmark`, `CpiPoint`, and `Market` schemas.
- Produces: `ResearchSource.refresh(): Promise<ValidatedResearchRelease>`.
- Produces: `ResearchCache.stage`, `promote`, `active`, `quarantine`, and `status`.
- Produces: `ResearchService.refresh(market?)`, `status()`, and `lookup(query)`.

- [ ] **Step 1: Write failing cache tests**

```ts
it("promotes a valid staged release atomically and retains the old release after invalid refresh", async () => {
  await cache.promote(release("sg-2025"));
  await expect(cache.stage({ ...release("bad"), benchmarks: [invertedBenchmark] })).rejects.toThrow("invalid-research-release");
  expect((await cache.active("SG"))?.release.id).toBe("sg-2025");
  expect(await cache.status("SG")).toMatchObject({ activeReleaseId: "sg-2025", quarantineCount: 1 });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- server/research/ResearchCache.test.ts server/research/ResearchService.test.ts`

Expected: FAIL because the cache and service are missing.

- [ ] **Step 3: Implement bounded, atomic cache storage**

Store cache files below `%LOCALAPPDATA%/JobBuddy/research/<market>/`. Write to an exclusive temporary file, fsync, validate by parsing back through Zod, then rename to `active.json`. Limit each downloaded body to 25 MB, each normalized release to 100,000 benchmarks and 5,000 CPI points, and each source response to 30 seconds.

Use a fixed descriptive `User-Agent` and explicit `Accept` header, follow at most one redirect, and validate the final hostname before reading the body.

Compute SHA-256 over source bytes and normalized payload. A release with inverted percentiles, wrong currency, duplicate benchmark key, missing HTTPS source URL, or invalid period is quarantined as a diagnostic JSON file without the raw source body.

- [ ] **Step 4: Add the allowlisted source manifest**

```ts
export const sourceManifest = {
  SG: {
    wages: "https://stats.mom.gov.sg/iMAS_Tables1/Wages/Wages_2025/mrsd_2025Wages_table4.xlsx",
    cpi: "https://tablebuilder.singstat.gov.sg/api/table/tabledata/M213752",
  },
  HK: {
    wages: "https://www.censtatd.gov.hk/wbr/B1050014/B10500142025AN25/att/en/B10500142025AN25.pdf",
    cpi: "https://www.censtatd.gov.hk/wbr/B1060001/B10600012026MM07/att/en/B10600012026MM07.pdf",
  },
  US: {
    wages: "https://www.bls.gov/oes/special-requests/oesm25all.zip",
    cpi: "https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0",
  },
} as const;
```

Reject redirects or final URLs outside the expected government hostname.

- [ ] **Step 5: Run cache/service tests**

Run: `npm.cmd test -- server/research/ResearchCache.test.ts server/research/ResearchService.test.ts`

Expected: PASS for atomic promotion, quarantine, timeout, response-size limit, host allowlist, partial-market failure, and last-known-good lookup.

- [ ] **Step 6: Commit**

```bash
git add server/research
git commit -m "feat: add official salary data cache"
```

---

### Task 5: Implement the Singapore MOM and SingStat adapter

**Files:**
- Create: `server/research/parsers/excel.ts`
- Create: `server/research/parsers/excel.test.ts`
- Create: `server/research/adapters/SingaporeMomAdapter.ts`
- Create: `server/research/adapters/SingaporeMomAdapter.test.ts`
- Create: `server/research/fixtures/sg-mom-wages.json`
- Create: `server/research/fixtures/sg-singstat-cpi.json`

**Interfaces:**
- Consumes: `ResearchSource`, source manifest, and Task 1 schemas.
- Produces: `SingaporeMomAdapter.refresh(): Promise<ValidatedResearchRelease>`.

- [ ] **Step 1: Add dependencies and failing adapter tests**

Run: `npm.cmd install exceljs@4.4.0`

```ts
it("normalizes MOM full-time resident monthly P25/P50/P75 wages", async () => {
  const release = await adapter.refresh();
  expect(release.benchmarks).toContainEqual(expect.objectContaining({
    market: "SG", currency: "SGD", period: "monthly",
    percentile25: expect.any(Number), percentile50: expect.any(Number), percentile75: expect.any(Number),
    compensationScope: "gross_excluding_bonus",
  }));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- server/research/parsers/excel.test.ts server/research/adapters/SingaporeMomAdapter.test.ts`

Expected: FAIL with missing parser/adapter.

- [ ] **Step 3: Implement values-only workbook parsing and MOM normalization**

Reject encrypted workbooks, formulas, external links, more than 20 sheets, more than 100,000 rows, or more than 100 columns. Normalize only software/IT occupations present in `roleCatalog`; preserve occupation and industry labels. Treat MOM gross wage as excluding bonuses and retain that wording.

- [ ] **Step 4: Implement SingStat CPI parsing**

Accept only all-items CPI rows with `YYYY MM` or `YYYY` periods and finite positive index values. Preserve the CPI base label from the API metadata.

- [ ] **Step 5: Run tests**

Run: `npm.cmd test -- server/research/parsers/excel.test.ts server/research/adapters/SingaporeMomAdapter.test.ts`

Expected: PASS for valid fixtures, header movement, suppressed cells, formulas, wrong currency, and empty software-role results.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/research
git commit -m "feat: import Singapore salary benchmarks"
```

---

### Task 6: Implement the Hong Kong C&SD earnings and CPI adapter

**Files:**
- Create: `server/research/parsers/pdfText.ts`
- Create: `server/research/parsers/pdfText.test.ts`
- Create: `server/research/adapters/HongKongCsdAdapter.ts`
- Create: `server/research/adapters/HongKongCsdAdapter.test.ts`
- Create: `server/research/fixtures/hk-earnings-table-6-9.txt`
- Create: `server/research/fixtures/hk-composite-cpi.txt`

**Interfaces:**
- Consumes: `ResearchSource`, source manifest, and Task 1 schemas.
- Produces: `HongKongCsdAdapter.refresh(): Promise<ValidatedResearchRelease>`.

- [ ] **Step 1: Add the PDF dependency and failing tests**

Run: `npm.cmd install pdfjs-dist@5.4.296`

```ts
it("uses the full-time professional occupational distribution as a limited HK benchmark", async () => {
  const release = await adapter.refresh();
  expect(release.benchmarks).toContainEqual(expect.objectContaining({
    market: "HK", currency: "HKD", period: "monthly",
    percentile25: 22_400, percentile50: 33_000, percentile75: 47_500,
    matchCeiling: "limited",
  }));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- server/research/parsers/pdfText.test.ts server/research/adapters/HongKongCsdAdapter.test.ts`

Expected: FAIL with missing parser/adapter.

- [ ] **Step 3: Implement bounded PDF extraction**

Disable workers, JavaScript, external resources, forms, and attachments. Reject PDFs over 25 MB or 500 pages. Extract text only from the allowlisted C&SD hosts. The earnings parser locates `Table 6.9`, the `Managers, professionals and associate professionals` row, and the six full-time/all-employee percentile cells; it selects full-time values only.

- [ ] **Step 4: Implement Composite CPI parsing**

Locate the monthly Composite CPI table, preserve the official index base, and emit period/index pairs. Reject underlying CPI, CPI(A/B/C), or year-on-year percentage rows when an index level is required.

- [ ] **Step 5: Run tests**

Run: `npm.cmd test -- server/research/parsers/pdfText.test.ts server/research/adapters/HongKongCsdAdapter.test.ts`

Expected: PASS for page reordering, extra whitespace, missing Table 6.9, wrong CPI series, suppressed cells, and the limited-match flag.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/research
git commit -m "feat: import Hong Kong salary benchmarks"
```

---

### Task 7: Implement U.S. BLS OEWS and CPI-U adapters

**Files:**
- Create: `server/research/parsers/tabular.ts`
- Create: `server/research/parsers/tabular.test.ts`
- Create: `server/research/adapters/UnitedStatesBlsAdapter.ts`
- Create: `server/research/adapters/UnitedStatesBlsAdapter.test.ts`
- Create: `server/research/fixtures/us-oews.txt`
- Create: `server/research/fixtures/us-cpi.json`

**Interfaces:**
- Consumes: `ResearchSource`, source manifest, and Task 1 schemas.
- Produces: `UnitedStatesBlsAdapter.refresh(): Promise<ValidatedResearchRelease>`.

- [ ] **Step 1: Add ZIP support and failing tests**

Run: `npm.cmd install fflate@0.8.2`

```ts
it("normalizes software developer metro, state, and national annual percentiles", async () => {
  const release = await adapter.refresh();
  expect(release.benchmarks.filter(row => row.sourceOccupationCode === "15-1252").map(row => row.geographyLevel)).toEqual(expect.arrayContaining(["metro", "state", "national"]));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- server/research/parsers/tabular.test.ts server/research/adapters/UnitedStatesBlsAdapter.test.ts`

Expected: FAIL with missing parser/adapter.

- [ ] **Step 3: Implement bounded archive and OEWS parsing**

Reject encrypted ZIPs, path traversal, more than 20 entries, more than 100 MB uncompressed, or a compression ratio above 100:1. Parse BLS tab-delimited data for allowlisted software/IT SOC codes only. Use annual P25/P50/P75 fields, exclude rows containing `*` or `#` suppression markers, and preserve area/state codes.

- [ ] **Step 4: Implement CPI-U parsing**

Call the BLS public API for `CUUR0000SA0`, require successful status, keep not-seasonally-adjusted monthly index levels, and discard annual percent-change fields. Treat missing October 2025 as a missing period so `inflation.ts` selects the closest earlier published point and discloses it.

- [ ] **Step 5: Run tests**

Run: `npm.cmd test -- server/research/parsers/tabular.test.ts server/research/adapters/UnitedStatesBlsAdapter.test.ts`

Expected: PASS for ZIP limits, SOC filtering, metro/state/national normalization, suppressed estimates, CPI API errors, and missing periods.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/research
git commit -m "feat: import United States salary benchmarks"
```

---

### Task 8: Expose validated research APIs and React clients

**Files:**
- Modify: `server/start.ts`
- Modify: `server/http/createCompanionServer.ts`
- Modify: `server/http/createCompanionServer.test.ts`
- Create: `src/features/research/researchClient.ts`
- Create: `src/features/research/researchClient.test.ts`

**Interfaces:**
- Consumes: `ResearchService` from Task 4 and normalized releases from Tasks 5–7.
- Produces: `GET /api/research/status`, `POST /api/research/refresh`, and `POST /api/research/lookup` for dashboard origins only.
- Produces: `researchClient.status()`, `refresh(market?)`, and `lookup(query)`.

- [ ] **Step 1: Write failing HTTP and client tests**

```ts
it("rejects extension origins from dashboard research endpoints", async () => {
  const response = await fetch(`${base}/api/research/status`, { headers: { origin: extensionOrigin } });
  expect(response.status).toBe(403);
});

it("returns a validated lookup bundle without raw source bodies", async () => {
  const result = await researchClient.lookup({ market: "US", canonicalRole: "software-engineer", metroCode: "41860", state: "CA" });
  expect(result).toMatchObject({ benchmark: { geographyLevel: "metro" }, cpiPoints: expect.any(Array) });
  expect(JSON.stringify(result)).not.toContain("sourceBytes");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- server/http/createCompanionServer.test.ts src/features/research/researchClient.test.ts`

Expected: FAIL because research services and routes are absent.

- [ ] **Step 3: Implement server construction and dashboard-only routes**

Validate request bodies with Zod, preserve the existing 16 KB body limit, require an allowlisted dashboard origin for every research route, and return safe error codes: `research-unavailable`, `invalid-research-query`, `source-refresh-failed`, or `insufficient-evidence`. Do not include filesystem paths, raw source bodies, stack traces, or quarantined payloads.

- [ ] **Step 4: Implement the validating React client**

Parse every response through shared schemas. Map offline, unavailable, stale-cache, and validation failures to distinct client errors used by the UI.

- [ ] **Step 5: Run focused server/client tests**

Run: `npm.cmd test -- server/http/createCompanionServer.test.ts src/features/research/researchClient.test.ts server/research/ResearchService.test.ts`

Expected: PASS for allowed origin, denied extension origin, invalid body, offline cache, refresh failure, and valid lookup.

- [ ] **Step 6: Commit**

```bash
git add server src/features/research
git commit -m "feat: expose local salary research API"
```

---

### Task 9: Build the application salary-research workflow

**Files:**
- Create: `src/features/research/RoleMatchForm.tsx`
- Create: `src/features/research/RoleMatchForm.test.tsx`
- Create: `src/features/research/ObservationForm.tsx`
- Create: `src/features/research/ObservationForm.test.tsx`
- Create: `src/features/research/ResearchPanel.tsx`
- Create: `src/features/research/ResearchPanel.test.tsx`
- Create: `src/features/research/research.css`
- Modify: `src/features/application-detail/ApplicationDetailPage.tsx`
- Modify: `src/features/application-detail/ApplicationDetailPage.test.tsx`

**Interfaces:**
- Consumes: `researchClient`, `researchRepository`, `matchRole`, `resolveBenchmark`, and `calculateEstimate`.
- Produces: accessible `ResearchPanel({ application })` with refresh, role correction, manual evidence, snapshot history, and source disclosure.

- [ ] **Step 1: Write the failing primary journey test**

```tsx
it("researches a U.S. role, explains state fallback, and saves an immutable snapshot", async () => {
  render(<ResearchPanel application={usApplication} client={clientReturningStateFallback} />);
  await user.click(screen.getByRole("button", { name: "Research salary" }));
  expect(await screen.findByText("State benchmark used because metro data was unavailable.")).toBeVisible();
  expect(screen.getByText(/Equivalent in .* prices/)).toBeVisible();
  expect(screen.getByText("USD 120,000–165,000 / year")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Save research snapshot" }));
  expect(await researchRepository.listSnapshots(usApplication.id)).toHaveLength(1);
});
```

- [ ] **Step 2: Write failing evidence and error-state tests**

Cover a private offer defaulting to `reusable: false`, three confirmed posting observations changing the range, missing CPI showing nominal only, insufficient evidence showing no range, stale cache attribution, and refresh failure preserving the prior snapshot.

- [ ] **Step 3: Verify failure**

Run: `npm.cmd test -- src/features/research/RoleMatchForm.test.tsx src/features/research/ObservationForm.test.tsx src/features/research/ResearchPanel.test.tsx src/features/application-detail/ApplicationDetailPage.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement the forms and panel**

Use semantic fieldsets, labels, status regions, and error alerts. Require role confirmation before lookup. A correction applies only to the current application unless the user separately selects **Use this title mapping for future applications**, which calls `saveRoleAlias`. Present official benchmark, inflation-adjusted equivalent, local evidence, excluded evidence, confidence conditions, compensation exclusions, reference date, and safe source links as separate blocks. Keep exact values in the details disclosure and use rounded values in the primary result.

- [ ] **Step 5: Integrate application detail without breaking legacy records**

Render `ResearchPanel` for all applications. If only the old `Application.research.salary` exists, show it as `Legacy saved salary — source unavailable` until the user creates a source-backed snapshot. Do not migrate it into official evidence.

- [ ] **Step 6: Run focused UI tests and accessibility assertions**

Run: `npm.cmd test -- src/features/research src/features/application-detail/ApplicationDetailPage.test.tsx && npm.cmd run typecheck`

Expected: PASS with no unlabeled controls, no unsafe links, and no existing detail regression.

- [ ] **Step 7: Commit**

```bash
git add src/features/research src/features/application-detail
git commit -m "feat: add salary research workflow"
```

---

### Task 10: Add explicit browser salary-evidence confirmation

**Files:**
- Modify: `src/domain/buddy.ts`
- Modify: `src/domain/buddy.test.ts`
- Modify: `server/buddy/BuddyStore.ts`
- Modify: `server/buddy/BuddyStore.test.ts`
- Modify: `server/buddy/BuddyService.ts`
- Modify: `server/buddy/BuddyService.test.ts`
- Modify: `server/http/createCompanionServer.ts`
- Modify: `server/http/createCompanionServer.test.ts`
- Create: `extension/src/research/detectSalary.ts`
- Create: `extension/src/research/detectSalary.test.ts`
- Modify: `extension/src/content.ts`
- Modify: `extension/src/content.test.ts`
- Modify: `extension/src/ui/BuddyPanel.ts`
- Modify: `extension/src/ui/BuddyPanel.test.ts`
- Modify: `extension/src/companionClient.ts`
- Modify: `extension/src/companionClient.test.ts`
- Modify: `extension/src/service-worker.ts`
- Modify: `extension/src/service-worker.test.ts`

**Interfaces:**
- Produces: `PendingSalaryEvidence` schema and authenticated `queue-salary-evidence` extension message.
- Produces: dashboard `buddyClient.listSalaryEvidence()` and `deleteSalaryEvidence(id)` so `ResearchPanel` can import reviewed evidence into Dexie.
- Preserves: automatic autofill mode may detect but can never auto-send salary evidence.

- [ ] **Step 1: Write failing detector tests**

```ts
it.each([
  ["Salary: SGD 5,000 - 7,000 per month", { currency: "SGD", minimum: 5_000, maximum: 7_000, period: "monthly" }],
  ["HK$35,000–45,000 monthly", { currency: "HKD", minimum: 35_000, maximum: 45_000, period: "monthly" }],
  ["$120,000 to $165,000 a year", { currency: "USD", minimum: 120_000, maximum: 165_000, period: "annual" }],
])("detects %s", (text, expected) => expect(detectSalary(text, { market: expected.currency === "USD" ? "US" : expected.currency === "SGD" ? "SG" : "HK" })).toEqual(expect.objectContaining(expected)));

it("does not infer USD from an unqualified dollar sign outside a confirmed U.S. market", () => {
  expect(detectSalary("$5,000 per month", { market: "SG" })).toBeUndefined();
});
```

- [ ] **Step 2: Write failing confirmation/transport tests**

Prove the content runtime does not send on detection, automatic mode does not send, the panel allows correction, one explicit `Add salary evidence` click sends the corrected record, unsafe URLs are rejected, and duplicate evidence IDs are idempotent.

- [ ] **Step 3: Verify failure**

Run: `npm.cmd test -- extension/src/research/detectSalary.test.ts extension/src/content.test.ts extension/src/ui/BuddyPanel.test.ts extension/src/companionClient.test.ts extension/src/service-worker.test.ts server/buddy/BuddyStore.test.ts`

Expected: FAIL because salary-evidence behavior is absent.

- [ ] **Step 4: Implement bounded detection and editable panel state**

Scan at most 200,000 visible text characters plus `application/ld+json` salary fields. Require an explicit currency or a market-qualified symbol, two numeric bounds for automatic range detection, and an explicit monthly/annual period. Do not send page body, form answers, cookies, or recruiter messages.

- [ ] **Step 5: Implement paired local queue and dashboard import**

Add `/api/buddy/salary-evidence` GET/POST/DELETE with the same origin and bearer-token boundary as completed-application captures. Store at most 100 records, expire unimported records after 30 days, write atomically, and deduplicate by evidence ID plus normalized source URL.

- [ ] **Step 6: Run focused extension/server tests**

Run: `npm.cmd test -- extension/src src/domain/buddy.test.ts server/buddy server/http/createCompanionServer.test.ts`

Expected: PASS for approval and automatic modes, pairing failure, offline companion, invalid evidence, duplicates, expiration, and deletion after dashboard import.

- [ ] **Step 7: Commit**

```bash
git add src/domain src/features/research server/buddy server/http extension/src
git commit -m "feat: capture confirmed salary evidence"
```

---

### Task 11: Remove the vulnerable SheetJS dependency and harden source processing

**Files:**
- Create: `src/features/import-export/excelWorkbook.ts`
- Create: `src/features/import-export/excelWorkbook.test.ts`
- Modify: `src/features/import-export/parseTracker.ts`
- Modify: `src/features/import-export/parseTracker.test.ts`
- Modify: `src/features/import-export/workbookSafety.test.ts`
- Modify: `src/features/import-export/exportTracker.ts`
- Modify: `src/features/import-export/exportTracker.test.ts`
- Remove: `src/features/import-export/sheetjsLoading.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/verify-research-sources.mjs`
- Create: `scripts/verify-research-sources.test.ts`

**Interfaces:**
- Consumes: ExcelJS already introduced by Task 5.
- Produces: `readTrackerWorkbook(bytes)` and `writeTrackerWorkbook(rows)` without importing `xlsx`.
- Produces: `npm run verify:research-sources` release check.

- [ ] **Step 1: Rewrite existing XLSX tests against ExcelJS and add formula/macro/zip-bomb tests**

```ts
it("rejects a formula even when a cached value exists", async () => {
  const file = await workbookFile([{ address: "A1", value: { formula: "HYPERLINK(\"https://evil\")", result: "open" } }]);
  await expect(parseTracker(file)).rejects.toThrow(/formula/i);
});
```

- [ ] **Step 2: Verify the new tests fail before removing SheetJS**

Run: `npm.cmd test -- src/features/import-export`

Expected: FAIL because `excelWorkbook.ts` is missing and tests still reach SheetJS.

- [ ] **Step 3: Implement values-only ExcelJS import/export and remove `xlsx`**

Inspect XLSX ZIP entries with fflate before ExcelJS parsing. Reject `vbaProject.bin`, external links, formulas, encrypted packages, more than 5 MB compressed, more than 25 MB uncompressed, more than 20 sheets, more than 2,000 data rows, and more than 100 columns. Preserve current CSV behavior and workbook round-trip fields.

Run: `npm.cmd uninstall xlsx`

- [ ] **Step 4: Add release source-policy verification**

The script scans built web/extension JavaScript, `server/research/sourceManifest.ts`, and checked-in research fixtures. It fails on outbound HTTP(S) URLs or `fetch()` targets for Glassdoor, Levels.fyi, JobStreet, or JobsDB; non-HTTPS source URLs; missing government source attribution; secrets; or raw downloaded source bodies in `dist`. Plain user-entered source labels and documentation text are allowed. Add `verify:research-sources` to `package.json` and include it in `check` after the existing client-secret scan.

- [ ] **Step 5: Run import/export, audit, and source-policy checks**

Run: `npm.cmd test -- src/features/import-export scripts/verify-research-sources.test.ts && npm.cmd audit --audit-level=high && npm.cmd run verify:research-sources`

Expected: PASS and `npm audit` reports zero high or critical vulnerabilities.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/features/import-export scripts
git commit -m "security: harden workbook and research imports"
```

---

### Task 12: Verify three-market journeys and prepare `1.0.0-beta.1`

**Files:**
- Create: `e2e/salary-research.spec.ts`
- Create: `e2e-extension/salary-evidence.spec.ts`
- Modify: `README.md`
- Create: `SECURITY.md`
- Modify: `package.json`
- Modify: `extension/manifest.json`

**Interfaces:**
- Consumes: every prior task.
- Produces: a reproducible Windows-first public beta with source/legal documentation and complete release verification.

- [ ] **Step 1: Write the dashboard end-to-end journeys**

Mock only official-source HTTP responses; exercise real domain calculation and IndexedDB persistence. Cover:

```ts
test("researches SG, HK, and US applications without crossing markets", async ({ page }) => {
  await page.goto("/applications/sg-software");
  await research(page);
  await expect(page.getByText(/SGD .*\/ month/)).toBeVisible();
  await page.goto("/applications/hk-software");
  await research(page);
  await expect(page.getByText(/HKD .*Limited/)).toBeVisible();
  await page.goto("/applications/us-software");
  await research(page);
  await expect(page.getByText(/USD .*\/ year/)).toBeVisible();
});
```

Add separate tests for metro→state→national fallback, nominal plus CPI-adjusted display, source downtime with last-known-good data, missing CPI, and insufficient evidence.

- [ ] **Step 2: Write the built-extension salary confirmation journey**

Load an unpacked built extension against a fixture page. Verify detection alone sends nothing, the editable panel displays the range, one confirmation sends only the normalized salary metadata, and automatic autofill mode does not bypass confirmation.

- [ ] **Step 3: Run new end-to-end tests and fix only integration defects**

Run: `npm.cmd run test:e2e -- e2e/salary-research.spec.ts && npm.cmd run build:extension && npm.cmd run test:e2e:extension -- e2e-extension/salary-evidence.spec.ts`

Expected: PASS.

- [ ] **Step 4: Document setup, sources, limitations, and security**

README must explain Windows-first setup, `Refresh market data`, the three official source families, local-only observations, U.S. fallback, CPI meaning, downward rounding, lack of company-specific predictions, and the no-commercial-scraping boundary. SECURITY.md must document source-body limits, paired-extension trust boundary, safe reporting, and supported beta versions.

- [ ] **Step 5: Set the beta version and run the full release gate**

Set `package.json` version to `1.0.0-beta.1`. Set `extension/manifest.json` `version` to `1.0.0` and `version_name` to `1.0.0-beta.1`, because Chromium manifest versions accept numeric components only. Then run:

```powershell
npm.cmd run check
npm.cmd audit --audit-level=high
git diff --check
git status --short
```

Expected: all unit/component tests, typecheck, web build, extension build, secret scan, research-source scan, dashboard Playwright, and built-extension Playwright pass; audit has zero high/critical findings; only intended release files are modified.

- [ ] **Step 6: Commit the beta release preparation**

```bash
git add e2e e2e-extension README.md SECURITY.md package.json package-lock.json
git commit -m "release: prepare Job Buddy v1 beta"
```

- [ ] **Step 7: Request final code review before any GitHub push**

Run the `superpowers:requesting-code-review` workflow against the complete local branch. Address findings, rerun `npm.cmd run check`, and report the final commit hash. Do not push until the user explicitly asks.
