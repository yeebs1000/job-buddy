# Task 9 verification report — Job Buddy core tracker

## Status

**DONE_WITH_CONCERNS**

The required implementation commit is `c916bbdc125627556a7bace44a56f251e4491ce4` (`feat: complete local-first core tracker`). This report records the final verification performed on 2026-09-14 in the isolated `job-buddy-core` worktree.

## Delivered scope

- `e2e/core-tracker.spec.ts` provides one deterministic browser journey with test-browser-only cleanup for the `job-buddy` IndexedDB database.
- `e2e/fixtures/fresh-grad-tracker.csv` is a fictional, one-row Singapore software fixture: Cedarline Systems / Graduate Software Engineer at recruiter review.
- Playwright is configured with a 127.0.0.1 production-preview web server and base URL. Vitest explicitly excludes `e2e/**`, so the Playwright suite remains separate from the JSDOM suite.
- The focused `App` regression checks the accessible primary Applications link alongside the Command Center shell.
- The README documents local-first privacy limits, local workbook parsing limits, setup/testing/reset, core V1 feature scope, SG/HK and role boundaries, deferred integrations, contribution guidance, plan/spec links, and the absence of a license.

## TDD / E2E evidence

1. The first Playwright attempt was intentionally run immediately after the E2E spec was created. It was red because the host had no Playwright Chromium executable. Chromium was installed locally for test execution only.
2. The initial integrated journey exposed missing browser-test wiring: no Playwright `baseURL`/`webServer`. `playwright.config.ts` received the minimal local production-preview command and base URL.
3. The E2E spec then uncovered only locator/download-test issues, not product gaps: preview rows present normalized `review` rather than the source phrase, the unscoped Applications link was ambiguous, and the Windows Playwright temporary download artifact was locked (`EPERM`) despite a successful download. The final test uses stable semantic locators and a browser-test-only `URL.createObjectURL` Blob observer. It still waits for real download events and asserts the emitted names.
4. A default Vitest run was red after the new E2E file because Vitest globbed `e2e/core-tracker.spec.ts` and rejected Playwright's `test.beforeEach`. Adding `exclude: ["e2e/**", "node_modules/**", "dist/**"]` to Vitest was the minimal configuration correction.
5. Two fresh default Vitest runs then passed with **18 test files / 118 tests** each. A third final default run also passed with **18 / 118**.

## Final command evidence

`npm` is not on this host's PATH. The following direct Node equivalents were used; the README retains standard npm commands for contributors.

| Command | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run` | PASS — 18 files, 118 tests (run twice during stabilization and once as final gate) |
| `node node_modules/typescript/bin/tsc -b --pretty false` | PASS — exit 0, no diagnostics |
| `node node_modules/vite/bin/vite.js build` | PASS — production bundle generated |
| `node node_modules/@playwright/test/cli.js test` | PASS — 1 E2E test using configured build + preview web server |

The final Playwright invocation used the configured server command:

```text
node ./node_modules/typescript/bin/tsc -b && node ./node_modules/vite/bin/vite.js build && node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173
```

## Browser journey and download assertions

The passing browser flow does all of the following in one clean browser context:

1. Opens Command Center, clears only that test browser's `job-buddy` IndexedDB data, and reloads.
2. Follows the real Import tracker action, uploads the fictional CSV, reviews its valid Singapore/software row, and explicitly confirms it.
3. Opens Applications, selects Singapore and software filters, and opens the imported detail route.
4. Verifies Review as the current rail state, updates to Interview, verifies the current rail and history, undoes, verifies Review is restored, and verifies the preserved history event is visibly `Reverted / not applied`.
5. Returns to Applications and downloads the filtered CSV. It asserts `job-buddy-filtered-YYYY-MM-DD.csv`, the `Company` heading, and `Cedarline Systems` in the captured browser Blob.
6. Downloads the real filtered XLSX and asserts `job-buddy-filtered-YYYY-MM-DD.xlsx` plus a non-zero Blob byte length.

## Visual and console QA

Production preview was inspected at 1440 × 900 and 390 × 844.

- **1440px:** Command Center title/actions, six-stage counts, attention rows, rails, rejected treatment, and deadline column were visible with no overlap or clipping.
- **390px:** Header navigation remains horizontally reachable, actions stack cleanly, six stage counts reflow, and the attention card/rail remains readable without horizontal page overflow.
- The browser console was queried after each viewport run: **0 errors and 0 warnings**.

## README claims checked

The README only presents present local-first functionality as shipped. It explicitly says there is no account/server, Gmail access, AI credential, Gmail intelligence, salary/review connector, Buddy autofill/automation, hosted sync, or multi-user feature. It documents the values-only local XLSX boundary (formula/macro/format preservation is not offered), describes demo reset through site-data clearing, and does not invent a license.

## Concerns

- Vite emits a non-blocking production warning: the main JavaScript chunk is 623.22 kB minified (188.10 kB gzip), above the 500 kB warning threshold. Dynamic code splitting is a later performance task and was deliberately not widened into Task 9.
- The host injects a `NO_COLOR`/`FORCE_COLOR` Node warning into Playwright subprocess output. It does not originate from Job Buddy and the browser console itself was clean.
- Playwright's temporary downloaded artifact was locked by Windows (`EPERM`) when read/copied directly. The final E2E assertion therefore reads the actual export Blob within the test browser, while still asserting the real download event and filename. This is deterministic and avoids touching user files.
