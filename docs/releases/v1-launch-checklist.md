# V1 release checklist

Current target: **downloadable Windows and macOS apps**, not a hosted backend. Gmail → review → Command Center is primary; Excel/manual tracking and optional Browser Buddy support it. Packaging follows feature acceptance. See [ROADMAP.md](../../ROADMAP.md).

Publishing source as a clearly labelled beta is separate from launching a general-user V1 download. Neither local test results nor a GitHub push establish Mac support, Google approval or clean-install acceptance. Record dates, commands, immutable source revisions and synthetic evidence. Never attach private mail, resumes, tokens or real trackers.

## 1. Source candidate and GitHub hygiene

- [x] Candidate version: `1.0.0-beta.18`; no stable V1 release claim.
- [x] English/Chinese onboarding and roadmap distinguish implemented Windows features from planned macOS/download support.
- [x] Earlier hosted-website direction is marked superseded; historical verification reports are retained.
- [x] `npm.cmd run check` and `npm.cmd run check:web` passed on 2026-09-30. The initial unit run failed 3/881; an unchanged full rerun passed 881/881 plus 30 dashboard and 5 extension tests. See the preparation report; flakiness remains disclosed.
- [x] Production audit ran: exit 0 at high threshold, two moderate ExcelJS/uuid findings. No forced downgrade; final risk acceptance remains with owner review.
- [x] Publication tree/staged changes and reachable history scanned; public-tree and redacted Gitleaks checks passed, file inventory reviewed, public-facing relative links validated. Repeat after future changes.
- [x] Candidate runtime source built with clean dependencies from a staged Git export on 2026-09-30; app/extension builds and guards passed. This is not clean packaged installation or a separate machine.
- [ ] Owner reviews the candidate, known failures and public-facing docs; explicitly authorizes public visibility/release.
- [ ] Verify private vulnerability reporting for the intended audience or provide a usable private contact. Read-only GitHub API returned 404 while the repository was private on 2026-09-30; availability remains unverified.

## 2. Windows feature acceptance

- [ ] Test with a separate Windows machine/account without existing Job Buddy state.
- [ ] Verify startup, shutdown, restart and occupied-port recovery without terminating unrelated listeners.
- [ ] Import a synthetic tracker, review duplicates, export CSV/XLSX and verify lifecycle history/backup boundaries.
- [ ] Import a synthetic resume, review conflicts, save/reload/delete the protected profile.
- [ ] Load the built extension in Chrome and Edge; verify invalid-code recovery, pairing, revocation and re-pairing.
- [ ] Verify guarded fill, existing-answer review, unsupported-field handling and no final submission on synthetic fixtures.
- [ ] Confirm profile deletion, browser-data clearing, Gmail disconnect and extension revocation remain separate actions.

## 3. macOS feature acceptance — not implemented yet

- [ ] Implement native secure storage for Gmail credentials, desktop-client configuration, profile and Tavily key; no plaintext fallback.
- [ ] Verify local data paths, permissions, browser launch, loopback OAuth and extension pairing on macOS.
- [ ] Run relevant unit, browser and native-storage checks on Mac hardware or an appropriate Mac runner.
- [ ] Run separate-machine end-to-end acceptance with synthetic records and explicitly consented connector tests.
- [ ] Declare supported OS versions and Apple Silicon/Intel coverage based on actual build/test results, not assumptions.

## 4. Real connectors

- [ ] Configure the maintainer-owned Desktop OAuth client and exact loopback redirect.
- [ ] Complete applicable Google consent/distribution requirements for the intended audience.
- [ ] With an explicitly consented test account, verify direct and forwarded mail, first scan, incremental scan, rechecks, newsletter exclusion, duplicate/partial-scan handling, revocation and reconnect.
- [ ] Verify research with an owner-authorized Tavily account: normal search, no results, key errors, limits, cache, save/reload and removal. Do not place real keys/query data in release evidence.
- [ ] Confirm no search/matching error fabricates evidence, overwrites accepted history or silently substitutes demo mail.

## 5. Distribution — after V1 features pass

- [ ] Bundle the runtime and local services: no end-user Node, Docker or terminal setup.
- [ ] Build Windows and macOS packages with automatic local startup and orderly shutdown.
- [ ] Complete applicable platform signing/notarization and test first-launch trust prompts.
- [ ] Verify clean install, upgrade preserving data, repair/recovery and documented uninstall/data retention.
- [ ] Publish only verified artifacts with version, source commit, checksum and installation instructions.
- [ ] Test the published downloads on clean Windows/Mac machines; source tests alone are insufficient.

## Verification record

| Evidence | Scope and limitations |
| --- | --- |
| [2026-09-30 hardening](2026-09-30-release-hardening.md) | Earlier same-machine run: 881 unit tests, 30 dashboard tests, 5 extension tests, 3 pairing repeats and web-core check passed in the documented sequence; not one uninterrupted final gate |
| [2026-09-30 repository preparation](2026-09-30-repository-preparation.md) | Fresh checks for the GitHub cleanup; includes failures and subsequent results without replacing the earlier record |
| [2026-09-24 lean verification](v1-lean-verification.md) | Historical XLSX fix and acceptance boundaries |
| [Earlier public-tree audit](public-tree-audit.md) | Historical clean-install and secrets evidence; must be refreshed for the final candidate |

Outstanding items are not made green by a documentation update. Hosted Gmail/search is no longer a launch prerequisite; local Mac support, connectors and downloadable distribution are.
