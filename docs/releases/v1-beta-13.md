# V1 private beta 13 — Usable Buddy autofill

## Changes

- Keep form filling visible when a posting includes salary evidence. Salary capture stays a separate, explicitly confirmed action.
- Add a visible rescan action, select-safe-empty-fields shortcut, existing-answer warnings, missing-profile guidance and fill-failure feedback. Failed fills are not reported as successful or silently removed from review.
- Match full name (derived locally from saved given/family names), legal first/last name, common address labels and mobile-number labels. Read select labels without accidentally including the options as the question.
- Fill native controls through native setters and input/change events, checking that the page retained the value. Skip readonly, disabled and hidden controls and disabled select options.
- Compare actual local values and control identity before writing; changing a non-empty answer after the preview invalidates approval. Values are never added to activity logs. Refresh pause settings before an approved batch. Serialize scans/fills and avoid duplicate panels on repeated extension injection.
- Preserve approval/automatic modes, metadata-only activity and the hard no-submit boundary.

## Run it

Keep the local app running and save Profile. Build with `npm.cmd run build:extension`; reload the unpacked extension in Chrome/Edge and refresh the job tab. Click the toolbar icon on an HTTPS application site, grant that site access, and pair if needed. Open Buddy, select safe empty fields or individual answers, then click **Fill approved fields**. Navigate steps yourself; rescan when needed.

## Boundaries

This is deterministic autofill for native semantic controls, not universal ATS automation. Vendor markers select Greenhouse, Workday, Oracle and Lever adapters; they do not guarantee support for every vendor deployment. Repeated education/employment forms, custom widgets, radio groups, checkboxes and cross-origin embedded forms remain manual. Files, credentials, demographics, legal consent, CAPTCHA and final submission remain manual. No AI processing or remote profile service was added.

## Verification scope

Red-first tests cover missing controls, salary/autofill coexistence, changed answers, rejected values, missing profiles, pause enforcement and duplicate injection. Browser tests execute the built content bundle against isolated form fixtures with simulated extension messaging; they do not constitute live employer-site or real-account certification.

Final `npm.cmd run check` passed: 661 unit/integration tests, TypeScript checks, both builds, secret/source-policy checks, 21 dashboard browser tests and 3 extension browser tests. Scoped independent review identified stale-approval, typing-during-lookup and historical-location issues; all received failing regression tests and fixes, followed by a clear recheck. The fixture panel screenshot was visually inspected. Existing bundle-size warnings remain. No real applications were filled or submitted, and no commit, push or public release was performed.
