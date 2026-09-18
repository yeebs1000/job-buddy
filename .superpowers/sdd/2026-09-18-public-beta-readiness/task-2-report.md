# Task 2 report — installed extension and process lifecycle reliability

## Outcome

- Replaced phase-blind installed-extension assertions with named Playwright steps synchronized to the companion's actual HTTP completion events.
- Extended the real installed Edge test through invalid pairing, valid pairing, approved synthetic-profile fill, page reload, same-store companion restart, and revocation. Revocation leaves the fixture field empty and returns the panel to pairing.
- Added failure-only metadata diagnostics: method, route, origin class (`dashboard`, `extension`, or `other`), status, and elapsed milliseconds. No token, pairing code, or profile value is attached.
- Added a Windows task-spawned descendant lifecycle regression. It passed against the existing launcher, disproving the initial code-inspection hypothesis that descendants survive; `scripts/dev.mjs` was not changed.
- Added safe actionable handling for configured-port conflicts. It tells the user to close the other Job Buddy companion and retry; it never kills or suggests killing an unrelated listener.

## Root cause and observed evidence

The original test passed once in 14.7 seconds. A bounded `--repeat-each=10` reproduction produced runs from 12.4 to 43.7 seconds and one failure at the invalid-pairing UI assertion. The assertion stopped after its default five seconds, but Playwright's failure snapshot already contained the exact expected invalid-code alert. This established a test synchronization race: the assertion deadline could expire while the installed extension operation was still completing.

The historical empty `#first` result did not reproduce directly. The old test clicked Fill and immediately relied on an unrelated locator timeout. The replacement waits for the real `/api/buddy/activity` 204 acknowledgement, which happens only after the guarded DOM fill, then asserts `#first === "Alex"`. The first expanded test run exposed the same race after reload: the panel was opened while the restored content runtime was still idle. RED showed `Ready for this application`; the regression now waits for both authenticated preferences and profile-selection responses before checking the restored review.

No extension transport, origin/token protocol, typed messages, approval snapshots, or DOM safety policy changed.

## RED / GREEN evidence

### RED

- `npm.cmd run test:e2e:extension -- real-pairing.spec.ts --repeat-each=10`
  - 1 failed, 9 passed.
  - Failure: invalid-pairing alert locator timed out at 5 seconds; failure snapshot contained the expected alert.
- First expanded lifecycle run after adding named phases:
  - Failed in `persist pairing across page reload and companion restart`.
  - Snapshot showed the initial idle heading, proving reload restoration had not finished before UI inspection.
- `npm.cmd test -- server/startup.test.ts`
  - 2 failed as expected against the initial generic startup-error seam: occupied port was not identified and generic safe guidance was absent.

### GREEN

- `npm.cmd test -- server/startup.test.ts scripts/dev.test.mjs extension/src/companionClient.test.ts extension/src/content.test.ts`
  - 4 files passed, 25 tests passed.
- `npm.cmd run typecheck`
  - Exit 0.
- `npm.cmd run build:extension`
  - Exit 0.
- `npm.cmd run test:e2e:extension -- real-pairing.spec.ts`
  - 1 passed in 14.5 seconds.
- `npm.cmd run test:e2e:extension`
  - 5 passed, including the real installed extension test in 13.9 seconds.
- `git diff --check`
  - No whitespace errors in owned changes; only existing Windows line-ending warnings appeared.

## Files

- `e2e-extension/real-pairing.spec.ts`
- `scripts/dev.test.mjs`
- `server/start.ts`
- `server/startup.ts`
- `server/startup.test.ts`
- `.superpowers/sdd/2026-09-18-public-beta-readiness/task-2-report.md`

The existing unrelated edit in `docs/superpowers/plans/2026-09-18-public-beta-readiness.md` was not modified or committed.

## Self-review

- The E2E test still uses the existing 60-second whole-test ceiling; no timeout was increased.
- All synthetic data remains isolated under a unique temporary directory and an ephemeral companion port.
- Test cleanup closes only its browser, companion server connections, and unique temporary directory.
- The process lifecycle test creates and cleans only its own fake npm wrappers and descendant processes. Since it passed before any launcher change, no speculative process-kill code was added.
- Startup errors reveal neither raw OS error detail nor secrets.

## Concerns / follow-up

- The historical empty-field failure was not independently reproduced; current coverage proves the same installed path fills after an explicit activity acknowledgement and remains safe after revocation.
- The Windows descendant test is Windows-only by design. Other platforms skip it, matching the brief's Windows shutdown scope.
