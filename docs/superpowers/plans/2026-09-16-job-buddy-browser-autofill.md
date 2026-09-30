# Job Buddy Browser Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Job Buddy v0.4 with a Windows-encrypted candidate profile, a paired Chrome/Edge extension, guarded autofill for common ATS forms, and user-confirmed tracker capture.

**Architecture:** The React dashboard edits profile and Buddy settings, while the localhost companion owns DPAPI encryption, extension authentication, preferences, activity, and a pending-capture queue. A Manifest V3 extension requests per-domain access, detects fields through platform adapters, requests only matched profile paths, and fills according to a pure deterministic policy that cannot submit applications.

**Tech Stack:** React 19, TypeScript, Zod, Node HTTP, Windows DPAPI, Dexie, Manifest V3, esbuild, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-job-buddy-browser-autofill-design.md`

## Global Constraints

- AI integration, API-key settings, generated answers, and remote profile processing are excluded.
- Approval mode is the default.
- Automatic-fill may change only empty safe fields with confidence at least `0.90` and a confirmed valid profile value.
- Salary, availability, relocation, sponsorship, work authorization, custom prose, and matches below `0.90` always require review.
- EEO/demographic fields, legal attestations, signatures, credentials, CAPTCHA, files, and final Submit are manual only.
- Buddy never overwrites a non-empty field without explicit approval.
- The companion binds only to `127.0.0.1` and plaintext profile values never reach disk or logs.
- Chrome and Edge are the v0.4 browser targets; profile persistence is Windows-only.
- Each implementation task starts with a failing test, finishes with focused verification, and receives a separate commit.
- Existing Gmail, tracker, import/export, stage, and filter behavior must remain green.

---

## File map

### Shared browser/server contracts

- `src/domain/profile.ts` — versioned candidate-profile schema, bounded collection schemas, canonical path parser, selection, and redaction-safe validation errors.
- `src/domain/profile.test.ts` — profile and canonical-path contract tests.
- `src/domain/buddy.ts` — detected-field, risk, preference, activity, pending-capture, and extension-message schemas.
- `src/domain/buddy.test.ts` — policy-contract and message validation tests.

### Companion profile and Buddy services

- `server/profile/ProfileVault.ts` — profile-vault port.
- `server/profile/WindowsDpapiProfileVault.ts` — current-user DPAPI protected profile file.
- `server/profile/WindowsDpapiProfileVault.test.ts` — protection, atomicity, unsupported-platform, and plaintext-artifact tests.
- `server/profile/ProfileService.ts` — validated full-profile and selected-path operations.
- `server/secrets/WindowsDpapi.ts` — shared fixed-command current-user DPAPI byte protection.
- `server/secrets/WindowsDpapi.test.ts` — standard-input protocol and malformed-output tests.
- `server/buddy/PairingService.ts` — expiring code, origin-bound hashed token, rotation, revocation, and authorization.
- `server/buddy/PairingService.test.ts` — deterministic clock/random pairing tests.
- `server/buddy/BuddyStore.ts` — bounded atomic preferences, metadata-only activity, and pending-capture persistence.
- `server/buddy/BuddyStore.test.ts` — bounds, sanitization, expiry, and retry tests.
- `server/buddy/BuddyService.ts` — permission-scoped extension operations.
- `server/http/createCompanionServer.ts` — dashboard and extension API routing and authentication.
- `server/http/createCompanionServer.test.ts` — origin, bearer, body, safe-response, and route tests.
- `server/start.ts` — production service wiring.

### Dashboard

- `src/features/profile/profileClient.ts` — typed companion profile client.
- `src/features/profile/ProfilePage.tsx` — structured profile editor and completeness summary.
- `src/features/profile/ProfilePage.test.tsx` — loading, validation, partial save, unsupported, and privacy-copy tests.
- `src/features/profile/profile.css` — Profile page layout and responsive states.
- `src/features/buddy/buddyClient.ts` — pairing, preferences, activity, and pending-capture client.
- `src/features/buddy/BuddySettings.tsx` — pairing, revocation, mode, pause, domains, and activity UI.
- `src/features/buddy/BuddySettings.test.tsx` — settings behavior tests.
- `src/features/buddy/PendingCaptures.tsx` — review/edit/import interface.
- `src/features/buddy/PendingCaptures.test.tsx` — capture import and retry tests.
- `src/features/buddy/captureApplication.ts` — transactional, idempotent tracker creation.
- `src/features/buddy/captureApplication.test.ts` — duplicate and stage-event tests.
- `src/features/settings/SettingsPage.tsx` — render Gmail and Buddy settings sections.
- `src/app/routes.tsx` — replace Profile placeholder.

### Extension

- `extension/manifest.json` — minimal required permissions plus optional HTTPS host access.
- `extension/src/service-worker.ts` — site enablement, pairing token ownership, companion requests, and message validation.
- `extension/src/service-worker.test.ts` — token isolation, domain permission, and safe companion-message tests.
- `extension/src/content.ts` — adapter selection, scan/fill lifecycle, navigation cancellation, and confirmation handling.
- `extension/src/content.test.ts` — content lifecycle with synthetic DOM.
- `extension/src/companionClient.ts` — authenticated localhost client used only by the service worker.
- `extension/src/companionClient.test.ts` — exact headers, safe errors, and token non-leakage.
- `extension/src/ui/BuddyPanel.ts` — Shadow DOM floating panel and accessible state rendering.
- `extension/src/ui/BuddyPanel.test.ts` — keyboard, contrast-class, collapse, corner, and reduced-motion behavior.
- `extension/src/ui/styles.ts` — isolated visual tokens and Buddy styles.
- `extension/src/matching/matchFields.ts` — deterministic canonical matching and confidence.
- `extension/src/matching/matchFields.test.ts` — exact, alias, ambiguous, and unknown mappings.
- `extension/src/matching/planFill.ts` — mode and risk guardrails.
- `extension/src/matching/planFill.test.ts` — approval, automatic, changed-field, pause, and no-submit invariants.
- `extension/src/adapters/types.ts` — normalized adapter interface.
- `extension/src/adapters/dom.ts` — safe DOM extraction and native setter helpers.
- `extension/src/adapters/generic.ts` — semantic generic form adapter.
- `extension/src/adapters/greenhouse.ts` — Greenhouse markers and aliases.
- `extension/src/adapters/workday.ts` — Workday dynamic-section behavior.
- `extension/src/adapters/oracle.ts` — Oracle Recruiting markers and fields.
- `extension/src/adapters/lever.ts` — Lever markers and confirmation state.
- `extension/src/adapters/adapters.test.ts` — local vendor fixture coverage.
- `extension/fixtures/*.html` — deterministic ATS and generic pages.
- `scripts/build-extension.mjs` — esbuild bundling and manifest copy.
- `scripts/verify-client-secrets.mjs` — include the extension output in artifact scanning.

### End-to-end and documentation

- `e2e/profile-and-pairing.spec.ts` — dashboard profile and pairing journey.
- `e2e-extension/buddy-autofill.spec.ts` — unpacked-extension approval, automatic-fill, pause, revoke, and capture journey.
- `playwright.extension.config.ts` — persistent Chromium extension context and local fixture server.
- `README.md` — installation, local companion, unpacked Chrome/Edge extension, security boundary, and troubleshooting.

---

### Task 1: Define versioned profile and Buddy contracts

**Files:**
- Create: `src/domain/profile.ts`
- Create: `src/domain/profile.test.ts`
- Create: `src/domain/buddy.ts`
- Create: `src/domain/buddy.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Zod and the existing ISO timestamp conventions.
- Produces: `CandidateProfile`, `ProfilePath`, `parseProfilePath`, `selectProfilePaths`, `BuddyPreferences`, `BuddyActivityEntry`, `PendingCapture`, `DetectedField`, `FillDecision`, `ExtensionRequest`, and `ExtensionResponse`.

- [ ] **Step 1: Add the extension build dependencies**

Run: `npm install --save-dev esbuild @types/chrome`

Expected: `package.json` and `package-lock.json` add only `esbuild` and `@types/chrome` as direct development dependencies.

- [ ] **Step 2: Write failing profile contract tests**

```ts
import { describe, expect, it } from "vitest";
import { candidateProfileSchema, parseProfilePath, selectProfilePaths } from "./profile";

describe("candidate profile", () => {
  it("accepts partial factual data and rejects demographic or credential keys", () => {
    const profile = candidateProfileSchema.parse({
      version: 1,
      identity: { givenName: "Alex", familyName: "Tan" },
      contact: { email: "alex@example.com" },
      education: [], experience: [], projects: [], skills: [], standardAnswers: [],
    });
    expect(profile.identity.givenName).toBe("Alex");
    expect(candidateProfileSchema.safeParse({ ...profile, password: "secret" }).success).toBe(false);
  });

  it("allows only bounded canonical collection paths", () => {
    expect(parseProfilePath("education.0.institution")).toBe("education.0.institution");
    expect(() => parseProfilePath("education.5.institution")).toThrow("invalid-profile-path");
    expect(() => parseProfilePath("__proto__.polluted")).toThrow("invalid-profile-path");
  });

  it("selects only requested scalar values", () => {
    const profile = candidateProfileSchema.parse({ version: 1, identity: { givenName: "Alex" }, contact: {}, education: [], experience: [], projects: [], skills: ["TypeScript"], standardAnswers: [] });
    expect(selectProfilePaths(profile, ["identity.givenName", "skills"])).toEqual({ "identity.givenName": "Alex", skills: ["TypeScript"] });
  });
});
```

- [ ] **Step 3: Run the profile tests and confirm the red state**

Run: `npm test -- src/domain/profile.test.ts`

Expected: FAIL because `src/domain/profile.ts` does not exist.

- [ ] **Step 4: Implement the profile schema and path allowlist**

```ts
export const candidateProfileSchema = z.object({
  version: z.literal(1),
  identity: z.object({ givenName: text.optional(), familyName: text.optional(), preferredName: text.optional() }).strict(),
  contact: contactSchema,
  links: linksSchema.default({}),
  education: educationSchema.array().max(5),
  experience: experienceSchema.array().max(10),
  projects: projectSchema.array().max(10),
  skills: text.array().max(100),
  preferences: preferencesSchema.default({}),
  standardAnswers: standardAnswerSchema.array().max(50),
}).strict();

export function parseProfilePath(input: string): ProfilePath {
  if (staticPaths.has(input)) return input as ProfilePath;
  const match = /^(education|experience|projects)\.(\d+)\.([a-zA-Z]+)$/.exec(input);
  if (!match || !collectionFieldAllowed(match[1], Number(match[2]), match[3])) throw new Error("invalid-profile-path");
  return input as ProfilePath;
}
```

- [ ] **Step 5: Write failing Buddy contract tests**

```ts
it("rejects executable and unknown extension messages", () => {
  expect(extensionRequestSchema.safeParse({ version: 1, type: "select-profile", paths: ["identity.givenName"] }).success).toBe(true);
  expect(extensionRequestSchema.safeParse({ version: 1, type: "eval", code: "alert(1)" }).success).toBe(false);
});

it("strips capture query strings and rejects non-HTTPS URLs", () => {
  expect(parsePendingCapture({ ...capture, sourceUrl: "https://jobs.example/role?token=private#apply" }).sourceUrl).toBe("https://jobs.example/role");
  expect(() => parsePendingCapture({ ...capture, sourceUrl: "http://jobs.example/role" })).toThrow("invalid-capture");
});
```

- [ ] **Step 6: Implement strict Buddy schemas**

Define discriminated Zod unions for extension messages and exact schemas for preferences, activity, detected fields, fill decisions, and pending captures. `parsePendingCapture` must rebuild the URL as `${url.origin}${url.pathname}` and never retain username, password, query, or fragment.

- [ ] **Step 7: Verify and commit contracts**

Run: `npm test -- src/domain/profile.test.ts src/domain/buddy.test.ts && npm run typecheck`

Expected: PASS with rejected unknown keys, bounded collections, safe paths, sanitized captures, and strict message unions.

```bash
git add package.json package-lock.json src/domain/profile.ts src/domain/profile.test.ts src/domain/buddy.ts src/domain/buddy.test.ts
git commit -m "feat: define Buddy profile contracts"
```

---

### Task 2: Protect the candidate profile with Windows DPAPI

**Files:**
- Create: `server/profile/ProfileVault.ts`
- Create: `server/profile/WindowsDpapiProfileVault.ts`
- Create: `server/profile/WindowsDpapiProfileVault.test.ts`
- Create: `server/profile/ProfileService.ts`
- Create: `server/profile/ProfileService.test.ts`
- Create: `server/secrets/WindowsDpapi.ts`
- Create: `server/secrets/WindowsDpapi.test.ts`
- Modify: `server/secrets/WindowsDpapiSecretStore.ts`
- Modify: `server/secrets/WindowsDpapiSecretStore.test.ts`

**Interfaces:**
- Consumes: `CandidateProfile`, `ProfilePath`, `candidateProfileSchema`, and `selectProfilePaths` from Task 1.
- Produces: `ProfileVault`, `WindowsDpapiProfileVault`, and `ProfileService` with `status`, `read`, `replace`, `select`, and `delete` methods.

- [ ] **Step 1: Write failing encrypted-vault tests**

```ts
it("atomically stores protected bytes without plaintext", async () => {
  const runner = fakeDpapiRunner();
  const vault = new WindowsDpapiProfileVault({ root, runner, platform: "win32" });
  await vault.replace(profileWithEmail("alex@example.com"));
  const bytes = await readFile(vault.profilePath);
  expect(bytes.toString("utf8")).not.toContain("alex@example.com");
  expect(await vault.read()).toEqual(profileWithEmail("alex@example.com"));
});

it("never falls back to plaintext off Windows", async () => {
  const vault = new WindowsDpapiProfileVault({ root, runner: fakeDpapiRunner(), platform: "darwin" });
  await expect(vault.replace(profileWithEmail("alex@example.com"))).rejects.toThrow("platform-unsupported");
  await expect(access(vault.profilePath)).rejects.toMatchObject({ code: "ENOENT" });
});
```

- [ ] **Step 2: Run the vault tests and confirm the red state**

Run: `npm test -- server/profile/WindowsDpapiProfileVault.test.ts`

Expected: FAIL because the vault is missing.

- [ ] **Step 3: Extract the shared DPAPI byte protector and implement the vault**

Move the fixed encoded PowerShell commands, `CommandRunner`, base64 validation, and `protect`/`unprotect` byte operations from `WindowsDpapiSecretStore` into `server/secrets/WindowsDpapi.ts`. Keep the Gmail store's public behavior and error messages unchanged. The profile vault protects validated profile JSON and stores it at `%LOCALAPPDATA%\JobBuddy\profile\candidate-profile.bin`. Pass profile bytes over standard input, use `wx` temporary files with mode `0o600`, sync before rename, and delete the temporary file on every failure.

```ts
export interface ProfileVault {
  isSupported(): boolean;
  read(): Promise<CandidateProfile | null>;
  replace(profile: CandidateProfile): Promise<void>;
  delete(): Promise<void>;
}
```

- [ ] **Step 4: Write failing ProfileService tests**

```ts
it("returns only explicitly selected paths", async () => {
  const service = new ProfileService(memoryVault(completeProfile));
  expect(await service.select(["identity.givenName", "skills"])).toEqual({ "identity.givenName": "Alex", skills: ["TypeScript"] });
});

it("rejects an invalid replacement before calling the vault", async () => {
  const vault = memoryVault(null);
  await expect(serviceFor(vault).replace({ version: 1, password: "secret" })).rejects.toThrow("invalid-profile");
  expect(vault.replace).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement ProfileService validation and selection**

`status()` returns `{ platformSupported, hasProfile }`; `read()` returns the full validated profile or the empty version-1 shape; `replace()` accepts `unknown`, parses it, and hands only the parsed value to the vault; `select()` parses every path before reading; `delete()` delegates to the vault.

- [ ] **Step 6: Verify and commit profile protection**

Run: `npm test -- server/profile server/secrets/WindowsDpapi.test.ts server/secrets/WindowsDpapiSecretStore.test.ts && npm run typecheck`

Expected: PASS for protection, unprotection, atomicity, unsupported platforms, corrupt bytes, selection, deletion, and plaintext absence.

```bash
git add server/profile server/secrets/WindowsDpapi.ts server/secrets/WindowsDpapi.test.ts server/secrets/WindowsDpapiSecretStore.ts server/secrets/WindowsDpapiSecretStore.test.ts
git commit -m "feat: protect candidate profile with DPAPI"
```

---

### Task 3: Expose the profile API and dashboard editor

**Files:**
- Modify: `server/http/createCompanionServer.ts`
- Modify: `server/http/createCompanionServer.test.ts`
- Modify: `server/start.ts`
- Create: `src/features/profile/profileClient.ts`
- Create: `src/features/profile/ProfilePage.tsx`
- Create: `src/features/profile/ProfilePage.test.tsx`
- Create: `src/features/profile/profile.css`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: `ProfileService` from Task 2 and the dashboard allowed-origin policy.
- Produces: `GET/PUT/DELETE /api/profile`, `ProfileClient`, and the `/profile` editor.

- [ ] **Step 1: Write failing profile-route tests**

```ts
it("accepts a bounded validated profile only from the dashboard origin", async () => {
  const profile = profileService();
  const base = await start(services({ profile }));
  const denied = await fetch(`${base}/api/profile`, { method: "PUT", headers: jsonHeaders("https://evil.example"), body: JSON.stringify(validProfile) });
  const saved = await fetch(`${base}/api/profile`, { method: "PUT", headers: jsonHeaders(UI_ORIGIN), body: JSON.stringify(validProfile) });
  expect(denied.status).toBe(403);
  expect(saved.status).toBe(204);
  expect(profile.replace).toHaveBeenCalledWith(validProfile);
});
```

- [ ] **Step 2: Run the route test and confirm the red state**

Run: `npm test -- server/http/createCompanionServer.test.ts`

Expected: FAIL because `CompanionServerServices` has no profile service and the route returns 404.

- [ ] **Step 3: Add profile routes without weakening Gmail security**

Raise the bounded JSON limit only for `/api/profile` to `128 KiB`; keep the existing `16 KiB` default for other routes. Require exact dashboard origin on all profile routes, JSON on `PUT` and `DELETE`, and return only `{ platformSupported, hasProfile, profile }` on `GET`.

- [ ] **Step 4: Write the failing Profile page test**

```tsx
it("saves a partial profile and explains local encryption", async () => {
  const client = fakeProfileClient(emptyProfile);
  render(<ProfilePage client={client} />);
  await user.type(await screen.findByLabelText("First name"), "Alex");
  await user.type(screen.getByLabelText("Email"), "alex@example.com");
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  expect(client.replace).toHaveBeenCalledWith(expect.objectContaining({ identity: expect.objectContaining({ givenName: "Alex" }) }));
  expect(screen.getByText(/encrypted for your Windows account/i)).toBeVisible();
});
```

- [ ] **Step 5: Implement the typed client and editor**

Build controlled sections for identity/contact, links, education, experience, projects/skills, market preferences, salary preferences, and reusable answers. Add/remove collection rows with stable local IDs, parse salary as positive integer or absent, validate email and HTTPS links, save explicitly, and never render demographic or credential inputs.

Add `Delete local profile`, guarded by a confirmation callback. On success it calls `DELETE /api/profile`, resets the editor to the empty version-1 shape, and leaves applications, Gmail, Buddy pairing, activity, and pending captures unchanged.

- [ ] **Step 6: Add responsive profile styling and route it**

Use existing design tokens, white cards, crisp one-pixel borders, visible labels, 44-pixel controls, two columns above `900px`, one column below, clear focus rings, and no large gradients.

- [ ] **Step 7: Verify and commit the profile UI**

Run: `npm test -- server/http/createCompanionServer.test.ts src/features/profile/ProfilePage.test.tsx src/app/routes.test.tsx && npm run typecheck`

Expected: PASS for origin rejection, payload bounds, invalid profile, unsupported platform, partial save, collection editing, errors, and routing.

```bash
git add server/http server/start.ts src/features/profile src/app/routes.tsx
git commit -m "feat: add encrypted profile editor"
```

---

### Task 4: Implement pairing, preferences, activity, and capture storage

**Files:**
- Create: `server/buddy/PairingService.ts`
- Create: `server/buddy/PairingService.test.ts`
- Create: `server/buddy/BuddyStore.ts`
- Create: `server/buddy/BuddyStore.test.ts`
- Create: `server/buddy/BuddyService.ts`
- Create: `server/buddy/BuddyService.test.ts`

**Interfaces:**
- Consumes: `ProfileService`, `BuddyPreferences`, `BuddyActivityEntry`, and `PendingCapture`.
- Produces: `PairingService.start`, `PairingService.complete`, `PairingService.authorize`, `PairingService.revoke`, and `BuddyService` methods for extension-scoped reads/writes.

- [ ] **Step 1: Write failing PairingService tests**

```ts
it("uses one code once, binds the extension origin, and stores only a token hash", async () => {
  const service = pairing({ now: () => NOW, randomBytes: deterministicRandom });
  const { code } = service.start();
  const paired = await service.complete({ code, origin: "chrome-extension://abcdefghijklmnop" });
  expect(service.snapshot()).toEqual(expect.objectContaining({ origin: "chrome-extension://abcdefghijklmnop", tokenHash: expect.not.stringContaining(paired.token) }));
  await expect(service.complete({ code, origin: "chrome-extension://abcdefghijklmnop" })).rejects.toThrow("invalid-pairing");
  expect(await service.authorize(paired.token, "chrome-extension://abcdefghijklmnop")).toBe(true);
  expect(await service.authorize(paired.token, "chrome-extension://other")).toBe(false);
});
```

- [ ] **Step 2: Implement pairing with injectable randomness and clock**

Generate a 10-character code from rejection-sampled random bytes, expire it after five minutes, compare code and token hash with `timingSafeEqual`, validate `chrome-extension://[a-p]{32}` origins, store pairing metadata atomically, rotate on new pairing, and make `revoke()` idempotent.

- [ ] **Step 3: Write failing BuddyStore tests**

```ts
it("bounds metadata-only activity and expires captures", async () => {
  const store = new BuddyStore({ root, now: () => NOW });
  await Promise.all(Array.from({ length: 505 }, (_, index) => store.appendActivity(activity(index))));
  expect(await store.listActivity()).toHaveLength(500);
  await store.addCapture(capture({ detectedAt: "2026-08-01T00:00:00.000Z" }));
  expect(await store.listCaptures()).toEqual([]);
  expect(JSON.stringify(await store.listActivity())).not.toContain("alex@example.com");
});
```

- [ ] **Step 4: Implement bounded atomic Buddy persistence**

Store preferences, activity, captures, and pairing metadata as separate JSON files below `%LOCALAPPDATA%\JobBuddy\buddy`. Parse every file on read, replace invalid files with safe defaults without reflecting their contents, retain 500 activity entries, retain 100 captures for 30 days, provide an idempotent `clearActivity()` operation, and serialize mutating operations through one promise queue to prevent lost updates.

- [ ] **Step 5: Implement BuddyService authorization scopes**

```ts
export class BuddyService {
  pairStart(): PairingStart;
  pairComplete(input: { code: string; origin: string }): Promise<{ token: string }>;
  revoke(): Promise<void>;
  selectProfile(auth: ExtensionAuth, paths: string[]): Promise<ProfileSelection>;
  readPreferences(auth: ExtensionAuth): Promise<BuddyPreferences>;
  updateExtensionPreference(auth: ExtensionAuth, patch: ExtensionPreferencePatch): Promise<BuddyPreferences>;
  appendActivity(auth: ExtensionAuth, input: unknown): Promise<void>;
  addCapture(auth: ExtensionAuth, input: unknown): Promise<PendingCapture>;
}
```

The extension patch may change only global pause, mode after explicit confirmation evidence, or its current enabled domain. It cannot replace the full profile, list activity, list captures, or touch Gmail.

- [ ] **Step 6: Verify and commit Buddy services**

Run: `npm test -- server/buddy && npm run typecheck`

Expected: PASS for entropy, expiry, single use, constant-time validation, rotation, revocation, origin binding, mutation serialization, caps, expiry, schema rejection, and scope denial.

```bash
git add server/buddy
git commit -m "feat: add local Buddy pairing services"
```

---

### Task 5: Add authenticated Buddy APIs and dashboard controls

**Files:**
- Modify: `server/http/createCompanionServer.ts`
- Modify: `server/http/createCompanionServer.test.ts`
- Modify: `server/start.ts`
- Create: `src/features/buddy/buddyClient.ts`
- Create: `src/features/buddy/BuddySettings.tsx`
- Create: `src/features/buddy/BuddySettings.test.tsx`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/features/settings/SettingsPage.test.tsx`
- Modify: `src/features/settings/settings.css`

**Interfaces:**
- Consumes: `BuddyService` from Task 4.
- Produces: all `/api/buddy/*` routes, `BuddyClient`, and dashboard pairing/automation controls.

- [ ] **Step 1: Write failing extension-auth route tests**

```ts
it("requires the paired origin and bearer token for selected profile reads", async () => {
  const base = await start(services({ buddy }));
  const missing = await post(base, "/api/buddy/profile/select", EXTENSION_ORIGIN, { paths: ["identity.givenName"] });
  const wrongOrigin = await post(base, "/api/buddy/profile/select", "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", { paths: ["identity.givenName"] }, TOKEN);
  const allowed = await post(base, "/api/buddy/profile/select", EXTENSION_ORIGIN, { paths: ["identity.givenName"] }, TOKEN);
  expect([missing.status, wrongOrigin.status, allowed.status]).toEqual([401, 401, 200]);
});
```

- [ ] **Step 2: Implement explicit dashboard and extension route guards**

Add helpers `requireDashboardOrigin`, `requireExtensionOrigin`, and `readBearerToken`. The route matrix is exact:

- dashboard only: profile CRUD, Buddy status, pairing start/revoke, full preference write, activity list/clear, capture list/delete;
- extension origin before authentication: pairing complete only;
- authenticated extension origin: selected-profile read, preference read, limited preference patch, activity append, and capture append.

`PUT /api/buddy/preferences` branches by validated origin: the dashboard may replace the strict preference document, while the paired extension may submit only the limited patch accepted by `BuddyService.updateExtensionPreference`.

- [ ] **Step 3: Write failing Buddy settings tests**

```tsx
it("shows an expiring code, confirms automatic mode, and can revoke pairing", async () => {
  const client = fakeBuddyClient({ paired: false });
  render(<BuddySettings client={client} confirmAutomatic={() => true} />);
  await user.click(await screen.findByRole("button", { name: "Pair browser extension" }));
  expect(screen.getByText("ABCD-123456")).toBeVisible();
  await user.click(screen.getByLabelText("Automatic fill"));
  expect(client.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ mode: "automatic" }));
});
```

- [ ] **Step 4: Build the typed Buddy client and Settings section**

Render pairing state, expiring code with countdown, revoke action, Approval/Automatic fill controls, global pause, enabled domains, and metadata-only activity with a `Clear activity` action. Switching to automatic mode calls a confirmation callback whose default copy states that salary, authorization, legal, EEO, upload, and Submit restrictions remain.

- [ ] **Step 5: Wire and verify the companion**

Construct `WindowsDpapiProfileVault`, `ProfileService`, `PairingService`, `BuddyStore`, and `BuddyService` once in `server/start.ts`, then pass them to `createCompanionServer` without changing Gmail service behavior.

Run: `npm test -- server/http/createCompanionServer.test.ts src/features/buddy/BuddySettings.test.tsx src/features/settings/SettingsPage.test.tsx && npm run typecheck`

Expected: PASS for every authorization matrix entry, pairing response redaction, preferences, pause, revoke, settings loading, and existing Gmail settings.

- [ ] **Step 6: Commit Buddy APIs and controls**

```bash
git add server/http server/start.ts src/features/buddy/buddyClient.ts src/features/buddy/BuddySettings.tsx src/features/buddy/BuddySettings.test.tsx src/features/settings
git commit -m "feat: expose paired Buddy controls"
```

---

### Task 6: Build the extension shell and floating Buddy

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/src/service-worker.ts`
- Create: `extension/src/service-worker.test.ts`
- Create: `extension/src/companionClient.ts`
- Create: `extension/src/companionClient.test.ts`
- Create: `extension/src/content.ts`
- Create: `extension/src/content.test.ts`
- Create: `extension/src/ui/BuddyPanel.ts`
- Create: `extension/src/ui/BuddyPanel.test.ts`
- Create: `extension/src/ui/styles.ts`
- Create: `scripts/build-extension.mjs`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.extension.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: strict extension-message schemas and paired Buddy API from Tasks 1 and 5.
- Produces: `dist-extension/`, site-enable action, token-owning service worker, and accessible Shadow DOM panel.

- [ ] **Step 1: Write failing companion-client and worker tests**

```ts
it("keeps the bearer token in the worker and sends only validated selections", async () => {
  storage.local.get.mockResolvedValue({ buddyToken: "private-token" });
  fetchMock.mockResolvedValue(jsonResponse({ selection: { "identity.givenName": "Alex" } }));
  const response = await handleExtensionMessage({ version: 1, type: "select-profile", paths: ["identity.givenName"] }, sender);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/buddy/profile/select"), expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer private-token" }) }));
  expect(JSON.stringify(response)).not.toContain("private-token");
});
```

- [ ] **Step 2: Implement the manifest and build script**

Use required permissions `storage`, `activeTab`, and `scripting`; localhost host access `http://127.0.0.1:43117/*`; optional host access `https://*/*`; and an action with no popup. `scripts/build-extension.mjs` runs esbuild twice with bundling and `format: "iife"` for `service-worker.ts` and `content.ts`, targets Chrome 120, empties only `dist-extension`, and copies the validated manifest. `tsconfig.extension.json` uses `ES2022`, `DOM`, strict mode, and `chrome` plus Vitest types; add it to the root project references so `npm run typecheck` covers extension source.

Add scripts:

```json
{
  "build:extension": "node scripts/build-extension.mjs",
  "test:e2e:extension": "playwright test --config playwright.extension.config.ts"
}
```

- [ ] **Step 3: Implement user-gesture site enablement**

On `chrome.action.onClicked`, reject non-HTTPS tabs, request optional permission for the exact origin, register a persistent content script for `${origin}/*`, execute it once in the active tab, and store only the enabled origin. Never request `https://*/*` in one prompt.

- [ ] **Step 4: Write failing BuddyPanel tests**

```ts
it("mounts an accessible collapsed Buddy without covering the focused corner", () => {
  const panel = new BuddyPanel(document.body);
  panel.render({ state: "fields-found", matched: 6, review: 2, manual: 1 });
  expect(panel.root.querySelector('[aria-label="Open Job Buddy"]')).toBeTruthy();
  panel.setCorner("left");
  expect(panel.host.dataset.corner).toBe("left");
  expect(panel.shadowRoot.querySelector("style")?.textContent).toContain("prefers-reduced-motion");
});
```

- [ ] **Step 5: Implement the Shadow DOM panel and unpaired flow**

Render the approved states with text nodes and DOM APIs only; do not inject extracted page strings with `innerHTML`. The unpaired state accepts the one-time code and sends it to the worker. The panel supports Escape to collapse, visible focus, left/right corner selection, pause, and a fixed z-index without changing page styles.

- [ ] **Step 6: Verify build output and commit the extension shell**

Run: `npm test -- extension/src/service-worker.test.ts extension/src/companionClient.test.ts extension/src/ui/BuddyPanel.test.ts && npm run typecheck && npm run build:extension`

Expected: PASS and `dist-extension/manifest.json`, `service-worker.js`, and `content.js` exist with no source maps or embedded pairing token.

```bash
git add package.json package-lock.json tsconfig.json tsconfig.extension.json .gitignore extension scripts/build-extension.mjs
git commit -m "feat: add paired browser extension shell"
```

---

### Task 7: Implement deterministic matching, policy, Generic, and Greenhouse

**Files:**
- Create: `extension/src/matching/matchFields.ts`
- Create: `extension/src/matching/matchFields.test.ts`
- Create: `extension/src/matching/planFill.ts`
- Create: `extension/src/matching/planFill.test.ts`
- Create: `extension/src/adapters/types.ts`
- Create: `extension/src/adapters/dom.ts`
- Create: `extension/src/adapters/generic.ts`
- Create: `extension/src/adapters/greenhouse.ts`
- Create: `extension/src/adapters/adapters.test.ts`
- Create: `extension/fixtures/generic.html`
- Create: `extension/fixtures/greenhouse.html`
- Modify: `extension/src/content.ts`

**Interfaces:**
- Consumes: `CandidateProfile`, `DetectedField`, `BuddyPreferences`, and service-worker profile selection.
- Produces: `FormAdapter`, `matchFields`, `planFill`, `GenericAdapter`, `GreenhouseAdapter`, and scan/fill orchestration.

- [ ] **Step 1: Write failing matcher and guardrail tests**

```ts
it("uses exact autocomplete before a conflicting nearby label", () => {
  expect(matchField({ label: "Recruiter email", autocomplete: "email", name: "contact" })).toMatchObject({ canonicalPath: "contact.email", confidence: 1, risk: "safe" });
});

it("never auto-fills review, manual, non-empty, changed, or submit controls", () => {
  const decisions = planFill({ mode: "automatic", paused: false, fields: mixedFields, selections, snapshot: originalSnapshot });
  expect(decisions.filter((item) => item.action === "fill").map((item) => item.fieldId)).toEqual(["given-name"]);
  expect(decisions.find((item) => item.fieldId === "salary")?.action).toBe("review");
  expect(decisions.find((item) => item.fieldId === "submit")?.action).toBe("manual");
});
```

- [ ] **Step 2: Implement matching and policy as pure functions**

Exact autocomplete/vendor ID scores `1`; explicit alias scores `0.95`; normalized label alias scores `0.90`; ambiguous or unknown stays unresolved. Risk comes from a canonical allowlist before values are requested. `planFill` rechecks mode, pause, confidence, confirmation, current value, DOM snapshot identity, and risk and has no action capable of clicking a control.

- [ ] **Step 3: Write failing adapter fixture tests**

```ts
it.each(["generic", "greenhouse"])("extracts labels and fills through native events for %s", async (fixture) => {
  loadFixture(fixture);
  const adapter = selectAdapter(document, location);
  const fields = adapter.scan();
  const email = fields.find((field) => field.canonicalPath === "contact.email")!;
  const events: string[] = [];
  email.element.addEventListener("input", () => events.push("input"));
  email.element.addEventListener("change", () => events.push("change"));
  expect(adapter.fill(email, "alex@example.com")).toEqual({ ok: true });
  expect(events).toEqual(["input", "change"]);
});
```

- [ ] **Step 4: Implement safe DOM helpers and the first adapters**

Associate labels through `for`, wrapping label, `aria-label`, and `aria-labelledby`; cap nearby-text reads; ignore hidden, disabled, credential, file, and submit elements; represent those relevant manual elements without making them fillable. Use native value setters, exact normalized option matching, and `input`, `change`, then `blur` events. Greenhouse detection requires stable Greenhouse markers; otherwise choose Generic.

- [ ] **Step 5: Wire the content lifecycle**

Scan, map paths, request only those paths from the worker, render preview, and apply decisions one field at a time. Before every fill, re-resolve the element and compare tag, type, label fingerprint, and existing-value state. Use an abort controller for navigation and a 250ms debounced mutation observer capped at one rescan per second.

- [ ] **Step 6: Verify and commit core autofill**

Run: `npm test -- extension/src/matching extension/src/adapters extension/src/content.test.ts && npm run typecheck && npm run build:extension`

Expected: PASS for exact/alias/unknown mappings, all guardrails, controlled input events, dynamic sections, changed DOM, and no-submit behavior.

```bash
git add extension/src/matching extension/src/adapters extension/src/content.ts extension/src/content.test.ts extension/fixtures/generic.html extension/fixtures/greenhouse.html
git commit -m "feat: fill generic and Greenhouse forms safely"
```

---

### Task 8: Add Workday, Oracle Recruiting, and Lever adapters

**Files:**
- Create: `extension/src/adapters/workday.ts`
- Create: `extension/src/adapters/oracle.ts`
- Create: `extension/src/adapters/lever.ts`
- Create: `extension/fixtures/workday.html`
- Create: `extension/fixtures/oracle.html`
- Create: `extension/fixtures/lever.html`
- Modify: `extension/src/adapters/adapters.test.ts`
- Modify: `extension/src/content.ts`

**Interfaces:**
- Consumes: `FormAdapter`, DOM helpers, matcher, and policy from Task 7.
- Produces: vendor-specific detection, field aliases, dynamic rescan hints, and confirmation detectors.

- [ ] **Step 1: Add failing vendor fixture tests**

```ts
it.each([
  ["workday", "workday", "contact.phoneNational"],
  ["oracle", "oracle", "preferences.sgAuthorization"],
  ["lever", "lever", "links.linkedin"],
])("selects the %s adapter without weakening field risk", (fixture, expected, expectedPath) => {
  loadFixture(fixture);
  const adapter = selectAdapter(document, location);
  expect(adapter.id).toBe(expected);
  expect(adapter.scan()).toEqual(expect.arrayContaining([expect.objectContaining({ canonicalPath: expectedPath })]));
  expect(adapter.scan().find((field) => field.canonicalPath?.includes("Authorization"))?.risk).not.toBe("safe");
});
```

- [ ] **Step 2: Implement each adapter behind the same contract**

Workday supports repeated dynamic sections and ARIA controls; Oracle supports labelled select/radio groups and Oracle Recruiting markers; Lever supports its application form and success-heading markers. Adapters may add exact aliases and confirmation selectors but cannot change risk classifications or confidence thresholds.

- [ ] **Step 3: Add malformed and partial-platform cases**

Test vendor-like class names without required stable markers, cross-origin iframe placeholders, missing labels, disabled fields, duplicate IDs, and platform redesign fallbacks. These cases must select Generic or report unresolved instead of guessing.

- [ ] **Step 4: Verify and commit vendor coverage**

Run: `npm test -- extension/src/adapters/adapters.test.ts extension/src/matching && npm run build:extension`

Expected: PASS across all five fixtures and malformed variants; the resulting bundles contain no vendor credentials, live URLs, or fixture answers.

```bash
git add extension/src/adapters extension/src/content.ts extension/fixtures
git commit -m "feat: support major ATS form adapters"
```

---

### Task 9: Capture confirmed applications into the tracker

**Files:**
- Create: `src/features/buddy/captureApplication.ts`
- Create: `src/features/buddy/captureApplication.test.ts`
- Create: `src/features/buddy/PendingCaptures.tsx`
- Create: `src/features/buddy/PendingCaptures.test.tsx`
- Modify: `src/db/applicationRepository.ts`
- Modify: `src/db/applicationRepository.test.ts`
- Modify: `src/features/command-center/CommandCenterPage.tsx`
- Modify: `src/features/command-center/CommandCenterPage.test.tsx`
- Modify: `extension/src/content.ts`
- Modify: `extension/src/adapters/types.ts`

**Interfaces:**
- Consumes: authenticated capture queue, adapter confirmation signals, `applicationRepository`, and existing Gmail scan controls.
- Produces: `captureApplication(input): Promise<{ applicationId: string; created: boolean }>` and dashboard pending-capture review.

- [ ] **Step 1: Write failing idempotent capture tests**

```ts
it("creates one applied application and one accepted Buddy event", async () => {
  const first = await captureApplication(validCapture, edits);
  const second = await captureApplication(validCapture, edits);
  expect(first).toEqual({ applicationId: expect.any(String), created: true });
  expect(second).toEqual({ applicationId: first.applicationId, created: false });
  expect(await applicationRepository.eventsFor(first.applicationId)).toEqual([
    expect.objectContaining({ toStage: "applied", origin: "buddy", accepted: true }),
  ]);
});
```

- [ ] **Step 2: Add repository lookup and transactional capture**

Add `findByCanonicalJob({ company, role, jobUrl })` using normalized company/role and the sanitized URL. `captureApplication` validates Singapore/Hong Kong location, finance/software discipline, industry, role family, source, and applied date; creates application and initial event in the existing transaction; and returns the existing ID on duplicate.

- [ ] **Step 3: Write failing PendingCaptures UI tests**

```tsx
it("lets the user correct metadata before importing and deletes only after success", async () => {
  const client = fakeBuddyClient([pendingCapture]);
  render(<PendingCaptures client={client} capture={captureSpy} />);
  await user.clear(await screen.findByLabelText("Role"));
  await user.type(screen.getByLabelText("Role"), "Software Engineer");
  await user.click(screen.getByRole("button", { name: "Add to tracker" }));
  expect(captureSpy).toHaveBeenCalledWith(pendingCapture, expect.objectContaining({ role: "Software Engineer" }));
  expect(client.deleteCapture).toHaveBeenCalledWith(pendingCapture.id);
  expect(screen.getByRole("button", { name: /scan Gmail/i })).toBeVisible();
});
```

- [ ] **Step 4: Implement confirmation detection and explicit queueing**

Content records the user's submit interaction but never prevents or replays it. A capture offer appears only when the same adapter then sees a strong confirmation heading/state or a distinct sanitized success URL. The user reviews metadata in Buddy and clicks `Send to Job Buddy`; no form answers are included.

- [ ] **Step 5: Build the dashboard review surface**

Show pending captures on Command Center with editable company, role, SG/HK location, discipline, industry, role family, source, and date. Delete the queue entry only after the IndexedDB transaction succeeds. Offer the existing visible Gmail scan action after import; do not trigger it automatically.

- [ ] **Step 6: Verify and commit tracker capture**

Run: `npm test -- src/features/buddy/captureApplication.test.ts src/features/buddy/PendingCaptures.test.tsx src/db/applicationRepository.test.ts src/features/command-center/CommandCenterPage.test.tsx extension/src/content.test.ts && npm run typecheck`

Expected: PASS for strong confirmation, no silent queue, sanitization, edits, idempotency, failed-write retry, one Buddy stage event, and explicit Gmail scan offer.

```bash
git add src/features/buddy src/db/applicationRepository* src/features/command-center extension/src/content.ts extension/src/adapters/types.ts
git commit -m "feat: capture completed applications"
```

---

### Task 10: Verify the complete v0.4 release and document installation

**Files:**
- Create: `e2e/profile-and-pairing.spec.ts`
- Create: `e2e-extension/buddy-autofill.spec.ts`
- Create: `e2e-extension/companion.ts`
- Create: `playwright.extension.config.ts`
- Modify: `scripts/verify-client-secrets.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the complete profile, companion, dashboard, and extension implementation.
- Produces: reproducible Chrome extension tests, artifact safety verification, user setup documentation, and version `0.4.0`.

- [ ] **Step 1: Add the failing dashboard journey**

```ts
test("saves a profile, pairs Buddy, and imports one pending application", async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("First name").fill("Alex");
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Pair browser extension" }).click();
  await expect(page.getByText(/expires in/i)).toBeVisible();
});
```

- [ ] **Step 2: Add the extension Playwright harness**

Launch bundled Chromium with a persistent context and `--disable-extensions-except` plus `--load-extension` pointing to the absolute `dist-extension` directory. `e2e-extension/companion.ts` starts the real companion router on `127.0.0.1:43117` with injected in-memory profile data and temporary Buddy stores; it does not add a test route or bypass to production code. Fulfill `https://jobs.fixture.test/*` in Playwright routing so the real extension permission and content-script flow runs against an HTTPS origin without external network access. The standard dashboard journey intercepts its profile and pairing API responses inside Playwright rather than requiring DPAPI.

- [ ] **Step 3: Add the full extension safety journey**

```ts
test("approval, automatic fill, pause, revoke, and capture preserve guardrails", async () => {
  await enableFixtureOrigin();
  await pairThroughVisibleCode();
  await openFixture("greenhouse");
  await expectBuddyCounts({ safe: 6, review: 2, manual: 3 });
  await approveSafeFields();
  await expect(page.locator('input[type="file"]')).toHaveValue("");
  await expect(page.getByRole("button", { name: /submit application/i })).not.toBeDisabled();
  expect(await submitClickCount()).toBe(0);
  await enableAutomaticMode();
  await expectReviewFieldsEmpty();
  await pauseAndAssertNoFurtherProfileRequest();
  await revokeAndAssertUnauthorized();
});
```

- [ ] **Step 4: Extend secret and artifact verification**

Change `verify:client-secrets` to `node --env-file-if-exists=.env.local scripts/verify-client-secrets.mjs dist dist-extension`. Scan both output roots for `.env` values, OAuth secrets, bearer-token fixture values, pairing codes, candidate email/phone fixtures, Windows profile paths, and source maps. Fail when the manifest asks for non-localhost required host permissions or contains `content_scripts` matching every HTTPS site. Update `check` to run unit tests, type checking, both builds, artifact verification, dashboard browser tests, and extension browser tests in that order.

- [ ] **Step 5: Document exact installation and boundaries**

README must include: Node requirements; `npm install`; `npm run dev`; profile creation; `npm run build:extension`; Chrome `chrome://extensions` and Edge `edge://extensions` unpacked loading; pairing; per-site enablement; Approval versus Automatic fill; supported ATS platforms; manual fields; no-submit guarantee; local files; revocation; clearing profile/activity/captures; Windows-only DPAPI; threat-model limits; and troubleshooting companion-offline, permission-denied, and unsupported-form states.

- [ ] **Step 6: Set the version and run focused security checks**

Run: `npm version 0.4.0 --no-git-tag-version`

Run: `npm test -- server/profile server/buddy server/http extension src/features/profile src/features/buddy`

Expected: PASS with no live network or credentials.

- [ ] **Step 7: Run the complete release gate**

Run: `npm test && npm run typecheck && npm run build && npm run build:extension && npm run test:e2e && npm run test:e2e:extension && npm run verify:client-secrets && git diff --check`

Expected: every unit, component, browser, security, type, and production build check passes; neither output directory contains profile values, credentials, tokens, or source maps.

- [ ] **Step 8: Commit the verified release**

```bash
git add package.json package-lock.json e2e e2e-extension playwright.extension.config.ts scripts/verify-client-secrets.mjs README.md
git commit -m "release: verify Job Buddy v0.4"
```

---

## Completion checklist

- [ ] Every acceptance criterion in the v0.4 specification has a passing automated test or an explicit browser-installation verification.
- [ ] The full existing v0.3 regression suite still passes.
- [ ] `git status --short` is clean.
- [ ] No secrets, profile values, form answers, query strings, page HTML, or source maps appear in committed files or built artifacts.
- [ ] Chrome and Edge unpacked-extension instructions were followed once on Windows.
- [ ] The dashboard and extension visibly state that Buddy never submits applications.
