# Release hardening — 30 September 2026

Private working checkout based on `c716230`, with existing uncommitted work preserved. Windows, Node 24.19.0, npm 11.17.0. No publication, installer, new dependency, live-mail scan, credential migration, or paid provider call was performed.

## Changes

- Pairing retries now replace the previous error with progress feedback and disable duplicate submissions, including after collapsing/reopening Buddy. Token, origin, approval and no-submit checks are unchanged.
- The installed-extension test waits for the browser to receive the profile response after pairing, not just for the server to finish writing the pairing response. Failed runs retain sanitized HTTP/browser phase diagnostics: paths, status codes and timing, never credentials or profile values.
- Gmail browser assertions select the expected status message instead of matching unrelated research-loading statuses.
- Bulk priority, stage, tag and archive workflows have separate tests, checking both selected records and untouched records. Persistence tests paste text through user input events instead of generating unnecessary keystrokes. Keyboard-specific coverage remains.
- Unit and dashboard browser suites default to one worker. Five-second unit limits and existing browser assertions are retained; suites run sequentially to reduce host contention.
- SECURITY.md now agrees with the verified XLSX fix and distinguishes companion DPAPI protection from browser-core storage. The historical launch-checklist row no longer describes that archive issue as still open.

## Verification

| Check | Result |
| --- | --- |
| Full unit/integration suite, final full run | 881/881 tests, 118 files passed, 348.56 seconds |
| Extension panel/runtime after test-typing correction | 23/23 passed |
| Production build, including TypeScript compilation | Passed |
| Extension build | Passed |
| Dashboard browser suite | 30/30 passed, 1.4 minutes |
| Extension browser suite | 5/5 passed, including installed Edge pairing/restart/revocation and guarded fill |
| Installed pairing lifecycle, additional consecutive repeats | 3/3 passed, 23.4 / 27.0 / 23.5 seconds |
| `check:web` | Passed: companion-free browser-core test, build, client-secret and research-source guards |
| Public-tree, client-secret and research-source guards for companion artifacts | Passed |
| Production dependency audit at high threshold | Exit 0; two moderate ExcelJS/uuid findings, no high/critical findings reported |
| Whitespace/error-marker diff check | Passed |

The standard `check` invocation passed all 881 unit tests and the public-tree guard, then stopped because the new extension test used DOM matcher types absent from its TypeScript configuration. Those assertions were replaced with equivalent native element checks; the 23 affected panel/runtime tests and the production TypeScript build then passed. The remaining checks above were run individually. This is not a claim that one uninterrupted `npm run check` invocation exited zero after the final test-only correction.

## Failures retained in the record

- An initial two-worker run passed 872/881: eight UI timeouts plus the deliberately failing new pairing-progress regression. Timeouts affected ApplicationsPage search, inline edits, bulk priority and creation; ApplicationDetailPage editing, cancellation and navigation; and ProfilePage address saving.
- The first serial rerun passed 880/881, leaving the detail edit-and-reload case at the five-second limit. Its unnecessary per-character input was replaced with paste input before the final full green run.
- Earlier installed Edge runs intermittently failed the five-second post-pair UI check, and some timed out later during filling/teardown. Diagnostics showed successful pairing/preferences/profile responses; browser receipt/processing was delayed despite millisecond server responses. Low available memory was observed. One early clean pass did not justify closing the issue. The rebuilt final extension passed the complete suite and three further lifecycle repeats; that does not prove timing stability on every machine.
- Build warnings remain for the optional large ExcelJS/PDF assets. Startup-budget browser coverage passed. Earlier failing unit runs emitted React `act` warnings; no warning-suppression change was made.
- The audit's proposed forced fix would downgrade ExcelJS across a breaking version boundary; it was not applied. The two moderate findings remain disclosed.

## Public launch remains blocked

This closes the scoped pairing feedback, test reliability and documentation work, not the whole launch:

1. The owner subsequently changed the release direction to downloadable Windows/macOS apps with local services, superseding hosted Gmail/research work. Mac secure storage and native acceptance remain unfinished; packaging follows feature acceptance. The browser-core preview is not a replacement for the Gmail-first dashboard. See [current roadmap](../../ROADMAP.md).
2. Google configuration/approval and consented live-mail acceptance remain external gates. Synthetic mail tests do not verify real forwarding, delivery or public OAuth access.
3. Separate-machine/browser acceptance, owner review, private vulnerability-reporting availability, a fresh full Gitleaks scan, clean-install verification of the final candidate and explicit publication authorization remain outstanding. The public-tree guard is not a substitute for a comprehensive secrets audit.

No user tracker/profile data was reset. Reload the unpacked extension and the job-site page to load the rebuilt pairing UI. Existing paired users do not need to revoke/re-pair solely for this update.
