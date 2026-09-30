# Web-core verification — 2026-09-25

Scope: the approved web-first **browser-core slice**, not public launch. Implemented inline in the existing checkout; unrelated uncommitted work was preserved. No real mailbox, profile or tracker was transferred. No installer, hosting, purchase, push or deployment was performed.

## Post-preview correction: preserve the Gmail-first product

After user testing on 2026-09-25, the Gmail-enabled dashboard was restored as the normal local experience at port 5173. Port 5174 is only an isolated browser-core engineering preview, not a replacement for Gmail. The existing companion status reported `connected`; no credentials were reset, and no workspace was cleared or migrated. The empty connected dashboard now places scan/review before manual entry/import; the populated dashboard also treats manual actions as secondary. Keep this working path until hosted Gmail reaches parity.

Fresh correction checks: 20 focused unit tests passed (CommandCenterPage, web capabilities and App); typecheck passed; 11 browser tests passed covering empty-inbox scan/review, popup/revocation handling, scan continuation, forwarded mail, email-to-tracker approval and startup. A synthetic mobile screenshot was inspected. Browser tests used fake mail, not a fresh scan of the user's live inbox. The Impeccable product hierarchy guidance was applied without changing the existing palette or adding a design system.

## Delivered

- Explicit static `--mode web` build with no companion proxy; existing companion default retained.
- Browser-local AES-GCM encrypted profile, non-extractable browser key, strict validation, atomic writes/deletion and concurrent-write refusal. Tracker tables remain readable IndexedDB. Same-origin scripts or an unlocked browser can access the profile; this is not a password vault.
- Lazy Settings backup/export and preview/restore. Portable files use AES-GCM-256 and fixed PBKDF2-SHA256 (600,000 iterations), fresh salt/nonce and authenticated version context. Lost passwords cannot be recovered.
- Typed, allowlisted workspace snapshot with manifest, limits, reference checks and atomic fresh-workspace restore. Credentials, scan cursors, browser keys and original resume files are excluded. Unsupported populated legacy stores fail export rather than disappear.
- Honest web capability notices: hosted Gmail, search/FX and extension pairing are not available yet. Saved evidence and core records remain accessible.

## Review corrections

Independent read-only review identified and regression tests reproduced three issues. Web default views are now virtual, so merely visiting Applications does not block restore. Legacy object-form saved-view sorting is preserved. Existing credential-free HTTP application job links remain portable, matching the tracker importer; other URL-bearing backup fields remain HTTPS-only. No imported URL is fetched or rewritten.

The first full unit run passed 822 of 823 tests. Its sole failure was a stale migration test expecting database version 2 instead of the additive version 3. Updated assertions check the new version, empty new stores and preservation of legacy application research. Final rerun results are recorded below.

## Verification results

| Command / check | Result |
| --- | --- |
| `npm.cmd test -- --maxWorkers=1 --testTimeout=15000` | 110 files, 827 tests passed; 314.63 s |
| `npm.cmd test -- src/features/profile/browserProfileClient.test.ts --maxWorkers=1` | 7 passed after strengthening the fresh-key assertion |
| `npm.cmd run check:web` | TypeScript + static web build, one comprehensive two-origin browser test (22.0 s), client secret and research-source guards passed |
| `npm.cmd run test:e2e -- --workers=1` | TypeScript + companion build, 27 browser tests passed (1.5 min) |
| `npm.cmd run build:extension` | Passed |
| `npm.cmd run test:e2e:extension` | 5 passed (18.7 s), including installed Edge extension pairing with isolated companion and approved fill |
| `npm.cmd run verify:public-tree` | Passed, including reachable history |
| `node --env-file-if-exists=.env.local scripts/verify-client-secrets.mjs dist dist-web dist-extension` | Passed |
| `node scripts/verify-research-sources.mjs dist dist-web dist-extension` | Passed |
| `git diff --check` | Passed (Windows line-ending warnings only) |

Web acceptance enforces an initial JavaScript payload below 700,000 uncompressed bytes; it passed. An earlier measurement in this session was 541,177 bytes before the final compatibility/copy adjustments. The test blocks all `/api/*` calls and rejects non-GET or off-origin network requests. Screenshots at 390 px and 1440 px were inspected: controls fit, with no horizontal document overflow. Impeccable guidance kept the existing palette and native form controls rather than introducing a new design system.

Companion tests emitted expected loopback connection-refused messages for unmocked optional services while the standalone companion was absent; all assertions passed. Dedicated real-companion tests use isolated synthetic service state. These results do not verify a live Google account. Existing large lazy-chunk build warnings remain.

## Acceptance boundaries

- Browser tests use synthetic fixtures at separate 127.0.0.1 origins, never the user's running workspace. They exercise resume text extraction, profile save/reload/delete, application creation/editing, CSV download, encrypted transfer, wrong password, preview, occupied-destination refusal, source preservation and mobile/desktop widths.
- Unit tests exercise corrupted/missing-key profiles, failed transactions, concurrent writes, invalid backup records, unsupported stores and a multi-megabyte encrypted round trip. A positive fixture covers all ten supported table types plus outreach, shortlist and saved research metadata.
- Backup limits are 50 MiB encoded file / 100,000 top-level records, with nested-schema limits. Unsupported legacy data can still require remediation before export; this release does not silently discard it.
- No live Google OAuth, real-mail classification, hosted authentication, multi-user isolation or hosted search was tested in this slice. Those remain later implementation and launch gates.
- Chromium was tested; cross-browser acceptance and a real user transfer remain outstanding. A static deployment needs HTTPS and SPA route fallback. There is no service worker or offline cold-start guarantee.
- The existing ExcelJS/PDF lazy chunks remain large; they are not part of the initial dashboard load. No new runtime dependency was added.
