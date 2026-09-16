# One Job Buddy Gmail connector

Status: connection UX and desktop OAuth support implemented; Google project registration, public client ID, verification and real-account acceptance remain external release gates. Do not claim Google approval or a live tested connector until those gates are complete.

## Maintainer setup

1. Create the maintainer-owned Google Cloud project and enable Gmail API. Configure branding, audience and named test users while in Testing.
2. Create a **Desktop app** OAuth client. Job Buddy uses system-browser consent, PKCE and `http://127.0.0.1:43117/api/gmail/oauth/callback`. Do not package a confidential web-client secret in an open-source app.
3. For private testing, set `GOOGLE_OAUTH_CLIENT_TYPE=desktop` and `GOOGLE_OAUTH_CLIENT_ID` in ignored `.env.local`. Restart the companion.
4. For a configured distribution, set the public identifier in `server/gmail/desktopClient.ts`. This identifier is not a secret. Leave the default blank until the actual project exists; never use fake credentials. The environment override supports independent self-hosting.
5. Verify branding/domain ownership, publish accurate privacy/support pages and complete Google's applicable restricted-scope review. Request only `gmail.readonly`. Google decides the required verification/security-assessment obligations for the final architecture; do not assume desktop storage exempts the app from all review.
6. Run owner-authorized real-account checks: consent/cancellation, initial scan, repeated daily checks, restart/refresh, revoked token, different-account reconnect, disconnect and failure recovery. Use a test account; do not add mail or credentials to fixtures, screenshots or Git.

## User experience and boundaries

Configured Windows build: Connect Gmail → Google consent → return → bounded initial scan (up to 500 inbox messages from the last 90 days). A recent same-tab connect intent is required for automatic first sync. Direct callback URLs without that intent still require the scan button. Successful setup enables daily active-session checks; failures preserve retry controls.

The browser must be open, visible, and the local companion running. Eligible scans are checked on app startup, focus and approximately every minute, with at least 24 hours between successful daily scans and a 15-minute failed-scan cooldown. Browser/device sleep delays scans. This is not a background mail daemon.

Approval mode remains the default. A mail scan proposes changes; offers, rejections, conflicts and uncertain matches are reviewed. The app does not send or delete mail. Reconnection resets the scan cursor and retains prior tracker evidence.

Tokens remain in the local Windows DPAPI vault. Normalized excerpts and links are retained in browser IndexedDB for the review trail. Disconnect revokes/removes the token but does not erase that evidence. Clearing browser storage is a separate destructive action. No Job Buddy-operated backend receives Gmail data; Google necessarily processes API requests. Local-first does not protect against another person with access to the same OS/browser session.

## Sources

- [Google installed-app OAuth and PKCE](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes)

Existing self-hosted web clients remain supported with `GOOGLE_OAUTH_CLIENT_TYPE=web`, ID/secret and the exact authorized redirect above. Their secrets must stay on the owner-controlled companion, never in a distributed build or repository.
