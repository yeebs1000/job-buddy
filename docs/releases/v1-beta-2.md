# V1 beta 2: everyday job-search workflow

Approved scope: Gmail connection UX, expanded reusable application answers, company-posted salary evidence and dated FX comparison, and public job-board discovery. Interview preparation is deferred to V2.

## Acceptance criteria

- A maintainer-configured desktop Google OAuth client supports Connect Gmail → consent → return → first sync, with reconnect, cancellation and retry states. End users of a configured distribution do not create Cloud projects. Unconfigured builds explain availability honestly. Google registration/verification remains a release prerequisite.
- The local companion retains tokens; daily checks work across app pages while the app is open. No mail is uploaded to Job Buddy servers.
- Autofill reuses explicit US/SG/HK authorization and sponsorship answers, availability, notice period, relocation and annual salary preferences. Sensitive answers are previewed and reviewed per form. CAPTCHA, credentials and legal signatures remain manual.
- Discover reads Greenhouse and Lever public APIs from user-selected company boards, supports search/location filtering and a local shortlist, and never counts a saved listing as a submitted application.
- Company research displays actual posting ranges with role, location, source and retrieval date. Missing pay data is labelled unavailable. Regional benchmarks remain distinct.
- Currency comparison supports SGD/HKD/USD with dated reference rates and original values preserved; it does not claim equal purchasing power or a predicted offer.
- Unit and browser tests cover malformed sources, network failure, duplicate shortlist/application handling, FX freshness, Gmail callback consent and sensitive autofill.

## Release review

Keep the repository private and PR open for owner review. Do not merge or publish a release automatically. Document tested integrations and remaining external setup in the release handoff.

## Local verification (2026-09-16)

- 81 Vitest files / 494 tests passed.
- Typecheck, production web/extension builds, client-secret scan and research-source policy scan passed.
- 10 dashboard browser journeys and 2 built-extension journeys passed; Gmail uses a controlled fake provider, not a live account.
- Desktop and 390px mobile discovery screenshots were inspected. Company-research inspection identified and fixed stretched checkboxes, now covered by a browser assertion.
- High-severity production dependency audit passed. Three moderate advisories remain (fflate and uuid through ExcelJS); this update adds no dependency. Existing ZIP64 rejection and values-only import boundaries remain in force.
- Build reports a large-chunk warning; this is not a claim of performance certification.

## Boundaries to review

- Google registration, public desktop client ID, verification and a real-account OAuth run are still outstanding. Simulated browser coverage does not substitute for Google approval.
- Read-only live checks reached Greenhouse and Frankfurter/ECB. Lever's adapter is contract-tested; live requests to two active-board candidates timed out in this environment, so real Lever availability is not certified.
- Discovery covers a user-selected company board, not cross-board global search. Lists are capped at 1,000 and shortlists at 500. No Glassdoor reviews or scraped commercial salary data are claimed.
- Native text/select controls can reuse matched profile answers. Radio groups, custom dropdown widgets, uploads, CAPTCHA and legal/demographic fields still require manual entry; no application is submitted automatically.
- Salary comparison is display-only. Converted figures do not enter the regional estimate engine; unknown periods stay unknown. Company-board ownership must be confirmed by the user.
- Interview preparation and AI integration remain deferred to V2. Chinese documentation is marked as an older translation, with the English README authoritative for this beta.
