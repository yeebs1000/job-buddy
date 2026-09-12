# Job Buddy Update Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic simulated Gmail scans, evidence-backed application matching, update proposals, deadline/link extraction, approval and permitted automatic updates, idempotency, and failure recovery.

**Architecture:** A provider-neutral mail adapter returns minimal message envelopes. Pure matching and classification functions turn messages into proposals; an orchestration service persists scan cursors and processed identifiers, while the Update Inbox is the only UI that accepts or rejects ambiguous changes. Version 1 uses fixtures only.

**Tech Stack:** Existing React/TypeScript/Vitest/IndexedDB stack, Zod, and native URL/date parsing.

**Spec:** `docs/superpowers/specs/2026-09-12-job-buddy-design.md`

## Global Constraints

- Complete the core tracker plan first.
- Version 1 must not request real Gmail credentials or copy full inbox bodies into IndexedDB.
- Every proposal must expose source metadata, evidence, confidence, and match reason.
- Manual corrections cannot be silently overwritten.
- Terminal outcomes and conflicting signals always require user approval.
- Repeated scans must be idempotent.

---

## File map

- `src/integrations/mail/MailAdapter.ts` — provider-neutral scan contract.
- `src/integrations/mail/FixtureMailAdapter.ts` — deterministic version 1 implementation.
- `src/features/updates/matchApplication.ts` — pure application matching score.
- `src/features/updates/classifyMessage.ts` — pure stage/deadline/link extraction.
- `src/features/updates/runMailScan.ts` — scan orchestration and persistence.
- `src/features/updates/UpdateInboxPage.tsx` — proposal review UI.
- `src/features/updates/updateRepository.ts` — proposal and processed-message persistence.
- `src/fixtures/mail/` — synthetic recruiter messages.

---

### Task 1: Define the mail and proposal contracts with synthetic fixtures

**Files:**
- Create: `src/integrations/mail/MailAdapter.ts`
- Create: `src/integrations/mail/FixtureMailAdapter.ts`
- Create: `src/integrations/mail/FixtureMailAdapter.test.ts`
- Create: `src/domain/updateProposal.ts`
- Create: `src/fixtures/mail/messages.ts`

**Interfaces:**
- Produces: `MailAdapter.scan(cursor)`, `MailEnvelope`, `MailScanResult`, `UpdateProposal`, and deterministic fixture scenarios.
- Consumes: `ApplicationStage`, `ApplicationOutcome`, and `Deadline` from the core tracker.

- [ ] **Step 1: Write the failing adapter test**

```ts
it("returns only messages after the supplied cursor", async () => {
  const adapter = new FixtureMailAdapter(fixtureMessages);
  const first = await adapter.scan(null);
  const second = await adapter.scan(first.nextCursor);
  expect(first.messages.length).toBeGreaterThan(0);
  expect(second.messages).toEqual([]);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/integrations/mail/FixtureMailAdapter.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement minimal message envelopes**

```ts
export interface MailEnvelope {
  providerMessageId: string;
  threadId?: string;
  fromName?: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  excerpt: string;
  links: string[];
}

export interface MailAdapter {
  scan(cursor: string | null): Promise<{ messages: MailEnvelope[]; nextCursor: string; scannedAt: string }>;
}
```

Fixtures must cover interview invitation, assessment deadline, rejection, offer language, conflicting role names, unrelated marketing mail, repeated message identifier, and adapter failure.

- [ ] **Step 4: Verify and commit contracts**

Run: `npm test -- src/integrations/mail/FixtureMailAdapter.test.ts`

Expected: PASS for initial, incremental, empty, and failure scans.

```bash
git add src/integrations/mail src/domain/updateProposal.ts src/fixtures/mail
git commit -m "feat: define mail update contracts"
```

---

### Task 2: Match emails to applications without guessing

**Files:**
- Create: `src/features/updates/matchApplication.ts`
- Create: `src/features/updates/matchApplication.test.ts`

**Interfaces:**
- Consumes: `MailEnvelope` and `Application[]`.
- Produces: `matchApplication(message, applications): ApplicationMatch` where the result contains `applicationId | null`, `confidence`, `reasons`, and `conflicts`.

- [ ] **Step 1: Write failing matching tests**

```ts
it("matches company, role, sender domain, and thread evidence", () => {
  const result = matchApplication(interviewMail, applications);
  expect(result).toMatchObject({ applicationId: "app-meridian-quant", confidence: 1 });
  expect(result.reasons).toEqual(expect.arrayContaining(["company", "role", "sender-domain"]));
});

it("returns unmatched when two applications remain plausible", () => {
  expect(matchApplication(ambiguousBankMail, applications).applicationId).toBeNull();
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/updates/matchApplication.test.ts`

Expected: FAIL because matching is missing.

- [ ] **Step 3: Implement normalized weighted matching**

Normalize punctuation, legal suffixes, case, and whitespace. Score known recruiter/thread `0.45`, sender domain `0.25`, company tokens `0.2`, and role tokens `0.1`. Require at least `0.75` and a margin of `0.15` over the next candidate. Return no match when the threshold or margin fails.

- [ ] **Step 4: Verify edge cases and commit**

Run: `npm test -- src/features/updates/matchApplication.test.ts`

Expected: PASS for exact, normalized, ambiguous, and unrelated fixtures.

```bash
git add src/features/updates/matchApplication*
git commit -m "feat: match recruiter mail to applications"
```

---

### Task 3: Classify status, deadlines, and links with explainable rules

**Files:**
- Create: `src/features/updates/classifyMessage.ts`
- Create: `src/features/updates/classifyMessage.test.ts`

**Interfaces:**
- Consumes: `MailEnvelope`.
- Produces: `classifyMessage(message): MessageClassification` containing proposed stage/outcome, interview subtype, dates, links, confidence, evidence excerpt, and reasons.

- [ ] **Step 1: Write failing classifier tests**

```ts
it("extracts a technical interview, time, timezone, and meeting link", () => {
  expect(classifyMessage(technicalInterviewMail)).toMatchObject({
    proposedStage: "interview",
    interviewSubtype: "technical",
    confidence: 0.95
  });
});

it("classifies rejection but never marks it auto-applicable", () => {
  const result = classifyMessage(rejectionMail);
  expect(result.proposedOutcome).toBe("rejected");
  expect(result.requiresApproval).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/updates/classifyMessage.test.ts`

Expected: FAIL because classification is missing.

- [ ] **Step 3: Implement conservative fixture rules**

Use explicit positive and negative phrase sets, surrounding sentence evidence, ISO-normalized dates, known timezone abbreviations for SG/HK fixtures, and HTTPS link validation. Do not infer a stage from a generic acknowledgement. Offers, rejections, withdrawals, and contradictory language set `requiresApproval: true` regardless of confidence.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/updates/classifyMessage.test.ts`

Expected: PASS for every synthetic scenario, with unrelated mail producing no proposal.

```bash
git add src/features/updates/classifyMessage*
git commit -m "feat: classify recruiter update signals"
```

---

### Task 4: Orchestrate idempotent scans and persist proposals

**Files:**
- Create: `src/features/updates/updateRepository.ts`
- Create: `src/features/updates/runMailScan.ts`
- Create: `src/features/updates/runMailScan.test.ts`
- Create: `src/features/updates/useMailScan.ts`

**Interfaces:**
- Consumes: `MailAdapter`, matcher, classifier, `applicationRepository`, and Dexie tables from the core plan.
- Produces: `runMailScan({ adapter, mode, now })`, scan state, proposal CRUD, `approveProposal(id, edits?)`, and `rejectProposal(id)`.

- [ ] **Step 1: Write the failing orchestration test**

```ts
it("creates one proposal across repeated scans and preserves manual conflicts", async () => {
  await runMailScan({ adapter, mode: "approval", now });
  await runMailScan({ adapter, mode: "approval", now });
  expect(await updateRepository.listPending()).toHaveLength(1);
  expect((await applicationRepository.get("app-1"))?.stage).toBe("assessment");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/updates/runMailScan.test.ts`

Expected: FAIL because orchestration is missing.

- [ ] **Step 3: Implement the scan transaction**

Skip processed provider identifiers, match and classify each new envelope, persist unmatched/conflicting proposals with reasons, and advance the cursor only after proposal and processed-message records commit. Store `lastSuccessfulScanAt`, `lastAttemptedScanAt`, and safe failure text.

In unrestricted simulation mode, auto-accept only non-terminal, non-conflicting proposals with both match and classification confidence at least `0.9`. Every automatic action writes an activity entry.

- [ ] **Step 4: Verify retry, duplicate, and conflict cases**

Run: `npm test -- src/features/updates/runMailScan.test.ts`

Expected: PASS; adapter failure leaves the prior cursor unchanged, and retry does not duplicate accepted proposals.

- [ ] **Step 5: Commit orchestration**

```bash
git add src/features/updates/updateRepository.ts src/features/updates/runMailScan* src/features/updates/useMailScan.ts
git commit -m "feat: orchestrate local mail scans"
```

---

### Task 5: Build the Update Inbox and deadline integration

**Files:**
- Create: `src/features/updates/UpdateInboxPage.tsx`
- Create: `src/features/updates/UpdateProposalRow.tsx`
- Create: `src/features/updates/UpdateInboxPage.test.tsx`
- Create: `src/features/updates/updates.css`
- Modify: `src/app/routes.tsx`
- Modify: `src/features/command-center/CommandCenterPage.tsx`

**Interfaces:**
- Consumes: proposal repository, `approveProposal`, `rejectProposal`, `StageRail`, and deadline persistence.
- Produces: `/updates` route, pending-count navigation badge, reviewed proposal actions, and Command Center scan status.

- [ ] **Step 1: Write the failing approval test**

```tsx
it("shows evidence and applies an edited proposal", async () => {
  render(<UpdateInboxPage />);
  expect(screen.getByText(/because company, role, sender domain matched/i)).toBeVisible();
  await user.selectOptions(screen.getByLabelText(/proposed stage/i), "final");
  await user.click(screen.getByRole("button", { name: /approve update/i }));
  expect(await screen.findByText(/update applied/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/updates/UpdateInboxPage.test.tsx`

Expected: FAIL because the inbox is missing.

- [ ] **Step 3: Implement proposal review and extracted actions**

Each row shows application, sender, subject, received time, short excerpt, match/classification confidence, reasons, proposed stage/outcome, extracted date, timezone, and validated links. Approval creates a stage event plus deadline/interview record in one transaction. Reject and defer do not modify the application.

- [ ] **Step 4: Add scan feedback to the Command Center**

Show last successful scan, safe error/retry state, pending count, and a simulated Scan now action. Do not use a blank loading state; render skeleton rows with stable dimensions.

- [ ] **Step 5: Verify inbox and deadline behavior**

Run: `npm test -- src/features/updates && npm run typecheck`

Expected: PASS for approve, edit, reject, defer, terminal confirmation, deadline creation, failure, and retry.

- [ ] **Step 6: Commit the Update Inbox**

```bash
git add src/features/updates src/features/command-center/CommandCenterPage.tsx src/app/routes.tsx
git commit -m "feat: add evidence-backed update inbox"
```

---

### Task 6: Verify the update intelligence journey

**Files:**
- Create: `e2e/update-intelligence.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all update interfaces from Tasks 1–5.
- Produces: a deterministic end-to-end simulated email workflow.

- [ ] **Step 1: Write the end-to-end scan and approval journey**

```ts
test("scans fixture mail, reviews evidence, and updates an interview deadline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /scan now/i }).click();
  await page.getByRole("link", { name: /review updates/i }).click();
  await expect(page.getByText(/technical interview/i)).toBeVisible();
  await page.getByRole("button", { name: /approve update/i }).click();
  await page.getByRole("link", { name: /command center/i }).click();
  await expect(page.getByText(/tomorrow.*2:00 pm/i)).toBeVisible();
});
```

- [ ] **Step 2: Run and repair only the exposed integration gaps**

Run: `npm run test:e2e -- e2e/update-intelligence.spec.ts`

Expected: PASS after accessible routing and seeded scan state are connected.

- [ ] **Step 3: Document the simulation boundary**

README must state that version 1 uses synthetic messages, stores only minimal evidence, performs scans only while active, and does not request Gmail credentials.

- [ ] **Step 4: Run the full verification gate**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`

Expected: every test passes and the production build succeeds.

- [ ] **Step 5: Commit the verified subsystem**

```bash
git add e2e/update-intelligence.spec.ts README.md
git commit -m "test: verify update intelligence workflow"
```

