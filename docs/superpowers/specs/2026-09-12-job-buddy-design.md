# Job Buddy: Local-First Job Application Dashboard

Date: 2026-09-12  
Status: Approved design  
Working repository name: `job-buddy`

## 1. Product summary

Job Buddy is a local-first job application tracker for fresh graduates and early-career candidates who have outgrown an Excel spreadsheet. It combines a visual application pipeline, a filterable spreadsheet-like workspace, evidence-backed email status detection, regional company and compensation research, stage-aware interview preparation, and a future browser autofill companion.

The first release is a polished, credential-free prototype that runs on one user's device. It uses realistic sample data and mock integration adapters while providing a fully functional tracker, local persistence, Excel/CSV import and export, manual updates, filters, notes, deadlines, and simulated automation. The architecture allows the mock adapters to be replaced with real Gmail, AI, salary, company-review, and browser-extension integrations without rebuilding the product.

## 2. Target user and launch scope

The primary user is a fresh graduate or early-career candidate managing many concurrent applications and currently relying on Excel, email search, browser tabs, calendar reminders, and separate interview-preparation notes.

Version 1 focuses on:

- Singapore and Hong Kong as launch markets.
- Finance, quantitative finance, banking technology, software engineering, data, cybersecurity, cloud, and general IT roles.
- One local user and one device, with no account or cloud synchronization.
- A web application that remains useful without Gmail access or an AI key.
- English-language workflows and sample content.

Version 2 may add traditional engineering disciplines, additional markets, multi-device synchronization, accounts, production browser-extension automation, and additional data providers.

## 3. Product goals

1. Replace an Excel application tracker without sacrificing search, filters, bulk editing, import, export, or ownership of the data.
2. Make each application's current stage and next action understandable at a glance.
3. Reduce manual status maintenance by converting recruiter emails into reviewable, source-backed update proposals.
4. Help the user prepare for the specific interview stage they have reached.
5. Create a safe foundation for fast application autofill across many applicant-tracking systems.
6. Be easy to run, inspect, extend, and contribute to as an open-source GitHub project.

## 4. Non-goals for version 1

- No real Gmail authorization or background processing while the dashboard is closed.
- No permanent storage of raw AI API keys.
- No automatic submission to live job sites.
- No unauthorized scraping or bypassing of job-board restrictions.
- No multi-user collaboration, account system, or cloud database.
- No attempt to infer hiring outcomes that require the user's decision, including accepting an offer, declining an offer, withdrawing, or being hired.

## 5. Design principles

### 5.1 Apple-inspired product language

The interface uses a quiet, task-focused product language inspired by Apple's platform conventions without copying proprietary assets:

- System UI typography with compact, consistent hierarchy.
- Generous but disciplined spacing and strong optical alignment.
- Continuous neutral surfaces, soft depth, and smooth rounded edges.
- Familiar navigation, controls, and focus behavior.
- Motion lasting roughly 150–250 milliseconds, used only to communicate state.
- No decorative animation, glassmorphism, oversized metric cards, or heavy gradients.
- Full support for reduced-motion preferences.

### 5.2 Status colour system

Active applications use progressively stronger green as the user advances from Applied to Offer. Colour stays on progress marks, status indicators, and summary stages rather than washing over the entire role row. Rejected applications use one consistent red state across the complete progress rail. Labels and position always accompany colour so the interface remains understandable without colour perception.

Application rows use neutral backgrounds, high-contrast secondary text, and crisp separators. Small text must meet WCAG AA contrast. The approved secondary-text target is at least 4.5:1; the prototype design uses a 6.05:1 light-theme contrast for core secondary copy.

## 6. Information architecture

### 6.1 Command Center

The home screen contains:

- A portfolio-level stage summary from Applied through Offer.
- Applications requiring attention, ordered by urgency and recency.
- Explicit per-application milestone rails.
- Upcoming deadlines, interview dates, saved meeting links, and follow-up reminders.
- Recent email-detected changes awaiting review.
- A compact floating Buddy that suggests the next useful action.

### 6.2 All Applications

This is the direct replacement for the user's Excel tracker. It provides:

- A dense, readable table with frozen identifying columns on wide screens.
- Search across role, company, recruiter, notes, and tags.
- Sorting and multi-filter composition.
- Inline editing and keyboard-friendly navigation.
- Multi-selection and bulk stage, priority, tag, and archive changes.
- Saved views such as Active Interviews, Singapore Software, Hong Kong Finance, Follow Up, and Rejected.
- Excel and CSV import with preview, field mapping, duplicate detection, and row-level validation.
- Excel and CSV export of filtered or complete data.

Standard columns are provided instead of arbitrary custom columns. Flexible tags cover personal categorization without turning the application into a spreadsheet builder.

### 6.3 Application Detail

Each application has a detail workspace containing:

- Role, company, industry, role family, region, location, and work arrangement.
- Current stage, outcome, priority, tags, and source.
- Complete timestamped stage history.
- Job description and source URL.
- Recruiter and hiring-team contacts.
- Relevant emails and evidence-backed detected signals.
- Interview dates, deadlines, meeting links, and follow-up reminders.
- Salary benchmark and regional company-rating snapshot with source and retrieval date.
- Notes, submitted documents, standard answers, and activity log.
- Stage-specific preparation actions.

### 6.4 Update Inbox

The Update Inbox presents Gmail-derived proposals before they modify an application. Each proposal shows the matched application, source email metadata, short evidence excerpt, proposed stage or deadline, extracted links, confidence, and the reason for the match. The user can approve, edit, reject, or defer a proposal.

### 6.5 Interview Studio

Interview Studio adapts its content to the current stage and role family:

- Recruiter or HR screen: motivation, availability, work authorization, salary expectations, and concise career narrative.
- Behavioural or cultural round: verified STAR examples, company values, collaboration, conflict, resilience, and communication.
- Technical round: role-specific concepts, coding or analytical exercises, system design, finance concepts, and targeted resources.
- Case study or take-home: task breakdown, assumptions, presentation structure, and review checklist.
- Final round: strategic questions, stakeholder fit, decision criteria, and offer preparation.

The AI experience supports mock questions, answer critique, follow-up questions, and a time-boxed preparation plan. Curated local templates remain available when no AI provider is configured.

### 6.6 Profile and Buddy

The profile stores reusable contact information, education, experience, skills, documents, work authorization, salary expectations, location preferences, and common application answers.

The version 1 Buddy demonstrates field matching, answer suggestions, uncertainty highlighting, and application capture inside the dashboard. A future browser extension will apply the same data model across Greenhouse, Workday, Oracle, and other applicant-tracking systems rather than hard-coding only those vendors.

## 7. Application lifecycle

The standard active stages are:

1. Applied
2. Recruiter review
3. Assessment
4. Interview
5. Final round
6. Offer

Interview may include a subtype such as recruiter, HR, behavioural, technical, case, panel, or hiring manager without changing the six-step portfolio rail.

Terminal outcomes are Rejected, Withdrawn, Expired, Offer declined, Offer accepted, and Hired. Rejected closes the active progression and renders the full rail in red while preserving the exact stage at which rejection occurred in the history.

## 8. Data model

### 8.1 Application

Core fields include identifier, role title, company, industry, role family, market, location, work arrangement, source, source URL, applied date, current stage, interview subtype, outcome, priority, tags, notes, compensation, recruiter contacts, job description, created time, and updated time.

### 8.2 Stage event

Every stage or outcome change creates an immutable event with the application identifier, prior state, new state, timestamp, origin, evidence reference, confidence, and optional user note. Origins include manual entry, import, Buddy, Gmail, and system maintenance. The displayed current state is derived from accepted events, which preserves history and supports undo.

### 8.3 Email signal

An email signal stores only the minimal evidence required for review: provider message identifier, sender, subject, timestamp, short excerpt, detected company and role, proposed change, extracted dates and links, match confidence, classification confidence, and processing state. Full inbox contents are not copied into the local database by default.

### 8.4 Deadline and interview

Deadlines and interviews record application identifier, type, date and time, timezone, link, source, completion state, and reminder settings.

### 8.5 Research snapshot

Salary and company snapshots record company or role, market, normalized value or rating, sample details where available, source, source URL, retrieval date, and freshness state. Singapore and Hong Kong values remain separate.

### 8.6 Profile, saved view, and prep session

The remaining entities store reusable profile fields, table filter definitions, import history, generated or curated preparation content, practice responses, and feedback.

## 9. Filters and standard columns

Supported filters include:

- Active or closed outcome.
- Application stage and interview subtype.
- Industry and role family.
- Singapore or Hong Kong market and specific location.
- On-site, hybrid, or remote work arrangement.
- Company and recruiter.
- Application source.
- Date applied and last activity.
- Upcoming deadline or interview date.
- Salary range and currency.
- Priority and custom tags.
- Has unread update, missing information, or follow-up due.

The table exposes standard columns for role, company, industry, role family, market, location, work arrangement, stage, outcome, applied date, last activity, next action, deadline, source, salary, company rating, priority, and tags. Less common fields remain available through column visibility controls.

## 10. Core data flows

### 10.1 Create or import

Manual entry, Excel/CSV import, or Buddy creates an application. Imports first show a non-destructive preview, map source columns to standard fields, normalize dates and currencies, and identify duplicates. Confirmed rows become applications with corresponding creation events.

### 10.2 Email-derived update

1. An active-dashboard scan obtains messages through the Gmail adapter.
2. Previously processed provider identifiers are discarded idempotently.
3. The matcher compares company, role, sender domain, recruiter, subject, and thread context.
4. The classifier extracts stage signals, dates, deadlines, links, and outcome language.
5. Ambiguous or conflicting signals remain unmatched or enter the Update Inbox.
6. Approval mode requires confirmation before any event is accepted.
7. Unrestricted mode may accept permitted high-confidence events and writes each action to the activity log.
8. The accepted event refreshes the timeline, current stage, Command Center, and preparation recommendations.

Manual corrections cannot be silently undone by a later automated signal. A contradicting signal must return to the Update Inbox.

### 10.3 Interview preparation

The user opens an application or its next action, selects Prepare, and receives a pack based on role family, job description, company research, submitted materials, current stage, and recorded prior-round feedback. Unsupported personal claims are never invented.

## 11. Automation modes

Approval mode is the default. Buddy may fill fields and the email adapter may propose changes, but the user approves consequential actions.

Unrestricted mode is an explicit, revocable toggle. It includes:

- A clear warning before activation.
- Per-site and per-action controls.
- Daily application limits.
- Visible activity history.
- Immediate emergency pause.
- Automatic fallback to approval mode for declarations, consent, uncertain answers, compensation commitments, work-authorization questions, and other high-impact fields.

Live job submissions are outside version 1. Any future production submission must still respect applicable site terms and require appropriate user confirmation at the point of impact.

## 12. Technical architecture

The first implementation is a React and TypeScript web application with a local IndexedDB database. It uses a feature-oriented source layout with a small shared domain layer and explicit adapter interfaces.

Main boundaries:

- Domain: application lifecycle, event derivation, matching rules, validation, and filter semantics.
- Persistence: IndexedDB schema, migrations, backup, restore, and import/export.
- Features: Command Center, Applications, Application Detail, Update Inbox, Interview Studio, Profile, Buddy, and Settings.
- Adapters: Gmail, AI provider, salary source, company-review source, file import/export, and future extension bridge.
- UI system: tokens, accessible components, responsive layouts, and motion rules.

The repository remains a single application until a second independently deployed surface, such as the browser extension, makes a monorepo materially useful. This avoids speculative package boundaries while keeping domain and adapter interfaces extractable.

## 13. Provider and credential settings

Settings may configure OpenAI, Anthropic, Gemini, or an OpenAI-compatible endpoint through the same AI adapter contract. The prototype accepts a key for the current browser session only and does not write the raw key to localStorage or IndexedDB. The user may run all non-AI tracker features without a key.

A future secure persistence option must use a user-held passphrase, operating-system credential storage through a desktop wrapper, or another explicit key-management design. Encoding or browser storage alone is not treated as encryption.

## 14. External research

Job Buddy supports pluggable salary and company-review sources. Every displayed estimate includes market, currency, source, and retrieval date. Stale or unavailable information is labelled rather than silently reused. Glassdoor or another provider is accessed only through a permitted integration or user-provided export; unavailable data does not block the tracker.

Job discovery may later use a normalized adapter inspired by JobSpy. Discovery results remain separate from tracked applications until the user records an application.

## 15. Failure handling

- Gmail unavailable: retain the tracker, show the last successful scan, and offer retry.
- AI unavailable or not configured: use local stage-specific templates.
- Research provider unavailable: show unavailable or stale state with source date.
- Import errors: provide row-level explanations without partially writing unconfirmed data.
- Duplicate import or email: detect idempotently and show why it was ignored.
- Ambiguous match: keep the signal in review and never guess the application.
- Conflicting stage: preserve the current state and request resolution.
- Database migration failure: retain the prior database, report recovery steps, and support backup export.
- Buddy uncertainty: highlight the field and stop for review.

## 16. Testing strategy

Automated coverage includes:

- Unit tests for stage derivation, outcomes, manual overrides, matching, confidence thresholds, deduplication, date extraction, validation, and filter semantics.
- Import tests covering column mapping, invalid rows, duplicate detection, Excel/CSV normalization, and export round trips.
- Persistence tests covering IndexedDB migrations, backup, restore, and recovery behavior.
- Component tests for filtering, sorting, saved views, inline editing, bulk actions, update approval, and stage rendering.
- Accessibility checks for keyboard navigation, visible focus, semantic labels, colour-independent state, contrast, and reduced motion.
- Responsive browser tests for desktop, tablet, and mobile layouts.
- End-to-end tests for onboarding, import, manual update, simulated Gmail proposal, approval, deadline creation, interview preparation, and Buddy capture.

Continuous integration uses deterministic fixtures and never requires a real Gmail account, personal data, or an API key.

## 17. Version 1 acceptance criteria

The first release is complete when a new user can:

1. Launch the app locally without credentials.
2. Explore realistic Singapore and Hong Kong sample applications.
3. Import an Excel or CSV tracker through a reviewed mapping flow.
4. Add and edit applications manually.
5. See the current stage clearly on the Command Center and in the table.
6. Observe progressive green active stages and constant red rejection treatment with accessible labels.
7. Search, filter, sort, tag, save a view, and perform a bulk update.
8. Open a complete application history and undo an accepted change.
9. Process a simulated Gmail update with visible source evidence and confidence.
10. See extracted deadlines and interview links in the next-action experience.
11. Use curated interview preparation and optionally enable an AI provider for the session.
12. Demonstrate Buddy field suggestions in approval and unrestricted simulation modes.
13. Export the complete or filtered tracker to Excel or CSV.
14. Use the primary workflows by keyboard and at supported responsive widths.

## 18. Open-source repository quality

The GitHub project will include:

- A concise README with screenshots, problem statement, quick start, feature overview, privacy model, and roadmap.
- A permissive license, initially MIT.
- Sample data that demonstrates every application stage and terminal outcomes.
- `.env.example` without secrets and gitignore rules for local data, credentials, imports, and exports.
- Architecture and adapter documentation for contributors.
- Contribution, security, and code-of-conduct documents before public promotion.
- Issue and pull-request templates.
- Automated checks for tests, types, formatting, and production build.
- A documented fixture workflow so contributors can develop without private accounts.

The public repository contains no user profile, email content, imported tracker, raw application documents, local database, or credential.

## 19. Roadmap boundaries

After validating the local prototype, the next sequence is:

1. Real Gmail OAuth and incremental scan adapter while the dashboard is active.
2. Permitted regional salary and company-review integrations.
3. Production AI adapters and explicit usage controls.
4. Browser extension sharing the domain model and local profile.
5. Greenhouse, Workday, Oracle, and additional platform-specific field maps.
6. Optional encrypted synchronization and account support.
7. Traditional engineering disciplines and additional regions.

## 20. Inspiration and attribution

- [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) informs the private-by-default profile, stage-specific interview preparation, source-backed Gmail proposals, explicit approval workflow, and separation of application artifacts from reusable career context.
- [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) informs a future normalized job-discovery adapter and reinforces the need to isolate provider-specific behavior and access limitations.

Job Buddy will be implemented independently and will retain attribution for any code or assets incorporated under their respective licenses.

