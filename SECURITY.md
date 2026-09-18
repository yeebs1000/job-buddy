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

**Private beta.16 release blocker:** the bounded XLSX validator and the downstream Excel parser can interpret the same archive differently. The limits described below are intended protections, not yet a verified end-to-end boundary for XLSX. Do not import untrusted XLSX files; public release remains blocked pending a fix and review. See `docs/releases/v1-launch-checklist.md`.

Official salary downloads are restricted to allowlisted MOM/SingStat, Hong Kong C&SD, and BLS hosts. Downloads have time, redirect, and body-size limits; releases are parsed into strict schemas, checksummed, staged, and quarantined on failure before promotion. The last known good release remains available when a refresh fails.

Workbook import is values-only. Inputs are limited to 5 MB compressed and 25 MB uncompressed, 20 worksheets, 2,000 data rows, and 100 columns at the workbook boundary (the tracker accepts 80 mapped columns). Encrypted archives, ZIP64, unsafe paths, excessive compression, formulas, macros, and external links are rejected. PDF and tabular official-source parsers also enforce bounded pages, rows, columns, entries, and decompressed size.

`npm run verify:client-secrets` scans production client artifacts for canaries and configured credentials. `npm run verify:research-sources` rejects commercial scraping targets, insecure or incomplete official attribution, raw source bodies in client builds, and secret-like material. `npm audit --audit-level=high` must pass before a beta release; any remaining moderate transitive advisory is documented during release review and guarded at the relevant input boundary.

## Data and limitations

Company discovery constructs GET URLs only on fixed Greenhouse/Lever API origins from validated board tokens; arbitrary URLs, redirects, oversized responses and malformed records are rejected. Board lists are cached for five minutes with bounded concurrency/cache size. FX reads only the ECB provider through Frankfurter, with pair/date validation and a seven-day maximum data age. Neither integration receives candidate profiles or mail. Employer links are external and should be checked before applying. Shortlists are browser-local and are not included in standard application exports.

The distributed Google desktop client ID is public configuration, not a confidential secret. Real Google registration, restricted-scope review and acceptance checks remain release gates. Web-client secrets and tokens must never be packaged with the app. Windows DPAPI storage remains required for persistent Gmail/profile access.

Job Buddy is local-first, not a hardened multi-user vault. Anyone with access to the same Windows account or browser profile may be able to access local data. Standard CSV/XLSX exports intentionally omit lifecycle evidence and are not full backups. Never commit `.env.local`, local companion data, real exports, or personal fixtures.

See [PRIVACY.md](PRIVACY.md) for the complete local data-flow and deletion map. Deleting Job Buddy data cannot erase values already filled into or submitted to a third-party job site.
