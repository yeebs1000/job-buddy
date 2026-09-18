# V1 beta 5: correct a saved Gmail client ID

- Settings now offers **Change client ID** for disconnected Gmail setup. Stop waiting for a pending sign-in first; disconnect saved account credentials before replacement. The editor closes after saving and Connect Gmail becomes available again, without restarting.
- Only local setup is editable. Environment/build configuration remains maintainer-managed. Failed saves preserve the previous configuration, and actionable errors explain managed setup, retained credentials, or an operation still finishing.
- Replacement invalidates previous OAuth states and pending popup receipts. Concurrent saves and callback completion cannot race a client replacement. No inbox access occurs when saving a client ID; tracker data is unchanged.
- Setup explains that `redirect_uri_mismatch` can indicate an incompatible client type. Use a Google **Desktop app** client for this form. Valid-looking text does not establish that the client exists or is the correct type.

## Verification scope

Verified: 85 Vitest files / 528 tests; typecheck; web and extension builds; client-secret and research-source artifact checks; 14 dashboard browser tests and 2 extension tests. Desktop and 390px mobile Settings screenshots were visually inspected. The initial browser run exposed an incorrect HTTP-status expectation in the new stale-popup test; after asserting the intended failure-page content instead, all browser tests passed.

Regression coverage includes replacement after setup/restart, managed-client protection, saved-credential protection, failed persistence, concurrent callbacks/saves, safe error messages, and the Settings edit flow. Real-companion browser checks on localhost and 127.0.0.1 replace temporary client IDs, reject stale callbacks, and verify the next authorization URL uses the new ID without contacting Google.

Actual Google consent and a live inbox scan remain owner acceptance checks. This update does not grant Gmail access or make the repository public.
