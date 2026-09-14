# Final fix report — Job Buddy core tracker

Date: 2026-09-14
Scope: final whole-branch fix wave only; no remote mutation.

## Status

DONE_WITH_CONCERNS pending the documented, pre-existing release concerns below. The implementation is covered by fresh unit, component, browser, type, and production-build verification.

## RED → GREEN evidence

1. **Overview lifecycle state.** Added a repository-shaped, intentionally unsorted event history whose IDs do not match chronological order. The first focused run showed the rejected row as `Rejected at Applied` / `Rejected during Applied`; it now derives the canonical chronological state and shows `Rejected at Review` / `Rejected during Review`.
2. **Next action and calendar day.** Added focused cases for an active `followUpAt` that is overdue, today, and tomorrow, plus both sides of the Singapore UTC-midnight boundary. The first focused run returned `No deadline scheduled` for follow-ups and `Today` where the Singapore calendar requires `Tomorrow`; the selector now chooses the earliest active deadline/follow-up and evaluates labels in `Asia/Singapore`.
3. **Terminal rail semantics.** Added a withdrawn rail case. The first focused run exposed active `complete/current/upcoming` semantics and `aria-current`; the rail now presents an explicit terminal outcome and does not announce progressive active state. Rejected rails remain constant red.
4. **Detail job link.** Added a persisted valid URL detail case. The first focused run found no source link; the detail Overview now provides an accessible external `Open job posting` link with `target="_blank"` and `rel="noopener noreferrer"`.
5. **Tag transfer.** Added CSV and XLSX round trips for `R&D; quant`. The first focused run split it into `R&D` and `quant`; exports now use a documented `tag-uri-v1` marker while retaining semicolon separation, and imports preserve old unmarked files unchanged.
6. **Responsive Command Center.** Added the Playwright overflow/readability sweep. Its first run failed at 800px because next-action text exceeded its grid cell. The row now stacks at 56rem and passes at 390, 768, 800, 820, and 1440px without horizontal page overflow.

The focused GREEN rerun passed **5 files / 35 tests**.

## Additional delivered changes

- Standard CSV/XLSX exports are accurately documented as snapshots, not restorable backups; EN and ZH both disclose omitted lifecycle history, event notes/evidence, IDs, and saved views beside export/reset guidance.
- Node engine is pinned in `package.json` and `package-lock.json` to `^22.22.2 || >=24.0.0`; EN/ZH setup guidance matches.
- Playwright always starts its configured production server (`reuseExistingServer: false`).
- `test-results/` and `playwright-report/` are ignored.

## Final verification

| Command | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run` | PASS — 18 files, 125 tests |
| `node node_modules/typescript/bin/tsc -b --pretty false` | PASS — exit 0, no diagnostics |
| `node node_modules/vite/bin/vite.js build` | PASS — production build completed |
| `node node_modules/@playwright/test/cli.js test` | PASS — 2 browser tests |
| `git diff --check` | PASS — no whitespace errors |

Playwright reran the real import → filter → manual update → undo → CSV/XLSX download flow and the responsive Command Center check. Visual screenshots were reviewed at 390px (mobile), 800px (tablet), and 1440px (desktop): `test-results/final-fix-command-center-390.png`, `test-results/final-fix-command-center-800.png`, and `test-results/final-fix-command-center-1440.png`. The rows are readable, no page overflow is present, active rails retain progressive green, rejected rails remain red, and withdrawn is visibly neutral with an explicit outcome label.

## Deferred concerns

- SheetJS `xlsx` parsing still occurs before formula/macro guards can run. The app only accepts explicit local files, limits file/sheet dimensions, rejects formulas/macros, and dynamically loads SheetJS, but this remains a trusted-local-preview release risk.
- The production main chunk remains **624.47 kB raw / 188.55 kB gzip** and triggers Vite's chunk-size warning. Route splitting is intentionally deferred from this focused correctness wave.
- No license file is present; a release plan must select and add one before redistribution.
- Host-injected `NO_COLOR` / `FORCE_COLOR` warnings appeared during Playwright runs; assertions and browser results were unaffected.
