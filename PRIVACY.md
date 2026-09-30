# Privacy and local data flow

Job Buddy v1 beta is a single-user, local-first application. It has no Job Buddy account, hosted database, telemetry service, remote profile processor, AI provider, or unattended submission service.

## Browser-only development mode

The explicit `web` build stores the tracker and candidate profile in this website origin's IndexedDB, with no companion or account required. Resume parsing and backup/restore happen in the browser. No profile, resume or backup is uploaded. The profile is encrypted using AES-GCM with a non-extractable key kept in the same browser. This is **not equivalent to Windows DPAPI or a password-locked vault**: same-origin scripts and anyone using the unlocked browser can access it. Tracker records and locally retained email evidence are not encrypted at rest by this change.

Clearing site data removes the workspace and profile key. Persistence permission can reduce automatic browser eviction, but does not protect against user deletion. There is no cloud recovery or cross-device synchronization. **Delete local profile** deletes only the web profile and its key; it does not delete tracker/email evidence.

The `.jobbuddy` backup is encrypted with a user-supplied passphrase, PBKDF2-SHA256 (600,000 iterations, random salt) and AES-GCM (random nonce). The passphrase is not saved. It includes normalized profile fields, tracker history, local mail evidence and supported research/settings; treat it as sensitive. It excludes Google/extension credentials, browser keys, original resumes, scan cursors/continuations and demo recovery metadata. A missing companion profile is never silently omitted: a tracker-only export requires an explicit choice. Browser restoration works only into an empty workspace, resets scan automation to approval/off and never deletes the source workspace. Exported copies remain wherever the user stores them after local deletion.

Hosted Gmail/search and web-extension pairing are **not implemented in this web build**. As of 2026-09-30, the release direction is downloadable Windows/macOS apps with local services, not a hosted backend. The earlier hosted-Gmail proposal is superseded; no hosted credential processing is being activated. macOS secure storage is planned, not implemented. The table below describes existing **Windows companion mode**, not the browser-only preview or a completed Mac build.

## What moves where

| Data | Destination | Purpose and retention |
| --- | --- | --- |
| Applications, events, deadlines, saved views, shortlist, salary evidence/snapshots, normalized mail evidence and scan state | This browser profile's IndexedDB | Local tracker and review history; remains until browser storage is cleared or records are removed in the UI where supported |
| Imported CSV/XLSX or resume | Parsed locally in the browser | Only reviewed tracker/profile fields are saved; the source file is not uploaded by Job Buddy |
| Candidate profile | `%LOCALAPPDATA%\JobBuddy` on Windows, encrypted with current-user DPAPI | Browser Buddy factual answers; deleted by **Delete local profile** |
| Gmail refresh token and optional desktop-client secret | `%LOCALAPPDATA%\JobBuddy`, encrypted with current-user DPAPI | Read-only Gmail access; disconnect attempts provider revocation and removes local connection secrets/metadata |
| Gmail message data | Google Gmail API to the loopback companion; bounded normalized evidence then enters IndexedDB | Update suggestions only; the browser does not receive the refresh token or raw provider error detail |
| Browser Buddy profile answers | Loopback companion to the paired extension, then the current permitted HTTPS origin | User-approved or safe empty-field filling; no remote Job Buddy server |
| Official salary, CPI, FX and user-selected Greenhouse/Lever board data | Allowlisted public sources to the loopback companion | Local research/discovery caches and attributed results; no candidate profile or Gmail data is sent to these sources |
| Explicit research query (company, role, location and salary/employee-rating purpose) | Local companion to Tavily's fixed HTTPS search endpoint | User-triggered basic searches only; Tavily receives the query and network IP under its own terms. No profile, resume or email body is included. No generated answer or raw-page extraction is requested. Results are cached in memory up to 24 hours; reviewed evidence stays in IndexedDB. |
| Tavily API key | Windows DPAPI-encrypted file under the current user's local JobBuddy secrets folder; decrypted only in companion memory and sent to Tavily for authentication | Never returned by the status API, included in logs, browser storage, tracker exports, extension builds or encrypted workspace backups. Replace/remove through Settings. Removing it also invalidates the search cache and in-flight results; saved research remains. |
| Tavily request budget | Local companion research folder | Durable UTC-month counter reserves before an uncached request; requests that fail can still count. Maximum 1,000 per installation per month, independent of Tavily account billing or other apps. No query text or key in the ledger. |

The companion binds to `127.0.0.1`. The extension stores its bearer token in extension-local storage and requests access to one HTTPS job-site origin at a time. Anyone who can use the same unlocked Windows account or browser profile may be able to read local data; this is not a hardened multi-user vault.

## Gmail, autofill, and third parties

Gmail access is optional and uses the read-only scope. Google receives the normal OAuth and Gmail API requests. Disconnecting preserves approved tracker changes and normalized evidence so history is not silently rewritten.

Browser Buddy never selects files, enters passwords or one-time codes, fills demographic/legal/signature fields, solves CAPTCHA, or clicks final Submit. Existing answers and sensitive fields require individual approval. A job site receives a value only when Buddy fills its page at the user's direction; its own privacy policy then applies.

## Export and deletion limits

Web salary evidence is local research, not part of standard tracker exports. Untouched demos and simulated proposals are soft-hidden during the live-workspace migration; originals and a sample-row recovery record remain in IndexedDB until browser data is cleared. Edited/uncertain older samples remain labelled for review. No real mail or candidate profile is deleted by this migration.

CSV/XLSX tracker export is a portable snapshot of standard application fields, not a full backup. It omits lifecycle history, event notes/evidence, internal IDs, saved views, Gmail state, candidate profile, extension pairing, and discovery shortlists. Importing an export cannot reconstruct those omitted records.

Deletion is intentionally separated:

- Delete the candidate profile on **Profile**.
- Disconnect Gmail on **Settings** to attempt Google revocation and remove local protected connection state; use the Google Account permissions page if provider-side revocation is still needed.
- Revoke Browser Buddy pairing on **Settings**, and remove site permissions or the extension in Chrome/Edge if desired.
- Clear metadata-only Buddy activity and process/delete pending captures separately.
- Clear the Job Buddy site's browser storage/IndexedDB to remove tracker, evidence, settings and shortlist data from that browser profile.
- Delete `%LOCALAPPDATA%\JobBuddy` only after Job Buddy is stopped if you intend to remove all companion files.

These actions do not erase values already filled into, saved by, or submitted to a third-party application site. Use that site's controls or contact its operator. Deletion also cannot recall copies the user exported or placed elsewhere.

## Safe diagnostics

Do not post resumes, real trackers, private emails, OAuth values, tokens, cookies, candidate-profile data, or third-party form answers in issues, pull requests, fixtures, screenshots, or logs. Use minimal synthetic reproductions. Report security issues privately according to [SECURITY.md](SECURITY.md).
