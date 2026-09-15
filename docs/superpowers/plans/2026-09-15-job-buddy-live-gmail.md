# Job Buddy Live Gmail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Job Buddy v0.3 with persistent, read-only Gmail OAuth, a localhost companion API, DPAPI-protected refresh tokens, a consented 90-day initial scan, and incremental active-session scans.

**Architecture:** A Node companion bound to `127.0.0.1:43117` owns OAuth credentials, protected refresh tokens, Google requests, and transient MIME processing. The React app talks to the companion through a browser `GmailMailAdapter`; live and fixture messages then share the existing matching, classification, proposal, approval, deadline, and idempotency pipeline.

**Tech Stack:** React 19, TypeScript, Vite, Node 24 built-in HTTP/fetch/crypto, Vitest, Playwright, Dexie, Windows DPAPI through a fixed PowerShell helper, and `tsx` for the local TypeScript server.

**Spec:** `docs/superpowers/specs/2026-09-15-job-buddy-live-gmail-design.md`

## Global Constraints

- Target version is `0.3.0`.
- Live Gmail is Windows-only in v0.3; fixture mode remains available on every platform.
- The companion binds only to `127.0.0.1:43117`.
- The only Gmail scope is `https://www.googleapis.com/auth/gmail.readonly`.
- OAuth uses authorization code, PKCE S256, single-use state, `access_type=offline`, and `prompt=consent`.
- The first scan requires explicit confirmation, searches 90 days, and stops after 500 message IDs.
- Later scans use Gmail History; an expired history ID triggers one bounded recovery scan.
- Automatic scanning runs only while the app is open and only when the last successful live scan is at least 24 hours old.
- Refresh tokens are DPAPI-protected for the current Windows user; access tokens remain in memory.
- Client configuration lives only in git-ignored `.env.local`; no credential or token enters browser storage or browser JavaScript.
- Full message bodies are processed transiently and discarded. Stored evidence remains sender, subject, timestamp, a 600-character excerpt, up to 10 credential-free HTTPS links, confidence, reasons, IDs, and processing state.
- Live Gmail never weakens existing approval, conflict, terminal-outcome, matching, or idempotency rules.
- Tests and CI use fake transports and temporary stores; they never require network access, Google credentials, personal email, or DPAPI.

---

### Task 1: Establish the v0.3 companion runtime and provider-aware scan contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.node.json`
- Create: `.env.example`
- Create: `scripts/dev.mjs`
- Create: `server/config.ts`
- Create: `server/config.test.ts`
- Create: `src/domain/mail.ts`
- Modify: `src/domain/updateProposal.ts`
- Modify: `src/db/database.ts`
- Modify: `src/integrations/mail/MailAdapter.ts`
- Modify: `src/integrations/mail/FixtureMailAdapter.ts`
- Modify: `src/integrations/mail/FixtureMailAdapter.test.ts`
- Modify: `src/features/updates/updateRepository.ts`
- Modify: `src/features/updates/runMailScan.ts`
- Modify: `src/features/updates/runMailScan.test.ts`

**Interfaces:**
- Produces: `CompanionConfig`, `MailSource`, provider-aware `MailAdapter`, and source-scoped scan state.
- Consumes: the existing fixture adapter and update-intelligence transaction.

- [ ] **Step 1: Write failing configuration and source-isolation tests**

```ts
it("reports missing OAuth configuration without returning secret values", () => {
  expect(readCompanionConfig({})).toEqual({
    host: "127.0.0.1",
    port: 43117,
    google: null,
    uiOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:43117"],
  });
});

it("keeps live and simulated cursors independent", async () => {
  await updateRepository.saveScanState("simulated", { cursor: "fixture-4" });
  await updateRepository.saveScanState("gmail", { cursor: "184000" });
  expect((await updateRepository.getScanState("simulated")).cursor).toBe("fixture-4");
  expect((await updateRepository.getScanState("gmail")).cursor).toBe("184000");
});
```

- [ ] **Step 2: Run RED**

Run:

```text
npm test -- server/config.test.ts src/integrations/mail/FixtureMailAdapter.test.ts src/features/updates/runMailScan.test.ts
```

Expected: FAIL because the server configuration and provider-aware interfaces do not exist.

- [ ] **Step 3: Add the runtime configuration**

Set package version `0.3.0`, add development dependencies `tsx` and `@types/node`, and define:

```json
{
  "scripts": {
    "dev": "node --env-file-if-exists=.env.local scripts/dev.mjs",
    "dev:web": "vite",
    "dev:server": "tsx watch server/start.ts",
    "start": "node --env-file-if-exists=.env.local --import tsx server/start.ts"
  }
}
```

`scripts/dev.mjs` spawns `npm run dev:web` and `npm run dev:server`, forwards signals, and terminates the sibling process when one exits. It never prints environment values.

`vite.config.ts` proxies `/api` to `http://127.0.0.1:43117`. `tsconfig.node.json` includes `server`, `scripts`, and Node types.

`.env.example` contains only:

```text
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:43117/api/gmail/oauth/callback
```

Implement:

```ts
export interface CompanionConfig {
  host: "127.0.0.1";
  port: 43117;
  google: null | {
    clientId: string;
    clientSecret: string;
    redirectUri: "http://127.0.0.1:43117/api/gmail/oauth/callback";
  };
  uiOrigins: readonly string[];
}

export function readCompanionConfig(env: NodeJS.ProcessEnv): CompanionConfig;
```

Reject a non-loopback redirect URI rather than starting a partially configured connection.

- [ ] **Step 4: Make mail scan state provider-aware**

```ts
// src/domain/mail.ts
export type MailSource = "simulated" | "gmail";

export interface MailScanDiagnostics {
  truncated: boolean;
  recoverySync: boolean;
  ignoredMessageCount: number;
}

export interface MailScanContext {
  initialSyncConfirmed?: boolean;
}

export interface MailAdapter {
  readonly source: MailSource;
  scan(cursor: string | null, context?: MailScanContext): Promise<MailScanResult>;
}
```

Extend `MailScanResult` with optional `diagnostics?: MailScanDiagnostics`. Extend `UpdateProposalFields` and `ActivityEntry` with `mailSource: MailSource`; the immutable source message remains unchanged. `FixtureMailAdapter.source` is `simulated` and returns zeroed diagnostics. `runMailScan` reads and commits `mail-scan:<source>` metadata, persists diagnostics in that source's scan state, and writes `mailSource` on proposal/activity records without changing classification or approval thresholds.

- [ ] **Step 5: Run GREEN and commit**

Run:

```text
npm test -- server/config.test.ts src/integrations/mail/FixtureMailAdapter.test.ts src/features/updates/runMailScan.test.ts
npm run typecheck
git diff --check
```

Commit:

```text
feat: establish Gmail companion runtime
```

---

### Task 2: Protect persistent Gmail credentials with Windows DPAPI

**Files:**
- Create: `server/secrets/SecretStore.ts`
- Create: `server/secrets/WindowsDpapiSecretStore.ts`
- Create: `server/secrets/WindowsDpapiSecretStore.test.ts`
- Create: `server/secrets/ConnectionMetadataStore.ts`
- Create: `server/secrets/ConnectionMetadataStore.test.ts`

**Interfaces:**
- Produces: `SecretStore`, `WindowsDpapiSecretStore`, `CommandRunner`, and safe connection metadata persistence.
- Consumes: `%LOCALAPPDATA%` and a fixed PowerShell DPAPI command.

- [ ] **Step 1: Write failing secret-store tests**

```ts
it("stores encrypted bytes and never the plaintext refresh token", async () => {
  const store = new WindowsDpapiSecretStore({ root: tempDir, runner: fakeDpapi });
  await store.set("gmail-refresh-token", "refresh-canary");
  expect(await store.get("gmail-refresh-token")).toBe("refresh-canary");
  expect(await readFile(store.tokenPath, "utf8")).not.toContain("refresh-canary");
});

it("is idempotent when deleting a missing token", async () => {
  await expect(store.delete("gmail-refresh-token")).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run RED**

Run:

```text
npm test -- server/secrets
```

Expected: FAIL because no secret-store implementation exists.

- [ ] **Step 3: Implement the contracts and fixed helper protocol**

```ts
export interface SecretStore {
  isSupported(): boolean;
  get(key: "gmail-refresh-token"): Promise<string | null>;
  set(key: "gmail-refresh-token", value: string): Promise<void>;
  delete(key: "gmail-refresh-token"): Promise<void>;
}

export interface CommandRunner {
  run(input: { executable: string; args: string[]; stdin: string }): Promise<{ stdout: string }>;
}
```

Use a fixed `powershell.exe -NoProfile -NonInteractive -EncodedCommand <constant>` invocation. The constant reads base64 from standard input, calls `ProtectedData.Protect` or `ProtectedData.Unprotect` with `DataProtectionScope.CurrentUser`, and writes base64 to standard output. Secret values never enter the command or arguments.

Write encrypted bytes to a sibling temporary file, flush, then rename atomically to `%LOCALAPPDATA%\JobBuddy\secrets\gmail-refresh-token.bin`. Never fall back to plaintext.

- [ ] **Step 4: Persist non-secret connection metadata separately**

```ts
export interface GmailConnectionMetadata {
  accountEmail: string;
  connectedAt: string;
  state: "connected" | "reconnect-required";
}
```

Store it atomically at `%LOCALAPPDATA%\JobBuddy\gmail-connection.json`. Validate reads; a malformed file returns no connection rather than throwing raw content.

- [ ] **Step 5: Run GREEN and commit**

Run:

```text
npm test -- server/secrets
npm run typecheck
git diff --check
```

Commit:

```text
feat: protect Gmail refresh tokens locally
```

---

### Task 3: Implement offline Google OAuth with PKCE and single-use state

**Files:**
- Create: `server/gmail/GoogleOAuthClient.ts`
- Create: `server/gmail/GoogleOAuthClient.test.ts`
- Create: `server/gmail/OAuthAttemptStore.ts`
- Create: `server/gmail/OAuthAttemptStore.test.ts`
- Create: `server/gmail/GmailConnectionService.ts`
- Create: `server/gmail/GmailConnectionService.test.ts`

**Interfaces:**
- Consumes: `CompanionConfig`, `SecretStore`, connection metadata, and injectable `fetch`.
- Produces: authorization URLs, callback completion, refreshed access tokens, safe status, and disconnect.

- [ ] **Step 1: Write failing OAuth tests**

```ts
it("creates an offline, read-only, PKCE authorization request", () => {
  const attempt = attempts.create(now);
  const url = new URL(oauth.authorizationUrl(attempt));
  expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("prompt")).toBe("consent");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
});

it("consumes callback state exactly once within ten minutes", () => {
  const attempt = attempts.create("2026-09-15T08:00:00.000Z");
  expect(attempts.consume(attempt.state, "2026-09-15T08:09:59.000Z")).toBeTruthy();
  expect(attempts.consume(attempt.state, "2026-09-15T08:10:00.000Z")).toBeNull();
});
```

- [ ] **Step 2: Run RED**

Run:

```text
npm test -- server/gmail/GoogleOAuthClient.test.ts server/gmail/OAuthAttemptStore.test.ts server/gmail/GmailConnectionService.test.ts
```

Expected: FAIL because OAuth services are missing.

- [ ] **Step 3: Implement OAuth primitives**

```ts
export interface OAuthAttempt {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: string;
}

export interface GoogleTokens {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}
```

Generate state and verifier with `randomBytes`, encode base64url, and compute the S256 challenge with `createHash("sha256")`. `OAuthAttemptStore.consume` deletes before returning and rejects attempts aged 10 minutes or more.

Use native fetch for `https://oauth2.googleapis.com/token`, Gmail profile, and `https://oauth2.googleapis.com/revoke`. Parse only required fields and replace raw Google errors with typed safe errors.

- [ ] **Step 4: Implement connection lifecycle**

```ts
export type GmailConnectionStatus = {
  state: "unconfigured" | "disconnected" | "connected" | "reconnect-required";
  accountEmail?: string;
  platformSupported: boolean;
  lastError?: "missing-config" | "token-revoked" | "platform-unsupported";
};

export class GmailConnectionService {
  status(): Promise<GmailConnectionStatus>;
  start(now?: string): Promise<{ authorizationUrl: string }>;
  complete(input: { code: string; state: string; now?: string }): Promise<void>;
  getAccessToken(): Promise<string>;
  disconnect(): Promise<{ revocationConfirmed: boolean }>;
}
```

Completion requires a refresh token before persisting anything. Access tokens remain in memory. An `invalid_grant` refresh marks metadata `reconnect-required` and returns a safe typed error.

- [ ] **Step 5: Run GREEN and commit**

Run:

```text
npm test -- server/gmail/GoogleOAuthClient.test.ts server/gmail/OAuthAttemptStore.test.ts server/gmail/GmailConnectionService.test.ts
npm run typecheck
git diff --check
```

Commit:

```text
feat: connect Gmail with offline OAuth
```

---

### Task 4: Normalize Gmail MIME into minimal, safe evidence

**Files:**
- Create: `server/gmail/gmailTypes.ts`
- Create: `server/gmail/GmailMessageNormalizer.ts`
- Create: `server/gmail/GmailMessageNormalizer.test.ts`

**Interfaces:**
- Consumes: the minimal Gmail `Message` JSON fields used by Job Buddy.
- Produces: `MailEnvelope | null` without retaining Gmail bodies.

- [ ] **Step 1: Write failing normalizer tests**

```ts
it("prefers plain text and emits bounded evidence", () => {
  const result = normalizeGmailMessage(messageWithPlainAndHtml);
  expect(result).toMatchObject({
    providerMessageId: "gmail-1",
    threadId: "thread-1",
    fromAddress: "recruiter@example.com",
    subject: "Technical interview",
    receivedAt: "2026-09-15T06:00:00.000Z",
  });
  expect(result?.excerpt.length).toBeLessThanOrEqual(600);
});

it("retains at most ten credential-free HTTPS links", () => {
  expect(normalizeGmailMessage(messageWithLinks)?.links).toEqual(validLinks.slice(0, 10));
});
```

- [ ] **Step 2: Run RED**

Run:

```text
npm test -- server/gmail/GmailMessageNormalizer.test.ts
```

Expected: FAIL because Gmail MIME normalization is missing.

- [ ] **Step 3: Implement bounded MIME traversal**

```ts
export function normalizeGmailMessage(message: GmailMessage): MailEnvelope | null;
```

Traverse nested parts with explicit depth and decoded-size limits. Prefer `text/plain`; otherwise strip tags, scripts, styles, comments, and entities from `text/html` into plain text. Parse `From` into name/address, normalize whitespace, cap excerpt at 600 Unicode characters, and use `internalDate` only when it round-trips to a valid ISO timestamp.

Extract URLs from transient decoded text, filter through `isSafeExternalHttpsUrl`, de-duplicate in source order, and cap at 10. Invalid base64url, missing sender/subject/date, or oversized MIME returns null for that message.

- [ ] **Step 4: Verify malformed-message isolation and commit**

Run:

```text
npm test -- server/gmail/GmailMessageNormalizer.test.ts
npm run typecheck
git diff --check
```

Commit:

```text
feat: normalize Gmail evidence safely
```

---

### Task 5: Add bounded initial sync and Gmail History incremental sync

**Files:**
- Create: `server/gmail/GmailTransport.ts`
- Create: `server/gmail/GmailTransport.test.ts`
- Create: `server/gmail/GmailSyncService.ts`
- Create: `server/gmail/GmailSyncService.test.ts`

**Interfaces:**
- Consumes: `GmailConnectionService.getAccessToken`, Gmail REST responses, and `normalizeGmailMessage`.
- Produces: `GmailScanResponse` with minimal envelopes and a Gmail history cursor.

- [ ] **Step 1: Write failing initial-sync tests**

```ts
it("requires consent and caps the 90-day initial scan at 500 newest inbox messages", async () => {
  await expect(sync.scan({ cursor: null, initialSyncConfirmed: false })).rejects.toMatchObject({ code: "initial-consent-required" });
  const result = await sync.scan({ cursor: null, initialSyncConfirmed: true });
  expect(result.messages).toHaveLength(500);
  expect(result.truncated).toBe(true);
  expect(transport.listQueries[0]).toBe("in:inbox newer_than:90d -category:promotions -category:social");
});
```

- [ ] **Step 2: Write failing incremental and recovery tests**

```ts
it("paginates messageAdded history and de-duplicates message IDs", async () => {
  const result = await sync.scan({ cursor: "184000", initialSyncConfirmed: false });
  expect(result.messages.map(message => message.providerMessageId)).toEqual(["g-2", "g-3"]);
  expect(result.nextCursor).toBe("184100");
});

it("performs one bounded recovery scan after an expired history cursor", async () => {
  transport.historyError = { status: 404 };
  expect(await sync.scan({ cursor: "expired", initialSyncConfirmed: false })).toMatchObject({ recoverySync: true });
});
```

- [ ] **Step 3: Run RED**

Run:

```text
npm test -- server/gmail/GmailTransport.test.ts server/gmail/GmailSyncService.test.ts
```

Expected: FAIL because Gmail transport and synchronization do not exist.

- [ ] **Step 4: Implement typed transport and sync**

```ts
export type GmailScanResponse = MailScanResult & {
  source: "gmail";
  diagnostics: {
    truncated: boolean;
    recoverySync: boolean;
    ignoredMessageCount: number;
  };
};

export class GmailSyncService {
  scan(input: { cursor: string | null; initialSyncConfirmed: boolean }): Promise<GmailScanResponse>;
}
```

Initial sync follows `messages.list` pages newest-first and stops before fetching message 501. Fetch profile history ID after the bounded ID list succeeds. Incremental sync follows `users.history.list` `messageAdded` pages, de-duplicates IDs, fetches message metadata, ignores messages without `INBOX`, and uses the response history ID.

Fetch message details with `format=full`. Normalize each independently; count malformed messages without returning content. Any list, profile, or token failure aborts without a new cursor. A malformed individual message does not abort.

- [ ] **Step 5: Run GREEN and commit**

Run:

```text
npm test -- server/gmail/GmailTransport.test.ts server/gmail/GmailSyncService.test.ts
npm run typecheck
git diff --check
```

Commit:

```text
feat: synchronize Gmail updates incrementally
```

---

### Task 6: Expose the secure localhost API and browser Gmail adapter

**Files:**
- Create: `server/http/createCompanionServer.ts`
- Create: `server/http/createCompanionServer.test.ts`
- Create: `server/start.ts`
- Create: `src/integrations/mail/GmailMailAdapter.ts`
- Create: `src/integrations/mail/GmailMailAdapter.test.ts`
- Modify: `src/features/updates/runMailScan.ts`
- Modify: `src/features/updates/runMailScan.test.ts`

**Interfaces:**
- Consumes: connection and sync services.
- Produces: the five `/api/gmail/*` endpoints and a browser `MailAdapter`.

- [ ] **Step 1: Write failing API security tests**

```ts
it("rejects state-changing requests from an unknown origin", async () => {
  const response = await request(server, "/api/gmail/scan", {
    method: "POST",
    origin: "https://evil.example",
    json: { cursor: null, initialSyncConfirmed: true },
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

it("never returns token or credential fields from status", async () => {
  expect(await getJson(server, "/api/gmail/status")).toEqual({
    state: "connected",
    accountEmail: "user@example.com",
    platformSupported: true,
  });
});
```

- [ ] **Step 2: Write failing adapter tests**

```ts
it("maps a live scan response to the mail contract", async () => {
  const adapter = new GmailMailAdapter(fakeClient);
  expect(adapter.source).toBe("gmail");
  expect(await adapter.scan(null, { initialSyncConfirmed: true })).toMatchObject({ nextCursor: "184100" });
});
```

- [ ] **Step 3: Run RED**

Run:

```text
npm test -- server/http/createCompanionServer.test.ts src/integrations/mail/GmailMailAdapter.test.ts src/features/updates/runMailScan.test.ts
```

Expected: FAIL because routes and the browser adapter are missing.

- [ ] **Step 4: Implement the API routes**

Implement exact routes:

```text
GET  /api/gmail/status
POST /api/gmail/oauth/start
GET  /api/gmail/oauth/callback
POST /api/gmail/scan
POST /api/gmail/disconnect
```

Bind only the configured loopback host. For POST routes require `application/json`, a body no larger than 16 KiB, and exact allowed origin. Callback consumes `code` and `state`, then redirects to `http://127.0.0.1:5173/settings?gmail=connected|error` in development or `http://127.0.0.1:43117/settings?gmail=connected|error` in production, without copying query values. `scripts/dev.mjs` supplies the development UI origin; production startup uses the companion origin. Return typed safe error codes and counts only.

`server/start.ts` wires real config, DPAPI store, OAuth, sync, and HTTP services. In production it serves `dist`; in development Vite owns the UI.

- [ ] **Step 5: Implement the browser adapter and transaction handoff**

```ts
export class GmailMailAdapter implements MailAdapter {
  readonly source = "gmail" as const;
  constructor(private readonly client: GmailCompanionClient = fetchGmailCompanionClient) {}
  scan(cursor: string | null, context?: MailScanContext): Promise<MailScanResult>;
}
```

The adapter sends only cursor and confirmation. `runMailScan` commits the Gmail cursor only after proposals, processed IDs, activity, and scan state commit in the existing Dexie transaction. Provider failure retains the prior Gmail cursor.

- [ ] **Step 6: Run GREEN and commit**

Run:

```text
npm test -- server/http/createCompanionServer.test.ts src/integrations/mail/GmailMailAdapter.test.ts src/features/updates/runMailScan.test.ts
npm run typecheck
git diff --check
```

Commit:

```text
feat: expose the local Gmail bridge
```

---

### Task 7: Build Gmail Settings and first-scan consent

**Files:**
- Create: `src/features/settings/gmailClient.ts`
- Create: `src/features/settings/gmailPreferences.ts`
- Create: `src/features/settings/GmailSettingsPanel.tsx`
- Create: `src/features/settings/SettingsPage.tsx`
- Create: `src/features/settings/SettingsPage.test.tsx`
- Create: `src/features/settings/settings.css`
- Modify: `src/app/routes.tsx`
- Modify: `src/app/routes.test.tsx`

**Interfaces:**
- Consumes: companion status/start/disconnect, `GmailMailAdapter`, `runMailScan`, and Dexie metadata.
- Produces: Gmail connection UX, first-scan consent, daily preference, and demo fallback selection.

- [ ] **Step 1: Write failing Settings tests**

```tsx
it("shows setup guidance without exposing a secret input", async () => {
  renderSettings({ state: "unconfigured", platformSupported: true, lastError: "missing-config" });
  expect(await screen.findByText(/copy .env.example to .env.local/i)).toBeVisible();
  expect(screen.queryByLabelText(/client secret/i)).not.toBeInTheDocument();
});

it("requires an explicit 90-day scan after connecting", async () => {
  renderSettings({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
  expect(await screen.findByRole("button", { name: /scan last 90 days/i })).toBeVisible();
  expect(scan).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /scan last 90 days/i }));
  expect(scan).toHaveBeenCalledWith(expect.objectContaining({ initialSyncConfirmed: true }));
});
```

- [ ] **Step 2: Run RED**

Run:

```text
npm test -- src/features/settings src/app/routes.test.tsx
```

Expected: FAIL because Settings is still a placeholder.

- [ ] **Step 3: Implement client and preferences**

```ts
export interface GmailPreferences {
  selectedSource: "gmail" | "simulated";
  initialSyncCompleted: boolean;
  dailyActiveScanEnabled: boolean;
}

export const gmailPreferences = {
  get(): Promise<GmailPreferences>;
  save(value: GmailPreferences): Promise<void>;
};
```

Default to simulated before connection. After first successful live sync, set Gmail as selected and enable daily active-session scanning. OAuth start performs the POST, then assigns the returned Google URL to `window.location`. Disconnect requires confirmation, calls the API, and resets selection to simulated without deleting tracker evidence.

- [ ] **Step 4: Implement the Apple-inspired Settings panel**

Use one continuous neutral panel with crisp separators and existing tokens. Render `unconfigured`, `disconnected`, `connected`, `reconnect-required`, and unsupported states; show account email only when present. Include Connect/Reconnect, Disconnect, `Scan last 90 days`, daily toggle, and explicit `Use demo inbox` controls. All status and error feedback is accessible and never blank during load.

- [ ] **Step 5: Run GREEN and commit**

Run:

```text
npm test -- src/features/settings src/app/routes.test.tsx
npm run typecheck
git diff --check
```

Commit:

```text
feat: add persistent Gmail settings
```

---

### Task 8: Use live Gmail in Command Center and scan once per eligible session

**Files:**
- Create: `src/features/updates/useDailyActiveScan.ts`
- Create: `src/features/updates/useDailyActiveScan.test.tsx`
- Modify: `src/features/command-center/CommandCenterPage.tsx`
- Modify: `src/features/command-center/CommandCenterPage.test.tsx`
- Modify: `src/features/command-center/command-center.css`
- Modify: `src/features/updates/UpdateInboxPage.tsx`
- Modify: `src/features/updates/UpdateInboxPage.test.tsx`
- Modify: `src/features/updates/updateRepository.ts`

**Interfaces:**
- Consumes: connection status, preferences, source-scoped scan state, `GmailMailAdapter`, fixture adapter, and `useMailScan`.
- Produces: explicit live/demo scan controls and eligible daily active-session scanning.

- [ ] **Step 1: Write failing daily-scan tests**

```tsx
it("starts one Gmail scan when the last success is at least 24 hours old", async () => {
  renderDailyScan({ connected: true, enabled: true, lastSuccessfulScanAt: "2026-09-14T07:59:59.000Z", now: "2026-09-15T08:00:00.000Z" });
  await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
  rerenderSameInputs();
  expect(scan).toHaveBeenCalledTimes(1);
});

it("does not scan while disconnected, disabled, recent, or before initial consent", () => {
  renderDailyScan({ connected: false, enabled: true, initialSyncCompleted: true });
  expect(scan).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write failing source-label and failure tests**

```tsx
it("never falls back to demo when a live scan fails", async () => {
  renderCommandCenter({ selectedSource: "gmail", gmailState: "connected", gmailScanError: true });
  await user.click(screen.getByRole("button", { name: /scan Gmail now/i }));
  expect(fixtureScan).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveTextContent(/Gmail scan could not be completed/i);
});
```

- [ ] **Step 3: Run RED**

Run:

```text
npm test -- src/features/updates/useDailyActiveScan.test.tsx src/features/command-center/CommandCenterPage.test.tsx src/features/updates/UpdateInboxPage.test.tsx
```

Expected: FAIL because provider selection and daily scanning are not connected.

- [ ] **Step 4: Implement eligible once-per-session scanning**

```ts
export function isDailyScanEligible(input: {
  connected: boolean;
  enabled: boolean;
  initialSyncCompleted: boolean;
  lastSuccessfulScanAt?: string;
  now: string;
}): boolean;
```

Require all booleans, a valid timestamp, and age `>= 24 * 60 * 60 * 1000`. `useDailyActiveScan` holds a session ref keyed by connected account/source and calls the scan once. Rerenders, visibility changes, and Strict Mode cannot repeat it.

- [ ] **Step 5: Render explicit live and demo states**

When connected and selected, Command Center says `Live Gmail`, shows the account, source-scoped last success, `Scan Gmail now`, recovery/truncation notices, and reconnect action. When demo is selected it says `Demo inbox` and keeps existing simulated controls. Live failure never calls the fixture.

Update Inbox shows `Gmail` or `Demo` on each proposal from its persisted source and retains the same evidence/approval layout.

- [ ] **Step 6: Run GREEN and commit**

Run:

```text
npm test -- src/features/updates/useDailyActiveScan.test.tsx src/features/command-center/CommandCenterPage.test.tsx src/features/updates/UpdateInboxPage.test.tsx
npm run typecheck
git diff --check
```

Commit:

```text
feat: scan live Gmail while active
```

---

### Task 9: Verify the fake-Google journey and document safe setup

**Files:**
- Create: `e2e/live-gmail.spec.ts`
- Create: `e2e/support/FakeGmailApi.ts`
- Create: `scripts/verify-client-secrets.mjs`
- Create: `scripts/verify-client-secrets.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: all v0.3 runtime, server, adapter, Settings, Command Center, and Update Inbox interfaces.
- Produces: deterministic browser coverage, bundle secret checks, and contributor setup documentation.

- [ ] **Step 1: Write the deterministic browser journey**

Use Playwright route interception for browser `/api/gmail/*` calls and server integration tests for real route wiring. Implement this helper contract:

```ts
export class FakeGmailApi {
  constructor(private readonly page: Page) {}
  install(): Promise<void>;
  setStatus(status: GmailConnectionStatus): void;
  queueScan(result: GmailScanResponse): void;
}

export const liveInterviewScan: GmailScanResponse;
```

The helper fulfills intercepted requests from in-memory status and scan queues, records disconnect, and never accepts an unexpected method or route. The browser journey is:

```ts
test("connects, scans, recovers revoked Gmail, and returns to demo", async ({ page }) => {
  const gmail = new FakeGmailApi(page);
  await gmail.install();
  await page.goto("/settings");
  await expect(page.getByText(/Gmail is not configured/i)).toBeVisible();

  gmail.setStatus({ state: "connected", accountEmail: "user@example.com", platformSupported: true });
  gmail.queueScan(liveInterviewScan);
  await page.goto("/settings?gmail=connected");
  await page.getByRole("button", { name: /scan last 90 days/i }).click();
  await page.getByRole("link", { name: /updates/i }).click();
  await expect(page.getByText(/Source: Gmail/i)).toBeVisible();
  await page.getByRole("button", { name: /approve update/i }).click();
  await page.getByRole("link", { name: /overview/i }).click();
  await expect(page.getByRole("link", { name: /open meeting link/i })).toBeVisible();

  gmail.setStatus({ state: "reconnect-required", accountEmail: "user@example.com", platformSupported: true, lastError: "token-revoked" });
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /reconnect Gmail/i })).toBeVisible();
  await page.getByRole("link", { name: /overview/i }).click();
  await expect(page.getByRole("link", { name: /open meeting link/i })).toBeVisible();

  await page.goto("/settings");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: /disconnect Gmail/i }).click();
  await page.getByRole("button", { name: /use demo inbox/i }).click();
  await page.getByRole("link", { name: /overview/i }).click();
  await expect(page.getByText(/Demo inbox/i)).toBeVisible();
});
```

- [ ] **Step 2: Write and run the client-secret verifier RED**

```ts
it("fails when a client bundle contains a secret canary", async () => {
  await writeFile(join(tempDist, "assets/app.js"), "client-secret-canary");
  await expect(verifyClientArtifacts(tempDist, ["client-secret-canary"])).rejects.toThrow(/secret material/i);
});
```

Run:

```text
npm test -- scripts/verify-client-secrets.test.ts
```

Expected: FAIL because the verifier is missing.

- [ ] **Step 3: Implement bundle verification and documentation**

`verify-client-secrets.mjs` recursively scans text artifacts below `dist` and fails on configured client-secret values, refresh/access-token test canaries, or server-only environment variable values. It prints paths and rule names, never the matched secret. Add `verify:client-secrets` to the final gate after build.

README must include exact Google Cloud/Gmail API/test-user/web-client/redirect steps, `.env.local` setup, Windows DPAPI behavior, restricted-scope implications, 90-day and 500-message bounds, retained evidence, live/demo source labels, active-session-only scanning, reconnect, disconnect, and troubleshooting for redirect mismatch and revoked tokens.

`.gitignore` must cover `.env.local`, `%LOCALAPPDATA%` exports accidentally copied into the repository, OAuth response fixtures, and token-like local files while keeping `.env.example` tracked.

- [ ] **Step 4: Run focused browser and security checks**

Run:

```text
npm test -- scripts/verify-client-secrets.test.ts
npm run test:e2e -- e2e/live-gmail.spec.ts
npm run build
npm run verify:client-secrets
```

Expected: PASS without network or real credentials.

- [ ] **Step 5: Run the complete v0.3 gate**

Run:

```text
npm test
npm run typecheck
npm run build
npm run verify:client-secrets
npm run test:e2e
git diff --check
```

Expected: every unit, component, server, security, and browser test passes; build succeeds; no client artifact contains server secret material.

- [ ] **Step 6: Commit the verified release slice**

Commit:

```text
test: verify live Gmail workflow
```
