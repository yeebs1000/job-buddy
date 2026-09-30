# Contributing to Job Buddy

Thank you for helping make job-application tracking calmer, safer, and easier to understand.

## Before you start

- Open an issue before large features or changes to privacy, Gmail, salary research, or Browser Buddy boundaries.
- Keep the beta local-first. Do not add hosted accounts, telemetry, scraping, or automatic final submission without an approved design.
- Follow [ROADMAP.md](ROADMAP.md): target downloadable Windows/macOS apps, keep Gmail central, and defer packaging until V1 functions pass acceptance. Current secure storage is Windows-specific; browser-core tests do not establish Mac parity.
- Use fictional data in fixtures, screenshots, bug reports, and tests. Never commit personal trackers, recruiter messages, credentials, tokens, or exports.

## Local setup

Job Buddy currently supports Node.js 22.22.2+ on Node 22, 24.15.0+ on Node 24, or Node 26+.

```powershell
npm.cmd ci
npx.cmd playwright install chromium msedge
npm.cmd run dev
```

Copy `.env.example` to `.env.local` only when testing an optional local integration. Keep `.env.local` private.

## Making a change

1. Create a focused branch from the current default branch.
2. Keep changes small and preserve the documented trust boundaries.
3. Add or update tests for changed behavior.
4. Run the release gate:

   ```powershell
   npm.cmd run check
   npm.cmd audit --omit=dev --audit-level=high
   ```

5. Explain the user-facing result, verification, and any privacy or security impact in the pull request.

For interface work, verify readable contrast, keyboard access, narrow-screen behavior, and clear separation between applications. Include screenshots when the visual result changes.

Use only synthetic, anonymized fixtures and screenshots. Before attaching diagnostics, remove names, email bodies, resumes, tracker rows, OAuth values, extension pairing codes, cookies, local paths that reveal identity, and third-party form answers. GitHub issues are public unless the repository owner says otherwise; vulnerabilities belong in the private channel described in [SECURITY.md](SECURITY.md).

## Product boundaries

- The application stage always remains user-authoritative.
- Gmail access is read-only and optional.
- Browser Buddy requires site permission, keeps sensitive fields guarded, and never clicks final Submit.
- Salary estimates must retain their market, date, source, confidence, and limitations.
- Commercial sites such as Glassdoor must not be scraped or represented as connected sources.

Security issues should follow [SECURITY.md](SECURITY.md) rather than a public issue.
