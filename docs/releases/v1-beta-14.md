# V1 private beta 14 — Real browser extension pairing

## Root causes and fixes

- The companion client stored native `fetch` as a class property, then invoked it with the client as its receiver. In an actual Chromium extension worker this throws `Illegal invocation` before any request reaches the companion. Native fetch is now bound to the worker global.
- Once paired, privileged extension GET requests omitted the Origin header and were rejected by the companion. Extension preference reads now use an authenticated POST endpoint. Extension-origin validation, bearer-token authentication and dashboard-only route restrictions remain intact; absent/untrusted origins are not accepted.
- Pairing errors now distinguish connectivity, rejected origins and invalid/expired/replaced codes. The code-entry form stays available after failure. Arbitrary backend error text and tokens are never displayed.

## Apply this update

Restart the local app using `npm.cmd run dev`. Rebuild with `npm.cmd run build:extension`, reload Job Buddy on the browser extensions page, and refresh the job application tab. Generate one fresh code in Settings and enter it in Buddy within five minutes. A code from before a companion restart will not work.

## Regression coverage

`e2e-extension/real-pairing.spec.ts` loads the built extension into an isolated Edge profile on Windows (Chromium elsewhere) and connects it to the real HTTP companion with an isolated store and synthetic candidate profile. Only the loopback port and fixture-site activation configuration are substituted. Chrome messaging, worker fetch, token storage, pairing, authentication and native form filling are real. Coverage includes invalid-code recovery and authenticated reconnection after page reload. No live browser profile, user pairing, personal data or mailbox is accessed.

Windows test setup requires Microsoft Edge; CI installs it through Playwright. Other platforms use Playwright Chromium with extension support.

## Verification results

The 666 unit/integration tests passed on rerun, followed by TypeScript checks, both builds, secret/source-policy checks and 21 dashboard browser tests. One pre-existing inbox focus assertion failed on the initial run and passed independently and in the rerun. The installed-extension reload assertion exceeded its initial five-second wait on one run; it now waits up to fifteen seconds for the authenticated scan (no fixed sleep), and the complete installed-extension scenario passed three consecutive runs. Existing bundle-size warnings remain. Independent scoped review found no blocking endpoint/authentication issues. No user data, live pairing, commit or public release was changed.
