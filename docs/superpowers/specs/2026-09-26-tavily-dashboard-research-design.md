# Tavily research and dashboard-first information

Date: 2026-09-26
Status: Draft for written-spec review; implementation not started.

## Intent and agreed direction

Job Buddy is a lightweight, informative replacement for an application spreadsheet. Gmail scanning remains central. Salary, company rating, deadlines and application progress belong on the landing page, not behind a separate research route. The user selected Tavily instead of local SearXNG and explicitly requested an API-key box in Settings.

The first implementation slice is Tavily search plus secure key configuration. Dashboard integration and Excel/backup simplification follow in the same release effort; completing the provider slice alone does not complete the dashboard request. Work inline in the existing checkout, preserving unrelated uncommitted changes.

## Settings and credential boundary

- Add a compact Research search section in companion-mode Settings: password-type API-key input, Save key, Remove key, configured/not-configured status, and local usage count. Never prefill a saved key or return its suffix. Clear the input after successful save and when unmounted.
- Saving validates input and stores the key; it does not silently spend a search credit or claim the key is verified. The first explicit search verifies usability. Display actionable invalid-key, quota, offline and storage errors without provider response bodies.
- Persist the key separately from Gmail secrets using the existing Windows current-user DPAPI mechanism and atomic writes. Do not weaken Gmail storage or mix credentials. Fail closed if secure storage is unavailable; never silently fall back to plaintext.
- Status endpoints expose only configuration and usage metadata. Key save/remove endpoints require the companion's existing loopback, Host and Origin protections and bounded JSON requests. Responses use no-store. Keys must not enter browser persistence, URLs, logs, fixtures, exports or encrypted workspace backups.
- This box configures the current local companion. The static web-only preview has no secure key backend and must not accept a key. A public hosted app requires authenticated administrator configuration; do not expose this local configuration API publicly. Hosted deployment is outside this change.

## Tavily adapter

Replace the runtime SearXNG dependency with a Tavily adapter behind the existing web-salary API contract. Preserve saved research and existing evidence validation/blending. Do not install an SDK: use server-side fetch to the fixed HTTPS search endpoint, with a Bearer key, redirects refused, bounded results/body and a timeout.

Use basic search, explicitly disable automatic parameter selection, generated answers, raw-page content and images. Send only validated company, role and location plus a fixed research purpose. Never send emails, profiles, resumes or arbitrary user documents. Treat returned content as untrusted data and retain public HTTPS source URLs, excerpts and retrieval timestamps.

Use normalized company/role/location/purpose cache keys, a bounded 24-hour server cache and existing hourly throttling. Key replacement/removal invalidates in-flight generations and cached provider results; an old response cannot repopulate the cache. Retain already saved application research.

## Free-tier safeguards

Persist a conservative UTC-calendar-month dispatch counter, reserving a credit atomically before each outbound basic request. Cap this installation at 1,000 dispatched requests/month; count failures conservatively and do not automatically retry billable calls. Restarts and key changes do not reset the allowance. A corrupt/unwritable counter fails closed. Cached results remain usable at the limit when a key is configured.

The counter measures this installation, not the Tavily account: other apps or installations can consume its allowance. Settings must explain this limitation and direct the owner to keep provider-side paid usage disabled. Do not claim Job Buddy can change Tavily billing settings. No account creation, paid plan activation or purchases are included.

## Landing-page follow-through

- Keep Gmail scan/connection and pending updates prominent. Preserve tracker stages, deadlines, opportunities and real entries.
- Each application row displays salary, currency/period and base-versus-total basis, evidence-quality confidence, update date, and a source-labelled company rating when supported. Existing imported salary/rating data must remain visible and labelled as imported, not verified live research.
- Refresh research runs in place. An expandable row contains evidence, source links and review controls; critical summary information is always visible. Opening an original source is optional, not required to use the dashboard.
- Reuse salary evidence validation and compatible-range blending. Never turn a search relevance score into confidence. Do not combine different currencies, pay bases, seniorities or markets without the existing explicit normalization/review rules.
- A rating requires identifiable employer, provider, score, scale and source evidence. Distinguish employee ratings from customer/product ratings. Do not blend providers or infer stars from positive language. Ambiguous evidence requires review; absent evidence shows Not found. Search is discovery, not guaranteed coverage.
- Failed refreshes preserve saved information and show stale/last-checked state. Do not present an empty response as verified research.
- Add Import Excel and Export Excel to the landing toolbar, reusing the current preview/duplicate handling. Import review opens inline or in a dialog without abandoning the landing page. This is explicit file import, not continuous spreadsheet synchronization.
- Collapse encrypted backup under Advanced settings. Preserve its functionality because Excel omits profile/email history. No data deletion or automatic migration.

## Verification and acceptance

Provider tests cover request minimization, basic-only options, timeout/body bounds, malicious URLs, invalid credentials, empty/malformed results, quota errors, cache hits, replacement races and persistent concurrent budget reservations. Credential/API tests cover encryption, no secret readback, export exclusion, origin rejection and safe errors. Settings tests cover save/remove, clearing the input, configured-not-verified wording and inaccessible backend behavior.

Landing tests cover inline research without route changes, saved/imported evidence, honest missing ratings, stale-result retention, comparable salary blending, Excel review and advanced backup. Existing Gmail scan/approval tests remain passing. Verify desktop/mobile layout and keyboard interactions. Do not use the user's mailbox or spend real search credits in automated tests. A real provider check is separate, after the owner supplies a key and explicitly runs research.

## References checked

- Tavily search contract: https://docs.tavily.com/documentation/api-reference/endpoint/search
- Tavily credits: https://docs.tavily.com/documentation/api-credits
- Current implementation: server/research/SearxngSalaryService.ts, server/start.ts, server/gmail/DesktopClientStore.ts, src/features/research/webSalaryClient.ts, src/features/command-center/SalarySummary.tsx, src/features/import-export/ImportTrackerPage.tsx.

Tavily documentation currently lists 1,000 monthly free credits and one credit per basic search. Prices/allowances are provider-controlled; UI must not promise permanently free unlimited research.
