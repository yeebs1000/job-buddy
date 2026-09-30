# Job Buddy v0.3: Live Gmail Connectivity

Date: 2026-09-15  
Status: Approved design  
Target version: `0.3.0`

## 1. Goal

Add persistent, read-only Gmail connectivity to Job Buddy without weakening the local-first privacy model. A user supplies their own Google OAuth web-client configuration, connects one Gmail account, performs a consented 90-day initial scan, and then receives incremental update proposals while Job Buddy is open.

The existing fixture adapter remains available on every platform. Live Gmail is the primary v0.3 integration on Windows and is implemented behind portable server, transport, and secret-store interfaces.

## 2. Scope

Version 0.3 includes:

- Google OAuth authorization-code flow with PKCE, state validation, and offline access.
- A localhost-only Node companion server that owns OAuth credentials, tokens, and Gmail API calls.
- Current-user Windows DPAPI protection for the Gmail refresh token.
- One connected Gmail account per local Job Buddy installation.
- A user-confirmed initial scan covering the newest 90 days, capped at 500 messages.
- Incremental Gmail History scans after the initial scan.
- An automatic scan when Job Buddy opens and the previous successful live scan is at least 24 hours old.
- Manual live scans, reconnect, disconnect, and an explicit demo fallback.
- Transient processing of Gmail message bodies into the existing minimal `MailEnvelope` contract.
- Settings, Command Center, Update Inbox, tests, and contributor documentation for the live integration.

Version 0.3 does not include:

- A hosted OAuth client shared by all users.
- Gmail access on macOS or Linux; those platforms retain fixture mode until another `SecretStore` implementation ships.
- Background scans while the dashboard and companion server are closed.
- Gmail modification, sending, labelling, deleting, or attachment download.
- Multiple Gmail accounts.
- AI classification, remote processing, or transmission of message data to third parties.
- Push notifications, Gmail watch/Pub/Sub, or a Windows background service.

## 3. User-provided Google configuration

The repository ships `.env.example` with blank values for:

```text
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:43117/api/gmail/oauth/callback
```

The user copies it to the git-ignored `.env.local` and supplies credentials from their own Google Cloud project. The Gmail API must be enabled, the OAuth audience must include the user's Google account as a test user where applicable, and the redirect URI must match exactly.

OAuth client configuration is read only by the local companion server. It is never returned by an API endpoint, bundled into browser JavaScript, written to IndexedDB, or printed in logs.

The integration requests only:

```text
https://www.googleapis.com/auth/gmail.readonly
```

This restricted scope is necessary because Job Buddy must transiently read enough message content to extract a bounded evidence excerpt, dates, and meeting links. The app neither requests nor implements Gmail modification capabilities.

References:

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/guides/sync

## 4. Runtime architecture

### 4.1 Processes

`npm run dev` starts:

1. The existing Vite React application on `http://127.0.0.1:5173`.
2. A Node companion API on `http://127.0.0.1:43117`.

A small Node development launcher owns both child processes and terminates the sibling if either exits. Vite proxies `/api` to the companion during development. The production launcher serves the built frontend and the same API from the companion port.

The companion uses Node's built-in HTTP server and native `fetch`. `tsx` is the only required runtime-development addition for executing the TypeScript server during local development. No general-purpose web framework or Google API SDK is required.

### 4.2 Boundaries

- `GoogleOAuthClient` creates authorization URLs, exchanges codes, refreshes access tokens, and revokes grants.
- `SecretStore` stores, retrieves, and deletes an opaque refresh token.
- `WindowsDpapiSecretStore` protects token bytes for the current Windows user and stores only encrypted bytes below `%LOCALAPPDATA%\JobBuddy\secrets`.
- `GmailTransport` calls Google endpoints and returns typed API responses.
- `GmailMessageNormalizer` turns a Gmail message into the existing minimal `MailEnvelope`.
- `GmailMailAdapter` implements the existing browser-side `MailAdapter` by calling the localhost API.
- Existing matcher, classifier, proposal repository, and approval rules consume live and fixture envelopes identically.

Server modules never import React or IndexedDB code. Browser modules never import OAuth, DPAPI, filesystem, or client-secret code.

## 5. Local API

The companion exposes these endpoints:

```text
GET  /api/gmail/status
POST /api/gmail/oauth/start
GET  /api/gmail/oauth/callback
POST /api/gmail/scan
POST /api/gmail/disconnect
```

### 5.1 Status

`GET /api/gmail/status` returns only:

```ts
type GmailConnectionStatus = {
  state: "unconfigured" | "disconnected" | "connected" | "reconnect-required";
  accountEmail?: string;
  platformSupported: boolean;
  lastError?: "missing-config" | "token-revoked" | "platform-unsupported";
};
```

It never returns tokens, credentials, filesystem locations, or Google error payloads.

### 5.2 OAuth start and callback

`POST /api/gmail/oauth/start` creates a cryptographically random state value, PKCE verifier, and SHA-256 challenge. The in-memory authorization attempt expires after 10 minutes and is single-use. The response contains the Google authorization URL. Parameters include `access_type=offline`, `prompt=consent`, the exact read-only scope, PKCE, and the configured redirect URI.

The callback rejects missing, expired, reused, or mismatched state before exchanging the code. The companion exchanges the authorization code directly with Google, retrieves the account address through the Gmail profile endpoint, DPAPI-protects the refresh token, clears the authorization attempt, and redirects to the Settings success or safe-error state. Authorization codes and tokens are never included in the redirect.

### 5.3 Scan

`POST /api/gmail/scan` accepts:

```ts
type GmailScanRequest = {
  cursor: string | null;
  initialSyncConfirmed: boolean;
};
```

It returns the existing `MailScanResult` plus source metadata:

```ts
type GmailScanResponse = MailScanResult & {
  source: "gmail";
  truncated: boolean;
  recoverySync: boolean;
};
```

A null cursor is allowed only when `initialSyncConfirmed` is true. It performs the bounded initial query:

```text
in:inbox newer_than:90d -category:promotions -category:social
```

The initial scan processes newest-first and stops after 500 message IDs. If more messages exist, `truncated` is true and the UI clearly states that the safety cap was reached. The scan records the mailbox's current history ID as the next cursor only after the browser's existing proposal transaction succeeds.

A non-null cursor calls `users.history.list` for `messageAdded` records, follows pagination, de-duplicates message IDs, and fetches messages that remain in the inbox. If Gmail returns `404` for an expired history ID, the companion performs the same bounded 90-day query, sets `recoverySync: true`, and returns a fresh history ID. Existing provider-message idempotency prevents duplicate proposals.

### 5.4 Disconnect

`POST /api/gmail/disconnect` attempts Google token revocation, deletes the encrypted refresh token and local account metadata even if revocation fails, clears the in-memory access token, and returns disconnected status. It does not delete applications, proposals, deadlines, stage events, or stored minimal evidence.

## 6. Local API security

- The companion binds only to `127.0.0.1`, never `0.0.0.0`.
- State-changing browser requests require `application/json` and an exact allowed `Origin` of the current Job Buddy UI.
- CORS is never wildcarded. Unknown origins receive no access-control headers and state-changing requests are rejected.
- OAuth callback security relies on the single-use state and PKCE verifier because Google performs the redirect without the UI's origin header.
- Request sizes are bounded. Unknown routes and methods return safe errors.
- Server logs may contain route, status, duration, and counts only. They must not contain OAuth codes, secrets, tokens, message headers, subjects, excerpts, bodies, links, or Google response payloads.
- Refresh-token material is passed to the fixed DPAPI helper over standard input, not command-line arguments.
- Message HTML is never rendered. Normalization produces plain text and validated, credential-free HTTPS links only.

## 7. Secret storage

`SecretStore` has this contract:

```ts
interface SecretStore {
  isSupported(): boolean;
  get(key: "gmail-refresh-token"): Promise<string | null>;
  set(key: "gmail-refresh-token", value: string): Promise<void>;
  delete(key: "gmail-refresh-token"): Promise<void>;
}
```

`WindowsDpapiSecretStore` uses current-user DPAPI and writes encrypted bytes atomically below `%LOCALAPPDATA%\JobBuddy\secrets`. The helper command is fixed; untrusted values never become shell source. Directory and file permissions are limited to the current user where Windows permits.

On unsupported platforms, `isSupported()` returns false, OAuth endpoints refuse to begin, Settings explains the platform limitation, and fixture mode remains fully usable.

Connection metadata contains only the account email, connected time, and safe connection state. It is stored separately from the protected token below `%LOCALAPPDATA%\JobBuddy`.

## 8. Gmail message normalization

The companion requests `users.messages.get` with `format=full` only for message IDs selected by the bounded or incremental scan.

For each message it:

1. Reads Gmail's immutable message ID and thread ID.
2. Reads only the `From` and `Subject` headers.
3. Uses `internalDate` as the received timestamp.
4. Prefers decoded `text/plain`; otherwise converts `text/html` to plain text without executing or rendering it.
5. Normalizes whitespace and creates an evidence excerpt capped at 600 Unicode characters.
6. Extracts URLs from MIME text, retains credential-free HTTPS links only, removes duplicates, and caps stored links at 10.
7. Discards decoded bodies and Gmail API payloads after producing `MailEnvelope`.

Malformed MIME parts, invalid base64url content, impossible timestamps, and oversized parts are skipped safely. One malformed message does not abort the whole scan; the response reports an ignored-message count without returning message content.

## 9. Browser integration and scan behavior

### 9.1 Settings

The existing Settings placeholder becomes a Gmail integration page with:

- Configuration readiness and exact setup guidance.
- Disconnected, connecting, connected, reconnect-required, and unsupported states.
- Connected account email.
- Connect, reconnect, and disconnect actions.
- A daily active-session scan toggle, enabled by default after the first successful live scan.
- A clear statement that scanning stops when Job Buddy closes.
- A separate demo-mode action that never masquerades as live mail.

### 9.2 First scan

OAuth completion does not start reading mail automatically. Settings explains the 90-day scope, excluded categories, 500-message cap, and minimal retained evidence. The user must click `Scan last 90 days` once.

### 9.3 Later scans

After initial sync, Command Center uses `GmailMailAdapter` for `Scan now`. When the daily toggle is enabled, opening Job Buddy triggers one live scan if the last successful live scan is at least 24 hours old. Visibility changes and rerenders cannot start duplicate scans. There is no interval loop and no scan while the app is closed.

The selected automation mode continues to govern proposal application. Approval is default. Unrestricted mode still applies only high-confidence, forward, non-terminal, non-conflicting updates. Gmail source does not relax any existing matching or approval rule.

### 9.4 Demo fallback

When Gmail is disconnected, unconfigured, unsupported, or explicitly switched to demo, the Command Center exposes `Scan demo inbox`. A live failure never silently runs the fixture adapter. Source labels on scan state, proposals, and activity distinguish `gmail` from `simulated`.

## 10. Failure handling

- Missing `.env.local`: status is `unconfigured`; setup guidance remains available.
- Unsupported platform: live controls are disabled; demo mode works.
- OAuth denied or callback invalid: no token is stored; Settings shows a safe retry.
- Missing refresh token after code exchange: connection fails without persisting partial state.
- Revoked or expired refresh token: status becomes `reconnect-required`; the scan cursor and tracker remain unchanged.
- Gmail quota, network, or server error: the previous successful cursor remains; retry is available.
- Expired Gmail history ID: perform one bounded recovery sync and label it.
- Initial or recovery cap reached: persist the successful bounded result, show `truncated`, and do not imply complete mailbox coverage.
- Malformed individual message: ignore that message, continue, and report only a count.
- DPAPI failure: do not store plaintext; connection fails safely.
- Disconnect revocation failure: protected local token is still removed and the user is told Google-side revocation could not be confirmed.

## 11. Testing strategy

All automated tests use deterministic fake transports and temporary secret stores. CI never needs Google credentials, personal email, DPAPI, or network access.

Unit coverage includes:

- Exact OAuth URL, scope, offline access, state, PKCE, expiry, single-use behavior, and token exchange validation.
- Origin, content-type, method, request-size, and safe-error handling.
- Refresh and revocation paths without token logging.
- Windows DPAPI helper protocol, atomic encrypted-file behavior, unsupported-platform behavior, and a check that plaintext tokens never appear in stored bytes.
- Gmail list pagination, 500-message cap, history pagination, duplicate IDs, inbox filtering, expired-history recovery, and cursor preservation on failure.
- MIME traversal, base64url decoding, plain-text preference, HTML fallback, 600-character excerpt, 10-link cap, credential rejection, and malformed-message isolation.
- Browser adapter request/response mapping to `MailAdapter`.

Component coverage includes:

- Settings states and setup copy.
- OAuth start, callback result, first-scan consent, reconnect, disconnect, and demo fallback.
- Daily-on-open eligibility and duplicate-trigger prevention.
- Command Center live/demo source labels and safe failures.
- Update Inbox source evidence flowing through the unchanged approval rules.

Browser coverage includes one deterministic fake-Google journey:

1. Start unconfigured and show setup guidance.
2. Configure fake server credentials and connect through a fake callback.
3. Confirm the 90-day initial scan.
4. Review and approve a live-labelled recruiter proposal.
5. Observe the resulting deadline and meeting link.
6. Simulate token revocation and verify reconnect-required behavior without tracker damage.
7. Disconnect and use the explicitly labelled demo adapter.

The complete gate remains:

```text
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

## 12. Documentation and open-source safety

README documents:

- Google Cloud project, Gmail API, consent-screen test user, OAuth client, and exact redirect URI setup.
- `.env.local` creation and confirmation that it is ignored.
- Windows-only live-token storage for v0.3.
- Restricted-scope and verification implications for anyone publishing a shared OAuth client.
- How to connect, run the first scan, reconnect, disconnect, and use demo mode.
- What is read, what is retained, and what is never stored.

`.env.example` contains placeholders only. Tests verify that `.env.local`, token files, OAuth credentials, and local connection metadata cannot be committed by normal Git operations.

## 13. Acceptance criteria

Version 0.3 is ready when:

1. A Windows user can supply their own Google OAuth configuration and start Job Buddy with one command.
2. The companion binds only to localhost and the browser bundle contains no client secret.
3. The user can connect Gmail through state- and PKCE-protected offline OAuth.
4. The refresh token survives app restarts only as current-user DPAPI-protected bytes.
5. OAuth completion does not read mail until the user confirms the 90-day initial scan.
6. The initial scan processes at most 500 recent inbox messages and clearly reports truncation.
7. Subsequent scans use Gmail History and recover safely from an expired history ID.
8. The browser stores only existing minimal evidence and never a Gmail body or token.
9. Live messages flow through the existing matching, classification, approval, conflict, idempotency, deadline, and meeting-link behavior.
10. Opening Job Buddy starts at most one scan when daily scanning is enabled and the last success is at least 24 hours old.
11. Revoked credentials require reconnection without advancing the cursor or damaging tracker data.
12. Disconnect removes local protected credentials and attempts Google revocation without deleting tracker history.
13. Demo scanning remains functional and is never confused with live Gmail.
14. No test, build output, browser response, log, repository file, or generated artifact exposes credentials, tokens, authorization codes, or email bodies.
15. The full automated verification gate passes without real Google credentials or network access.
