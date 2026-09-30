# V1 beta 3: local-first Gmail popup

The web dashboard remains open throughout connection: Connect Gmail → Google popup → local callback → initial scan. No hosted Job Buddy backend or end-user API key was added.

## Scope and safety

- Open the popup directly from the user click, before network requests. Blocked popups provide retry guidance without changing saved preferences.
- Poll a random, origin-bound receipt for the exact attempt. Tokens never reach the dashboard. Receipts live only in companion memory, expire after ten minutes and are capped at 32.
- Keep Google's window isolated from the dashboard. The callback removes query values from its address and closes itself, with a static return-to-dashboard message if the browser prevents closing.
- Validate OAuth state/PKCE as before; duplicate callbacks cannot race the original token exchange. Failed consent does not trigger a scan.
- Pause automatic scans while connecting and during the first sync. Reset the old account cursor before consent. Stopping the wait is not token revocation; if approval already happened, reload Settings to inspect the connection.
- Preserve the existing redirect callback for compatibility. No new dependencies or hosted storage.

## Verification

- `npm run check` passed: 83 Vitest files / 510 tests, TypeScript, web/extension builds, client-secret and research-source artifact checks, 12 dashboard browser journeys and 2 built-extension journeys.
- Browser coverage includes popup success without dashboard navigation, exactly one first scan, blocked popups, denied consent and stopping a closed popup. Unit/server coverage includes timeout, receipt expiry/origin binding, duplicate callbacks and non-Google URL rejection.
- Google consent and callback pages are simulated, not a live account. Google authorization has not been certified by these tests.
- Production audit at the high threshold exits 0. Three existing moderate advisories remain (fflate and uuid through ExcelJS); existing large-bundle warnings also remain. No dependencies changed.

## External gates remain

The maintainer must register/configure the Job Buddy Desktop OAuth client, complete applicable Google verification, and run owner-authorized real-account acceptance checks. Unconfigured builds show setup guidance honestly. Gmail/profile token persistence remains Windows-only; daily scans require the visible app and running local companion.

Keep the repository private and the release PR open for owner review. No public release or merge is authorized by this update.
