# Tavily Dashboard Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has explicitly chosen inline execution in the existing checkout; do not create a worktree or delegate implementation.

**Goal:** Replace local SearXNG with securely configured Tavily and make research, spreadsheet import/export and critical application information usable directly on the landing page.

**Architecture:** Keep the companion's loopback security boundary and existing web-salary result contract. Add a dedicated DPAPI credential store and durable dispatch budget, then replace only the search adapter. Reuse reviewed salary evidence, add source-backed employee-rating evidence, and compose the existing research/import controls inline; Gmail stays unchanged.

**Tech Stack:** Existing React, TypeScript, Zod, Dexie, Node fetch/fs, Windows DPAPI, Vitest, Testing Library and Playwright. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-26-tavily-dashboard-research-design.md` (approved by the user's “lets build” reply).

## Global Constraints

- Work inline in the existing checkout, preserving unrelated uncommitted changes.
- Gmail scanning remains central.
- Do not install an SDK: use server-side fetch to the fixed HTTPS search endpoint, with a Bearer key, redirects refused, bounded results/body and a timeout.
- Never send emails, profiles, resumes or arbitrary user documents.
- Fail closed if secure storage is unavailable; never silently fall back to plaintext.
- Keys must not enter browser persistence, URLs, logs, fixtures, exports or encrypted workspace backups. Synthetic test strings are permitted, actual credentials are not.
- Cap this installation at 1,000 dispatched requests/month; count failures conservatively and do not automatically retry billable calls.
- Restarts and key changes do not reset the allowance.
- No account creation, paid plan activation or purchases are included.
- No data deletion or automatic migration.
- Do not use the user's mailbox or spend real search credits in automated tests.
- The static web-only preview has no secure key backend and must not accept a key.
- Keep the normal dashboard on port 5173; do not substitute the experimental web preview on 5174.

## Review Focus

1. A key is replaced/removed during a request: obsolete results never reach the user or refill cache; saved application evidence survives. Tests: Tasks 3 and 4.
2. Restart, two store instances, failed write or clock rollback near a quota boundary: dispatch reservations cannot be lost or duplicated and failures never authorize requests. Tests: Task 2.
3. A user corrects company/role/location while old research exists: keep provenance visible and flag query mismatch instead of presenting the old range as newly relevant. Tests: Tasks 5 and 6.
4. Two expanded rows, React StrictMode or a double click: unique labels/IDs, no unsolicited/double searches, and results remain attached to the initiating application. Tests: Task 6.
5. Import or research dialogs close during work: completed saves refresh the dashboard, focus returns sensibly, and partial/failed operations never overwrite unrelated records. Tests: Tasks 6 and 7.

## Working-tree and execution rules

Before product edits, record `git status --short` and preserve a task-local baseline of overlapping diffs. The checkout already contains substantial uncommitted product work. Stage only new task files or task-owned hunks after reviewing them; never `git add .`, reset, stash, or commit entire pre-existing modified files merely for a checkpoint. If isolating a checkpoint would include unrelated work, leave it uncommitted and report that fact. There is no push, deployment, new account, installer or live Gmail scan in this plan.

Each task follows red test -> observed failure -> smallest implementation -> green targeted tests. Finish with the integration checks in Task 8. If a security check cannot be supported, stop that operation rather than introducing a weaker fallback.

## File ownership map

| Area | Files and responsibility |
|---|---|
| Credential | New `server/research/TavilyKeyStore.ts` and tests: one encrypted search key, separate from Gmail |
| Budget | New `server/research/SearchBudgetStore.ts` and tests: persistent monthly reservations |
| Provider | New `server/research/TavilySearchService.ts` and tests: credential lifecycle, bounded HTTP, cache and limits |
| Shared contracts | New `src/domain/researchSearch.ts`; modify `src/domain/webSalary.ts` only for optional research purpose |
| API/runtime | Modify `server/http/createCompanionServer.ts` and tests, `server/start.ts`: secure routes and dependency wiring |
| Settings | New `src/features/settings/ResearchSearchSettings.tsx`, test and client; modify `SettingsPage.tsx` |
| Ratings | New `src/domain/companyRating.ts`, `src/features/research/companyRating.ts`, repository/panel and tests |
| Dashboard | Modify `SalarySummary.tsx`, `CommandCenterPage.tsx`, CSS; new `InlineResearchPanel.tsx` and tests |
| Reusable salary UI | Modify `WebSalaryPanel.tsx`, tests, `webSalaryClient.ts`: Tavily copy, supplied results, unique IDs |
| Excel | Extract `TrackerImportPanel.tsx` from `ImportTrackerPage.tsx`; new dashboard `TrackerFileActions.tsx` and tests |
| Persistence | Modify backup metadata allowlist/tests for rating evidence; no credential schema in browser data |
| Integration/docs | New `e2e/tavily-research.spec.ts`; adapt existing research tests; update README/PRIVACY and verification note |

### Task 1: Dedicated secure search-key storage

**Files:** Create `server/research/TavilyKeyStore.ts`, `server/research/TavilyKeyStore.test.ts`, `src/domain/researchSearch.ts`.

**Interfaces:**

```ts
// src/domain/researchSearch.ts
import { z } from 'zod';
export const tavilyKeySchema = z.string().trim().min(8).max(512)
  .regex(/^tvly-[A-Za-z0-9_-]+$/);
export const searchStatusSchema = z.object({
  configured: z.boolean(), platformSupported: z.boolean(),
  usage: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/),
    used: z.number().int().min(0).max(1000), limit: z.literal(1000) }).strict(),
}).strict();
export type ResearchSearchStatus = z.infer<typeof searchStatusSchema>;
// server/research/TavilyKeyStore.ts
export interface SearchKeyStore {
  isSupported(): boolean;
  get(): Promise<string | null>;
  set(key: string): Promise<void>;
  delete(): Promise<void>;
}
```

The concrete store constructor accepts `{root?: string, runner?: CommandRunner, platform?: NodeJS.Platform}` using the existing WindowsDpapi options. Only backend code imports the store. No key is included in ResearchSearchStatus.

- [ ] Write failing storage tests using a temporary directory and a stub DPAPI runner, following `WindowsDpapiSecretStore.test.ts`. Prove write/read/replacement/removal, unsupported platform, unreadable ciphertext, malformed key, and unchanged Gmail file.

```ts
it('rejects multiline keys before encryption', () => {
  expect(tavilyKeySchema.safeParse('tvly-test\nAuthorization: injected').success).toBe(false);
});
it('does not allow a key in public status', () => {
  expect(searchStatusSchema.safeParse({ configured: true, platformSupported: true,
    usage: { month: '2026-09', used: 0, limit: 1000 }, key: 'tvly-test-only' }).success).toBe(false);
});
```

- [ ] Run `npm.cmd test -- server/research/TavilyKeyStore.test.ts` and observe failures for missing contracts/store.
- [ ] Implement validation before encryption, encrypted bytes at `<JobBuddy>/secrets/tavily-key.bin`, temp-file exclusive create, write/sync/close/atomic rename, cleanup of only the generated temp file. Use DPAPI current-user protection via stdin, never command arguments. Return null only on ENOENT; sanitize every other error to `web-search-storage-unavailable`. Removal is idempotent and limited to this exact credential file.
- [ ] Run the targeted tests and `npm.cmd run typecheck`. Inspect test temp files to assert plaintext never appears, using synthetic keys only.
- [ ] Review/stage only this task's files; checkpoint `feat: protect Tavily key separately from Gmail` if cleanly separable.

### Task 2: Persistent monthly dispatch guard

**Files:** Create `server/research/SearchBudgetStore.ts`, `server/research/SearchBudgetStore.test.ts`.

**Interfaces:**

```ts
export interface SearchBudget { month: string; used: number; limit: 1000 }
export interface SearchBudgetPort {
  status(): Promise<SearchBudget>;
  reserve(): Promise<SearchBudget>;
}
// constructor({root?: string, now?: () => number})
// root is the JobBuddy data directory; never browser storage.
```

- [ ] Write failing tests in a temporary root, including this concurrent/restart contract:

```ts
it('shares the cap across instances and restarts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'job-buddy-budget-'));
  const now = () => Date.UTC(2026, 8, 26);
  const a = new SearchBudgetStore({ root, now });
  const b = new SearchBudgetStore({ root, now });
  for (let i = 0; i < 999; i++) await a.reserve();
  const last = await Promise.allSettled([a.reserve(), b.reserve()]);
  expect(last.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  expect((await new SearchBudgetStore({ root, now }).status()).used).toBe(1000);
});
```

Use `mkdtemp`, `join`, `tmpdir` from Node libraries; remove only the generated test root in teardown. Add forward-month reset, backward-month refusal, corrupt JSON, injected atomic-write failure, and an existing lock tests. A failed reservation must not report success.

- [ ] Run `npm.cmd test -- server/research/SearchBudgetStore.test.ts`; observe the missing-store failure.
- [ ] Store strict `{version:1, month:'YYYY-MM', used:integer}` at `<root>/research/tavily-budget.json`. Serialize access with an exclusively created lock file plus a short bounded retry for competing reservations. Read the ledger only while locked; reserve and atomically persist before returning. On lock timeout, corruption or write failure throw `web-search-storage-unavailable`; on 1000 throw `web-search-budget-exhausted`. Do not auto-delete a lock owned by another process. Release only a lock acquired by this operation. Missing ledger initializes zero. An older current month than the saved month fails closed; a later UTC month starts zero.

```ts
const month = new Date(now()).toISOString().slice(0, 7);
if (saved && month < saved.month) throw new Error('web-search-storage-unavailable');
const used = saved?.month === month ? saved.used : 0;
if (used >= 1000) throw new Error('web-search-budget-exhausted');
// Under the acquired lock: persist { version: 1, month, used: used + 1 }
// with exclusive temporary-file creation and atomic rename before returning.
```

- [ ] Run the budget tests and typecheck. Ensure status reads also serialize safely; no request budget reset on key removal.
- [ ] Review/stage task-owned files; checkpoint `feat: persist bounded search dispatch allowance` if separable.

### Task 3: Tavily adapter with cache and revocation races

**Files:** Create `server/research/TavilySearchService.ts`, `server/research/TavilySearchService.test.ts`; modify `src/domain/webSalary.ts`.

**Interfaces:** The existing `WebSalaryResponse` remains unchanged. Add optional `purpose: 'salary' | 'company-rating'` to `webSalaryQuerySchema`; omission means salary. All other extra properties remain rejected.

```ts
type TavilyOptions = { keys: SearchKeyStore; budget: SearchBudgetPort;
  fetchImpl?: typeof fetch; now?: () => number };
// new TavilySearchService(options: TavilyOptions)
// status(): Promise<ResearchSearchStatus>
// configure(key: string): Promise<void>
// removeKey(): Promise<void>
// search(query: WebSalaryQuery): Promise<WebSalaryResponse>
```

- [ ] Write failing tests for a valid result and request minimization with injected key/budget ports:

```ts
const budget = { status: vi.fn().mockResolvedValue({ month: '2026-09', used: 0, limit: 1000 }),
  reserve: vi.fn().mockResolvedValue({ month: '2026-09', used: 1, limit: 1000 }) };
const keys = { isSupported: () => true, get: vi.fn().mockResolvedValue('tvly-synthetic-only'),
  set: vi.fn(), delete: vi.fn() };
const fetcher = vi.fn().mockResolvedValue(Response.json({ results: [{
  title: 'Pay guide', url: 'https://example.com/pay', content: 'HKD 600000–900000 annual base salary',
}] }));
const service = new TavilySearchService({ keys, budget, fetchImpl: fetcher });
await service.search({ company: 'Example Employer', role: 'Analyst', location: 'Hong Kong' });
const [endpoint, init] = fetcher.mock.calls[0];
expect(endpoint).toBe('https://api.tavily.com/search');
expect(JSON.parse(init.body)).toMatchObject({ search_depth: 'basic', auto_parameters: false,
  include_answer: false, include_raw_content: false, include_images: false, max_results: 10 });
expect(budget.reserve).toHaveBeenCalledTimes(1);
```

- [ ] Run `npm.cmd test -- server/research/TavilySearchService.test.ts`; observe failures.
- [ ] Implement fixed-endpoint POST with sanitized public query fields and purpose-specific suffix. Keep 12-second timeout, 512000-byte streaming bound, redirect error, maximum 10 safe/deduplicated HTTPS results and escaped/plain excerpts. Use actual reported page dates only. No generated-answer field or relevance-score-based confidence.
- [ ] Before dispatch: load key, check normalized purpose-specific 24-hour cache (100 entries maximum), enforce one active request and 20/hour, atomically reserve one credit, then fetch. Cached responses do not reserve. No retry. Map 401/403 to `web-search-invalid-key`, 429 to `web-search-rate-limited`, provider quota responses to `web-search-budget-exhausted`, network timeout to `web-search-unavailable`, all unrecognized responses to `web-search-failed`. Verify Tavily's current quota HTTP status in its official reference before coding that mapping; use fixture responses, not live requests.
- [ ] Serialize key mutations. Increment generation and abort current request before replacing/removing key; check generation after every asynchronous boundary before dispatch and before returning/caching. Stale work throws `web-search-configuration-changed`. Failed key save retains the prior stored credential and old saved application research. Budget is never reset.
- [ ] Add tests for cache normalization/purpose separation, 24-hour expiry, hourly/monthly cap, private extra fields, non-JSON/oversized streaming errors, localhost/unsafe links, unsafe upstream error text, successful zero results, key change during credential read/reservation/fetch and aborting a stale response. Assert no fetch after a reservation failure.
- [ ] Run targeted provider/key/budget tests and typecheck. Checkpoint only task-owned changes with `feat: use bounded Tavily search` if separable.

### Task 4: Secure settings API and usable key field

**Files:** Modify `server/http/createCompanionServer.ts`, its tests, `server/start.ts`, `src/features/settings/SettingsPage.tsx`, `src/features/research/webSalaryClient.ts`, `WebSalaryPanel.tsx` and existing research tests. Create `src/features/settings/researchSearchClient.ts`, `ResearchSearchSettings.tsx`, `ResearchSearchSettings.test.tsx`.

**Interfaces:** Extend the webSalary service port to the Task 3 methods, allowing status to be synchronous or asynchronous for existing test doubles. Routes:

```text
GET    /api/research/web-salary/status -> ResearchSearchStatus
POST   /api/research/web-salary/key    body {apiKey:string} -> ResearchSearchStatus
DELETE /api/research/web-salary/key    -> ResearchSearchStatus
POST   /api/research/web-salary/search -> existing response
```

Client exports `researchSearchClient.status()`, `.saveKey(apiKey)` and `.removeKey()`, each returning `Promise<ResearchSearchStatus>`. Component accepts optional `client` with those signatures for tests.

- [ ] Add failing HTTP tests using the existing companion test helper: missing/foreign/null Origin, oversized or extra key fields, wrong method, strict path (no `endsWith` route confusion), sanitized storage failure, no-store, successful save/remove and no key leakage in any body. No CORS relaxation.
- [ ] Add a failing Settings test with an injected client:

```tsx
it('saves without reading the secret back', async () => {
  const empty = { configured: false, platformSupported: true,
    usage: { month: '2026-09', used: 0, limit: 1000 as const } };
  const client = { status: vi.fn().mockResolvedValue(empty),
    saveKey: vi.fn().mockResolvedValue({ ...empty, configured: true }),
    removeKey: vi.fn().mockResolvedValue(empty) };
  render(<ResearchSearchSettings client={client} />);
  const input = await screen.findByLabelText('Tavily API key');
  await userEvent.type(input, 'tvly-synthetic-only');
  await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
  await waitFor(() => expect(input).toHaveValue(''));
  expect(screen.getByText(/saved.*not yet verified/i)).toBeVisible();
});
```

- [ ] Run the new tests and observe failure. Implement exact protected routes with 2 KiB maximum key body, strict Zod validation, allowlisted safe error codes and no-store. Wire TavilySearchService with the two stores in `server/start.ts`; remove runtime SearXNG import, leaving historical scripts/docs explicitly optional rather than deleting unrelated work.
- [ ] Implement masked/password input, Save/Remove, usage, unconfigured/loading/unavailable states and local-only explanation. Disable controls during work, clear input after successful save, never persist it, and ignore late updates after unmount. Render in companion Settings only. Mention that saving does not verify a key and that other apps consume account credits. Never claim provider billing was disabled automatically.
- [ ] Update salary panel and client copy to Tavily and “Add your Tavily API key in Settings”; remove Docker instructions from active UI. Preserve the existing error-safe saved research behavior. Do not start a real test query on save.
- [ ] Test invalid key, storage failure, double-submit, removal while saving, unsupported platform and web mode lacking the input. Run server tests, Settings tests, WebSalaryPanel tests, typecheck. Checkpoint task-owned hunks if separable.

### Task 5: Source-labelled employee ratings and query provenance

**Files:** Create `src/domain/companyRating.ts`, `src/features/research/companyRating.ts`, `companyRating.test.ts`, `companyRatingRepository.ts`, `companyRatingRepository.test.ts`, `CompanyRatingPanel.tsx` and test. Modify `src/features/backup/workspaceSchema.ts`, `workspaceBackup.test.ts`.

**Interfaces:**

```ts
// companyRating.ts domain; validate with strict Zod schema.
export interface CompanyRatingEvidence {
  id: string; company: string; provider: string; score: number; outOf: number;
  reviewCount?: number; url: string; excerpt: string; retrievedAt: string;
  savedAt: string; confirmed: true;
}
// rating scale 1..10, 0 <= score <= outOf, review count positive integer if present;
// URL uses isSafeExternalHttpsUrl; excerpt <=2000, provider/company <=160.
// repository.get(id): Promise<CompanyRatingEvidence | undefined>
// repository.save(evidence: CompanyRatingEvidence): Promise<void>
// metadata key: company-rating:<application id>
// suggestCompanyRating(source: WebSalaryResponse['results'][number], company: string):
//   {score:number; outOf:number} | undefined
```

- [ ] Write red tests: no candidate for customer/product ratings or unrelated employer; a narrow explicit employee-rating excerpt can populate an unconfirmed form. Conservative parser implementation example:

```ts
if (!source.excerpt.toLocaleLowerCase().includes(company.toLocaleLowerCase())) return;
if (!/employee(?:s)?\s+(?:reviews?|ratings?)/i.test(source.excerpt)) return;
const match = source.excerpt.match(/\b([0-9](?:\.[0-9]+)?)\s*(?:\/|out of)\s*(5|10)\b/i);
if (!match || Number(match[1]) > Number(match[2])) return;
return { score: Number(match[1]), outOf: Number(match[2]) };
```

This is only a suggestion, never automatic verification. A source link is optional to open; relevant source text and review controls remain inline.
- [ ] Run `npm.cmd test -- src/features/research/companyRating.test.ts src/features/research/companyRatingRepository.test.ts` and observe missing-code failures.
- [ ] Implement schema/repository and a small panel allowing confirmation of employer/provider, employee-rating context, score/scale and optional review count from the displayed evidence. Require explicit review before saving. Preserve the old rating on search failure or cancellation. If employer query no longer matches current application, label saved data “For previous company details—refresh needed.”
- [ ] Test the form, safe links, invalid scale, missing provider and stale company match. Store only reviewed evidence, no provider secrets. Add the new metadata prefix to `portableMetadata` with strict parsing, exact id match and existing application-reference validation. Old backups without ratings remain valid; unknown metadata/secret keys remain rejected.

```ts
if (record.key.startsWith('company-rating:')) {
  const rating = companyRatingEvidenceSchema.parse(JSON.parse(record.value));
  if (record.key !== `company-rating:${rating.id}`) throw new Error('Research key mismatch.');
  return { key: record.key, value: JSON.stringify(rating) };
}
```

- [ ] Run rating and backup tests and typecheck. Checkpoint only task-owned changes if separable.

### Task 6: Inline research on the landing page

**Files:** Create `src/features/command-center/InlineResearchPanel.tsx`, `InlineResearchPanel.test.tsx`; modify `SalarySummary.tsx`, `CommandCenterPage.tsx`, `command-center.css`, `WebSalaryPanel.tsx`, its tests and `CompanyRatingPanel.tsx`.

**Interfaces:**

```ts
export interface ResearchSearchResult {
  requestId: string; query: WebSalaryQuery; result: WebSalaryResponse;
}
// WebSalaryPanel gains optional initialSearch: ResearchSearchResult.
// CompanyRatingPanel props: {application:Application; initialSearch?:ResearchSearchResult}.
// InlineResearchPanel props: {application:Application}.
// SalarySummary props: {application:Application}; remains the row composition entrypoint.
```

- [ ] Write failing inline tests proving no initial provider request, Refresh performs at most two sequential purpose-specific searches, route remains `/`, two expanded rows have unique IDs, and saving a range or rating immediately updates only its own summary. Also test company/role/location mismatch and React StrictMode double-render.

```tsx
it('keeps refresh on the dashboard without unsolicited search', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ results: [],
    searchedAt: '2026-09-26T00:00:00.000Z' }));
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={['/']}><SalarySummary
    application={sampleApplications[0]} /></MemoryRouter>);
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Refresh research' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('link', { name: 'Research salary' })).not.toBeInTheDocument();
});
```

- [ ] Run targeted inline tests and observe failure. Compose a visible summary with salary/basis/date/confidence and company rating/source above an expandable evidence panel. Reuse useLiveQuery for saved evidence. Imported `application.research` values are fallback only and labelled “Imported / unverified,” not live verified data. Never hide stage or next deadline when expanding.
- [ ] Refresh opens the evidence panel and triggers sequential salary then company-rating searches from current application fields. One ref guard prevents double-click duplicate dispatch; failures are independently presented so a successful salary result survives a rating failure. Use an abort signal and attempt/application generation checks when unmounting or changing application. No mount effects perform network search.
- [ ] Feed responses into existing panels via `initialSearch`, applying each requestId once. Preserve their independent search actions on the detail page. Replace fixed `web-salary-title` with `useId`. Lazy-load panel code on expansion. Keep results as unreviewed leads until saved through existing salary confirmation or Task 5 rating review.
- [ ] Saved summaries remain visible while refreshing and on failure; date means saved/retrieved date, never pretend it is the salary reference year. Explicit empty results show Not found for the attempted query without erasing older saved evidence. Existing stale/previous-query results retain their provenance warning. Render all provider text as text, never HTML.
- [ ] Add desktop/mobile CSS using existing palette/tokens and modest spacing, full-width expanded evidence under its row, no navigation or nested buttons/links. Test Tab/Escape/focus recovery and no horizontal overflow at 390px. Preserve Gmail card position, scan/approval actions and stage rails.
- [ ] Run inline/panel/CommandCenter unit tests and typecheck. Checkpoint only isolated task-owned changes if separable.

### Task 7: Excel actions and quieter backup settings

**Files:** Create `src/features/import-export/TrackerImportPanel.tsx`, `src/features/command-center/TrackerFileActions.tsx`, `TrackerFileActions.test.tsx`; modify `ImportTrackerPage.tsx`, related tests, `CommandCenterPage.tsx`, `SettingsPage.tsx`, Settings tests and `command-center.css`.

**Interfaces:**

```tsx
// TrackerImportPanel props: { onImported?: () => void | Promise<void> }.
// Extract upload/mapping/preview/confirm unchanged from ImportTrackerPage.
// The route wrapper owns h1/navigation; embedded panel owns h2, no route links required.
// TrackerFileActions props: { onImported: () => Promise<void> }.
// Uses applicationRepository.list() and downloadTracker(apps, 'xlsx', 'all').
```

- [ ] Write failing tests for Import Excel opening a dialog on `/`, unchanged preview/duplicate defaults, invalid rows never imported, refresh callback after partial/successful import, and Export Excel disabled for an empty workspace. Test archived records are included in explicitly labelled “Export all applications” rather than silently dropped.
- [ ] Run `npm.cmd test -- src/features/command-center/TrackerFileActions.test.tsx src/features/import-export/ImportTrackerPage.test.tsx`; observe new-action failures.
- [ ] Extract the importer without rewriting parseTracker/confirmImport. Wrapper stays backwards compatible. New `<dialog>` uses showModal/close and labelled title, Escape support and focus return; panel remains mounted during pending save so closing does not lose its completion callback. No import starts on file selection alone.

```tsx
const dialog = useRef<HTMLDialogElement>(null);
return <>
  <button onClick={() => dialog.current?.showModal()}>Import Excel</button>
  <dialog ref={dialog} aria-label="Import Excel tracker">
    <button onClick={() => dialog.current?.close()}>Close import</button>
    <TrackerImportPanel onImported={onImported} />
  </dialog>
</>;
```

- [ ] Wire both empty and populated landing toolbars. Lazy-load Excel code on action. Export reads current all-application data at click time; errors leave the tracker intact. Keep Gmail as the prominent primary action.
- [ ] Move BackupSection to the end of Settings in collapsed `<details><summary>Advanced: backup and restore</summary>`. Preserve backup controls and semantics in companion and web modes. Tests assert Gmail and search setup precede collapsed backup, and no backup fields are initially visible. Do not modify backup cryptography.
- [ ] Run importer/exporter/backup/settings/dashboard tests and typecheck. Checkpoint only task-owned changes if separable.

### Task 8: End-to-end verification and user handoff

**Files:** Create `e2e/tavily-research.spec.ts`, `docs/releases/v1-tavily-research-verification.md`; modify `e2e/web-salary.spec.ts`, `e2e/salary-research.spec.ts`, `src/app/webCapabilities.test.tsx`, README, PRIVACY and `docs/local-search.md` where they describe active provider/setup.

- [ ] Add fixture-only E2E coverage for Settings save/remove and inline research. Intercept the key route; assert its body using only a synthetic key. Never print request headers, real secrets or mailbox contents. Seed a dedicated isolated test browser with synthetic applications, not the user's browser storage.

```ts
await page.route('**/api/research/web-salary/status', route => route.fulfill({ json: {
  configured: false, platformSupported: true,
  usage: { month: '2026-09', used: 0, limit: 1000 },
} }));
await page.route('**/api/research/web-salary/key', route => route.fulfill({ json: {
  configured: route.request().method() !== 'DELETE', platformSupported: true,
  usage: { month: '2026-09', used: 0, limit: 1000 },
} }));
await page.goto('/settings');
await page.getByLabel('Tavily API key').fill('tvly-synthetic-only');
await page.getByRole('button', { name: 'Save key', exact: true }).click();
await expect(page.getByLabel('Tavily API key')).toHaveValue('');
```

- [ ] Add E2E proof that research review/save, sources, Excel import preview and export are available without leaving `/`. Assert invalid-key/quota failures retain saved values; repeated cached search does not consume additional budget in adapter tests. Verify employee-vs-customer rating distinction. Add web-only test proving the API key input is absent and no companion search call occurs.
- [ ] Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run build:extension`, `npm.cmd run verify:client-secrets`, `npm.cmd run verify:research-sources`. Record exact results and unrelated baseline failures; do not call the change verified if a required check fails.
- [ ] Run focused companion E2E with `npm.cmd run test:e2e -- e2e/tavily-research.spec.ts e2e/web-salary.spec.ts e2e/live-gmail.spec.ts e2e/recheck-mail.spec.ts e2e/update-intelligence.spec.ts`, then `npm.cmd run test:e2e:web`. Use the configured isolated test port (default 4173), not the user's 5173 instance. No live mailbox calls.
- [ ] Inspect rendered screenshots at desktop and 390px mobile: source-labelled salary/rating summary, expanded evidence, unique controls, no overflow, Excel dialog and collapsed backup. Use the required browser skill if inspecting via the in-app browser. A test pass alone is not visual signoff.
- [ ] Update documentation: Tavily key setup in Settings, privacy fields sent, explicit-save research, free-tier/account limitations, retained saved results, Docker no longer required, local-only key box versus future hosted administrator setup. Record provider API live verification as NOT RUN until the user supplies a key and explicitly searches. Avoid any claim that provider-side billing was changed.
- [ ] Refresh/restart only the identified Job Buddy development processes if needed, verify 5173 and companion health, and leave the user on the Gmail-capable dashboard. Never kill unrelated Node processes or clear local data. Final handoff states implemented features, tests actually run, how to enter the key, and the remaining hosted-launch boundary.

## Plan self-review and coverage

- Settings/credential boundary: Tasks 1 and 4, secure secrets tests and web-only isolation.
- Provider adapter/cache/replacement: Task 3; HTTP routing and runtime swap: Task 4.
- Durable free-tier limit and honest account-level limitation: Tasks 2 and 4.
- Inline salaries/ratings/query provenance: Tasks 5 and 6, no confidence from relevance scores.
- Excel import/export and advanced backup: Tasks 7 and 5 (new evidence portability).
- Regression, privacy, UI and no-live-mail verification: Task 8.
- All five Review Focus conditions are assigned to tests above. Contract names match their producing tasks. No implementation has begun; this plan awaits user review. Inline execution remains the selected method.
