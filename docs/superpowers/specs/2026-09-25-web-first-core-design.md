# Job Buddy: website-first direction and browser-core migration

Date: 2026-09-25
Status: Direction and hosted-Gmail privacy choice approved in conversation; this written browser-core design awaits review.

## Product outcome

Open a website and use a lightweight application tracker. No installer, local server, Docker, API key, or mandatory account for the core dashboard. Gmail is optional; cross-site autofill remains an optional browser extension. Existing applications and profile data must survive the transition through an explicit transfer, not a silent reset.

The latest web-first decision supersedes the earlier bundled-desktop distribution direction. It does not authorize public deployment, paid infrastructure, or migration of real Gmail credentials during development.

## Approved direction and subsystem boundaries

| Subsystem | Target responsibility | Data boundary |
| --- | --- | --- |
| Browser core | Applications, history, deadlines, opportunities, profile, resume parsing, import/export | Saved in this browser; no cloud tracker/profile sync in V1 |
| Hosted Gmail | Google popup connection, encrypted refresh credentials, bounded read-only scans | Transient email processing; no persistent server-side email bodies; reviewed evidence remains browser-local |
| Hosted research | Salary/discovery requests and public-source caching | Send company, role and location, not resume or email contents |
| Optional extension | User-approved filling on application websites | Explicit profile sharing and site permission; never final Submit |

These are separate deliverable slices. This specification implements only browser core and portable transfer. Gmail hosting, research hosting and extension pairing need their own implementation/security designs after this slice; their boundaries are recorded here to prevent incompatible choices.

Alternatives considered: a browser-only Gmail token flow would need more reconnect interaction; an entirely cloud-backed tracker would introduce accounts, synchronization and personal-data storage not needed for the accepted lightweight V1. The chosen design keeps the tracker independent and uses a small hosted service only for integrations.

## Current code and why migration is needed

- `src/db/database.ts` already stores tracker records in Dexie/IndexedDB, including stage events, reviewed mail, research and saved views.
- `src/features/profile/profileClient.ts` exposes a small get/replace/delete contract, but calls `/api/profile`; its server implementation depends on Windows DPAPI.
- Resume extraction and the profile editor already run in the browser and should be reused.
- CSV/XLSX export in `src/features/import-export/exportTracker.ts` is a spreadsheet view, not a lossless workspace backup. It flattens history and does not transfer the full profile or inbox state.
- A different website origin cannot read localhost IndexedDB. The hosted website must not attempt to discover or contact a user's local companion automatically.
- The companion is currently single-user. Exposing it publicly is not a hosting implementation.

## Slice 1: browser core

### 1. Explicit runtime mode, not automatic fallback

Add explicit `companion` and `web` build modes. Preserve the existing companion default during migration; add a documented web build/preview command. The eventual public build explicitly selects web mode.

Reuse `ProfileClient` with a browser implementation selected at composition time. Never turn a failed companion request into an empty browser profile. Existing local users retain their DPAPI profile and extension workflow until they deliberately transfer.

In web mode, applications, profile editing, resume parsing and spreadsheet import/export work with all `/api/*` requests blocked. Integration panels show an honest unavailable/not-configured state while their hosted implementations are absent; they do not tell end users to run npm, Docker or a local server. A failure of an optional integration must not prevent loading or editing the tracker.

### 2. Profile persistence and protection

Use the existing profile schema for all reads and writes. Add typed IndexedDB stores for the encrypted profile record and its browser-held, non-extractable Web Crypto key. Use AES-GCM with a fresh random nonce per write and a versioned authenticated envelope. Keep the key/profile stores inside the same Dexie database so restoration can commit atomically with tracker data. Encrypt before entering the database transaction; never wait on cryptography inside an active IndexedDB transaction.

No daily password prompt and no profile upload. This is browser-local protection, **not equivalent to Windows DPAPI, a password-protected vault, or protection against malicious same-origin JavaScript**. A person using the unlocked browser can open the profile. The tracker itself remains in its existing readable IndexedDB representation. UI and privacy text must describe these limits without claiming that all browser data is encrypted.

If the key is missing, decryption fails, storage is unavailable, or a write fails: keep existing data and report the error. Recovery guidance may offer restoring a backup into a separate fresh workspace; it must not overwrite the damaged workspace. Do not silently create an empty profile or fall back to plaintext. Profile deletion removes its ciphertext and key, not applications or Gmail evidence. A subsequent new profile gets a new key.

Resume files are parsed locally and not retained as original files by this slice. Keep review-before-save behavior. Request persistent browser storage only from a user action; refusal must not break saving. Clearly warn that clearing site data can remove the workspace and recommend backup.

### 3. Portable workspace backup

Add a separate **Back up workspace** action; leave CSV/XLSX export unchanged. Produce a versioned, passphrase-encrypted `.jobbuddy` file entirely in the browser. Use native Web Crypto authenticated encryption and a salted password-based key derivation; the implementation plan must pin and test its parameters and reject arbitrary imported work factors. No additional crypto dependency, server upload or saved passphrase. Explain that a lost backup passphrase cannot be recovered.

The payload includes:

- Applications, stage events, deadline records, research observations/estimates and role aliases.
- Saved views, update proposals (including locally retained evidence), processed-message deduplication records and activity history.
- The normalized candidate profile, if present. In companion mode, read it only after the user chooses export; unavailable profile must produce an explicit choice to retry or export tracker-only, never a silent omission.
- Allowlisted browser preferences, discovery shortlist/last board and saved web-salary results.

Exclude Google tokens, OAuth receipts/state, extension credentials, browser encryption keys, scan continuation tokens/cursors, temporary locks, demo migration backups and original resume files. Do not dump arbitrary metadata or placeholder tables. Export must fail with an explanation if unsupported non-empty user-data stores would otherwise be dropped. Include a manifest with counts, format version, export time and whether a profile is included.

Reset transferred Gmail state to disconnected, approval-required and automatic scanning off. The user reconnects deliberately. Imported evidence is historical data, never authority to access an account. Before later Gmail reconnection reuses deduplication records, the Gmail slice must bind those records to a verified mailbox identity; unverified legacy records cannot suppress another mailbox's scan.

### 4. Safe restore and localhost-to-website transfer

Both modes can export; restoration in this slice is web-mode only. The local app exports; the user opens the website and selects the file. The website never fetches localhost data. Keep the source workspace and source DPAPI vault untouched.

For the first version, restoration is supported only into a fresh workspace. Do not add merge logic or replacement/deletion of a populated workspace. If the destination contains user records, stop and explain how to use a separate browser profile or back up the destination first; do not clear it automatically.

Read at most 50 MiB and 100,000 total records. Validate the encrypted envelope before password derivation, authenticate before parsing the payload, then validate versions, record shapes, counts, unique IDs, references, dates and safe links. Reject unsupported versions, malformed/inconsistent records, dangerous object keys and oversize content before writing. Do not fetch imported links or execute imported markup.

Show a preview of record counts and profile inclusion, with an explicit Restore action. Prepare encryption under a new destination profile key before the write transaction. Recheck destination emptiness inside one transaction, restore all allowed records and profile/key together, and roll back everything on any failure. Concurrent writes must cause a safe refusal rather than replacement. A wrong passphrase, damaged file or aborted import leaves the destination unchanged.

### 5. Minimal interface changes

Keep the existing dashboard, palette and editor. Add a small Data and backup section in Settings with Backup and Restore. Update mode-specific storage descriptions. Do not add an onboarding wizard, account wall, new dashboard framework, service worker, install prompt or animation library.

Lazy-load backup/restore and resume parsing outside the initial dashboard bundle. Preserve the existing startup budget and make no offline-installability promise: this slice means the loaded core works without a companion/API, not that the website can cold-start without network access.

## Hosted integration constraints for the later slices

Hosted Gmail uses a maintainer-owned web OAuth client and popup authorization-code flow. Authenticate the hosted session, bind OAuth to that session, enforce CSRF/origin checks, use secure cookies, isolate each user's encrypted credentials, and provide disconnect/revocation/deletion. Never reuse the local companion's single-user token store or accept client-supplied user IDs as authorization. Google verification and applicable restricted-scope requirements remain public-launch gates. Persistent connection does not imply background scanning: V1 scans are user-triggered or active-session checks.

Keep email bodies out of persistent logs, queues, traces, caches and exception reports. Bounded scan results return only the evidence needed by the browser's existing review workflow. Retain approval safeguards and distinguish outreach from actual applications. Connection/authentication failure must not erase locally reviewed tracker records.

Hosted SearXNG is private infrastructure behind a bounded, rate-limited public research API; users do not run it. Preserve source citations, range methodology and uncertainty. Optional extension pairing needs an authenticated, origin-checked browser profile bridge; it cannot depend on a localhost service in the web product. Neither integration is claimed ready by completing Slice 1.

## Acceptance evidence for Slice 1

1. Web-mode core works from a static preview with `/api/*` blocked and no companion process: create/edit applications, parse a synthetic resume, save/reload/delete profile and export a spreadsheet.
2. Unit tests cover profile schema failures, missing/wrong key, ciphertext tampering, quota/write failure and deletion scope. No silent plaintext or empty-profile fallback.
3. Synthetic full-workspace export/restore round-trip preserves IDs, history, deadlines, opportunities, reviewed evidence, research, preferences and profile; excludes every credential/temporary-state class listed above.
4. Tests reject wrong passwords, malformed/oversize/unsupported backups, dangling references, duplicate IDs, unsafe links, invalid records and unsupported non-empty stores without writes.
5. Browser tests use separate source and destination origins, show the restore preview, preserve the source, and prove reload persistence. Test occupied/concurrently modified destinations and transaction rollback.
6. Network assertions prove no profile, resume or backup data is transmitted. Inspect production assets for secrets and preserve the startup budget.
7. Companion-mode regression tests retain existing profile, Gmail and extension contracts. Run unit and browser suites sequentially to avoid the known host-contention timing issue.

No real inbox access, real profile transfer, public deployment or provider purchase is part of these tests. Use synthetic fixtures.

## Review and release boundary

Self-review: scope is limited to a browser profile adapter, explicit mode selection and safe transfer; later hosted integrations are not implicitly included. The browser-key security tradeoff and fresh-destination-only restore are explicit review points. Existing uncommitted feature work is preserved.

After written-spec review, write the Slice 1 implementation plan and implement with tests. Completion of this slice is a web-core development milestone, not a public-launch claim. Public launch still requires hosted integration delivery, security/privacy verification, Google configuration/approval as applicable and a real user acceptance pass.

## Primary technical references

- [Google authorization-code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model): popup flow with server-side token exchange and secure token handling.
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API): browser primitives and warnings about key management; using the API alone does not establish security.
- [Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy): origin isolation underlying explicit migration.
