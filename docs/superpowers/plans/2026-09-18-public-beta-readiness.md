# Public Beta Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute task-by-task with focused tests and independent review.

**Goal:** Prepare a reproducible, safe, useful Job Buddy public beta, stopping before publication.

**Architecture:** Harden the existing local-first web application and browser extension; retain the existing companion, IndexedDB tracker, encrypted local stores, and approval boundaries. Use synthetic acceptance data and isolated temporary directories, not live applications or personal mailbox contents.

**Tech Stack:** TypeScript, React, Node.js, Vitest, Playwright, Manifest V3, Windows PowerShell.

**Spec:** User-approved six-part launch checklist in this conversation: repository safety; extension reliability; Gmail acceptance; clean installation; data safety; release preparation.

## Global Constraints

- Keep the repository private; do not push, publish, create a public release, or change repository visibility.
- Work in the current checkout, preserving existing uncommitted work. Never stage signing keys, local data, credentials, resumes, or private mail fixtures.
- Browser Buddy never clicks final Submit. Sensitive or non-empty fields require approval; custom dropdowns without verified selection support remain manual.
- AI, generated answers, remote profile processing, and interview preparation remain outside V1.
- Do not change Google Cloud configuration, credentials, account permissions, or real job application answers.
- Report Google production approval and a separate-machine installation as external gates unless independently verified.
- Use TDD for changed behavior; record the failing reproduction before fixing. Do not suppress failing tests or merely increase timeouts.
- Workers do not dispatch subagents. Commit only reviewed task-owned changes, using explicit paths; never git add -A.

### Task 1: Repository safety and distributable extension

**Ownership:** `.gitignore`, new `scripts/verify-public-tree.mjs` and tests, new `scripts/package-extension.mjs` and tests, `package.json` scripts and fflate dependency, matching lockfile, `.github/workflows/ci.yml`, `docs/releases/public-tree-audit.md`.

**Interfaces:** Produce `npm.cmd run verify:public-tree` and `npm.cmd run package:extension`. Reuse built `dist-extension`; the ZIP contains only the manifest and its runtime assets. Release ZIPs belong in ignored `release-artifacts/`. Do not bundle the signing key or browser-packed CRX.

- [ ] Inspect current Git tracked/candidate files and reachable history without printing secret values. Add ignore patterns for PEM/private signing keys, CRX, and release artifacts; preserve local key files.
- [ ] Write scanner tests with temporary Git repositories: a tracked private-key marker fails, an ignored local key does not fail, a key in reachable history fails, normal synthetic examples pass. Diagnostics show path/reason only, never content. Scan tracked/candidate public files and reachable history; make limitations explicit (not proof of no secrets).
- [ ] Run `npm.cmd test -- scripts/verify-public-tree.test.ts` before implementation and record expected failure. Implement the minimal scanner, then rerun.
- [ ] Write ZIP tests that verify manifest/runtime files are present and unexpected files/private keys are rejected or excluded. Use existing `fflate`; no new dependency needed. Build extension then package it with a versioned filename and checksum output.
- [ ] Upgrade fflate to `^0.8.3` (GHSA-px8p-9vwx-vf98 fixes malformed ZIP64 denial of service); regenerate lockfile, test resume text, Excel workbook and research tabular parsing. Review remaining uuid advisory use paths; do not force a breaking ExcelJS downgrade to clear audit output.
- [ ] Wire the public-tree check into `check` and CI (with full Git history available). Run focused tests, actual scanner, extension build/package, and typecheck. Record history findings and limitations in the audit doc. Commit explicit owned paths, excluding existing unrelated package/CI hunks where practical.

### Task 2: Installed extension and process lifecycle reliability

**Ownership:** `e2e-extension/real-pairing.spec.ts`, evidence-driven changes in `extension/src/companionClient.ts`, `extension/src/content.ts`, related focused tests, `scripts/dev.mjs` and new lifecycle tests if needed. Do not modify package metadata/docs owned by other tasks.

**Interfaces:** Keep the loopback origin/token protocol, typed extension messages, field snapshot approval checks, and DOM safety policy. Tests use synthetic Alex Tan data, isolated stores, and an ephemeral companion port.

- [ ] Reproduce `npm.cmd run test:e2e:extension -- real-pairing.spec.ts`. Add named Playwright steps and metadata-only diagnostics to distinguish pairing, fill, reload, and cleanup; never print bearer tokens/profile values. The previously observed failures are empty `#first` after Fill approved and a whole-test timeout.
- [ ] Diagnose the root cause before modifying behavior. Write a focused regression test, implement the smallest fix, and rerun the same reproduction without relaxing safety or only increasing timeouts.
- [ ] Extend real installed-extension coverage for invalid/valid pairing, synthetic saved profile fill, reload, companion persistence/restart where feasible, and revocation preventing subsequent profile access/fill. Keep fixture pages and all data isolated.
- [ ] Inspect Windows dev shutdown. If descendants survive stopping the launcher, add a process-lifecycle regression using only task-spawned processes; fix cleanup scoped to their PID tree. Detect occupied configured ports with actionable messages and never kill unrelated listeners.
- [ ] Run focused unit tests, typecheck, extension build, and the extension E2E suite. Commit explicit owned paths; report any inherited edits included and all unresolved issues.

### Task 3: Acceptance coverage, onboarding, and truthful release documentation

**Ownership:** Missing Gmail/data-safety acceptance tests in existing test modules or new focused tests; README, CONTRIBUTING, SECURITY, new PRIVACY.md, `.github/ISSUE_TEMPLATE`, `docs/releases/v1-beta-16.md`, `docs/releases/v1-launch-checklist.md`, version fields in package/lock/manifest. No unrelated feature work.

**Interfaces:** Consume `verify:public-tree` and `package:extension`. Public-facing version is `1.0.0-beta.16`; retain valid Chrome numeric manifest version. Do not claim published artifacts or Google approval.

- [ ] Map existing tests to direct/forwarded confirmations and rejections, recruiter outreach, newsletter exclusions, duplicates, reconnect, and partial scan/cursor failures. Add only concrete missing regressions; use anonymized synthetic fixtures. Correct discovered failures with focused TDD.
- [ ] Map existing tests to profile parse-review-save-reload, stored-data upgrades, tracker import/export, disconnect, profile deletion, and extension revocation. Add missing critical acceptance tests without touching real user stores. Clearly state that tracker CSV/XLSX is not a full backup and shortlists are not exported.
- [ ] Update Windows quickstart with `npm.cmd ci`, browser test prerequisites, startup and port troubleshooting, packaged ZIP loading/unzipping, pairing, revoke/reconnect, and known supported/manual fields. Test the documented commands rather than promising one-click installation.
- [ ] Add concise privacy/data-flow and private vulnerability-report guidance plus bug/feature templates that warn against uploading resumes, tokens, or private emails. Document narrow supported ATS behavior, salary provenance/estimation, discovery limitations, and deferred features.
- [ ] Update version and beta notes. Build a launch checklist distinguishing verified local results, failed checks, live-mail/Google verification, separate Windows-machine acceptance, and user publication review. Include a synthetic screenshot using an existing test/demo fixture if practical; never personal screenshots.
- [ ] Run targeted tests and typecheck; commit explicit owned paths. Report external gates honestly. The controller runs the final full check, dependency audit, disposable clean install, and independent whole-change review before declaring readiness.
