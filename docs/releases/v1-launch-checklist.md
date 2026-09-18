# V1 public-beta launch checklist

Record dates, machine/browser versions, commands, exit codes, and links to synthetic evidence. A local pass never substitutes for an external gate. Do not attach personal screenshots, resumes, email bodies, tokens, tracker exports, or live application answers.

**Decision on 2026-09-18: NOT READY FOR PUBLICATION.** The local release gate passes, but XLSX validation and the downstream Excel parser can interpret the same archive differently. Import safety needs another implementation change and review before publication. Do not use untrusted XLSX files meanwhile.

## 1. Candidate identity and owner review

- [x] Version is `1.0.0-beta.16` in `package.json` and the lockfile; extension `version_name` matches while numeric `version` remains Chrome-valid (`1.0.0`). Checked locally on 2026-09-18.
- [ ] Owner reviews README, Chinese summary, privacy/security policies, release notes, issue templates, dependency findings, and all known failures.
- [ ] Owner explicitly authorizes visibility change and publication. Until then the repository and artifacts remain private/unpublished.

## 2. Reproducible local verification

- [x] From a disposable copy, run `npm.cmd ci --no-audit --no-fund` without changing global npm permissions. Clean install, app build, extension build and packaging passed again from Git-exported source `4a521df` on Node 24.19.0/npm 11.17.0. Same machine, isolated dependency tree; not separate-machine acceptance.
- [x] Run `npm.cmd run check` and preserve the complete result, including warnings or timeouts. At `4a521df`: exit 0, 713 tests/95 files, 21 dashboard E2E and 5 extension E2E; types, builds and all three guards passed. Warnings: large Vite chunks, terminal color settings and test environment overhead. Earlier intermittent extension timeout remains recorded.
- [x] Run `npm.cmd audit --omit=dev --audit-level=high`; record all findings, including moderate advisories, rather than claiming a zero audit. Exit 0; two moderate ExcelJS/uuid findings, no high/critical findings reported. No forced downgrade.
- [x] Run `npm.cmd run package:extension`; record the printed SHA-256 and inspect the ZIP file list for only intended runtime files. Private beta.16 ZIP: `manifest.json`, `service-worker.js`, `content.js`; SHA-256 `eff70b12f35ab4a9b551b4281f8b3f62ef6fe4c3295e9094fc931ca8ed7d4955`. This is not publication approval.
- [x] Run `npm.cmd run verify:public-tree` and a fresh checksum-verified Gitleaks history scan. Source `4a521df`: guards passed, Gitleaks 8.30.1 scanned 92 reachable commits / 2.05 MB with no findings. Rerun after any further changes before publication; a clean scan is not proof of no secrets.
- [ ] If any check fails or times out, record it under **Failed/open checks** and stop the release decision until triaged.

## 3. Separate Windows-machine acceptance

- [ ] Use a supported Node/npm version and a Windows account with no existing Job Buddy state.
- [ ] Confirm `npm.cmd ci` and `npm.cmd run dev`; verify actionable behavior for ports 5173 and 43117 without terminating unrelated listeners.
- [ ] Import a synthetic tracker, review duplicates, export CSV/XLSX, and confirm the export cannot restore omitted history, saved views, Gmail state, or shortlists.
- [ ] Import a synthetic resume, review conflicts, save/reload the DPAPI profile, then delete it and confirm it stays absent after reload.
- [ ] Extract the packaged ZIP and load the folder in current Chrome and Edge. Pair, revoke, confirm the old token fails, and pair again.
- [ ] On synthetic/local fixtures, verify supported safe empty fields, existing-value review, manual custom widgets/repeated sections/uploads/legal fields, and the no-Next/no-Submit boundary.
- [ ] Confirm clearing browser IndexedDB, deleting the profile, disconnecting Gmail, and revoking the extension are distinct actions.

## 4. Live-mail and Google external gate

- [ ] Maintainer-owned Desktop OAuth client and consent screen are configured for the exact loopback redirect.
- [ ] Google restricted-scope verification/security requirements are complete for the intended audience.
- [ ] With an explicitly consented test account containing only approved test mail, verify connect, first-scan disclosure, direct and forwarded updates, newsletter exclusion, partial resume, incremental cursor, revoked-token reconnect, and disconnect/revocation.
- [ ] Confirm raw messages, OAuth values, provider errors, and screenshots containing private mail are not placed in release evidence.

## 5. Failed/open checks

| Check | Date/environment | Observed result | Owner and disposition |
| --- | --- | --- | --- |
| Final risk-focused code review | 2026-09-18, synthetic reproductions | Gmail disconnect race fixed and re-reviewed; archive guard improved, but downstream XLSX parser can choose a different archive interpretation | **Important blocker remains**: ensure downstream parsing consumes only the validated representation, then regression-test and review |
| Earlier whole installed-extension suite | 2026-09-18, current Windows checkout | 60-second timeout occurred earlier; final full gate passed 5/5, installed lifecycle 28.8s | No recurrence in final gate, but durable flake elimination is not proven |
| Separate Windows/Edge acceptance | Not run | Open | Required before public claim |
| Google approval/live-mail acceptance | Not run | Open external gate | Required before public Gmail claim |
| Full gate and production audit | 2026-09-18, source `4a521df` | Passed with warnings and two moderate advisories | Does not override the archive review blocker |

## 6. Publication decision

- [ ] Verify the private vulnerability-reporting link works for the intended public audience, or provide a usable private contact. The read-only API check on the private repository returned 404 on 2026-09-18; reporting availability is unverified, not confirmed disabled.
- [ ] Review all recorded failures and limitations; explicitly accept, defer, or block each.
- [ ] Confirm release notes say **candidate** until the actual artifact/repository publication succeeds.
- [ ] Publish only after owner approval; record the immutable commit, artifact checksum, destination, and publication time.
- [ ] Recheck public pages for accidental personal data or secrets, then test the published installation instructions from the published source.
