# Job Buddy v0.4: Local Profile Vault and Browser Autofill Buddy

Date: 2026-09-16
Status: Approved design
Target version: `0.4.0`

## 1. Goal

Replace repetitive job-application form entry with a real Chrome and Edge browser extension that works with Job Buddy's local companion. The extension presents a compact floating Buddy, reads only the profile fields needed by the current form, fills fields according to explicit safety rules, and offers to capture a completed application into the dashboard.

Version 0.4 prioritizes the core application workflow. It contains no AI provider, API-key setting, generated answer, interview-preparation model, or remote profile processing.

This design supersedes the simulated-only Buddy implementation plan dated 2026-09-12. That plan remains historical context and must not be executed for v0.4.

## 2. Scope

Version 0.4 includes:

- A dashboard Profile page for reusable candidate information.
- A Windows DPAPI-protected local profile vault owned by the companion.
- One-time pairing between the local companion and a Manifest V3 Chromium extension.
- A compact floating Buddy on user-enabled application sites.
- Approval and automatic-fill modes with non-negotiable guardrails.
- Dedicated Greenhouse, Workday, Oracle Recruiting, and Lever adapters.
- A semantic generic-form fallback for other sites.
- Deterministic field matching, confidence, risk classification, and explanations.
- User-confirmed capture of a submitted application into Job Buddy.
- Revocation, site permissions, activity history, fixtures, tests, and installation documentation.

Version 0.4 does not include:

- Clicking the final Submit button or submitting an application unattended.
- CAPTCHA solving, authentication bypass, OTP handling, or password storage.
- Automatic file selection or resume upload.
- Automatic answers to legal attestations, demographic/EEO questions, signatures, or declarations.
- AI-generated, inferred, or embellished answers.
- Job discovery, scraping, mass application, or unattended navigation.
- Firefox or Safari packaging.
- macOS or Linux profile-vault support; the storage interface remains portable for a later keychain implementation.

## 3. User experience

### 3.1 Profile page

The existing `/profile` placeholder becomes a structured editor with these sections:

- identity and contact details;
- addresses and preferred locations;
- portfolio, GitHub, LinkedIn, and other links;
- education;
- work experience;
- projects and skills;
- Singapore and Hong Kong work authorization;
- availability, relocation, and work preferences;
- salary preferences by market and currency;
- reusable factual answers; and
- document metadata, such as the label of the preferred resume, without storing a browser-usable file path.

Sections save explicitly and show field-level validation, last-updated time, profile completeness, and clear local-only privacy copy. Demographic information is not part of the reusable profile because Buddy never fills it.

Passwords, session cookies, one-time codes, payment details, signatures, and third-party account credentials cannot be added to the profile.

### 3.2 Floating Buddy

Buddy appears as a compact pill in the lower-right corner after the user enables Job Buddy for the current site. It expands into a restrained, Apple-inspired panel with neutral surfaces, crisp separators, strong text contrast, 44-pixel minimum touch targets, keyboard navigation, screen-reader labels, and reduced-motion support.

The panel has explicit states:

- unpaired;
- site access required;
- scanning;
- fields found;
- approval preview;
- filling;
- filled with unresolved fields;
- confirmation detected;
- unsupported or blocked; and
- paused.

It shows matched, unresolved, skipped, and manual fields separately. Every proposed fill displays the destination label, profile source, confidence, risk tier, and reason. The panel never covers the focused field and can be collapsed, moved between lower corners, paused globally, or disabled for the current domain.

### 3.3 Modes

Approval mode is the default. It previews every proposed change and fills only the items the user selects.

Automatic-fill mode may fill a field only when all of these are true:

1. the field is on the safe-field allowlist;
2. the match confidence is at least `0.90`;
3. the field is empty;
4. the selected profile value is valid and user-confirmed;
5. the current domain is enabled; and
6. Buddy is not paused.

Automatic-fill is not unrestricted submission. Review and manual fields retain their guardrails in both modes. Changing to automatic-fill requires one explicit confirmation that explains the boundary.

## 4. Safety classification

Buddy uses a strict classification before it sees a profile value.

### Safe

- name and preferred name;
- email and phone;
- address and location;
- portfolio and professional links;
- education;
- work experience;
- projects; and
- skills.

Safe fields may be filled automatically only under the conditions in section 3.3.

### Review required

- salary and compensation expectations;
- notice period and availability;
- relocation and travel preferences;
- sponsorship and work authorization;
- custom free-text questions; and
- any match below `0.90` confidence.

Review fields are never filled without an individual user decision. Buddy never generates or infers missing prose.

### Manual only

- demographic and EEO questions;
- disability or veteran status;
- legal attestations and declarations;
- consent checkboxes whose meaning depends on page text;
- signatures;
- CAPTCHA, passwords, OTPs, and security questions;
- file inputs and document uploads; and
- the final application submission control.

Buddy may point out a manual field but never changes it. A non-empty field is never overwritten without approval, regardless of mode or tier.

## 5. Runtime architecture

Version 0.4 has three isolated layers:

1. The existing React dashboard owns profile editing, pairing controls, automation-preference editing, activity review, pending-capture review, and tracker persistence in IndexedDB.
2. The existing localhost Node companion owns profile encryption, extension authentication, pairing, revocation, the authoritative automation preferences, the bounded metadata-only activity log, and the pending-capture handoff queue.
3. The Manifest V3 extension owns site permission, DOM inspection, deterministic matching, the floating Buddy, guarded filling, and confirmation detection.

The extension contains:

- a service worker that owns the pairing token and all localhost requests;
- content scripts that inspect and update only the active application page;
- vendor adapters behind one normalized form contract;
- a pure matcher and policy engine; and
- the isolated Buddy UI, mounted in a Shadow DOM root to avoid page-style collisions.

Content scripts never receive the raw pairing token. They send versioned, validated messages to the service worker. The service worker requests only the canonical profile paths identified by the matcher and returns only those values.

The dashboard and extension share versioned TypeScript contracts but do not import each other's runtime code. Server modules do not import browser DOM code, and extension code does not import React dashboard or IndexedDB modules.

## 6. Profile vault

`ProfileVault` is a portable server-side interface:

```ts
interface ProfileVault {
  isSupported(): boolean;
  read(paths?: readonly ProfilePath[]): Promise<ProfileSelection>;
  replace(profile: CandidateProfile): Promise<void>;
  delete(): Promise<void>;
}
```

The Windows implementation validates the entire profile against a versioned schema, serializes it to UTF-8 JSON, protects it for the current Windows user with DPAPI, and writes the encrypted bytes atomically below `%LOCALAPPDATA%\JobBuddy\profile`. Plaintext is never written to disk or logged.

The companion returns only requested canonical paths to an authenticated extension. The dashboard can read and replace the full profile from its exact allowed origin. Unsupported platforms expose a safe unsupported state and never fall back to plaintext.

The existing unused IndexedDB `profileFields` table is not used for profile values in v0.4. A later database migration may remove it after compatibility review.

## 7. Pairing and extension authentication

Pairing is local, explicit, expiring, and revocable:

1. The dashboard asks the companion to create a cryptographically random one-time code.
2. The code is displayed for five minutes and stored in memory only.
3. The user enters it in the extension.
4. The extension service worker sends the code from its `chrome-extension://` origin.
5. The companion validates the code, expiry, single-use state, and extension origin, then issues a random bearer token scoped to profile selection and capture handoff.
6. The extension stores the token in its private `chrome.storage.local`; the companion stores only a SHA-256 token hash and the paired extension origin.

Pairing codes and bearer tokens never appear in URLs or logs. A new pairing invalidates the previous token. The dashboard can revoke the extension immediately. Revoked, malformed, missing, or wrong-origin tokens receive a generic unauthorized response. The token scope permits profile selection, preference reads, metadata-only activity writes, and capture handoff; it does not permit full-profile export, profile editing, Gmail access, or tracker access.

CORS is not treated as authentication. Extension endpoints require both an exact paired extension origin and a constant-time token-hash match. Dashboard endpoints retain the existing exact-origin and JSON-content-type protections. The companion remains bound to `127.0.0.1`.

The local threat model protects secrets at rest, prevents arbitrary websites and unpaired extensions from using the companion, and minimizes data exposed to an approved page. It does not claim to defend against malware already running as the same Windows user, a compromised browser profile, or a malicious application page after the user explicitly grants that domain access. Those limits are stated in the security documentation.

## 8. Local API

The companion adds:

```text
GET    /api/profile
PUT    /api/profile
DELETE /api/profile

POST   /api/buddy/pairing/start
POST   /api/buddy/pairing/complete
DELETE /api/buddy/pairing
GET    /api/buddy/status

POST   /api/buddy/profile/select
GET    /api/buddy/preferences
PUT    /api/buddy/preferences
GET    /api/buddy/activity
POST   /api/buddy/activity
POST   /api/buddy/captures
GET    /api/buddy/captures
DELETE /api/buddy/captures/:id
```

The dashboard-only profile routes accept a bounded, versioned profile document. `profile/select` accepts a bounded list of recognized canonical paths and never supports arbitrary object traversal.

Preferences contain only mode, global pause, and domain policy. The dashboard may read and edit them; the authenticated extension may read them and write only global pause or a policy for its current paired origin and user-enabled domain. Activity entries contain field category, disposition, reason code, mode, adapter, domain, and timestamp only. Activity storage is bounded and may be cleared from the dashboard.

An extension capture contains only job metadata: company, role, location, sanitized source URL, platform, detected completion time, and a random completion identifier. The source URL must be HTTPS, must contain no credentials, and is reduced to origin plus pathname with query and fragment removed. A capture cannot contain profile values, answers, page HTML, cookies, or form contents. The local queue is bounded, atomically stored below `%LOCALAPPDATA%\JobBuddy\buddy`, and excludes expired entries after 30 days.

The dashboard reviews a pending capture, writes the approved application and initial `applied` stage event to the existing IndexedDB transaction, then acknowledges queue deletion. A failed dashboard write leaves the queue item intact for retry. Duplicate completion identifiers or canonical company-role-URL combinations do not create duplicate applications.

## 9. Site permission model

The extension requests only `storage`, `activeTab`, and `scripting` at installation plus localhost companion access. Third-party host access is optional.

The user enables Buddy on the current application domain from the extension. After the browser grants that optional host permission, the service worker registers or injects the content script for that domain. The user can revoke any domain from the extension or dashboard settings. The generic fallback never grants itself access to every website.

Dedicated adapters recognize Greenhouse, Workday, Oracle Recruiting, and Lever by DOM structure and platform markers, not by company name. Unsupported cross-origin frames remain untouched and are reported clearly.

## 10. Form adapters and deterministic matching

Every adapter produces a normalized field inventory:

```ts
type DetectedField = {
  id: string;
  label: string;
  kind: "text" | "email" | "tel" | "url" | "textarea" | "select" | "radio" | "checkbox" | "file" | "other";
  required: boolean;
  currentValuePresent: boolean;
  canonicalPath?: ProfilePath;
  confidence: number;
  risk: "safe" | "review" | "manual";
  reason: string;
};
```

Matching considers, in descending priority:

1. standard `autocomplete` tokens and exact vendor identifiers;
2. known platform aliases;
3. associated labels and accessible names;
4. input type, select options, and nearby help text; and
5. conservative normalized-label aliases.

Free-form semantic similarity is not used. High-impact fields cannot be classified from a fuzzy label. Unknown fields remain unresolved.

Filling uses native element property setters and the expected `input`, `change`, and `blur` events so controlled forms observe the change. Select and radio values must match an available option exactly after conservative normalization. Adapters use a debounced, bounded observer for dynamic sections and cannot create an unbounded mutation loop.

Buddy re-checks the element, value, visibility, enabled state, and label immediately before writing. It never executes page-provided strings or uses `innerHTML` for extracted content.

## 11. Confirmation and tracker capture

Buddy considers a possible completion only after a user-initiated submit interaction followed by at least one strong signal, such as a recognized confirmation heading, a known vendor success state, or navigation to a distinct confirmation URL. Losing the form alone is insufficient.

The panel then shows the extracted job metadata and asks the user to send it to Job Buddy. Nothing is queued silently. When the dashboard receives it, the user can correct the company, role, location, industry, source, and date before saving.

Saving creates the application at `applied`, records a stage event with origin `buddy`, and offers the existing explicit Gmail scan. The extension does not trigger Gmail directly and a live scan never runs without the dashboard's existing consent and connection rules.

## 12. Failure handling

- Missing or unsupported profile vault: show setup guidance; do not fill.
- Companion offline: preserve the page, show a retry state, and never cache profile values.
- Pairing expired or token revoked: return to unpaired without exposing why authentication failed.
- Site permission denied: remain inactive on that site.
- Unknown form or field: show unsupported/unresolved; do not guess.
- DOM changed between preview and fill: skip the changed field and rescan.
- Page navigation during fill: cancel remaining work.
- Content security policy or frame isolation: report the inaccessible section; do not bypass it.
- Invalid or stale profile value: require profile correction.
- Pending-capture queue full: keep the local confirmation visible and ask the user to clear or import existing captures.
- Any adapter error: isolate it to the current page and keep the global pause/revocation controls available.

## 13. Privacy and logging

The extension and companion may log adapter name, route, status, duration, field counts, confidence bands, and error codes. They never log profile values, answers, labels containing user-entered text, page HTML, cookies, tokens, pairing codes, or complete application URLs with query strings.

Profile values exist in the content script only long enough to perform the approved fill and are not written to extension storage. Closing or navigating the page discards them. Activity history records field category, decision, reason, mode, domain, and timestamp, not the filled value.

No profile, form, or application data is sent to an AI provider or any remote Job Buddy service.

## 14. Testing strategy

All automated tests use temporary stores and local synthetic pages. CI requires no personal profile, ATS account, external site, or network access.

Unit coverage includes:

- profile schema validation, partial edits, unsupported fields, DPAPI protocol, atomic writes, and plaintext-artifact checks;
- one-time pairing entropy, expiry, single use, origin binding, token hashing, rotation, revocation, and constant-time validation;
- endpoint origin, content type, request size, path allowlist, queue cap, expiry, safe errors, and no-secret logging;
- risk classification, match thresholds, aliases, existing-value protection, select matching, and the no-submit invariant;
- capture validation, duplicate prevention, queue retry, and application transaction behavior; and
- message-contract version and payload rejection.

Adapter tests run against maintained local HTML fixtures for Greenhouse, Workday, Oracle Recruiting, Lever, and generic forms. Fixtures cover required fields, dynamic sections, controlled inputs, ambiguous labels, manual fields, non-empty values, DOM replacement, and confirmation states.

Playwright loads the unpacked extension in Chromium and verifies:

1. pairing with a fake temporary vault;
2. per-domain permission and Buddy injection;
3. approval preview and selective fill;
4. automatic safe-field fill with review/manual fields untouched;
5. dynamic form rescanning and navigation cancellation;
6. the final Submit control is never activated by Buddy;
7. user-confirmed capture appears in the dashboard and saves once; and
8. pause and revocation prevent further profile reads or fills.

The full gate is:

```text
npm test
npm run typecheck
npm run build
npm run build:extension
npm run test:e2e
npm run test:e2e:extension
npm run verify:secrets
git diff --check
```

## 15. Delivery sequence

Implementation remains one v0.4 release but proceeds through independently verifiable slices:

1. Shared profile, form, risk, message, and capture contracts.
2. DPAPI profile vault, companion profile API, and dashboard Profile page.
3. Pairing, authentication, revocation, and extension shell.
4. Generic and Greenhouse adapters with approval and automatic-fill policy.
5. Workday, Oracle Recruiting, and Lever adapters.
6. Confirmation detection, pending-capture queue, and tracker import.
7. Accessibility, browser packaging, security checks, fixtures, documentation, and full regression verification.

Each slice is test-driven and committed only after its focused tests and type checking pass. The existing Gmail and tracker behavior must remain green throughout.

## 16. Acceptance criteria

Version 0.4 is ready when:

1. A Windows user can create and edit a validated profile whose plaintext never reaches disk or logs.
2. A Chrome or Edge extension can pair through an expiring one-time code and be revoked from Job Buddy.
3. The extension requests access only for user-enabled application domains.
4. Buddy recognizes Greenhouse, Workday, Oracle Recruiting, Lever, and the supported generic fixture contract.
5. Approval mode previews every field and fills only selected items.
6. Automatic-fill changes only empty, safe, valid, user-confirmed fields matched at `0.90` confidence or higher.
7. Review and manual fields retain their restrictions in every mode.
8. Buddy never selects a file, solves a CAPTCHA, fills credentials or EEO answers, accepts a legal attestation, or activates final Submit.
9. A non-empty or changed field is not overwritten without approval.
10. Profile values are requested by canonical path, are never persisted by the extension, and are discarded after use.
11. A strong post-submit confirmation can produce a user-reviewed pending capture containing job metadata only.
12. An approved capture creates exactly one tracker application and one initial `buddy` stage event, then offers the existing Gmail scan.
13. Unsupported pages, frames, fields, offline states, revocation, and DOM changes fail visibly and safely.
14. The floating Buddy is keyboard accessible, high contrast, reduced-motion aware, and does not obstruct the active field.
15. No AI integration, API-key setting, generated answer, profile transmission, or remote Job Buddy service is present.
16. The complete automated verification gate passes without real ATS credentials or external network access.
