# V1 beta 6: Desktop OAuth token-exchange credentials

## Confirmed configuration blocker

A deliberately invalid-code diagnostic against Google's token endpoint with the configured local client returned `invalid_request` with a missing `client_secret` indication. It could not retrieve user tokens or access Gmail. The earlier ID-only assumption was incomplete for this client. The app did not retain the original failed callback details, so that exact historical attempt cannot be reconstructed.

## Changes

- Settings accepts a matching Desktop client secret in a masked field. The secret is encrypted using Windows current-user DPAPI and saved atomically alongside the public ID. Existing ID-only configurations still load. A replacement without a secret explicitly removes the old secret.
- Credentials remain on the local companion, outside Git, browser storage, client builds and API responses. The secret is sent to Google's token endpoint in the request body, never the consent URL. Do not put Google passwords, refresh tokens or secrets into chat.
- Missing/rejected client credentials now produce an allowlisted `client-config` popup receipt and actionable setup guidance. Raw Google error descriptions are never forwarded. Other failures are no longer presented as proof of user cancellation.
- Existing no-submit, mail read-only, local-data and connection-replacement safeguards remain.

## Owner follow-up

Refresh Settings, open **Change client ID**, enter both values from the same Google **Desktop app** OAuth client, save and reconnect. Actual Google consent and an inbox scan still need owner acceptance. No live account connection is claimed by automated tests.

## Verification

`npm run check` passed: 85 Vitest files / 534 tests, typecheck, web and extension builds, client-secret and research-source artifact checks, 14 dashboard browser tests and 2 extension tests. Real-companion tests use temporary configuration and fixture secrets only, exercise Windows DPAPI save/reload, and do not contact Google or modify the owner's saved credentials.

Reference: [Google installed-app token exchange](https://developers.google.com/identity/protocols/oauth2/native-app#exchange-authorization-code).
