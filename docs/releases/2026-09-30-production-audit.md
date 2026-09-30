# Production-server audit — 30 September 2026

Base revision: `eb92a994f5ad23eae04a82c75b832a08974a07ef`, version `1.0.0-beta.18`. This follow-up changes runtime behavior; the earlier repository-preparation report remains historical evidence.

## Fixed and reproduced

- **PDF import on the actual companion:** static `.mjs` files were served as `application/octet-stream` with `nosniff`. The PDF parser's module worker could not load. Replaced the companion browser test's pasted-text import with a synthetic PDF using the existing PDF fixture builder. Before the fix, import displayed “Could not read this PDF” and no review appeared. Adding the JavaScript MIME mapping made import, review, encrypted save and reload pass on both `127.0.0.1` and `localhost`. All six companion/resume browser tests passed (33.8 seconds).
- **Gmail status privacy:** the status route returned the connected account address without checking the dashboard origin. Extended the existing HTTP boundary test to cover status: missing origin/metadata, cross-site metadata, rebinding host, foreign origin and navigation. Before the fix it returned 200 where 403 was required. The route now uses the same allowlisted-origin check as other private dashboard reads; valid same-origin browser fetches remain supported.

These changes reuse existing code and add no runtime dependencies. They do not read or change the user's real inbox, profile or tracker. Browser tests use isolated temporary storage and synthetic credentials; their Gmail/research scenarios are not real-provider acceptance.

## Verification

- `npm.cmd run check`: exit 0. All 881 tests in 118 files passed (306.99 seconds); publication-tree validation, TypeScript, production app/extension builds and client-secret/research-source guards passed; 30 dashboard browser tests passed (1.8 minutes) and 5 extension tests passed (29.1 seconds), including installed Edge pairing (22.7 seconds).
- `npm.cmd run check:web`: exit 0. The companion-free profile/resume/transfer browser check passed (46.5 seconds including build/startup), followed by both client artifact guards. This does not establish native Mac support.
- `npm.cmd audit --omit=dev --audit-level=high`: exit 0; two moderate findings remain through ExcelJS/uuid. No forced downgrade or suppression was applied.
- Redacted Gitleaks scans of the changed HTTP and browser-test directories and tracked diff found no leaks. An initial multi-directory invocation scanned the broader working directory and flagged an ignored local extension-signing key and two examples in ignored audit-tool documentation. All three are untracked and excluded by `.gitignore`; no key contents were printed or published. This is not a claim that arbitrary local files are safe to publish.
- Existing GitHub Windows CI runs for the base revision both passed: [push check](https://github.com/yeebs1000/job-buddy/actions/runs/36668346335/job/109737781092) and [PR check](https://github.com/yeebs1000/job-buddy/actions/runs/36668475049/job/109738171321). Those runs predate these fixes.

## Private source-beta preview rerun

Before pushing the private preview, `npm.cmd run check` initially finished with 879/881 unit tests passing and two five-second UI timeouts: spreadsheet import confirmation and browser-local profile save/reload. Those two files passed unchanged in isolation (9/9). After the owner closed unused applications, the unchanged full check passed: 881/881 unit tests (412.29 seconds), all build/type/public-tree/artifact guards, 30 dashboard browser tests (2.0 minutes) and 5 extension tests (33.4 seconds). `npm.cmd run check:web` also passed (40.7 seconds) with both artifact guards.

No timeout or assertion was relaxed. Low available memory was observed, but the rerun does not prove the cause or eliminate timing flakiness. The production dependency audit still reports two moderate ExcelJS/uuid findings and no high/critical findings. Redacted staged-diff scanning found no secrets. The GitHub checks for the new push must be assessed separately; the earlier linked runs are not evidence for it.

## CI follow-up before private publication

Both first GitHub runs for `5fb83a8` failed one test (880/881): the PR run missed the development launcher's exit event, while the branch run timed out in the Windows DPAPI desktop-client round trip. The launcher test registered its exit listener only after asynchronous PID discovery. Forcing exit-code observation before registering that listener reproduced the false failure locally even though the process had exited with the expected code, 23. The test now polls that durable exit code with the same five-second limit and still checks that all descendants stopped. No application runtime code changed. Both affected files then passed locally (4/4); the encryption test was left unchanged, and its CI timeout is not claimed resolved by that local pass.

## Still not a public V1 download

The [launch checklist](v1-launch-checklist.md) remains open. Native macOS secure storage, packaged launch/shutdown, clean install/upgrade acceptance, real connector acceptance and distribution trust are not implemented or verified by these tests. No stable release, repository visibility change or installer was produced.

The distributed Google client ID is still blank. The owner's OAuth publication/verification status and platform signing readiness have been requested, not confirmed. Local-only processing does not by itself establish compliance with [Google's production policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance). Mac distribution needs an explicit trust/testing path; see [Apple Developer ID](https://developer.apple.com/developer-id/).

Recommended packaging direction, pending owner decision: bundle the runtime and open the dashboard in the user's existing browser, retain Windows DPAPI, and use native Keychain-backed protection on macOS. Do not bundle another browser engine just to render the existing dashboard. This is a proposed design, not shipped functionality.
