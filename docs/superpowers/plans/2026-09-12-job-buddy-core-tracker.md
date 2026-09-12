# Job Buddy Core Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local-first Job Buddy shell, application lifecycle, IndexedDB persistence, Apple-inspired Command Center, Excel-replacement table, application detail history, and Excel/CSV import/export.

**Architecture:** A single React and TypeScript application owns a small domain layer and stores data in IndexedDB through Dexie. Feature folders consume typed repositories and selectors; no cloud service or account is required. Integration-specific features are deferred to later plans but their persisted records and adapter boundaries are established here.

**Tech Stack:** Node.js 22+, npm, React, TypeScript, Vite, React Router, Dexie, `dexie-react-hooks`, Zod, TanStack Table, SheetJS (`xlsx`), Vitest, Testing Library, Playwright, and plain CSS design tokens.

**Spec:** `docs/superpowers/specs/2026-09-12-job-buddy-design.md`

## Global Constraints

- Version 1 is local-only, single-user, and usable without credentials.
- Launch markets are Singapore and Hong Kong.
- Role scope is finance, software engineering, data, cybersecurity, cloud, and general IT.
- Standard columns plus flexible tags replace arbitrary custom columns.
- Active stages progress from light to vivid green; rejected applications use a constant red rail.
- Neutral role rows, crisp separators, colour-independent labels, and WCAG AA text contrast are mandatory.
- Raw API keys, email bodies, user profiles, imported trackers, and local databases must never be committed.
- Prefer one application and focused feature modules; do not create a monorepo before a second deployed surface exists.

---

## File map

- `package.json` — scripts and pinned dependency ranges.
- `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` — build and test configuration.
- `src/app/App.tsx`, `src/app/routes.tsx` — application shell and routes.
- `src/styles/tokens.css`, `src/styles/global.css` — Apple-inspired tokens and shared layout rules.
- `src/domain/application.ts` — application, stage, outcome, deadline, research, profile, and event types.
- `src/domain/stage.ts` — lifecycle derivation and undo rules.
- `src/domain/filters.ts` — filter definitions and pure filter predicate.
- `src/domain/import.ts` — normalized import preview types.
- `src/db/database.ts` — Dexie schema and migrations.
- `src/db/applicationRepository.ts` — typed application and event persistence.
- `src/db/viewRepository.ts` — saved filter views.
- `src/fixtures/sampleApplications.ts` — deterministic SG/HK demo records covering every stage.
- `src/features/command-center/` — stage overview and urgent application list.
- `src/features/applications/` — filter bar, table, bulk actions, and saved views.
- `src/features/application-detail/` — application detail, stage history, and undo.
- `src/features/import-export/` — preview, mapping, deduplication, import, and export.
- `src/components/` — accessible buttons, fields, progress rail, shell, and empty state.
- `src/test/` and `e2e/` — shared test setup and browser journeys.

---

### Task 1: Establish the executable project and quality gates

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/test/setup.ts`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `App(): JSX.Element`, npm scripts `dev`, `build`, `test`, `test:watch`, `test:e2e`, and `typecheck`.
- Consumes: none.

- [ ] **Step 1: Create the package manifest and install the exact app dependencies**

Use this script set and dependency boundary in `package.json`:

```json
{
  "name": "job-buddy",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

Run:

```bash
npm install react react-dom react-router-dom dexie dexie-react-hooks zod @tanstack/react-table xlsx
npm install -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @playwright/test
```

Expected: `package-lock.json` is created and `npm audit` prints no unreviewed critical vulnerability.

- [ ] **Step 2: Write the failing shell test**

```tsx
// src/app/App.test.tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the Job Buddy command center", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /application journey/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the shell test and verify failure**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because `App` does not exist.

- [ ] **Step 4: Implement the minimal shell and test configuration**

```tsx
// src/app/App.tsx
export function App() {
  return <main><h1>Your application journey</h1></main>;
}
```

Configure Vitest with `environment: "jsdom"` and `setupFiles: ["./src/test/setup.ts"]`; import `@testing-library/jest-dom/vitest` from the setup file. Add a system-font stack, neutral backgrounds, focus ring, spacing scale, success ramp, and error token to `tokens.css`.

- [ ] **Step 5: Verify the project shell**

Run: `npm test -- src/app/App.test.tsx && npm run typecheck && npm run build`

Expected: one passing test, no TypeScript errors, and a successful Vite build.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json package-lock.json index.html tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts src .gitignore
git commit -m "chore: establish Job Buddy web app"
```

---

### Task 2: Define the application lifecycle and deterministic sample data

**Files:**
- Create: `src/domain/application.ts`
- Create: `src/domain/stage.ts`
- Create: `src/domain/stage.test.ts`
- Create: `src/fixtures/sampleApplications.ts`
- Create: `src/fixtures/sampleApplications.test.ts`

**Interfaces:**
- Produces: `Application`, `StageEvent`, `Deadline`, `ResearchSnapshot`, `ApplicationStage`, `ApplicationOutcome`, `deriveApplicationState(events)`, `canAutoApply(event)`, and `sampleApplications`.
- Consumes: none.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
import { deriveApplicationState } from "./stage";

it("derives the latest accepted stage without losing history", () => {
  const state = deriveApplicationState([
    { id: "e1", applicationId: "a1", at: "2026-09-01T08:00:00Z", toStage: "applied", origin: "manual", accepted: true },
    { id: "e2", applicationId: "a1", at: "2026-09-05T08:00:00Z", fromStage: "applied", toStage: "interview", origin: "gmail", accepted: true }
  ]);
  expect(state).toMatchObject({ stage: "interview", outcome: null });
});

it("keeps rejection terminal and records the stage where it occurred", () => {
  const state = deriveApplicationState([
    { id: "e1", applicationId: "a1", at: "2026-09-01T08:00:00Z", toStage: "assessment", origin: "manual", accepted: true },
    { id: "e2", applicationId: "a1", at: "2026-09-06T08:00:00Z", fromStage: "assessment", outcome: "rejected", origin: "gmail", accepted: true }
  ]);
  expect(state).toMatchObject({ stage: "assessment", outcome: "rejected" });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/domain/stage.test.ts`

Expected: FAIL because lifecycle types and derivation are missing.

- [ ] **Step 3: Implement exact domain unions and derivation**

```ts
export const applicationStages = ["applied", "review", "assessment", "interview", "final", "offer"] as const;
export type ApplicationStage = (typeof applicationStages)[number];
export type ApplicationOutcome = "rejected" | "withdrawn" | "expired" | "offer_declined" | "offer_accepted" | "hired";
export type EventOrigin = "manual" | "import" | "buddy" | "gmail" | "system";

export interface StageEvent {
  id: string;
  applicationId: string;
  at: string;
  fromStage?: ApplicationStage;
  toStage?: ApplicationStage;
  outcome?: ApplicationOutcome;
  origin: EventOrigin;
  accepted: boolean;
  evidenceId?: string;
  confidence?: number;
  note?: string;
}
```

Sort accepted events by timestamp and identifier, apply stage changes in order, and preserve the last stage when a terminal outcome arrives. `canAutoApply` must return false for any terminal outcome, manual-override conflict, or confidence below `0.9`.

- [ ] **Step 4: Add SG/HK fixtures covering every state**

Create at least eight applications covering all six stages, rejection, and withdrawal. Include finance and software/IT roles, both currencies, interview subtypes, deadlines, tags, source, salary snapshot, and company-rating snapshot. Use fictional companies and deterministic ISO timestamps.

- [ ] **Step 5: Verify domain and fixture coverage**

Run: `npm test -- src/domain/stage.test.ts src/fixtures/sampleApplications.test.ts`

Expected: PASS; the fixture test confirms every active stage plus `rejected` is represented.

- [ ] **Step 6: Commit the domain**

```bash
git add src/domain src/fixtures
git commit -m "feat: define application lifecycle"
```

---

### Task 3: Persist applications, immutable events, saved views, and demo seeding

**Files:**
- Create: `src/db/database.ts`
- Create: `src/db/applicationRepository.ts`
- Create: `src/db/applicationRepository.test.ts`
- Create: `src/db/viewRepository.ts`
- Create: `src/db/seed.ts`

**Interfaces:**
- Consumes: `Application`, `StageEvent`, and `sampleApplications` from Task 2.
- Produces: `jobBuddyDb`, `applicationRepository.list()`, `get(id)`, `create(input)`, `update(id, patch)`, `appendEvent(event)`, `undoEvent(eventId)`, `seedDemoData()`, and `savedViewRepository`.

- [ ] **Step 1: Write the failing repository test**

```ts
it("writes an event and derives the application state transactionally", async () => {
  await applicationRepository.create(sampleApplications[0]);
  await applicationRepository.appendEvent({
    id: "event-offer", applicationId: sampleApplications[0].id,
    at: "2026-09-12T08:00:00Z", fromStage: "final", toStage: "offer",
    origin: "manual", accepted: true
  });
  expect((await applicationRepository.get(sampleApplications[0].id))?.stage).toBe("offer");
});
```

- [ ] **Step 2: Run the repository test and verify failure**

Run: `npm test -- src/db/applicationRepository.test.ts`

Expected: FAIL because the database and repository are missing.

- [ ] **Step 3: Implement schema version 1**

Define Dexie tables for `applications`, `stageEvents`, `deadlines`, `researchSnapshots`, `savedViews`, `updateProposals`, `processedMessages`, `prepSessions`, `profileFields`, and `activityEntries`. Index application stage, outcome, market, role family, updated time, event application identifier, and proposal state.

Use one Dexie transaction when appending an event and updating the materialized application stage/outcome. Undo marks the selected event unaccepted and re-derives state from remaining accepted events; it never deletes history.

- [ ] **Step 4: Implement idempotent demo seeding**

`seedDemoData()` checks a metadata key before inserting fixtures and can be called on every startup. It must never overwrite non-demo records.

- [ ] **Step 5: Verify persistence and migration safety**

Run: `npm test -- src/db/applicationRepository.test.ts`

Expected: PASS for create, event append, undo, and repeated demo seeding.

- [ ] **Step 6: Commit persistence**

```bash
git add src/db
git commit -m "feat: add local application persistence"
```

---

### Task 4: Build the shared shell and stage progress component

**Files:**
- Create: `src/app/routes.tsx`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/StageRail.tsx`
- Create: `src/components/StageRail.test.tsx`
- Create: `src/components/Button.tsx`
- Create: `src/components/EmptyState.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `ApplicationStage` and `ApplicationOutcome`.
- Produces: `StageRail({ stage, outcome, rejectedAtStage, compact })` and a responsive `AppShell` with routes for `/`, `/applications`, `/applications/:id`, `/updates`, `/prepare`, `/profile`, and `/settings`.

- [ ] **Step 1: Write failing progress-rail tests**

```tsx
it("labels the current stage and completed stages", () => {
  render(<StageRail stage="interview" outcome={null} />);
  expect(screen.getByText("Interview")).toHaveAttribute("aria-current", "step");
});

it("renders every segment as rejected without erasing the rejection point", () => {
  render(<StageRail stage="assessment" outcome="rejected" rejectedAtStage="assessment" />);
  expect(screen.getByRole("group", { name: /rejected during assessment/i })).toHaveAttribute("data-outcome", "rejected");
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/components/StageRail.test.tsx`

Expected: FAIL because `StageRail` is missing.

- [ ] **Step 3: Implement the rail and shell**

Render an ordered list of six named stages. Use CSS custom properties `--stage-1` through `--stage-6` for the green ramp and `--outcome-rejected` for every rejected segment. Keep the labels in the accessibility tree and add `aria-current="step"` to the current active stage.

Use system typography, neutral surfaces, crisp one-pixel separators, 12–24px radii by hierarchy, 150–250ms state transitions, visible focus, and reduced-motion overrides. Do not tint entire active application rows.

- [ ] **Step 4: Verify accessibility and responsive shell behavior**

Run: `npm test -- src/components/StageRail.test.tsx && npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the UI foundation**

```bash
git add src/app src/components src/styles
git commit -m "feat: add Job Buddy application shell"
```

---

### Task 5: Implement the Command Center selectors and screen

**Files:**
- Create: `src/features/command-center/commandCenterSelectors.ts`
- Create: `src/features/command-center/commandCenterSelectors.test.ts`
- Create: `src/features/command-center/CommandCenterPage.tsx`
- Create: `src/features/command-center/CommandCenterPage.test.tsx`
- Create: `src/features/command-center/command-center.css`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: `Application[]`, `Deadline[]`, `StageRail`, and `applicationRepository.list()`.
- Produces: `summarizeStages(applications)`, `rankNextActions(applications, deadlines, now)`, and `CommandCenterPage`.

- [ ] **Step 1: Write failing selector tests**

```ts
it("counts active applications by stage and excludes terminal outcomes", () => {
  expect(summarizeStages(sampleApplications).offer).toBe(1);
  expect(Object.values(summarizeStages(sampleApplications)).reduce((a, b) => a + b, 0))
    .toBe(sampleApplications.filter(a => !a.outcome).length);
});

it("ranks overdue and near-term deadlines before passive applications", () => {
  const ranked = rankNextActions(apps, deadlines, new Date("2026-09-12T00:00:00Z"));
  expect(ranked[0].reason).toMatch(/overdue|today|tomorrow/i);
});
```

- [ ] **Step 2: Verify selector failure**

Run: `npm test -- src/features/command-center/commandCenterSelectors.test.ts`

Expected: FAIL because the selectors are missing.

- [ ] **Step 3: Implement selectors and render the approved visual hierarchy**

The screen order is title/actions, six-stage portfolio overview, applications requiring attention, and compact Buddy prompt. Each neutral application row shows identity, region-specific salary/rating snapshot, labelled `StageRail`, evidence origin, and next action. Rejected rows use a light neutral/error surface and constant red rail.

- [ ] **Step 4: Add loading and empty states**

Loading uses stable skeleton rows. Empty state offers `Import tracker`, `Add application`, and `Load sample data`; it never displays a blank dashboard.

- [ ] **Step 5: Verify Command Center behavior**

Run: `npm test -- src/features/command-center && npm run typecheck`

Expected: PASS for counts, priority ordering, empty state, source label, and rejected styling semantics.

- [ ] **Step 6: Commit the Command Center**

```bash
git add src/features/command-center src/app/routes.tsx
git commit -m "feat: build application command center"
```

---

### Task 6: Build the Excel-replacement table, filters, tags, and saved views

**Files:**
- Create: `src/domain/filters.ts`
- Create: `src/domain/filters.test.ts`
- Create: `src/features/applications/ApplicationFilters.tsx`
- Create: `src/features/applications/ApplicationTable.tsx`
- Create: `src/features/applications/ApplicationsPage.tsx`
- Create: `src/features/applications/ApplicationsPage.test.tsx`
- Create: `src/features/applications/applications.css`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: `Application[]`, `savedViewRepository`, `StageRail`, and TanStack Table.
- Produces: `ApplicationFilterState`, `matchesApplicationFilters(application, filters)`, inline editing, bulk update callbacks, and saved views.

- [ ] **Step 1: Write failing pure filter tests**

```ts
const filters = { markets: ["SG"], roleFamilies: ["software"], stages: ["interview"], tags: ["priority"] };
expect(matchesApplicationFilters(sgSoftwareInterview, filters)).toBe(true);
expect(matchesApplicationFilters(hkFinanceInterview, filters)).toBe(false);
```

Cover search, outcome, industry, role family, market, work arrangement, company, source, date range, deadline, salary/currency, priority, tags, unread update, missing data, and follow-up due.

- [ ] **Step 2: Verify filter tests fail**

Run: `npm test -- src/domain/filters.test.ts`

Expected: FAIL because the predicate is missing.

- [ ] **Step 3: Implement filters and table columns**

Use standard columns for role, company, industry, role family, market, location, work arrangement, stage, outcome, applied date, last activity, next action, deadline, source, salary, company rating, priority, and tags. Support column visibility, sort, search, inline stage/priority/tags editing, row selection, and bulk stage/priority/tag/archive actions.

- [ ] **Step 4: Implement saved views**

Persist a name, filters, sort, and visible-column identifiers. Seed Active Interviews, Singapore Software, Hong Kong Finance, Follow Up, and Rejected without overwriting user-created views.

- [ ] **Step 5: Verify the spreadsheet replacement flow**

Run: `npm test -- src/domain/filters.test.ts src/features/applications/ApplicationsPage.test.tsx`

Expected: PASS for composed filters, keyboard-accessible inline edit, bulk selection, and saved-view restoration.

- [ ] **Step 6: Commit the Applications workspace**

```bash
git add src/domain/filters* src/features/applications src/app/routes.tsx
git commit -m "feat: add filterable applications workspace"
```

---

### Task 7: Add application detail, history, manual updates, and undo

**Files:**
- Create: `src/features/application-detail/ApplicationDetailPage.tsx`
- Create: `src/features/application-detail/ApplicationDetailPage.test.tsx`
- Create: `src/features/application-detail/StageHistory.tsx`
- Create: `src/features/application-detail/ManualStageUpdate.tsx`
- Create: `src/features/application-detail/application-detail.css`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: `applicationRepository.get`, `appendEvent`, `undoEvent`, `Application`, and `StageEvent`.
- Produces: detail route `/applications/:id`, validated manual update form, chronological history, and undo action.

- [ ] **Step 1: Write the failing manual-update test**

```tsx
it("records a manual stage event and exposes undo", async () => {
  render(<ApplicationDetailPage applicationId="a1" />);
  await user.selectOptions(screen.getByLabelText(/new stage/i), "interview");
  await user.click(screen.getByRole("button", { name: /update stage/i }));
  expect(await screen.findByText(/changed to interview/i)).toBeVisible();
  expect(screen.getByRole("button", { name: /undo change/i })).toBeEnabled();
});
```

- [ ] **Step 2: Verify the detail test fails**

Run: `npm test -- src/features/application-detail/ApplicationDetailPage.test.tsx`

Expected: FAIL because the detail route and form are missing.

- [ ] **Step 3: Implement detail sections and manual history**

Render overview, job description, contacts, deadlines/interviews, salary/company snapshots, notes/documents, evidence, preparation, and activity. Use progressive disclosure for long content. Stage updates append events; terminal outcomes display a second explicit confirmation. Undo never removes the event record.

- [ ] **Step 4: Verify update, rejection, and undo paths**

Run: `npm test -- src/features/application-detail`

Expected: PASS; rejection retains the prior stage, full rail turns red, and undo restores the derived prior state.

- [ ] **Step 5: Commit application detail**

```bash
git add src/features/application-detail src/app/routes.tsx
git commit -m "feat: add application history and manual updates"
```

---

### Task 8: Implement reviewed Excel/CSV import and export

**Files:**
- Create: `src/domain/import.ts`
- Create: `src/features/import-export/parseTracker.ts`
- Create: `src/features/import-export/parseTracker.test.ts`
- Create: `src/features/import-export/ImportTrackerPage.tsx`
- Create: `src/features/import-export/ImportTrackerPage.test.tsx`
- Create: `src/features/import-export/exportTracker.ts`
- Create: `src/features/import-export/exportTracker.test.ts`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: `Application`, Zod schemas, SheetJS, and `applicationRepository.create`.
- Produces: `parseTracker(file): Promise<ImportPreview>`, `confirmImport(preview)`, `exportTracker(applications, format)`, and route `/import`.

- [ ] **Step 1: Write failing parser and round-trip tests**

```ts
it("maps common Excel tracker headings to standard fields", async () => {
  const preview = await parseTracker(fixture("fresh-grad-tracker.xlsx"));
  expect(preview.rows[0].normalized).toMatchObject({ company: "Example Bank", stage: "interview", market: "SG" });
});

it("exports data that can be imported without losing standard fields", async () => {
  const bytes = exportTracker([application], "xlsx");
  const preview = await parseTracker(new File([bytes], "roundtrip.xlsx"));
  expect(preview.rows[0].normalized).toMatchObject(applicationCoreFields);
});
```

- [ ] **Step 2: Verify import/export tests fail**

Run: `npm test -- src/features/import-export`

Expected: FAIL because parsing and export are missing.

- [ ] **Step 3: Implement mapping, normalization, and duplicate rules**

Map common headings such as Company, Role, Status, Stage, Date Applied, Location, Salary, Link, Notes, Deadline, and Contact. Normalize Excel serial dates, ISO/local date strings, SGD/HKD amounts, market names, and stage synonyms. Flag duplicates using normalized company + role + applied date, but allow the user to keep both.

- [ ] **Step 4: Build the non-destructive import preview**

Show source column mapping, normalized row, error list, duplicate reason, include/exclude checkbox, and total counts before confirmation. Write nothing until the user confirms. A failed confirmed row leaves all other unconfirmed rows untouched and produces a row-level error report.

- [ ] **Step 5: Implement filtered and complete export**

Export the documented standard headings, ISO dates, explicit currency, stage/outcome labels, and semicolon-separated tags. Support `.xlsx` and UTF-8 `.csv`.

- [ ] **Step 6: Verify fixtures and browser flow**

Run: `npm test -- src/features/import-export && npm run typecheck`

Expected: PASS for XLSX, CSV, invalid rows, duplicates, date/currency normalization, and round trip.

- [ ] **Step 7: Commit import/export**

```bash
git add src/domain/import.ts src/features/import-export src/app/routes.tsx
git commit -m "feat: add reviewed tracker import and export"
```

---

### Task 9: Verify the complete core tracker journey

**Files:**
- Create: `e2e/core-tracker.spec.ts`
- Create: `e2e/fixtures/fresh-grad-tracker.csv`
- Create: `README.md`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: every interface produced in Tasks 1–8.
- Produces: a runnable local tracker and documented quick start.

- [ ] **Step 1: Write the failing end-to-end journey**

```ts
test("imports, filters, updates, undoes, and exports an application", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /import tracker/i }).click();
  await page.getByLabel(/tracker file/i).setInputFiles("e2e/fixtures/fresh-grad-tracker.csv");
  await page.getByRole("button", { name: /confirm import/i }).click();
  await page.getByRole("link", { name: /applications/i }).click();
  await page.getByLabel(/market/i).selectOption("SG");
  await page.getByRole("link", { name: /example bank/i }).click();
  await page.getByLabel(/new stage/i).selectOption("interview");
  await page.getByRole("button", { name: /update stage/i }).click();
  await page.getByRole("button", { name: /undo change/i }).click();
  await expect(page.getByText(/recruiter review/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the journey and verify any uncovered failure**

Run: `npm run test:e2e -- e2e/core-tracker.spec.ts`

Expected before final wiring: FAIL at the first missing accessible name or route.

- [ ] **Step 3: Complete only the missing wiring exposed by the journey**

Add stable accessible labels, route links, IndexedDB cleanup for tests, and download assertions. Do not add update intelligence, AI, or live Buddy behavior in this plan.

- [ ] **Step 4: Write the initial README**

Document the problem, local-only privacy boundary, Node/npm prerequisites, `npm install`, `npm run dev`, `npm test`, sample-data reset, current features, and link to the approved design specification.

- [ ] **Step 5: Run the full verification gate**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Expected: all unit/component tests pass, TypeScript reports no errors, Vite builds successfully, and Playwright completes the core tracker journey.

- [ ] **Step 6: Commit the verified core tracker**

```bash
git add e2e README.md src
git commit -m "feat: complete local-first core tracker"
```

