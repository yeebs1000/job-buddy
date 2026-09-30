# Lean V1 function pass — 2026-09-24

Private working checkout, not a published release. No installer, new dependency, cloud account, live mailbox scan, or Docker setup was created by this pass.

## Changes

- XLSX imports: both tracker and salary-workbook readers now receive a stored ZIP rebuilt from the exact entries validated under their existing size/expansion limits. Original archive comments and extra records cannot change the downstream interpretation. Macro/link/formula checks remain. Prototype-reserved entry names are rejected explicitly.
- Startup: Overview stays eager; Applications, application details, import, Updates, Discover, Profile and Settings load on demand. Navigation and active-session sync remain outside page loading/error boundaries. A failed page offers reload; navigating elsewhere still works.
- First use: disconnected Gmail shows one optional connection action, not disabled scan controls. Manual tracking/import remain available without connecting Gmail or starting the companion.

## Evidence

- Synthetic adversarial workbook: validator selects `Validated`, raw ExcelJS selects `Unvalidated` from a second workbook hidden in the archive comment. Before the fix, the real tracker reader returned the wrong value; afterwards both readers return the validated value.
- Independent read-only review found no Critical/Important issue for this archive blocker or the scoped lazy-page changes. The reserved-filename edge case found during review has a red-to-green regression.
- Production startup JavaScript graph: **847,897 bytes before route splitting; 535,720 bytes after (36.8% less)**. Current graph gzip total: 165,494 bytes. Count includes all entry-page module preloads, not just the main file. These are payload measurements, not a claimed speed or memory improvement. A browser regression enforces a 700,000-byte raw startup budget and confirms secondary pages load only on navigation.
- Full production browser suite: **26/26 passed**, including slow/failed chunk recovery, synthetic Gmail, tracker import/export, resume parsing, and salary-source review. API access in the new startup checks is blocked deliberately to prove companion-optional behavior. No live email/profile data used.
- Startup screenshots inspected at 390px and 1440px: controls readable, no horizontal page overflow; mobile navigation remains horizontally scrollable.
- Production build/type compilation and public-tree, client-secret and research-source guards passed. Large optional ExcelJS/PDF chunks remain; those libraries are not downloaded on startup.
- Initial full unit run concurrent with browser testing: **769 passed, 5 failed** (102 files), involving route loading and asynchronous UI waits. The three affected suites then passed **35/35** alone. Cold-route assertions now allow on-demand module transformation and isolate routes by test. Final full isolated run: **780/780 tests passed across 102 files**, `npm.cmd test -- --testTimeout=15000 --maxWorkers=1`, exit 0 in 286.71s. Six additional reported cases come from splitting the seven-route loop into individual tests, not six new features. Keep browser and unit gates sequential on this host; the initial failures remain recorded and are not proof that every timing flake is eliminated.

## Application details editing — follow-on batch

- Open an application, choose **Edit details**, then edit the contact/recruiter, notes, follow-up time or deadlines. The inline editor uses native controls and the existing palette, with a one-column mobile layout; no dependency or installer was added.
- Deadline additions, edits, completion and removal remain drafts until **Save details**. **Cancel edits** leaves storage unchanged. Completed deadlines no longer drive the dashboard's next action. Follow-up reminders can be cleared separately.
- Editor dates explicitly use SGT/HKT (UTC+08:00), independent of the device timezone. Unchanged dates retain their original seconds/offset; deadline IDs and meeting links survive edits. Stage events, Gmail evidence and salary research are not rewritten.
- Saves compare both the loaded version and actual details/history inside one database transaction. Conflicting changes keep the draft and offer an explicitly destructive **Discard draft and load latest** action. Storage failures allow retry. Application-ID-keyed page state isolates late callbacks after navigation.
- Test-first checks cover persistence/reload, cancellation, staged removal, failed-save retry, concurrent and same-millisecond edits, newer Gmail history, deleted records, date validation and timezone conversion. The independent reviewer found a navigation race; two reproductions failed before the fix and passed afterwards. Re-review found no remaining scoped findings. Focused unit/integration run: **28/28 passed**.
- Editor screenshots inspected at 390px and 1440px; layout bounds also checked at 768px. The first full browser run passed 26 existing cases but the new case stopped on an exact-label lookup after reload; the captured page contained the correctly saved note. The lookup included the textarea's initial text, so the test now uses its accessible textbox role/name.
- Full isolated unit/integration run after the changes: **794/794 tests across 103 files**, exit 0 in 437.39s. Typecheck, production build, public-tree, client-secret and research-source guards passed. No new runtime dependency or eager startup route was added.
- The next two-worker browser run passed the new editor flow and 25 other cases, but the existing Windows companion/profile reload case timed out after five seconds on “Loading encrypted profile…”. No profile production code or timeouts were changed. The final one-worker full browser run passed **27/27** in 1.4 minutes, including both real Windows companion fixtures and the new editor flow. This earlier timing failure remains part of the verification record; a successful rerun does not prove the timing sensitivity is eliminated.

## Remaining V1 gates before installer work

- Owner feature walkthrough: manual tracker/save/reload, CSV/XLSX round trip, Gmail confirmation/update/outreach approval, profile/resume review/save, extension pairing and guarded autofill, salary sources/conversion/confidence.
- Separate Windows machine and Chrome/Edge acceptance; synthetic automated tests are not that acceptance.
- Google production approval and explicitly consented live-mail acceptance.
- Salary search must have a verified end-user service path without Docker/WSL installation. Local SearXNG runtime and a real synthetic search are still unverified; this pass does not solve provider operations.
- Refresh dependency/security audit, clean-install verification and publication evidence for the final candidate; prior beta.16 results are historical.
- Owner approves the final V1 scope and functional behavior, then installer work begins. No AI/interview preparation, account system, or additional services added to this pass.
