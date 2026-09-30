# Job Buddy

A local-first job-application dashboard that replaces the spreadsheet. Turn recruiter emails into reviewed tracker updates, see your next steps, and keep salary evidence alongside each application.

[![CI](https://github.com/yeebs1000/job-buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/yeebs1000/job-buddy/actions/workflows/ci.yml)
[中文摘要](README.zh-CN.md) · [Roadmap](ROADMAP.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Release status

**Current source candidate: `1.0.0-beta.18`. Windows and macOS end-user downloads are planned, not available yet.**

[Preview the source-beta release notes](docs/releases/v1.0.0-beta.18.md). This preview does not mean the release has been published.

The target is a downloadable app with a web-style dashboard running locally. No Job Buddy account or hosted backend is planned for V1. End users should not need to install Node, Docker, or run terminal commands. Gmail and online research still need internet access.

Today the complete workflow is a developer-run Windows candidate. Persistent Gmail credentials, the profile, and the Tavily key use Windows-only secure storage. macOS needs native secure storage and acceptance testing. Finish V1 functionality first, then build and verify both downloads.

See the [launch checklist](docs/releases/v1-launch-checklist.md) and [latest production-server audit](docs/releases/2026-09-30-production-audit.md). Local test results do not establish Google approval, macOS support, or a release-ready installer.

## The main workflow

1. **Connect Gmail** with read-only consent and scan application mail, including supported forwarded messages.
2. **Review suggested changes.** Match an existing application or review prefilled details to create one. Save recruiter outreach separately as an opportunity, not a submitted application.
3. **See the Command Center:** stages, outcomes, deadlines, saved salary ranges, evidence confidence, and attributed employee ratings.
4. **Keep control.** Correct details, preserve stage history, or import/export an Excel tracker.

Gmail scan → review → dashboard is the primary experience. Manual tracking and Excel complement it. Approval is the default. Optional safe auto-updates exclude offers, terminal outcomes, ambiguous matches and conflicts. Job Buddy never sends or deletes emails, and failed live scans never fall back to demo data.

## Available in the source candidate

- Six-stage tracking, rejected/withdrawn outcomes, history, deadlines, notes and contacts.
- Spreadsheet-style filtering, sorting, saved views, inline edits, bulk actions and archiving.
- Reviewed CSV/XLSX import/export from the dashboard; no automatic demo inbox or sample applications in new workspaces.
- Gmail incremental checks, bounded retrieval, partial-scan recovery, duplicate protection and explicit rechecks.
- Inline Tavily research with reviewed, compatible salary blending and evidence confidence. Employee ratings retain their provider and scale.
- Official salary benchmarks for supported software/IT occupations in Singapore, Hong Kong and the US. Broader roles can use reviewed web evidence; coverage varies.
- User-selected Greenhouse/Lever company boards and a separate local shortlist.
- Local profile and reviewed resume import from text-based PDF, DOCX or pasted text.
- Optional Chrome/Edge Browser Buddy for guarded autofill and user-confirmed application/salary capture. No final submission.
- Passphrase-encrypted workspace transfer under Settings → Advanced. Excel exports are flattened snapshots, not full backups.

Search results are not guaranteed salary answers. Missing or incomparable evidence stays unresolved rather than becoming a fabricated range. No AI model is connected. See [research limitations](docs/local-search.md).

## Windows quick start

For developers and early testers—not the intended end-user installation flow. Use a Node version allowed by `package.json`: Node 22.22.2+ within 22, Node 24.15.0+ within 24, or Node 26+.

```powershell
git clone --branch codex/v1-private-public-repo-launch https://github.com/yeebs1000/job-buddy.git
cd job-buddy
npm.cmd ci
npm.cmd run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). This starts the dashboard and companion together; keep the terminal open.

- Keep the same browser and address. `localhost`, `127.0.0.1` and different ports have separate browser storage. Changing address can make records appear missing.
- If port 5173 or 43117 is occupied, stop only an old Job Buddy instance you recognize. The launcher does not terminate unrelated listeners.
- Never expose the single-user companion to the internet.

### Gmail

Open **Settings → Set up Gmail** for private-test Desktop OAuth configuration, then **Connect Gmail**. A maintainer-configured public connector still needs applicable Google checks and live-account acceptance. See [Gmail setup and consent recovery](docs/gmail-maintainer-setup.md).

The first scan is bounded; read its summary and continue partial scans when offered. Incremental checks handle newer mail; recent-mail rechecks can revisit classification without duplicating provider messages. Daily scans require an active app session, not a cloud worker.

### Research

Save a Tavily key in **Settings → Research search**, then choose **Refresh research** on an application. Only company, role, location and search purpose are sent—not email bodies, resumes or profiles. The key stays in Windows-encrypted companion storage. No Docker or SearXNG is required. [Setup and usage limits](docs/local-search.md).

### Browser Buddy (optional)

```powershell
npm.cmd run build:extension
```

1. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select the generated `dist-extension` folder, not the repository root or ZIP.
3. In Job Buddy Settings, choose **Pair browser extension** and enter the one-time code in Buddy.
4. Grant permission only for the desired job site; keep Approval mode on while testing.

After rebuilding, reload the extension and job-site tab. Autofill needs saved profile answers. Existing answers and sensitive supported fields require review; unsupported fields stay manual. Uploads, credentials, demographic/legal fields, CAPTCHA and final Submit are never automated. Pause or revoke Buddy in Settings to stop access.

## Data and privacy

Tracker records, reviewed email evidence and research live in this browser's IndexedDB. Windows DPAPI protects saved Gmail credentials, profile and Tavily key in the companion. No Job Buddy backend receives them; connectors call their documented external providers.

Local-first does not protect against someone using your unlocked OS/browser session. Gmail disconnect retains reviewed evidence and tracker history. Profile deletion, extension revocation and clearing browser data are separate actions. Export before clearing site data. Never put real exports, credentials, mail or resumes in GitHub issues.

[Data-flow and deletion map](PRIVACY.md) · [Security reporting](SECURITY.md)

## Development and verification

```powershell
npx.cmd playwright install chromium msedge
npm.cmd run check
npm.cmd run check:web
npm.cmd audit --omit=dev --audit-level=high
```

`check` runs unit tests, public-tree checks, TypeScript, builds, client-secret/source guards, and dashboard/extension browser tests. Tests use synthetic records and isolated storage, not your live inbox. Some native credential/browser tests are Windows-specific.

`dev:browser` / `build:web` remains a **core-only engineering preview** on port 5174. It lacks live Gmail, research and extension pairing; it is not the release entry point. Earlier hosted plans are superseded by [the downloadable-app roadmap](ROADMAP.md). Do not switch previews to troubleshoot Gmail.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | Dashboard, local database, email review, tracker and research UI |
| `server/` | Loopback Gmail, secure storage, research and extension pairing |
| `extension/` | Optional Buddy and guarded form adapters |
| `e2e/`, `e2e-extension/` | Synthetic browser acceptance checks |
| `scripts/` | Launcher, builds and release guards |
| `docs/releases/` | Dated results and release checklist |
| `docs/superpowers/` | Historical designs/plans; current direction is in ROADMAP.md |

## Contributing and roadmap

[Contributing](CONTRIBUTING.md) explains verification and privacy requirements. [ROADMAP.md](ROADMAP.md) separates V1 blockers from proposed V2 work. Use fictional data in examples; report vulnerabilities privately via [SECURITY.md](SECURITY.md).

## Acknowledgements and license

[JobSpy](https://github.com/speedyapply/JobSpy) inspired practical ideas around job-source discovery and field normalization; it is not a runtime dependency. Job Buddy is [MIT licensed](LICENSE).
