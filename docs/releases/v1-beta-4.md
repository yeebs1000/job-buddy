# V1 beta 4: actionable local setup and pairing

## Changes

- Settings now offers **Set up Gmail**, an inline owner-setup guide with **Open Google Cloud**, and a validated Desktop client ID form. The ID is public, saved outside the repository, and activated without restarting. No client secret or Gmail permission is requested during setup. Existing configuration cannot be overwritten through this first-time setup endpoint.
- Fixed a real-browser regression: same-origin GET requests may omit Origin. The companion now accepts those reads only with matching browser fetch metadata and an exact allowed loopback Host. Cross-site requests, rebinding hosts, and writes without an explicit allowed Origin stay denied. Extension bearer/origin checks are unchanged.
- Added exact localhost aliases for the existing development and production ports. Vite no longer silently moves to an unsupported port. Changing addresses does not migrate browser storage.
- Browser Buddy shows availability honestly, disables pairing until settings load, offers Retry/Refresh connection and an Installation guide, and removes stale codes before new attempts.
- Mobile Gmail choices no longer inherit a desktop-sized vertical flex basis; setup and pairing buttons remain readable at 390px.

## Verification

- `npm run check` passed: 84 Vitest files / 517 tests, TypeScript, production web and extension builds, client-secret and research-source artifact scans, 14 dashboard browser journeys and 2 extension journeys.
- Real-companion browser tests use isolated temporary storage and a test-only public client ID, never the owner's credentials. They exercise the actual HTTP routing, local setup persistence, pairing service and browser headers on both localhost and 127.0.0.1. No Gmail request is made by saving setup.
- Also verified pairing-code generation through the running development proxy on both addresses. Desktop/mobile screenshots were inspected; mobile option height and horizontal overflow are covered by regression assertions.
- Production dependency audit at the high threshold exits 0. Three existing moderate advisories (fflate and uuid/ExcelJS) and the existing large-bundle warning remain. No dependencies added.

## Still required

The owner must register a real Google Desktop client, complete Google's applicable verification, and perform a real-account consent/scan check. Browser extension installation requires user action in Chrome or Edge. This update does not install an extension, grant Gmail access, publish the repository, or merge the release PR.
