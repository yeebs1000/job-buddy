# V1 private beta.17 — email-to-tracker review

## Changes

- Recognize Workday-style application confirmations as Applied suggestions, including forwarded subjects. Every confirmation requires review; no application is created automatically.
- Unmatched recruiting emails offer **Create application & review**. Confirm employer, role, market, city, discipline and applied date, then separately approve the proposed stage/outcome. Until approval, the new entry has no stage.
- Show an explanation beside disabled approval controls. Existing conflict, closed-application, terminal-outcome and stale-edit safeguards remain in place.
- Recruiter outreach offers **Save to Command Center**, stored as **Opportunities — not applied** with optional employer and unrestricted location text. It does not inflate application or stage counts. Removing an opportunity returns its email to deferred review without deleting evidence.
- Creation and email linking are atomic. Same-email repeats are blocked; duplicate checks compare active employer/role/location/date, allowing genuinely distinct applications.

## Recover a missed confirmation

Refresh Job Buddy, open **Overview → Missing an older email? → Recheck recent emails**, then review the recovered email under **Updates**. Previously reviewed proposals are preserved. Ordinary incremental scans do not reconsider already processed, ignored messages.

The existing Gmail limit still applies: up to 500 inbox messages from the last 90 days, excluding Promotions and Social. This cannot recover messages absent from the connected Gmail inbox, outside that window or beyond the scan limit. A screenshot from another mailbox does not establish delivery to Gmail.

## Verification and boundaries

Regression coverage uses synthetic messages, fake Gmail responses and isolated browser storage. It covers receipt classification, negative/non-employment evidence, rechecks, duplicate prevention, rollback, separate approval and saved opportunity persistence. Mobile and desktop browser screenshots are local test artifacts.

Local verification on 2026-09-19: 736 unit tests across 96 files; 22 dashboard browser tests; five extension browser tests; TypeScript, application/extension builds, public-tree, client-secret and research-source guards passed. The final classifier refinement was followed by the complete unit suite and a repeat of the two receipt/recheck browser tests. Dashboard tests used isolated port 4175 because another process occupied the default test port; the temporary port override was removed afterward. No live-mail acceptance run or public deployment occurred.

The UI follows the existing inline review design, with labelled inputs, explanatory approval text and opportunities separate from application progress. No AI service, remote processing, mailbox mutation, automatic application submission or external publication was added.

This change does not resolve the existing XLSX parser-consistency publication blocker or the external OAuth and owner-acceptance gates documented in [beta.16](v1-beta-16.md). Tracker exports cover applications; saved opportunity/email evidence remains in local mail-review storage and is not an application export.
