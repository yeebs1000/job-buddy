# Job Buddy v1.0.0-beta.16

Latest: [beta.16 public-beta readiness](docs/releases/v1-beta-16.md) documents verified local checks, installation, privacy boundaries, and the external gates that remain. [Beta.15 Oracle address compatibility](docs/releases/v1-beta-15.md) remains included.

> A local-first workspace for replacing the job-application spreadsheet.

[![Built with React](https://img.shields.io/badge/Built_with-React_19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Storage](https://img.shields.io/badge/Storage-Local--first-2ea44f)](#privacy-and-security)
[![Markets](https://img.shields.io/badge/Markets-Singapore_%2B_Hong_Kong_%2B_US-f59e0b)](#project-status)
[![Preview](https://img.shields.io/badge/Status-Public_beta_candidate-6f42c1)](https://github.com/yeebs1000/job-buddy)
[![CI](https://github.com/yeebs1000/job-buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/yeebs1000/job-buddy/actions/workflows/ci.yml)

[中文文档](README.zh-CN.md)

Job Buddy v1 beta combines a local-first application tracker, optional read-only Gmail Update Intelligence, source-backed salary research, and a guarded Chrome/Edge autofill companion. It helps anyone looking for work keep applications, stage changes, deadlines, interviews, follow-ups, notes, and grounded compensation evidence in one place. Salary research launches for software and IT roles in Singapore, Hong Kong, and the United States; the tracker can still hold broader roles.

> [!TIP]
> **Tiny promise:** Job Buddy may be opinionated about stage history, but it will never silently rewrite your past.

<details>
<summary>✨ The 30-second tour</summary>

1. Import an existing CSV/XLSX tracker or add an application manually.
2. Filter the table by market, industry, role family, stage, priority, tags, deadlines, and more.
3. Open a role to update its stage, see the full history, and undo a mistaken change without deleting the audit trail.
4. Export the current view or your complete tracker as a portable snapshot of standard fields.

</details>

## Project status

The local tracker, company-board discovery, salary comparisons, demo inbox, Windows Gmail companion, encrypted candidate profile, and unpacked Chrome/Edge Buddy are available for private beta review. The shared Gmail connector still needs the maintainer's Google desktop client ID and Google's required production approval; this checkout does not pretend to have a live connection. Once configured, users connect through Google consent without creating their own Cloud project. Self-host configuration remains available. Buddy asks for each job site's permission, requests only matched profile fields from the loopback companion, and never clicks final Submit.

Approval is the default: actionable messages become reviewable proposals, while marketing/no-op mail and duplicate provider IDs are ignored. **Auto-apply safe updates** may apply only confident, conflict-free forward updates; offers, terminal outcomes, unmatched/ambiguous mail, and conflicts still require explicit approval. Live failures never fall back to demo data.

The repository is structured as a reproducible local project: fixtures are fictional, setup is documented, integrations have explicit boundaries, and changes are protected by unit, browser, and client-artifact checks.

## What is shipped

- Discover roles from an employer's public Greenhouse or Lever board, filter by role/location/market, and keep a persistent local shortlist distinct from submitted applications.
- Company-posted salary ranges with source, role and location context. Compare SGD/HKD/USD using dated ECB reference rates; originals remain unchanged and missing pay periods are never assumed to be annual.
- Connect → Google consent popup → automatic first scan for configured Gmail clients. The dashboard stays open; eligible daily scans continue across active app pages. Blocked popups, cancellation, reconnect and failed-scan retry remain explicit.
- Reusable SG/HK/US sponsorship and work-authorization answers, annual salary expectations, notice period, availability and relocation, with answer previews and per-form approval. Ambiguous markets and salary periods stay unresolved.
- Command Center with a visual six-stage application journey and an explicit rejected state.
- Active stages progress from light to vivid green; rejected applications use a constant red rail while retaining the stage reached.
- Spreadsheet-style Applications workspace with search, filters, sorting, saved views, column visibility, inline edits, bulk actions, archive handling, and manual creation.
- Application detail pages with deadlines, contacts, notes, research snapshots, chronological stage history, terminal-outcome confirmation, and preserved-event undo.
- Source-backed salary estimates anchored to Singapore MOM/SingStat, Hong Kong C&SD, or U.S. BLS OEWS/CPI-U data, with role confirmation, geography fallbacks, confidence conditions, immutable snapshots, and safe source links.
- Conservative purchasing-power equivalents for official data older than one year when matching CPI index levels exist. This is not a wage forecast; displayed ranges are rounded downward and exact values remain inspectable.
- Confirmed job-posting salary capture through Browser Buddy. Detection never transmits automatically, including in Automatic autofill mode; the user reviews the range before it enters a bounded local queue.
- Reviewed CSV/XLSX import with column mapping, normalization, row-level validation, duplicate review, include/exclude controls, and no writes before confirmation.
- UTF-8 CSV and XLSX export for the current filtered set or the full tracker.
- Fictional Singapore/Hong Kong demo records for finance, software, data, and general IT roles, covering lifecycle states. The app also supports cybersecurity and cloud roles when you add or import them.
- Simulated Update Intelligence with synthetic recruiter messages, evidence-backed match/classification confidence, reviewable interview/deadline extraction, and deterministic local fixture scans.
- Optional read-only Gmail OAuth on Windows with encrypted refresh-token storage, bounded initial sync, incremental history sync, explicit Gmail/Demo provenance, reconnect handling, and retained reviewed evidence after disconnect.
- Windows-DPAPI encrypted candidate profile with contact details, links, education, experience, projects, skills, work preferences, and reusable factual answers.
- Local resume import in Profile: text-based PDF, DOCX or pasted text → editable suggestions → apply selected details → Save profile. Conflicting existing values start unchecked; files and source snippets are not saved. Correct a previous import with explicit section-replacement controls. English headings and common layouts work best; scanned PDFs need pasted text. See [beta 8 fixes](docs/releases/v1-beta-8.md).
- Paired Manifest V3 Chrome/Edge Buddy with per-site permission, Approval and Automatic modes, emergency pause, revocation, and metadata-only activity history.
- Deterministic guarded autofill for semantic forms plus Greenhouse, Workday, Oracle Recruiting, and Lever markers. Existing values require approval; salary and work authorization always require review; uploads, credentials, demographic/legal fields, CAPTCHA, and final Submit stay manual.
- User-confirmed completed-application capture into the tracker, with editable Singapore/Hong Kong metadata and canonical duplicate protection.

## Information sources and provenance

Job Buddy distinguishes information you enter from connector evidence. The application `Source` field is user-entered or imported. Public job discovery reads documented APIs; it does not log in to job boards or scrape arbitrary pages. Gmail connects only after explicit Google consent.

| Source or platform | Current release | Planned use | Boundary |
| --- | --- | --- | --- |
| LinkedIn, campus portals, referrals and other job boards | Stored as a source label when you add/import an application | Keep the original application source and link | No authenticated discovery or scraping of these platforms |
| Gmail / Gmail API | Optional read-only OAuth companion on Windows, plus a separate fictional demo inbox | Active-session scans for recruiter/HR replies, proposed stage changes, interview dates, approved HTTPS meeting links, deadlines, and follow-up tasks | Refresh token is Windows-DPAPI encrypted; normalized evidence is stored locally; no background service and no automatic live-to-demo fallback |
| Greenhouse, Workday, Oracle Recruiting, Lever and semantic web forms | Guarded local Chrome/Edge autofill with stable-marker detection and Generic fallback | Expand fixture coverage as vendors change | Exact-site permission only; no files, credentials, EEO/legal fields, CAPTCHA, or final submission |
| Singapore MOM/SingStat, Hong Kong C&SD, U.S. BLS OEWS/CPI-U, ECB-backed Frankfurter FX | Local companion downloads and validates allowlisted official releases; optional dated FX comparison is kept separate | Salary benchmarks and CPI purchasing-power equivalents for supported software/IT roles | No cross-currency evidence blending; FX is not a cost-of-living, tax, or fee comparison; U.S. falls back metro → state → national |
| Glassdoor, Levels.fyi, JobStreet, JobsDB | Not connected or scraped | Possible future links or user-entered evidence only | No commercial scraping or bundled commercial dataset in v1 beta; company-specific salary and review predictions are not claimed |
| Greenhouse and Lever public Job Board APIs | User-selected company boards, role/location filters, local shortlist and employer-posted ranges | More providers after evaluating their documented access and terms | GET-only public APIs; no login, CAPTCHA bypass or arbitrary-page scraping; saved listings are not applications |
| User-selected AI provider | Not connected | Lower-priority future interview-preparation assistance | v0.4 has no AI integration, API-key UI, or model dependency |

Future generated facts are intended to carry their source, region, retrieval time, confidence, and user override. A connector may propose a change; the user remains the authority for the final application stage.

## Roadmap

Roadmap items are planned, not promises of current functionality.

### V1 beta — Local tracker, salary research, Gmail, and Browser Buddy (current)

Everything in v0.4 plus official-data salary research for SG/HK/US software and IT roles, local evidence blending, CPI purchasing-power context, and confirmed browser salary capture.

### V0.3 — Local tracker and live Gmail Update Intelligence

Local persistence, visual stage tracking, filters and saved views, manual updates with history/undo, reviewed spreadsheet migration, Singapore/Hong Kong coverage, demo mail, and optional read-only Gmail with approval and auto-apply-safe modes.

### Next work — connector release readiness

Register and verify the maintainer-owned Google app, run a real-account acceptance check, and complete owner review before public launch. See [the beta.4 setup fixes](docs/releases/v1-beta-4.md), [beta.3 popup notes](docs/releases/v1-beta-3.md), [beta.2 features](docs/releases/v1-beta-2.md), and [Gmail maintainer setup](docs/gmail-maintainer-setup.md).

### V2.0 — Broader application assistance

Interview preparation (TBD), optional AI assistance, document assistance, richer application checklists, broader finance role workflows, and additional ATS coverage after local guardrails are proven. Interview preparation is removed from the main navigation until it is useful.

### V3.0 — Portable and collaborative

More regions, optional encrypted sync, backup/restore across devices, provider adapters, accessibility hardening, and carefully scoped multi-user or mentor workflows.

## Privacy and security

V1 beta is single-user and local-first. Applications, salary observations and snapshots, imported records, events, saved views, normalized message evidence, and scan preferences live in the browser's IndexedDB. Official release caches and confirmed Browser Buddy salary evidence remain under the local companion. The companion binds only to `127.0.0.1`; on Windows the Gmail refresh token and candidate profile are encrypted for the current Windows user with DPAPI under `%LOCALAPPDATA%\JobBuddy`. Access tokens and decrypted profile values stay in memory. The extension bearer token stays in extension-local storage, and profile responses contain only canonical paths requested for the current form. The browser bundle never receives the OAuth client secret or refresh token. There is no hosted database, background email service, AI credential, commercial salary/review scraper, unattended submission, or remote job scraper in this release.

Disconnect attempts Google token revocation and removes the local protected token and connection metadata. Existing applications, approved changes, and already-normalized evidence remain so the tracker does not lose its audit trail. Clearing browser storage is a separate destructive action.

This is a privacy boundary, not a guarantee against someone who can access the same browser profile or device. Export a snapshot before clearing site data or changing devices, but do not treat the standard CSV/XLSX export as a restorable backup: it intentionally omits lifecycle history, event notes, evidence, internal IDs, and saved views. Never commit real trackers, exports, email bodies, API keys, cookies, or personal data.

CSV and XLSX files are parsed locally. XLSX import uses an on-demand ExcelJS values-only boundary: formulas, macros, external links, encrypted packages, unsafe archive paths, ZIP64, excessive compression, oversized sheets, and workbook formatting are rejected or not preserved. The former SheetJS dependency is not part of this beta.

See [SECURITY.md](SECURITY.md) for supported beta versions, source-processing limits, the paired-extension trust boundary, and safe vulnerability reporting.

## Windows quick start

Prerequisites: Node.js 22.22.2+ on Node 22, 24.15.0+ on Node 24, or Node 26+ and npm. Playwright's browser journey also needs Chromium.

```bash
git clone https://github.com/yeebs1000/job-buddy.git
cd job-buddy
npm.cmd ci
npm.cmd run dev
```

Vite prints the local URL, normally [http://127.0.0.1:5173](http://127.0.0.1:5173). `npm.cmd run dev` starts both the web app and the loopback companion. Keep that terminal open. If port 5173 or 43117 is occupied, stop the old Job Buddy process or the other local service and retry; the launcher reports the affected port and does not replace an existing listener. A browser journey also requires Chromium: `npx.cmd playwright install chromium`.

## Salary research

Open a software or IT application, confirm the proposed official occupation, then choose **Refresh official sources** to download and validate current data for that market. Choose **Research salary** to calculate a range. Singapore and Hong Kong remain national-market estimates; U.S. lookup uses metro data when available, then state, then national data and states the fallback used.

Official percentiles remain the anchor. Three or more confirmed, reusable local observations may influence the estimate within strict caps. Evidence is never blended across currencies. Optional **Compare currency** displays a separate, dated ECB-backed conversion through Frankfurter, rejects rates older than seven days, and preserves the original amount and pay period. It is not a cost-of-living, tax or fee comparison. CPI output is labelled as a purchasing-power equivalent, not projected earnings; when CPI is missing the app keeps the nominal estimate. Display values round downward while exact inputs remain inspectable. The feature does not predict a particular company's offer.

For company-specific evidence, confirm that a Greenhouse or Lever board belongs to the employer, then filter its actual postings by role and location. Missing structured salary data stays unavailable; it is not replaced by a fabricated company estimate. Greenhouse sometimes publishes bounds without a pay period: those remain **Pay period not specified**. The company-board link is user-confirmed, not independently verified by Job Buddy.

## Discover and shortlist

Open **Discover**, paste a company's `job-boards.greenhouse.io`, `boards.greenhouse.io`, `jobs.lever.co` or `jobs.eu.lever.co` link, and choose **Find open roles**. The request goes through the local companion to that provider's public API. Search roles/locations and filter Singapore, Hong Kong, United States or other/unspecified locations. Ambiguous remote locations are not assumed to be in the US. This is company-board discovery, not a global job search engine. Up to 1,000 postings are loaded; narrow the filters to view more than the first 100 matches.

**Save job** adds a local lead, not an application. Saved listings can go stale; open the employer posting before applying. After actually applying, use Browser Buddy capture or Add application. Shortlists are not included in standard application CSV/XLSX exports and have a 500-job limit.

## Install Browser Buddy in Chrome or Edge

1. Keep `npm.cmd run dev` running, open **Profile**, and save the factual fields you want Buddy to use.
2. For development, build the unpacked extension with `npm.cmd run build:extension`. For a release candidate, run `npm.cmd run package:extension`, locate the ignored ZIP under `release-artifacts`, extract it to a new folder, and load that extracted folder. Chrome and Edge cannot load the ZIP itself.
3. In Chrome open `chrome://extensions`; in Edge open `edge://extensions`. Enable **Developer mode**, choose **Load unpacked**, and select either this repository's `dist-extension` folder or the extracted release folder from step 2.
4. On an HTTPS application page, click the Job Buddy toolbar icon and allow access to that site. Open the floating **Buddy** button. The toolbar cannot activate on the local dashboard or browser settings pages.
5. Open **Settings → Browser Buddy** in Job Buddy and choose **Pair browser extension**. Enter the one-time code in the floating Buddy on the application page.
6. In **Approval mode**, choose individual answers or **Select safe, empty fields**, then **Fill approved fields**. In **Automatic fill**, safe empty matches fill without this step. Sensitive answers and existing values still require individual approval. Buddy never clicks Next or Submit for you.
7. Move to the next application step yourself. Buddy detects added form controls; use **Scan this page again** if the page or your saved profile changed. Salary research is a separate button and does not replace autofill controls.

After updating, rebuild the extension, click **Reload** on its card in `chrome://extensions` or `edge://extensions`, then refresh the application tab. The extension currently fills native text, email, phone, URL, textarea and exact-match select controls. Full name is derived from your saved given/family names; common address labels are supported. Repeated education/employment forms, custom dropdown widgets, radio groups, checkboxes and cross-origin embedded forms remain manual rather than guessed.

Buddy supports semantic Generic forms and stable markers for Greenhouse, Workday, Oracle Recruiting, and Lever. Vendor redesigns deliberately fall back to conservative Generic matching. Buddy never selects files, enters passwords or one-time codes, fills demographic/legal/signature fields, solves CAPTCHA, or clicks final Submit. After you submit yourself and the site shows a strong confirmation, choose **Send to Job Buddy**, then review the pending record on the dashboard before adding it.

### Browser Buddy troubleshooting

- **Companion offline:** confirm `npm.cmd run dev` is still running and [http://127.0.0.1:5173](http://127.0.0.1:5173) loads, then reopen Buddy.
- **Permission denied:** click the toolbar icon again and allow only the current HTTPS job site. HTTP application pages are intentionally refused.
- **Unsupported form:** use the site's form manually. Unknown labels stay unresolved; they are never guessed into a profile field.
- **Pairing expired:** create a new code in Settings. Codes expire after five minutes and work once.
- **Reconnect after revoking:** choose **Revoke extension** in Settings, remove the site's extension permission if desired, then create and enter a fresh one-time pairing code. A revoked token is not reusable.
- **Stop all filling:** enable **Pause Buddy everywhere** or revoke the extension from Settings. Chrome/Edge site permission can also be removed in the browser.
- **Clear local Buddy data:** delete the candidate profile on the Profile page, clear metadata-only activity in Settings, process or delete pending captures, and revoke pairing. Browser IndexedDB tracker data is cleared separately.

## Optional Gmail setup

The demo inbox works without Google configuration. The planned public distribution uses one maintainer-owned Job Buddy desktop OAuth client. Registration and verification are still pending; see [maintainer setup](docs/gmail-maintainer-setup.md). For an owner-controlled private test on Windows:

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project, then [enable the Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com).
2. Configure the OAuth consent screen. For a personal prototype, keep the app in **Testing** and add the Gmail address you will connect as a test user.
3. Create an OAuth 2.0 Client ID with application type **Desktop app**. The app uses a loopback callback and PKCE.
4. Open **Settings → Set up Gmail**, paste the public Desktop client ID and its matching **Desktop client secret** if Google provides one, then select **Save client ID**. Google may require the secret even with PKCE. The secret is Windows-DPAPI encrypted; the ID and encrypted secret are saved atomically outside the repository under `%LOCALAPPDATA%\JobBuddy\gmail-desktop-client.json` and take effect without a restart. To correct either value, choose **Stop waiting** if sign-in is pending, then **Change client ID**. Disconnect a connected account first. Re-enter both matching values; a blank secret removes the previous one. Replacement invalidates old sign-in attempts without deleting your tracker. Environment/build configuration takes precedence. See [beta.6 credential recovery](docs/releases/v1-beta-6.md).
5. Choose **Connect Gmail** and complete Google's consent popup. The dashboard stays open and starts the disclosed first 90-day scan after confirmation; failures expose a retry button. Developers can still configure `.env.local` as described in the maintainer guide.

```dotenv
GOOGLE_OAUTH_CLIENT_TYPE=desktop
GOOGLE_OAUTH_CLIENT_ID=your-desktop-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:43117/api/gmail/oauth/callback
```

Job Buddy requests `https://www.googleapis.com/auth/gmail.readonly`, which Google classifies as a restricted scope. A Testing-mode app is suitable for named test users but may require periodic reconnection; broader public distribution can require Google verification and an appropriate security assessment. See Google's [OAuth web-server guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes).

### Gmail troubleshooting

- **Browser Buddy unavailable:** select **Retry connection** in Settings. Run the complete app with `npm.cmd run dev`, not only the web preview. Both `localhost` and `127.0.0.1` work on ports 5173 (development) and 43117 (built app). Browser storage remains separate for each address; use your usual address to keep your tracker data visible. The **Installation guide** explains how to load and pair the extension.

- **Popup blocked:** allow popups for Job Buddy and click Connect Gmail again. **Stop waiting** closes the popup when browser isolation permits and stops dashboard polling; it does not revoke permission already granted to Google. If you already approved, reload Settings to check the connection. Automatic scans remain paused until a successful first scan.

- **Setup needed:** use **Settings → Set up Gmail**; no restart is needed. Environment-based configuration changes still require restarting the dev command.
- **Wrong client ID / Redirect URI mismatch:** choose **Stop waiting**, then **Change client ID** and paste a **Desktop app** client ID. A Web application client is not interchangeable. For a deliberately configured self-hosted web client, its Google Cloud authorized redirect and `.env.local` value must exactly match the loopback URI above, including `127.0.0.1`, port `43117`, path, and `http` scheme.
- **Reconnect needed / revoked token:** open Settings and reconnect. Approved tracker changes and normalized evidence remain available.
- **First scan stopped at 500:** this is the intentional privacy and performance bound. The UI reports truncation; later checks use incremental Gmail history.
- **No automatic daily check:** finish the first scan, enable **Daily active-session scan**, leave Gmail selected, and reopen Job Buddy after the last successful scan is at least 24 hours old.
- **Unsupported device:** persistent live Gmail and profile storage are Windows-only because credential storage requires current-user DPAPI. Use the demo inbox and tracker elsewhere.

To run the finite quality gates:

```bash
npm test
npm run typecheck
npm run build
npm run build:extension
npm run verify:client-secrets
npm run verify:research-sources
npm run test:e2e
npm run test:e2e:extension
```

`npm run check` runs the complete sequence. The client-artifact verifier reports only rule names and file paths; it never prints matched secret values.

To inspect the production preview after building:

```bash
npm run preview
```

If Chromium is missing, install it once with `npx playwright install chromium`.

## Reset demo data

When the local database is empty, Job Buddy seeds deterministic, fictional applications. To reset the demo and all locally stored applications, export any standard fields you need as a snapshot first, then clear this site's browser storage/IndexedDB and reload the app. The reset cannot be undone from inside Job Buddy; the export does not retain lifecycle history, event notes/evidence, internal IDs, or saved views.

## Repository map

```text
src/domain/                  lifecycle, filters, import contracts
src/db/                      Dexie schema, migrations, repositories
src/features/                Command Center, Applications, profile, Buddy, detail, import/export
src/components/              shared shell, controls, stage rail
server/                      loopback OAuth, Gmail API, pairing, profile, normalization, DPAPI
extension/                   Manifest V3 worker, guarded content runtime, ATS adapters
scripts/                     paired dev launcher and client-secret verification
e2e/ and e2e-extension/      dashboard, fake-Gmail, profile, pairing, and built-Buddy journeys
docs/superpowers/specs/      approved product specification
docs/superpowers/plans/      implementation plans and review checkpoints
```

## Contributing

Keep changes focused and preserve the local-first privacy boundary. Behavior changes should include focused tests and, when user-visible, an end-to-end or accessibility check. Do not add real user data or secrets to fixtures, screenshots, issues, or pull requests.

Before opening a change, run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

The product direction is documented in the [design specification](docs/superpowers/specs/2026-09-12-job-buddy-design.md), and the core implementation sequence is in the [core tracker plan](docs/superpowers/plans/2026-09-12-job-buddy-core-tracker.md).

See [PRIVACY.md](PRIVACY.md) for the concise data-flow map and deletion limits. Release reviewers should use the [v1 launch checklist](docs/releases/v1-launch-checklist.md); a passing local gate is not Google approval, a separate Windows-machine result, or publication authorization.

## Acknowledgements

A shoutout to [JobSpy](https://github.com/speedyapply/JobSpy). We adopted several practical ideas from its approach to job-source discovery and field normalization while shaping Job Buddy. Job Buddy's code structure, data model, and local-first implementation are independently built; JobSpy is not a runtime dependency.

## GitHub checklist

- [x] Local-first storage with no account required
- [x] Singapore, Hong Kong, and U.S. launch coverage
- [x] CSV/XLSX migration path with review before write
- [x] Focused unit/component tests and a browser journey
- [x] Demo Update Intelligence with local synthetic messages
- [x] Read-only Gmail OAuth and daily active-session scans on Windows
- [x] Encrypted local candidate profile and paired Chrome/Edge Buddy
- [x] Approval/Automatic guarded autofill with a hard no-submit boundary
- [x] Reviewed completed-application capture into the tracker
- [x] Official salary research with confirmed local evidence
- [ ] Optional encrypted sync

## License

Job Buddy is available under the [MIT License](LICENSE).
