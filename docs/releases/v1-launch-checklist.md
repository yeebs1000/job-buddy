# V1 public-beta launch checklist

Record dates, machine/browser versions, commands, exit codes, and links to synthetic evidence. A local pass never substitutes for an external gate. Do not attach personal screenshots, resumes, email bodies, tokens, tracker exports, or live application answers.

## 1. Candidate identity and owner review

- [ ] Version is `1.0.0-beta.16` in `package.json` and the lockfile; extension `version_name` matches while numeric `version` remains Chrome-valid.
- [ ] Owner reviews README, Chinese summary, privacy/security policies, release notes, issue templates, dependency findings, and all known failures.
- [ ] Owner explicitly authorizes visibility change and publication. Until then the repository and artifacts remain private/unpublished.

## 2. Reproducible local verification

- [ ] From a disposable copy, run `npm.cmd ci --no-audit --no-fund` without changing global npm permissions.
- [ ] Run `npm.cmd run check` and preserve the complete result, including warnings or timeouts.
- [ ] Run `npm.cmd audit --omit=dev --audit-level=high`; record all findings, including moderate advisories, rather than claiming a zero audit.
- [ ] Run `npm.cmd run package:extension`; record the printed SHA-256 and inspect the ZIP file list for only intended runtime files.
- [ ] Run `npm.cmd run verify:public-tree` and a fresh checksum-verified Gitleaks history scan after the final commit.
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
| Earlier whole installed-extension suite | 2026-09-18, current Windows checkout | 60-second timeout occurred; latest focused 5/5 pass does not prove it resolved | Re-run in final full gate and investigate any recurrence |
| Separate Windows/Edge acceptance | Not run | Open | Required before public claim |
| Google approval/live-mail acceptance | Not run | Open external gate | Required before public Gmail claim |
| Final post-commit full gate/audit/history scan | Not run | Open | Controller/release owner |

## 6. Publication decision

- [ ] Review all recorded failures and limitations; explicitly accept, defer, or block each.
- [ ] Confirm release notes say **candidate** until the actual artifact/repository publication succeeds.
- [ ] Publish only after owner approval; record the immutable commit, artifact checksum, destination, and publication time.
- [ ] Recheck public pages for accidental personal data or secrets, then test the published installation instructions from the published source.
