# Security policy

## Supported versions

Job Buddy is currently a public-beta candidate. Security fixes target `1.0.0-beta.x` on the default branch. Earlier private-preview versions are unsupported.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** private-advisory flow when it is available. If that option is unavailable, contact the maintainer through a previously established private channel and ask for a secure reporting route; do not open a public issue containing vulnerability details. Include the affected version, impact, and a minimal synthetic reproduction, but never include real Gmail messages, resumes, OAuth credentials, pairing tokens, candidate-profile data, trackers, cookies, or job-site form answers. Please allow time for triage before public disclosure.

## Local trust boundary

- The companion binds to `127.0.0.1`. Dashboard routes require an allowlisted local origin; extension writes require the exact paired extension origin and bearer token.
- Pairing codes expire and work once. Revoking the pairing removes the local authorization relationship.
- Browser Buddy requests permission for one HTTPS job-site origin at a time. It never receives a global required HTTPS permission.
- Autofill never selects files, enters credentials, fills demographic/legal fields, solves CAPTCHA, or submits an application.
- Salary detection never sends data automatically. A user must review and click **Add salary evidence**, even in Automatic mode. Only market, currency, bounds, pay period, a short excerpt, a sanitized HTTPS source URL, and detection time enter the local queue.
- Pending application captures and salary evidence expire after 30 days; each queue is bounded to 100 records and written atomically.

## External-source processing

**XLSX archive-interpretation fix:** both workbook readers now rebuild the archive exclusively from bounded, validated entries before passing it to ExcelJS. The adversarial regression demonstrates the original parser disagreement and verifies that neither reader consumes a second archive hidden in a ZIP comment. This regression and the bounded-ZIP tests passed again on 2026-09-30. This closes that specific blocker, not the whole security review or public-release gates. See [the launch checklist](docs/releases/v1-launch-checklist.md).

Official salary downloads are restricted to allowlisted MOM/SingStat, Hong Kong C&SD, and BLS hosts. Downloads have time, redirect, and body-size limits; releases are parsed into strict schemas, checksummed, staged, and quarantined on failure before promotion. The last known good release remains available when a refresh fails.

Workbook import is values-only. Inputs are limited to 5 MB compressed and 25 MB uncompressed, 20 worksheets, 2,000 data rows, and 100 columns at the workbook boundary (the tracker accepts 80 mapped columns). Encrypted archives, ZIP64, unsafe paths, excessive compression, formulas, macros, and external links are rejected. PDF and tabular official-source parsers also enforce bounded pages, rows, columns, entries, and decompressed size.

`npm run verify:client-secrets` scans production client artifacts for canaries and configured credentials. `npm run verify:research-sources` rejects commercial scraping targets, insecure or incomplete official attribution, raw source bodies in client builds, and secret-like material. `npm audit --audit-level=high` must pass before a beta release; any remaining moderate transitive advisory is documented during release review and guarded at the relevant input boundary.

## Data and limitations

Company discovery constructs GET URLs only on fixed Greenhouse/Lever API origins from validated board tokens; arbitrary URLs, redirects, oversized responses and malformed records are rejected. Board lists are cached for five minutes with bounded concurrency/cache size. FX reads only the ECB provider through Frankfurter, with pair/date validation and a seven-day maximum data age. Neither integration receives candidate profiles or mail. Employer links are external and should be checked before applying. Shortlists are browser-local and are not included in standard application exports.

The distributed Google desktop client ID is public configuration, not a confidential secret. Real Google registration, restricted-scope review and acceptance checks remain release gates. Web-client secrets and tokens must never be packaged with the app. In companion mode, Windows DPAPI protects persistent Gmail credentials and the saved profile. Browser-core mode stores its profile locally using Web Crypto; it does not yet provide hosted Gmail, research, or extension pairing. Browser-held encryption is not protection against malicious same-origin code or someone using the unlocked browser. Do not expose the single-user companion publicly.

The V1 distribution target is downloadable Windows/macOS apps, not hosted integrations. macOS credential/profile protection is not implemented or verified yet and must not fall back to plaintext. Browser-core checks are not Mac security acceptance.

Job Buddy is local-first, not a hardened multi-user vault. Anyone with access to the same Windows account or browser profile may be able to access local data. Standard CSV/XLSX exports intentionally omit lifecycle evidence and are not full backups. Never commit `.env.local`, local companion data, real exports, or personal fixtures.

See [PRIVACY.md](PRIVACY.md) for the complete local data-flow and deletion map. Deleting Job Buddy data cannot erase values already filled into or submitted to a third-party job site.
