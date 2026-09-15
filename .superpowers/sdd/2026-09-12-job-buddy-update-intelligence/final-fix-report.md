# Final v0.2 Update Intelligence fix report

Date: 2026-09-15

## Takeover state

The recovered partial changes were kept in place. The first focused command was:

```text
npm test -- src/features/updates/classifyMessage.test.ts src/features/updates/matchApplication.test.ts src/features/updates/runMailScan.test.ts src/db/applicationRepository.test.ts src/domain/stage.test.ts src/features/application-detail/ApplicationDetailPage.test.tsx
```

It reported 85 passing tests and four failures. The inherited classifier and matcher regressions were already green: cancellation/not-invited informational classification, rejection precedence, stage-qualified adjacency, explicit role mismatch, and absent-role evidence. Their production mutations are in `classifyMessage.ts` and `matchApplication.ts` respectively, so no missing RED evidence is claimed for those inherited tests.

The inherited undo tests were RED: `applicationRepository` observed no correction marker, both detail tests observed only the reverted event, and `runMailScan` observed the older reminder reapplying Interview. The guard mutations were then made in `stage.ts`, `applicationRepository.ts`, `updateRepository.ts`, and `StageHistory.tsx`. The focused GREEN command was:

```text
npm test -- src/db/applicationRepository.test.ts src/domain/stage.test.ts src/features/application-detail/ApplicationDetailPage.test.tsx src/features/updates/runMailScan.test.ts
58 passed (4 files)
```

## Important findings

1. Cancellation and negative invitations
   - Root cause: positive stage matching did not make cancellation/not-invited evidence authoritative across subject and body.
   - Fix: return an approval-required informational classification with no stage or deadline, while preserving explicit rejection proposals.
   - Evidence: recovered focused tests were already GREEN on takeover; no RED was invented.

2. Explicit incompatible roles
   - Root cause: high recruiter/domain/company weights could select the only application despite contradictory role-title evidence.
   - Fix: parse explicit title evidence, exclude incompatible candidates, and return `role-mismatch` when no compatible candidate remains.
   - Evidence: recovered focused tests were already GREEN on takeover; no RED was invented.

3. Adjacent unrelated deadlines
   - Root cause: any adjacent scheduling sentence could supply the classified deadline.
   - Fix: require the adjacent sentence to name the classified stage noun; pronoun-only and webinar adjacency stay without a deadline.
   - Evidence: recovered focused tests were already GREEN on takeover; no RED was invented.

4. Durable undo provenance
   - Root cause: undo only changed the old event to unaccepted, leaving no durable manual correction for later automation checks.
   - RED: the takeover command above failed repository, timeline, and older-reminder protection tests.
   - Fix: write one deterministic accepted `manual-correction` marker with `revertsEventId`, ignore it when materializing state, treat it as a `manual-correction` conflict, and label it `Undo recorded` with explanatory context in history.
   - GREEN: 58 focused tests passed.

5. Transactional approval revalidation
   - Root cause: approval used UI-time conflict state without validating the selected application version inside the database transaction.
   - RED command:

```text
npm test -- src/features/updates/runMailScan.test.ts src/features/updates/UpdateInboxPage.test.tsx src/features/application-detail/ApplicationDetailPage.test.tsx src/features/command-center/CommandCenterPage.test.tsx
```

   - RED result: stale-token approval was accepted, and the UI had no explicit stale-review guidance.
   - Fix: carry `expectedApplicationUpdatedAt` in explicit approval edits and reject mismatches transactionally; missing tokens also reject. The UI passes the selected read-model version, preserves pending status, and tells the user to review and confirm the current state again. Existing concurrent/idempotent approval coverage now passes tokens through its helper.
   - GREEN: the same focused suite passed 72 tests, then the stale-feedback test was separately RED for the clearer required guidance and GREEN after the UI message correction (17 passing tests).

6. Validated meeting links in read models
   - Root cause: only normalized deadline records held links; embedded application deadlines dropped them.
   - RED: the command above failed persistence plus Command Center and Application Detail `Open meeting link` tests.
   - Fix: add optional deadline links, persist only credential-free HTTPS URLs into both records, and render safe external meeting actions in both views.
   - GREEN: the 72-test focused suite passed.

## Minor corrections

- Rejected proposals now retain each extracted deadline as `Extracted deadline — not applied` without applying it to the application.
- README now states that only actionable messages become proposals; marketing/no-op mail and duplicate provider IDs are ignored.
- Playwright now directly asserts Taylor Ng, the Circuit sender address, the source excerpt, and the final `2:00 PM SGT` deadline text.
- Manually selecting a different application labels confidence and reasons as the original inference.
- The numeric-prefix fixture cursor behavior remains deferred and was not changed.

## Focused verification

```text
npm test -- src/features/updates/classifyMessage.test.ts src/features/updates/matchApplication.test.ts src/features/updates/runMailScan.test.ts src/features/updates/UpdateInboxPage.test.tsx src/db/applicationRepository.test.ts src/domain/stage.test.ts src/features/application-detail/ApplicationDetailPage.test.tsx src/features/command-center/CommandCenterPage.test.tsx
119 passed (8 files)
```

## Final gate (one complete run)

```text
npm test            24 files, 223 passed
npm run typecheck   passed
npm run build       passed
npm run test:e2e    3 passed
git diff --check    passed
```

## Files changed

- `README.md`, `e2e/update-intelligence.spec.ts`
- `src/db/applicationRepository.ts`, `src/db/applicationRepository.test.ts`, `src/domain/application.ts`, `src/domain/jobUrl.ts`, `src/domain/stage.ts`, `src/domain/stage.test.ts`
- `src/features/application-detail/ApplicationDetailPage.tsx`, `ApplicationDetailPage.test.tsx`, `StageHistory.tsx`
- `src/features/command-center/CommandCenterPage.tsx`, `CommandCenterPage.test.tsx`
- `src/features/updates/UpdateInboxPage.test.tsx`, `UpdateProposalRow.tsx`, `classifyMessage.ts`, `classifyMessage.test.ts`, `matchApplication.ts`, `matchApplication.test.ts`, `runMailScan.test.ts`, `updateRepository.ts`

## Remaining concerns

The build and Playwright web server emit the existing non-blocking warning that the main bundle exceeds 500 kB after minification. Windows also reports its normal LF-to-CRLF checkout warning during diff checks. Neither gate reported an error.

## Corrective residual pass — 2026-09-15

### RED

```text
npm test -- src/features/updates/classifyMessage.test.ts src/features/updates/matchApplication.test.ts src/features/updates/UpdateInboxPage.test.tsx
3 failures: ordinary "You have not been invited" body text auto-advanced the positive subject; arbitrary "— next steps" was a role mismatch; approval/reload lost the original-inference label.
```

The labelled body-title assertions initially passed spuriously because the unrelated dash-suffix defect forced a mismatch. Their fixture was corrected to remove that suffix before production code changed; no separate isolated RED command was captured for that corrected test, so none is claimed.

### Implementation

- `classifyMessage` now recognizes both `not invited` and `not been invited` interview/assessment phrasing as approval-required informational classifications; terminal rejection remains evaluated first.
- `matchApplication` now reads explicit `Role:` and `Job title:` fields, while accepting a dash suffix as title evidence only when it contains a compact role keyword. Genuine analyst/engineer fixtures remain title evidence; `— next steps` does not.
- `UpdateProposalMatch` now stores the original application, confidence, and reasons when approval intentionally selects another application. The row uses that durable field after reload.

### GREEN

```text
npm test -- src/features/updates/classifyMessage.test.ts src/features/updates/matchApplication.test.ts src/features/updates/UpdateInboxPage.test.tsx src/features/updates/runMailScan.test.ts
89 passed (4 files)
```

### Corrective full gate

```text
npm test            24 files, 230 passed
npm run typecheck   passed
npm run build       passed (existing >500 kB chunk warning)
npm run test:e2e    3 passed
git diff --check    passed
```
