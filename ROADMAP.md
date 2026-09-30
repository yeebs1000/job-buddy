# Job Buddy roadmap

Updated 2026-09-30. Direction, not a promise of shipped features or delivery dates. Proposed work remains subject to scope, privacy review and testing.

## Product promise

Download, open, connect Gmail, review updates, and see the next action in one local dashboard. Replace the spreadsheet without creating a heavyweight system. Manual tracking and Excel support the email workflow. Critical saved information belongs on the landing page.

**Windows and macOS local downloads, one shared dashboard.** No mandatory Job Buddy account, hosted application backend, Docker or separate Node installation for end users. Online connectors need internet access. Browser Buddy stays optional. This supersedes the September 25 hosted-website direction; the browser-core implementation remains an engineering preview.

## V1 — finish the complete local workflow

Available in the current Windows source candidate:

- Gmail scan/recheck, reviewed email-to-application creation and stage changes, and separately saved recruiter opportunities.
- Stage-first Command Center, deadlines, notes, history, searchable tracker and reviewed Excel import/export.
- Inline saved salary evidence, comparable range blending, confidence and attributed company ratings; optional Tavily search.
- Local profile/resume review and optional guarded Chrome/Edge autofill. Broader form coverage belongs after V1.
- Encrypted workspace transfer, excluding credentials and original files.

Before a general-user V1 download:

- [ ] Complete real-account Gmail and research acceptance, including forwarding, missing-message recovery and honest provider-limit errors.
- [ ] Complete applicable Google distribution/consent requirements and validate the maintainer-configured connector.
- [ ] Add native macOS secure credential/profile storage without weakening Windows protection or introducing plaintext fallback.
- [ ] Verify launch, restart, storage, Gmail and extension pairing on separate Windows and Mac machines; declare supported OS versions and Mac architectures from actual results.
- [ ] Close or explicitly accept security/dependency findings and verify a usable private reporting route.
- [ ] **Packaging last:** bundle the runtime, automatic local startup and orderly shutdown; build Windows/macOS downloads without end-user developer setup.
- [ ] Verify platform distribution trust, clean install, upgrade/data preservation, uninstall behavior, published checksums and recovery guidance.

The [launch checklist](docs/releases/v1-launch-checklist.md) holds acceptance evidence. Publishing source as a labelled beta and shipping an end-user V1 download are separate decisions. Source availability must not imply installable Mac support.

## V2 — proposed priorities after V1 acceptance

| Priority | Outcome | Acceptance boundary |
| --- | --- | --- |
| 1. Better email understanding | Less manual correction of company, role, location, stage and deadlines; stronger direct/forwarded-mail matching | Measure false positives, missed updates and duplicates on synthetic/anonymized cases; retain evidence and review uncertainty |
| 2. Useful research summaries | Summarize compatible salary evidence and employee ratings on the dashboard instead of a link dump | Retain sources, dates, pay basis, geography and limitations; distinguish missing evidence from provider failure; never invent numbers |
| 3. Broader Browser Buddy coverage | More reliable custom widgets, repeated education/experience fields and ATS journeys | Representative fixtures and native-browser checks; explicit site permission, sensitive-field review and no final submission |
| 4. Optional AI assistance | Assist ambiguous email extraction and source-grounded summaries where rules are insufficient | Separate opt-in design; disclose provider, exact data sent and cost controls; no full-inbox/resume upload by default; usable without a model |
| 5. Lightweight follow-up tools | Useful reminders and small application/interview checklists in the dashboard | No mandatory external account or new notification service; do not turn the app into a general-purpose CRM |

Priorities 1–3 come first. AI is an optional approach to evaluate, not a prerequisite or a claim that a model fixes missing mail or weak sources. Existing functions remain available without it.

## Not committed

Cloud sync, team accounts, mobile apps, hosted Gmail processing, authenticated job-board scraping, automatic application submission and unattended answer generation are not V1/V2 commitments. Add them only when demonstrated need justifies the privacy and maintenance cost.
