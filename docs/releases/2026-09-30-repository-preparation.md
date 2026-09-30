# Repository preparation — 30 September 2026

Source candidate: `1.0.0-beta.18`, current Windows checkout based on `c716230`. This record supplements the [earlier hardening report](2026-09-30-release-hardening.md); it does not replace or erase failed runs.

## Scope

- Preserve the existing Gmail/research/tracker/autofill implementation and tests while preparing its unpublished changes for GitHub review.
- Replace stale website-first/demo/Docker onboarding with the actual Windows developer setup and planned Windows/macOS local downloads.
- Add a V2 roadmap: better email interpretation, source-grounded dashboard research, broader guarded autofill, optional opt-in AI and lightweight follow-up tools. These are proposals, not shipped features.
- Align English/Chinese summaries, privacy, security, environment example and launch gates. Mark hosted plans superseded, retain historical evidence, and defer installers until feature acceptance.
- Do not change repository visibility, merge the review PR, create a stable release, reset user records or package an unverified Mac build.

## Fresh verification

- Initial `npm.cmd run check`: 878/881 tests passed. The address-save and application-filter tests exceeded five seconds; the subsequent invalid-email test received extra characters. The pipeline stopped before builds/browser tests. No test timeout or assertion was weakened.
- Isolated rerun of the two affected files: 25/25 passed in 54.71 seconds without code changes. Timing-related interference is suspected, not proven; a targeted pass does not establish full-suite stability.
- Full unchanged rerun of `npm.cmd run check`: exit 0. All 881 tests/118 files passed (326.53 seconds), followed by public-tree checks, TypeScript, app/extension builds, client-secret/source guards, 30 dashboard browser tests and 5 extension tests. Installed Edge pairing completed in 24.3 seconds. This time the gate completed uninterrupted; the earlier failure remains a flakiness limitation.
- `npm.cmd run check:web`: exit 0; companion-free transfer/profile browser test and client artifact guards passed. This does not establish Mac support.
- Clean source export from staged Git tree `3c6bab1ad9af90f726b8d9a2f60046a2672b403f`: `npm.cmd ci --no-audit --no-fund`, production build, extension build and both artifact guards passed with an isolated dependency tree and no `.env.local`. Runtime source matches the candidate; later edits were documentation/templates only. Same Windows machine, not independent-machine or packaged-install acceptance. npm emitted dependency deprecation and an esbuild install-script approval warning; no global approval setting was changed and both builds succeeded.
- Production audit: exit 0 at the high threshold; two moderate findings through ExcelJS/uuid remain. The proposed forced downgrade was not applied.
- Gitleaks 8.30.1: checksum verified against official release metadata; 95 reachable commits (~2.08 MB) and the staged diff (~441.73 KB) scanned separately with redacted diagnostics and no findings. These are bounded checks, not a guarantee that no private information exists.
- Publication file inventory contained no tracked private keys, exports, screenshots, resumes, mail dumps or local database files. Known private email/address strings were not found. `.env.example` contains blank Google configuration, not credentials.
- Relative file links in ten public-facing documents and Git diff whitespace checks passed. Builds retain optional ExcelJS/PDF size warnings; no artifact-size warning was suppressed.

## Remaining release boundaries

Mac secure storage and native acceptance, real connector acceptance/Google distribution checks, clean packaged installation, platform packages and owner release review remain open. Timing-sensitive UI tests need continued monitoring; a successful unchanged rerun does not eliminate the flake. The private-repository vulnerability-reporting API returned 404; a usable reporting route must be verified before public publication. See the [current checklist](v1-launch-checklist.md).

No runtime behavior was changed during this documentation cleanup. No live inbox, real key, profile or application form was used in verification.
