# V1 public beta.16 — release-readiness documentation

**Private candidate — not ready for publication.** Final scoped review found that XLSX validation and the downstream Excel parser can interpret the same archive differently. The input-resource boundary is therefore not fully established. Avoid untrusted XLSX imports until this blocker is fixed and reviewed. Passing tests below do not override this finding.

## Changed

- Replaced stale setup and privacy text with a tested Windows command path, port troubleshooting, packaged-ZIP loading, Browser Buddy pairing/revocation guidance, and a concise current Chinese summary.
- Added a privacy/data-flow and deletion map, private vulnerability-report instructions, and issue templates that prohibit personal or credential-bearing attachments.
- Clarified that CSV/XLSX export is not a full backup and does not contain discovery shortlists.
- Corrected salary-source documentation: the optional dated ECB-backed FX comparison exists, remains separate from source amounts, and is not a cost-of-living or company-offer prediction.
- Documented narrow Browser Buddy behavior: semantic Generic plus Greenhouse, Workday, Oracle Recruiting and Lever markers; custom widgets, repeated sections, uploads, legal/demographic answers, CAPTCHA, navigation and final submission remain manual.
- Version metadata is now `1.0.0-beta.16`; the Chrome manifest's required numeric version remains `1.0.0` and `version_name` carries the beta label.
- Disconnect invalidates pending Gmail callbacks and popup receipts, serializes credential removal after in-flight persistence, and prevents older token refreshes from restoring access.
- Tracker and research ZIP/XLSX readers now validate consistent single-disk archive metadata and decode into bounded output buffers before workbook loading. Development-launcher tests retain partial startup PIDs for cleanup.

## Acceptance coverage map

Existing synthetic tests cover direct and forwarded confirmations/rejections, recruiter outreach, newsletter exclusions, duplicate provider IDs, reconnect state, bounded/partial Gmail scans, cursor rollback protection, reviewed resume parse/save/reload, real isolated Windows DPAPI profile save/reload, profile deletion, Dexie v1-to-v2 application preservation, tracker CSV/XLSX import/export, Gmail disconnect, and Browser Buddy pairing revocation. The migration test creates a real version-1 IndexedDB before opening the current schema. No duplicate regression was added solely to increase a count.

Browser Buddy fixtures exercise supported ATS structures without live applications. The installed-extension suite uses Edge on Windows and Chromium elsewhere for real loading/pairing; it does not establish Chrome-specific behavior or every live vendor variation.

## Verified locally on 2026-09-18

- An isolated `npm.cmd ci --no-audit --no-fund` installed 233 packages with Node 24.19.0/npm 11.17.0. Deprecation warnings were upstream; npm reported a pending esbuild postinstall rather than changing global permissions.
- Against that isolated dependency tree, typecheck, app build, extension build and extension packaging passed. Vite reported only its chunk-size warning.
- The production entrypoint was tested while port 43117 was occupied: it exited with actionable already-in-use guidance and left the existing listener untouched. A synthetic end-to-end server covers actual serving on an ephemeral port. This is not a separate-machine test.
- Official checksum-verified Gitleaks 8.30.1 scanned 92 reachable commits (about 2.05 MB) through source `4a521df` with no findings. Repeat after future changes before publication.
- The repository was confirmed **private**, with default branch `feature/job-buddy-core`. No publication or remote write occurred.
- The final `npm.cmd run check` on source commit `4a521df` exited 0: 713 tests across 95 files, 21 dashboard E2E tests, five extension E2E tests, typecheck, app/extension builds and all release guards. Installed Edge lifecycle took 28.8 seconds. An earlier whole-suite 60-second timeout remains unexplained; this does not claim the flake is solved.
- The root beta.16 extension ZIP contains only `manifest.json`, `service-worker.js`, and `content.js`. SHA-256: `eff70b12f35ab4a9b551b4281f8b3f62ef6fe4c3295e9094fc931ca8ed7d4955`. It is a private review artifact, not an approved public release.
- Git-exported source `4a521df` passed a fresh disposable `npm.cmd ci --no-audit --no-fund`, application build, extension build and packaging. This verifies same-machine installation, not a different Windows account or machine.

The dependency audit is not zero-finding: two moderate findings remain through ExcelJS/uuid. The affected uuid v3/v5/v6 buffer calls are not used by the installed ExcelJS path; see [public-tree-audit.md](public-tree-audit.md). `fflate` is 0.8.3.

## Not yet verified

- No artifact has been published and the repository has not been made public.
- Shared-distribution OAuth configuration and required Google production approval, plus a consented live-mail acceptance run, remain unverified external gates. This does not imply that an existing local client configuration is absent.
- A clean acceptance run on a separate supported Windows machine, including Chrome and Edge packaged-ZIP loading, remains open.
- XLSX parser consistency remains an Important release blocker after the final scoped review. The original count mismatch and late allocation checks were improved, but ExcelJS still receives the original archive rather than exclusively the validated representation.
- Owner review and publication authorization remain outstanding. Follow [v1-launch-checklist.md](v1-launch-checklist.md) for final verification evidence and open gates.

Screenshots generated by tests use synthetic fixtures and remain test artifacts; none is committed as personal or live-site evidence.
