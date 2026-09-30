# Public-tree and extension packaging audit

Date: 2026-09-18

## Result

`npm.cmd run verify:public-tree` passed against the current tracked and unignored candidate files and every ref reachable through `git log --all`. No private-key filename, CRX filename, or conventional PEM private-key marker was found under the scanner's rules. The GitHub repository was independently confirmed private (`yeebs1000/job-buddy`, default branch `feature/job-buddy-core`) before this audit; this task did not change visibility, remotes, or publish anything.

Local `dist-extension.pem` and `dist-extension.crx` files were preserved and are now ignored. Versioned ZIPs are written to ignored `release-artifacts/`. The beta.15 archive contained only `manifest.json`, `service-worker.js`, and `content.js`; packaging printed its SHA-256 checksum without including signing material or a CRX.

## Scanner coverage and limitations

The scanner checks Git index blobs, existing tracked worktree files, and untracked files not excluded by `.gitignore`. This catches both staged content and unstaged edits while tolerating tracked files deleted from the worktree. It rejects `.pem`, `.key`, `.p12`, `.pfx`, and `.crx` paths and conventional RSA, EC, DSA, OpenSSH, or generic PEM private-key headers. Reachable history is checked across all local refs for those paths and markers. Diagnostics contain scope, path, and reason only—not matched content.

This is a narrow release guard, not proof that the repository contains no secrets. It does not perform entropy analysis, recognize arbitrary API-token formats, inspect ignored files, inspect binary or NUL-containing current files, scan current text files larger than 2 MiB for markers, or inspect unreachable/dangling Git objects. CI uses `fetch-depth: 0`, but server-side refs not fetched into the runner remain outside its view.

## Dependency audit

`fflate` was upgraded from 0.8.2 to 0.8.3, addressing GHSA-px8p-9vwx-vf98. Resume-text, Excel-workbook, and research-tabular regression tests passed after the upgrade.

`npm.cmd audit --omit=dev --audit-level=high` exited successfully but still reports two moderate findings through `exceljs@4.4.0 -> uuid@8.3.2`. The advisory concerns UUID v3/v5/v6 calls with caller-provided buffers; the installed ExcelJS code imports and calls UUID v4 for conditional-formatting IDs. A forced audit fix would downgrade ExcelJS to 3.4.0 and was intentionally not applied. This is a documented transitive risk, not a zero-finding audit.

## Release-candidate environment evidence

An isolated `npm.cmd ci --no-audit --no-fund` completed with Node 24.19.0/npm 11.17.0, followed by successful typecheck, application build, extension build, and extension packaging against the isolated dependency tree. The install reported upstream deprecations and a pending esbuild postinstall; no global npm permission was changed. Vite emitted its chunk-size warning.

The production entrypoint was also invoked with isolated local application data and blank Google configuration while port 43117 was occupied. It exited with actionable port-in-use guidance and did not replace the existing listener. Actual serving is covered by a synthetic end-to-end server on an ephemeral port; this does not prove a clean start on a separate Windows machine.

The final source-checkpoint scan at `4a521df` used independent checksum-verified Gitleaks 8.30.1: 92 reachable commits (about 2.05 MB), no findings. The GitHub repository was confirmed private with default branch `feature/job-buddy-core`; no visibility, publication, or other remote state was changed. Repeat scanners before publication after any additional changes.

At `4a521df`, the full release command passed 713 unit tests, 21 dashboard E2E tests, five extension E2E tests, typecheck, both builds and all guard scripts. A Git-exported disposable copy independently passed clean installation, builds and packaging. The production audit still reports the two moderate findings described above.

The root beta.16 extension ZIP contains only the three runtime files listed above; SHA-256 `eff70b12f35ab4a9b551b4281f8b3f62ef6fe4c3295e9094fc931ca8ed7d4955`. ZIP timestamps mean separately generated packages can have different hashes.

**Publication remains blocked:** final review found an XLSX parser disagreement after bounded validation. Passing scans and tests do not establish end-to-end import safety. See [v1-launch-checklist.md](v1-launch-checklist.md).
