# Job Buddy

Job Buddy is a local-first replacement for graduate job-application spreadsheets. It gives a single person a clear, browser-based tracker for applications across Singapore and Hong Kong without requiring an account.

## Current V1 scope

The tracker currently provides:

- An Apple-inspired Command Center with six-stage application rails and clear rejection semantics.
- A filterable, sortable applications table with saved views and inline stage, priority, and tag edits.
- Manual application creation plus a detailed application record with history and undo. Undo preserves the original event as visibly reverted; it does not erase history.
- Reviewed CSV and XLSX imports: preview, validation, field mapping, and duplicate review happen before anything is saved.
- UTF-8 CSV and XLSX exports for either the current filtered set or all applications.
- Fictional demo data for the supported Singapore/Hong Kong and finance, software engineering, data, cybersecurity, cloud, and general IT scope.

This repository has no screenshots because none have been captured as checked-in project assets.

## Privacy and local-data boundary

V1 is single-user and local-only. Applications, imports, and saved views are stored in this browser's IndexedDB database; there is no account, server-side database, hosted sync, Gmail connection, or AI credential in the application.

That is a privacy boundary, not a security guarantee. Anyone with access to the same browser profile or device may be able to access its local data. Back up data through an export before clearing browser data or moving devices. Do not commit real trackers, exports, API keys, email content, or personal data to this repository.

CSV and XLSX files are parsed locally. XLSX import intentionally accepts values-only workbooks and rejects formulas and macros; it is not a general-purpose workbook editor and does not preserve workbook formatting, formulas, macros, or sheets beyond the imported standard data.

## Run locally

Prerequisites: Node.js 22+ and npm. Playwright's E2E run also needs a supported local browser (install Chromium once with `npx playwright install chromium` if it is not already available).

```bash
npm install
npm run dev
```

Vite prints the local URL (normally [http://localhost:5173](http://localhost:5173)). To test a production build locally:

```bash
npm run build
npm run preview
```

Quality commands:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## Demo data and reset

The app seeds a deterministic, fictional demo portfolio when its local database is empty. To reset the demo and every locally stored application, clear this site's browser storage/IndexedDB in your browser's site-data controls, then reload Job Buddy. This is irreversible from the app, so export any data you need first.

## Product boundaries and roadmap

The V1 launch scope is Singapore and Hong Kong, focused on finance, software engineering, data, cybersecurity, cloud, and general IT graduate roles. It does not yet include Gmail intelligence, salary or company-review research integrations, interview-preparation integrations, Buddy autofill or automated actions, other regional/role coverage, accounts, hosted sync, or multi-user collaboration.

Those are roadmap topics, not current features. In particular, neither Gmail, AI, nor an autonomous Buddy is connected in this repository.

## Design and contributing

The approved product direction is in [the design specification](docs/superpowers/specs/2026-09-12-job-buddy-design.md), with the implementation sequence in [the core-tracker plan](docs/superpowers/plans/2026-09-12-job-buddy-core-tracker.md).

Contributions should keep the app local-first, include focused tests for behavior changes, preserve the reviewed import boundary, and never add real user data or secrets. Please run the quality commands above before opening a change.

## License

No license file is currently included. Do not assume permission to reuse or redistribute this code beyond the rights that apply to your copy until a license is added.
