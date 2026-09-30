# Web-first Core Implementation Plan

> Historical plan. The 2026-09-30 Windows/macOS download direction supersedes hosted-distribution work; see [current roadmap](../../../ROADMAP.md). Retain the browser-core preview, but do not implement hosted Gmail/research from this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. User selected inline execution and the current checkout. Steps use checkbox syntax for tracking.

**Goal:** Make the core tracker/profile usable without a companion, with a safe encrypted transfer from the current local application.

**Architecture:** Keep Dexie tracker storage and the ProfileClient contract. Select companion or web explicitly; web stores an encrypted profile using a browser-held key. A separate lazy-loaded backup module validates and transfers a complete allowlisted snapshot, never credentials.

**Tech Stack:** Existing React, TypeScript, Dexie, Zod, native Web Crypto, Vitest and Playwright; no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-web-first-core-design.md` (approved 2026-09-25).

## Global constraints

- Preserve the existing companion default during migration.
- No daily password prompt and no profile upload.
- No silent plaintext or empty-profile fallback after a failed read.
- The tracker itself remains in its existing readable IndexedDB representation.
- Restoration is supported only into a fresh workspace, in web mode.
- Read at most 50 MiB and 100,000 total records.
- No real inbox access, real profile transfer, public deployment or provider purchase.
- Preserve existing uncommitted work. Do not commit unrelated dirty files; keep overlapping edits uncommitted until an isolated patch can be reviewed.
- Unit/browser suites run sequentially, with one worker on this host.

## File boundaries

- `src/app/runtimeMode.ts`: validated build selection, no network probing.
- `src/features/profile/browserProfileClient.ts`: browser ProfileClient and profile encryption helpers; optimistic read/write guard around asynchronous encryption.
- `src/db/database.ts`: additive profile/key stores, without changes to existing records.
- `src/features/profile/profileClient.ts`: retain companion client, select browser client at the boundary.
- Existing profile/settings/dashboard/research/discovery pages: mode-specific capabilities and accurate storage descriptions.
- `src/features/backup/backupCrypto.ts`: bounded encrypted file envelope, independent of Dexie/UI.
- `src/features/backup/workspaceSchema.ts`: runtime validation of portable records and references.
- `src/features/backup/workspaceBackup.ts`: consistent snapshot, metadata allowlist, explicit optional companion profile and atomic restore.
- `src/features/backup/BackupControls.tsx`: lazy Settings export/preview/restore, password and storage-persistence feedback.
- `e2e/web-core.spec.ts`, `playwright.web.config.ts`: static web-mode browser acceptance, including two-origin transfer.

## Task 1: Browser profile persistence

**Interfaces:** consume CandidateProfile/ProfileClient. Produce `browserProfileClient: ProfileClient`, `prepareBrowserProfile(profile): Promise<{record: BrowserProfileRecord; key: BrowserProfileKey}>` for restore. Database records are `{id: "candidate", version: 1, revision: string, iv: Uint8Array, ciphertext: ArrayBuffer}` and `{id: "candidate", key: CryptoKey}`.

- [x] Write tests in `browserProfileClient.test.ts` with fake-indexeddb and real Node Web Crypto. Catch plaintext persistence, wrong/missing key, corruption, invalid input, failed transaction and deletion scope.

```ts
await browserProfileClient.replace({ ...emptyCandidateProfile, identity: { givenName: "Synthetic" } });
expect((await browserProfileClient.get()).profile.identity.givenName).toBe("Synthetic");
await jobBuddyDb.profileKeys.clear();
await expect(browserProfileClient.get()).rejects.toThrow();
expect(await jobBuddyDb.browserProfiles.count()).toBe(1);
```

- [x] Run `npm.cmd test -- src/features/profile/browserProfileClient.test.ts --maxWorkers=1`; observe missing implementation failure.
- [x] Add database version 3 with `browserProfiles: "id"`, `profileKeys: "id"`. Missing profile plus missing key means an empty profile; mismatched presence is an error. Generate AES-GCM 256-bit non-extractable keys, 12-byte random IVs and authenticated version/context bytes. Strictly validate decrypted data.
- [x] Read record/key in one readonly transaction; decrypt outside it. Before replacing, validate/decrypt prior state, encrypt outside a write transaction, then compare the saved revision inside a readwrite transaction. Reject concurrent changes, rather than restore a deleted/stale profile. Add/delete key and ciphertext together. A schema/crypto failure never writes.
- [x] Run tests and `npm.cmd run typecheck`. Stage only new task files if committing; do not absorb pre-existing database changes.

## Task 2: Explicit web mode and a working core without API requests

**Interfaces:** `readRuntimeMode(value: unknown): "companion" | "web"`, `isWebMode: boolean`. Build `--mode web` sets web mode; unsupported explicit values fail closed. Keep current `profileClient` public name.

- [x] Add tests for omitted/default mode, explicit web/companion and invalid mode. Add web-mode page tests using real browserProfileClient: save then remount, no fetch calls, understandable storage errors, no Windows-encryption claims. Exercise companion client contracts unchanged.

```ts
expect(readRuntimeMode(undefined)).toBe("companion");
expect(() => readRuntimeMode("typo")).toThrow();
// In a web-mode test, fail any fetch and interact with the real ProfilePage.
```

- [x] Run focused tests to see failure before implementation.
- [x] Make mode explicit in Vite configuration and add `dev:browser`, `build:web`, `preview:web` commands with a separate `dist-web` output. Do not add a local API proxy in web mode. Keep normal dev/build unchanged.
- [x] Select the profile adapter at composition time, not on fetch failure. Update profile copy/error messages for web mode. Capability-gate ActiveGmailSync, PendingCaptures, Gmail settings, live research/discovery controls; show integration-unavailable copy and keep local records/read-only evidence accessible. Never render a permanent loading state for an unavailable integration.
- [x] Add web-mode browser coverage with every `/api/*` request failing; profile save/reload/delete, resume text parse, application editing and CSV export still work. Preserve normal companion UI/test defaults.
- [x] Verify focused tests, typecheck and both builds before proceeding. Retain the current UI palette/components; no redesign.

## Task 3: Authenticated portable file format

**Interfaces:** `encryptBackup(payload: unknown, passphrase: string): Promise<Uint8Array>` and `decryptBackup(bytes: Uint8Array, passphrase: string): Promise<unknown>`.

- [x] Write `backupCrypto.test.ts` round-trip, wrong password, tampered ciphertext/header, unknown version, malicious work-factor override and oversize tests.

```ts
const bytes = await encryptBackup({ marker: "private fixture" }, "a long synthetic passphrase");
expect(new TextDecoder().decode(bytes)).not.toContain("private fixture");
await expect(decryptBackup(bytes, "wrong password")).rejects.toThrow();
```

- [x] Run the new test file; observe missing feature.
- [x] Use a JSON envelope with fixed format/version, PBKDF2-SHA256 at 600000 iterations, random 16-byte salt, AES-GCM-256 and random 12-byte IV. Authenticate the fixed format/version as additional data; encrypted payload includes manifest. Enforce fixed key-derivation parameters (no caller-controlled work factor), strict base64 lengths, 50 MiB file/decrypted payload limits and 12-1024 character export passphrase. No compression or ZIP parser. Import permits a nonempty passphrase to give a generic authentication failure for wrong passwords.
- [x] Run focused tests and typecheck. Do not persist password or decrypted payload outside the explicit snapshot/preview flow.

## Task 4: Validated snapshots and non-destructive restore

**Interfaces:** `readWorkspaceBackup(profile: CandidateProfile | null): Promise<WorkspaceBackup>`, `parseWorkspaceBackup(input: unknown): WorkspaceBackup`, `restoreWorkspaceBackup(backup: WorkspaceBackup): Promise<void>`; WorkspaceBackup contains version, exportedAt, manifest counts/profile flag, typed table arrays and explicit metadata.

- [x] Add `workspaceBackup.test.ts` with synthetic stored applications/history and profile. Round-trip to a separate fresh database, inject failure during restore, occupy destination concurrently, and assert zero partial changes. Validate every exported record class; reject extra keys, unsupported populated stores, duplicate IDs and dangling foreign keys before any write.

```ts
await jobBuddyDb.metadata.put({ key: "oauth-state", value: "never-export" });
const backup = await readWorkspaceBackup(null);
expect(JSON.stringify(backup)).not.toContain("never-export");
await expect(restoreWorkspaceBackup(backup)).rejects.toThrow(/empty|occupied/);
```

- [x] Run failing tests, then add strict Zod schemas matching stored domain types. Reuse existing research/profile/discovery schemas. Validate UTC/offset timestamps, safe HTTPS links, bounded strings/collections and dangerous keys before schema transformation. Preserve historical nullable application references where domain permits them; validate present references. Recompute stage/outcome from events rather than trust derived imported fields.
- [x] Snapshot all supported browser tables in one readonly transaction. Explicit supported tables: applications, stageEvents, deadlines, salaryObservations, salaryEstimateSnapshots, roleAliasOverrides, savedViews, updateProposals, processedMessages and activityEntries. Unknown nonempty user tables such as researchSnapshots/prepSessions/profileFields cause an export error. Browser profile is read/decrypted with a revision recheck around snapshot generation; companion profile is an explicit separately sourced snapshot, described as such in export UI.
- [x] Metadata allowlist: normalized Gmail preferences (reset connection-related controls), discovery shortlist, discovery board, web-salary snapshots. Exclude scan state, locks, demo backups and arbitrary keys. Keep legacy dedup records inert until a later Gmail implementation verifies mailbox identity.
- [x] Inside one write transaction, recheck that all user tables/profile stores/allowlisted metadata are empty. Ignore only harmless boot markers/default preferences. Restore supported records, safe preferences, completion markers and prepared profile/key together; fail if any user data already exists. No merge/clear/delete branch.
- [x] Run schema/restore tests, existing import/export tests and typecheck. Verify bounds at both export and import.

## Task 5: Backup controls and browser acceptance

**Interfaces:** lazy `<BackupControls />`, shown in both modes for export and web-only restore. Obtain profile through selected ProfileClient; explicit tracker-only export checkbox if profile retrieval fails.

- [x] Write React interaction tests: backup password confirmation, file bounds, wrong password retaining the original file, explicit preview before restore, busy/disabled controls, failed profile retrieval requiring a user choice, occupied destination refusal and no network upload.

```tsx
render(<BackupControls />);
await user.upload(screen.getByLabelText("Backup file"), syntheticFile);
expect(screen.queryByRole("button", { name: "Restore workspace" })).not.toBeInTheDocument();
// Decrypt first, review counts, then explicitly restore.
```

- [x] Observe failures. Implement inline Settings controls using existing field/button styles. Show lost-passphrase/site-data warnings, request browser persistence only from a button and handle unavailable/denied API. Drop decrypted preview/passwords after success, cancellation or unmount; revoke download object URLs. Keep CSV/XLSX controls unchanged.
- [x] Add Playwright static web preview on two origins, synthetic source export/destination restore, mobile/desktop checks, persistence after reload, no API/profile/resume/backup transmissions and startup budget. Exercise storage errors through the narrow storage boundary, not mocked page content.
- [x] Run focused and full unit suites sequentially with full browser suites, both builds, public-tree, client-secret and research-source checks including dist-web. Document exact commands/results and limitations in `docs/releases/v1-web-core-verification.md`, update README/PRIVACY with honest mode-specific claims.
- [x] Review the entire change for data loss, plaintext fallbacks, unintended API calls, unsupported backup omission and changes outside scope. Report implementation versus remaining hosted integration work distinctly; no push/publication.

## Execution record

- 2026-09-25: Spec approved; user selected inline execution. Plan self-reviewed against all Slice 1 acceptance points; later hosted integrations explicitly excluded.
- 2026-09-25: Tasks 1–5 implemented inline. Checkbox completion denotes the delivered acceptance outcome; wrong-password, preview, occupied restore and no-upload interaction coverage uses Playwright in addition to the narrower React unit tests. The same-origin transaction/crypto failure cases use isolated synthetic IndexedDB tests; separate-origin transfer uses Chromium. Final command results and remaining acceptance limits are in `docs/releases/v1-web-core-verification.md`.
- Review refinements: virtual web default views preserve a fresh destination; strict legacy saved-view sort objects and credential-free HTTP application job links are retained for compatibility. Other research/email URLs remain HTTPS-only. These are preservation adjustments, not provider access or URL fetching.
- No branch integration or cleanup is requested for this slice: retain the user's current dirty checkout; no commit, push or deployment.
