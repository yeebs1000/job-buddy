# Job Buddy Interview Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build useful offline interview preparation, optional session-only AI providers, stage-aware preparation packs, and a mock interview flow grounded in the user's application records.

**Architecture:** Curated local templates generate a complete baseline pack from role family and interview subtype. An optional provider-neutral AI adapter enhances that pack using a session-only key; it never replaces verified source facts. Prep sessions and user responses persist locally, while raw API credentials do not.

**Tech Stack:** Existing React/TypeScript/IndexedDB/Vitest/Playwright stack, Zod, and native `fetch` behind an adapter.

**Spec:** `docs/superpowers/specs/2026-09-12-job-buddy-design.md`

## Global Constraints

- Complete the core tracker and update intelligence plans first.
- Interview Studio must remain useful without an API key or network connection.
- Generated content may reframe verified profile/application facts but must never invent experience.
- API keys are held in memory for the current tab session only.
- Provider errors must fall back to curated content without losing user responses.

---

## File map

- `src/domain/preparation.ts` — prep pack, question, answer, and session types.
- `src/features/interview-studio/templates.ts` — curated stage and role templates.
- `src/features/interview-studio/buildLocalPrepPack.ts` — deterministic offline pack builder.
- `src/integrations/ai/AiProvider.ts` — provider-neutral AI contract.
- `src/integrations/ai/providers.ts` — OpenAI, Anthropic, Gemini, and compatible request adapters.
- `src/integrations/ai/sessionKeyStore.ts` — non-persistent credential holder.
- `src/features/interview-studio/InterviewStudioPage.tsx` — preparation workspace.
- `src/features/interview-studio/MockInterview.tsx` — question and feedback flow.

---

### Task 1: Build deterministic offline preparation packs

**Files:**
- Create: `src/domain/preparation.ts`
- Create: `src/features/interview-studio/templates.ts`
- Create: `src/features/interview-studio/buildLocalPrepPack.ts`
- Create: `src/features/interview-studio/buildLocalPrepPack.test.ts`

**Interfaces:**
- Consumes: `Application`, interview subtype, profile facts, and prior-stage notes.
- Produces: `PrepPack`, `PrepQuestion`, and `buildLocalPrepPack(input): PrepPack`.

- [ ] **Step 1: Write failing pack tests**

```ts
it("builds technical finance preparation from verified application context", () => {
  const pack = buildLocalPrepPack({ application: quantApplication, profile, subtype: "technical" });
  expect(pack.sections.map(s => s.kind)).toEqual(expect.arrayContaining(["role", "technical", "questions", "plan"]));
  expect(pack.questions.some(q => /probability|python/i.test(q.prompt))).toBe(true);
});

it("marks profile gaps instead of inventing an answer", () => {
  expect(buildLocalPrepPack({ application: cloudApplication, profile: emptyProfile, subtype: "technical" }).gaps.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/interview-studio/buildLocalPrepPack.test.ts`

Expected: FAIL because templates and builder are missing.

- [ ] **Step 3: Implement curated templates**

Cover recruiter/HR, behavioural/culture, software/data technical, finance/quant technical, cybersecurity/cloud technical, case/take-home, panel/hiring-manager, and final round. Each pack contains a 45-minute plan, likely questions, verified talking points, honest gaps, questions to ask, and completion checklist.

- [ ] **Step 4: Verify and commit offline preparation**

Run: `npm test -- src/features/interview-studio/buildLocalPrepPack.test.ts`

Expected: PASS across role families and interview subtypes.

```bash
git add src/domain/preparation.ts src/features/interview-studio
git commit -m "feat: add offline interview preparation"
```

---

### Task 2: Add provider-neutral AI configuration with session-only keys

**Files:**
- Create: `src/integrations/ai/AiProvider.ts`
- Create: `src/integrations/ai/providers.ts`
- Create: `src/integrations/ai/providers.test.ts`
- Create: `src/integrations/ai/sessionKeyStore.ts`
- Create: `src/integrations/ai/sessionKeyStore.test.ts`
- Create: `src/features/settings/AiSettings.tsx`
- Create: `src/features/settings/AiSettings.test.tsx`

**Interfaces:**
- Produces: `AiProvider.generatePrep(request, signal)`, `AiProvider.reviewAnswer(request, signal)`, `createAiProvider(config)`, and `sessionKeyStore`.
- Consumes: prep request types and native `fetch`.

- [ ] **Step 1: Write failing credential and request-shape tests**

```ts
it("keeps a key in memory and clears it on request", () => {
  sessionKeyStore.set("openai", "test-key");
  expect(sessionKeyStore.get("openai")).toBe("test-key");
  sessionKeyStore.clear();
  expect(sessionKeyStore.get("openai")).toBeUndefined();
});

it("sends only the documented prep payload", async () => {
  await createAiProvider(openAiConfig, fetchMock).generatePrep(request, new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "POST" }));
  expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain("unrelatedProfileField");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/integrations/ai src/features/settings/AiSettings.test.tsx`

Expected: FAIL because the provider and settings UI are missing.

- [ ] **Step 3: Implement supported provider configurations**

Support OpenAI, Anthropic, Gemini, and an OpenAI-compatible base URL through explicit provider adapters. Validate HTTPS endpoints, model name, and timeouts. Never log or persist the key. The settings screen clearly states that closing or reloading the tab clears it.

- [ ] **Step 4: Add safe request cancellation and failure normalization**

Use `AbortSignal`, a 30-second timeout, and normalized error codes `not_configured`, `unauthorized`, `rate_limited`, `timeout`, `network`, and `invalid_response`. UI messages must not include response bodies that could contain sensitive data.

- [ ] **Step 5: Verify and commit AI settings**

Run: `npm test -- src/integrations/ai src/features/settings/AiSettings.test.tsx && npm run typecheck`

Expected: PASS for every provider shape, key clearing, cancellation, and safe error copy.

```bash
git add src/integrations/ai src/features/settings
git commit -m "feat: add session-only AI providers"
```

---

### Task 3: Build the Interview Studio preparation workspace

**Files:**
- Create: `src/features/interview-studio/InterviewStudioPage.tsx`
- Create: `src/features/interview-studio/InterviewStudioPage.test.tsx`
- Create: `src/features/interview-studio/interview-studio.css`
- Create: `src/db/prepRepository.ts`
- Modify: `src/app/routes.tsx`
- Modify: `src/features/application-detail/ApplicationDetailPage.tsx`

**Interfaces:**
- Consumes: local pack builder, optional `AiProvider`, application/profile repositories, and prep persistence.
- Produces: `/prepare/:applicationId` route, saved `PrepSession`, and application-detail Prepare action.

- [ ] **Step 1: Write the failing no-key flow**

```tsx
it("creates a complete local pack when AI is not configured", async () => {
  render(<InterviewStudioPage applicationId="quant-interview" />);
  await user.click(screen.getByRole("button", { name: /build preparation pack/i }));
  expect(await screen.findByRole("heading", { name: /45-minute plan/i })).toBeVisible();
  expect(screen.getByText(/AI is optional/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/interview-studio/InterviewStudioPage.test.tsx`

Expected: FAIL because the route and page are missing.

- [ ] **Step 3: Implement progressive preparation UI**

Show application context, stage/subtype selection, local pack sections, completion checkboxes, editable notes, gaps, questions to ask, and optional Enhance with AI. AI enhancement preserves local content on failure and marks generated sections with provider/model and generated time.

- [ ] **Step 4: Persist and resume sessions**

Save pack, completion state, notes, provider/model metadata, and source application version. Warn when the application materially changed after the pack was generated and offer regeneration without deleting the prior session.

- [ ] **Step 5: Verify and commit Interview Studio**

Run: `npm test -- src/features/interview-studio && npm run typecheck`

Expected: PASS for local, AI-enhanced, failure fallback, save, resume, and stale-source behavior.

```bash
git add src/features/interview-studio src/db/prepRepository.ts src/app/routes.tsx src/features/application-detail/ApplicationDetailPage.tsx
git commit -m "feat: build interview preparation studio"
```

---

### Task 4: Add mock interview sessions and grounded feedback

**Files:**
- Create: `src/features/interview-studio/MockInterview.tsx`
- Create: `src/features/interview-studio/MockInterview.test.tsx`
- Create: `src/features/interview-studio/reviewLocalAnswer.ts`
- Create: `src/features/interview-studio/reviewLocalAnswer.test.ts`

**Interfaces:**
- Consumes: `PrepPack`, optional `AiProvider.reviewAnswer`, verified profile facts, and prep repository.
- Produces: timed question flow, saved answers, local review, optional AI review, and session summary.

- [ ] **Step 1: Write failing local-review tests**

```ts
it("flags missing situation, action, and result without inventing content", () => {
  const review = reviewLocalAnswer({ prompt, answer: "I worked on a team project.", verifiedFacts });
  expect(review.missing).toEqual(expect.arrayContaining(["situation", "action", "result"]));
  expect(review.suggestedClaims).toEqual([]);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/interview-studio/reviewLocalAnswer.test.ts`

Expected: FAIL because the reviewer is missing.

- [ ] **Step 3: Implement local and optional AI review**

Local feedback checks answer structure, specificity, length, role relevance, and unsupported claims. AI feedback receives only the question, answer, job context, and explicitly verified facts. It must return structured strengths, improvements, follow-ups, and unsupported-claim warnings.

- [ ] **Step 4: Build accessible mock interview controls**

Support start, pause, skip, answer, review, follow-up, and finish. Time display is announced only on user request or meaningful intervals, not every second. Preserve typed answers across provider failures.

- [ ] **Step 5: Verify and commit mock interviews**

Run: `npm test -- src/features/interview-studio/MockInterview.test.tsx src/features/interview-studio/reviewLocalAnswer.test.ts`

Expected: PASS for offline review, optional AI review, pause/resume, failure, and saved summary.

```bash
git add src/features/interview-studio
git commit -m "feat: add grounded mock interviews"
```

---

### Task 5: Verify the Interview Studio journey

**Files:**
- Create: `e2e/interview-studio.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all outputs from Tasks 1–4.
- Produces: a tested offline-first preparation journey.

- [ ] **Step 1: Write the end-to-end offline journey**

```ts
test("prepares and practices without an API key", async ({ page }) => {
  await page.goto("/applications/quant-interview");
  await page.getByRole("link", { name: /prepare/i }).click();
  await page.getByRole("button", { name: /build preparation pack/i }).click();
  await page.getByRole("button", { name: /start mock interview/i }).click();
  await page.getByLabel(/your answer/i).fill("Situation, task, action, and result from a verified university project.");
  await page.getByRole("button", { name: /review answer/i }).click();
  await expect(page.getByText(/structure/i)).toBeVisible();
});
```

- [ ] **Step 2: Run and repair only integration gaps**

Run: `npm run test:e2e -- e2e/interview-studio.spec.ts`

Expected: PASS after route, fixture, and accessible-name wiring is complete.

- [ ] **Step 3: Document provider privacy and offline fallback**

README must state exactly what context is sent when AI is enabled, that keys are session-only, and that all essential preparation remains available offline.

- [ ] **Step 4: Run the full verification gate**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`

Expected: every test passes and the production build succeeds.

- [ ] **Step 5: Commit the verified subsystem**

```bash
git add e2e/interview-studio.spec.ts README.md
git commit -m "test: verify interview preparation workflow"
```

