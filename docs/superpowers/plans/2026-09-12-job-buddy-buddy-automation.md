# Job Buddy Autofill Buddy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe in-dashboard autofill simulation, reusable candidate profile, approval and unrestricted simulation modes, uncertainty handling, activity log, application capture, and a stable future browser-extension bridge contract.

**Architecture:** Profile data is normalized into typed field values with provenance. A pure field-matching engine maps a synthetic application form to suggestions and confidence; a simulator applies suggestions according to mode and guardrails. No live site is accessed or submitted in version 1.

**Tech Stack:** Existing React/TypeScript/IndexedDB/Vitest/Playwright stack and Zod.

**Spec:** `docs/superpowers/specs/2026-09-12-job-buddy-design.md`

## Global Constraints

- Complete the core tracker first; Interview Studio may be implemented before or after this plan.
- Version 1 never fills or submits a real third-party job application.
- Approval mode is default.
- Declarations, compensation commitments, work authorization, consent, and low-confidence answers always require review.
- Every simulated automatic action is visible in the activity log and can be paused.
- The design must support Greenhouse, Workday, Oracle, and other platforms without hard-coding the domain model to those vendors.

---

## File map

- `src/domain/profile.ts` — reusable candidate profile and provenance types.
- `src/features/profile/ProfilePage.tsx` — profile editor and completeness checks.
- `src/domain/autofill.ts` — synthetic form, suggestion, risk, and action types.
- `src/features/buddy/matchFields.ts` — pure field matching.
- `src/features/buddy/applySuggestions.ts` — mode and guardrail policy.
- `src/features/buddy/BuddySandboxPage.tsx` — inspectable demo application form.
- `src/features/buddy/BuddyPanel.tsx` — floating companion UI.
- `src/features/buddy/activityRepository.ts` — activity and pause state.
- `src/integrations/extension/bridge.ts` — versioned future extension message contract.

---

### Task 1: Define and edit the reusable candidate profile

**Files:**
- Create: `src/domain/profile.ts`
- Create: `src/domain/profile.test.ts`
- Create: `src/db/profileRepository.ts`
- Create: `src/features/profile/ProfilePage.tsx`
- Create: `src/features/profile/ProfilePage.test.tsx`
- Create: `src/features/profile/profile.css`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Produces: `CandidateProfile`, `ProfileField<T>`, `profileRepository`, `validateProfile`, and `/profile`.
- Consumes: existing Dexie `profileFields` table.

- [ ] **Step 1: Write failing profile validation tests**

```ts
it("reports required autofill fields without discarding partial data", () => {
  const result = validateProfile({ contact: { fullName: field("Alex Tan") } });
  expect(result.missing).toEqual(expect.arrayContaining(["contact.email", "education"]));
  expect(result.value.contact.fullName.value).toBe("Alex Tan");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/domain/profile.test.ts`

Expected: FAIL because profile types and validation are missing.

- [ ] **Step 3: Implement typed profile sections**

Include contact, addresses, links, education, experience, skills, work authorization by market, salary expectations by currency, location/work preferences, documents, demographic answers, and standard free-text answers. Every field stores value, source, last-updated time, and user-confirmed state.

- [ ] **Step 4: Build the profile editor**

Use progressively disclosed sections, visible completeness, save-on-explicit-action, field-level validation, and local-only privacy copy. Sensitive demographic fields remain optional and are never inferred.

- [ ] **Step 5: Verify and commit profile management**

Run: `npm test -- src/domain/profile.test.ts src/features/profile/ProfilePage.test.tsx && npm run typecheck`

Expected: PASS for partial saves, validation, provenance, optional fields, and keyboard navigation.

```bash
git add src/domain/profile* src/db/profileRepository.ts src/features/profile src/app/routes.tsx
git commit -m "feat: add reusable candidate profile"
```

---

### Task 2: Match synthetic application fields to profile answers

**Files:**
- Create: `src/domain/autofill.ts`
- Create: `src/features/buddy/matchFields.ts`
- Create: `src/features/buddy/matchFields.test.ts`
- Create: `src/fixtures/forms/greenhouse.ts`
- Create: `src/fixtures/forms/workday.ts`
- Create: `src/fixtures/forms/oracle.ts`
- Create: `src/fixtures/forms/generic.ts`

**Interfaces:**
- Consumes: `CandidateProfile`.
- Produces: `ApplicationForm`, `FormField`, `AutofillSuggestion`, and `matchFields(form, profile): AutofillSuggestion[]`.

- [ ] **Step 1: Write failing matcher tests**

```ts
it("maps common vendor labels to canonical profile paths", () => {
  const suggestions = matchFields(greenhouseFixture, completeProfile);
  expect(suggestions.find(s => s.fieldId === "first_name")).toMatchObject({ profilePath: "contact.firstName", confidence: 1 });
});

it("marks salary and work authorization as review-required", () => {
  const suggestions = matchFields(workdayFixture, completeProfile);
  expect(suggestions.filter(s => s.risk === "high").map(s => s.fieldId))
    .toEqual(expect.arrayContaining(["salary_expectation", "work_authorization"]));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/buddy/matchFields.test.ts`

Expected: FAIL because field matching is missing.

- [ ] **Step 3: Implement canonical matching**

Normalize labels, names, autocomplete attributes, field types, select options, and nearby help text. Exact canonical identifiers score `1`; known aliases `0.95`; normalized label matches `0.85`; ambiguous text similarity remains below `0.75` and requires review. Never map a high-impact field from similarity alone.

- [ ] **Step 4: Verify every fixture and commit**

Run: `npm test -- src/features/buddy/matchFields.test.ts`

Expected: PASS for Greenhouse-, Workday-, Oracle-, and generic-style synthetic fixtures without importing vendor code.

```bash
git add src/domain/autofill.ts src/features/buddy/matchFields* src/fixtures/forms
git commit -m "feat: match application fields to profile"
```

---

### Task 3: Enforce approval and unrestricted simulation guardrails

**Files:**
- Create: `src/features/buddy/applySuggestions.ts`
- Create: `src/features/buddy/applySuggestions.test.ts`
- Create: `src/features/buddy/activityRepository.ts`
- Create: `src/features/settings/AutomationSettings.tsx`
- Create: `src/features/settings/AutomationSettings.test.tsx`

**Interfaces:**
- Consumes: `AutofillSuggestion[]`, automation settings, and activity repository.
- Produces: `applySuggestions({ suggestions, mode, policy }): AutofillPlan`, activation confirmation, daily limit, domain policy, pause, and activity entries.

- [ ] **Step 1: Write failing policy tests**

```ts
it("requires review for every suggestion in approval mode", () => {
  expect(applySuggestions({ suggestions, mode: "approval", policy }).actions.every(a => a.disposition === "review")).toBe(true);
});

it("never auto-applies a high-impact field in unrestricted mode", () => {
  const plan = applySuggestions({ suggestions: [salarySuggestion], mode: "unrestricted", policy });
  expect(plan.actions[0].disposition).toBe("review");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/buddy/applySuggestions.test.ts`

Expected: FAIL because policy logic is missing.

- [ ] **Step 3: Implement exact policy rules**

Approval mode reviews all fields. Unrestricted simulation auto-applies only low-risk fields with confidence at least `0.9`, within the enabled site policy and daily application limit. High-risk fields, unsupported options, empty source data, or confidence below `0.9` always review. Emergency pause changes all dispositions to blocked.

- [ ] **Step 4: Implement explicit settings and activity history**

Switching to unrestricted simulation requires a confirmation screen explaining scope. Store mode, site toggles, and limits locally; store every suggestion, decision, reason, timestamp, and result in the activity log. Never store a password or session cookie.

- [ ] **Step 5: Verify and commit guardrails**

Run: `npm test -- src/features/buddy/applySuggestions.test.ts src/features/settings/AutomationSettings.test.tsx`

Expected: PASS for mode switching, high-impact fallback, daily limit, disabled site, and emergency pause.

```bash
git add src/features/buddy/applySuggestions* src/features/buddy/activityRepository.ts src/features/settings
git commit -m "feat: enforce Buddy automation guardrails"
```

---

### Task 4: Build the inspectable Buddy sandbox and floating panel

**Files:**
- Create: `src/features/buddy/BuddySandboxPage.tsx`
- Create: `src/features/buddy/BuddySandboxPage.test.tsx`
- Create: `src/features/buddy/BuddyPanel.tsx`
- Create: `src/features/buddy/buddy.css`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: form fixtures, matcher, policy engine, profile repository, and activity repository.
- Produces: `/buddy/sandbox`, floating `BuddyPanel`, review queue, simulated fill, pause, and reset.

- [ ] **Step 1: Write the failing approval-mode UI test**

```tsx
it("explains uncertain fields before simulated fill", async () => {
  render(<BuddySandboxPage fixture="greenhouse" />);
  await user.click(screen.getByRole("button", { name: /scan form/i }));
  expect(screen.getByText(/salary expectation requires review/i)).toBeVisible();
  expect(screen.getByRole("button", { name: /fill approved fields/i })).toBeEnabled();
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/buddy/BuddySandboxPage.test.tsx`

Expected: FAIL because the sandbox is missing.

- [ ] **Step 3: Implement the sandbox interaction**

Provide a vendor selector, synthetic job description, semantic form, Scan form, suggestion review, confidence/reason display, field edits, Fill approved fields, unrestricted simulation, emergency pause, and reset. The floating panel shows compact progress and never obscures the focused form field on desktop or mobile.

- [ ] **Step 4: Verify UX states**

Test default, hover, focus, active, disabled, loading, error, success, pause, no-profile, partial-profile, and reduced-motion states. Touch targets are at least 44px on coarse pointers.

- [ ] **Step 5: Commit the Buddy sandbox**

Run: `npm test -- src/features/buddy/BuddySandboxPage.test.tsx && npm run typecheck`

Expected: PASS for both modes, uncertainty review, pause, and reset.

```bash
git add src/features/buddy src/components/AppShell.tsx src/app/routes.tsx
git commit -m "feat: build safe Buddy autofill sandbox"
```

---

### Task 5: Capture completed simulated applications and trigger updates

**Files:**
- Create: `src/features/buddy/captureApplication.ts`
- Create: `src/features/buddy/captureApplication.test.ts`
- Modify: `src/features/buddy/BuddySandboxPage.tsx`
- Modify: `src/features/updates/runMailScan.ts`

**Interfaces:**
- Consumes: synthetic form/job context, `applicationRepository`, activity repository, and fixture mail scan.
- Produces: `captureApplication(input): Promise<Application>`, confirmation evidence, and optional simulated post-application scan.

- [ ] **Step 1: Write the failing capture test**

```ts
it("creates one applied application and one Buddy stage event", async () => {
  await captureApplication(completedSyntheticApplication);
  expect(await applicationRepository.list()).toHaveLength(1);
  expect(await applicationRepository.eventsFor("captured-1")).toEqual([
    expect.objectContaining({ toStage: "applied", origin: "buddy" })
  ]);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/buddy/captureApplication.test.ts`

Expected: FAIL because capture is missing.

- [ ] **Step 3: Implement idempotent capture and scan prompt**

Use canonical company, role, source URL, and completion identifier for deduplication. Create the application, event, submitted answer summary, and activity entry transactionally. Offer a simulated confirmation-email scan after capture; do not run a live or hidden submission.

- [ ] **Step 4: Verify and commit capture**

Run: `npm test -- src/features/buddy/captureApplication.test.ts src/features/updates/runMailScan.test.ts`

Expected: PASS for first capture, repeat capture, and scan prompt.

```bash
git add src/features/buddy/captureApplication* src/features/buddy/BuddySandboxPage.tsx src/features/updates/runMailScan.ts
git commit -m "feat: capture simulated Buddy applications"
```

---

### Task 6: Define the future browser-extension bridge and verify the demo

**Files:**
- Create: `src/integrations/extension/bridge.ts`
- Create: `src/integrations/extension/bridge.test.ts`
- Create: `docs/architecture/extension-bridge.md`
- Create: `e2e/buddy-sandbox.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ApplicationForm`, `AutofillSuggestion`, `CandidateProfile`, and capture input.
- Produces: versioned `ExtensionRequest` and `ExtensionResponse` schemas plus a tested end-to-end simulation.

- [ ] **Step 1: Write failing contract validation tests**

```ts
it("rejects unknown bridge versions and unrecognized message types", () => {
  expect(parseExtensionRequest({ version: 2, type: "scan" }).success).toBe(false);
  expect(parseExtensionRequest({ version: 1, type: "deleteEverything" }).success).toBe(false);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/integrations/extension/bridge.test.ts`

Expected: FAIL because the bridge schema is missing.

- [ ] **Step 3: Implement the minimal version 1 bridge schema**

Allow only `scan-form`, `request-suggestions`, `record-review`, `record-completion`, `pause`, and `status`. Validate every payload with Zod and return explicit errors. The bridge passes structured fields and suggestions, never arbitrary executable code.

- [ ] **Step 4: Write and run the end-to-end demo**

```ts
test("reviews, fills, captures, and pauses a synthetic application", async ({ page }) => {
  await page.goto("/buddy/sandbox");
  await page.getByRole("button", { name: /scan form/i }).click();
  await page.getByRole("button", { name: /fill approved fields/i }).click();
  await page.getByRole("button", { name: /record application/i }).click();
  await expect(page.getByText(/application added/i)).toBeVisible();
  await page.getByRole("button", { name: /pause buddy/i }).click();
});
```

Run: `npm run test:e2e -- e2e/buddy-sandbox.spec.ts`

Expected: PASS without network access.

- [ ] **Step 5: Document the extension boundary and safety model**

Explain message types, versioning, profile minimization, site adapters, permission boundaries, confirmation points, and why live submission is outside version 1.

- [ ] **Step 6: Run the full verification gate and commit**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`

Expected: every test passes and the production build succeeds.

```bash
git add src/integrations/extension docs/architecture/extension-bridge.md e2e/buddy-sandbox.spec.ts README.md
git commit -m "test: verify Buddy automation demo"
```

