# V1 private beta 10 — Resumable Gmail scans

- Gmail scans save batches of 25 messages instead of waiting for all 500 messages before saving anything. A visible counter reports checked messages, not job applications found.
- Completed batches and their continuation checkpoint commit together in browser storage. The final Gmail history cursor and last-success timestamp advance only when the whole scan completes.
- Temporary network failures and timeouts receive two automatic retries. Existing bounded quota/server-error retries remain. Failed scans distinguish Google timeouts, Google connectivity, invalid data, local-companion connectivity, and browser storage failures without exposing raw provider errors.
- **Resume Gmail scan** continues after a failure or page reload. The companion keeps a resumable session in memory for up to 30 minutes; restarting it, changing the connection, or expiry requires restarting the scan. Previously saved messages are deduplicated. This is not background scanning or indefinite offline resume.
- Deleted messages are skipped without incorrectly treating their 404 response as an expired history cursor. Connection changes invalidate in-flight results. Competing browser scans cannot overwrite a newer scan's checkpoint.
- Initial scan remains capped at 500 matching inbox messages from the last 90 days. Existing approval and autofill safety boundaries are unchanged. No Gmail messages are modified, and nothing is published by this update.

## Verification

- Full `npm.cmd run check` passed: 600 unit/integration tests, typecheck, web and extension builds, client-secret/source-policy checks, 19 dashboard browser tests, and 2 extension browser tests.
- Read-only live Gmail scan through the companion and a real isolated browser: 502 provider calls, 500 messages across 20 batches, visible completion, and a persisted successful scan timestamp. This test did not change the user's existing browser tracker or profile.
- Browser regression coverage interrupts a batch, reloads the page, resumes the persisted checkpoint, and checks that evidence is not duplicated. Unit regressions cover account-reset races, checkpoint expiry, deleted messages, fresh incremental scans after a larger initial scan, and storage failure reporting when metadata cannot be written.
- Independent scoped review findings were resolved and rechecked. Existing bundle-size warnings remain; they do not block these checks. No commit, push, or public release was performed.
