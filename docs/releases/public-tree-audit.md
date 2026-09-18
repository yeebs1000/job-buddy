# Public-tree and extension packaging audit

Date: 2026-09-18

## Result

`npm.cmd run verify:public-tree` passed against the current tracked and unignored candidate files and every ref reachable through `git log --all`. No private-key filename, CRX filename, or conventional PEM private-key marker was found under the scanner's rules. The GitHub repository was independently confirmed private (`yeebs1000/job-buddy`, default branch `feature/job-buddy-core`) before this audit; this task did not change visibility, remotes, or publish anything.

Local `dist-extension.pem` and `dist-extension.crx` files were preserved and are now ignored. Versioned ZIPs are written to ignored `release-artifacts/`. The beta.15 archive contained only `manifest.json`, `service-worker.js`, and `content.js`; packaging printed its SHA-256 checksum without including signing material or a CRX.

## Scanner coverage and limitations

The scanner checks Git tracked files plus untracked files not excluded by `.gitignore`. It rejects `.pem`, `.key`, `.p12`, `.pfx`, and `.crx` paths and conventional RSA, EC, DSA, OpenSSH, or generic PEM private-key headers. Reachable history is checked across all local refs for those paths and markers. Diagnostics contain scope, path, and reason only—not matched content.

This is a narrow release guard, not proof that the repository contains no secrets. It does not perform entropy analysis, recognize arbitrary API-token formats, inspect ignored files, inspect binary or NUL-containing current files, scan current text files larger than 2 MiB for markers, or inspect unreachable/dangling Git objects. CI uses `fetch-depth: 0`, but server-side refs not fetched into the runner remain outside its view.

## Dependency audit

`fflate` was upgraded from 0.8.2 to 0.8.3, addressing GHSA-px8p-9vwx-vf98. Resume-text, Excel-workbook, and research-tabular regression tests passed after the upgrade.

`npm.cmd audit --omit=dev --audit-level=high` exited successfully but still reports two moderate findings through `exceljs@4.4.0 -> uuid@8.3.2`. The advisory concerns UUID v3/v5/v6 calls with caller-provided buffers; the installed ExcelJS code imports and calls UUID v4 for conditional-formatting IDs. A forced audit fix would downgrade ExcelJS to 3.4.0 and was intentionally not applied. This is a documented transitive risk, not a zero-finding audit.
