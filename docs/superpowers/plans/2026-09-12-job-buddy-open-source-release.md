# Job Buddy Open-Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the completed local prototype into a safe, reproducible, contributor-friendly GitHub project with polished documentation, deterministic fixtures, CI, release checks, and no private data.

**Architecture:** The repository remains a single Vite application with checked-in fixtures and documentation. GitHub Actions runs deterministic tests, types, build, and browser smoke coverage; public documentation explains privacy, adapters, contribution workflow, and roadmap without requiring external accounts.

**Tech Stack:** Existing npm toolchain, GitHub Actions, Markdown, Playwright, and Git.

**Spec:** `docs/superpowers/specs/2026-09-12-job-buddy-design.md`

## Global Constraints

- Run this plan after the core tracker, update intelligence, Interview Studio, and Buddy sandbox are complete.
- The public repository must contain no user profile, email content, imported tracker, application documents, local database, API key, OAuth token, or browser session.
- CI must run without Gmail, AI, salary, or company-review credentials.
- MIT is the initial license.
- Documentation must distinguish implemented features from roadmap items.

---

## File map

- `README.md` — public product story, screenshots, setup, features, privacy, architecture, and roadmap.
- `LICENSE` — MIT license.
- `SECURITY.md` — supported versions, disclosure, local-data and credential model.
- `CONTRIBUTING.md` — setup, fixtures, tests, code style, and pull-request process.
- `CODE_OF_CONDUCT.md` — contributor expectations.
- `docs/architecture/overview.md` — domain, persistence, feature, and adapter boundaries.
- `docs/fixtures.md` — synthetic-data rules.
- `.github/workflows/ci.yml` — deterministic validation.
- `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md` — structured contributions.
- `scripts/check-public-tree.mjs` — secret/private-data filename and content checks.

---

### Task 1: Create the public documentation and license

**Files:**
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `docs/architecture/overview.md`
- Create: `docs/fixtures.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed application behavior and design specification.
- Produces: truthful public setup, privacy, architecture, contribution, security, and roadmap documentation.

- [ ] **Step 1: Write a documentation assertion test**

```ts
// src/test/publicDocs.test.ts
import { readFileSync } from "node:fs";

it("documents local-only privacy and simulated integrations", () => {
  const readme = readFileSync("README.md", "utf8");
  expect(readme).toMatch(/local-first/i);
  expect(readme).toMatch(/simulated Gmail/i);
  expect(readme).toMatch(/session-only/i);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/test/publicDocs.test.ts`

Expected: FAIL until the public README contains the required boundary statements.

- [ ] **Step 3: Write the README**

Include a concise problem statement, verified screenshots, feature tour, quick start, sample-data path, Excel import/export, privacy boundary, supported markets/roles, architecture diagram, test commands, contribution links, inspiration attribution, implemented-versus-roadmap table, and MIT license link. Do not claim real Gmail or live job submission.

- [ ] **Step 4: Add the license and supporting documents**

Use the standard MIT text with copyright `2026 Yeebs`. SECURITY explains local IndexedDB data, session-only keys, fixture-only mail, unsupported live automation, and GitHub Security Advisories as the private disclosure channel rather than a fabricated email address. CONTRIBUTING explains Node/npm setup, branches, tests, fixture-only development, commit scope, and pull-request expectations.

- [ ] **Step 5: Verify and commit public docs**

Run: `npm test -- src/test/publicDocs.test.ts`

Expected: PASS.

```bash
git add README.md LICENSE SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md docs src/test/publicDocs.test.ts
git commit -m "docs: prepare Job Buddy for contributors"
```

---

### Task 2: Add deterministic public-tree safety checks

**Files:**
- Create: `scripts/check-public-tree.mjs`
- Create: `scripts/check-public-tree.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: npm script `check:public` and exit code `1` when tracked files contain forbidden secret patterns or private-data paths.
- Consumes: `git ls-files`, Node standard library, and explicit allowlist for fixture markers.

- [ ] **Step 1: Write the failing checker test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { inspectEntries } from "./check-public-tree.mjs";

test("rejects credentials and local database paths", () => {
  const findings = inspectEntries([
    { path: ".env", content: "OPENAI_API_KEY=sk-example-secret" },
    { path: "local-data/job-buddy.db", content: "" }
  ]);
  assert.equal(findings.length, 2);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test scripts/check-public-tree.test.mjs`

Expected: FAIL because the checker is missing.

- [ ] **Step 3: Implement focused tracked-tree checks**

Inspect only `git ls-files`. Reject `.env`, database/import/export/profile/document paths, private-key blocks, common live API-key prefixes, OAuth refresh tokens, and authorization headers. Allow explicit fake fixture values only when the file is under `src/fixtures` or `e2e/fixtures` and contains `SYNTHETIC_FIXTURE_ONLY`.

- [ ] **Step 4: Add npm command and verify repository**

Add `"check:public": "node scripts/check-public-tree.mjs"`.

Run: `node --test scripts/check-public-tree.test.mjs && npm run check:public`

Expected: tests pass and the current tracked tree has zero findings.

- [ ] **Step 5: Commit the safety check**

```bash
git add scripts package.json package-lock.json .gitignore
git commit -m "chore: guard the public repository"
```

---

### Task 3: Configure reproducible continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`

**Interfaces:**
- Produces: CI jobs for public-tree check, unit/component tests, typecheck, production build, and Playwright smoke tests.
- Consumes: npm scripts and lockfile.

- [ ] **Step 1: Create the workflow with least permissions**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check:public
      - run: npm test
      - run: npm run typecheck
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 2: Validate workflow structure locally**

Run: `node -e "import fs from 'node:fs'; const s=fs.readFileSync('.github/workflows/ci.yml','utf8'); for (const x of ['npm ci','npm run check:public','npm test','npm run typecheck','npm run build','npm run test:e2e']) if(!s.includes(x)) throw new Error(x)"`

Expected: exit code `0`.

- [ ] **Step 3: Add issue and pull-request templates**

Bug reports request version, browser, reproduction, expected/actual behavior, and confirmation that no personal email/profile data is included. Feature requests ask for user problem, proposed outcome, local/cloud implications, and fixture strategy. Pull requests require tests, screenshots for UI changes, privacy review, and documentation updates.

- [ ] **Step 4: Commit CI and templates**

```bash
git add .github
git commit -m "ci: verify builds and fixture-only tests"
```

---

### Task 4: Capture verified screenshots and finish release metadata

**Files:**
- Create: `docs/images/command-center.png`
- Create: `docs/images/applications.png`
- Create: `docs/images/update-inbox.png`
- Create: `docs/images/interview-studio.png`
- Create: `docs/images/buddy-sandbox.png`
- Create: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: deterministic sample data and completed routes.
- Produces: stable public screenshots and version `0.1.0` release notes.

- [ ] **Step 1: Add deterministic screenshot setup**

Use Playwright with fixed viewport `1440x1000`, reduced motion, light theme, seeded sample database, and frozen date `2026-09-12T08:00:00+08:00`. Capture the five named routes after fonts and IndexedDB seed complete.

- [ ] **Step 2: Inspect every screenshot**

Confirm neutral application rows, crisp separators, readable secondary copy, visible green stage progression, constant red rejection rail, no clipped content, no private data, and no unfinished integration labels. Replace any screenshot that fails inspection.

- [ ] **Step 3: Embed screenshots and write changelog**

Use Command Center as the README hero image and a compact feature gallery for the remaining screens. CHANGELOG `0.1.0` lists only implemented local prototype features and explicitly labels Gmail and live browser extension as simulations.

- [ ] **Step 4: Commit release presentation**

```bash
git add docs/images README.md CHANGELOG.md package.json package-lock.json
git commit -m "docs: present the Job Buddy prototype"
```

---

### Task 5: Run the final release gate

**Files:**
- Modify only files required to resolve failures found by this gate.

**Interfaces:**
- Consumes: complete repository.
- Produces: verified local release candidate `0.1.0`.

- [ ] **Step 1: Confirm the tracked tree contains no ignored user data**

Run:

```bash
git status --short
git ls-files
npm run check:public
```

Expected: only intentional release changes are present and the public-tree check reports zero findings.

- [ ] **Step 2: Run every automated check from a clean install**

Run:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Expected: every command exits `0` with no failed test.

- [ ] **Step 3: Perform responsive and keyboard smoke checks**

Verify Command Center, Applications, Application Detail, Update Inbox, Interview Studio, Profile, Settings, and Buddy Sandbox at desktop `1440x1000`, tablet `834x1112`, and mobile `390x844`. Complete primary actions with keyboard only, confirm visible focus, and confirm no horizontal overflow.

- [ ] **Step 4: Verify documentation against current behavior**

Run each README quick-start command and compare the implemented-versus-roadmap table to the routes and tests. Correct any claim that cannot be demonstrated locally.

- [ ] **Step 5: Commit release-gate repairs, if any**

If files changed:

```bash
git add -A
git commit -m "fix: satisfy open-source release gate"
```

If no files changed, do not create an empty commit.

- [ ] **Step 6: Tag only after the user authorizes publication**

Prepare the local command `git tag -a v0.1.0 -m "Job Buddy v0.1.0"` but do not create or push the tag, repository, or release without the user's explicit publication request.
