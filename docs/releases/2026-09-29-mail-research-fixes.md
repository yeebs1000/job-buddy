# Email and research fixes — 29 September 2026

## Changes

- Recognize the Morgan Stanley-style acknowledgment of submitted application details as Applied, requiring approval. A future review promise is not a Review-stage event.
- Do not count “pre-interview assessment” as a separate interview. Relative reminder deadlines are not guessed.
- Prefill employer/title from confirmation subjects, body role statements, and explicit employer signatures. Extract explicit Singapore/Hong Kong role-location suffixes and clear finance/software disciplines. Unknown fields remain editable and blank; forwarding senders and ATS domains are not used as employers.
- Reuse the existing bounded “Recheck recent emails” recovery. Existing proposals and reviewed decisions are retained, not reset. Recovery requires the user to run that action; this patch did not scan the live mailbox.
- Use one dashboard research search control. Distinguish an already-running local search from request throttling or monthly allowance exhaustion.
- Show detected salary ranges above source details, explicitly unverified and not blended. Clearly report results without usable pay figures. Source review is still required before persisting an estimate.
- Fix stretched salary/rating review checkboxes in the inline dashboard.

## Verification

- Targeted classifier, recovery, prefill, search service and dashboard checks: 143 passed.
- Full unit run: 866 passed, 4 failed (870 tests / 118 files). The following UI waits failed while browser tests were also running:
  - ApplicationDetailPage: `requires explicit terminal confirmation, retains the reached stage and restores it on undo`.
  - ApplicationsPage: `opens the new query form and persists a research-free application and initial event`.
  - ApplicationsPage: `rolls back bulk stage changes when selection contains a terminal application`.
  - UpdateInboxPage: `shows source evidence and atomically applies edited stage and deadline, then displays them after remount`.
- All three affected files passed a subsequent serial rerun: 54 tests passed. This is not a claim that the original full run was green.
- Final browser run: all 6 selected tests passed (mail entry using the Morgan Stanley wording without field retyping, recheck preservation, Tavily settings, rating persistence, empty workspace, salary review/save/reload). Desktop/mobile checks included. Earlier checkbox-width failure was reproduced and fixed.
- Typecheck and production build passed. Build retains an existing warning about chunks larger than 500 kB.
- Client-secret and research-source checks passed.
- Dashboard and companion HTTP health checks returned 200.
- Independent focused read-only review: no actionable findings.

## Boundaries

No live Gmail records were modified during testing, no paid research calls were made, and no AI provider was connected. Tests use controlled email/search responses. Live forwarding/delivery and real provider behavior still need user testing.

This is a bounded local-rules improvement, not general semantic extraction or autonomous research synthesis. Search results with no salary evidence still cannot produce a defensible estimate. Cloud email interpretation remains a separate privacy decision. No commit, push, public release, or installer was created.
