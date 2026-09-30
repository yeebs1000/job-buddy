# V1 private beta 9 — Gmail scan recovery and profile save feedback

- A connected user can set the daily scan preference before the first scan completes. Automatic checks still wait for a successful initial scan; the checkbox explains this prerequisite. Manual first-scan retries preserve the user's daily-scan choice.
- The dashboard explicitly offers **Scan last 90 days** after an unsuccessful first sync, supplies the required confirmation, and records successful initial sync so daily checks can begin if enabled.
- Gmail message reads are sequential and paced. Quota responses (403 rateLimitExceeded/userRateLimitExceeded and 429) and server errors receive bounded exponential retries with jitter. Long Retry-After windows are left for a later manual retry. Overlapping scans are rejected; failed scans do not advance the cursor.
- Only allowlisted error codes and recovery instructions reach the UI or scan metadata; raw Google error content is discarded. The scan UI explains that the first scan can take several minutes.
- Profile save feedback is next to Save in the sticky action area. Editing clears stale feedback; invalid drafts name the affected fields and focus the first matching control. Imports remain drafts until explicitly saved.
- Failed profile loading blocks editing, import and replacement until a successful retry restores the existing profile. Changing scan mode preserves the latest first-sync completion flag.
- Browser coverage exercises resume import, real companion HTTP, Windows DPAPI persistence and reload using a temporary vault, never the user's saved profile.

Rate-limit handling follows [Google's Gmail error guidance](https://developers.google.com/workspace/gmail/api/guides/handle-errors). Pacing cannot guarantee success if project quotas, permissions, or network connectivity prevent access. No quota increases, cloud settings, external submissions, or public release are performed by this update.

## Verification

- Full check: 572 unit/integration tests, typecheck, web/extension builds, client-secret/source-policy checks, 18 dashboard browser tests and 2 extension browser tests passed.
- Read-only live Gmail diagnostic: 502 provider calls, 500 normalized messages, zero ignored messages, bounded initial scan marked truncated. This diagnostic does not write browser tracker data or its last-success timestamp.
- Real Windows-encrypted profile save/reload verified in isolated temporary companion vaults on both loopback hostnames. User profile was not replaced by these tests.
