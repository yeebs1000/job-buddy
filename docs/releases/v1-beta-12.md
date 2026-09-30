# V1 private beta 12 — Forwarded mail, outreach and rechecks

- Recognize more candidate-specific rejection wording, including “you were not selected to move to the next stage,” without treating third-party rejection news as an application result.
- Parse common English Gmail/Outlook forward headers before applying the existing 600-character excerpt limit. Plain text, HTML and wrapped recipient headers are covered. Original sender and subject are retained as **unverified forwarded text**; the actual Gmail sender and received timestamp are not replaced. The original subject can support classification, but forwarding always requires review. Normal auto-forwarded bodies need no special wrapper.
- Show personal recruiter approaches as **Recruiter outreach** in Updates. They have no application stage, outcome or deadline, and cannot apply stage changes. Dismiss or defer them without marking a job rejected. This does not add an application, support a new salary market or establish that the sender is authentic.
- In **Overview → Live Gmail** or **Settings → Gmail**, expand **Missing an older email?** and choose **Recheck recent emails**. This explicitly re-fetches up to 500 matching inbox messages from the last 90 days, excluding Promotions and Social, and reconsiders previously skipped messages. Newly recovered proposals always require review, even in automatic mode.
- Existing proposals (including pending, deferred, approved and dismissed items) remain unchanged. Rechecks do not clear the tracker, erase review decisions or create duplicate proposals. Batch checkpoints retain recheck intent across interruption/reload. The earlier incremental history cursor is preserved so the bounded recheck does not skip arrivals outside its result set.

## Limits and use

Restart the local companion if it is not running in watch mode, then refresh the web app and use **Recheck recent emails** once. Ordinary incremental scans do not reconsider older ignored messages. A recheck can take several minutes; resume an interrupted scan before starting another recheck.

The connector only reads the connected Gmail account: a NUS/Outlook message must have arrived there by manual or automatic forwarding. These remain conservative English rules, not a universal parser or measured accuracy guarantee. Attached `.eml` forwards, unusual/localized forwarding layouts, nested histories and decisive wording beyond the retained excerpt may still need manual tracking. Messages outside the scan cap, date window or eligible labels are not covered. No live mailbox was accessed for this implementation.

## Verification

- Full `npm.cmd run check` passed: 646 unit/integration tests, TypeScript checks, web and extension builds, client-secret/source-policy checks, 21 dashboard browser tests and 2 extension browser tests.
- Red-first anonymized regressions cover both reported email patterns, plain/HTML forwarding and folded headers, original-subject evidence, newsletter exclusions, informational outreach, repeated rechecks and interrupted recheck recovery.
- Isolated browser verification recovers an ignored forwarded rejection and recruiter approach, preserves a previously approved interview, then repeats the recheck without duplicates or resurrecting dismissed outreach. The mobile outreach view was visually inspected and checked for horizontal overflow.
- Independent scoped review found two forwarding edge cases; both received failing regression tests, fixes and passing rechecks. Existing bundle-size warnings remain. No live mailbox, existing user tracker, commit, push or public release was involved.
