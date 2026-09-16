# Job Buddy v1 Salary Research Design

**Status:** Approved for implementation planning

**Date:** 2026-09-16

**Release target:** Public GitHub beta
**Debut markets:** Singapore, Hong Kong, and the United States

## Summary

Job Buddy v1 will replace untraceable salary guesses with a local-first, source-backed salary research workflow. It will combine official occupational wage data with salary bands that the user confirms from job postings or enters manually. Every estimate will show its market, source period, assumptions, evidence, freshness, and confidence. The app will not scrape or redistribute Glassdoor or other commercial salary/review datasets.

This slice extends the existing React, TypeScript, Dexie, local companion server, and browser-extension architecture. Salary research remains optional and must never block application tracking.

## Goals

- Provide useful salary ranges for software and IT roles in Singapore, Hong Kong, and the United States.
- Keep regions, currencies, pay periods, and compensation definitions explicit.
- Use official government data as the benchmark anchor.
- Supplement the benchmark with user-confirmed salary bands from job advertisements and manual observations.
- Explain every estimate well enough that a user can reproduce its logic.
- Adjust salary figures older than one year into current purchasing-power terms when official CPI data are available.
- Avoid false precision through conservative matching, capped evidence influence, and downward rounding.
- Fail safely when a source, role match, CPI series, or location match is unavailable.
- Keep captured research and observations on the user's device in v1.

## Non-goals

- Scraping Glassdoor, Levels.fyi, JobStreet, JobsDB, or another commercial site without explicit permission.
- Republishing commercial salary, company-rating, or review datasets.
- Predicting a specific employer's offer.
- Treating CPI adjustment as salary growth, market appreciation, or a wage forecast.
- Estimating bonus, commission, equity, pension, health insurance, or total compensation when the source does not provide it.
- Converting salary estimates between SGD, HKD, and USD for cross-market comparison.
- Using an AI model to invent role mappings, market multipliers, or missing salary data.
- Expanding beyond software and IT role families in this v1 slice.

## Source policy

### Permitted debut sources

| Market | Benchmark source | Geographic resolution | Inflation source |
| --- | --- | --- | --- |
| Singapore | Ministry of Manpower Occupational Wages tables | Singapore; occupation and industry where available | SingStat all-items CPI |
| Hong Kong | Census and Statistics Department labour and wage tables/API | Hong Kong; occupation and industry where available | C&SD Composite CPI |
| United States | Bureau of Labor Statistics Occupational Employment and Wage Statistics | Metropolitan/nonmetropolitan area, then state, then national | BLS CPI-U, U.S. city average, all items, not seasonally adjusted |

Official source entry points:

- Singapore MOM occupational wages: <https://stats.mom.gov.sg/Pages/Occupational-Wages-Tables2025.aspx>
- Singapore CPI: <https://tablebuilder.singstat.gov.sg/table/TS/M213752>
- Hong Kong labour and wages: <https://www.censtatd.gov.hk/en/scode30.html>
- Hong Kong CPI: <https://www.censtatd.gov.hk/en/scode270.html>
- U.S. BLS OEWS tables: <https://www.bls.gov/oes/tables.htm>
- U.S. BLS CPI-U calculator and series description: <https://www.bls.gov/data/inflation_calculator.htm>

Each adapter must preserve the source URL, dataset/release identifier, reference period, retrieval time, currency, pay period, compensation definition, and relevant geographic and occupational identifiers.

### Commercial-source boundary

The repository will contain no Glassdoor scraper and no copied Glassdoor salaries, ratings, or reviews. Glassdoor may be offered only as an outbound research link or as a label chosen by a user for a manual observation. The same rule applies to other commercial providers unless they later grant explicit API and redistribution rights. Provider approval would add a new adapter; it would not weaken the source policy.

### User-supplied evidence

The browser extension may detect a salary on a page the user is viewing, but it must show a confirmation step before saving. A confirmed observation stores only the fields needed for salary research: range, currency, pay period, role, location, source URL, observed date, and an optional short evidence excerpt. It does not crawl related pages or collect other users' data.

Manual observations support recruiter quotes, offers, and figures the user found during research. They remain local and visibly distinct from official benchmarks and job-posting evidence. Private offers are excluded from general market calculations unless the user explicitly marks them as reusable market evidence.

## Architecture

### 1. Official source adapters

Each market adapter converts its official input into the same normalized contract. Adapters own transport and source-specific parsing; they do not estimate salaries.

- `SingaporeMomSalaryAdapter` imports MOM occupational wage files.
- `HongKongCsdSalaryAdapter` imports C&SD API or download data.
- `UnitedStatesOewsSalaryAdapter` imports BLS OEWS releases.
- Separate CPI adapters provide dated index points for each market.

Adapters return validation errors rather than partial or guessed records. Network imports run only through the local companion service, keeping cross-origin behavior and parsing out of the React UI.

### 2. Canonical role catalogue

A deterministic catalogue maps normalized job-title aliases to canonical software/IT role families and official occupation codes. The original application title is always retained. A match contains the canonical role, matched source occupation, match strength, rule identifier, and whether the user approved or corrected it.

Match strengths are:

- **Strong:** exact or user-approved mapping.
- **Moderate:** adjacent role mapping within the same software/IT family.
- **Limited:** only a broad occupational family is available.

Users can correct a proposed match. That correction applies to the current application by default; promoting it to a reusable alias requires a separate explicit action.

### 3. Benchmark resolver

The resolver selects a normalized official benchmark without knowing how it was downloaded.

- Singapore and Hong Kong never borrow data from each other or another market.
- Hong Kong's Annual Earnings and Hours Survey publishes 25th, 50th, and 75th percentile monthly wages for broad occupational groups. When no defensible detailed software occupation is available, the resolver uses the relevant broad full-time occupational group, labels the role match `Limited`, and exposes the breadth of that source instead of presenting it as a software-specific range.
- The United States uses metropolitan/nonmetropolitan data when the job city can be resolved, then state data, then national data.
- A remote U.S. job uses its stated pay geography. If none is present, the user selects a target state; the app does not assume California, New York, or another high-cost market.
- Industry-specific data are used only when the official source supports the same occupation and geography at an appropriate quality level. Otherwise the cross-industry occupation benchmark is used and labelled.
- If no defensible occupation or location match exists, the resolver returns `insufficient_evidence`.

### 4. Observation repository

Confirmed posting evidence and manual observations are stored independently of official benchmarks. Eligible observations must have an explicit market, currency, period, lower bound, role family, observation date, and provenance type.

For calculation purposes:

- An observation must match the benchmark market and canonical role family.
- Pay periods are normalized without currency conversion.
- Observations no more than six months old receive full recency weight.
- Observations seven to twelve months old receive half recency weight.
- Observations older than twelve months remain in history but do not influence an estimate.
- At least three eligible observations are required before observations may change the official range.

### 5. Estimation engine

The official 25th and 75th percentiles form the preferred baseline range. If a source exposes different percentiles, its adapter records that fact and the UI labels the actual bounds; the engine does not silently rename them.

When at least three eligible observations exist, the engine computes the recency-weighted median lower and upper observation bounds. Observation influence is deliberately capped:

- Three to five eligible observations: 20% observation weight and 80% official weight.
- Six or more eligible observations: 30% observation weight and 70% official weight.
- Each blended endpoint is capped to a maximum 15% movement from the corresponding official endpoint.

If an observation provides only one salary value, it contributes to the displayed evidence list but not to range blending. If an upper bound is missing, it cannot be manufactured.

Role extrapolation changes uncertainty, not hidden salary multipliers:

- Strong matches use the resolved official range.
- Moderate matches widen the final range outward by 15% before conservative rounding.
- Limited matches widen it outward by 25% and force an overall `Limited` confidence label.

The engine does not apply an assumed junior or graduate discount. If the source does not distinguish experience, the output says `Market-wide benchmark`. An entry-level label is used only when the underlying benchmark or observation explicitly describes graduate, junior, or zero-to-two-years experience.

### 6. Inflation service

An estimate is considered dated when its official benchmark reference date is more than 365 days before the calculation date. When dated data have compatible official CPI points, the service calculates:

`adjusted amount = nominal amount * latest available CPI / CPI at the benchmark reference period`

Rules:

- Use the exact reference month when available.
- If only a reference year is known, use the official annual-average CPI.
- If the required month is missing, use the closest earlier published index and disclose that substitution.
- Never interpolate a missing CPI value.
- Keep the nominal source range alongside the adjusted result.
- Label the result `Equivalent in <latest CPI period> prices`.
- Do not increase confidence because an inflation adjustment exists.
- Do not use a benchmark more than three years old as the primary estimate, even if CPI data exist.

The United States uses national CPI-U even when the wage benchmark is metropolitan. The UI discloses this because BLS recommends the national index for general escalation and local CPI coverage is inconsistent.

### 7. Conservative display rounding

Exact normalized and calculated values are retained internally for provenance and repeatability. Only the displayed estimate is floored:

- SGD monthly: nearest SGD 100.
- HKD monthly: nearest HKD 500.
- USD annual: nearest USD 5,000.
- Any other monthly presentation: nearest 100 currency units.
- Any other annual presentation: nearest 5,000 currency units.

Both lower and upper endpoints round downward. For example, USD 124,320–166,480 displays as USD 120,000–165,000. Published source records remain inspectable at their original precision.

## Data model

The existing `Application.market` expands from `SG | HK` to `SG | HK | US`. U.S. locations add state and optional metropolitan-area identifiers without weakening the existing city/country fields.

New persisted entities are separated by responsibility:

- `SalaryDatasetRelease`: source, market, release/reference period, retrieval time, validation state, and checksum.
- `SalaryBenchmark`: release, canonical occupation/code, geography, industry when available, currency, period, percentile bounds, and compensation definition.
- `CpiPoint`: source, market, period, index value, base metadata, and retrieval time.
- `RoleMatch`: application title, canonical role, official occupation code, strength, rule ID, and user override state.
- `SalaryObservation`: application, provenance, range, currency, period, role, geography, observed date, source URL, privacy/reuse state, and validation state.
- `SalaryEstimateSnapshot`: application, input release IDs, role match, geography fallback, nominal range, adjusted range when applicable, rounding rule, evidence IDs, confidence, assumptions, exclusions, and calculation time.

Snapshots are immutable audit records. Refreshing research creates a new snapshot and preserves the previous snapshot for explanation and rollback. Large official datasets are cached by release and are not duplicated per application.

## User experience

### Application salary panel

The existing application-detail `Salary & company` section becomes a source-backed salary panel. Selecting **Research salary**:

1. Prefills the application title, market, location, industry, and detected experience label.
2. Shows the proposed canonical role and lets the user correct it.
3. Resolves the best official benchmark and shows any U.S. location fallback.
4. Shows the published nominal band.
5. Shows an inflation-adjusted band when the benchmark is more than one year old and CPI data are available.
6. Shows eligible and excluded local observations separately.
7. Calculates a rounded estimate with confidence, assumptions, exclusions, source links, and evidence count.
8. Saves an immutable research snapshot to the application.

The primary result must include market, currency, pay period, role match, geographic level, source reference date, compensation definition, confidence, and whether it is market-wide or entry-level evidence.

### Extension capture

When an application page contains a possible salary, the buddy panel offers **Add salary evidence**. Before saving, the user confirms or corrects:

- lower and upper bounds;
- currency and pay period;
- role and market/location;
- source URL and observation date;
- whether a private offer may influence general market estimates.

No evidence is saved silently. A completed application capture may trigger the confirmation prompt, but it cannot auto-approve salary evidence in either buddy automation mode.

### Manual evidence

Users can add a recruiter quote, offer, or external research observation from the application panel. The entry form requires provenance and compensation scope. A source label such as `Glassdoor` is permitted as user-entered metadata, but the app does not fetch or reproduce the underlying commercial page.

### Freshness and refresh

**Refresh market data** asks the local service to download and validate the latest official releases. Dashboard views use the validated local cache and never wait on live government endpoints. The UI shows the active release and cache age.

## Confidence presentation

The app shows `Strong`, `Moderate`, or `Limited` rather than an opaque numeric score.

- **Strong:** strong role match, exact available geography, benchmark no more than one year old, and no material fallback.
- **Moderate:** one material limitation, such as a moderate role match, state/national U.S. fallback, a benchmark between one and two years old that requires inflation adjustment, or sparse observations.
- **Limited:** limited role match, benchmark between two and three years old, multiple material fallbacks, or conflicting evidence.

The details view lists the contributing conditions. `Insufficient evidence` is a separate terminal state and never displays a calculated range.

## Failure handling and cache safety

- Official imports are parsed into a staging area.
- A release must pass schema, required-field, date, currency, geography, occupation, duplicate, non-negative value, and percentile-order validation.
- A validated release is promoted atomically to the active local cache.
- A malformed or incompatible release is quarantined with a diagnostic summary; it cannot replace the last-known-good release.
- Source downtime uses the last-known-good release and displays its age.
- CPI failure shows the nominal benchmark only.
- Role or geography resolution failure returns `insufficient_evidence` and offers manual correction.
- Invalid observations remain editable but do not influence an estimate.
- Refreshing one market cannot invalidate another market's cache.
- Salary research failures never prevent application creation, stage updates, email scanning, export, or autofill.

## Privacy and security

- Salary observations, recruiter quotes, offers, cached datasets, and estimate snapshots remain local in v1.
- The extension sends a salary candidate only to the paired local companion service and only after user confirmation.
- Source URLs must be valid HTTP(S) URLs; rendered outbound links use safe external-link handling.
- Imported spreadsheets and API payloads are treated as untrusted input and validated before persistence.
- No spreadsheet formulas from source files are executed.
- Logs omit evidence excerpts, recruiter messages, offers, and candidate profile values.
- No commercial-site credentials or API secrets are requested for this feature.

## Testing strategy

### Unit and contract tests

- Adapter fixtures for current-format Singapore MOM, Hong Kong C&SD, and U.S. BLS OEWS/CPI inputs.
- Market and currency separation.
- Role aliases, ambiguous matches, and user overrides.
- U.S. metro to state to national fallback.
- Percentile and compensation-definition preservation.
- Observation eligibility, recency weighting, minimum count, blend weights, and 15% movement cap.
- Inflation threshold, CPI period selection, missing periods, annual-average fallback, and three-year cutoff.
- Currency/pay-period normalization without cross-currency conversion.
- Conservative downward rounding for all debut-market display conventions.
- Confidence labels and `insufficient_evidence` behavior.
- Staged import validation and atomic last-known-good promotion.

### Component and integration tests

- Research flow from an existing application.
- Role correction and recalculation.
- Nominal versus inflation-adjusted presentation.
- Source, date, evidence, fallback, assumptions, and exclusions visibility.
- Manual observation entry and private-offer exclusion.
- Source downtime, malformed refresh, missing CPI, and stale-cache states.
- Keyboard navigation, labels, status announcements, contrast, and responsive layout.

### Browser-extension tests

- Detect salary text on supported and generic job pages.
- Require confirmation before local persistence.
- Correct currency and period mistakes before saving.
- Confirm that neither approval nor automatic fill mode auto-approves salary evidence.
- Reject unsafe URLs and malformed ranges.

### End-to-end and release checks

- Complete Singapore, Hong Kong, and U.S. salary-research journeys.
- Verify U.S. metro, state, and national fallback examples.
- Verify a stale benchmark with and without CPI data.
- Verify that research failure leaves the core tracker functional.
- Run the repository's unit, typecheck, web build, extension build, secret/artifact scan, dashboard Playwright, and built-extension Playwright gates.

## Acceptance criteria

The salary slice is ready for the public beta when:

1. A user can research a software/IT application in each debut market from the application-detail page.
2. Every displayed range identifies its market, currency, pay period, source, reference date, role match, geography, and compensation scope.
3. U.S. resolution demonstrably follows metropolitan/nonmetropolitan, state, then national order.
4. Observations cannot influence an estimate until three eligible records exist and can never move an official endpoint by more than 15%.
5. Benchmarks older than one year show both nominal and grounded CPI-adjusted values when possible.
6. CPI-adjusted values are explicitly described as purchasing-power equivalents, not wage forecasts.
7. Displayed estimates use the approved downward rounding conventions while retaining exact audit values.
8. No missing source, match, or CPI value results in fabricated data.
9. Commercial data are neither scraped nor bundled.
10. All data remain local, all salary captures require confirmation, and all existing release checks pass.
