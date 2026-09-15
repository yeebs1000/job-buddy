# Job Buddy v0.2

> A local-first workspace for replacing the job-application spreadsheet.

[![Built with React](https://img.shields.io/badge/Built_with-React_19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Storage](https://img.shields.io/badge/Storage-Local--first-2ea44f)](#privacy-and-security)
[![Markets](https://img.shields.io/badge/Markets-Singapore_%2B_Hong_Kong-f59e0b)](#project-status)
[![Preview](https://img.shields.io/badge/Status-Private_preview-6f42c1)](https://github.com/yeebs1000/job-buddy)

[中文文档](README.zh-CN.md)

Job Buddy v0.2 combines a local-first application tracker with **simulated Update Intelligence**. It helps anyone looking for work keep applications, stage changes, deadlines, interviews, follow-ups, and notes in one place. The release is designed for Singapore and Hong Kong, with a focus on finance, software engineering, data, cybersecurity, cloud, and general IT roles.

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

The local-first tracker and v0.2 Update Intelligence simulation are usable today. The simulation uses synthetic fixture messages, stores only the minimal evidence needed to review a proposal (sender, subject, excerpt, received time, approved HTTPS links, confidence, and reasons), and never requests Gmail credentials. It scans only while this page is active and only after you explicitly choose **Scan now (simulated)**; it has no live Gmail access or background scanning.

Approval is the default: every simulated message becomes a reviewable proposal. **Unrestricted simulation** may apply only confident, conflict-free forward updates while the page remains open; offers, terminal outcomes, unmatched/ambiguous mail, and conflicts still require explicit approval.

The repository is intentionally private while the product and data model are being shaped. The core branch is structured so it can be opened to contributors later without rewriting the local data boundary.

## What is shipped

- Command Center with a visual six-stage application journey and an explicit rejected state.
- Active stages progress from light to vivid green; rejected applications use a constant red rail while retaining the stage reached.
- Spreadsheet-style Applications workspace with search, filters, sorting, saved views, column visibility, inline edits, bulk actions, archive handling, and manual creation.
- Application detail pages with deadlines, contacts, notes, research snapshots, chronological stage history, terminal-outcome confirmation, and preserved-event undo.
- Reviewed CSV/XLSX import with column mapping, normalization, row-level validation, duplicate review, include/exclude controls, and no writes before confirmation.
- UTF-8 CSV and XLSX export for the current filtered set or the full tracker.
- Fictional Singapore/Hong Kong demo records for finance, software, data, and general IT roles, covering lifecycle states. The app also supports cybersecurity and cloud roles when you add or import them.
- Simulated Update Intelligence with synthetic recruiter messages, evidence-backed match/classification confidence, reviewable interview/deadline extraction, and deterministic local fixture scans.

## Information sources and provenance

Job Buddy distinguishes information you enter from information a connector may generate later. In the current release, the `Source` field is user-entered or imported; the app does not log in to any platform or scrape the web.

| Source or platform | Current release | Planned use | Boundary |
| --- | --- | --- | --- |
| LinkedIn, company career sites, campus portals, referrals, job boards | Stored as a source label when you add/import an application | Keep the original application source and link | Not connected or scraped by V1 |
| Gmail / Gmail API | Not connected; v0.2 uses synthetic messages only | Read-only OAuth connection and user-initiated scans while the app is active for recruiter/HR replies, proposed stage changes, interview dates, meeting links, deadlines, and follow-up tasks | No Gmail credentials, live mail, daily active scans, or background scanning are shipped; messages should remain local unless explicitly exported |
| Greenhouse, Workday, Oracle Recruiting, Lever and similar ATSs | Not connected | User-approved autofill and application-link capture where the platform and browser context allow it | No unattended submission or bypass of platform controls is promised |
| Glassdoor, Levels.fyi, official salary postings, and regional salary datasets | Not connected | Region-specific salary ranges and company-review context for Singapore/Hong Kong | Availability, licensing, freshness, and regional coverage must be verified per source |
| JobSpy and public job listings | Not connected | Optional job-discovery adapters and deduplication inputs | Discovery data is not application-status truth |
| User-selected AI provider | Not connected | Interview question generation, email classification proposals, and preparation plans | Future versions may support user-supplied API keys and selectable models; V1 stores no AI credentials |

Future generated facts are intended to carry their source, region, retrieval time, confidence, and user override. A connector may propose a change; the user remains the authority for the final application stage.

## Roadmap

Roadmap items are planned, not promises of current functionality.

### V0.2 — Local tracker and simulated Update Intelligence (current)

Local persistence, visual stage tracking, filters and saved views, manual updates with history/undo, reviewed spreadsheet migration, Singapore/Hong Kong coverage, and a simulated evidence-backed update inbox with approval and unrestricted-simulation modes.

### Next work — real Gmail OAuth and active-session scans

Read-only Gmail OAuth, user-initiated scans while the app is active, and hardening the simulated matching/evidence workflow against real user-approved data. Real Gmail OAuth and daily active scans are not shipped in v0.2.

### V2.0 — Application assistant

Profile and document vault, configurable approval versus unrestricted automation modes, user-confirmed autofill assistance for Greenhouse/Workday/Oracle and other supported ATS flows, application checklists, and broader finance, engineering, and IT role coverage.

### V3.0 — Portable and collaborative

More regions, optional encrypted sync, backup/restore across devices, provider adapters, accessibility hardening, and carefully scoped multi-user or mentor workflows.

## Privacy and security

V0.2 is single-user and local-only. Applications, imported records, events, saved views, and minimal simulated-message evidence live in the browser's IndexedDB. There is no hosted database, Gmail connection, live or background email scan, AI credential, salary/review scraper, browser autofill, unattended submission, or remote job scraper in this release.

This is a privacy boundary, not a guarantee against someone who can access the same browser profile or device. Export a snapshot before clearing site data or changing devices, but do not treat the standard CSV/XLSX export as a restorable backup: it intentionally omits lifecycle history, event notes, evidence, internal IDs, and saved views. Never commit real trackers, exports, email bodies, API keys, cookies, or personal data.

CSV and XLSX files are parsed locally. XLSX import is deliberately values-only: formulas, macros, oversized sheets, and workbook formatting are rejected or not preserved. The inherited `xlsx` advisory remains a release risk; the parser accepts explicit local files only, limits input size, and loads the spreadsheet library on demand.

## Quick start

Prerequisites: Node.js 22.22.2+ on Node 22, 24.15.0+ on Node 24, or Node 26+ and npm. Playwright's browser journey also needs Chromium.

```bash
git clone https://github.com/yeebs1000/job-buddy.git
cd job-buddy
npm install
npm run dev
```

Vite prints the local URL, normally [http://localhost:5173](http://localhost:5173).

To run the finite quality gates:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

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
src/features/                Command Center, Applications, detail, import/export
src/components/              shared shell, controls, stage rail
e2e/                          core browser journey and fictional fixture
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

## Acknowledgements

A shoutout to [JobSpy](https://github.com/speedyapply/JobSpy). We adopted several practical ideas from its approach to job-source discovery and field normalization while shaping Job Buddy. Job Buddy's code structure, data model, and local-first implementation are independently built; JobSpy is not a runtime dependency.

## GitHub checklist

- [x] Local-first storage with no account required
- [x] Singapore and Hong Kong launch coverage
- [x] CSV/XLSX migration path with review before write
- [x] Focused unit/component tests and a browser journey
- [x] v0.2 simulated Update Intelligence with local synthetic messages
- [ ] Real Gmail OAuth and daily active scans
- [ ] Salary/review research connectors
- [ ] User-approved autofill assistant
- [ ] Optional encrypted sync

## License

No license file is included yet. Until a license is added, do not assume permission to reuse or redistribute this code beyond the rights that apply to your copy.
